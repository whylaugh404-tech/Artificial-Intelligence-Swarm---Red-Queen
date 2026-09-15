import { z } from 'zod';

/**
 * P8.1 — Collective Computation Subsystem
 * 
 * Uses the canonical compute models from Red Queen core (`src/redqueen/core/compute/`):
 * - `ComputePartition`: Canonical partition identity and capabilities
 * - `CommunicationProfile`: Deterministic bandwidth, latency, topology, and reliability profile
 * 
 * Strictest architectural rules:
 * - NO duplicate ComputePartition or CommunicationProfile definitions.
 * - Cell compute capacity is strictly an ESTIMATED / DERIVED capability, not real physical hardware.
 * - Non-additive composition: C* = F(C1, C2, ..., Cn) accounting for Amdahl limits,
 *   communication overhead, synchronization barriers, and verification.
 */

// Re-export canonical compute models from Red Queen Core
export {
  CommunicationProfileSchema,
  ComputePartitionSchema,
  CreateComputePartitionInputSchema
} from '../../core/compute/types';

export type {
  CommunicationProfile,
  ComputePartition,
  CreateComputePartitionInput
} from '../../core/compute/types';

// 1. Cell Computational Capability Profile (Derived & Estimated Operational Model)
export const CellComputeCapacitySchema = z.object({
  capacity: z.number().positive(), // Estimated relative operational throughput units (derived capability score, NOT physical hardware metric)
  architecture: z.enum(['NATIVE_TS', 'WASM_SANDBOX', 'COGNITIVE_REASONER', 'DISTRIBUTED_PIPELINE', 'HETEROGENEOUS', 'GENERIC']),
  parallelism: z.number().int().min(1), // Max concurrent task execution capability
  memory: z.number().positive(), // Estimated working memory units (MB/tokens)
  specialization: z.string().nullable().default(null),
  availability: z.number().min(0.0).max(1.0).default(1.0), // 0.0 to 1.0 availability
  isDerivedCapability: z.boolean().default(true) // Explicit marker: estimated/derived capability
});

export type CellComputeCapacity = z.infer<typeof CellComputeCapacitySchema>;

// 2. Computation Status
export enum ComputationStatus {
  PENDING = 'PENDING',
  DECOMPOSED = 'DECOMPOSED',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
  BLOCKED = 'BLOCKED',
  TIMEOUT = 'TIMEOUT'
}

export const ComputationStatusSchema = z.nativeEnum(ComputationStatus);

// 3. Computation Dependency Specification
export const ComputationDependencySchema = z.object({
  dependencyId: z.string().min(1),
  sourceSubtaskId: z.string().min(1), // Upstream subtask whose output is required
  targetSubtaskId: z.string().min(1), // Downstream subtask waiting for output
  requiredOutputKey: z.string().optional(), // Specific output attribute required
  isOptional: z.boolean().default(false)
});

export type ComputationDependency = z.infer<typeof ComputationDependencySchema>;

// 4. Computation Subtask
export const ComputationSubtaskSchema = z.object({
  subtaskId: z.string().min(1),
  parentTaskId: z.string().min(1),
  type: z.string().min(1), // e.g. 'GRAPH_INFERENCE', 'SEMANTIC_ANALYSIS', 'DATA_TRANSFORMATION', 'VECTOR_AGGREGATION'
  payload: z.record(z.string(), z.unknown()),
  requiredCapabilities: z.array(z.string()).default([]),
  requiredSpecialization: z.string().nullable().optional(),
  timeoutMs: z.number().positive().default(5000),
  maxRetries: z.number().int().min(0).default(2),
  priority: z.number().int().default(0)
});

export type ComputationSubtask = z.infer<typeof ComputationSubtaskSchema>;

// 5. Computation Task (Root Goal / Job)
export const ComputationTaskSchema = z.object({
  taskId: z.string().min(1),
  goal: z.string().min(1),
  computationType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  requiredCapabilities: z.array(z.string()).default([]),
  originatingCellId: z.string().min(1),
  timeoutMs: z.number().positive().default(10000),
  deterministicIdentity: z.string().min(1), // SHA-256 of canonical task specification
  createdAt: z.string()
});

export type ComputationTask = z.infer<typeof ComputationTaskSchema>;

// 6. Computation Execution & Execution Cost Models
export const ComputationExecutionCostSchema = z.object({
  communicationCost: z.number().nonnegative(), // Transfer time / latency in ms
  synchronizationCost: z.number().nonnegative(), // Barrier wait time in ms
  verificationCost: z.number().nonnegative(), // Cryptographic and integrity verification in ms
  totalCost: z.number().nonnegative()
});

export type ComputationExecutionCost = z.infer<typeof ComputationExecutionCostSchema>;

export const ComputationExecutionSchema = z.object({
  executionId: z.string().min(1),
  subtaskId: z.string().min(1),
  cellId: z.string().min(1),
  attempt: z.number().int().min(1),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  status: z.string(),
  cost: ComputationExecutionCostSchema.optional(),
  error: z.string().optional()
});

export type ComputationExecution = z.infer<typeof ComputationExecutionSchema>;

// 7. Subtask Result
export const SubtaskResultSchema = z.object({
  subtaskId: z.string().min(1),
  taskId: z.string().min(1),
  executingCellId: z.string().min(1),
  originatingCellId: z.string().optional(),
  status: ComputationStatusSchema,
  output: z.record(z.string(), z.unknown()),
  error: z.string().optional(),
  attempts: z.number().int().min(0),
  executionDurationMs: z.number().nonnegative(),
  provenance: z.array(z.string()).min(1),
  resultHash: z.string().min(1),
  executionCost: ComputationExecutionCostSchema.optional()
});

export type SubtaskResult = z.infer<typeof SubtaskResultSchema>;

// 8. Computation Verification Status
export const ComputationVerificationStatusSchema = z.object({
  verified: z.boolean(),
  verifierCellId: z.string().min(1),
  verifiedAt: z.string(),
  consistencyScore: z.number().min(0).max(1),
  checksum: z.string().min(1),
  notes: z.string().optional()
});

export type ComputationVerificationStatus = z.infer<typeof ComputationVerificationStatusSchema>;

// 9. Structured Composition Pipeline Elements:
// Partial Results -> Composition Inputs -> Composition Transformation -> Composite Computational State -> Final Result

// 9a. Composition Input
export const CompositionInputSchema = z.object({
  subtaskId: z.string().min(1),
  executingCellId: z.string().min(1),
  status: ComputationStatusSchema,
  output: z.record(z.string(), z.unknown()),
  provenance: z.array(z.string()),
  resultHash: z.string().min(1),
  dependencySourceIds: z.array(z.string()),
  isVerified: z.boolean(),
  cost: ComputationExecutionCostSchema.optional()
});

export type CompositionInput = z.infer<typeof CompositionInputSchema>;

// 9b. Composition Transformation Operator
export const CompositionTransformationSchema = z.object({
  transformationId: z.string().min(1),
  operator: z.string().default('NON_ADDITIVE_FUNCTIONAL_SYNTHESIS'),
  rule: z.string(),
  criticalPathDepth: z.number().int().nonnegative(),
  parallelWavesCount: z.number().int().nonnegative(),
  averageParallelism: z.number().positive(),
  parallelFraction: z.number().min(0).max(1),
  serialFraction: z.number().min(0).max(1),
  concurrencySpeedup: z.number().positive(),
  attenuationFactor: z.number().positive(),
  specializationSynergy: z.number().positive(),
  dependencyGraphReduction: z.object({
    nodesCount: z.number().int().nonnegative(),
    edgesCount: z.number().int().nonnegative(),
    resolvedEdgesCount: z.number().int().nonnegative()
  })
});

export type CompositionTransformation = z.infer<typeof CompositionTransformationSchema>;

// 9c. Mathematical Composite Compute Model Structure: C* = F(C1, ..., Cn)
export const CompositeComputeModelSchema = z.object({
  formula: z.string().default('C* = F(C1, C2, ..., Cn)'),
  participantCapacities: z.record(z.string(), z.number().nonnegative()),
  naiveSumCapacity: z.number().nonnegative(),
  effectiveCapacity: z.number().nonnegative(), // C* (strictly non-additive, derived operational capability)
  isNonAdditive: z.literal(true).default(true),
  parameters: z.object({
    serialFraction: z.number().nonnegative(),
    parallelFraction: z.number().nonnegative(),
    theoreticalSpeedup: z.number().positive(),
    latencyDegradation: z.number().positive(),
    specializationFactor: z.number().positive()
  }),
  overheadBreakdown: z.object({
    communicationCost: z.number().nonnegative(),
    synchronizationCost: z.number().nonnegative(),
    verificationCost: z.number().nonnegative(),
    totalOverheadCost: z.number().nonnegative()
  })
});

export type CompositeComputeModel = z.infer<typeof CompositeComputeModelSchema>;

// 9d. Composite Computational State (synthesized state before final presentation)
export const CompositeComputationalStateSchema = z.object({
  stateId: z.string().min(1),
  transformationId: z.string().optional(),
  transformationParameters: z.record(z.string(), z.unknown()).optional(),
  synthesizedEntities: z.record(z.string(), z.unknown()),
  unifiedStateVector: z.record(z.string(), z.unknown()),
  crossCellResolution: z.record(z.string(), z.string()),
  dependencyResolutions: z.array(z.object({
    fromSubtask: z.string(),
    toSubtask: z.string(),
    resolvedKey: z.string().optional(),
    status: z.string()
  })),
  provenanceChain: z.array(z.string()),
  stateChecksum: z.string().min(1)
});

export type CompositeComputationalState = z.infer<typeof CompositeComputationalStateSchema>;

// 9e. Computation Composition Model: C* = F(C1, C2, ..., Cn)
export const ComputationCompositionSchema = z.object({
  compositionId: z.string().min(1),
  formula: z.string().default('C* = F(C1, C2, ..., Cn)'),
  transformationRule: z.string(),
  computeModel: CompositeComputeModelSchema,
  inputs: z.array(CompositionInputSchema),
  transformation: CompositionTransformationSchema,
  compositeState: CompositeComputationalStateSchema,
  inputSubtaskCount: z.number().int().nonnegative(),
  inputCellIds: z.array(z.string()),
  effectiveCapacity: z.number().nonnegative(), // Derived capability incorporating Amdahl concurrency & overhead, NOT simple scalar sum
  costs: z.object({
    communicationCost: z.number().nonnegative(),
    synchronizationCost: z.number().nonnegative(),
    verificationCost: z.number().nonnegative(),
    totalOverheadCost: z.number().nonnegative()
  }),
  composedOutput: z.record(z.string(), z.unknown()),
  deterministicHash: z.string().min(1)
});

export type ComputationComposition = z.infer<typeof ComputationCompositionSchema>;

// 10. Computation Trace (Full Audit Log & Provenance)
export const ComputationTraceSchema = z.object({
  traceId: z.string().min(1),
  taskId: z.string().min(1),
  goal: z.string().min(1),
  decomposedSubtaskIds: z.array(z.string()),
  executionOrder: z.array(z.array(z.string())), // Parallel waves
  allocations: z.record(z.string(), z.string()), // subtaskId -> cellId
  dispatches: z.array(ComputationExecutionSchema),
  verificationTrace: z.array(z.object({
    subtaskId: z.string(),
    verified: z.boolean(),
    reason: z.string()
  })),
  compositionDetails: ComputationCompositionSchema,
  completedAt: z.string()
});

export type ComputationTrace = z.infer<typeof ComputationTraceSchema>;

// 11. Final Computation Result (Deep Immutable)
export const ComputationResultSchema = z.object({
  taskId: z.string().min(1),
  subtaskId: z.string().optional(),
  originatingCellId: z.string().min(1),
  status: ComputationStatusSchema,
  finalOutput: z.record(z.string(), z.unknown()),
  partialResults: z.record(z.string(), SubtaskResultSchema),
  dependencies: z.array(ComputationDependencySchema),
  provenance: z.array(z.string()).min(1),
  verificationStatus: ComputationVerificationStatusSchema,
  trace: ComputationTraceSchema,
  composition: ComputationCompositionSchema,
  deterministicHash: z.string().min(1),
  completedAt: z.string()
});

export type ComputationResult = z.infer<typeof ComputationResultSchema>;
