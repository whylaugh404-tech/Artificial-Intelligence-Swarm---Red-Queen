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
  EvolutionCycleOptions
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

    // 1. Cognitive Fitness [0.0, 1.0]
    // Considers operational confidence and verified conceptual representations
    const opConfidence = typeof input?.operationalConfidence === 'number'
      ? clamp(input.operationalConfidence)
      : clamp(cogState?.operationalConfidence ?? 1.0);

    const conceptCount = typeof input?.conceptCount === 'number'
      ? input.conceptCount
      : (activeCell.cognitiveGraph ? activeCell.cognitiveGraph.getAllConcepts().length : (cogState?.knowledgeReferences.length ?? 0));

    // Smooth saturation for conceptual richness: 10 concepts = 1.0
    const conceptScore = clamp(conceptCount / 10.0);
    const cognitive = round4(clamp(opConfidence * 0.7 + conceptScore * 0.3));

    // 2. Metabolic Fitness [0.0, 1.0]
    // Considers transaction outcomes (ACCEPTED vs REJECTED/FAILED)
    let metabolic = 0.8; // Default baseline for new Cell
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
      metabolic = total > 0 ? round4(clamp(positive / total)) : 0.8;
    }

    // 3. Computational Fitness [0.0, 1.0]
    // Considers task/subtask completion if provided, or derived compute capacity
    let computational = 0.8; // Default baseline for new Cell
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
      computational = total > 0 ? round4(clamp(completed / total)) : 0.8;
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
      computational = total > 0 ? round4(clamp(completed / total)) : 0.8;
    } else if (activeCell.collectiveComputation) {
      const cap = activeCell.collectiveComputation.getCellComputeCapacity(activeCell);
      const availScore = cap.availability;
      const parallelismScore = clamp(cap.parallelism / 5.0);
      computational = round4(clamp(availScore * 0.6 + parallelismScore * 0.4));
    }

    // 4. Adaptability / Trait Alignment Fitness [0.0, 1.0]
    // Evaluates balance of cognitive traits (exploration/exploitation balance, risk, cycle depth)
    const traits = genome.traits;
    const balanceScore = 1.0 - 2.0 * Math.abs(traits.explorationVsExploitation - 0.5); // optimal at 0.5
    const riskScore = traits.riskTolerance; // [0.0, 1.0]
    const mutationRateScore = 1.0 - Math.min(1.0, Math.abs(traits.mutationRate - 0.05) * 5.0); // optimal around 0.05
    const depthScore = Math.min(1.0, traits.maxCognitiveCycleDepth / 5.0); // optimal around 5

    const adaptability = round4(clamp(
      balanceScore * 0.35 +
      riskScore * 0.25 +
      mutationRateScore * 0.20 +
      depthScore * 0.20
    ));

    const components: FitnessComponents = {
      cognitive,
      metabolic,
      computational,
      adaptability
    };

    // Parse and validate components schema
    FitnessComponentsSchema.parse(components);

    // Parse and normalize weights
    const rawWeights = {
      cognitive: 0.3,
      metabolic: 0.25,
      computational: 0.25,
      adaptability: 0.2,
      ...input?.weights
    };
    const sumWeights = rawWeights.cognitive + rawWeights.metabolic + rawWeights.computational + rawWeights.adaptability;
    const weights: FitnessWeights = {
      cognitive: rawWeights.cognitive / sumWeights,
      metabolic: rawWeights.metabolic / sumWeights,
      computational: rawWeights.computational / sumWeights,
      adaptability: rawWeights.adaptability / sumWeights
    };
    FitnessWeightsSchema.parse(weights);

    const overallFitness = round4(clamp(
      components.cognitive * weights.cognitive +
      components.metabolic * weights.metabolic +
      components.computational * weights.computational +
      components.adaptability * weights.adaptability
    ));

    const evaluatedAt = input?.timestamp ?? genome.createdAt;

    const deterministicIdentity = computeDeterministicHash({
      cellId: activeCell.nodeId,
      genomeId: genome.genomeId,
      generation: genome.generation,
      components,
      overallFitness,
      evaluatedAt
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
}
