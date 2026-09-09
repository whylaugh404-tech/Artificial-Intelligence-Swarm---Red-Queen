import { logger } from '../core/logger';
import { z } from 'zod';

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
  private readonly component = 'openrouter_ai';
  private readonly apiKey: string;
  private readonly baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate<T>(request: AIRequest): Promise<AIResponse<T>> {
    const model = request.model || 'google/gemini-2.5-flash';
    const temperature = request.temperature ?? 0.7;

    logger.debug(this.component, 'ai_request_started', { model });

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
          // We can optionally use response_format: { type: "json_object" } if supported
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error(this.component, 'api_error', new Error(errText), { status: response.status });
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
          // Extract JSON from markdown code block if present
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

      logger.info(this.component, 'ai_request_completed', { 
        model, 
        usage: data.usage 
      });

      return {
        success: true,
        data: parsedData as T,
        rawText: content,
        usage: data.usage
      };

    } catch (err: any) {
      logger.error(this.component, 'network_error', err);
      return { success: false, error: 'AI_UNAVAILABLE' };
    }
  }
}
