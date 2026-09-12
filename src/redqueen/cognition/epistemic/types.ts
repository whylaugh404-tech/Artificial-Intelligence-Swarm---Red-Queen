import { z } from 'zod';

const EPSILON = 1e-6;

export const SubjectiveOpinionSchema = z.object({
  belief: z.number().min(0).max(1),
  disbelief: z.number().min(0).max(1),
  uncertainty: z.number().min(0).max(1),
  baseRate: z.number().min(0).max(1).default(0.5)
}).refine(data => {
  const sum = data.belief + data.disbelief + data.uncertainty;
  return Math.abs(sum - 1.0) <= EPSILON;
}, {
  message: "Belief, disbelief, and uncertainty must sum to 1.0 within epsilon (1e-6)"
});

export type SubjectiveOpinion = z.infer<typeof SubjectiveOpinionSchema>;

export enum EpistemicStatus {
  UNKNOWN = 'UNKNOWN',
  HYPOTHESIS = 'HYPOTHESIS',
  BELIEVED = 'BELIEVED',
  KNOWN_VERIFIED = 'KNOWN_VERIFIED',
  CONTRADICTED = 'CONTRADICTED'
}

export const EpistemicStatusSchema = z.nativeEnum(EpistemicStatus);

export const EpistemicStateSchema = z.object({
  subjectId: z.string().min(1),
  contextId: z.string().min(1),
  opinion: SubjectiveOpinionSchema,
  status: EpistemicStatusSchema,
  evidenceRefs: z.array(z.string()).default([]), // explicit evidence IDs
  provenanceRefs: z.array(z.string()).default([]) // roots of EDG
});

export type EpistemicState = z.infer<typeof EpistemicStateSchema>;
