import { describe, it, expect, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import {
  PopulationCycleEngine,
  populationCycleEngine,
  executePopulationCycle
} from '../src/redqueen/evolution/population-cycle';
import { populationSelectionEngine } from '../src/redqueen/evolution/selection';
import { EvaluationInput } from '../src/redqueen/evolution/types';

describe('P9.3 — Population Dynamics & Evolution Cycle Foundation', () => {
  const activeCells: Cell[] = [];
  const createdPaths: string[] = [];

  const createTestCell = (id: string, options?: { specialization?: string; traits?: Record<string, number> }) => {
    const storagePath = join(process.cwd(), `.tmp_test_p93_${id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    if (existsSync(storagePath)) {
      rmSync(storagePath, { recursive: true, force: true });
    }
    const cell = new Cell(storagePath, 'dummy-key', undefined, undefined, undefined, {
      capabilities: ['COGNITIVE_REASONING', 'SWARM_COORDINATION', 'INFO_PROCESSING', 'OSINT_SCAN', 'KNOWLEDGE_QUERY'],
      specialization: options?.specialization || null,
      customTraits: options?.traits
    });
    activeCells.push(cell);
    createdPaths.push(storagePath);
    return cell;
  };

  afterEach(async () => {
    for (const c of activeCells) {
      try {
        await c.stop();
      } catch {
        // ignore shutdown noise in unit tests
      }
    }
    activeCells.length = 0;
    for (const p of createdPaths) {
      if (existsSync(p)) {
        rmSync(p, { recursive: true, force: true });
      }
    }
    createdPaths.length = 0;
  });

  it('1. population cycle basic', () => {
    const c1 = createTestCell('p1_1');
    const c2 = createTestCell('p1_2');
    const c3 = createTestCell('p1_3');

    const result = populationCycleEngine.executeCycle([c1, c2, c3], {
      currentGeneration: 0,
      selectionCount: 2
    });

    expect(result.generation).toBe(1);
    expect(result.inputPopulation.length).toBe(3);
    expect(result.inputPopulationIds.length).toBe(3);
    expect(result.survivingCells.length).toBe(2);
    expect(result.survivingCellIds.length).toBe(2);
    expect(Object.keys(result.fitnessStates).length).toBe(3);
    expect(result.selectionResult).toBeDefined();
    expect(result.populationIdentity).toBeDefined();
    expect(typeof result.populationIdentity).toBe('string');
    expect(result.evolutionEvent).toBeDefined();
    expect(result.provenance).toBeDefined();
    expect(result.evolutionEvent).toEqual(result.provenance);
    expect(result.deterministicIdentity).toBeDefined();
    expect(typeof result.deterministicIdentity).toBe('string');
  });

  it('2. fitness menggunakan P9.1', () => {
    const c1 = createTestCell('p2_1');
    const c2 = createTestCell('p2_2');

    const evalInput1: EvaluationInput = { operationalConfidence: 0.9, reliabilityScore: 0.85, conceptCount: 5 };
    const evalInput2: EvaluationInput = { operationalConfidence: 0.4, reliabilityScore: 0.35, conceptCount: 1 };

    const result = populationCycleEngine.executeCycle([c1, c2], {
      evaluationInputs: {
        [c1.nodeId]: evalInput1,
        [c2.nodeId]: evalInput2
      }
    });

    // Check that fitness states were generated using P9.1 evaluateFitness
    const expectedFit1 = c1.evolution.evaluateFitness(c1, evalInput1);
    const expectedFit2 = c2.evolution.evaluateFitness(c2, evalInput2);

    expect(result.fitnessStates[c1.nodeId].overallFitness).toBeCloseTo(expectedFit1.overallFitness, 5);
    expect(result.fitnessStates[c2.nodeId].overallFitness).toBeCloseTo(expectedFit2.overallFitness, 5);

    // All 7 components bounded [0.0, 1.0]
    for (const fit of Object.values(result.fitnessStates)) {
      expect(fit.overallFitness).toBeGreaterThanOrEqual(0.0);
      expect(fit.overallFitness).toBeLessThanOrEqual(1.0);
      expect(fit.components.computationPerformance).toBeGreaterThanOrEqual(0.0);
      expect(fit.components.computationPerformance).toBeLessThanOrEqual(1.0);
      expect(fit.components.reliability).toBeGreaterThanOrEqual(0.0);
      expect(fit.components.reliability).toBeLessThanOrEqual(1.0);
      expect(fit.components.cognitiveContribution).toBeGreaterThanOrEqual(0.0);
      expect(fit.components.cognitiveContribution).toBeLessThanOrEqual(1.0);
      expect(fit.components.knowledgeContribution).toBeGreaterThanOrEqual(0.0);
      expect(fit.components.knowledgeContribution).toBeLessThanOrEqual(1.0);
      expect(fit.components.specialization).toBeGreaterThanOrEqual(0.0);
      expect(fit.components.specialization).toBeLessThanOrEqual(1.0);
      expect(fit.components.experience).toBeGreaterThanOrEqual(0.0);
      expect(fit.components.experience).toBeLessThanOrEqual(1.0);
      expect(fit.components.resourceEfficiency).toBeGreaterThanOrEqual(0.0);
      expect(fit.components.resourceEfficiency).toBeLessThanOrEqual(1.0);
    }
  });

  it('3. selection menggunakan P9.2', () => {
    const c1 = createTestCell('p3_1');
    const c2 = createTestCell('p3_2');
    const c3 = createTestCell('p3_3');

    const result = populationCycleEngine.executeCycle([c1, c2, c3], {
      selectionCount: 2
    });

    expect(result.selectionResult.rankedCells.length).toBe(3);
    expect(result.selectionResult.selectedCells.length).toBe(2);
    expect(result.survivingCellIds).toEqual(result.selectionResult.selectedCells);

    for (const score of Object.values(result.selectionResult.selectionScores)) {
      expect(score.finalScore).toBeGreaterThanOrEqual(0.0);
      expect(score.finalScore).toBeLessThanOrEqual(1.0);
      expect(score.diversityScore).toBeGreaterThanOrEqual(0.0);
      expect(score.diversityScore).toBeLessThanOrEqual(1.0);
      expect(score.deterministicIdentity).toBeDefined();
    }
  });

  it('4. surviving Cell hanya berasal dari input population', () => {
    const c1 = createTestCell('p4_1');
    const c2 = createTestCell('p4_2');
    const c3 = createTestCell('p4_3');

    const inputPop = [c1, c2, c3];
    const result = populationCycleEngine.executeCycle(inputPop, { selectionCount: 2 });

    expect(result.survivingCells.length).toBe(2);
    for (const survivor of result.survivingCells) {
      expect(inputPop).toContain(survivor);
    }
    for (const survivorId of result.survivingCellIds) {
      expect(result.inputPopulationIds).toContain(survivorId);
    }
  });

  it('5. no Cell creation', () => {
    const c1 = createTestCell('p5_1');
    const c2 = createTestCell('p5_2');

    const initialCellCount = activeCells.length;
    const result = populationCycleEngine.executeCycle([c1, c2], { selectionCount: 1 });

    // No new cells were instantiated
    expect(activeCells.length).toBe(initialCellCount);

    // Surviving cell is the exact instance
    const survivor = result.survivingCells[0];
    expect(survivor === c1 || survivor === c2).toBe(true);
  });

  it('6. no Cell identity mutation', () => {
    const c1 = createTestCell('p6_1');
    const c2 = createTestCell('p6_2');

    const originalId1 = c1.nodeId;
    const originalId2 = c2.nodeId;

    populationCycleEngine.executeCycle([c1, c2]);

    expect(c1.nodeId).toBe(originalId1);
    expect(c2.nodeId).toBe(originalId2);
  });

  it('7. no lineage mutation', () => {
    const c1 = createTestCell('p7_1');
    const c2 = createTestCell('p7_2');

    const originalLineage1 = c1.lineage.lineageId;
    const originalLineage2 = c2.lineage.lineageId;

    populationCycleEngine.executeCycle([c1, c2]);

    expect(c1.lineage.lineageId).toBe(originalLineage1);
    expect(c2.lineage.lineageId).toBe(originalLineage2);
  });

  it('8. no memory mutation', () => {
    const c1 = createTestCell('p8_1');
    const originalMemoryRef = c1.memory;

    populationCycleEngine.executeCycle([c1]);

    expect(c1.memory).toBe(originalMemoryRef);
  });

  it('9. no cognitive-state mutation', () => {
    const c1 = createTestCell('p9_1');
    const originalCognitiveRef = c1.cognitiveState;

    populationCycleEngine.executeCycle([c1]);

    expect(c1.cognitiveState).toBe(originalCognitiveRef);
  });

  it('10. no genome mutation', () => {
    const c1 = createTestCell('p10_1');

    const originalGenomeId = c1.genome.genomeId;
    const originalVersion = c1.genome.genomeVersion;
    const originalTraits = { ...c1.genome.traits };

    populationCycleEngine.executeCycle([c1]);

    expect(c1.genome.genomeId).toBe(originalGenomeId);
    expect(c1.genome.genomeVersion).toBe(originalVersion);
    expect(c1.genome.traits).toEqual(originalTraits);
  });

  it('11. generation transition', () => {
    const c1 = createTestCell('p11_1');
    const c2 = createTestCell('p11_2');
    const c3 = createTestCell('p11_3');

    // Gen 0 -> Gen 1
    const gen1 = populationCycleEngine.executeCycle([c1, c2, c3], {
      currentGeneration: 0,
      selectionCount: 2
    });
    expect(gen1.generation).toBe(1);
    expect(gen1.provenance.previousGeneration).toBe(0);

    // Gen 1 -> Gen 2
    const gen2 = populationCycleEngine.executeCycle(gen1.survivingCells, {
      currentGeneration: gen1.generation,
      selectionCount: 2
    });
    expect(gen2.generation).toBe(2);
    expect(gen2.provenance.previousGeneration).toBe(1);

    // Gen 2 -> Gen 3
    const gen3 = populationCycleEngine.executeCycle(gen2.survivingCells, {
      currentGeneration: gen2.generation,
      selectionCount: 2
    });
    expect(gen3.generation).toBe(3);
    expect(gen3.provenance.previousGeneration).toBe(2);
  });

  it('12. deterministic cycle', () => {
    const c1 = createTestCell('p12_1');
    const c2 = createTestCell('p12_2');

    const evalInputs = {
      [c1.nodeId]: { operationalConfidence: 0.8 },
      [c2.nodeId]: { operationalConfidence: 0.6 }
    };

    const run1 = populationCycleEngine.executeCycle([c1, c2], {
      currentGeneration: 0,
      evaluationInputs: evalInputs
    });

    const run2 = populationCycleEngine.executeCycle([c1, c2], {
      currentGeneration: 0,
      evaluationInputs: evalInputs
    });

    expect(run1.deterministicIdentity).toBe(run2.deterministicIdentity);
    expect(run1.populationIdentity).toBe(run2.populationIdentity);
    expect(run1.survivingCellIds).toEqual(run2.survivingCellIds);
  });

  it('13. timestamp-independent identity', () => {
    const c1 = createTestCell('p13_1');
    const c2 = createTestCell('p13_2');

    const runA = populationCycleEngine.executeCycle([c1, c2], {
      timestamp: '2026-09-15T00:00:00.000Z'
    });

    const runB = populationCycleEngine.executeCycle([c1, c2], {
      timestamp: '2026-09-16T23:59:59.999Z'
    });

    expect(runA.deterministicIdentity).toBe(runB.deterministicIdentity);
    expect(runA.populationIdentity).toBe(runB.populationIdentity);
  });

  it('14. deterministic tie behavior', () => {
    const c1 = createTestCell('p14_1');
    const c2 = createTestCell('p14_2');

    const evalInputs = {
      [c1.nodeId]: { operationalConfidence: 0.7, reliabilityScore: 0.7 },
      [c2.nodeId]: { operationalConfidence: 0.7, reliabilityScore: 0.7 }
    };

    const forward = populationCycleEngine.executeCycle([c1, c2], {
      evaluationInputs: evalInputs
    });

    const reverse = populationCycleEngine.executeCycle([c2, c1], {
      evaluationInputs: evalInputs
    });

    expect(forward.survivingCellIds).toEqual(reverse.survivingCellIds);
    expect(forward.deterministicIdentity).toBe(reverse.deterministicIdentity);
  });

  it('15. provenance completeness', () => {
    const c1 = createTestCell('p15_1');
    const c2 = createTestCell('p15_2');

    const result = populationCycleEngine.executeCycle([c1, c2], {
      currentGeneration: 1
    });

    const prov = result.provenance;
    expect(prov.cycleId).toBeDefined();
    expect(prov.generation).toBe(2);
    expect(prov.previousGeneration).toBe(1);
    expect(prov.inputPopulationIds).toEqual([c1.nodeId, c2.nodeId]);
    expect(prov.survivingCellIds).toEqual(result.survivingCellIds);
    expect(prov.fitnessSnapshots[c1.nodeId]).toBeDefined();
    expect(prov.fitnessSnapshots[c2.nodeId]).toBeDefined();
    expect(prov.selectionReasons).toBeDefined();
    expect(prov.ranking.length).toBe(2);
    expect(prov.parameters).toBeDefined();
    expect(prov.selectionDeterministicHash).toBeDefined();
    expect(prov.deterministicHash).toBeDefined();
  });

  it('16. empty population', () => {
    const result = populationCycleEngine.executeCycle([], {
      currentGeneration: 0
    });

    expect(result.generation).toBe(1);
    expect(result.inputPopulation).toEqual([]);
    expect(result.inputPopulationIds).toEqual([]);
    expect(result.survivingCells).toEqual([]);
    expect(result.survivingCellIds).toEqual([]);
    expect(result.fitnessStates).toEqual({});
    expect(result.populationIdentity).toBeDefined();
    expect(result.deterministicIdentity).toBeDefined();
    expect(result.provenance).toBeDefined();
  });

  it('17. single-cell population', () => {
    const c1 = createTestCell('p17_1');

    const result = populationCycleEngine.executeCycle([c1], {
      currentGeneration: 0
    });

    expect(result.generation).toBe(1);
    expect(result.inputPopulation.length).toBe(1);
    expect(result.survivingCells.length).toBe(1);
    expect(result.survivingCells[0]).toBe(c1);
    expect(result.survivingCellIds).toEqual([c1.nodeId]);
    expect(result.fitnessStates[c1.nodeId]).toBeDefined();
    expect(result.deterministicIdentity).toBeDefined();
  });

  it('18. diversity selection survives into next population', () => {
    const gen1 = createTestCell('p18_g1');
    const gen2 = createTestCell('p18_g2');
    const spec = createTestCell('p18_s1', { specialization: 'KNOWLEDGE_DISCOVERY' });

    const result = populationCycleEngine.executeCycle([gen1, gen2, spec], {
      selectionCount: 2,
      preserveSpecializationNiches: true
    });

    expect(result.survivingCells.length).toBe(2);
    // Specialist must be part of the surviving cells
    expect(result.survivingCells).toContain(spec);
    expect(result.survivingCellIds).toContain(spec.nodeId);
  });

  it('19. P9.1 regression', () => {
    const cell = createTestCell('p19_cell');

    // 1. Evaluate fitness with real inputs and verify 7 bounded components
    const evalInput: EvaluationInput = {
      computationTasks: [{ status: 'COMPLETED' }],
      operationalConfidence: 0.88,
      reliabilityScore: 0.92,
      conceptCount: 6,
      resourceScore: 0.8
    };

    const fitness = cell.evolution.evaluateFitness(cell, evalInput);
    expect(fitness.overallFitness).toBeGreaterThan(0.0);
    expect(fitness.overallFitness).toBeLessThanOrEqual(1.0);
    expect(fitness.components.computationPerformance).toBeGreaterThan(0.0);
    expect(fitness.components.reliability).toBeGreaterThan(0.0);
    expect(fitness.components.cognitiveContribution).toBeGreaterThan(0.0);
    expect(fitness.components.knowledgeContribution).toBeGreaterThan(0.0);
    expect(fitness.components.specialization).toBeGreaterThan(0.0);
    expect(fitness.components.experience).toBeGreaterThan(0.0);
    expect(fitness.components.resourceEfficiency).toBeGreaterThan(0.0);

    // 2. Perform real mutation using P9.1 engine
    const originalVersion = cell.genome.genomeVersion;
    const mutationResult = cell.evolution.mutate({
      seed: 'seed_p19_regression',
      maxStepSize: 0.05
    }, cell);

    expect(mutationResult.evolvedGenome.genomeVersion).toBe(originalVersion + 1);
    expect(mutationResult.mutations.length).toBeGreaterThanOrEqual(1);
    expect(mutationResult.mutations[0].deterministicHash).toBeDefined();
    expect(typeof mutationResult.mutations[0].deterministicHash).toBe('string');
  });

  it('20. P9.2 regression', () => {
    const cellA = createTestCell('p20_a');
    const cellB = createTestCell('p20_b');
    const cellC = createTestCell('p20_c', { specialization: 'OSINT_ANALYST' });

    const selectionResult = populationSelectionEngine.select([cellA, cellB, cellC], {
      selectionCount: 2,
      preserveSpecializationNiches: true
    });

    expect(selectionResult.populationSize).toBe(3);
    expect(selectionResult.selectedCells.length).toBe(2);
    expect(selectionResult.rankedCells.length).toBe(3);
    expect(selectionResult.selectedCells).toContain(cellC.nodeId);
    expect(selectionResult.preservedDiversity).toBeGreaterThan(0.0);
    expect(selectionResult.deterministicIdentity).toBeDefined();
    expect(selectionResult.provenance.evaluatedPopulation).toEqual([cellA.nodeId, cellB.nodeId, cellC.nodeId]);
  });
});
