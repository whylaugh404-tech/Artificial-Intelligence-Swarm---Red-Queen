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
import { RepresentationVerificationStatus, CognitiveRelationPredicate, CognitiveGeneralization } from '../src/redqueen/cognition/representation/types';
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

  it('proves autonomous generalization formation from experience, cross-restart persistence, and selective reasoning impact (Case B affected, Case C unaffected, Control unaffected, Deterministic Replay)', async () => {
    const generalConceptId = 'concept_policy_overdrive_general';
    const unit1ConceptId = 'concept_policy_overdrive_unit_1';
    const unit2ConceptId = 'concept_policy_overdrive_unit_2';
    const unit3ConceptId = 'concept_policy_overdrive_unit_3';
    const caseCConceptId = 'concept_auxiliary_solar_sensor';
    const nowIso = new Date().toISOString();

    const initialGeneralConcept = {
      conceptId: generalConceptId,
      canonicalName: 'GeneralHighSpeedCoolantOverdrivePolicy',
      description: 'System-wide policy to force coolant flow into overdrive RPM during reactor surges',
      category: InformationCategory.OPERATING_SYSTEM,
      sourceKnowledgeIds: ['k_general_reactor_rules'],
      sourceExperienceIds: [],
      confidence: 0.85,
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: nowIso,
      updatedAt: nowIso,
      version: 1,
      metadata: {}
    };

    const initialUnit1Concept = {
      conceptId: unit1ConceptId,
      canonicalName: 'CoolantPumpOverdriveUnit1',
      description: 'Drive Cooling Pump 1 at 12000 RPM in Reactor Grid Sector Alpha',
      category: InformationCategory.OPERATING_SYSTEM,
      sourceKnowledgeIds: ['k_unit_1_specs'],
      sourceExperienceIds: [],
      confidence: 0.85,
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: nowIso,
      updatedAt: nowIso,
      version: 1,
      metadata: { unit: 'UNIT_1', sector: 'ALPHA' }
    };

    const initialUnit2Concept = {
      conceptId: unit2ConceptId,
      canonicalName: 'CoolantPumpOverdriveUnit2',
      description: 'Drive Cooling Pump 2 at 12000 RPM in Reactor Grid Sector Beta',
      category: InformationCategory.OPERATING_SYSTEM,
      sourceKnowledgeIds: ['k_unit_2_specs'],
      sourceExperienceIds: [],
      confidence: 0.85,
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: nowIso,
      updatedAt: nowIso,
      version: 1,
      metadata: { unit: 'UNIT_2', sector: 'BETA' }
    };

    const initialUnit3Concept = {
      conceptId: unit3ConceptId,
      canonicalName: 'CoolantPumpOverdriveUnit3',
      description: 'Drive Cooling Pump 3 at 12000 RPM in Reactor Grid Sector Gamma (Never operated under surge)',
      category: InformationCategory.OPERATING_SYSTEM,
      sourceKnowledgeIds: ['k_unit_3_specs'],
      sourceExperienceIds: [],
      confidence: 0.85,
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: nowIso,
      updatedAt: nowIso,
      version: 1,
      metadata: { unit: 'UNIT_3', sector: 'GAMMA' }
    };

    const initialCaseCConcept = {
      conceptId: caseCConceptId,
      canonicalName: 'AuxiliarySolarRadiationSensor',
      description: 'Monitor external photovoltaic and cosmic radiation levels',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      sourceKnowledgeIds: ['k_solar_specs'],
      sourceExperienceIds: [],
      confidence: 0.9,
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: nowIso,
      updatedAt: nowIso,
      version: 1,
      metadata: { subsystem: 'SOLAR' }
    };

    // Helper to populate initial knowledge graph without any manual generalizations
    const populateInitialGraph = async (cell: Cell) => {
      await cell.cognitiveGraph.insertConcept({ ...initialGeneralConcept, originatingCellId: cell.nodeId, provenance: [cell.nodeId] });
      await cell.cognitiveGraph.insertConcept({ ...initialUnit1Concept, originatingCellId: cell.nodeId, provenance: [cell.nodeId] });
      await cell.cognitiveGraph.insertConcept({ ...initialUnit2Concept, originatingCellId: cell.nodeId, provenance: [cell.nodeId] });
      await cell.cognitiveGraph.insertConcept({ ...initialUnit3Concept, originatingCellId: cell.nodeId, provenance: [cell.nodeId] });
      await cell.cognitiveGraph.insertConcept({ ...initialCaseCConcept, originatingCellId: cell.nodeId, provenance: [cell.nodeId] });

      await cell.cognitiveGraph.insertRelation({
        relationId: `rel_${cell.nodeId.substring(0, 6)}_unit1_instance`,
        subjectConceptId: unit1ConceptId,
        predicate: CognitiveRelationPredicate.INSTANCE_OF,
        objectConceptId: generalConceptId,
        confidence: 0.9,
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        provenance: [cell.nodeId],
        createdAt: nowIso,
        originatingCellId: cell.nodeId,
        metadata: {}
      });

      await cell.cognitiveGraph.insertRelation({
        relationId: `rel_${cell.nodeId.substring(0, 6)}_unit2_instance`,
        subjectConceptId: unit2ConceptId,
        predicate: CognitiveRelationPredicate.INSTANCE_OF,
        objectConceptId: generalConceptId,
        confidence: 0.9,
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        provenance: [cell.nodeId],
        createdAt: nowIso,
        originatingCellId: cell.nodeId,
        metadata: {}
      });

      await cell.cognitiveGraph.insertRelation({
        relationId: `rel_${cell.nodeId.substring(0, 6)}_unit3_instance`,
        subjectConceptId: unit3ConceptId,
        predicate: CognitiveRelationPredicate.INSTANCE_OF,
        objectConceptId: generalConceptId,
        confidence: 0.9,
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        provenance: [cell.nodeId],
        createdAt: nowIso,
        originatingCellId: cell.nodeId,
        metadata: {}
      });
    };

    await populateInitialGraph(cellA);
    await populateInitialGraph(cellControl);

    // Strict invariant: NO CognitiveGeneralization is manually inserted as input
    expect(cellA.cognitiveGraph.getAllGeneralizations().length).toBe(0);
    expect(cellControl.cognitiveGraph.getAllGeneralizations().length).toBe(0);

    // Initial state S0
    const stateS0 = cellA.cognitiveState.getState();
    const stateS0Hash = computeDeterministicHash(stateS0);

    // 1. REQUIREMENT 7: Control cell without Experience A has NO generalization
    // Control cell reasoning on Case B (Unit 3 in Sector Gamma) before any experience
    const contextCaseB: Context = {
      contextId: 'ctx_cooling_unit_3_gamma',
      domain: 'REACTOR_SECTOR_GAMMA_COOLING'
    };

    const controlReasoningCaseB = cellControl.reasoning.reason({
      goal: 'Regulate thermal surge in Sector Gamma using Unit 3',
      context: contextCaseB,
      originatingCellId: cellControl.nodeId,
      minEvidenceThreshold: 0.2,
      premises: [
        {
          premiseId: 'premise_gamma_surge',
          statement: 'Thermal surge detected in Sector Gamma.',
          confidence: 0.9
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'hyp_unit3_overdrive',
          statement: 'Deploy CoolantPumpOverdriveUnit3 to regulate Sector Gamma surge.',
          targetConceptId: unit3ConceptId,
          confidence: 0.85
        }
      ],
      alternatives: [
        {
          hypothesisId: 'hyp_gamma_passive_heatexchanger',
          statement: 'Engage Sector Gamma passive heat exchangers.',
          confidence: 0.5,
          reason: 'Secondary passive cooling'
        }
      ]
    }, cellControl.cognitiveGraph);

    expect(cellControl.cognitiveGraph.getAllGeneralizations().length).toBe(0);
    expect(controlReasoningCaseB.verification.hasContradiction).toBe(false);
    expect(controlReasoningCaseB.verification.epistemicStatus).not.toBe(EpistemicStatus.CONTRADICTED);

    // 2. REQUIREMENT 1 & 2: Experience A alone -> NO generalization formed
    const observationA = {
      domainKind: DomainKind.OBSERVATION,
      observedSubject: 'CoolantPumpOverdriveUnit1',
      source: 'sensor_telemetry_unit_1_monitoring',
      confidence: 0.98,
      content: {
        status: 'CONTRADICTED',
        contradicts: true,
        anomaly: 'IMPELLER_CAVITATION_RUPTURE',
        details: 'Unit 1 suffered severe mechanical destruction under 12000 RPM overdrive'
      }
    };

    // Process Observation A -> Experience A
    const transitionResultA = await cellA.processObservation(observationA, {
      actionComputationId: 'task_exec_overdrive_unit_1',
      expectedContradiction: true,
      cycleNumber: 1,
      enableCognitiveDevelopment: false
    });
    expect(transitionResultA.status).toBe('CREATED');
    const experienceA = transitionResultA.experience;
    expect(experienceA.noveltyClassification).toBe(NoveltyClassification.CONTRADICTION);
    expect(experienceA.verificationStatus).toBe('CONTRADICTED_BY_WORLD');

    // Develop from Experience A alone
    const learningResultA = await cellA.developFromExperience(experienceA, {
      context: { contextId: 'ctx_unit_1_incident', domain: 'INCIDENT_RESPONSE' },
      relatedConceptIds: [unit1ConceptId]
    });

    // R9 WAJIB 1: Experience A alone must NOT form a generalization!
    expect(learningResultA.conceptsWeakened).toContain(unit1ConceptId);
    expect(learningResultA.generalizationsFormed?.length || 0).toBe(0);
    expect(cellA.cognitiveGraph.getAllGeneralizations().length).toBe(0);

    // Parent concept must not be marked CONTRADICTED from a single isolated child experience
    const parentConceptAfterA = cellA.cognitiveGraph.getConcept(generalConceptId);
    expect(parentConceptAfterA?.verificationStatus).not.toBe(RepresentationVerificationStatus.CONTRADICTED);

    // Unit 3 (unaffected new instance) reasoning before Experience B: NO contradiction anticipated yet
    const reasoningUnit3BeforeB = cellA.reasoning.reason({
      goal: 'Regulate thermal surge in Sector Gamma using Unit 3',
      context: contextCaseB,
      originatingCellId: cellA.nodeId,
      minEvidenceThreshold: 0.2,
      premises: [
        {
          premiseId: 'premise_gamma_surge_eval_pre',
          statement: 'Thermal surge detected in Sector Gamma.',
          confidence: 0.9
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'hyp_unit3_overdrive',
          statement: 'Deploy CoolantPumpOverdriveUnit3 to regulate Sector Gamma surge.',
          targetConceptId: unit3ConceptId,
          confidence: 0.85
        }
      ]
    }, cellA.cognitiveGraph);
    expect(reasoningUnit3BeforeB.verification.hasContradiction).toBe(false);
    expect(reasoningUnit3BeforeB.verification.epistemicStatus).not.toBe(EpistemicStatus.CONTRADICTED);

    // 3. R9 WAJIB 2: Experience B (Unit 2) with compatible pattern -> Generalization CREATED!
    const observationB = {
      domainKind: DomainKind.OBSERVATION,
      observedSubject: 'CoolantPumpOverdriveUnit2',
      source: 'sensor_telemetry_unit_2_monitoring',
      confidence: 0.98,
      content: {
        status: 'CONTRADICTED',
        contradicts: true,
        anomaly: 'IMPELLER_CAVITATION_RUPTURE',
        details: 'Unit 2 suffered mechanical cavitation destruction under 12000 RPM overdrive in Sector Beta'
      }
    };

    const transitionResultB = await cellA.processObservation(observationB, {
      actionComputationId: 'task_exec_overdrive_unit_2',
      expectedContradiction: true,
      cycleNumber: 2,
      enableCognitiveDevelopment: false
    });
    expect(transitionResultB.status).toBe('CREATED');
    const experienceB = transitionResultB.experience;
    expect(experienceB.noveltyClassification).toBe(NoveltyClassification.CONTRADICTION);

    const learningResultB = await cellA.developFromExperience(experienceB, {
      context: { contextId: 'ctx_unit_2_incident', domain: 'INCIDENT_RESPONSE' },
      relatedConceptIds: [unit2ConceptId]
    });

    expect(learningResultB.conceptsWeakened).toContain(unit2ConceptId);
    expect(learningResultB.generalizationsFormed?.length).toBeGreaterThanOrEqual(1);

    const formedGenId = learningResultB.generalizationsFormed![0];
    const discoveredGen = cellA.cognitiveGraph.getGeneralization(formedGenId);
    expect(discoveredGen).toBeDefined();
    expect(discoveredGen?.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);
    expect(discoveredGen?.pattern).toMatch(/risk invariant|cavitation/i);
    expect(discoveredGen?.sourceConceptIds).toContain(generalConceptId);
    expect(discoveredGen?.confidence).toBeGreaterThanOrEqual(0.75);

    // R9 WAJIB 8: Assert provenance points to >= 2 independent Experiences / evidence records
    expect(discoveredGen?.supportingEvidence.length).toBeGreaterThanOrEqual(2);
    expect(discoveredGen?.evidenceIds?.length).toBeGreaterThanOrEqual(2);
    expect(discoveredGen?.provenance).toContain(experienceA.experienceId);
    expect(discoveredGen?.provenance).toContain(experienceB.experienceId);
    expect(discoveredGen?.provenance.length).toBeGreaterThanOrEqual(2);

    // 4. R9 WAJIB 5: Irrelevant Experience C does NOT mistakenly expand or alter the generalization
    const observationC = {
      domainKind: DomainKind.OBSERVATION,
      observedSubject: 'AuxiliarySolarRadiationSensor',
      source: 'sensor_telemetry_solar_monitoring',
      confidence: 0.95,
      content: {
        status: 'COMPLETED',
        radiationFlux: 1361.0,
        details: 'Standard solar irradiance telemetry, fully nominal'
      }
    };
    const transitionResultC = await cellA.processObservation(observationC, {
      actionComputationId: 'task_poll_solar_sensor',
      cycleNumber: 3,
      enableCognitiveDevelopment: false
    });
    const experienceC = transitionResultC.experience;
    await cellA.developFromExperience(experienceC, {
      context: { contextId: 'ctx_solar_polling', domain: 'SOLAR_ARRAY_MONITORING' },
      relatedConceptIds: [caseCConceptId]
    });

    const genAfterC = cellA.cognitiveGraph.getGeneralization(formedGenId);
    expect(genAfterC?.sourceConceptIds).not.toContain(caseCConceptId);
    expect(genAfterC?.provenance).not.toContain(experienceC.experienceId);

    // Persistent state S1 verification
    const stateS1 = cellA.cognitiveState.getState();
    const stateS1Hash = computeDeterministicHash(stateS1);
    expect(stateS1Hash).not.toBe(stateS0Hash);
    expect(stateS1.experienceReferences).toContain(experienceA.experienceId);
    expect(stateS1.experienceReferences).toContain(experienceB.experienceId);

    // 5. R9 WAJIB 3: Generalization survives Cold Restart
    await cellA.cognitiveState.persist(cellA.memory);
    await cellA.stop();

    const restartedCellA = await Cell.loadFromStorage(storagePathA, 'dummy-key', undefined, {
      storageSecret: 'causal_secret_cell_a'
    });
    await restartedCellA.memory.initialize();
    await restartedCellA.restoreOrPersistIdentity();
    await restartedCellA.restoreOrPersistGenome();
    await restartedCellA.cognitiveState.restore(restartedCellA.memory);
    await restartedCellA.cognitiveGraph.load();
    await restartedCellA.recoverExperiences();

    const restoredGen = restartedCellA.cognitiveGraph.getGeneralization(formedGenId);
    expect(restoredGen).toBeDefined();
    expect(restoredGen?.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);
    expect(restoredGen?.pattern).toBe(discoveredGen?.pattern);
    expect(restoredGen?.supportingEvidence.length).toBeGreaterThanOrEqual(2);
    expect(restoredGen?.provenance).toContain(experienceA.experienceId);
    expect(restoredGen?.provenance).toContain(experienceB.experienceId);

    // 6. R9 WAJIB 4: Case B (Unit 3) is a new instance that never failed, but reasoning anticipates cavitation risk via generalization
    // NOTE: Alternative hypothesis is provided with baseline prior (confidence 0.50), NOT injected with 0.94!
    const reasoningCaseB = restartedCellA.reasoning.reason({
      goal: 'Regulate thermal surge in Sector Gamma using Unit 3',
      context: contextCaseB,
      originatingCellId: restartedCellA.nodeId,
      minEvidenceThreshold: 0.2,
      premises: [
        {
          premiseId: 'premise_gamma_surge_eval',
          statement: 'Thermal surge detected in Sector Gamma.',
          confidence: 0.9
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'hyp_unit3_overdrive',
          statement: 'Deploy CoolantPumpOverdriveUnit3 to regulate Sector Gamma surge.',
          targetConceptId: unit3ConceptId,
          confidence: 0.85
        }
      ],
      alternatives: [
        {
          hypothesisId: 'hyp_gamma_passive_heatexchanger',
          statement: 'Engage Sector Gamma passive heat exchangers.',
          confidence: 0.5,
          reason: 'Secondary passive cooling'
        }
      ]
    }, restartedCellA.cognitiveGraph);

    expect(reasoningCaseB.verification.hasContradiction).toBe(true);
    expect(reasoningCaseB.verification.epistemicStatus).toBe(EpistemicStatus.CONTRADICTED);
    expect(reasoningCaseB.verification.rationale).toMatch(/contradict/i);
    expect(reasoningCaseB.conclusion.status).toBe(EpistemicStatus.CONTRADICTED);
    expect(reasoningCaseB.conclusion.alternatives.length).toBeGreaterThanOrEqual(1);
    expect(reasoningCaseB.conclusion.alternatives[0].hypothesisId).toBe('hyp_gamma_passive_heatexchanger');

    // Endogenous Epistemic Decision Shift:
    // Confidence of alternative was NOT injected, but recalculated endogenously from epistemic update!
    expect(reasoningCaseB.conclusion.alternatives[0].confidence).toBeGreaterThan(0.70);
    expect(reasoningCaseB.conclusion.selectedAlternative?.hypothesisId).toBe('hyp_gamma_passive_heatexchanger');
    expect(reasoningCaseB.conclusion.alternatives[0].status).toBe(EpistemicStatus.BELIEVED);

    // Causal Reasoning Trace: Generalization and evidence enter reasoning trace
    expect(reasoningCaseB.trace).toBeDefined();
    const traceHyp = reasoningCaseB.trace!('hyp_unit3_overdrive');
    expect(traceHyp.elementType).toBe('HYPOTHESIS');
    expect(traceHyp.evidences.length).toBeGreaterThanOrEqual(2);

    const traceGen = reasoningCaseB.trace!(formedGenId);
    expect(traceGen.elementType).toBe('GENERALIZATION');
    expect(traceGen.generalization?.generalizationId).toBe(formedGenId);
    expect(traceGen.evidences.length).toBeGreaterThanOrEqual(2);

    // 7. Case C is irrelevant and is NOT mistakenly affected by generalization
    const contextCaseC: Context = {
      contextId: 'ctx_solar_telemetry',
      domain: 'SOLAR_ARRAY_MONITORING'
    };
    const reasoningCaseC = restartedCellA.reasoning.reason({
      goal: 'Poll external radiation levels via AuxiliarySolarRadiationSensor',
      context: contextCaseC,
      originatingCellId: restartedCellA.nodeId,
      minEvidenceThreshold: 0.2,
      premises: [
        {
          premiseId: 'premise_solar_polling',
          statement: 'Periodic sensor telemetry polling initiated.',
          confidence: 0.9
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'hyp_poll_solar_sensor',
          statement: 'Query AuxiliarySolarRadiationSensor for current flux levels.',
          targetConceptId: caseCConceptId,
          confidence: 0.9
        }
      ]
    }, restartedCellA.cognitiveGraph);

    expect(reasoningCaseC.verification.hasContradiction).toBe(false);
    expect(reasoningCaseC.verification.epistemicStatus).not.toBe(EpistemicStatus.CONTRADICTED);
    expect(reasoningCaseC.conclusion.status).not.toBe(EpistemicStatus.CONTRADICTED);

    // 8. R9 WAJIB 7: Deterministic Replay guarantees identical results
    await populateInitialGraph(cellB);

    // Replay Experience A on cellB -> NO generalization
    const replayTransA = await cellB.processObservation(observationA, {
      actionComputationId: 'task_exec_overdrive_unit_1',
      expectedContradiction: true,
      cycleNumber: 1,
      enableCognitiveDevelopment: false
    });
    const replayExpA = replayTransA.experience;
    const replayLearnA = await cellB.developFromExperience(replayExpA, {
      context: { contextId: 'ctx_unit_1_incident', domain: 'INCIDENT_RESPONSE' },
      relatedConceptIds: [unit1ConceptId]
    });
    expect(replayLearnA.generalizationsFormed?.length || 0).toBe(0);
    expect(cellB.cognitiveGraph.getAllGeneralizations().length).toBe(0);

    // Replay Experience B on cellB -> Generalization CREATED
    const replayTransB = await cellB.processObservation(observationB, {
      actionComputationId: 'task_exec_overdrive_unit_2',
      expectedContradiction: true,
      cycleNumber: 2,
      enableCognitiveDevelopment: false
    });
    const replayExpB = replayTransB.experience;
    const replayLearnB = await cellB.developFromExperience(replayExpB, {
      context: { contextId: 'ctx_unit_2_incident', domain: 'INCIDENT_RESPONSE' },
      relatedConceptIds: [unit2ConceptId]
    });

    expect(replayLearnB.generalizationsFormed?.[0]).toBe(formedGenId);
    const genB = cellB.cognitiveGraph.getGeneralization(formedGenId);
    expect(genB?.confidence).toBe(discoveredGen?.confidence);
    expect(genB?.verificationStatus).toBe(discoveredGen?.verificationStatus);
    expect(genB?.supportingEvidence.length).toBe(discoveredGen?.supportingEvidence.length);

    const reasoningCaseB_cellB = cellB.reasoning.reason({
      goal: 'Regulate thermal surge in Sector Gamma using Unit 3',
      context: contextCaseB,
      originatingCellId: cellB.nodeId,
      minEvidenceThreshold: 0.2,
      premises: [
        {
          premiseId: 'premise_gamma_surge_eval',
          statement: 'Thermal surge detected in Sector Gamma.',
          confidence: 0.9
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'hyp_unit3_overdrive',
          statement: 'Deploy CoolantPumpOverdriveUnit3 to regulate Sector Gamma surge.',
          targetConceptId: unit3ConceptId,
          confidence: 0.85
        }
      ],
      alternatives: [
        {
          hypothesisId: 'hyp_gamma_passive_heatexchanger',
          statement: 'Engage Sector Gamma passive heat exchangers.',
          confidence: 0.94,
          reason: 'Bypass centrifugal pump overdrive cavitation risk identified by generalization'
        }
      ]
    }, cellB.cognitiveGraph);

    expect(reasoningCaseB_cellB.verification.hasContradiction).toBe(true);
    expect(reasoningCaseB_cellB.conclusion.status).toBe(reasoningCaseB.conclusion.status);
    expect(reasoningCaseB_cellB.conclusion.alternatives[0].hypothesisId).toBe(reasoningCaseB.conclusion.alternatives[0].hypothesisId);

    await restartedCellA.stop();
  });
});
