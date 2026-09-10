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
    this.apiKey = (apiKey || process.env.OPENROUTER_API_KEY || '').trim();
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
      try {
        let modelName = 'gemini-3.8-flash';
        if (request.model && !request.model.includes('2.5')) {
          modelName = request.model.replace('google/', '');
        }
        logger.debug(this.component, 'gemini_ai_request_started', { model: modelName });
        
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
        logger.error(this.component, 'gemini_error', err);
        // If quota exceeded or network issue, format a clean message
        const errMsg = err?.message || String(err);
        if (errMsg.includes('resource_exhausted') || errMsg.includes('quota') || errMsg.includes('429')) {
          return {
            success: false,
            error: 'Gemini API quota exceeded for current key. Please try again shortly or configure an alternate key in Settings.'
          };
        }
        // Fall back to OpenRouter if configured, otherwise return error
        if (!this.apiKey || this.apiKey === 'dummy-key' || this.apiKey.startsWith('AIza')) {
          return { success: false, error: `Gemini API error: ${errMsg}` };
        }
      }
    }

    // 2. Use OpenRouter if API key is provided and not a dummy
    if (this.apiKey && this.apiKey !== 'dummy-key' && !this.apiKey.startsWith('AIza')) {
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
          return { success: false, error: 'AI_UNAVAILABLE' };
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
        return { success: false, error: 'AI_UNAVAILABLE' };
      }
    }

    return {
      success: false,
      error: 'AI Provider not configured. Please supply GEMINI_API_KEY or OPENROUTER_API_KEY.'
    };
  }
}
