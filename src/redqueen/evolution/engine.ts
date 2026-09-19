import { createHash } from 'crypto';
import type { Cell } from '../core/cell';
import {
  CellGenome,
  CellGenomeSchema,
  validateGenome,
  deepFreeze
} from '../genome';
import { computeDeterministicHash } from '../cognition/computation/canonical';
import { MetabolismStatus, Experience } from '../metabolism/types';
import { ComputationStatus } from '../cognition/computation/types';
import { MemoryCategory, type MemoryStore } from '../memory/store';
import type { CognitiveDevelopmentResult } from '../cognition/development/engine';
import { CellState } from '../core/lifecycle';
import {
  FitnessComponents,
  FitnessComponentsSchema,
  FitnessState,
  FitnessStateSchema,
  FitnessWeights,
  FitnessWeightsSchema,
  Mutation,
  MutationSchema,
  MutationTarget,
  ALLOWED_MUTATION_TARGETS,
  isMutationTargetAllowed,
  EvolutionEvent,
  EvolutionEventSchema,
  EvolutionEventStatus,
  EvaluationInput,
  MutationOptions,
  EvolutionCycleOptions,
  ComputationFeedbackTelemetry,
  ComputationFeedbackTelemetrySchema,
  ExperienceFeedbackTelemetry,
  ExperienceFeedbackTelemetrySchema,
  ExperienceEvolutionMetrics,
  EvolutionTriggerPolicy,
  EvolutionTriggerPolicySchema,
  EvolutionTriggerType,
  EvolutionWarrantEvaluation,
  PopulationTelemetryMetrics,
  PopulationTelemetryMetricsSchema,
  ReproductionTriggerReason,
  ReproductionEligibilityEvidence,
  ReproductionPolicyConditions,
  ReproductionPolicyDecision,
  ReproductionWarrant,
  ReproductionWarrantSchema,
  ReproductionEligibilityOptions,
  CausalReproductionResult
} from './types';
import { logger } from '../core/logger';

const COMPONENT = 'evolution_engine';

/**
 * Derives a deterministic float in [0, 1) from seed and index.
 * Uses SHA-256 for cryptographic uniformity and cross-platform determinism.
 */
function seededFloat(seed: string, index: number): number {
  const hash = createHash('sha256').update(`${seed}:${index}`).digest('hex');
  const intVal = parseInt(hash.substring(0, 8), 16);
  return intVal / 0xffffffff;
}

/**
 * Rounds a number to a fixed number of decimals to prevent floating-point drift.
 */
function round4(val: number): number {
  return Math.round(val * 10000) / 10000;
}

/**
 * Clamps a number within [min, max].
 */
function clamp(val: number, min = 0.0, max = 1.0): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * P9.1: EvolutionEngine
 * 
 * Manages the foundational evolutionary state for a single Cell:
 * Cell State → Evaluation → Fitness → Mutation → Evolution Event
 * 
 * Guarantees:
 * - Pure determinism: identical state + identical input evaluation yields identical fitness and identity
 * - Strict bounds: trait values never violate allowed ranges
 * - Seeded mutations: only allowed traits/specializations can mutate; unseeded mutations are rejected
 * - Reversibility & Auditability: every mutation and event is traceable and reversible
 */
export class EvolutionEngine {
  private events: Map<string, EvolutionEvent> = new Map();
  private genomeSnapshots: Map<string, CellGenome> = new Map();
  private computationTelemetries: Map<string, ComputationFeedbackTelemetry[]> = new Map();
  private experienceTelemetries: Map<string, ExperienceFeedbackTelemetry[]> = new Map();
  private consecutiveFailures: Map<string, number> = new Map();
  private lastEvolutionTimestamp: Map<string, number> = new Map();

  constructor(private cell?: Cell) {}

  /**
   * Evaluates the fitness of a Cell based on its individual operational, metabolic,
   * computational, and trait stability state.
   */
  public evaluateFitness(targetCell?: Cell, input?: EvaluationInput): FitnessState {
    const activeCell = targetCell || this.cell;
    if (!activeCell) {
      throw new Error('EvolutionEngine: No active Cell provided for fitness evaluation');
    }

    const genome = activeCell.genome;
    const cogState = activeCell.cognitiveState ? activeCell.cognitiveState.getState() : null;

    // 1. computationPerformance [0.0, 1.0]
    let computationPerformance = 0.5; // neutral default
    if (input?.subtaskResults && input.subtaskResults.length > 0) {
      let completed = 0;
      let total = 0;
      for (const res of input.subtaskResults) {
        if (res.status === ComputationStatus.COMPLETED) {
          completed += 1;
          total += 1;
        } else if (res.status === ComputationStatus.FAILED) {
          total += 1;
        }
      }
      computationPerformance = total > 0 ? round4(clamp(completed / total)) : 0.5;
    } else if (input?.computationTasks && input.computationTasks.length > 0) {
      let completed = 0;
      let total = 0;
      for (const task of input.computationTasks) {
        const st = 'status' in task ? (task as any).status : undefined;
        if (st === ComputationStatus.COMPLETED || st === 'COMPLETED') {
          completed += 1;
          total += 1;
        } else if (st === ComputationStatus.FAILED || st === 'FAILED') {
          total += 1;
        }
      }
      computationPerformance = total > 0 ? round4(clamp(completed / total)) : 0.5;
    } else if (activeCell.collectiveComputation) {
      const cap = activeCell.collectiveComputation.getCellComputeCapacity(activeCell);
      const availScore = cap.availability;
      const parallelismScore = clamp(cap.parallelism / 5.0);
      computationPerformance = round4(clamp(availScore * 0.6 + parallelismScore * 0.4));
    }

    // Factor in recorded feedback telemetries for this Cell
    const cellTelemetries = this.computationTelemetries.get(activeCell.nodeId);
    if (cellTelemetries && cellTelemetries.length > 0) {
      const avgFitness = cellTelemetries.reduce((sum, t) => sum + t.computationFitnessScore, 0) / cellTelemetries.length;
      computationPerformance = round4(clamp(computationPerformance * 0.4 + avgFitness * 0.6));
    }

    // 2. reliability [0.0, 1.0]
    let reliability = 0.5;
    if (typeof input?.reliabilityScore === 'number') {
      reliability = clamp(input.reliabilityScore);
    } else if (activeCell.verification) {
      reliability = 0.8; // Baseline for having verification engine
    }

    // 3. cognitiveContribution [0.0, 1.0]
    const opConfidence = typeof input?.operationalConfidence === 'number'
      ? clamp(input.operationalConfidence)
      : clamp(cogState?.operationalConfidence ?? 1.0);
    const cognitiveContribution = round4(clamp(opConfidence));

    // 4. knowledgeContribution [0.0, 1.0]
    const conceptCount = typeof input?.conceptCount === 'number'
      ? input.conceptCount
      : (activeCell.cognitiveGraph ? activeCell.cognitiveGraph.getAllConcepts().length : (cogState?.knowledgeReferences.length ?? 0));
    const knowledgeCount = typeof input?.knowledgeCount === 'number' ? input.knowledgeCount : conceptCount; // Fallback to concepts
    const knowledgeContribution = round4(clamp(knowledgeCount / 20.0));

    // 5. specialization [0.0, 1.0]
    let specializationScore = 0.5;
    if (genome.specialization) {
      specializationScore = 0.8; // Has a specialization
    }
    const specialization = specializationScore;

    // 6. experience [0.0, 1.0]
    let experience = 0.5; // neutral default
    if (input?.experiences && input.experiences.length > 0) {
      let positive = 0;
      let total = 0;
      for (const exp of input.experiences) {
        if (exp.outcome === MetabolismStatus.ACCEPTED) {
          positive += exp.confidence ?? 1.0;
          total += 1;
        } else if (
          exp.outcome === MetabolismStatus.REJECTED ||
          exp.outcome === MetabolismStatus.INVALID ||
          exp.outcome === MetabolismStatus.FAILED
        ) {
          total += 1;
        }
      }
      experience = total > 0 ? round4(clamp(positive / total)) : 0.5;
    }

    // 7. resourceEfficiency [0.0, 1.0] default
    let resourceEfficiency = 0.5;
    if (typeof input?.resourceScore === 'number') {
      resourceEfficiency = clamp(input.resourceScore);
    } else if (activeCell.collectiveComputation) {
      const cap = activeCell.collectiveComputation.getCellComputeCapacity(activeCell);
      resourceEfficiency = round4(clamp(cap.availability));
    }

    // Incorporate recorded experience telemetry if available
    const expTelemetries = this.experienceTelemetries.get(activeCell.nodeId);
    if (expTelemetries && expTelemetries.length > 0) {
      const avgExpFitness = expTelemetries.reduce((sum, t) => sum + t.experienceFitnessScore, 0) / expTelemetries.length;
      if (input?.experiences && input.experiences.length > 0) {
        experience = round4(clamp(experience * 0.4 + avgExpFitness * 0.6));
      } else {
        experience = round4(clamp(avgExpFitness));
      }

      // Also adjust reliability and resource efficiency based on experience telemetry
      const recent = expTelemetries.slice(-10);
      const avgRobustness = recent.reduce((sum, t) => sum + t.metrics.robustness, 0) / recent.length;
      const avgEfficiency = recent.reduce((sum, t) => sum + t.metrics.resourceEfficiency, 0) / recent.length;
      reliability = round4(clamp(reliability * 0.6 + avgRobustness * 0.4));
      if (typeof input?.resourceScore !== 'number') {
        resourceEfficiency = round4(clamp(resourceEfficiency * 0.5 + avgEfficiency * 0.5));
      }
    }

    const components: FitnessComponents = {
      computationPerformance,
      reliability,
      cognitiveContribution,
      knowledgeContribution,
      specialization,
      experience,
      resourceEfficiency
    };

    // Parse and validate components schema
    FitnessComponentsSchema.parse(components);

    // Parse and normalize weights
    const rawWeights = {
      computationPerformance: 0.15,
      reliability: 0.15,
      cognitiveContribution: 0.15,
      knowledgeContribution: 0.15,
      specialization: 0.10,
      experience: 0.15,
      resourceEfficiency: 0.15,
      ...input?.weights
    };
    const sumWeights = Object.values(rawWeights).reduce((a, b) => a + b, 0);
    const weights: FitnessWeights = {
      computationPerformance: rawWeights.computationPerformance / sumWeights,
      reliability: rawWeights.reliability / sumWeights,
      cognitiveContribution: rawWeights.cognitiveContribution / sumWeights,
      knowledgeContribution: rawWeights.knowledgeContribution / sumWeights,
      specialization: rawWeights.specialization / sumWeights,
      experience: rawWeights.experience / sumWeights,
      resourceEfficiency: rawWeights.resourceEfficiency / sumWeights
    };
    FitnessWeightsSchema.parse(weights);

    const overallFitness = round4(clamp(
      components.computationPerformance * weights.computationPerformance +
      components.reliability * weights.reliability +
      components.cognitiveContribution * weights.cognitiveContribution +
      components.knowledgeContribution * weights.knowledgeContribution +
      components.specialization * weights.specialization +
      components.experience * weights.experience +
      components.resourceEfficiency * weights.resourceEfficiency
    ));

    const evaluatedAt = input?.timestamp ?? genome.createdAt ?? '2026-01-01T00:00:00.000Z';

    const deterministicIdentity = computeDeterministicHash({
      cellId: activeCell.nodeId,
      genomeId: genome.genomeId,
      generation: genome.generation,
      components,
      overallFitness
    });

    const state: FitnessState = {
      cellId: activeCell.nodeId,
      genomeId: genome.genomeId,
      generation: genome.generation,
      components,
      overallFitness,
      evaluatedAt,
      deterministicIdentity,
      metadata: input?.metadata ?? {}
    };

    return FitnessStateSchema.parse(state);
  }

  /**
   * Computes deterministic, bounded, small-step mutations on a Cell's genome.
   * Only allowed traits and specialization can be modified.
   */
  public mutate(
    options: MutationOptions,
    targetCell?: Cell
  ): { mutations: Mutation[]; evolvedGenome: CellGenome } {
    const activeCell = targetCell || this.cell;
    if (!activeCell) {
      throw new Error('EvolutionEngine: No active Cell provided for mutation');
    }

    if (!options.seed || typeof options.seed !== 'string' || options.seed.trim().length === 0) {
      throw new Error('Security Violation: Deterministic mutation requires a non-empty seed. Unseeded mutations are forbidden.');
    }

    // Verify authorized mutation targets
    if (options.targetKeys && options.targetKeys.length > 0) {
      for (const target of options.targetKeys) {
        if (!isMutationTargetAllowed(target)) {
          throw new Error(`Security Violation: Unauthorized mutation target '${target}'. Only existing traits and specialization may mutate.`);
        }
      }
    }

    const currentGenome = activeCell.genome;
    // Snapshot current genome for rollback capability
    this.genomeSnapshots.set(currentGenome.genomeId, currentGenome);

    const maxStepSize = typeof options.maxStepSize === 'number' && options.maxStepSize > 0
      ? Math.min(0.2, options.maxStepSize)
      : 0.05;

    // Determine target keys to mutate: specified or deterministically derived
    let targetsToMutate: MutationTarget[];
    if (options.targetKeys && options.targetKeys.length > 0) {
      targetsToMutate = [...options.targetKeys];
    } else {
      // Pick 1-2 traits deterministically based on seed
      const pickIdx1 = Math.floor(seededFloat(options.seed, 0) * ALLOWED_MUTATION_TARGETS.length);
      targetsToMutate = [ALLOWED_MUTATION_TARGETS[pickIdx1]];
    }

    const updatedTraits = { ...currentGenome.traits };
    let updatedSpecialization = currentGenome.specialization;
    const mutations: Mutation[] = [];

    const now = options.timestamp ?? new Date().toISOString();

    for (let i = 0; i < targetsToMutate.length; i++) {
      const targetKey = targetsToMutate[i];
      const u = seededFloat(options.seed, i + 1);

      if (targetKey === 'traits.mutationRate') {
        const prev = updatedTraits.mutationRate;
        // Step in [-maxStepSize, +maxStepSize]
        const step = (u - 0.5) * 2 * maxStepSize;
        const next = round4(clamp(prev + step, 0.0, 1.0));
        const delta = round4(next - prev);
        updatedTraits.mutationRate = next;

        const mutHash = computeDeterministicHash({ seed: options.seed, targetKey, prev, next, delta });
        const mutation: Mutation = {
          mutationId: `mut_${mutHash.slice(0, 16)}`,
          targetKey,
          previousValue: prev,
          newValue: next,
          delta,
          seed: options.seed,
          appliedAt: now,
          reason: options.reason ?? 'Deterministic bounded trait mutation',
          deterministicHash: mutHash
        };
        mutations.push(MutationSchema.parse(mutation));
      } else if (targetKey === 'traits.riskTolerance') {
        const prev = updatedTraits.riskTolerance;
        const step = (u - 0.5) * 2 * maxStepSize;
        const next = round4(clamp(prev + step, 0.0, 1.0));
        const delta = round4(next - prev);
        updatedTraits.riskTolerance = next;

        const mutHash = computeDeterministicHash({ seed: options.seed, targetKey, prev, next, delta });
        const mutation: Mutation = {
          mutationId: `mut_${mutHash.slice(0, 16)}`,
          targetKey,
          previousValue: prev,
          newValue: next,
          delta,
          seed: options.seed,
          appliedAt: now,
          reason: options.reason ?? 'Deterministic bounded trait mutation',
          deterministicHash: mutHash
        };
        mutations.push(MutationSchema.parse(mutation));
      } else if (targetKey === 'traits.explorationVsExploitation') {
        const prev = updatedTraits.explorationVsExploitation;
        const step = (u - 0.5) * 2 * maxStepSize;
        const next = round4(clamp(prev + step, 0.0, 1.0));
        const delta = round4(next - prev);
        updatedTraits.explorationVsExploitation = next;

        const mutHash = computeDeterministicHash({ seed: options.seed, targetKey, prev, next, delta });
        const mutation: Mutation = {
          mutationId: `mut_${mutHash.slice(0, 16)}`,
          targetKey,
          previousValue: prev,
          newValue: next,
          delta,
          seed: options.seed,
          appliedAt: now,
          reason: options.reason ?? 'Deterministic bounded trait mutation',
          deterministicHash: mutHash
        };
        mutations.push(MutationSchema.parse(mutation));
      } else if (targetKey === 'traits.maxCognitiveCycleDepth') {
        const prev = updatedTraits.maxCognitiveCycleDepth;
        // Step +/- 1
        const step = u < 0.5 ? -1 : 1;
        const next = Math.max(1, prev + step);
        const delta = next - prev;
        updatedTraits.maxCognitiveCycleDepth = next;

        const mutHash = computeDeterministicHash({ seed: options.seed, targetKey, prev, next, delta });
        const mutation: Mutation = {
          mutationId: `mut_${mutHash.slice(0, 16)}`,
          targetKey,
          previousValue: prev,
          newValue: next,
          delta,
          seed: options.seed,
          appliedAt: now,
          reason: options.reason ?? 'Deterministic bounded trait mutation',
          deterministicHash: mutHash
        };
        mutations.push(MutationSchema.parse(mutation));
      } else if (targetKey === 'specialization') {
        const prev = updatedSpecialization;
        let next: string | null;
        if (options.customSpecialization !== undefined) {
          next = options.customSpecialization;
        } else {
          const specPool = ['OSINT_ANALYST', 'COGNITIVE_REASONER', 'SWARM_COORDINATOR', 'METABOLIC_INDEXER', 'KNOWLEDGE_DISCOVERY'];
          const specIdx = Math.floor(u * specPool.length);
          next = specPool[specIdx];
        }
        updatedSpecialization = next;

        const mutHash = computeDeterministicHash({ seed: options.seed, targetKey, prev, next });
        const mutation: Mutation = {
          mutationId: `mut_${mutHash.slice(0, 16)}`,
          targetKey,
          previousValue: prev,
          newValue: next,
          delta: null,
          seed: options.seed,
          appliedAt: now,
          reason: options.reason ?? 'Deterministic specialization mutation',
          deterministicHash: mutHash
        };
        mutations.push(MutationSchema.parse(mutation));
      }
    }

    // Build evolved genome with deterministic ID derived from parent + seed
    const newGenomeId = `gen_${computeDeterministicHash({
      parentGenomeId: currentGenome.genomeId,
      seed: options.seed,
      mutations: mutations.map(m => m.deterministicHash)
    }).slice(0, 24)}`;

    const candidateRaw = {
      genomeId: newGenomeId,
      parentGenomeId: currentGenome.genomeId,
      parentCellId: activeCell.nodeId,
      generation: currentGenome.generation,
      lineageId: currentGenome.lineageId,
      createdAt: now,
      logicVersion: currentGenome.logicVersion,
      traits: updatedTraits,
      capabilities: [...currentGenome.capabilities],
      specialization: updatedSpecialization,
      genomeVersion: currentGenome.genomeVersion + 1,
      ancestorGenomeIds: [...(currentGenome.ancestorGenomeIds || []), currentGenome.genomeId],
      ancestorCellIds: [...(currentGenome.ancestorCellIds || []), activeCell.nodeId]
    };

    const validation = validateGenome(candidateRaw);
    if (!validation.valid || !validation.genome) {
      throw new Error(`EvolutionEngine: Evolved genome validation failed: ${validation.errors?.join(', ')}`);
    }

    const evolvedGenome = deepFreeze(validation.genome);
    logger.info(COMPONENT, 'mutation_computed', {
      cellId: activeCell.nodeId,
      seed: options.seed,
      mutationCount: mutations.length,
      evolvedGenomeId: evolvedGenome.genomeId
    });

    return { mutations, evolvedGenome };
  }

  /**
   * Reverts an individual mutation on a genome.
   */
  public revertMutation(genome: CellGenome, mutation: Mutation): CellGenome {
    const updatedTraits = { ...genome.traits };
    let updatedSpecialization = genome.specialization;

    if (mutation.targetKey === 'traits.mutationRate') {
      updatedTraits.mutationRate = mutation.previousValue as number;
    } else if (mutation.targetKey === 'traits.riskTolerance') {
      updatedTraits.riskTolerance = mutation.previousValue as number;
    } else if (mutation.targetKey === 'traits.explorationVsExploitation') {
      updatedTraits.explorationVsExploitation = mutation.previousValue as number;
    } else if (mutation.targetKey === 'traits.maxCognitiveCycleDepth') {
      updatedTraits.maxCognitiveCycleDepth = mutation.previousValue as number;
    } else if (mutation.targetKey === 'specialization') {
      updatedSpecialization = mutation.previousValue as string | null;
    }

    const candidateRaw = {
      ...genome,
      genomeId: `gen_rev_${computeDeterministicHash({ original: genome.genomeId, mutationId: mutation.mutationId }).slice(0, 20)}`,
      traits: updatedTraits,
      specialization: updatedSpecialization,
      genomeVersion: genome.genomeVersion + 1
    };

    const validation = validateGenome(candidateRaw);
    if (!validation.valid || !validation.genome) {
      throw new Error(`EvolutionEngine: Failed to revert mutation: ${validation.errors?.join(', ')}`);
    }

    return deepFreeze(validation.genome);
  }

  /**
   * Executes a complete Evolution Cycle:
   * Cell State → Evaluation → Fitness → Mutation → Evolution Event
   */
  public executeEvolutionCycle(
    options: EvolutionCycleOptions,
    targetCell?: Cell
  ): EvolutionEvent {
    const activeCell = targetCell || this.cell;
    if (!activeCell) {
      throw new Error('EvolutionEngine: No active Cell provided for evolution cycle');
    }

    const timestamp = options.timestamp ?? new Date().toISOString();

    // 1. Evaluate pre-mutation fitness
    const previousFitness = this.evaluateFitness(activeCell, {
      ...options.evaluationInput,
      timestamp
    });

    // Save pre-mutation genome to snapshots for rollback
    this.genomeSnapshots.set(activeCell.genome.genomeId, activeCell.genome);

    // 2. Compute deterministic mutation
    const { mutations, evolvedGenome } = this.mutate({
      seed: options.seed,
      ...options.mutationOptions,
      timestamp
    }, activeCell);

    // 3. Apply mutated genome to active Cell
    activeCell.restoreGenome(evolvedGenome);
    if (evolvedGenome.specialization !== activeCell.cognitiveState.getSpecialization()) {
      activeCell.cognitiveState.setSpecialization(evolvedGenome.specialization);
    }

    // 4. Evaluate post-mutation fitness
    const currentFitness = this.evaluateFitness(activeCell, {
      ...options.evaluationInput,
      timestamp
    });

    // 5. Construct immutable Evolution Event
    const eventPayload = {
      cellId: activeCell.nodeId,
      lineageId: evolvedGenome.lineageId,
      generation: evolvedGenome.generation,
      previousGenomeId: previousFitness.genomeId,
      newGenomeId: evolvedGenome.genomeId,
      previousFitness,
      currentFitness,
      mutations,
      timestamp,
      provenance: [activeCell.nodeId, previousFitness.genomeId, evolvedGenome.genomeId],
      status: EvolutionEventStatus.APPLIED
    };

    const deterministicHash = computeDeterministicHash(eventPayload);
    const eventId = `evo_${deterministicHash.slice(0, 20)}`;

    const event: EvolutionEvent = {
      eventId,
      ...eventPayload,
      deterministicHash
    };

    const validatedEvent = EvolutionEventSchema.parse(event);
    this.events.set(validatedEvent.eventId, validatedEvent);

    logger.info(COMPONENT, 'evolution_cycle_executed', {
      eventId: validatedEvent.eventId,
      cellId: activeCell.nodeId,
      mutations: mutations.length,
      prevFitness: previousFitness.overallFitness,
      currFitness: currentFitness.overallFitness
    });

    return validatedEvent;
  }

  /**
   * Rolls back an applied evolution event to restore prior Cell genome state.
   */
  public rollbackEvent(eventId: string, targetCell?: Cell): EvolutionEvent {
    const activeCell = targetCell || this.cell;
    if (!activeCell) {
      throw new Error('EvolutionEngine: No active Cell provided for event rollback');
    }

    const event = this.events.get(eventId);
    if (!event) {
      throw new Error(`EvolutionEngine: Evolution event '${eventId}' not found`);
    }

    if (event.status === EvolutionEventStatus.REVERTED) {
      throw new Error(`EvolutionEngine: Evolution event '${eventId}' is already reverted`);
    }

    // Retrieve previous genome snapshot
    const priorGenome = this.genomeSnapshots.get(event.previousGenomeId);
    if (!priorGenome) {
      throw new Error(`EvolutionEngine: Previous genome snapshot '${event.previousGenomeId}' not found for rollback`);
    }

    // Restore prior genome
    activeCell.restoreGenome(priorGenome);
    if (priorGenome.specialization !== activeCell.cognitiveState.getSpecialization()) {
      activeCell.cognitiveState.setSpecialization(priorGenome.specialization);
    }

    // Mark event as reverted
    const updatedEvent: EvolutionEvent = {
      ...event,
      status: EvolutionEventStatus.REVERTED
    };

    this.events.set(eventId, updatedEvent);
    logger.info(COMPONENT, 'evolution_event_rolled_back', { eventId, cellId: activeCell.nodeId });

    return updatedEvent;
  }

  public getEvents(): EvolutionEvent[] {
    return Array.from(this.events.values());
  }

  public getEvent(eventId: string): EvolutionEvent | undefined {
    return this.events.get(eventId);
  }

  public getLatestEvent(): EvolutionEvent | undefined {
    const all = this.getEvents();
    return all.length > 0 ? all[all.length - 1] : undefined;
  }

  public recordComputationTelemetry(telemetry: ComputationFeedbackTelemetry): void {
    ComputationFeedbackTelemetrySchema.parse(telemetry);
    const existing = this.computationTelemetries.get(telemetry.cellId) || [];
    existing.push(Object.freeze({ ...telemetry }));
    this.computationTelemetries.set(telemetry.cellId, existing);
  }

  public getComputationTelemetry(cellId?: string): ComputationFeedbackTelemetry[] {
    if (cellId) {
      return [...(this.computationTelemetries.get(cellId) || [])];
    }
    const all: ComputationFeedbackTelemetry[] = [];
    for (const list of this.computationTelemetries.values()) {
      all.push(...list);
    }
    return all;
  }

  /**
   * P07: Extracts canonical evolutionary telemetry from an episodic Experience and
   * optional ontogenetic CognitiveDevelopmentResult.
   * Enforces mathematical separation: Experience -> Learning Signal -> Evolution Telemetry.
   */
  public extractTelemetryFromExperience(
    experience: Experience,
    learningResult?: CognitiveDevelopmentResult,
    context?: { resourceScore?: number; operationalConfidence?: number },
    targetCell?: Cell
  ): ExperienceFeedbackTelemetry {
    const activeCell = targetCell || this.cell;
    if (!activeCell) {
      throw new Error('EvolutionEngine: No active Cell provided for telemetry extraction');
    }

    const cellId = activeCell.nodeId;
    const lineageId = activeCell.lineage?.lineageId || (activeCell as any).lineageId || 'lineage_default';
    const generation = activeCell.genome?.generation ?? 0;

    // 1. taskOutcome
    const taskOutcome = experience.outcome;

    // 2. predictionAccuracy [0.0, 1.0]
    let predictionAccuracy = 0.5;
    if (experience.verificationStatus === 'CONFIRMED_BY_WORLD') {
      predictionAccuracy = 1.0;
    } else if (experience.verificationStatus === 'CONTRADICTED_BY_WORLD') {
      predictionAccuracy = 0.0;
    } else if (experience.verificationStatus === 'VERIFIED') {
      predictionAccuracy = 0.9;
    } else if (experience.verificationStatus === 'UNVERIFIED') {
      predictionAccuracy = 0.5;
    } else if (experience.outcome === MetabolismStatus.ACCEPTED) {
      predictionAccuracy = round4(clamp(1.0 - (experience.noveltyScore ?? 0.3) * 0.4));
    } else {
      predictionAccuracy = 0.1;
    }

    // 3. verificationResult
    const verificationResult = experience.verificationStatus ||
      (experience.outcome === MetabolismStatus.ACCEPTED ? 'CONFIRMED' : 'REJECTED');

    // 4. confidenceChange [-1.0, 1.0]
    let confidenceChange = 0.0;
    const isFailure = experience.outcome === MetabolismStatus.REJECTED ||
      experience.outcome === MetabolismStatus.FAILED ||
      experience.verificationStatus === 'CONTRADICTED_BY_WORLD';

    if (isFailure) {
      confidenceChange = -0.35;
    } else if (experience.verificationStatus === 'CONFIRMED_BY_WORLD' || experience.outcome === MetabolismStatus.ACCEPTED) {
      confidenceChange = 0.20;
    }

    // 5. repeatedFailure
    const currentFailures = this.consecutiveFailures.get(cellId) || 0;
    const repeatedFailure = isFailure ? currentFailures + 1 : 0;

    // 6. adaptation (ontogenetic plastic changes)
    const conceptsAdapted = (learningResult?.conceptsStrengthened.length || 0) + (learningResult?.conceptsWeakened.length || 0);
    const relationsAdapted = (learningResult?.relationsStrengthened.length || 0) + (learningResult?.relationsWeakened.length || 0);
    const conflictsDetected = learningResult?.conflictsDetected || (experience.verificationStatus === 'CONTRADICTED_BY_WORLD' ? 1 : 0);
    const adaptationMagnitude = round4(clamp(
      (conceptsAdapted + relationsAdapted) * 0.1 + (conflictsDetected > 0 ? 0.3 : 0.0)
    ));

    // 7. resourceEfficiency [0.0, 1.0]
    let resourceEfficiency = 0.8;
    if (typeof context?.resourceScore === 'number') {
      resourceEfficiency = clamp(context.resourceScore);
    } else if (activeCell.collectiveComputation) {
      resourceEfficiency = round4(clamp(activeCell.collectiveComputation.getCellComputeCapacity(activeCell).availability));
    }

    // 8. robustness [0.0, 1.0]
    const robustness = round4(clamp(1.0 - conflictsDetected * 0.25));

    // 9. knowledgeOutcome
    const conceptsCount = activeCell.cognitiveGraph ? activeCell.cognitiveGraph.getAllConcepts().length : 0;
    const relationsCount = activeCell.cognitiveGraph ? activeCell.cognitiveGraph.getAllRelations().length : 0;
    const lessonsCount = experience.lessonsDerived ? experience.lessonsDerived.length : 0;

    const metrics: ExperienceEvolutionMetrics = {
      taskOutcome,
      predictionAccuracy,
      verificationResult,
      confidenceChange,
      repeatedFailure,
      adaptation: {
        conceptsAdapted,
        relationsAdapted,
        conflictsDetected,
        adaptationMagnitude
      },
      resourceEfficiency,
      robustness,
      knowledgeOutcome: {
        conceptsCount,
        relationsCount,
        lessonsCount
      }
    };

    // Experience fitness score [0.0, 1.0]
    const outcomeScore = isFailure ? 0.1 : (experience.confidence ?? 0.8);
    const experienceFitnessScore = round4(clamp(
      predictionAccuracy * 0.30 +
      robustness * 0.25 +
      resourceEfficiency * 0.20 +
      outcomeScore * 0.25
    ));

    const timestamp = new Date().toISOString();
    const hashData = {
      cellId,
      lineageId,
      generation,
      experienceId: experience.experienceId,
      learningId: learningResult ? `learn_${experience.experienceId}` : undefined,
      metrics,
      experienceFitnessScore,
      timestamp
    };
    const deterministicHash = createHash('sha256').update(JSON.stringify(hashData)).digest('hex');
    const telemetryId = `telem_exp_${deterministicHash.substring(0, 24)}`;

    const provenance = Array.from(new Set([
      cellId,
      experience.experienceId,
      ...((experience as any).provenance || []),
      'EXPERIENCE_EVOLUTION_TELEMETRY'
    ]));

    const telemetry: ExperienceFeedbackTelemetry = {
      telemetryId,
      cellId,
      lineageId,
      generation,
      experienceId: experience.experienceId,
      learningId: learningResult ? `learn_${experience.experienceId}` : undefined,
      metrics,
      experienceFitnessScore,
      timestamp,
      provenance,
      deterministicHash
    };

    return ExperienceFeedbackTelemetrySchema.parse(telemetry);
  }

  /**
   * P07: Records experience evolutionary telemetry.
   * Telemetry is accumulated for phylogenetic evaluation without mutating the genome immediately.
   */
  public async recordExperienceTelemetry(
    telemetry: ExperienceFeedbackTelemetry,
    persistToMemory = true
  ): Promise<void> {
    ExperienceFeedbackTelemetrySchema.parse(telemetry);

    const existing = this.experienceTelemetries.get(telemetry.cellId) || [];
    existing.push(Object.freeze({ ...telemetry }));
    this.experienceTelemetries.set(telemetry.cellId, existing);

    // Update consecutive failures tracking
    const isFailure = telemetry.metrics.taskOutcome === MetabolismStatus.REJECTED ||
      telemetry.metrics.taskOutcome === MetabolismStatus.FAILED ||
      telemetry.metrics.verificationResult === 'CONTRADICTED_BY_WORLD';

    if (isFailure) {
      const current = this.consecutiveFailures.get(telemetry.cellId) || 0;
      this.consecutiveFailures.set(telemetry.cellId, current + 1);
    } else {
      this.consecutiveFailures.set(telemetry.cellId, 0);
    }

    // Persist to cell memory if available
    const activeCell = this.cell;
    const store = (activeCell as any)?.memory || (activeCell as any)?.memoryStore;
    if (persistToMemory && store && typeof store.put === 'function') {
      try {
        await store.put({
          id: `telem_exp_${telemetry.telemetryId.replace(/[^a-zA-Z0-9_]/g, '')}`,
          cellId: telemetry.cellId,
          category: MemoryCategory.PROCEDURAL,
          type: 'experience_evolution_telemetry',
          content: telemetry,
          hash: telemetry.deterministicHash,
          provenance: telemetry.provenance,
          source: 'evolution_engine',
          createdAt: telemetry.timestamp,
          updatedAt: telemetry.timestamp,
          confidence: telemetry.experienceFitnessScore
        });
      } catch (err) {
        logger.warn(COMPONENT, 'failed_to_persist_experience_telemetry', {
          telemetryId: telemetry.telemetryId,
          error: (err as Error).message
        });
      }
    }
  }

  /**
   * Returns all recorded experience evolutionary telemetries for a cell or all cells.
   */
  public getExperienceTelemetry(cellId?: string): ExperienceFeedbackTelemetry[] {
    if (cellId) {
      return [...(this.experienceTelemetries.get(cellId) || [])];
    }
    const all: ExperienceFeedbackTelemetry[] = [];
    for (const list of this.experienceTelemetries.values()) {
      all.push(...list);
    }
    return all;
  }

  /**
   * Returns current consecutive failure count for cell.
   */
  public getConsecutiveFailures(cellId?: string): number {
    const id = cellId || this.cell?.nodeId;
    return id ? (this.consecutiveFailures.get(id) || 0) : 0;
  }

  /**
   * Resets consecutive failure count for cell.
   */
  public resetConsecutiveFailures(cellId?: string): void {
    const id = cellId || this.cell?.nodeId;
    if (id) {
      this.consecutiveFailures.set(id, 0);
    }
  }

  /**
   * P07: Evaluates whether an evolution cycle is warranted based on accumulated telemetry
   * and bounded policy triggers.
   * Guarantees that NOT every experience results in a mutation.
   */
  public evaluateEvolutionWarrant(
    targetCell?: Cell,
    policyConfig?: Partial<EvolutionTriggerPolicy>
  ): EvolutionWarrantEvaluation {
    const activeCell = targetCell || this.cell;
    if (!activeCell) {
      throw new Error('EvolutionEngine: No active Cell for warrant evaluation');
    }

    const policy = EvolutionTriggerPolicySchema.parse(policyConfig || {});
    const cellId = activeCell.nodeId;
    const telemetries = this.experienceTelemetries.get(cellId) || [];
    const consecutiveFailures = this.consecutiveFailures.get(cellId) || 0;
    const now = Date.now();
    const lastCycle = this.lastEvolutionTimestamp.get(cellId) || 0;

    const cellFitness = this.evaluateFitness(activeCell).overallFitness;
    const avgFitness = telemetries.length > 0
      ? round4(telemetries.reduce((sum, t) => sum + t.experienceFitnessScore, 0) / telemetries.length)
      : cellFitness;

    const timestamp = new Date().toISOString();

    if (!policy.enabled) {
      return {
        warranted: false,
        reason: 'Evolution trigger policy is disabled',
        triggerType: EvolutionTriggerType.NONE,
        telemetryCount: telemetries.length,
        consecutiveFailures,
        averageFitnessScore: avgFitness,
        evaluatedAt: timestamp
      };
    }

    // Cooldown check: prevent thrashing
    if (now - lastCycle < policy.minCooldownMs) {
      return {
        warranted: false,
        reason: `Evolution in cooldown (${now - lastCycle}ms < ${policy.minCooldownMs}ms)`,
        triggerType: EvolutionTriggerType.NONE,
        telemetryCount: telemetries.length,
        consecutiveFailures,
        averageFitnessScore: avgFitness,
        evaluatedAt: timestamp
      };
    }

    // Trigger Condition 1: Severe repeated failure (phylogenetic intervention required)
    if (consecutiveFailures >= policy.maxConsecutiveFailures) {
      return {
        warranted: true,
        reason: `Threshold of repeated failures reached (${consecutiveFailures} >= ${policy.maxConsecutiveFailures})`,
        triggerType: EvolutionTriggerType.CONSECUTIVE_FAILURES,
        telemetryCount: telemetries.length,
        consecutiveFailures,
        averageFitnessScore: avgFitness,
        evaluatedAt: timestamp
      };
    }

    // Trigger Condition 2: Telemetry accumulation window
    if (telemetries.length >= policy.minTelemetryCount) {
      // Check significant fitness drop
      if (cellFitness - avgFitness >= policy.fitnessDropThreshold) {
        return {
          warranted: true,
          reason: `Significant fitness drop detected (${round4(cellFitness - avgFitness)} >= ${policy.fitnessDropThreshold})`,
          triggerType: EvolutionTriggerType.FITNESS_DROP,
          telemetryCount: telemetries.length,
          consecutiveFailures,
          averageFitnessScore: avgFitness,
          evaluatedAt: timestamp
        };
      }

      // Check adaptation plateau / batch accumulation limit
      if (telemetries.length >= policy.adaptationPlateauThreshold) {
        return {
          warranted: true,
          reason: `Adaptation batch epoch reached (${telemetries.length} telemetries accumulated)`,
          triggerType: EvolutionTriggerType.TELEMETRY_WINDOW,
          telemetryCount: telemetries.length,
          consecutiveFailures,
          averageFitnessScore: avgFitness,
          evaluatedAt: timestamp
        };
      }
    }

    return {
      warranted: false,
      reason: 'Evolution bounds not exceeded; maintaining current genomic configuration',
      triggerType: EvolutionTriggerType.NONE,
      telemetryCount: telemetries.length,
      consecutiveFailures,
      averageFitnessScore: avgFitness,
      evaluatedAt: timestamp
    };
  }

  /**
   * P07: Triggers an evolution cycle ONLY if warranted by the bounded policy.
   * If not warranted, returns null without modifying the genome.
   */
  public async triggerEvolutionIfWarranted(
    options: EvolutionCycleOptions & { policy?: Partial<EvolutionTriggerPolicy> },
    targetCell?: Cell
  ): Promise<EvolutionEvent | null> {
    const activeCell = targetCell || this.cell;
    if (!activeCell) {
      throw new Error('EvolutionEngine: No active Cell for evolution triggering');
    }

    const evaluation = this.evaluateEvolutionWarrant(activeCell, options.policy);
    if (!evaluation.warranted) {
      logger.debug(COMPONENT, 'evolution_cycle_not_warranted', {
        cellId: activeCell.nodeId,
        reason: evaluation.reason
      });
      return null;
    }

    logger.info(COMPONENT, 'triggering_warranted_evolution_cycle', {
      cellId: activeCell.nodeId,
      triggerType: evaluation.triggerType,
      reason: evaluation.reason
    });

    const cycleOptions: EvolutionCycleOptions = {
      ...options,
      seed: options.seed || `seed_${activeCell.nodeId}_${Date.now()}`
    };

    const event = this.executeEvolutionCycle(cycleOptions, activeCell);

    // Reset failure counter and update cooldown timer
    this.consecutiveFailures.set(activeCell.nodeId, 0);
    this.lastEvolutionTimestamp.set(activeCell.nodeId, Date.now());

    // Persist event to memory store
    const store = (activeCell as any)?.memory || (activeCell as any)?.memoryStore;
    if (store && typeof store.put === 'function') {
      try {
        await store.put({
          id: `evolution_event_${event.eventId.replace(/[^a-zA-Z0-9_]/g, '')}`,
          cellId: activeCell.nodeId,
          category: MemoryCategory.PROCEDURAL,
          type: 'evolution_event',
          content: event,
          hash: event.deterministicHash,
          provenance: [activeCell.nodeId, event.eventId],
          source: 'evolution_engine',
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
          confidence: event.currentFitness ? event.currentFitness.overallFitness : 0.5
        });
      } catch (err) {
        logger.warn(COMPONENT, 'failed_to_persist_evolution_event', {
          eventId: event.eventId,
          error: (err as Error).message
        });
      }
    }

    return event;
  }

  /**
   * Recovers persisted telemetry and events from MemoryStore into the engine state.
   */
  public async recoverTelemetry(
    memoryStore?: MemoryStore,
    targetCellId?: string
  ): Promise<number> {
    const activeCell = this.cell;
    const store = memoryStore || (activeCell as any)?.memory || (activeCell as any)?.memoryStore;
    if (!store) return 0;
    const searchFn = typeof (store as any).search === 'function'
      ? (store as any).search.bind(store)
      : typeof (store as any).query === 'function'
        ? (store as any).query.bind(store)
        : null;
    if (!searchFn) return 0;

    const cellId = targetCellId || this.cell?.nodeId;
    let recoveredCount = 0;

    try {
      const records = await searchFn({
        category: MemoryCategory.PROCEDURAL,
        type: 'experience_evolution_telemetry',
        cellId
      });

      for (const record of records) {
        if (record.content) {
          const parsed = ExperienceFeedbackTelemetrySchema.safeParse(record.content);
          if (parsed.success) {
            const list = this.experienceTelemetries.get(parsed.data.cellId) || [];
            if (!list.some(t => t.telemetryId === parsed.data.telemetryId)) {
              list.push(Object.freeze(parsed.data));
              this.experienceTelemetries.set(parsed.data.cellId, list);
              recoveredCount++;
            }
          }
        }
      }

      // Also recover evolution events if any
      const eventRecords = await searchFn({
        category: MemoryCategory.PROCEDURAL,
        type: 'evolution_event',
        cellId
      });

      for (const rec of eventRecords) {
        if (rec.content) {
          const parsed = EvolutionEventSchema.safeParse(rec.content);
          if (parsed.success && !this.events.has(parsed.data.eventId)) {
            this.events.set(parsed.data.eventId, parsed.data);
          }
        }
      }
    } catch (err) {
      logger.warn(COMPONENT, 'telemetry_recovery_failed', {
        error: (err as Error).message
      });
    }

    return recoveredCount;
  }

  /**
   * P07: Aggregates peer telemetries locally in a decentralized, cell-centric manner.
   * Guarantees: Red Queen has NO central controller; each cell computes its own
   * distributed population statistics.
   */
  public aggregatePeerTelemetry(
    peerTelemetries: ExperienceFeedbackTelemetry[]
  ): PopulationTelemetryMetrics {
    const cellIds = new Set<string>();
    const fitnessScores: number[] = [];
    let failureCount = 0;

    for (const t of peerTelemetries) {
      cellIds.add(t.cellId);
      fitnessScores.push(t.experienceFitnessScore);
      if (
        t.metrics.taskOutcome === MetabolismStatus.REJECTED ||
        t.metrics.taskOutcome === MetabolismStatus.FAILED ||
        t.metrics.verificationResult === 'CONTRADICTED_BY_WORLD'
      ) {
        failureCount++;
      }
    }

    const totalTelemetries = peerTelemetries.length;
    if (totalTelemetries === 0) {
      const emptyHash = createHash('sha256').update('empty_population').digest('hex');
      return {
        cellCount: 0,
        totalTelemetries: 0,
        averageFitness: 0.5,
        medianFitness: 0.5,
        overallFailureRate: 0.0,
        diversityScore: 1.0,
        aggregatedAt: new Date().toISOString(),
        deterministicHash: emptyHash
      };
    }

    fitnessScores.sort((a, b) => a - b);
    const sumFitness = fitnessScores.reduce((a, b) => a + b, 0);
    const averageFitness = round4(sumFitness / totalTelemetries);
    const mid = Math.floor(fitnessScores.length / 2);
    const medianFitness = fitnessScores.length % 2 !== 0
      ? fitnessScores[mid]
      : round4((fitnessScores[mid - 1] + fitnessScores[mid]) / 2);

    const overallFailureRate = round4(failureCount / totalTelemetries);

    // Variance-based diversity score
    const variance = fitnessScores.reduce((acc, val) => acc + Math.pow(val - averageFitness, 2), 0) / totalTelemetries;
    const diversityScore = round4(clamp(Math.sqrt(variance) * 2.0));

    const aggregatedAt = new Date().toISOString();
    const hashData = {
      cellCount: cellIds.size,
      totalTelemetries,
      averageFitness,
      medianFitness,
      overallFailureRate,
      diversityScore,
      aggregatedAt
    };
    const deterministicHash = createHash('sha256').update(JSON.stringify(hashData)).digest('hex');

    return PopulationTelemetryMetricsSchema.parse({
      cellCount: cellIds.size,
      totalTelemetries,
      averageFitness,
      medianFitness,
      overallFailureRate,
      diversityScore,
      aggregatedAt,
      deterministicHash
    });
  }

  /**
   * P09: Evolution -> Mitosis Causal Bridge
   * Evaluates if this Cell is eligible for reproduction based on:
   * 1. Parent identity & lineage
   * 2. Evolutionary fitness & accumulated experience telemetries
   * 3. Memory pressure & operational metrics
   * 4. GovernanceEnforcer policy validation (ceiling, cooldown, state, authorization)
   */
  public evaluateReproductionEligibility(
    options: ReproductionEligibilityOptions = {},
    targetCell?: Cell
  ): ReproductionWarrant {
    const activeCell = targetCell || this.cell;
    if (!activeCell) {
      throw new Error('EvolutionEngine: evaluateReproductionEligibility requires an active Cell context');
    }

    const parentCellId = activeCell.nodeId;
    const parentGenomeId = activeCell.genome.genomeId;
    const lineageId = activeCell.genome.lineageId;
    const generation = activeCell.genome.generation;
    const ancestorCellIds = [...(activeCell.genome.ancestorCellIds || [])];

    // Evaluate current fitness
    const fitnessState = this.evaluateFitness(activeCell);
    const overallFitness = fitnessState.overallFitness;

    // Retrieve accumulated telemetries
    const telemetries = this.experienceTelemetries.get(parentCellId) || [];
    const telemetryCount = telemetries.length;
    const averageFitness = telemetryCount > 0
      ? round4(telemetries.reduce((acc, t) => acc + t.experienceFitnessScore, 0) / telemetryCount)
      : overallFitness;
    const consecutiveFailures = this.consecutiveFailures.get(parentCellId) || 0;

    // Operational confidence
    const operationalConfidence = activeCell.cognitiveState
      ? clamp(activeCell.cognitiveState.getState().operationalConfidence)
      : 1.0;

    // Memory pressure
    let memoryPressure = options.memoryPressure;
    if (memoryPressure === undefined) {
      // derive from memory store or default
      memoryPressure = 0.8;
    }
    memoryPressure = clamp(memoryPressure);

    // Reproduction pressure composite
    const reproductionPressure = round4(
      clamp(memoryPressure * 0.4 + overallFitness * 0.4 + clamp(1.0 - consecutiveFailures / 5.0) * 0.2)
    );

    const evidence: ReproductionEligibilityEvidence = {
      telemetryCount,
      averageFitness,
      overallFitness,
      memoryPressure,
      consecutiveFailures,
      operationalConfidence,
      specialization: activeCell.genome.specialization,
      reproductionPressure
    };

    // Governance Policy validation
    const governance = activeCell.governance;
    const governancePolicy = governance.getPolicy();
    const currentPopulation = options.currentPopulation ?? 1;
    const populationCeiling = governancePolicy.populationCeiling;
    const minMemoryPressure = options.minMemoryPressure ?? governancePolicy.minMemoryPressure;
    const cooldownMs = governancePolicy.cooldownMs;

    const parentActive = activeCell.lifecycleState === CellState.ACTIVE;
    const populationWithinCeiling = currentPopulation < populationCeiling;

    // Check cooldown
    const parentMetadata = activeCell.cognitiveState ? activeCell.cognitiveState.getAllMetadata() : {};
    const now = options.timestamp ? new Date(options.timestamp).getTime() : Date.now();
    let cooldownPassed = true;
    let cooldownRemainingMs = 0;
    const lastReproStr = parentMetadata['lastReproductionTimestamp'];
    if (lastReproStr) {
      const lastRepro = parseInt(lastReproStr, 10);
      if (!isNaN(lastRepro)) {
        const elapsed = now - lastRepro;
        if (elapsed < cooldownMs) {
          cooldownPassed = false;
          cooldownRemainingMs = cooldownMs - elapsed;
        }
      }
    }

    const memoryPressureMet = memoryPressure >= minMemoryPressure;

    // Authorization verification
    const eventId = options.reproductionSeed || ((options.authorizationProof as any)?.payload?.eventId) || `evt_eval_${Date.now()}`;
    let authorizationVerified = true;
    let verificationState: string | undefined = undefined;

    if (governancePolicy.requireAuthorization) {
      const authResult = governance.verifyAuthorizationProof(options.authorizationProof, parentCellId, eventId, now);
      authorizationVerified = authResult.valid;
      verificationState = authResult.state;
    }

    // Call governance.validateReproduction
    const policyResult = governance.validateReproduction(
      activeCell.lifecycleState,
      parentMetadata,
      currentPopulation,
      memoryPressure,
      eventId,
      parentCellId,
      options.authorizationProof,
      now
    );

    const policyConditions: ReproductionPolicyConditions = {
      parentActive,
      populationWithinCeiling,
      currentPopulation,
      populationCeiling,
      cooldownPassed,
      cooldownRemainingMs,
      memoryPressureMet,
      memoryPressure,
      minMemoryPressure,
      authorizationVerified
    };

    const policyDecision: ReproductionPolicyDecision = {
      allowed: policyResult.allowed,
      reason: policyResult.reason,
      verificationState: policyResult.verificationState || verificationState,
      conditions: policyConditions
    };

    // Overall eligibility evaluation
    const minFitnessThreshold = options.minFitnessThreshold ?? 0.50;
    const minTelemetryCount = options.minTelemetryCount ?? 0;

    let isEligible = true;
    let reason: ReproductionTriggerReason = ReproductionTriggerReason.REPRODUCTION_ELIGIBLE_FITNESS_AND_PRESSURE_MET;

    if (!parentActive) {
      isEligible = false;
      reason = ReproductionTriggerReason.PARENT_INACTIVE;
    } else if (!policyDecision.allowed) {
      isEligible = false;
      if (policyDecision.reason?.includes('ceiling')) {
        reason = ReproductionTriggerReason.POPULATION_CEILING_REACHED;
      } else if (policyDecision.reason?.includes('cooldown')) {
        reason = ReproductionTriggerReason.REPRODUCTION_COOLDOWN_ACTIVE;
      } else if (policyDecision.reason?.includes('memory')) {
        reason = ReproductionTriggerReason.MEMORY_PRESSURE_REPRODUCTION_THRESHOLD;
      } else if (policyDecision.reason?.includes('authorization') || policyDecision.reason?.includes('creator')) {
        reason = ReproductionTriggerReason.UNAUTHORIZED;
      } else {
        reason = ReproductionTriggerReason.POLICY_DISALLOWED;
      }
    } else if (overallFitness < minFitnessThreshold) {
      isEligible = false;
      reason = ReproductionTriggerReason.INSUFFICIENT_FITNESS;
    } else if (telemetryCount < minTelemetryCount) {
      isEligible = false;
      reason = ReproductionTriggerReason.INSUFFICIENT_TELEMETRY;
    }

    // Specialization recommendation
    let recommendedSpecializationBias = options.specializationBias;
    if (!recommendedSpecializationBias && governancePolicy.allowDifferentiation) {
      if (fitnessState.components.computationPerformance > 0.8) {
        recommendedSpecializationBias = 'COMPUTE_OPTIMIZED';
      } else if (fitnessState.components.knowledgeContribution > 0.8) {
        recommendedSpecializationBias = 'KNOWLEDGE_SYNTHESIZER';
      } else if (fitnessState.components.reliability > 0.8) {
        recommendedSpecializationBias = 'ROBUST_STABILIZER';
      }
    }

    const evaluatedAt = options.timestamp || new Date(now).toISOString();
    const hashSeed = {
      parentCellId,
      parentGenomeId,
      lineageId,
      generation,
      isEligible,
      reason,
      overallFitness,
      memoryPressure,
      currentPopulation,
      evaluatedAt
    };
    const deterministicHash = createHash('sha256').update(JSON.stringify(hashSeed)).digest('hex');
    const warrantId = `warrant_${deterministicHash.substring(0, 24)}`;

    return ReproductionWarrantSchema.parse({
      warrantId,
      parentCellId,
      parentGenomeId,
      lineageId,
      generation,
      ancestorCellIds,
      isEligible,
      reason,
      evidence,
      policyDecision,
      recommendedSpecializationBias,
      evaluatedAt,
      deterministicHash
    });
  }

  /**
   * P09: Executes causal reproduction if warrant is eligible and governance permits.
   */
  public async triggerReproductionIfEligible(
    options: ReproductionEligibilityOptions & Record<string, any> = {},
    targetCell?: Cell
  ): Promise<CausalReproductionResult> {
    const activeCell = targetCell || this.cell;
    if (!activeCell) {
      throw new Error('EvolutionEngine: triggerReproductionIfEligible requires an active Cell context');
    }

    const warrant = this.evaluateReproductionEligibility(options, activeCell);
    if (!warrant.isEligible) {
      logger.warn(COMPONENT, `Reproduction not warranted for cell ${activeCell.nodeId}: ${warrant.reason}`, {
        warrantId: warrant.warrantId,
        policyReason: warrant.policyDecision.reason
      });
      return {
        eligible: false,
        warrant,
        result: null,
        child: null
      };
    }

    logger.info(COMPONENT, `Causal reproduction triggered for cell ${activeCell.nodeId} under warrant ${warrant.warrantId}`);

    const mitosisOptions = {
      ...options,
      specializationBias: warrant.recommendedSpecializationBias || options.specializationBias,
      seed: options.reproductionSeed || warrant.warrantId,
      authorizationProof: options.authorizationProof
    };

    const reproductionOutcome = await activeCell.reproduce(mitosisOptions);

    // Save warrant to procedural memory for auditability
    try {
      if (activeCell.memory) {
        await activeCell.memory.put({
          id: `reproduction_warrant_${warrant.warrantId}`,
          cellId: activeCell.nodeId,
          category: MemoryCategory.PROCEDURAL,
          type: 'REPRODUCTION_WARRANT',
          content: warrant,
          source: 'evolution_engine',
          confidence: 1.0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          hash: computeDeterministicHash(warrant),
          provenance: [activeCell.nodeId]
        });
      }
    } catch {
      // Ignore memory storage issues if transient
    }

    return {
      eligible: true,
      warrant,
      result: reproductionOutcome.result,
      child: reproductionOutcome.child
    };
  }
}

