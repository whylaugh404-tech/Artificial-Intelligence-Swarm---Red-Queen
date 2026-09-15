import { z } from 'zod';
import { CellCapability } from '../../genome/types';

/**
 * P8.1 — Collective Computation Foundation
 * Strongly typed models for computation tasks, partitions, profiles, and immutable results.
 */

// 1. Cell Computational Capability Profile
export const CellComputeCapacitySchema = z.object({
  capacity: z.number().positive(), // Relative throughput capacity units (e.g., FLOPS/ops weight)
  architecture: z.enum(['NATIVE_TS', 'WASM_SANDBOX', 'COGNITIVE_REASONER', 'DISTRIBUTED_PIPELINE']),
  parallelism: z.number().int().min(1), // Max parallel tasks/workers supported
  memory: z.number().positive(), // Available working memory in MB/tokens
  specialization: z.string().nullable().default(null),
  availability: z.number().min(0.0).max(1.0).default(1.0) // 0.0 (offline/busy) to 1.0 (fully available)
});

export type CellComputeCapacity = z.infer<typeof CellComputeCapacitySchema>;

// 2. Communication Profile
export const CommunicationProfileSchema = z.object({
  bandwidth: z.number().positive(), // Estimated transfer rate (MB/s or ops/s)
  latency: z.number().nonnegative(), // Estimated roundtrip latency in ms
  topology: z.enum(['DIRECT_P2P', 'DHT_ROUTED', 'LOCAL_CLUSTER', 'MESH']),
  reliability: z.number().min(0.0).max(1.0).default(1.0) // Historical packet/task ack rate
});

export type CommunicationProfile = z.infer<typeof CommunicationProfileSchema>;

// 3. Dependency Specification
export const ComputationDependencySchema = z.object({
  dependencyId: z.string().min(1),
  sourceSubtaskId: z.string().min(1), // Subtask whose output is required
  targetSubtaskId: z.string().min(1), // Subtask waiting for the output
  requiredOutputKey: z.string().optional(), // Specific field or entire payload
  isOptional: z.boolean().default(false)
});

export type ComputationDependency = z.infer<typeof ComputationDependencySchema>;

// 4. Compute Partition
export const ComputePartitionSchema = z.object({
  partitionId: z.string().min(1),
  subtaskId: z.string().min(1),
  assignedCellId: z.string().min(1),
  estimatedWorkload: z.number().positive(),
  timeoutMs: z.number().positive().default(5000),
  maxRetries: z.number().int().min(0).default(2)
});

export type ComputePartition = z.infer<typeof ComputePartitionSchema>;

// 5. Computation Status
export enum ComputationStatus {
  PENDING = 'PENDING',
  DECOMPOSED = 'DECOMPOSED',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT'
}

export const ComputationStatusSchema = z.nativeEnum(ComputationStatus);

// 6. Computation Subtask
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

// 7. Computation Task (Root Goal/Job)
export const ComputationTaskSchema = z.object({
  taskId: z.string().min(1),
  goal: z.string().min(1),
  computationType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  requiredCapabilities: z.array(z.string()).default([]),
  originatingCellId: z.string().min(1),
  timeoutMs: z.number().positive().default(10000),
  deterministicIdentity: z.string().min(1), // SHA-256 of canonical task specification
  createdAt: z.string().datetime()
});

export type ComputationTask = z.infer<typeof ComputationTaskSchema>;

// 8. Computation Trace
export const ComputationTraceSchema = z.object({
  traceId: z.string().min(1),
  taskId: z.string().min(1),
  goal: z.string().min(1),
  decomposedSubtaskIds: z.array(z.string()),
  executionOrder: z.array(z.array(z.string())), // Execution batches/waves (parallel subtask IDs)
  allocations: z.record(z.string(), z.string()), // subtaskId -> assignedCellId
  dispatches: z.array(z.object({
    subtaskId: z.string(),
    cellId: z.string(),
    attempt: z.number(),
    startedAt: z.string(),
    completedAt: z.string().optional(),
    durationMs: z.number().optional(),
    status: z.string()
  })),
  verificationTrace: z.array(z.object({
    subtaskId: z.string(),
    verified: z.boolean(),
    reason: z.string()
  })),
  compositionDetails: z.object({
    transformationRule: z.string(),
    inputSubtaskCount: z.number(),
    compositionTraceId: z.string().optional(),
    formula: z.string().default('C* = F(C1, C2, ..., Cn)')
  }),
  completedAt: z.string().datetime()
});

export type ComputationTrace = z.infer<typeof ComputationTraceSchema>;

// 9. Verification Status
export const ComputationVerificationStatusSchema = z.object({
  verified: z.boolean(),
  verifierCellId: z.string().min(1),
  verifiedAt: z.string().datetime(),
  consistencyScore: z.number().min(0).max(1),
  checksum: z.string().min(1),
  notes: z.string().optional()
});

export type ComputationVerificationStatus = z.infer<typeof ComputationVerificationStatusSchema>;

// 10. Subtask Result
export const SubtaskResultSchema = z.object({
  subtaskId: z.string().min(1),
  taskId: z.string().min(1),
  executingCellId: z.string().min(1),
  status: ComputationStatusSchema,
  output: z.record(z.string(), z.unknown()),
  error: z.string().optional(),
  attempts: z.number().int().min(1),
  executionDurationMs: z.number().nonnegative(),
  provenance: z.array(z.string()).min(1),
  resultHash: z.string().min(1)
});

export type SubtaskResult = z.infer<typeof SubtaskResultSchema>;

// 11. Computation Result (Final Immutable Result)
export const ComputationResultSchema = z.object({
  taskId: z.string().min(1),
  subtaskId: z.string().optional(), // For partial or aggregated
  originatingCellId: z.string().min(1),
  status: ComputationStatusSchema,
  finalOutput: z.record(z.string(), z.unknown()),
  partialResults: z.record(z.string(), SubtaskResultSchema), // subtaskId -> SubtaskResult
  dependencies: z.array(ComputationDependencySchema),
  provenance: z.array(z.string()).min(1),
  verificationStatus: ComputationVerificationStatusSchema,
  trace: ComputationTraceSchema,
  deterministicHash: z.string().min(1), // Canonical SHA-256 of result payload & provenance
  completedAt: z.string().datetime()
});

export type ComputationResult = z.infer<typeof ComputationResultSchema>;

// Trigger GitHub Sync
