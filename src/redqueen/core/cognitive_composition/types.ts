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
  ComputePartition,
  ComputePartitionSchema
} from '../compute/types';

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
  relationGraph: z.record(z.string(), z.array(z.string())),
  specializationAlignment: z.array(z.string())
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
    reasoningState: z.record(z.string(), z.unknown())
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
  computePartitions: ComputePartition | ComputePartition[];
  relations?: CompositionRelation[];
  topology?: CompositionTopology;
  constraints?: CompositionConstraint[];
  context: CompositionContext;
  provenance?: string[];
  deterministicTimestamp?: string;
}
