import { z } from 'zod';
import { RepresentationVerificationStatusSchema } from '../representation/types';
import { ContextSchema } from '../epistemic/types';

export const UnderstandingDependencyTypeSchema = z.enum([
  'CONCEPT', 'RELATION', 'EVIDENCE', 'UNDERSTANDING', 'ABSTRACTION', 'GENERALIZATION', 'ANALOGY'
]);
export type UnderstandingDependencyType = z.infer<typeof UnderstandingDependencyTypeSchema>;

export const UnderstandingDependencySchema = z.object({
  sourceId: z.string().min(1),
  sourceType: UnderstandingDependencyTypeSchema,
  role: z.string().min(1)
});
export type UnderstandingDependency = z.infer<typeof UnderstandingDependencySchema>;

export const CognitiveUnderstandingSchema = z.object({
  understandingId: z.string().min(1).max(256),
  
  // Semantic structure
  summary: z.string().min(1).max(4096).optional(),
  
  intent: z.string().optional(),
  concepts: z.array(z.any()).default([]),
  relations: z.array(z.any()).default([]),
  constraints: z.array(z.string()).default([]),
  unknowns: z.array(z.string()).default([]),
  requiredCapabilities: z.array(z.string()).default([]),

  // Explicit relations back to the base concepts/relations/evidences
  dependencies: z.array(UnderstandingDependencySchema).min(1),
  
  // Evidences that support this understanding
  evidenceIds: z.array(z.string().min(1)).default([]),
  
  // The context under which this understanding is valid
  context: ContextSchema,
  
  // Aggregated provenance for the understanding
  provenance: z.array(z.string().min(1)).min(1),
  
  // Verification and epistemic validation
  verificationStatus: RepresentationVerificationStatusSchema,
  epistemicStateId: z.string().optional(),
  
  // Ownership / Cell mapping
  originatingCellId: z.string().min(1),
  
  // Deterministic metadata
  createdAt: z.string().datetime(),
  version: z.number().int().min(1),
  
  // Optional extensions
  metadata: z.record(z.string(), z.any()).default({})
});

export type CognitiveUnderstanding = z.infer<typeof CognitiveUnderstandingSchema>;
