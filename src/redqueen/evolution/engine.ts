import { createHash } from 'crypto';
import type { Cell } from '../core/cell';
import {
  CellGenome,
  CellGenomeSchema,
  validateGenome,
  deepFreeze
} from '../genome';
import { computeDeterministicHash } from '../cognition/computation/canonical';
import { MetabolismStatus } from '../metabolism/types';
import { ComputationStatus } from '../cognition/computation/types';
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
  ComputationFeedbackTelemetrySchema
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

    // 7. resourceEfficiency [0.0, 1.0]
    let resourceEfficiency = 0.5;
    if (typeof input?.resourceScore === 'number') {
      resourceEfficiency = clamp(input.resourceScore);
    } else if (activeCell.collectiveComputation) {
      const cap = activeCell.collectiveComputation.getCellComputeCapacity(activeCell);
      resourceEfficiency = round4(clamp(cap.availability));
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
}

