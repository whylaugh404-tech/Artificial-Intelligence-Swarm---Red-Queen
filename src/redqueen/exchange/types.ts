import { z } from 'zod';
import { 
  KnowledgeRecordSchema, 
  ExperienceSchema, 
  InformationCategorySchema,
  InformationCategory
} from '../metabolism/types';

/**
 * P5: Distributed Knowledge & Experience Exchange Protocol Types
 */

export const ExchangeType = z.enum([
  'KNOWLEDGE',
  'EXPERIENCE'
]);
export type ExchangeType = z.infer<typeof ExchangeType>;

export const ExchangeQuerySchema = z.object({
  exchangeId: z.string().uuid(),
  queryType: ExchangeType,
  topic: z.string().optional(),
  category: InformationCategorySchema.optional(),
  keywords: z.array(z.string()).optional(),
  targetKnowledgeId: z.string().optional(),
  targetExperienceId: z.string().optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  maxResults: z.number().int().min(1).max(50).default(5)
});
export type ExchangeQuery = z.infer<typeof ExchangeQuerySchema>;

export const ExchangeResponseSchema = z.object({
  exchangeId: z.string().uuid(),
  queryType: ExchangeType,
  status: z.enum(['FOUND', 'NOT_FOUND', 'REJECTED']),
  reason: z.string().optional(),
  
  // Knowledge response
  knowledge: z.array(KnowledgeRecordSchema).optional(),
  
  // Experience response
  experiences: z.array(ExperienceSchema).optional()
});
export type ExchangeResponse = z.infer<typeof ExchangeResponseSchema>;

export const ExchangeOfferSchema = z.object({
  exchangeId: z.string().uuid(),
  offerType: ExchangeType,
  
  // Knowledge offer
  knowledge: z.array(KnowledgeRecordSchema).optional(),
  
  // Experience offer
  experiences: z.array(ExperienceSchema).optional()
});
export type ExchangeOffer = z.infer<typeof ExchangeOfferSchema>;

export const ExchangeAcceptRejectSchema = z.object({
  exchangeId: z.string().uuid(),
  status: z.enum(['ACCEPTED', 'REJECTED', 'PARTIAL']),
  acceptedIds: z.array(z.string()).optional(),
  reason: z.string().optional()
});
export type ExchangeAcceptReject = z.infer<typeof ExchangeAcceptRejectSchema>;

// Exchange Event Types for Audit
export const ExchangeEventType = {
  QUERY_SENT: 'EXCHANGE_QUERY_SENT',
  QUERY_RECEIVED: 'EXCHANGE_QUERY_RECEIVED',
  RESPONSE_SENT: 'EXCHANGE_RESPONSE_SENT',
  RESPONSE_RECEIVED: 'EXCHANGE_RESPONSE_RECEIVED',
  OFFER_SENT: 'EXCHANGE_OFFER_SENT',
  OFFER_RECEIVED: 'EXCHANGE_OFFER_RECEIVED',
  ACCEPT_SENT: 'EXCHANGE_ACCEPT_SENT',
  ACCEPT_RECEIVED: 'EXCHANGE_ACCEPT_RECEIVED',
  REJECT_SENT: 'EXCHANGE_REJECT_SENT',
  REJECT_RECEIVED: 'EXCHANGE_REJECT_RECEIVED',
  VALIDATION_FAILED: 'EXCHANGE_VALIDATION_FAILED',
  UNAUTHORIZED: 'EXCHANGE_UNAUTHORIZED',
  TIMEOUT: 'EXCHANGE_TIMEOUT'
} as const;

export type ExchangeEventType = (typeof ExchangeEventType)[keyof typeof ExchangeEventType];
