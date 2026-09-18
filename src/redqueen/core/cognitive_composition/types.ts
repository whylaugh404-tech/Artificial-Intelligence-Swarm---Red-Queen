import { z } from 'zod';
import {
  CompositionConstraint,
  CompositionConstraintSchema,
  CompositionContext,
  CompositionContextSchema,
  CompositionRelation,
  CompositionRelationSchema,
  CompositionTopology,
  CompositionTopologySchema
} from '../composition/types';
import {
  ComputePartitionSchema
} from '../compute/types';
import type { ComputePartition } from '../compute/types';
import {
  CognitiveFeatureVector,
  CognitiveFeatureVectorSchema
} from '../../cognition/types';
export type { ComputePartition };
export { ComputePartitionSchema };

/**
 * Resulting cognitive operational bounds determined non-additively by compute capability.
 */
export const OperationalBoundsSchema = z.object({
  allocatedParallelism: z.number().int().nonnegative(),
  effectiveCapacity: z.number().nonnegative(),
  memoryLimit: z.number().nonnegative(),
  latencyBudget: z.number().nonnegative()
});
export type OperationalBounds = z.infer<typeof OperationalBoundsSchema>;

/**
 * Resulting structured cognitive state from composition.
 */
export const ResultingCognitiveStateSchema = z.object({
  mode: z.string().min(1),
  contextDomain: z.string().min(1),
  integratedStructure: z.record(z.string(), z.unknown()),
  operationalBounds: OperationalBoundsSchema,
  relationGraph: z.array(z.object({
    source: z.string().min(1),
    target: z.string().min(1),
    relationType: z.string().min(1),
    semantics: z.record(z.string(), z.unknown()).optional()
  })),
  specializationAlignment: z.array(z.string()),
  linearComposition: z.object({
    inputVectors: z.record(z.string(), CognitiveFeatureVectorSchema),
    transformations: z.record(z.string(), z.unknown()),
    weights: z.record(z.string(), z.number()),
    resultVector: CognitiveFeatureVectorSchema,
    featureProvenance: z.record(z.string(), z.string()).optional()
  }).optional(),
  featureProvenance: z.record(z.string(), z.string()).optional()
});
export type ResultingCognitiveState = z.infer<typeof ResultingCognitiveStateSchema>;

/**
 * Structured result of cognitive composition.
 */
export const CognitiveCompositionResultSchema = z.object({
  compositionId: z.string().min(1),
  cellIdentity: z.string().min(1),
  transformation: z.object({
    rule: z.string().min(1),
    traceId: z.string().min(1),
    reasoningTrace: z.array(z.string())
  }),
  inputStates: z.object({
    cognitiveState: z.record(z.string(), z.unknown()),
    knowledgeState: z.record(z.string(), z.unknown()),
    experienceState: z.record(z.string(), z.unknown()),
    reasoningState: z.record(z.string(), z.unknown()),
    epistemicState: z.record(z.string(), z.unknown()).optional(),
    specialization: z.union([
      z.string(),
      z.array(z.string()),
      z.array(z.record(z.string(), z.unknown()))
    ]).optional()
  }),
  relationships: z.array(CompositionRelationSchema),
  topology: CompositionTopologySchema.optional(),
  computeResources: z.object({
    partitions: z.array(ComputePartitionSchema),
    aggregateCapability: z.object({
      capacity: z.number().nonnegative(),
      parallelism: z.number().int().nonnegative(),
      memoryLimit: z.number().nonnegative(),
      architecture: z.string()
    })
  }),
  resultingCognitiveState: ResultingCognitiveStateSchema,
  resultVector: CognitiveFeatureVectorSchema.optional(),
  featureProvenance: z.record(z.string(), z.string()).optional(),
  provenance: z.array(z.string()).min(1),
  metadata: z.record(z.string(), z.unknown()).default({})
});
export type CognitiveCompositionResult = z.infer<typeof CognitiveCompositionResultSchema>;

/**
 * Input parameters for composeCognitiveState.
 */
export interface ComposeCognitiveStateParams {
  cellIdentity: string;
  cognitiveState: Record<string, unknown>;
  knowledgeState: Record<string, unknown>;
  experienceState: Record<string, unknown>;
  reasoningState: Record<string, unknown>;
  epistemicState?: Record<string, unknown>;
  specialization?: string | string[] | Array<{ domain: string; focusAreas?: string[]; level?: number }>;
  computePartitions: ComputePartition | ComputePartition[];
  relations?: CompositionRelation[];
  topology?: CompositionTopology;
  constraints?: CompositionConstraint[];
  context: CompositionContext;
  provenance?: string[];
  deterministicTimestamp?: string;
}
