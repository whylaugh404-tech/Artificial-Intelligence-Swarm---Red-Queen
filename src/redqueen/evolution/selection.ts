import { createHash } from 'crypto';
import type { Cell } from '../core/cell';
import { computeDeterministicHash } from '../cognition/computation/canonical';
import {
  SelectionScore,
  SelectionScoreSchema,
  SelectionWeights,
  SelectionWeightsSchema,
  SelectionProvenance,
  SelectionProvenanceSchema,
  PopulationSelectionResult,
  PopulationSelectionResultSchema,
  PopulationSelectionOptions,
  FitnessState
} from './types';
import { logger } from '../core/logger';

const COMPONENT = 'population_selection_engine';

function clamp(val: number, min = 0.0, max = 1.0): number {
  if (Number.isNaN(val) || !Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

function round4(val: number): number {
  return Math.round(val * 10000) / 10000;
}

/**
 * P9.2: Population Selection Engine
 * 
 * Performs deterministic, diversity-preserving selection over a population of existing Cells.
 * Evaluates fitness using P9.1 EvolutionEngine without secondary fitness algorithms.
 * Strictly maintains Cell, Genome, Memory, and Lineage immutability.
 */
export class PopulationSelectionEngine {

  /**
   * Selects candidate Cells from an existing population.
   * Preserves representation across functional niches (primary fitness champion, 
   * stability/reliability candidate, and diversity/specialization niches).
   */
  public select(
    population: Cell[],
    options?: PopulationSelectionOptions
  ): PopulationSelectionResult {
    // 1. Handle empty population safely and deterministically
    if (!population || population.length === 0) {
      const emptyParams = {
        selectionCount: options?.selectionCount ?? 0,
        preserveSpecializationNiches: options?.preserveSpecializationNiches ?? true
      };

      const provenance: SelectionProvenance = {
        evaluatedPopulation: [],
        rankedCells: [],
        fitnessSnapshots: {},
        selectionReasons: {},
        parameters: emptyParams,
        selectedCells: [],
        deterministicHash: computeDeterministicHash({ empty: true })
      };

      const deterministicIdentity = computeDeterministicHash({
        populationSize: 0,
        selectedCells: [],
        rankedCells: [],
        selectionScores: {},
        preservedDiversity: 1.0,
        parameters: emptyParams
      });

      return {
        populationSize: 0,
        selectedCells: [],
        rankedCells: [],
        selectionScores: {},
        preservedDiversity: 1.0,
        deterministicIdentity,
        provenance,
        timestamp: options?.timestamp ?? new Date().toISOString()
      };
    }

    const N = population.length;

    // 2. Validate and normalize weights
    const rawWeights = {
      fitness: 0.40,
      specializationScore: 0.15,
      reliabilityScore: 0.15,
      contributionScore: 0.15,
      diversityScore: 0.15,
      ...options?.weights
    };
    const sumWeights = Object.values(rawWeights).reduce((a, b) => a + b, 0);
    const weights: SelectionWeights = {
      fitness: rawWeights.fitness / sumWeights,
      specializationScore: rawWeights.specializationScore / sumWeights,
      reliabilityScore: rawWeights.reliabilityScore / sumWeights,
      contributionScore: rawWeights.contributionScore / sumWeights,
      diversityScore: rawWeights.diversityScore / sumWeights
    };
    SelectionWeightsSchema.parse(weights);

    // 3. Evaluate fitness for each Cell using P9.1 EvolutionEngine
    const fitnessMap: Record<string, FitnessState> = {};
    for (const cell of population) {
      const evalInput = options?.evaluationInputs?.[cell.nodeId];
      const fitness = cell.evolution.evaluateFitness(cell, evalInput);
      fitnessMap[cell.nodeId] = fitness;
    }

    // 4. Compute population diversity context
    const specCounts: Record<string, number> = {};
    let sumRisk = 0;
    let sumExplore = 0;
    let sumMut = 0;

    for (const cell of population) {
      const spec = cell.genome.specialization || 'UNSPECIALIZED';
      specCounts[spec] = (specCounts[spec] || 0) + 1;
      sumRisk += cell.genome.traits.riskTolerance ?? 0.5;
      sumExplore += cell.genome.traits.explorationVsExploitation ?? 0.5;
      sumMut += cell.genome.traits.mutationRate ?? 0.05;
    }

    const avgRisk = sumRisk / N;
    const avgExplore = sumExplore / N;
    const avgMut = sumMut / N;

    // 5. Score each Cell
    const selectionScores: Record<string, SelectionScore> = {};

    for (const cell of population) {
      const fit = fitnessMap[cell.nodeId];
      const spec = cell.genome.specialization || 'UNSPECIALIZED';

      const fitness = round4(clamp(fit.overallFitness));
      const specializationScore = round4(clamp(fit.components.specialization));
      const reliabilityScore = round4(clamp(fit.components.reliability));
      
      const contributionScore = round4(clamp(
        fit.components.cognitiveContribution * 0.35 +
        fit.components.knowledgeContribution * 0.35 +
        fit.components.computationPerformance * 0.30
      ));

      let diversityScore = 1.0;
      if (N > 1) {
        const specRarity = 1.0 / (specCounts[spec] || 1);
        const cellRisk = cell.genome.traits.riskTolerance ?? 0.5;
        const cellExplore = cell.genome.traits.explorationVsExploitation ?? 0.5;
        const cellMut = cell.genome.traits.mutationRate ?? 0.05;

        const traitDist = (
          Math.abs(cellRisk - avgRisk) +
          Math.abs(cellExplore - avgExplore) +
          Math.abs(cellMut - avgMut)
        ) / 3.0;

        const traitDistNorm = clamp(traitDist * 2.0);
        diversityScore = round4(clamp(specRarity * 0.65 + traitDistNorm * 0.35));
      }

      const finalScore = round4(clamp(
        fitness * weights.fitness +
        specializationScore * weights.specializationScore +
        reliabilityScore * weights.reliabilityScore +
        contributionScore * weights.contributionScore +
        diversityScore * weights.diversityScore
      ));

      const deterministicIdentity = computeDeterministicHash({
        cellId: cell.nodeId,
        fitness,
        specializationScore,
        reliabilityScore,
        contributionScore,
        diversityScore,
        finalScore
      });

      const scoreObj: SelectionScore = {
        cellId: cell.nodeId,
        fitness,
        specializationScore,
        reliabilityScore,
        contributionScore,
        diversityScore,
        finalScore,
        deterministicIdentity
      };

      SelectionScoreSchema.parse(scoreObj);
      selectionScores[cell.nodeId] = scoreObj;
    }

    // 6. Deterministic Ranking
    // Sort strictly by finalScore descending, with deterministic tie-breaking on cellId
    const rankedCells = Object.keys(selectionScores).sort((aId, bId) => {
      const scoreA = selectionScores[aId].finalScore;
      const scoreB = selectionScores[bId].finalScore;
      if (Math.abs(scoreA - scoreB) > 0.00001) {
        return scoreB - scoreA;
      }
      return aId.localeCompare(bId);
    });

    // 7. Diversity-Preserving Selection
    const targetCount = Math.max(1, Math.min(
      options?.selectionCount ?? Math.min(3, N),
      N
    ));

    const selectedCells: string[] = [];
    const selectionReasons: Record<string, string> = {};
    const coveredSpecializations = new Set<string>();

    const cellById = new Map<string, Cell>();
    for (const c of population) {
      cellById.set(c.nodeId, c);
    }

    const isSelected = (id: string) => selectedCells.includes(id);

    // Slot 1: Primary Fitness Champion (Highest Overall Fitness)
    const byFitness = [...population].sort((a, b) => {
      const fitA = selectionScores[a.nodeId].fitness;
      const fitB = selectionScores[b.nodeId].fitness;
      if (Math.abs(fitA - fitB) > 0.00001) return fitB - fitA;
      return a.nodeId.localeCompare(b.nodeId);
    });

    if (byFitness.length > 0 && selectedCells.length < targetCount) {
      const primary = byFitness[0];
      selectedCells.push(primary.nodeId);
      selectionReasons[primary.nodeId] = 'PRIMARY_FITNESS_CHAMPION';
      coveredSpecializations.add(primary.genome.specialization || 'UNSPECIALIZED');
    }

    // Slot 2: Diversity / Specialization Niche Candidate (Preserve distinct representations)
    if (options?.preserveSpecializationNiches !== false && selectedCells.length < targetCount) {
      const nicheCandidates = population
        .filter(c => !isSelected(c.nodeId))
        .filter(c => !coveredSpecializations.has(c.genome.specialization || 'UNSPECIALIZED'))
        .sort((a, b) => {
          const divA = selectionScores[a.nodeId].diversityScore;
          const divB = selectionScores[b.nodeId].diversityScore;
          if (Math.abs(divA - divB) > 0.00001) return divB - divA;
          const scoreA = selectionScores[a.nodeId].finalScore;
          const scoreB = selectionScores[b.nodeId].finalScore;
          if (Math.abs(scoreA - scoreB) > 0.00001) return scoreB - scoreA;
          return a.nodeId.localeCompare(b.nodeId);
        });

      if (nicheCandidates.length > 0) {
        const niche = nicheCandidates[0];
        selectedCells.push(niche.nodeId);
        selectionReasons[niche.nodeId] = 'DIVERSITY_SPECIALIZATION_NICHE';
        coveredSpecializations.add(niche.genome.specialization || 'UNSPECIALIZED');
      }
    }

    // Slot 3: Stable Candidate (Highest Reliability among remaining)
    if (selectedCells.length < targetCount) {
      const stabilityCandidates = population
        .filter(c => !isSelected(c.nodeId))
        .sort((a, b) => {
          const relA = selectionScores[a.nodeId].reliabilityScore;
          const relB = selectionScores[b.nodeId].reliabilityScore;
          if (Math.abs(relA - relB) > 0.00001) return relB - relA;
          const scoreA = selectionScores[a.nodeId].finalScore;
          const scoreB = selectionScores[b.nodeId].finalScore;
          if (Math.abs(scoreA - scoreB) > 0.00001) return scoreB - scoreA;
          return a.nodeId.localeCompare(b.nodeId);
        });

      if (stabilityCandidates.length > 0) {
        const stable = stabilityCandidates[0];
        selectedCells.push(stable.nodeId);
        selectionReasons[stable.nodeId] = 'STABLE_RELIABILITY_CANDIDATE';
        coveredSpecializations.add(stable.genome.specialization || 'UNSPECIALIZED');
      }
    }

    // Fill remaining quota strictly by ranked order
    for (const rankedId of rankedCells) {
      if (selectedCells.length >= targetCount) break;
      if (!isSelected(rankedId)) {
        selectedCells.push(rankedId);
        selectionReasons[rankedId] = 'BALANCED_MERIT_CANDIDATE';
        const c = cellById.get(rankedId);
        if (c) {
          coveredSpecializations.add(c.genome.specialization || 'UNSPECIALIZED');
        }
      }
    }

    // 8. Measure Preserved Diversity
    const totalPopSpecializations = Object.keys(specCounts).length;
    const selectedSpecializations = new Set(
      selectedCells.map(id => cellById.get(id)?.genome.specialization || 'UNSPECIALIZED')
    ).size;
    const preservedDiversity = round4(clamp(
      selectedSpecializations / Math.max(1, totalPopSpecializations)
    ));

    // 9. Construct Deterministic Identity (Excluded runtime timestamp)
    const deterministicIdentity = computeDeterministicHash({
      populationSize: N,
      selectedCells,
      rankedCells,
      selectionScores: Object.keys(selectionScores).sort().reduce((acc, k) => {
        acc[k] = {
          cellId: selectionScores[k].cellId,
          fitness: selectionScores[k].fitness,
          specializationScore: selectionScores[k].specializationScore,
          reliabilityScore: selectionScores[k].reliabilityScore,
          contributionScore: selectionScores[k].contributionScore,
          diversityScore: selectionScores[k].diversityScore,
          finalScore: selectionScores[k].finalScore
        };
        return acc;
      }, {} as Record<string, unknown>),
      preservedDiversity,
      parameters: {
        selectionCount: targetCount,
        preserveSpecializationNiches: options?.preserveSpecializationNiches ?? true
      }
    });

    // 10. Provenance
    const fitnessSnapshots: Record<string, number> = {};
    for (const id of Object.keys(selectionScores)) {
      fitnessSnapshots[id] = selectionScores[id].fitness;
    }

    const provenanceData = {
      evaluatedPopulation: population.map(c => c.nodeId),
      rankedCells,
      fitnessSnapshots,
      selectionReasons,
      parameters: {
        selectionCount: targetCount,
        preserveSpecializationNiches: options?.preserveSpecializationNiches ?? true,
        ...(options?.metadata || {})
      },
      selectedCells
    };

    const provenanceHash = computeDeterministicHash(provenanceData);

    const provenance: SelectionProvenance = {
      ...provenanceData,
      deterministicHash: provenanceHash
    };
    SelectionProvenanceSchema.parse(provenance);

    const result: PopulationSelectionResult = {
      populationSize: N,
      selectedCells,
      rankedCells,
      selectionScores,
      preservedDiversity,
      deterministicIdentity,
      provenance,
      timestamp: options?.timestamp ?? new Date().toISOString()
    };

    PopulationSelectionResultSchema.parse(result);

    logger.info(COMPONENT, 'population_selected', {
      populationSize: N,
      selectedCount: selectedCells.length,
      preservedDiversity,
      deterministicIdentity
    });

    return result;
  }
}

export const populationSelectionEngine = new PopulationSelectionEngine();

export function selectPopulation(
  population: Cell[],
  options?: PopulationSelectionOptions
): PopulationSelectionResult {
  return populationSelectionEngine.select(population, options);
}
