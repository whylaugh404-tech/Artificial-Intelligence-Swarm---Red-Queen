import type { Cell } from '../core/cell';
import { PopulationSelectionEngine, populationSelectionEngine } from './selection';
import { computeDeterministicHash } from '../cognition/computation/canonical';
import { logger } from '../core/logger';
import {
  PopulationEvolutionCycleResult,
  PopulationCycleOptions,
  PopulationCycleProvenance,
  FitnessState
} from './types';

const COMPONENT = 'population_cycle_engine';

/**
 * P9.3: Population Dynamics & Evolution Cycle Foundation
 * 
 * Orchestrates the population-level evolutionary cycle:
 * Population -> Fitness Evaluation (P9.1) -> Population Selection (P9.2) 
 * -> Evolutionary State -> Population Update -> Next Generation.
 * 
 * Rules:
 * - Only operates on existing Cell instances.
 * - Does not clone, create, merge, or alter Cell identities or internal state.
 * - Generates deterministic cycle provenance and cryptographic identities.
 * - Bridges P9.1 and P9.2 into a coherent generational progression.
 */
export class PopulationCycleEngine {
  private selectionEngine: PopulationSelectionEngine;

  constructor(selectionEngine?: PopulationSelectionEngine) {
    this.selectionEngine = selectionEngine || populationSelectionEngine;
  }

  /**
   * Executes an end-to-end evolution cycle for the provided Cell population.
   */
  public executeCycle(
    population: Cell[],
    options?: PopulationCycleOptions
  ): PopulationEvolutionCycleResult {
    // Determine generation boundaries deterministically
    const currentGen = options?.currentGeneration ?? 0;
    const nextGeneration = options?.generation !== undefined
      ? options.generation
      : currentGen + 1;

    // Handle empty population gracefully
    if (!population || population.length === 0) {
      logger.info(COMPONENT, 'empty_population_cycle_executed', {
        generation: nextGeneration
      });

      const selectionResult = this.selectionEngine.select([], options);

      const emptyProvenanceData = {
        cycleId: options?.cycleId ?? `cycle_gen_${nextGeneration}_empty`,
        generation: nextGeneration,
        previousGeneration: currentGen,
        inputPopulationIds: [] as string[],
        survivingCellIds: [] as string[],
        fitnessSnapshots: {} as Record<string, number>,
        selectionReasons: {} as Record<string, string>,
        ranking: [] as string[],
        parameters: {
          currentGeneration: currentGen,
          selectionCount: options?.selectionCount ?? 0,
          preserveSpecializationNiches: options?.preserveSpecializationNiches ?? true,
          ...(options?.metadata || {})
        },
        selectionDeterministicHash: selectionResult.deterministicIdentity
      };

      const emptyHash = computeDeterministicHash(emptyProvenanceData);
      const provenance: PopulationCycleProvenance = {
        ...emptyProvenanceData,
        deterministicHash: emptyHash
      };

      const populationIdentity = computeDeterministicHash({
        survivingFingerprints: []
      });

      const deterministicIdentity = computeDeterministicHash({
        generation: nextGeneration,
        previousGeneration: currentGen,
        inputPopulationIds: [],
        survivingCellIds: [],
        selectionDeterministicHash: selectionResult.deterministicIdentity,
        populationIdentity,
        parameters: emptyProvenanceData.parameters
      });

      return {
        generation: nextGeneration,
        inputPopulation: [],
        inputPopulationIds: [],
        fitnessStates: {},
        selectionResult,
        survivingCells: [],
        survivingCellIds: [],
        populationIdentity,
        evolutionEvent: provenance,
        provenance,
        deterministicIdentity,
        timestamp: options?.timestamp ?? new Date().toISOString()
      };
    }

    // 1. Fitness Evaluation using P9.1 directly via each cell's evolution engine
    const fitnessStates: Record<string, FitnessState> = {};
    const fitnessSnapshots: Record<string, number> = {};

    for (const cell of population) {
      const evalInput = options?.evaluationInputs?.[cell.nodeId];
      const fitness = cell.evolution.evaluateFitness(cell, evalInput);
      fitnessStates[cell.nodeId] = fitness;
      fitnessSnapshots[cell.nodeId] = fitness.overallFitness;
    }

    // 2. Population Selection using P9.2
    const selectionResult = this.selectionEngine.select(population, options);

    // 3. Form Surviving Cells directly from existing Cell instances
    const cellMap = new Map<string, Cell>();
    for (const cell of population) {
      cellMap.set(cell.nodeId, cell);
    }

    const survivingCells: Cell[] = selectionResult.selectedCells
      .map(id => cellMap.get(id)!)
      .filter(Boolean);
    const survivingCellIds = survivingCells.map(c => c.nodeId);

    // 4. Compute Population Identity (deterministic hash of surviving members' identity and state)
    const survivingFingerprints = survivingCells
      .map(c => ({
        nodeId: c.nodeId,
        genomeId: c.genome.genomeId,
        specialization: c.genome.specialization,
        fitness: fitnessStates[c.nodeId]?.overallFitness ?? 0
      }))
      .sort((a, b) => a.nodeId.localeCompare(b.nodeId));

    const populationIdentity = computeDeterministicHash({
      survivingFingerprints
    });

    // 5. Complete Provenance and Evolution Event
    const cycleId = options?.cycleId ?? `cycle_gen_${nextGeneration}_${computeDeterministicHash({
      gen: nextGeneration,
      inputIds: population.map(c => c.nodeId).sort()
    }).substring(0, 16)}`;

    const provenanceData = {
      cycleId,
      generation: nextGeneration,
      previousGeneration: currentGen,
      inputPopulationIds: population.map(c => c.nodeId),
      survivingCellIds,
      fitnessSnapshots,
      selectionReasons: selectionResult.provenance.selectionReasons,
      ranking: selectionResult.rankedCells,
      parameters: {
        currentGeneration: currentGen,
        selectionCount: options?.selectionCount ?? Math.min(3, population.length),
        preserveSpecializationNiches: options?.preserveSpecializationNiches ?? true,
        ...(options?.metadata || {})
      },
      selectionDeterministicHash: selectionResult.deterministicIdentity
    };

    const deterministicHash = computeDeterministicHash(provenanceData);

    const provenance: PopulationCycleProvenance = {
      ...provenanceData,
      deterministicHash
    };

    // 6. Semantic Deterministic Cycle Identity
    // Dependent strictly on generation, input population, surviving population, selection result, and parameters.
    // Timestamps and random seeds are strictly excluded.
    const deterministicIdentity = computeDeterministicHash({
      generation: nextGeneration,
      previousGeneration: currentGen,
      inputPopulationIds: population.map(c => c.nodeId).sort(),
      survivingCellIds: [...survivingCellIds].sort(),
      selectionDeterministicHash: selectionResult.deterministicIdentity,
      populationIdentity,
      parameters: provenanceData.parameters
    });

    logger.info(COMPONENT, 'population_cycle_completed', {
      generation: nextGeneration,
      inputCount: population.length,
      survivingCount: survivingCells.length,
      populationIdentity,
      deterministicIdentity
    });

    return {
      generation: nextGeneration,
      inputPopulation: [...population],
      inputPopulationIds: population.map(c => c.nodeId),
      fitnessStates,
      selectionResult,
      survivingCells,
      survivingCellIds,
      populationIdentity,
      evolutionEvent: provenance,
      provenance,
      deterministicIdentity,
      timestamp: options?.timestamp ?? new Date().toISOString()
    };
  }
}

export const populationCycleEngine = new PopulationCycleEngine();

export function executePopulationCycle(
  population: Cell[],
  options?: PopulationCycleOptions
): PopulationEvolutionCycleResult {
  return populationCycleEngine.executeCycle(population, options);
}
