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
import { extractSemanticProfile } from '../src/redqueen/cognition/representation/semantic';
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
        subsystem: 'coolant_pump',
        operatingMode: 'overdrive_speed',
        coreCoolantFlow: 120.5,
        flowUnit: 'liters_per_minute',
        operationalStatus: 'surge_warning',
        confidence: 0.95
      }
    ];

    await cellA.ingestDataset(initialDataset);
    await cellControl.ingestDataset(initialDataset);

    // Assert initial episodic memory assimilation
    const episodicMemories = await cellA.memory.search({ category: MemoryCategory.EPISODIC });
    expect(episodicMemories.length).toBeGreaterThanOrEqual(1);

    // Autonomous concept & primary evidence retrieval (zero manual injection)
    const profileInitial = extractSemanticProfile(initialDataset[0]);
    const initialConcept = cellA.cognitiveGraph.getConcept(profileInitial.conceptId)!;
    expect(initialConcept).toBeDefined();
    const strategyConceptId = initialConcept.conceptId;

    const primaryEvidenceId = initialConcept.evidenceIds[0];
    const primaryEvidence = cellA.cognitiveGraph.getEvidence(primaryEvidenceId)!;
    expect(primaryEvidence).toBeDefined();

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
    expect(worldModelCycle1.uncertainty.belief).toBeGreaterThan(0.15);
    expect(worldModelCycle1.uncertainty.disbelief).toBe(0.0);
    const initialBelief = worldModelCycle1.uncertainty.belief;
    const initialDisbelief = worldModelCycle1.uncertainty.disbelief;

    const hypothesisStatement = `Deploy ${initialConcept.canonicalName} to stabilize thermal surge.`;
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
          evidenceIds: [primaryEvidence.evidenceId]
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'hyp_primary_overdrive',
          statement: hypothesisStatement,
          targetConceptId: strategyConceptId
        }
      ],
      alternatives: [
        {
          hypothesisId: 'hyp_auxiliary_heatexchanger',
          statement: 'Engage auxiliary low-pressure heat exchangers.',
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
      source: 'sensor_telemetry_actuator_feedback',
      confidence: 0.96,
      content: {
        subsystem: 'coolant_pump',
        operatingMode: 'overdrive_speed',
        coreCoolantFlow: 120.5,
        flowUnit: 'liters_per_minute',
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
      cycleNumber: 1,
      relatedConceptIds: [strategyConceptId]
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
          evidenceIds: [primaryEvidence.evidenceId]
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'hyp_primary_overdrive',
          statement: hypothesisStatement,
          targetConceptId: strategyConceptId
        }
      ],
      alternatives: [
        {
          hypothesisId: 'hyp_auxiliary_heatexchanger',
          statement: 'Engage auxiliary low-pressure heat exchangers.',
          reason: 'Secondary cooling loop without pump strain'
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
    expect(controlConcept?.confidence).toBe(initialConcept.confidence);
    expect(controlConcept?.confidence).toBeGreaterThan(0.50);

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
          evidenceIds: [cellControl.cognitiveGraph.getAllEvidences()[0].evidenceId]
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'ctrl_hyp',
          statement: hypothesisStatement,
          targetConceptId: strategyConceptId
        }
      ],
      alternatives: [
        {
          hypothesisId: 'ctrl_alt',
          statement: 'Engage auxiliary low-pressure heat exchangers.',
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
    // 1. INGESTION PATH: Ingest operational baseline dataset through production path.
    // Strict invariant: NO manual concept/relation seeding or populateInitialGraph.
    const operationalDataset = [
      {
        sourceId: 'spec_telemetry_unit_3',
        subsystem: 'coolant_pump',
        operatingMode: 'overdrive_speed',
        coolantFlowRate: 120.0,
        gridSector: 'gamma',
        operationalStatus: 'active_nominal'
      },
      {
        sourceId: 'spec_telemetry_solar',
        subsystem: 'solar_radiation_sensor',
        operatingMode: 'photovoltaic_monitoring',
        radiationFlux: 1361.0,
        operationalStatus: 'nominal'
      }
    ];

    await cellA.ingestDataset(operationalDataset);
    await cellControl.ingestDataset(operationalDataset);

    // Strict invariant: NO CognitiveGeneralization exists initially in either cell
    expect(cellA.cognitiveGraph.getAllGeneralizations().length).toBe(0);
    expect(cellControl.cognitiveGraph.getAllGeneralizations().length).toBe(0);

    // Dynamically retrieve concept IDs derived through production ingestion
    const profileUnit3 = extractSemanticProfile(operationalDataset[0]);
    const profileSolar = extractSemanticProfile(operationalDataset[1]);

    const unit3Concept = cellA.cognitiveGraph.getConcept(profileUnit3.conceptId)!;
    expect(unit3Concept).toBeDefined();
    const unit3ConceptId = unit3Concept.conceptId;

    const generalConcept = cellA.cognitiveGraph.getConcept(profileUnit3.abstractConceptId)!;
    expect(generalConcept).toBeDefined();
    const generalConceptId = generalConcept.conceptId;

    const caseCConcept = cellA.cognitiveGraph.getConcept(profileSolar.conceptId)!;
    expect(caseCConcept).toBeDefined();
    const caseCConceptId = caseCConcept.conceptId;

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
          statement: 'Thermal surge detected in Sector Gamma.'
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'hyp_unit3_overdrive',
          statement: 'Deploy CoolantPumpOverdriveUnit3 to regulate Sector Gamma surge.',
          targetConceptId: unit3ConceptId
        }
      ],
      alternatives: [
        {
          hypothesisId: 'hyp_gamma_passive_heatexchanger',
          statement: 'Engage Sector Gamma passive heat exchangers.',
          reason: 'Secondary passive cooling'
        }
      ]
    }, cellControl.cognitiveGraph);

    expect(cellControl.cognitiveGraph.getAllGeneralizations().length).toBe(0);
    expect(controlReasoningCaseB.verification.hasContradiction).toBe(false);
    expect(controlReasoningCaseB.verification.epistemicStatus).not.toBe(EpistemicStatus.CONTRADICTED);
    expect(controlReasoningCaseB.conclusion.status).not.toBe(EpistemicStatus.CONTRADICTED);
    expect(controlReasoningCaseB.conclusion.selectedAlternative).toBeUndefined();
    expect(controlReasoningCaseB.conclusion.alternatives[0].status).not.toBe(EpistemicStatus.BELIEVED);
    expect(controlReasoningCaseB.conclusion.alternatives[0].confidence).toBeLessThan(0.60);

    // 2. REQUIREMENT 1 & 2: Experience A alone -> NO generalization formed
    const observationA = {
      domainKind: DomainKind.OBSERVATION,
      source: 'sensor_telemetry_unit_1_monitoring',
      confidence: 0.98,
      content: {
        subsystem: 'coolant_pump',
        operatingMode: 'overdrive_speed',
        anomaly: 'impeller_cavitation_rupture',
        operationalStatus: 'ruptured_failure',
        rpm: 12000,
        gridSector: 'alpha',
        contradicts: true
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

    // Develop from Experience A alone (autonomous concept formation without caller conceptId or name injection)
    const learningResultA = await cellA.developFromExperience(experienceA, {
      context: { contextId: 'ctx_unit_1_incident', domain: 'INCIDENT_RESPONSE' }
    });

    // Concept & relation for Unit 1 formed autonomously from semantic attributes
    const profileObsA = extractSemanticProfile(observationA.content);
    const unit1Concept = cellA.cognitiveGraph.getConcept(profileObsA.conceptId);
    expect(unit1Concept).toBeDefined();
    expect(unit1Concept?.evidenceIds.length).toBeGreaterThanOrEqual(1);

    const unit1Rels = cellA.cognitiveGraph.getRelationsForConcept(unit1Concept!.conceptId);
    expect(unit1Rels.some(r => r.predicate === CognitiveRelationPredicate.INSTANCE_OF && r.objectConceptId === generalConceptId)).toBe(true);

    // R9 WAJIB 1: Experience A alone must NOT form a generalization!
    expect(learningResultA.conceptsWeakened).toContain(unit1Concept!.conceptId);
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
          statement: 'Thermal surge detected in Sector Gamma.'
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'hyp_unit3_overdrive',
          statement: 'Deploy overdrive mode in Sector Gamma.',
          targetConceptId: unit3ConceptId
        }
      ]
    }, cellA.cognitiveGraph);
    expect(reasoningUnit3BeforeB.verification.hasContradiction).toBe(false);
    expect(reasoningUnit3BeforeB.verification.epistemicStatus).not.toBe(EpistemicStatus.CONTRADICTED);

    // 3. R9 WAJIB 2: Experience B (Unit 2) with compatible pattern -> Generalization CREATED!
    const observationB = {
      domainKind: DomainKind.OBSERVATION,
      source: 'sensor_telemetry_unit_2_monitoring',
      confidence: 0.98,
      content: {
        subsystem: 'coolant_pump',
        operatingMode: 'overdrive_speed',
        anomaly: 'impeller_cavitation_rupture',
        operationalStatus: 'ruptured_failure',
        rpm: 12000,
        gridSector: 'beta',
        contradicts: true
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
      context: { contextId: 'ctx_unit_2_incident', domain: 'INCIDENT_RESPONSE' }
    });

    const profileObsB = extractSemanticProfile(observationB.content);
    const unit2Concept = cellA.cognitiveGraph.getConcept(profileObsB.conceptId);
    expect(unit2Concept).toBeDefined();
    expect(unit2Concept?.evidenceIds.length).toBeGreaterThanOrEqual(1);

    const unit2Rels = cellA.cognitiveGraph.getRelationsForConcept(unit2Concept!.conceptId);
    expect(unit2Rels.some(r => r.predicate === CognitiveRelationPredicate.INSTANCE_OF && r.objectConceptId === generalConceptId)).toBe(true);

    expect(learningResultB.conceptsWeakened).toContain(unit2Concept!.conceptId);
    expect(learningResultB.generalizationsFormed?.length).toBeGreaterThanOrEqual(1);

    const formedGenId = learningResultB.generalizationsFormed![0];
    const discoveredGen = cellA.cognitiveGraph.getGeneralization(formedGenId);
    expect(discoveredGen).toBeDefined();
    expect(discoveredGen?.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);
    expect(discoveredGen?.pattern).toMatch(/risk invariant|cavitation/i);
    expect(discoveredGen?.sourceConceptIds).toContain(generalConceptId);
    expect(discoveredGen?.confidence).toBeGreaterThanOrEqual(0.75);

    // R9 WAJIB: Assert provenance: raw input -> representation -> evidence -> experience -> concept -> generalization
    expect(discoveredGen?.supportingEvidence.length).toBeGreaterThanOrEqual(2);
    expect(discoveredGen?.evidenceIds?.length).toBeGreaterThanOrEqual(2);
    expect(discoveredGen?.provenance).toContain(experienceA.experienceId);
    expect(discoveredGen?.provenance).toContain(experienceB.experienceId);
    expect(discoveredGen?.provenance.length).toBeGreaterThanOrEqual(2);

    // 1. Raw input sources exist
    expect(observationA.source).toBe('sensor_telemetry_unit_1_monitoring');
    expect(observationB.source).toBe('sensor_telemetry_unit_2_monitoring');

    // 2. Representation formed with provenance linking to raw input
    expect(unit1Concept?.provenance).toContain(observationA.source);
    expect(unit2Concept?.provenance).toContain(observationB.source);

    // 3. Evidence formed with provenance linking to observation
    const evA = cellA.cognitiveGraph.getEvidence(discoveredGen!.supportingEvidence[0]);
    const evB = cellA.cognitiveGraph.getEvidence(discoveredGen!.supportingEvidence[1]);
    expect(evA).toBeDefined();
    expect(evB).toBeDefined();

    // 4. Experience linked to observation and evidence
    expect(discoveredGen?.provenance).toContain(experienceA.experienceId);
    expect(discoveredGen?.provenance).toContain(experienceB.experienceId);

    // 5. Concept grounded in evidence and experience
    expect(unit1Concept?.sourceExperienceIds).toContain(experienceA.experienceId);
    expect(unit2Concept?.sourceExperienceIds).toContain(experienceB.experienceId);

    // 6. Generalization holds structured prov_map and prov_trail
    expect(discoveredGen?.provenance.some(p => p.startsWith('prov_map:'))).toBe(true);
    expect(discoveredGen?.provenance.some(p => p.startsWith('prov_trail:'))).toBe(true);

    // 4. R9 WAJIB 5: Irrelevant Experience C does NOT mistakenly expand or alter the generalization
    const observationC = {
      domainKind: DomainKind.OBSERVATION,
      source: 'sensor_telemetry_solar_monitoring',
      confidence: 0.95,
      content: {
        subsystem: 'solar_radiation_sensor',
        operatingMode: 'photovoltaic_monitoring',
        radiationFlux: 1361.0,
        operationalStatus: 'nominal'
      }
    };
    const transitionResultC = await cellA.processObservation(observationC, {
      actionComputationId: 'task_poll_solar_sensor',
      cycleNumber: 3,
      enableCognitiveDevelopment: false
    });
    const experienceC = transitionResultC.experience;
    await cellA.developFromExperience(experienceC, {
      context: { contextId: 'ctx_solar_polling', domain: 'SOLAR_ARRAY_MONITORING' }
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
    // NOTE: Clean identity reference input without caller confidence injection
    const caseBInput = {
      goal: 'Regulate thermal surge in Sector Gamma using Unit 3',
      context: contextCaseB,
      minEvidenceThreshold: 0.2,
      premises: [
        {
          premiseId: 'premise_gamma_surge_eval',
          statement: 'Thermal surge detected in Sector Gamma.'
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'hyp_unit3_overdrive',
          statement: 'Deploy overdrive mode in Sector Gamma.',
          targetConceptId: unit3ConceptId
        }
      ],
      alternatives: [
        {
          hypothesisId: 'hyp_gamma_passive_heatexchanger',
          statement: 'Engage Sector Gamma passive heat exchangers.',
          reason: 'Secondary passive cooling'
        }
      ]
    };

    const reasoningCaseB = restartedCellA.reasoning.reason({
      ...caseBInput,
      originatingCellId: restartedCellA.nodeId
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
          statement: 'Periodic sensor telemetry polling initiated.'
        }
      ],
      hypotheses: [
        {
          hypothesisId: 'hyp_poll_solar_sensor',
          statement: 'Query AuxiliarySolarRadiationSensor for current flux levels.',
          targetConceptId: caseCConceptId
        }
      ]
    }, restartedCellA.cognitiveGraph);

    expect(reasoningCaseC.verification.hasContradiction).toBe(false);
    expect(reasoningCaseC.verification.epistemicStatus).not.toBe(EpistemicStatus.CONTRADICTED);
    expect(reasoningCaseC.conclusion.status).not.toBe(EpistemicStatus.CONTRADICTED);

    // 8. R9 WAJIB 7: Deterministic Replay guarantees identical results
    await cellB.ingestDataset(operationalDataset);

    // Replay Experience A on cellB -> NO generalization
    const replayTransA = await cellB.processObservation(observationA, {
      actionComputationId: 'task_exec_overdrive_unit_1',
      expectedContradiction: true,
      cycleNumber: 1,
      enableCognitiveDevelopment: false
    });
    const replayExpA = replayTransA.experience;
    const replayLearnA = await cellB.developFromExperience(replayExpA, {
      context: { contextId: 'ctx_unit_1_incident', domain: 'INCIDENT_RESPONSE' }
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
      context: { contextId: 'ctx_unit_2_incident', domain: 'INCIDENT_RESPONSE' }
    });

    expect(replayLearnB.generalizationsFormed?.[0]).toBe(formedGenId);
    const genB = cellB.cognitiveGraph.getGeneralization(formedGenId);
    expect(genB?.confidence).toBe(discoveredGen?.confidence);
    expect(genB?.verificationStatus).toBe(discoveredGen?.verificationStatus);
    expect(genB?.supportingEvidence.length).toBe(discoveredGen?.supportingEvidence.length);

    // Treatment and Replay pass identical input structure
    const reasoningCaseB_cellB = cellB.reasoning.reason({
      ...caseBInput,
      originatingCellId: cellB.nodeId
    }, cellB.cognitiveGraph);

    expect(reasoningCaseB_cellB.verification.hasContradiction).toBe(true);
    expect(reasoningCaseB_cellB.verification.epistemicStatus).toBe(reasoningCaseB.verification.epistemicStatus);
    expect(reasoningCaseB_cellB.conclusion.status).toBe(reasoningCaseB.conclusion.status);
    expect(reasoningCaseB_cellB.conclusion.alternatives[0].hypothesisId).toBe(reasoningCaseB.conclusion.alternatives[0].hypothesisId);
    expect(reasoningCaseB_cellB.conclusion.alternatives[0].confidence).toBe(reasoningCaseB.conclusion.alternatives[0].confidence);
    expect(reasoningCaseB_cellB.conclusion.alternatives[0].status).toBe(reasoningCaseB.conclusion.alternatives[0].status);
    expect(reasoningCaseB_cellB.conclusion.selectedAlternative?.hypothesisId).toBe(reasoningCaseB.conclusion.selectedAlternative?.hypothesisId);
    expect(reasoningCaseB_cellB.conclusion.selectedAlternative?.confidence).toBe(reasoningCaseB.conclusion.selectedAlternative?.confidence);

    await restartedCellA.stop();
  });

  it('guarantees complete immunity to caller-provided confidence injection: extreme confidence inputs (0.01 vs 0.99) yield strictly identical reasoning output and deterministic hash', async () => {
    const storagePathImmunity = join(process.cwd(), '.tmp_test_causal_immunity.json');
    if (existsSync(storagePathImmunity)) {
      try { unlinkSync(storagePathImmunity); } catch {}
    }

    const cellImmunity = new Cell(storagePathImmunity, 'dummy-key', undefined, undefined, undefined, {
      storageSecret: 'causal_secret_immunity'
    });

    try {
      await cellImmunity.memory.initialize();
      await cellImmunity.restoreOrPersistIdentity();

      const testConceptId = 'concept_thermal_valve';
      const testEvidenceId = 'ev_thermal_telemetry';
      const testContext: Context = {
        contextId: 'ctx_immunity_test',
        domain: 'THERMAL_STABILITY'
      };

      await cellImmunity.cognitiveGraph.insertEvidence({
        evidenceId: testEvidenceId,
        sourceId: cellImmunity.nodeId,
        observationId: 'obs_immunity_1',
        timestamp: new Date().toISOString(),
        confidence: 0.95,
        provenance: {
          sourceId: cellImmunity.nodeId,
          timestamp: new Date().toISOString(),
          supportingRepresentationIds: [testConceptId]
        },
        context: testContext
      });

      await cellImmunity.cognitiveGraph.insertConcept({
        conceptId: testConceptId,
        canonicalName: 'ThermalReliefValvePolicy',
        description: 'Open bypass relief valve during overheating',
        category: InformationCategory.OPERATING_SYSTEM,
        sourceKnowledgeIds: ['k_valve'],
        sourceExperienceIds: [],
        evidenceIds: [testEvidenceId],
        confidence: 0.88,
        provenance: [cellImmunity.nodeId],
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        originatingCellId: cellImmunity.nodeId,
        metadata: {}
      });

      // SCENARIO 1: SUPPORTED STATE - Compare Extreme Low (0.01) vs Extreme High (0.99) vs Clean (No confidence)
      const inputExtremeLow = {
        goal: 'Regulate thermal stability',
        context: testContext,
        originatingCellId: cellImmunity.nodeId,
        minEvidenceThreshold: 0.2,
        premises: [
          {
            premiseId: 'p_thermal',
            statement: 'Overheating trend detected.',
            confidence: 0.01,
            evidenceIds: [testEvidenceId]
          }
        ],
        hypotheses: [
          {
            hypothesisId: 'hyp_valve',
            statement: 'Actuate ThermalReliefValvePolicy to bleed excess pressure.',
            targetConceptId: testConceptId,
            confidence: 0.01
          }
        ],
        alternatives: [
          {
            hypothesisId: 'alt_passive_vent',
            statement: 'Passive convective ventilation.',
            confidence: 0.01,
            reason: 'Auxiliary cooling option'
          }
        ]
      };

      const inputExtremeHigh = {
        goal: 'Regulate thermal stability',
        context: testContext,
        originatingCellId: cellImmunity.nodeId,
        minEvidenceThreshold: 0.2,
        premises: [
          {
            premiseId: 'p_thermal',
            statement: 'Overheating trend detected.',
            confidence: 0.99,
            evidenceIds: [testEvidenceId]
          }
        ],
        hypotheses: [
          {
            hypothesisId: 'hyp_valve',
            statement: 'Actuate ThermalReliefValvePolicy to bleed excess pressure.',
            targetConceptId: testConceptId,
            confidence: 0.99
          }
        ],
        alternatives: [
          {
            hypothesisId: 'alt_passive_vent',
            statement: 'Passive convective ventilation.',
            confidence: 0.99,
            reason: 'Auxiliary cooling option'
          }
        ]
      };

      const inputClean = {
        goal: 'Regulate thermal stability',
        context: testContext,
        originatingCellId: cellImmunity.nodeId,
        minEvidenceThreshold: 0.2,
        premises: [
          {
            premiseId: 'p_thermal',
            statement: 'Overheating trend detected.',
            evidenceIds: [testEvidenceId]
          }
        ],
        hypotheses: [
          {
            hypothesisId: 'hyp_valve',
            statement: 'Actuate ThermalReliefValvePolicy to bleed excess pressure.',
            targetConceptId: testConceptId
          }
        ],
        alternatives: [
          {
            hypothesisId: 'alt_passive_vent',
            statement: 'Passive convective ventilation.',
            reason: 'Auxiliary cooling option'
          }
        ]
      };

      const resultLow = cellImmunity.reasoning.reason(inputExtremeLow, cellImmunity.cognitiveGraph);
      const resultHigh = cellImmunity.reasoning.reason(inputExtremeHigh, cellImmunity.cognitiveGraph);
      const resultClean = cellImmunity.reasoning.reason(inputClean, cellImmunity.cognitiveGraph);

      // Verify that reasoning output is 100% deterministic and immune to caller confidence injection
      expect(resultLow.reasoningId).toBe(resultHigh.reasoningId);
      expect(resultLow.reasoningId).toBe(resultClean.reasoningId);
      expect(resultLow.verification.confidence).toBe(resultHigh.verification.confidence);
      expect(resultLow.verification.confidence).toBe(resultClean.verification.confidence);
      expect(resultLow.hypotheses[0].confidence).toBe(resultHigh.hypotheses[0].confidence);
      expect(resultLow.hypotheses[0].confidence).toBe(resultClean.hypotheses[0].confidence);
      expect(resultLow.premises[0].confidence).toBe(resultHigh.premises[0].confidence);
      expect(resultLow.premises[0].confidence).toBe(resultClean.premises[0].confidence);
      expect(resultLow.conclusion.conclusionId).toBe(resultHigh.conclusion.conclusionId);
      expect(resultLow.conclusion.conclusionId).toBe(resultClean.conclusion.conclusionId);
      expect(resultLow.conclusion.status).toBe(resultHigh.conclusion.status);
      expect(resultLow.conclusion.alternatives[0].confidence).toBe(resultHigh.conclusion.alternatives[0].confidence);
      expect(resultLow.conclusion.alternatives[0].confidence).toBe(resultClean.conclusion.alternatives[0].confidence);

      // SCENARIO 2: CONTRADICTED STATE - Add empirical counter-evidence into Graph
      const counterEvidenceId = 'ev_valve_cavitation_failure';
      await cellImmunity.cognitiveGraph.insertEvidence({
        evidenceId: counterEvidenceId,
        sourceId: cellImmunity.nodeId,
        observationId: 'obs_valve_rupture',
        timestamp: new Date().toISOString(),
        confidence: 0.98,
        provenance: {
          sourceId: cellImmunity.nodeId,
          timestamp: new Date().toISOString(),
          contradictingRepresentationIds: [testConceptId]
        },
        context: testContext
      });

      const inputContraLow = {
        ...inputExtremeLow,
        counterEvidences: [counterEvidenceId]
      };
      const inputContraHigh = {
        ...inputExtremeHigh,
        counterEvidences: [counterEvidenceId]
      };
      const inputContraClean = {
        ...inputClean,
        counterEvidences: [counterEvidenceId]
      };

      const contraLow = cellImmunity.reasoning.reason(inputContraLow, cellImmunity.cognitiveGraph);
      const contraHigh = cellImmunity.reasoning.reason(inputContraHigh, cellImmunity.cognitiveGraph);
      const contraClean = cellImmunity.reasoning.reason(inputContraClean, cellImmunity.cognitiveGraph);

      expect(contraLow.reasoningId).toBe(contraHigh.reasoningId);
      expect(contraLow.reasoningId).toBe(contraClean.reasoningId);
      expect(contraLow.verification.hasContradiction).toBe(true);
      expect(contraHigh.verification.hasContradiction).toBe(true);
      expect(contraLow.verification.confidence).toBe(contraHigh.verification.confidence);
      expect(contraLow.verification.confidence).toBe(contraClean.verification.confidence);
      expect(contraLow.hypotheses[0].confidence).toBe(contraHigh.hypotheses[0].confidence);
      expect(contraLow.hypotheses[0].confidence).toBe(contraClean.hypotheses[0].confidence);
      expect(contraLow.conclusion.selectedAlternative?.hypothesisId).toBe(contraHigh.conclusion.selectedAlternative?.hypothesisId);
      expect(contraLow.conclusion.selectedAlternative?.confidence).toBe(contraHigh.conclusion.selectedAlternative?.confidence);
      expect(contraLow.conclusion.selectedAlternative?.confidence).toBe(contraClean.conclusion.selectedAlternative?.confidence);
    } finally {
      await cellImmunity.stop();
      if (existsSync(storagePathImmunity)) {
        try { unlinkSync(storagePathImmunity); } catch {}
      }
    }
  });

  it('guarantees identity-invariance: altering entity names/IDs while preserving semantic attributes yields equivalent ontology and relation topology', async () => {
    const storagePathInv1 = join(process.cwd(), '.tmp_test_inv_1.json');
    const storagePathInv2 = join(process.cwd(), '.tmp_test_inv_2.json');
    if (existsSync(storagePathInv1)) { try { unlinkSync(storagePathInv1); } catch {} }
    if (existsSync(storagePathInv2)) { try { unlinkSync(storagePathInv2); } catch {} }

    const cellInv1 = new Cell(storagePathInv1, 'dummy-key', undefined, undefined, undefined, { storageSecret: 'secret_inv1' });
    const cellInv2 = new Cell(storagePathInv2, 'dummy-key', undefined, undefined, undefined, { storageSecret: 'secret_inv2' });

    try {
      await cellInv1.memory.initialize();
      await cellInv2.memory.initialize();
      await cellInv1.restoreOrPersistIdentity();
      await cellInv2.restoreOrPersistIdentity();

      // Entity 1: Caller uses "CoolantPumpAlpha" name, custom ID, proposal hints
      const rawObservation1 = {
        domainKind: DomainKind.OBSERVATION,
        source: 'telemetry_node_alpha_cluster',
        confidence: 0.95,
        content: {
          name: 'CoolantPumpAlpha',
          observedSubject: 'AlphaTelemetryChannel',
          entityId: 'alpha-device-uuid-1122',
          assetTag: 'TAG-ALPHA-01',
          subsystem: 'coolant_pump',
          operatingMode: 'overdrive_speed',
          rpm: 12000,
          gridSector: 'gamma'
        }
      };

      // Entity 2: Caller uses "CoolantPumpOmega" name, different custom ID, completely different caller metadata
      // BUT IDENTICAL SEMANTIC ATTRIBUTES: subsystem, operatingMode, rpm, gridSector
      const rawObservation2 = {
        domainKind: DomainKind.OBSERVATION,
        source: 'telemetry_node_omega_cluster',
        confidence: 0.95,
        content: {
          name: 'CoolantPumpOmega',
          observedSubject: 'OmegaTelemetryChannel',
          entityId: 'omega-device-uuid-9988',
          assetTag: 'TAG-OMEGA-99',
          subsystem: 'coolant_pump',
          operatingMode: 'overdrive_speed',
          rpm: 12000,
          gridSector: 'gamma'
        }
      };

      // 1. Direct semantic profile comparison
      const profile1 = extractSemanticProfile(rawObservation1.content);
      const profile2 = extractSemanticProfile(rawObservation2.content);

      expect(profile1.conceptId).toBe(profile2.conceptId);
      expect(profile1.abstractConceptId).toBe(profile2.abstractConceptId);
      expect(profile1.canonicalName).toBe(profile2.canonicalName);
      expect(profile1.abstractCanonicalName).toBe(profile2.abstractCanonicalName);
      expect(profile1.semanticHash).toBe(profile2.semanticHash);
      expect(profile1.invariantHash).toBe(profile2.invariantHash);

      // Caller proposed names/hints exist only in proposedHints / ephemeralValues
      expect(profile1.proposedHints.name).toBe('CoolantPumpAlpha');
      expect(profile2.proposedHints.name).toBe('CoolantPumpOmega');
      expect(profile1.attributes['name']).toBeUndefined();
      expect(profile2.attributes['name']).toBeUndefined();

      // 2. Full Cell pipeline execution: Observation -> Experience -> Cognitive Development
      const transResult1 = await cellInv1.processObservation(rawObservation1, { cycleNumber: 1 });
      const transResult2 = await cellInv2.processObservation(rawObservation2, { cycleNumber: 1 });

      expect(transResult1.status).toBe('CREATED');
      expect(transResult2.status).toBe('CREATED');

      await cellInv1.developFromExperience(transResult1.experience);
      await cellInv2.developFromExperience(transResult2.experience);

      // The autonomously formed concepts in both graphs must have identical conceptId and abstract structure
      const concept1 = cellInv1.cognitiveGraph.getConcept(profile1.conceptId);
      const concept2 = cellInv2.cognitiveGraph.getConcept(profile2.conceptId);

      expect(concept1).toBeDefined();
      expect(concept2).toBeDefined();
      expect(concept1?.conceptId).toBe(concept2?.conceptId);
      expect(concept1?.canonicalName).toBe(concept2?.canonicalName);
      expect(concept1?.verificationStatus).toBe(concept2?.verificationStatus);

      // Both must possess identical abstract class concepts
      const abstract1 = cellInv1.cognitiveGraph.getConcept(profile1.abstractConceptId);
      const abstract2 = cellInv2.cognitiveGraph.getConcept(profile2.abstractConceptId);
      expect(abstract1).toBeDefined();
      expect(abstract2).toBeDefined();
      expect(abstract1?.conceptId).toBe(abstract2?.conceptId);
      expect(abstract1?.canonicalName).toBe(abstract2?.canonicalName);

      // Sibling relational topology: INSTANCE_OF relation formed identically
      const rels1 = cellInv1.cognitiveGraph.getRelationsForConcept(concept1!.conceptId);
      const rels2 = cellInv2.cognitiveGraph.getRelationsForConcept(concept2!.conceptId);

      expect(rels1.length).toBeGreaterThanOrEqual(1);
      expect(rels2.length).toBeGreaterThanOrEqual(1);
      expect(rels1[0].predicate).toBe(CognitiveRelationPredicate.INSTANCE_OF);
      expect(rels2[0].predicate).toBe(CognitiveRelationPredicate.INSTANCE_OF);
      expect(rels1[0].objectConceptId).toBe(abstract1!.conceptId);
      expect(rels2[0].objectConceptId).toBe(abstract2!.conceptId);

      // Assert complete provenance trace:
      // raw source -> observation -> representation -> evidence -> experience -> concept -> relation
      expect(concept1?.provenance).toContain(rawObservation1.source);
      expect(concept1?.provenance).toContain(transResult1.experience.experienceId);
      expect(concept1?.evidenceIds.length).toBeGreaterThanOrEqual(1);
      expect(rels1[0].provenance).toContain(concept1!.conceptId);
      expect(rels1[0].provenance).toContain(abstract1!.conceptId);
    } finally {
      await cellInv1.stop();
      await cellInv2.stop();
      if (existsSync(storagePathInv1)) { try { unlinkSync(storagePathInv1); } catch {} }
      if (existsSync(storagePathInv2)) { try { unlinkSync(storagePathInv2); } catch {} }
    }
  });

  it('guarantees semantic-sensitivity: altering semantic attributes deterministically alters the resulting ontology and relation topology', async () => {
    const storagePathSens = join(process.cwd(), '.tmp_test_sens.json');
    if (existsSync(storagePathSens)) { try { unlinkSync(storagePathSens); } catch {} }

    const cellSens = new Cell(storagePathSens, 'dummy-key', undefined, undefined, undefined, { storageSecret: 'secret_sens' });

    try {
      await cellSens.memory.initialize();
      await cellSens.restoreOrPersistIdentity();

      // Base: High speed coolant pump in sector gamma
      const baseObservation = {
        domainKind: DomainKind.OBSERVATION,
        source: 'sensor_telemetry_base',
        confidence: 0.95,
        content: {
          subsystem: 'coolant_pump',
          operatingMode: 'overdrive_speed',
          coolantFlowRate: 150.0,
          gridSector: 'gamma'
        }
      };

      // Alteration A (Leaf perturbation): Change leaf metric (gridSector to delta, flow to 180)
      // Preserves invariant systemic class (subsystem: coolant_pump, operatingMode: overdrive_speed)
      const leafAlteredObservation = {
        domainKind: DomainKind.OBSERVATION,
        source: 'sensor_telemetry_leaf',
        confidence: 0.95,
        content: {
          subsystem: 'coolant_pump',
          operatingMode: 'overdrive_speed',
          coolantFlowRate: 180.0,
          gridSector: 'delta'
        }
      };

      // Alteration B (Invariant systemic shift): Change operatingMode from overdrive_speed to low_pressure_eco
      const invariantAlteredObservation = {
        domainKind: DomainKind.OBSERVATION,
        source: 'sensor_telemetry_invariant',
        confidence: 0.95,
        content: {
          subsystem: 'coolant_pump',
          operatingMode: 'low_pressure_eco',
          coolantFlowRate: 40.0,
          gridSector: 'gamma'
        }
      };

      const profileBase = extractSemanticProfile(baseObservation.content);
      const profileLeaf = extractSemanticProfile(leafAlteredObservation.content);
      const profileInv = extractSemanticProfile(invariantAlteredObservation.content);

      // 1. Leaf perturbation creates a DISTINCT concrete concept ID, but PRESERVES the abstract invariant class
      expect(profileLeaf.conceptId).not.toBe(profileBase.conceptId);
      expect(profileLeaf.canonicalName).not.toBe(profileBase.canonicalName);
      expect(profileLeaf.abstractConceptId).toBe(profileBase.abstractConceptId);
      expect(profileLeaf.abstractCanonicalName).toBe(profileBase.abstractCanonicalName);

      // 2. Invariant systemic shift changes BOTH the concrete concept ID AND the abstract class ID
      expect(profileInv.conceptId).not.toBe(profileBase.conceptId);
      expect(profileInv.conceptId).not.toBe(profileLeaf.conceptId);
      expect(profileInv.abstractConceptId).not.toBe(profileBase.abstractConceptId);
      expect(profileInv.abstractCanonicalName).not.toBe(profileBase.abstractCanonicalName);

      // 3. Process through Cell cognition pipeline
      const transBase = await cellSens.processObservation(baseObservation, { cycleNumber: 1 });
      const transLeaf = await cellSens.processObservation(leafAlteredObservation, { cycleNumber: 2 });
      const transInv = await cellSens.processObservation(invariantAlteredObservation, { cycleNumber: 3 });

      await cellSens.developFromExperience(transBase.experience);
      await cellSens.developFromExperience(transLeaf.experience);
      await cellSens.developFromExperience(transInv.experience);

      // Verify CognitiveGraph state
      const conceptBase = cellSens.cognitiveGraph.getConcept(profileBase.conceptId);
      const conceptLeaf = cellSens.cognitiveGraph.getConcept(profileLeaf.conceptId);
      const conceptInv = cellSens.cognitiveGraph.getConcept(profileInv.conceptId);

      expect(conceptBase).toBeDefined();
      expect(conceptLeaf).toBeDefined();
      expect(conceptInv).toBeDefined();

      // ConceptBase and ConceptLeaf both point to the SAME abstract class
      const relsBase = cellSens.cognitiveGraph.getRelationsForConcept(conceptBase!.conceptId);
      const relsLeaf = cellSens.cognitiveGraph.getRelationsForConcept(conceptLeaf!.conceptId);
      const relsInv = cellSens.cognitiveGraph.getRelationsForConcept(conceptInv!.conceptId);

      const parentBase = relsBase.find(r => r.predicate === CognitiveRelationPredicate.INSTANCE_OF)?.objectConceptId;
      const parentLeaf = relsLeaf.find(r => r.predicate === CognitiveRelationPredicate.INSTANCE_OF)?.objectConceptId;
      const parentInv = relsInv.find(r => r.predicate === CognitiveRelationPredicate.INSTANCE_OF)?.objectConceptId;

      expect(parentBase).toBe(profileBase.abstractConceptId);
      expect(parentLeaf).toBe(profileBase.abstractConceptId);
      expect(parentInv).toBe(profileInv.abstractConceptId);
      expect(parentInv).not.toBe(parentBase);

      // Assert provenance: raw source -> observation -> representation -> evidence -> experience -> concept -> relation
      expect(conceptBase?.provenance).toContain(baseObservation.source);
      expect(conceptLeaf?.provenance).toContain(leafAlteredObservation.source);
      expect(conceptInv?.provenance).toContain(invariantAlteredObservation.source);
      expect(conceptBase?.sourceExperienceIds).toContain(transBase.experience.experienceId);
      expect(conceptLeaf?.sourceExperienceIds).toContain(transLeaf.experience.experienceId);
      expect(conceptInv?.sourceExperienceIds).toContain(transInv.experience.experienceId);
    } finally {
      await cellSens.stop();
      if (existsSync(storagePathSens)) { try { unlinkSync(storagePathSens); } catch {} }
    }
  });
});
