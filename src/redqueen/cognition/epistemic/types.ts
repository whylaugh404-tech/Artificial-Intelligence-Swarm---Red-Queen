import { z } from 'zod';
import { RepresentationVerificationStatus, RepresentationVerificationStatusSchema } from '../representation/types';

export const EPSILON = 1e-6;

export const SubjectiveOpinionSchema = z.object({
  belief: z.number().min(0).max(1),
  disbelief: z.number().min(0).max(1),
  uncertainty: z.number().min(0).max(1),
  baseRate: z.number().min(0).max(1)
}).refine(data => {
  const sum = data.belief + data.disbelief + data.uncertainty;
  // ACCEPT within EPSILON, REJECT outside EPSILON
  return Math.abs(sum - 1.0) <= EPSILON;
}, { message: "Belief + disbelief + uncertainty must equal 1.0 within EPSILON" });

export type SubjectiveOpinion = z.infer<typeof SubjectiveOpinionSchema>;

export const ContextSchema = z.object({
  contextId: z.string().min(1),
  domain: z.string().min(1),
  temporalBounds: z.object({
    start: z.number().optional(),
    end: z.number().optional()
  }).optional()
});

export type Context = z.infer<typeof ContextSchema>;

export function freezeContext(ctx: Context): Readonly<Context> {
  const frozen = { ...ctx };
  if (frozen.temporalBounds) {
    frozen.temporalBounds = Object.freeze({ ...frozen.temporalBounds });
  }
  return Object.freeze(frozen);
}

export enum EpistemicStatus {
  UNKNOWN = 'UNKNOWN',
  HYPOTHESIS = 'HYPOTHESIS',
  BELIEVED = 'BELIEVED',
  KNOWN = 'KNOWN',
  VERIFIED = 'VERIFIED',
  CONTRADICTED = 'CONTRADICTED'
}

export const EpistemicStatusSchema = z.nativeEnum(EpistemicStatus);

export const EpistemicStateSchema = z.object({
  stateId: z.string().min(1),
  opinion: SubjectiveOpinionSchema.optional(),
  status: EpistemicStatusSchema,
  verificationStatus: RepresentationVerificationStatusSchema,
  context: ContextSchema,
  rawConfidence: z.number().min(0).max(1).optional()
});

export type EpistemicState = z.infer<typeof EpistemicStateSchema>;
