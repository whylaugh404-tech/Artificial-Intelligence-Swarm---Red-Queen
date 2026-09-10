import { logger } from '../core/logger';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';

export interface AIRequest {
  systemPrompt: string;
  userPrompt: string;
  schema?: z.ZodType<any>;
  model?: string;
  temperature?: number;
}

export interface AIResponse<T = any> {
  success: boolean;
  data?: T;
  rawText?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIProvider {
  generate<T>(request: AIRequest): Promise<AIResponse<T>>;
}

export class OpenRouterAIProvider implements AIProvider {
  private readonly component = 'ai_provider';
  private readonly apiKey: string;
  private readonly baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  private geminiClient: GoogleGenAI | null = null;
  
  constructor(apiKey?: string) {
    const rawKey = (apiKey || process.env.OPENROUTER_API_KEY || '').trim();
    // Validate that the key is not a placeholder
    if (
      !rawKey ||
      rawKey === 'your_api_key_here' ||
      rawKey === 'dummy-key' ||
      rawKey.includes('placeholder')
    ) {
      this.apiKey = '';
    } else {
      this.apiKey = rawKey;
    }
  }

  private isOpenRouterValid(): boolean {
    return Boolean(
      this.apiKey &&
      this.apiKey !== 'your_api_key_here' &&
      !this.apiKey.startsWith('AIza') &&
      this.apiKey.length > 10
    );
  }

  private getGeminiClient(): GoogleGenAI | null {
    const key = process.env.GEMINI_API_KEY || (this.apiKey.startsWith('AIza') ? this.apiKey : undefined);
    if (!key) return null;
    if (!this.geminiClient) {
      this.geminiClient = new GoogleGenAI({ apiKey: key });
    }
    return this.geminiClient;
  }

  async generate<T>(request: AIRequest): Promise<AIResponse<T>> {
    const temperature = request.temperature ?? 0.7;

    // 1. Prefer Gemini API if GEMINI_API_KEY or Google key is present
    const gemini = this.getGeminiClient();
    if (gemini) {
      let requestedModel = 'gemini-3.8-flash';
      if (request.model && !request.model.includes('2.5') && !request.model.includes('2.0')) {
        requestedModel = request.model.replace('google/', '');
      }

      // Candidate models for graceful fallback if one model is under high demand (503/429)
      const candidateModels = Array.from(new Set([
        requestedModel,
        'gemini-3.1-flash-lite',
        'gemini-flash-latest'
      ]));

      let lastGeminiError: any = null;

      for (let i = 0; i < candidateModels.length; i++) {
        const modelName = candidateModels[i];
        try {
          logger.debug(this.component, 'gemini_ai_attempt', { model: modelName, attempt: i + 1 });
          
          const response = await gemini.models.generateContent({
            model: modelName,
            contents: request.userPrompt,
            config: {
              systemInstruction: request.systemPrompt,
              temperature,
            }
          });

          const content = response.text || '';
          if (!content) {
            return { success: false, error: 'EMPTY_RESPONSE' };
          }

          let parsedData: any = undefined;
          if (request.schema) {
            try {
              let jsonString = content;
              const jsonMatch = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
              if (jsonMatch) {
                jsonString = jsonMatch[1];
              }
              const rawParsed = JSON.parse(jsonString);
              parsedData = request.schema.parse(rawParsed);
            } catch (err: any) {
              logger.warn(this.component, 'schema_validation_failed', { error: err.message, content });
              return { success: false, error: 'VALIDATION_FAILED', rawText: content };
            }
          }

          return {
            success: true,
            data: parsedData as T,
            rawText: content
          };
        } catch (err: any) {
          lastGeminiError = err;
          const errMsg = err?.message || String(err);
          const isDemandSpike = errMsg.includes('503') || errMsg.includes('demand') || errMsg.includes('UNAVAILABLE');
          const isRateLimit = errMsg.includes('429') || errMsg.includes('resource_exhausted') || errMsg.includes('quota');

          logger.warn(this.component, 'gemini_attempt_failed', {
            model: modelName,
            error: errMsg,
            willRetryFallback: isDemandSpike && i < candidateModels.length - 1
          });

          // If it's a 503 demand spike, try the next candidate model after a slight pause
          if (isDemandSpike && i < candidateModels.length - 1) {
            await new Promise(r => setTimeout(r, 400));
            continue;
          }

          if (isRateLimit && i < candidateModels.length - 1) {
            await new Promise(r => setTimeout(r, 400));
            continue;
          }

          break;
        }
      }

      const finalErrMsg = lastGeminiError?.message || String(lastGeminiError || 'Unknown Gemini error');
      if (finalErrMsg.includes('503') || finalErrMsg.includes('demand') || finalErrMsg.includes('UNAVAILABLE')) {
        return {
          success: false,
          error: 'The AI model is experiencing temporary high demand. Spikes are usually brief, please retry in a few moments.'
        };
      }
      if (finalErrMsg.includes('resource_exhausted') || finalErrMsg.includes('quota') || finalErrMsg.includes('429')) {
        return {
          success: false,
          error: 'AI service rate limit reached. Please wait a moment before sending another request.'
        };
      }

      // If OpenRouter is NOT valid, return the Gemini error directly
      if (!this.isOpenRouterValid()) {
        return { success: false, error: `Gemini service notice: ${finalErrMsg}` };
      }
    }

    // 2. Use OpenRouter ONLY if valid API key is explicitly configured
    if (this.isOpenRouterValid()) {
      const model = request.model || 'google/gemini-flash-1.5';
      logger.debug(this.component, 'openrouter_request_started', { model });

      try {
        const messages = [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt }
        ];

        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://redqueen.local',
            'X-Title': 'RedQueen',
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: 4000,
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          logger.error(this.component, 'openrouter_api_error', new Error(errText), { status: response.status });
          return { success: false, error: 'OpenRouter AI service unavailable.' };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
          return { success: false, error: 'INVALID_RESPONSE' };
        }

        let parsedData: any = undefined;
        if (request.schema) {
          try {
            let jsonString = content;
            const jsonMatch = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
            if (jsonMatch) {
              jsonString = jsonMatch[1];
            }
            const rawParsed = JSON.parse(jsonString);
            parsedData = request.schema.parse(rawParsed);
          } catch (err: any) {
            logger.warn(this.component, 'schema_validation_failed', { error: err.message, content });
            return { success: false, error: 'VALIDATION_FAILED', rawText: content };
          }
        }

        return {
          success: true,
          data: parsedData as T,
          rawText: content,
          usage: data.usage
        };
      } catch (err: any) {
        logger.error(this.component, 'openrouter_network_error', err);
        return { success: false, error: 'AI service network error.' };
      }
    }

    return {
      success: false,
      error: 'No active AI key found. Please configure GEMINI_API_KEY in the environment.'
    };
  }
}
