import { z } from 'zod';
import { Experience } from '../metabolism/types';
import { ComputationTask, SubtaskResult } from '../cognition/computation/types';

/**
 * P9.1: Evolution Foundation - Evolutionary State Types
 * 
 * Defines deterministic fitness structures, bounded mutations,
 * and immutable evolution events grounded in existing Cell & Genome architecture.
 */

export const FitnessComponentsSchema = z.object({
  cognitive: z.number().min(0.0).max(1.0),
  metabolic: z.number().min(0.0).max(1.0),
  computational: z.number().min(0.0).max(1.0),
  adaptability: z.number().min(0.0).max(1.0)
});

export type FitnessComponents = z.infer<typeof FitnessComponentsSchema>;

export const FitnessWeightsSchema = z.object({
  cognitive: z.number().min(0.0).max(1.0).default(0.3),
  metabolic: z.number().min(0.0).max(1.0).default(0.25),
  computational: z.number().min(0.0).max(1.0).default(0.25),
  adaptability: z.number().min(0.0).max(1.0).default(0.2)
});

export type FitnessWeights = z.infer<typeof FitnessWeightsSchema>;

export const FitnessStateSchema = z.object({
  cellId: z.string().min(1),
  genomeId: z.string().min(1),
  generation: z.number().int().min(0),
  components: FitnessComponentsSchema,
  overallFitness: z.number().min(0.0).max(1.0),
  evaluatedAt: z.string(),
  deterministicIdentity: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type FitnessState = z.infer<typeof FitnessStateSchema>;

/**
 * Strictly authorized mutation targets for P9.1.
 * Mutations are only permitted to alter existing genome traits and specialization values.
 * Unauthorized modifications (e.g. offensive capabilities, core node identity) are strictly forbidden.
 */
export const ALLOWED_MUTATION_TARGETS = [
  'traits.mutationRate',
  'traits.riskTolerance',
  'traits.explorationVsExploitation',
  'traits.maxCognitiveCycleDepth',
  'specialization'
] as const;

export type MutationTarget = (typeof ALLOWED_MUTATION_TARGETS)[number];

export function isMutationTargetAllowed(target: string): target is MutationTarget {
  return (ALLOWED_MUTATION_TARGETS as readonly string[]).includes(target);
}

export const MutationSchema = z.object({
  mutationId: z.string().min(1),
  targetKey: z.enum(ALLOWED_MUTATION_TARGETS),
  previousValue: z.union([z.number(), z.string(), z.null()]),
  newValue: z.union([z.number(), z.string(), z.null()]),
  delta: z.number().nullable(),
  seed: z.string().min(1),
  appliedAt: z.string(),
  reason: z.string(),
  deterministicHash: z.string()
});

export type Mutation = z.infer<typeof MutationSchema>;

export const EvolutionEventStatus = {
  APPLIED: 'APPLIED',
  REVERTED: 'REVERTED'
} as const;

export type EvolutionEventStatus = (typeof EvolutionEventStatus)[keyof typeof EvolutionEventStatus];

export const EvolutionEventSchema = z.object({
  eventId: z.string().min(1),
  cellId: z.string().min(1),
  lineageId: z.string().min(1),
  generation: z.number().int().min(0),
  previousGenomeId: z.string().min(1),
  newGenomeId: z.string().min(1),
  previousFitness: FitnessStateSchema,
  currentFitness: FitnessStateSchema.nullable(),
  mutations: z.array(MutationSchema),
  timestamp: z.string(),
  status: z.enum(['APPLIED', 'REVERTED']),
  deterministicHash: z.string()
});

export type EvolutionEvent = z.infer<typeof EvolutionEventSchema>;

export interface EvaluationInput {
  experiences?: Experience[];
  computationTasks?: Array<{ status?: string } | ComputationTask>;
  subtaskResults?: SubtaskResult[];
  operationalConfidence?: number;
  conceptCount?: number;
  weights?: Partial<FitnessWeights>;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface MutationOptions {
  seed: string;
  targetKeys?: MutationTarget[];
  maxStepSize?: number; // Maximum bounded delta (default: 0.05)
  customSpecialization?: string | null;
  reason?: string;
  timestamp?: string;
}

export interface EvolutionCycleOptions {
  seed: string;
  mutationOptions?: Partial<Omit<MutationOptions, 'seed'>>;
  evaluationInput?: EvaluationInput;
  timestamp?: string;
}
