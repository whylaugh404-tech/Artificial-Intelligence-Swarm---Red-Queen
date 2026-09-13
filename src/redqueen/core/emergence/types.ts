import { z } from 'zod';

export const StructuralChangeTypeSchema = z.enum(['ADDED', 'SYNTHESIZED', 'MODIFIED']);
export type StructuralChangeType = z.infer<typeof StructuralChangeTypeSchema>;

/**
 * Explicit, auditable structural difference between inputs and result.
 */
export const StructuralDifferenceSchema = z.object({
  path: z.string().min(1),
  changeType: StructuralChangeTypeSchema,
  description: z.string().min(1),
  originalValue: z.unknown().optional(),
  newValue: z.unknown()
});
export type StructuralDifference = z.infer<typeof StructuralDifferenceSchema>;

/**
 * Auditable novelty representation explaining why a structure is novel.
 */
export const NoveltyRepresentationSchema = z.object({
  sourceCompositionId: z.string().min(1),
  novelStructures: z.record(z.string(), z.unknown()),
  structuralDifferences: z.array(StructuralDifferenceSchema),
  explanatorySummary: z.string().min(1),
  isNovel: z.boolean()
});
export type NoveltyRepresentation = z.infer<typeof NoveltyRepresentationSchema>;

/**
 * Emergence dependency representation mapping input sources and relationships.
 */
export const EmergenceDependencySchema = z.object({
  inputDependencies: z.array(z.string()),
  interDependencies: z.array(
    z.object({
      source: z.string().min(1),
      target: z.string().min(1),
      type: z.string().min(1)
    })
  )
});
export type EmergenceDependency = z.infer<typeof EmergenceDependencySchema>;

export const VerificationStatusSchema = z.enum([
  'VERIFIED',
  'UNVERIFIED',
  'REJECTED_NO_EMERGENCE'
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

/**
 * Canonical EmergentState representing an emergent structure derived from composition.
 */
export const EmergentStateSchema = z.object({
  emergenceId: z.string().min(1),
  sourceCompositionIds: z.array(z.string().min(1)).min(1),
  sourceStateIds: z.array(z.string().min(1)).min(1),
  inputStructure: z.record(z.string(), z.unknown()),
  resultingStructure: z.record(z.string(), z.unknown()),
  transformation: z.object({
    transformationType: z.string().min(1),
    rule: z.string().min(1),
    traceId: z.string().min(1),
    reasoningTrace: z.array(z.string())
  }),
  novelty: NoveltyRepresentationSchema,
  dependency: EmergenceDependencySchema,
  provenance: z.array(z.string().min(1)).min(1),
  verificationStatus: VerificationStatusSchema,
  metadata: z.record(z.string(), z.unknown()).default({})
});
export type EmergentState = z.infer<typeof EmergentStateSchema>;

/**
 * Detection outcome from emergence detection.
 */
export interface EmergenceDetectionResult {
  readonly isEmergent: boolean;
  readonly reason: string;
  readonly emergentState?: EmergentState;
  readonly novelty?: NoveltyRepresentation;
}

/**
 * Input parameters for detecting emergence from composition.
 */
export interface DetectEmergenceParams {
  compositionId: string;
  sourceStateIds: string[];
  inputStructures: Record<string, Record<string, unknown>>;
  resultingStructure: Record<string, unknown>;
  transformation: {
    transformationType: string;
    rule: string;
    traceId: string;
    reasoningTrace: string[];
  };
  relationships?: Array<{
    sourceInputId: string;
    targetInputId: string;
    relationType: string;
  }>;
  provenance: string[];
  deterministicTimestamp?: string;
}
