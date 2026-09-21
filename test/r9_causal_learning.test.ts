import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { MemoryCategory } from '../src/redqueen/memory/store';
import {
  Experience,
  MetabolismStatus,
  InformationCategory,
  NoveltyClassification,
  InformationRecordInput
} from '../src/redqueen/metabolism/types';
import { Context, EpistemicStatus } from '../src/redqueen/cognition/epistemic/types';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';
import { ComputationStatus } from '../src/redqueen/cognition/computation/types';
import { EvolutionEventStatus } from '../src/redqueen/evolution/types';
import { DomainKind } from '../src/redqueen/feedback/types';
import { SemanticBoundaryViolationError } from '../src/redqueen/feedback/errors';
import { computeDeterministicHash } from '../src/redqueen/cognition/computation/canonical';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * RED QUEEN — R9 CAUSAL LEARNING PIPELINE: EXPERIENCE-DRIVEN ADAPTATION
 * ============================================================================
 * 
 * Demonstrates real causal learning in production architecture:
 * Prediction / Reasoning (Cycle 1)
 * → Action / Computation (P8 Task Execution)
 * → Observation (Empirical Consequence)
 * → Experience (via cell.processObservation with causal links)
 * → Evidence (Non-destructive Conflict Grounding)
 * → Cognitive Development (via cell.developFromExperience)
 * → Learning Signal
 * → Evolution Telemetry (Causal Bridge to Phylogenetic Memory)
 * → Persistence & Process Restart
 * → Future Adaptation (Cycle 2 Reasoning shift driven by S1).
 * 
 * Strict Scientific & Causal Invariants:
 * 1. Learning is NOT "confidence monotonically increasing".
 *    Learning is a verified, persistent state transition S0 → S1 caused by
 *    empirical experience/evidence that deterministically redirects subsequent reasoning.
 * 2. Causal Traceability: Causal links bind priorStateId (S0), actionComputationId,
 *    triggeringObservationId, and resultingStateId (S1).
 * 3. Persistence: State S1, degraded concepts, and conflict evidence survive cold restart.
 * 4. Boundary Protection: Direct mutations without evidence or bypass attempts fail fast.
 * 5. Counterfactual Baseline: An identical control cell without negative feedback maintains S0.
 */

describe('R9 Causal Learning: Production Experience-Driven Adaptation', () => {
  let cellA: Cell;
  let cellB: Cell;
  let cellControl: Cell;

  const storagePathA = join(process.cwd(), '.tmp_test_causal_cell_a.json');
  const storagePathB = join(process.cwd(), '.tmp_test_causal_cell_b.json');
  const storagePathControl = join(process.cwd(), '.tmp_test_causal_cell_ctrl.json');

  const cleanTempFiles = () => {
    for (const p of [storagePathA, storagePathB, storagePathControl]) {
      if (existsSync(p)) {
        try { unlinkSync(p); } catch {}
      }
    }
  };

  const problemContext: Context = {
    contextId: 'ctx_thermal_reactor_01',
    domain: 'REACTOR_THERMAL_REGULATION'
  };

  beforeEach(async () => {
    cleanTempFiles();

    // Production-grade Cells with dedicated isolated persistence
    cellA = new Cell(storagePathA, 'dummy-key', undefined, undefined, undefined, {
      storageSecret: 'causal_secret_cell_a'
    });
    cellB = new Cell(storagePathB, 'dummy-key', undefined, undefined, undefined, {
      storageSecret: 'causal_secret_cell_b'
    });
    cellControl = new Cell(storagePathControl, 'dummy-key', undefined, undefined, undefined, {
      storageSecret: 'causal_secret_cell_ctrl'
    });

    await cellA.memory.initialize();
    await cellA.restoreOrPersistIdentity();
    await cellB.memory.initialize();
    await cellB.restoreOrPersistIdentity();
    await cellControl.memory.initialize();
    await cellControl.restoreOrPersistIdentity();
  });

  afterEach(async () => {
    if (cellA) await cellA.stop().catch(() => {});
    if (cellB) await cellB.stop().catch(() => {});
    if (cellControl) await cellControl.stop().catch(() => {});
    cleanTempFiles();
  });

  it('proves canonical causal learning pipeline: Prediction -> Action -> Observation -> Experience -> Evidence -> Development -> Telemetry -> Restart -> Adaptation', async () => {
    // =========================================================================
    // STAGE 1: INITIAL STATE S0 & DATASET METABOLISM
    // =========================================================================
    const initialDataset = [
      {
        sourceId: 'sensor_telemetry_cooling_grid',
        parameter: 'core_coolant_flow',
        value: 120.5,
        unit: 'liters_per_minute',
        recommendedPolicy: 'MAX_THROUGHPUT_OVERDRIVE',
        status: 'SURGE_WARNING',
        confidence: 0.88
      }
    ];

    await cellA.ingestDataset(initialDataset);
    await cellControl.ingestDataset(initialDataset);

    // Assert initial episodic memory assimilation
    const episodicMemories = await cellA.memory.search({ category: MemoryCategory.EPISODIC });
    expect(episodicMemories.length).toBeGreaterThanOrEqual(1);

    // Initial domain handbook knowledge metabolized
    const handbookInput: InformationRecordInput = {
      sourceType: 'LOCAL_DATA',
      sourceIdentifier: 'reactor_safety_handbook_ch4',
      content: JSON.stringify({ rule: 'Overdrive flow immediately when temperature surges.' }),
      contentType: 'application/json',
      originatingCellId: cellA.nodeId
    };
    const metabolismResult = await cellA.metabolize(handbookInput);
    expect(metabolismResult.status).toBe(MetabolismStatus.ACCEPTED);

    // Form initial representation and ground primary evidence
    const strategyConceptId = 'concept_policy_overdrive';
    const primaryEvidenceId = `ev_surge_${metabolismResult.informationId}`;
    const primaryEvidence = {
      evidenceId: primaryEvidenceId,
      sourceId: cellA.nodeId,
      observationId: metabolismResult.informationId,
      timestamp: new Date().toISOString(),
      confidence: 0.95,
      provenance: {
        sourceId: cellA.nodeId,
        timestamp: new Date().toISOString(),
        supportingRepresentationIds: [strategyConceptId],
        derivedFrom: [metabolismResult.informationId]
      },
      context: problemContext
    };
    await cellA.cognitiveGraph.insertEvidence(primaryEvidence);

    const initialConcept = await cellA.cognitiveGraph.insertConcept({
      conceptId: strategyConceptId,
      canonicalName: 'MaxThroughputOverdrivePolicy',
      description: 'Force coolant pump to maximum overdrive RPM during thermal surges',
      category: InformationCategory.OPERATING_SYSTEM,
      sourceKnowledgeIds: [metabolismResult.knowledgeId || metabolismResult.informationId],
      sourceExperienceIds: [],
      evidenceIds: [primaryEvidenceId],
      confidence: 0.50,
      provenance: [cellA.nodeId, 'sensor_telemetry_cooling_grid'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cellA.nodeId,
      metadata: { targetActuator: 'PRIMARY_COOLANT_PUMP' }
    });

    // Replicate baseline state to cellControl for rigorous counterfactual comparison
    await cellControl.cognitiveGraph.insertEvidence({
      ...primaryEvidence,
      sourceId: cellControl.nodeId,
      provenance: {
        ...primaryEvidence.provenance,
        sourceId: cellControl.nodeId
      }
    });
    await cellControl.cognitiveGraph.insertConcept({
      ...initialConcept,
      originatingCellId: cellControl.nodeId,
      provenance: [cellControl.nodeId, 'sensor_telemetry_cooling_grid']
    });

    // Capture initial State S0
    const stateS0 = cellA.cognitiveState.getState();
    const stateS0Id = computeDeterministicHash(stateS0);
    expect(stateS0Id).toBeDefined();

    // =========================================================================
    // STAGE 2: PREDICTION & REASONING (CYCLE 1)
    // =========================================================================
    const understanding1 = cellA.understanding.compose({
      context: problemContext,
      originatingCellId: cellA.nodeId,
      concepts: [initialConcept],
      evidences: [primaryEvidence],
      summary: 'Baseline model supporting pump overdrive under surge'
    });

    const worldModelCycle1 = cellA.worldModel.compose({
      context: problemContext,
      originatingCellId: cellA.nodeId,
      understandings: [understanding1],
      graph: cellA.cognitiveGraph
    });

    // Verify World Model 1 belief state: Positive belief mass, zero disbelief
    expect(worldModelCycle1.uncertainty.belief).toBeGreaterThan(0.2);
    expect(worldModelCycle1.uncertainty.disbelief).toBe(0.0);
    const initialBelief = worldModelCycle1.uncertainty.belief;
    const initialDisbelief = worldModelCycle1.uncertainty.disbelief;

    const hypothesisStatement = 'Deploy MaxThroughputOverdrivePolicy to stabilize thermal surge.';
    const reasoningCycle1 = cellA.reasoning.reason({
      goal: 'Resolve reactor thermal surge',
      context: problemContext,
      originatingCellId: cellA.nodeId,
      worldModel: worldModelCycle1,
      minEvidenceThreshold: 0.2,
      premises: [
        {
          premiseId: 'premise_thermal_surge',
          statement: 'Thermal surge detected on cooling grid telemetry.',
          confidence: 0.9,
          evidenceIds: [primaryEvidence.evidenceId]
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'hyp_primary_overdrive',
          statement: hypothesisStatement,
          targetConceptId: strategyConceptId,
          confidence: 0.85
        }
      ],
      alternatives: [
        {
          hypothesisId: 'hyp_auxiliary_heatexchanger',
          statement: 'Engage auxiliary low-pressure heat exchangers.',
          confidence: 0.4,
          reason: 'Secondary cooling loop without pump strain'
        }
      ]
    }, cellA.cognitiveGraph);

    // Assert Decision 1: Overdrive hypothesis is adopted without contradiction
    expect(reasoningCycle1.verification.hasContradiction).toBe(false);
    expect(reasoningCycle1.verification.counterEvidenceIds.length).toBe(0);
    expect([EpistemicStatus.BELIEVED, EpistemicStatus.HYPOTHESIS]).toContain(
      reasoningCycle1.verification.epistemicStatus
    );
    expect(reasoningCycle1.conclusion.statement).toBe(hypothesisStatement);

    // =========================================================================
    // STAGE 3: ACTION / COMPUTATION EXECUTION (P8 COLLECTIVE TASK)
    // =========================================================================
    const actionTask1 = cellA.collectiveComputation.createTask({
      goal: 'Execute Coolant Pump Overdrive Sequence',
      computationType: 'COGNITIVE_REASONING',
      payload: {
        targetConceptId: strategyConceptId,
        actuatorSpeedRpm: 12000,
        mode: 'FORCE_OVERDRIVE'
      }
    });

    const computationResult1 = await cellA.collectiveComputation.executeTask(actionTask1, {
      availableCells: [cellA, cellB]
    });
    expect(computationResult1.status).toBe(ComputationStatus.COMPLETED);
    expect(computationResult1.taskId).toBe(actionTask1.taskId);

    // =========================================================================
    // STAGE 4: EVENT E -> EMPIRICAL OBSERVATION O (CONTRADICTION IN THE WORLD)
    // =========================================================================
    // The overdrive action at 12,000 RPM triggered acute cavitation and pump rupture.
    const empiricalObservation = {
      domainKind: DomainKind.OBSERVATION,
      observedSubject: 'MaxThroughputOverdrivePolicy',
      source: 'sensor_telemetry_actuator_feedback',
      confidence: 0.96,
      content: {
        status: 'CONTRADICTED',
        contradicts: true,
        anomaly: 'PUMP_CAVITATION_FAILURE',
        rpmObserved: 12000,
        error: 'Impeller cavitation rupture at 12,000 RPM under overdrive policy'
      }
    };

    // =========================================================================
    // STAGE 5: OBSERVATION O -> EXPERIENCE X (VIA CANONICAL TRANSITION)
    // =========================================================================
    const transitionResult = await cellA.processObservation(empiricalObservation, {
      actionComputationId: actionTask1.taskId,
      expectedContradiction: true,
      cycleNumber: 1
    });

    expect(transitionResult.status).toBe('CREATED');
    expect(transitionResult.experience).toBeDefined();

    const experience = transitionResult.experience;
    expect(experience.noveltyClassification).toBe(NoveltyClassification.CONTRADICTION);
    expect(experience.verificationStatus).toBe('CONTRADICTED_BY_WORLD');

    // Verify rigorous causal links connecting S0, Action, Observation, and Experience
    expect(experience.causalLinks).toBeDefined();
    expect(experience.causalLinks?.priorStateId).toBe(stateS0Id);
    expect(experience.causalLinks?.actionComputationId).toBe(actionTask1.taskId);
    expect(experience.causalLinks?.triggeringObservationId).toBeDefined();
    expect(experience.causalLinks?.resultingStateId).toBeDefined();

    // Verify non-destructive conflict evidence was grounded in CognitiveGraph
    const conflictEvidenceId = experience.causalLinks?.evidenceIds?.[0];
    expect(conflictEvidenceId).toBeDefined();
    const conflictEvidence = cellA.cognitiveGraph.getEvidence(conflictEvidenceId!);
    expect(conflictEvidence).toBeDefined();
    expect(conflictEvidence?.provenance.contradictingRepresentationIds).toContain(strategyConceptId);

    // =========================================================================
    // STAGE 6: EXPERIENCE X -> COGNITIVE DEVELOPMENT L -> STATE S1
    // =========================================================================
    // Canonical developmental learning update
    const learningResult = await cellA.developFromExperience(experience, {
      context: problemContext,
      relatedConceptIds: [strategyConceptId]
    });

    expect(learningResult.conceptsWeakened).toContain(strategyConceptId);
    expect(learningResult.conflictsDetected).toBeGreaterThanOrEqual(1);

    // Verify concept state in CognitiveGraph was causally transformed
    const degradedConcept = cellA.cognitiveGraph.getConcept(strategyConceptId);
    expect(degradedConcept).toBeDefined();
    expect(degradedConcept!.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);
    expect(degradedConcept!.confidence).toBeLessThan(0.35); // Weakened by empirical evidence
    expect(degradedConcept!.evidenceIds).toContain(conflictEvidenceId!);

    // Capture resulting State S1
    const stateS1 = cellA.cognitiveState.getState();
    const stateS1Id = computeDeterministicHash(stateS1);

    // VERIFY S1 DIFFERS FROM S0 ONLY THROUGH VALID CAUSAL TRANSITION
    expect(stateS1Id).not.toBe(stateS0Id);
    expect(stateS1.experienceReferences.length).toBe(stateS0.experienceReferences.length + 1);
    expect(stateS0.experienceReferences).not.toContain(experience.experienceId);
    expect(stateS1.experienceReferences).toContain(experience.experienceId);
    expect(stateS1.knowledgeGaps.length).toBeGreaterThanOrEqual(1);

    // =========================================================================
    // STAGE 7: LEARNING SIGNAL -> EVOLUTION TELEMETRY
    // =========================================================================
    // developFromExperience automatically bridged the learning signal into evolution telemetry
    const evolutionTelemetryList = cellA.evolution.getExperienceTelemetry(cellA.nodeId);
    expect(evolutionTelemetryList.length).toBeGreaterThanOrEqual(1);

    const latestTelemetry = evolutionTelemetryList[evolutionTelemetryList.length - 1];
    expect(latestTelemetry.cellId).toBe(cellA.nodeId);
    expect(latestTelemetry.metrics.predictionAccuracy).toBe(0.0); // 0.0 because of CONTRADICTED_BY_WORLD
    expect(latestTelemetry.metrics.verificationResult).toBe('CONTRADICTED_BY_WORLD');
    expect(latestTelemetry.metrics.adaptation.conflictsDetected).toBeGreaterThanOrEqual(1);
    expect(latestTelemetry.metrics.adaptation.conceptsAdapted).toBeGreaterThanOrEqual(1);

    // =========================================================================
    // STAGE 8: PERSISTENCE & COLD RESTART VERIFICATION
    // =========================================================================
    // Persist memory & cognitive state to disk
    await cellA.cognitiveState.persist(cellA.memory);
    await cellA.stop();

    // Cold restart: Reconstruct Cell from disk storage using canonical loadFromStorage
    const restartedCell = await Cell.loadFromStorage(storagePathA, 'dummy-key', undefined, {
      storageSecret: 'causal_secret_cell_a'
    });
    await restartedCell.memory.initialize();
    await restartedCell.restoreOrPersistIdentity();
    await restartedCell.restoreOrPersistGenome();
    await restartedCell.cognitiveState.restore(restartedCell.memory);
    await restartedCell.cognitiveGraph.load();
    await restartedCell.recoverExperiences();
    await restartedCell.recoverEvolutionTelemetry();

    // Verify S1 persisted accurately across restart
    const restoredState = restartedCell.cognitiveState.getState();
    expect(restoredState.experienceReferences).toContain(experience.experienceId);
    expect(restoredState.knowledgeGaps.length).toBe(stateS1.knowledgeGaps.length);
    expect(restoredState.knowledgeGaps[0].topic).toBe(stateS1.knowledgeGaps[0].topic);

    const persistedConcept = restartedCell.cognitiveGraph.getConcept(strategyConceptId);
    expect(persistedConcept).toBeDefined();
    expect(persistedConcept?.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);
    expect(persistedConcept?.confidence).toBe(degradedConcept?.confidence);

    const persistedEvidence = restartedCell.cognitiveGraph.getEvidence(conflictEvidenceId!);
    expect(persistedEvidence).toBeDefined();
    expect(persistedEvidence?.provenance.contradictingRepresentationIds).toContain(strategyConceptId);

    // =========================================================================
    // STAGE 9: CYCLE 2 RE-EVALUATION (PROVE S1 AFFECTS FUTURE COGNITIVE OUTPUT)
    // =========================================================================
    // Re-compose Understanding and World Model under the same problem scenario
    const understanding2 = restartedCell.understanding.compose({
      context: problemContext,
      originatingCellId: restartedCell.nodeId,
      concepts: [persistedConcept!],
      evidences: [primaryEvidence, persistedEvidence!],
      summary: 'Updated model reflecting pump cavitation failure'
    });

    const worldModelCycle2 = restartedCell.worldModel.compose({
      context: problemContext,
      originatingCellId: restartedCell.nodeId,
      understandings: [understanding2],
      graph: restartedCell.cognitiveGraph
    });

    // Assert Causal World Model Update: Disbelief increased, belief decreased
    expect(worldModelCycle2.uncertainty.disbelief).toBeGreaterThan(initialDisbelief);
    expect(worldModelCycle2.uncertainty.belief).toBeLessThan(initialBelief);

    // Reasoning Cycle 2: Cell evaluates the exact same problem scenario
    const reasoningCycle2 = restartedCell.reasoning.reason({
      goal: 'Resolve reactor thermal surge',
      context: problemContext,
      originatingCellId: restartedCell.nodeId,
      worldModel: worldModelCycle2,
      counterEvidences: [conflictEvidenceId!],
      premises: [
        {
          premiseId: 'premise_thermal_surge_recurrent',
          statement: 'Thermal surge detected on cooling grid telemetry.',
          confidence: 0.9,
          evidenceIds: [primaryEvidence.evidenceId]
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'hyp_primary_overdrive',
          statement: hypothesisStatement,
          targetConceptId: strategyConceptId,
          confidence: 0.85
        }
      ],
      alternatives: [
        {
          hypothesisId: 'hyp_auxiliary_heatexchanger',
          statement: 'Engage auxiliary low-pressure heat exchangers.',
          confidence: 0.92,
          reason: 'Averts cavitation risk through secondary low-pressure loop'
        }
      ]
    }, restartedCell.cognitiveGraph);

    // Assert Causal Decision Shift:
    // The previous decision (Overdrive) is now actively CONTRADICTED and REJECTED
    expect(reasoningCycle2.verification.hasContradiction).toBe(true);
    expect(reasoningCycle2.verification.epistemicStatus).toBe(EpistemicStatus.CONTRADICTED);
    expect(reasoningCycle2.verification.counterEvidenceIds).toContain(conflictEvidenceId);

    // Cell adopts the alternative policy
    const adaptedTask = restartedCell.collectiveComputation.createTask({
      goal: 'Engage Auxiliary Low-Pressure Heat Exchangers',
      computationType: 'COGNITIVE_REASONING',
      payload: {
        strategy: 'AUXILIARY_HEAT_EXCHANGERS',
        maxRpmCap: 3000
      }
    });

    const adaptedResult = await restartedCell.collectiveComputation.executeTask(adaptedTask, {
      availableCells: [restartedCell]
    });
    expect(adaptedResult.status).toBe(ComputationStatus.COMPLETED);
    expect(adaptedResult.taskId).not.toBe(actionTask1.taskId);

    // =========================================================================
    // STAGE 10: COUNTERFACTUAL PROOF (ISOLATED CONTROL CELL)
    // =========================================================================
    // Verify that cellControl (which did NOT experience the failure) still believes the overdrive policy
    const controlConcept = cellControl.cognitiveGraph.getConcept(strategyConceptId);
    expect(controlConcept?.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
    expect(controlConcept?.confidence).toBe(0.50);

    const controlUnderstanding = cellControl.understanding.compose({
      context: problemContext,
      originatingCellId: cellControl.nodeId,
      concepts: [controlConcept!],
      evidences: [cellControl.cognitiveGraph.getAllEvidences()[0]],
      summary: 'Control baseline model'
    });

    const controlWorldModel = cellControl.worldModel.compose({
      context: problemContext,
      originatingCellId: cellControl.nodeId,
      understandings: [controlUnderstanding],
      graph: cellControl.cognitiveGraph
    });

    const controlReasoning = cellControl.reasoning.reason({
      goal: 'Resolve reactor thermal surge',
      context: problemContext,
      originatingCellId: cellControl.nodeId,
      worldModel: controlWorldModel,
      minEvidenceThreshold: 0.2,
      premises: [
        {
          premiseId: 'ctrl_premise',
          statement: 'Thermal surge detected.',
          confidence: 0.9,
          evidenceIds: [cellControl.cognitiveGraph.getAllEvidences()[0].evidenceId]
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'ctrl_hyp',
          statement: hypothesisStatement,
          targetConceptId: strategyConceptId,
          confidence: 0.85
        }
      ],
      alternatives: [
        {
          hypothesisId: 'ctrl_alt',
          statement: 'Engage auxiliary low-pressure heat exchangers.',
          confidence: 0.4,
          reason: 'Control baseline alternative'
        }
      ]
    }, cellControl.cognitiveGraph);

    // Control cell still maintains belief without contradiction
    expect(controlReasoning.verification.hasContradiction).toBe(false);
    expect([EpistemicStatus.BELIEVED, EpistemicStatus.HYPOTHESIS]).toContain(
      controlReasoning.verification.epistemicStatus
    );

    await restartedCell.stop();
  });

  it('enforces that no hidden direct state mutation bypasses the learning and evidence subsystems', async () => {
    // 1. Belief update without grounding evidence is rejected
    await expect(
      cellA.cognitiveDevelopment.weakenBelief(
        'concept_dummy',
        problemContext,
        [], // empty evidence
        'Attempting direct mutation without evidence'
      )
    ).rejects.toThrow(/Evidence is required/);

    // 2. Direct ComputationResult masquerading as Observation is rejected (Semantic Boundary Violation)
    const illegalComputationResult = {
      domainKind: DomainKind.COMPUTATION_RESULT,
      taskId: 'task_illegal_01',
      status: ComputationStatus.COMPLETED
    };

    await expect(
      cellA.processObservation(illegalComputationResult)
    ).rejects.toThrow(SemanticBoundaryViolationError);

    // 3. Observation missing mandatory observedSubject is rejected
    const invalidObservation = {
      domainKind: DomainKind.OBSERVATION,
      observedSubject: '',
      source: 'sensor_faulty'
    };

    await expect(
      cellA.processObservation(invalidObservation)
    ).rejects.toThrow(/observedSubject/);

    // 4. Verify Cell state remained pristine and was not mutated by rejected operations
    const state = cellA.cognitiveState.getState();
    expect(state.experienceReferences).toHaveLength(0);
  });

  it('guarantees deterministic causal learning across identical runs with identical feedback', async () => {
    const cellD1 = new Cell(join(process.cwd(), '.tmp_test_causal_d1.json'), 'dummy-key', undefined, undefined, undefined, {
      storageSecret: 'causal_secret_d1'
    });
    const cellD2 = new Cell(join(process.cwd(), '.tmp_test_causal_d2.json'), 'dummy-key', undefined, undefined, undefined, {
      storageSecret: 'causal_secret_d2'
    });

    try {
      await cellD1.memory.initialize();
      await cellD2.memory.initialize();

      const conceptPayload = {
        conceptId: 'concept_deterministic_target',
        canonicalName: 'DeterministicSafetyRule',
        description: 'Fixed test rule for determinism verification',
        category: InformationCategory.OPERATING_SYSTEM,
        sourceKnowledgeIds: ['k_fixed'],
        sourceExperienceIds: [],
        confidence: 0.8,
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        version: 1,
        metadata: {}
      };

      await cellD1.cognitiveGraph.insertConcept({ ...conceptPayload, originatingCellId: cellD1.nodeId, provenance: [cellD1.nodeId] });
      await cellD2.cognitiveGraph.insertConcept({ ...conceptPayload, originatingCellId: cellD2.nodeId, provenance: [cellD2.nodeId] });

      const fixedExperience: Experience = {
        experienceId: 'exp_fixed_deterministic_01',
        transactionId: 'tx_fixed',
        cellId: 'fixed_origin',
        timestamp: '2026-01-01T00:00:00.000Z',
        informationId: 'info_fixed',
        knowledgeIds: ['k_fixed'],
        category: InformationCategory.OPERATING_SYSTEM,
        outcome: MetabolismStatus.FAILED,
        noveltyClassification: NoveltyClassification.CONTRADICTION,
        noveltyScore: 0.9,
        source: 'DETERMINISTIC_TEST',
        confidence: 0.95
      };

      await cellD1.developFromExperience(fixedExperience, {
        context: problemContext,
        relatedConceptIds: ['concept_deterministic_target']
      });
      await cellD2.developFromExperience(fixedExperience, {
        context: problemContext,
        relatedConceptIds: ['concept_deterministic_target']
      });

      const updated1 = cellD1.cognitiveGraph.getConcept('concept_deterministic_target');
      const updated2 = cellD2.cognitiveGraph.getConcept('concept_deterministic_target');

      // Both cells arrived at mathematically exact same confidence and verificationStatus
      expect(updated1?.confidence).toBe(updated2?.confidence);
      expect(updated1?.verificationStatus).toBe(updated2?.verificationStatus);
      expect(updated1?.version).toBe(updated2?.version);
    } finally {
      await cellD1.stop();
      await cellD2.stop();
      try { unlinkSync(join(process.cwd(), '.tmp_test_causal_d1.json')); } catch {}
      try { unlinkSync(join(process.cwd(), '.tmp_test_causal_d2.json')); } catch {}
    }
  });
});
