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

// 9. Computation Composition Model: C* = F(C1, C2, ..., Cn)
export const ComputationCompositionSchema = z.object({
  compositionId: z.string().min(1),
  formula: z.string().default('C* = F(C1, C2, ..., Cn)'),
  transformationRule: z.string(),
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
