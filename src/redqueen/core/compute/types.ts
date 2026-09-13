import { z } from 'zod';

/**
 * CommunicationProfile: capability of data transfer between Cells for distributed computation.
 * Bandwidth is the data transfer capacity for distributed computation, NOT internet bandwidth.
 */
export const CommunicationProfileSchema = z.object({
  bandwidth: z.number().finite().positive('Bandwidth must be a positive finite number'),
  latency: z.number().finite().nonnegative('Latency must be non-negative and finite'),
  topology: z.string().trim().min(1, 'Topology must not be empty'),
  reliability: z.number().finite().min(0, 'Reliability must be between 0 and 1').max(1, 'Reliability must be between 0 and 1')
});
export type CommunicationProfile = z.infer<typeof CommunicationProfileSchema>;

/**
 * Input schema for creating a ComputePartition.
 */
export const CreateComputePartitionInputSchema = z.object({
  cellIdentity: z.string().trim().min(1, 'Cell identity must not be empty'),
  name: z.string().trim().min(1, 'Partition name must not be empty'),
  architecture: z.string().trim().min(1, 'Architecture must not be empty'),
  capacity: z.number().finite().positive('Capacity must be a positive finite number'),
  parallelism: z.number().int('Parallelism must be an integer').positive('Parallelism must be at least 1'),
  memory: z.number().finite().positive('Memory must be a positive finite number'),
  specialization: z.string().trim().min(1, 'Specialization must not be empty'),
  availability: z.number().finite().min(0, 'Availability must be between 0 and 1').max(1, 'Availability must be between 0 and 1'),
  communicationProfile: CommunicationProfileSchema,
  runtimeMetadata: z.record(z.string(), z.unknown()).optional()
});
export type CreateComputePartitionInput = z.infer<typeof CreateComputePartitionInputSchema>;

/**
 * Canonical ComputePartition:
 * Represents a digital compute partition of a Cell with deterministic semantic identity.
 */
export const ComputePartitionSchema = z.object({
  partitionId: z.string().min(1),
  cellIdentity: z.string().trim().min(1, 'Cell identity must not be empty'),
  name: z.string().trim().min(1, 'Partition name must not be empty'),
  architecture: z.string().trim().min(1, 'Architecture must not be empty'),
  capacity: z.number().finite().positive('Capacity must be a positive finite number'),
  parallelism: z.number().int('Parallelism must be an integer').positive('Parallelism must be at least 1'),
  memory: z.number().finite().positive('Memory must be a positive finite number'),
  specialization: z.string().trim().min(1, 'Specialization must not be empty'),
  availability: z.number().finite().min(0, 'Availability must be between 0 and 1').max(1, 'Availability must be between 0 and 1'),
  communicationProfile: CommunicationProfileSchema,
  runtimeMetadata: z.record(z.string(), z.unknown()).default({})
});
export type ComputePartition = z.infer<typeof ComputePartitionSchema>;
