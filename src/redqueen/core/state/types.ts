import { z } from 'zod';
import { ComputePartitionSchema } from '../compute/types';

export enum LifecycleState {
  INITIALIZING = 'INITIALIZING',
  ACTIVE = 'ACTIVE',
  DORMANT = 'DORMANT',
  TERMINATING = 'TERMINATING'
}

export const CellSpecializationSchema = z.object({
  domain: z.string(),
  focusAreas: z.array(z.string()),
  level: z.number().min(0).max(1)
});
export type CellSpecialization = z.infer<typeof CellSpecializationSchema>;

export const CellComputationalCapabilitySchema = z.object({
  architecture: z.string(),
  capacity: z.number(),
  parallelism: z.number(),
  memoryLimit: z.number(),
  availability: z.number().min(0).max(1),
  communicationProfile: z.record(z.string(), z.unknown()),
  partitions: z.array(ComputePartitionSchema).optional()
});
export type CellComputationalCapability = z.infer<typeof CellComputationalCapabilitySchema>;

export const CellStateSchema = z.object({
  stateId: z.string().min(1),
  cellIdentity: z.string().min(1),
  genomeReference: z.string(),
  
  memoryState: z.record(z.string(), z.unknown()),
  knowledgeState: z.record(z.string(), z.unknown()),
  cognitiveState: z.record(z.string(), z.unknown()),
  reasoningState: z.record(z.string(), z.unknown()),
  experienceState: z.record(z.string(), z.unknown()),
  
  computationalCapability: CellComputationalCapabilitySchema,
  specializations: z.array(CellSpecializationSchema),
  
  lifecycle: z.nativeEnum(LifecycleState),
  provenance: z.array(z.string())
});
export type CellState = z.infer<typeof CellStateSchema>;

export const StateTransitionSchema = z.object({
  transitionId: z.string().min(1),
  sourceStateId: z.string().min(1),
  targetStateId: z.string().min(1),
  transitionType: z.string().min(1),
  changedFields: z.array(z.string()),
  provenance: z.array(z.string()),
  timestamp: z.string().datetime()
});
export type StateTransition = z.infer<typeof StateTransitionSchema>;
