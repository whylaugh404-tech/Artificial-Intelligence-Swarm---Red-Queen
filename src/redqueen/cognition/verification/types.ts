import { z } from 'zod';
import { EpistemicStatusSchema } from '../epistemic/types';

export enum ConflictType {
  DIRECT_CONTRADICTION = 'DIRECT_CONTRADICTION',
  EVIDENCE_MISMATCH = 'EVIDENCE_MISMATCH',
  SEMANTIC_INCONSISTENCY = 'SEMANTIC_INCONSISTENCY',
  TEMPORAL_CONFLICT = 'TEMPORAL_CONFLICT',
  PROVENANCE_CONFLICT = 'PROVENANCE_CONFLICT'
}
export const ConflictTypeSchema = z.nativeEnum(ConflictType);

export enum ConflictResolutionDecision {
  REJECT_CLAIM_A = 'REJECT_CLAIM_A',
  REJECT_CLAIM_B = 'REJECT_CLAIM_B',
  REJECT_BOTH = 'REJECT_BOTH',
  MERGE = 'MERGE',
  UNRESOLVED = 'UNRESOLVED'
}
export const ConflictResolutionDecisionSchema = z.nativeEnum(ConflictResolutionDecision);

export const CognitiveConflictSchema = z.object({
  conflictId: z.string().min(1),
  type: ConflictTypeSchema,
  claimAId: z.string().min(1),
  claimBId: z.string().min(1),
  claimAEvidenceIds: z.array(z.string()).default([]),
  claimBEvidenceIds: z.array(z.string()).default([]),
  claimAStatus: EpistemicStatusSchema,
  claimBStatus: EpistemicStatusSchema,
  description: z.string().min(1),
  detectedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
  resolutionDecision: ConflictResolutionDecisionSchema.default(ConflictResolutionDecision.UNRESOLVED),
  resolutionReason: z.string().optional()
});

export type CognitiveConflict = z.infer<typeof CognitiveConflictSchema>;

export interface VerificationResult {
  isVerified: boolean;
  conflicts: CognitiveConflict[];
}
