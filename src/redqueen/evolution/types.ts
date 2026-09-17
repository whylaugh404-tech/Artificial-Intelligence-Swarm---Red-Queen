import { z } from 'zod';
import { Experience } from '../metabolism/types';
import { ComputationTask, SubtaskResult, ComputationStatus, ComputationStatusSchema } from '../cognition/computation/types';

/**
 * P9.1: Evolution Foundation - Evolutionary State Types
 * 
 * Defines deterministic fitness structures, bounded mutations,
 * and immutable evolution events grounded in existing Cell & Genome architecture.
 */

export const FitnessComponentsSchema = z.object({
  computationPerformance: z.number().min(0.0).max(1.0),
  reliability: z.number().min(0.0).max(1.0),
  cognitiveContribution: z.number().min(0.0).max(1.0),
  knowledgeContribution: z.number().min(0.0).max(1.0),
  specialization: z.number().min(0.0).max(1.0),
  experience: z.number().min(0.0).max(1.0),
  resourceEfficiency: z.number().min(0.0).max(1.0)
});

export type FitnessComponents = z.infer<typeof FitnessComponentsSchema>;

export const FitnessWeightsSchema = z.object({
  computationPerformance: z.number().min(0.0).max(1.0).default(0.15),
  reliability: z.number().min(0.0).max(1.0).default(0.15),
  cognitiveContribution: z.number().min(0.0).max(1.0).default(0.15),
  knowledgeContribution: z.number().min(0.0).max(1.0).default(0.15),
  specialization: z.number().min(0.0).max(1.0).default(0.10),
  experience: z.number().min(0.0).max(1.0).default(0.15),
  resourceEfficiency: z.number().min(0.0).max(1.0).default(0.15)
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
  provenance: z.array(z.string()).default([]),
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
  knowledgeCount?: number;
  reliabilityScore?: number;
  resourceScore?: number;
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

/**
 * P9.2: Population Selection Types
 */
export const SelectionScoreSchema = z.object({
  cellId: z.string().min(1),
  fitness: z.number().min(0.0).max(1.0),
  specializationScore: z.number().min(0.0).max(1.0),
  reliabilityScore: z.number().min(0.0).max(1.0),
  contributionScore: z.number().min(0.0).max(1.0),
  diversityScore: z.number().min(0.0).max(1.0),
  finalScore: z.number().min(0.0).max(1.0),
  deterministicIdentity: z.string().min(1)
});

export type SelectionScore = z.infer<typeof SelectionScoreSchema>;

export const SelectionWeightsSchema = z.object({
  fitness: z.number().min(0.0).max(1.0).default(0.40),
  specializationScore: z.number().min(0.0).max(1.0).default(0.15),
  reliabilityScore: z.number().min(0.0).max(1.0).default(0.15),
  contributionScore: z.number().min(0.0).max(1.0).default(0.15),
  diversityScore: z.number().min(0.0).max(1.0).default(0.15)
});

export type SelectionWeights = z.infer<typeof SelectionWeightsSchema>;

export const SelectionProvenanceSchema = z.object({
  evaluatedPopulation: z.array(z.string()),
  rankedCells: z.array(z.string()),
  fitnessSnapshots: z.record(z.string(), z.number()),
  selectionReasons: z.record(z.string(), z.string()),
  parameters: z.record(z.string(), z.unknown()),
  selectedCells: z.array(z.string()),
  deterministicHash: z.string()
});

export type SelectionProvenance = z.infer<typeof SelectionProvenanceSchema>;

export const PopulationSelectionResultSchema = z.object({
  populationSize: z.number().int().min(0),
  selectedCells: z.array(z.string()),
  rankedCells: z.array(z.string()),
  selectionScores: z.record(z.string(), SelectionScoreSchema),
  preservedDiversity: z.number().min(0.0).max(1.0),
  deterministicIdentity: z.string().min(1),
  provenance: SelectionProvenanceSchema,
  timestamp: z.string()
});

export type PopulationSelectionResult = z.infer<typeof PopulationSelectionResultSchema>;

export interface PopulationSelectionOptions {
  selectionCount?: number;
  evaluationInputs?: Record<string, EvaluationInput>;
  weights?: Partial<SelectionWeights>;
  preserveSpecializationNiches?: boolean;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

/**
 * P9.3: Population Dynamics & Evolution Cycle Foundation Types
 */
export const PopulationCycleProvenanceSchema = z.object({
  cycleId: z.string(),
  generation: z.number().int().min(0),
  previousGeneration: z.number().int().min(0),
  inputPopulationIds: z.array(z.string()),
  survivingCellIds: z.array(z.string()),
  fitnessSnapshots: z.record(z.string(), z.number()),
  selectionReasons: z.record(z.string(), z.string()),
  ranking: z.array(z.string()),
  parameters: z.record(z.string(), z.unknown()),
  selectionDeterministicHash: z.string(),
  deterministicHash: z.string()
});

export type PopulationCycleProvenance = z.infer<typeof PopulationCycleProvenanceSchema>;

export interface PopulationCycleOptions extends PopulationSelectionOptions {
  currentGeneration?: number;
  generation?: number;
  cycleId?: string;
  metadata?: Record<string, unknown>;
}

export interface PopulationEvolutionCycleResult {
  generation: number;
  inputPopulation: any[];
  inputPopulationIds: string[];
  fitnessStates: Record<string, FitnessState>;
  selectionResult: PopulationSelectionResult;
  survivingCells: any[];
  survivingCellIds: string[];
  populationIdentity: string;
  evolutionEvent: PopulationCycleProvenance;
  provenance: PopulationCycleProvenance;
  deterministicIdentity: string;
  timestamp: string;
}

// 13. P8 -> P9 Feedback Telemetry for Evolutionary Fitness
export const ComputationFeedbackTelemetrySchema = z.object({
  telemetryId: z.string().min(1),
  cellId: z.string().min(1),
  taskId: z.string().min(1),
  status: ComputationStatusSchema,
  computationFitnessScore: z.number().min(0).max(1),
  epistemicContributionScore: z.number().min(0).max(1),
  cycleDepth: z.number().int().nonnegative(),
  timestamp: z.string(),
  provenance: z.array(z.string()).min(1),
  deterministicHash: z.string().min(1)
});

export type ComputationFeedbackTelemetry = z.infer<typeof ComputationFeedbackTelemetrySchema>;

