import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { Cell } from '../src/redqueen/core/cell';
import {
  EvolutionEngine,
  FitnessState,
  Mutation,
  EvolutionEvent,
  EvolutionEventStatus,
  ALLOWED_MUTATION_TARGETS,
  MutationTarget
} from '../src/redqueen/evolution';
import { MetabolismStatus, Experience, InformationCategory, NoveltyClassification } from '../src/redqueen/metabolism/types';
import { ComputationStatus, SubtaskResult } from '../src/redqueen/cognition/computation/types';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';

describe('P9.1 — Evolution Foundation', () => {
  const activeCells: Cell[] = [];
  const createdPaths: string[] = [];

  const createTestCell = (id: string, options?: { specialization?: string }) => {
    const storagePath = join(process.cwd(), `.tmp_test_p91_${id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    if (existsSync(storagePath)) {
      rmSync(storagePath, { recursive: true, force: true });
    }
    const cell = new Cell(storagePath, 'dummy-key', undefined, undefined, undefined, {
      capabilities: ['COGNITIVE_REASONING', 'SWARM_COORDINATION', 'INFO_PROCESSING', 'OSINT_SCAN', 'KNOWLEDGE_QUERY'],
      specialization: options?.specialization || null
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

  it('1. Determinism: identical cell state + evaluation input produces identical fitness components and deterministic hash', () => {
    const cell1 = createTestCell('det1');
    const cell2 = createTestCell('det2');

    // Synchronize cell2 genome and state to match cell1 for test evaluation
    cell2.restoreGenome(cell1.genome);

    const fixedTimestamp = '2026-09-15T12:00:00.000Z';
    const evalInput = {
      operationalConfidence: 0.85,
      conceptCount: 4,
      timestamp: fixedTimestamp
    };

    // Standard evaluation with same cell state and same inputs
    const fitness1A = cell1.evolution.evaluateFitness(cell1, evalInput);
    const fitness1B = cell1.evolution.evaluateFitness(cell1, evalInput);

    expect(fitness1A.components).toEqual(fitness1B.components);
    expect(fitness1A.overallFitness).toBe(fitness1B.overallFitness);
    expect(fitness1A.deterministicIdentity).toBe(fitness1B.deterministicIdentity);
    expect(fitness1A.deterministicIdentity).toMatch(/^[a-f0-9]{64}$/);
  });

  it('2. Distinct cell states produce different fitness scores and deterministic identities', () => {
    const cellA = createTestCell('stateA');
    const cellB = createTestCell('stateB');

    const evalInputA = {
      operationalConfidence: 0.95,
      conceptCount: 10,
      timestamp: '2026-09-15T12:00:00.000Z'
    };

    const evalInputB = {
      operationalConfidence: 0.20,
      conceptCount: 0,
      timestamp: '2026-09-15T12:00:00.000Z'
    };

    const fitnessA = cellA.evolution.evaluateFitness(cellA, evalInputA);
    const fitnessB = cellB.evolution.evaluateFitness(cellB, evalInputB);

    expect(fitnessA.components.cognitive).toBeGreaterThan(fitnessB.components.cognitive);
    expect(fitnessA.overallFitness).toBeGreaterThan(fitnessB.overallFitness);
    expect(fitnessA.deterministicIdentity).not.toBe(fitnessB.deterministicIdentity);
  });

  it('3. Component bounds: all fitness components and overall fitness are bounded strictly within [0.0, 1.0]', () => {
    const cell = createTestCell('bounds');

    const extremeInputs = [
      { operationalConfidence: 999.0, conceptCount: 1000 },
      { operationalConfidence: -100.0, conceptCount: -50 }
    ];

    for (const input of extremeInputs) {
      const fitness = cell.evolution.evaluateFitness(cell, input);

      expect(fitness.components.cognitive).toBeGreaterThanOrEqual(0.0);
      expect(fitness.components.cognitive).toBeLessThanOrEqual(1.0);

      expect(fitness.components.metabolic).toBeGreaterThanOrEqual(0.0);
      expect(fitness.components.metabolic).toBeLessThanOrEqual(1.0);

      expect(fitness.components.computational).toBeGreaterThanOrEqual(0.0);
      expect(fitness.components.computational).toBeLessThanOrEqual(1.0);

      expect(fitness.components.adaptability).toBeGreaterThanOrEqual(0.0);
      expect(fitness.components.adaptability).toBeLessThanOrEqual(1.0);

      expect(fitness.overallFitness).toBeGreaterThanOrEqual(0.0);
      expect(fitness.overallFitness).toBeLessThanOrEqual(1.0);
    }
  });

  it('4. Baseline fitness: genesis cell with zero prior experience evaluates to a valid, non-NaN bounded fitness', () => {
    const cell = createTestCell('genesis_base');
    const fitness = cell.evolution.evaluateFitness();

    expect(Number.isFinite(fitness.overallFitness)).toBe(true);
    expect(Number.isNaN(fitness.overallFitness)).toBe(false);
    expect(fitness.overallFitness).toBeGreaterThan(0.0);
    expect(fitness.overallFitness).toBeLessThanOrEqual(1.0);
    expect(fitness.generation).toBe(0);
    expect(fitness.genomeId).toBe(cell.genome.genomeId);
  });

  it('5. Cognitive impact on fitness: higher operational confidence & verified concepts yield higher cognitive score', async () => {
    const cell = createTestCell('cog_impact');

    const lowCognitive = cell.evolution.evaluateFitness(cell, {
      operationalConfidence: 0.1,
      conceptCount: 0
    });

    const highCognitive = cell.evolution.evaluateFitness(cell, {
      operationalConfidence: 0.95,
      conceptCount: 8
    });

    expect(highCognitive.components.cognitive).toBeGreaterThan(lowCognitive.components.cognitive);
    expect(highCognitive.overallFitness).toBeGreaterThan(lowCognitive.overallFitness);
  });

  it('6. Metabolic impact on fitness: positive accepted experiences increase metabolic fitness, rejected/failed lower it', () => {
    const cell = createTestCell('meta_impact');

    const positiveExperiences: Experience[] = [
      {
        experienceId: 'exp_pos_1',
        transactionId: 'tx1',
        cellId: cell.nodeId,
        timestamp: new Date().toISOString(),
        informationId: 'info1',
        knowledgeIds: ['k1'],
        category: InformationCategory.SOFTWARE,
        outcome: MetabolismStatus.ACCEPTED,
        noveltyClassification: NoveltyClassification.REINFORCEMENT,
        noveltyScore: 0.1,
        source: 'TEST',
        confidence: 0.95
      },
      {
        experienceId: 'exp_pos_2',
        transactionId: 'tx2',
        cellId: cell.nodeId,
        timestamp: new Date().toISOString(),
        informationId: 'info2',
        knowledgeIds: ['k2'],
        category: InformationCategory.SOFTWARE,
        outcome: MetabolismStatus.ACCEPTED,
        noveltyClassification: NoveltyClassification.NOVEL,
        noveltyScore: 0.8,
        source: 'TEST',
        confidence: 0.90
      }
    ];

    const negativeExperiences: Experience[] = [
      {
        experienceId: 'exp_neg_1',
        transactionId: 'tx3',
        cellId: cell.nodeId,
        timestamp: new Date().toISOString(),
        informationId: 'info3',
        knowledgeIds: [],
        category: InformationCategory.SOFTWARE,
        outcome: MetabolismStatus.REJECTED,
        noveltyClassification: NoveltyClassification.REINFORCEMENT,
        noveltyScore: 0.0,
        source: 'TEST',
        confidence: 0.2
      },
      {
        experienceId: 'exp_neg_2',
        transactionId: 'tx4',
        cellId: cell.nodeId,
        timestamp: new Date().toISOString(),
        informationId: 'info4',
        knowledgeIds: [],
        category: InformationCategory.SOFTWARE,
        outcome: MetabolismStatus.FAILED,
        noveltyClassification: NoveltyClassification.REINFORCEMENT,
        noveltyScore: 0.0,
        source: 'TEST',
        confidence: 0.1
      }
    ];

    const fitPos = cell.evolution.evaluateFitness(cell, { experiences: positiveExperiences });
    const fitNeg = cell.evolution.evaluateFitness(cell, { experiences: negativeExperiences });

    expect(fitPos.components.metabolic).toBeGreaterThan(fitNeg.components.metabolic);
    expect(fitPos.components.metabolic).toBeGreaterThanOrEqual(0.85);
    expect(fitNeg.components.metabolic).toBeLessThanOrEqual(0.2);
  });

  it('7. Computational impact on fitness: successful subtasks increase computational fitness while failures lower it', () => {
    const cell = createTestCell('comp_impact');

    const successfulResults: SubtaskResult[] = [
      {
        subtaskId: 'sub_1',
        taskId: 'task_1',
        executingCellId: cell.nodeId,
        status: ComputationStatus.COMPLETED,
        output: { result: 42 },
        attempts: 1,
        executionDurationMs: 15,
        provenance: [cell.nodeId],
        resultHash: 'hash1'
      },
      {
        subtaskId: 'sub_2',
        taskId: 'task_1',
        executingCellId: cell.nodeId,
        status: ComputationStatus.COMPLETED,
        output: { result: 84 },
        attempts: 1,
        executionDurationMs: 20,
        provenance: [cell.nodeId],
        resultHash: 'hash2'
      }
    ];

    const failedResults: SubtaskResult[] = [
      {
        subtaskId: 'sub_3',
        taskId: 'task_2',
        executingCellId: cell.nodeId,
        status: ComputationStatus.FAILED,
        output: {},
        error: 'Execution timeout',
        attempts: 2,
        executionDurationMs: 5000,
        provenance: [cell.nodeId],
        resultHash: 'hash3'
      }
    ];

    const fitSuccess = cell.evolution.evaluateFitness(cell, { subtaskResults: successfulResults });
    const fitFailed = cell.evolution.evaluateFitness(cell, { subtaskResults: failedResults });

    expect(fitSuccess.components.computational).toBe(1.0);
    expect(fitFailed.components.computational).toBe(0.0);
  });

  it('8. Seeded mutation determinism: identical seed on identical genome produces exact same mutations and values', () => {
    const cell = createTestCell('seed_det');

    const seed = 'deterministic_evolution_seed_alpha_001';
    const mutResult1 = cell.evolution.mutate({ seed }, cell);
    const mutResult2 = cell.evolution.mutate({ seed }, cell);

    expect(mutResult1.mutations.length).toBe(mutResult2.mutations.length);
    for (let i = 0; i < mutResult1.mutations.length; i++) {
      expect(mutResult1.mutations[i].targetKey).toBe(mutResult2.mutations[i].targetKey);
      expect(mutResult1.mutations[i].newValue).toBe(mutResult2.mutations[i].newValue);
      expect(mutResult1.mutations[i].delta).toBe(mutResult2.mutations[i].delta);
      expect(mutResult1.mutations[i].mutationId).toBe(mutResult2.mutations[i].mutationId);
    }
    expect(mutResult1.evolvedGenome.genomeId).toBe(mutResult2.evolvedGenome.genomeId);
  });

  it('9. Seed sensitivity: different seeds produce different mutation values or target pathways', () => {
    const cell = createTestCell('seed_sens');

    const seedA = 'evolution_seed_pathway_AAA';
    const seedB = 'evolution_seed_pathway_ZZZ';

    const mutResultA = cell.evolution.mutate({ seed: seedA, targetKeys: ['traits.riskTolerance'] }, cell);
    const mutResultB = cell.evolution.mutate({ seed: seedB, targetKeys: ['traits.riskTolerance'] }, cell);

    expect(mutResultA.mutations[0].newValue).not.toBe(mutResultB.mutations[0].newValue);
    expect(mutResultA.evolvedGenome.genomeId).not.toBe(mutResultB.evolvedGenome.genomeId);
  });

  it('10. Trait boundary clamping: traits never exceed [0.0, 1.0] under extreme mutation parameters', () => {
    const cell = createTestCell('clamp_traits');

    // Repeated mutations trying to push mutationRate and riskTolerance out of bounds
    for (let i = 0; i < 20; i++) {
      const res = cell.evolution.mutate({
        seed: `aggressive_step_${i}`,
        targetKeys: ['traits.mutationRate', 'traits.riskTolerance', 'traits.explorationVsExploitation'],
        maxStepSize: 0.2
      }, cell);

      cell.restoreGenome(res.evolvedGenome);

      expect(cell.genome.traits.mutationRate).toBeGreaterThanOrEqual(0.0);
      expect(cell.genome.traits.mutationRate).toBeLessThanOrEqual(1.0);

      expect(cell.genome.traits.riskTolerance).toBeGreaterThanOrEqual(0.0);
      expect(cell.genome.traits.riskTolerance).toBeLessThanOrEqual(1.0);

      expect(cell.genome.traits.explorationVsExploitation).toBeGreaterThanOrEqual(0.0);
      expect(cell.genome.traits.explorationVsExploitation).toBeLessThanOrEqual(1.0);
    }
  });

  it('11. Integer trait constraints: maxCognitiveCycleDepth remains a valid positive integer >= 1', () => {
    const cell = createTestCell('cycle_depth');

    for (let i = 0; i < 15; i++) {
      const res = cell.evolution.mutate({
        seed: `depth_step_${i}`,
        targetKeys: ['traits.maxCognitiveCycleDepth']
      }, cell);

      cell.restoreGenome(res.evolvedGenome);

      const depth = cell.genome.traits.maxCognitiveCycleDepth;
      expect(Number.isInteger(depth)).toBe(true);
      expect(depth).toBeGreaterThanOrEqual(1);
    }
  });

  it('12. Incremental mutation bound: single mutation step does not exceed maxStepSize', () => {
    const cell = createTestCell('step_bound');
    const maxStep = 0.03;

    const res = cell.evolution.mutate({
      seed: 'bounded_step_check',
      targetKeys: ['traits.riskTolerance', 'traits.mutationRate', 'traits.explorationVsExploitation'],
      maxStepSize: maxStep
    }, cell);

    for (const m of res.mutations) {
      if (typeof m.delta === 'number') {
        expect(Math.abs(m.delta)).toBeLessThanOrEqual(maxStep + 0.0001);
      }
    }
  });

  it('13. Security & unauthorized mutation rejection: unauthorized keys or unseeded mutations are strictly rejected', () => {
    const cell = createTestCell('security_reject');

    // 1. Unseeded mutation attempt
    expect(() => {
      cell.evolution.mutate({ seed: '' }, cell);
    }).toThrow(/unseeded/i);

    // 2. Unauthorized mutation key attempt (capabilities, privateKey, arbitrary strings)
    expect(() => {
      cell.evolution.mutate({
        seed: 'exploit_seed',
        targetKeys: ['VULN_EXPLOIT' as MutationTarget]
      }, cell);
    }).toThrow(/Security Violation: Unauthorized mutation target/i);

    expect(() => {
      cell.evolution.mutate({
        seed: 'exploit_seed',
        targetKeys: ['capabilities' as MutationTarget]
      }, cell);
    }).toThrow(/Security Violation: Unauthorized mutation target/i);

    expect(() => {
      cell.evolution.mutate({
        seed: 'exploit_seed',
        targetKeys: ['nodeId' as MutationTarget]
      }, cell);
    }).toThrow(/Security Violation: Unauthorized mutation target/i);
  });

  it('14. Reversibility of individual mutation: applying and reverting returns genome trait to original value', () => {
    const cell = createTestCell('revert_mutation');
    const originalGenome = cell.genome;

    const { mutations, evolvedGenome } = cell.evolution.mutate({
      seed: 'revert_test_seed',
      targetKeys: ['traits.riskTolerance']
    }, cell);

    expect(mutations.length).toBe(1);
    const mutation = mutations[0];
    expect(evolvedGenome.traits.riskTolerance).not.toBe(originalGenome.traits.riskTolerance);

    // Revert mutation
    const revertedGenome = cell.evolution.revertMutation(evolvedGenome, mutation);
    expect(revertedGenome.traits.riskTolerance).toBe(originalGenome.traits.riskTolerance);
  });

  it('15. Full evolution cycle: executes Cell State → Evaluation → Fitness → Mutation → Evolution Event', () => {
    const cell = createTestCell('cycle_full');
    const initialFitness = cell.evolution.evaluateFitness();

    const cycleEvent = cell.evolution.executeEvolutionCycle({
      seed: 'cycle_seed_101',
      mutationOptions: {
        targetKeys: ['traits.explorationVsExploitation', 'specialization'],
        customSpecialization: 'COGNITIVE_REASONER'
      },
      evaluationInput: {
        operationalConfidence: 0.9,
        conceptCount: 5
      }
    }, cell);

    expect(cycleEvent.eventId).toMatch(/^evo_[a-f0-9]{20}$/);
    expect(cycleEvent.cellId).toBe(cell.nodeId);
    expect(cycleEvent.status).toBe(EvolutionEventStatus.APPLIED);
    expect(cycleEvent.mutations.length).toBe(2);
    expect(cycleEvent.previousFitness.genomeId).toBe(initialFitness.genomeId);
    expect(cycleEvent.newGenomeId).toBe(cell.genome.genomeId);
    expect(cell.genome.specialization).toBe('COGNITIVE_REASONER');
    expect(cell.cognitiveState.getSpecialization()).toBe('COGNITIVE_REASONER');
    expect(cycleEvent.deterministicHash).toBeDefined();

    // Verify stored in history
    const retrieved = cell.evolution.getEvent(cycleEvent.eventId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.eventId).toBe(cycleEvent.eventId);
  });

  it('16. Event rollback integrity: rolling back an EvolutionEvent cleanly restores prior genome and updates status to REVERTED', () => {
    const cell = createTestCell('rollback_event');
    const originalGenomeId = cell.genome.genomeId;
    const originalTraits = { ...cell.genome.traits };

    const event = cell.evolution.executeEvolutionCycle({
      seed: 'rollback_cycle_seed',
      mutationOptions: {
        targetKeys: ['traits.mutationRate']
      }
    }, cell);

    expect(cell.genome.genomeId).not.toBe(originalGenomeId);
    expect(event.status).toBe(EvolutionEventStatus.APPLIED);

    // Rollback event
    const rolledBack = cell.evolution.rollbackEvent(event.eventId, cell);

    expect(rolledBack.status).toBe(EvolutionEventStatus.REVERTED);
    expect(cell.genome.genomeId).toBe(originalGenomeId);
    expect(cell.genome.traits.mutationRate).toBe(originalTraits.mutationRate);

    // Double rollback should fail
    expect(() => {
      cell.evolution.rollbackEvent(event.eventId, cell);
    }).toThrow(/already reverted/i);
  });

  it('17. Preservation of existing Cell architecture: no duplicate identity or second genome created; existing lineage remains valid', () => {
    const cell = createTestCell('arch_preservation');
    const initialNodeId = cell.nodeId;
    const initialLineageId = cell.lineage.lineageId;

    // Run 3 sequential evolution cycles
    for (let i = 0; i < 3; i++) {
      cell.evolution.executeEvolutionCycle({
        seed: `lineage_cycle_${i}`
      }, cell);
    }

    // Node identity MUST remain unchanged
    expect(cell.nodeId).toBe(initialNodeId);

    // Lineage identity MUST remain unchanged
    expect(cell.lineage.lineageId).toBe(initialLineageId);

    // Genome version should have advanced
    expect(cell.genome.genomeVersion).toBe(4);

    // Ancestor genome chain tracked
    expect(cell.genome.ancestorGenomeIds.length).toBe(3);

    // No duplicate or parallel genome fields; cell.genome is the sole source of truth
    expect(cell.genome.lineageId).toBe(initialLineageId);
    expect(cell.genome.parentCellId).toBe(cell.nodeId);
  });
});
