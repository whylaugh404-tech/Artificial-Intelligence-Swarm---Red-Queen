import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { Cell } from '../src/redqueen/core/cell';
import { CellState } from '../src/redqueen/core/lifecycle';
import {
  MetabolismStatus,
  NoveltyClassification,
  InformationCategory,
  Experience
} from '../src/redqueen/metabolism/types';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';

describe('RED QUEEN — REPAIR PROMPT 06: EXPERIENCE → COGNITIVE DEVELOPMENT', () => {
  const TEST_STORAGE = './data/test_exp_dev_cell.json';
  const DUMMY_API_KEY = 'sk-or-v1-0000000000000000000000000000000000000000000000000000000000000000';
  let cell: Cell;

  beforeEach(async () => {
    try { await fs.unlink(TEST_STORAGE); } catch {}
    cell = new Cell(TEST_STORAGE, DUMMY_API_KEY);
    await cell.start();
  });

  afterEach(async () => {
    try {
      await cell.stop();
    } catch {}
    try { await fs.unlink(TEST_STORAGE); } catch {}
  });

  describe('1. Production Experience → Cognitive Development Flow', () => {
    it('automatically evaluates and develops representations when an observation becomes an experience', async () => {
      const now = new Date().toISOString();
      const conceptName = 'QuantumFluctuationSensor';

      // Insert initial concept with moderate confidence
      await cell.cognitiveGraph.insertConcept({
        conceptId: 'concept_quantum_sensor_01',
        canonicalName: conceptName,
        description: 'Quantum fluctuation sensor array at sector 7',
        category: InformationCategory.HARDWARE,
        sourceKnowledgeIds: ['k_001'],
        sourceExperienceIds: [],
        originatingCellId: cell.nodeId,
        confidence: 0.6,
        verificationStatus: RepresentationVerificationStatus.PENDING,
        createdAt: now,
        updatedAt: now,
        version: 1,
        provenance: [cell.nodeId],
        metadata: {}
      });

      const initialConcept = await cell.cognitiveGraph.findConceptByName(conceptName);
      expect(initialConcept?.confidence).toBe(0.6);

      // Process a positive confirming observation
      const result = await cell.processObservation({
        observedSubject: conceptName,
        source: 'quantum_telemetry_probe',
        confidence: 0.95,
        content: {
          sensorOperational: true,
          fluctuationRate: 0.042
        }
      }, {
        cycleNumber: 1,
        category: InformationCategory.HARDWARE
      });

      expect(result.status).toBe('CREATED');
      expect(result.developmentResult).toBeDefined();
      expect(result.developmentResult?.conceptsStrengthened).toContain('concept_quantum_sensor_01');

      // The concept confidence should have increased through evidence-driven reinforcement
      const updatedConcept = await cell.cognitiveGraph.findConceptByName(conceptName);
      expect(updatedConcept).toBeDefined();
      expect(updatedConcept!.confidence).toBeGreaterThan(0.6);
      expect(updatedConcept!.sourceExperienceIds).toContain(result.experience.experienceId);
      expect(updatedConcept!.evidenceIds).toBeDefined();
      expect(updatedConcept!.evidenceIds!.length).toBeGreaterThan(0);
    });
  });

  describe('2. Positive Evidence Strengthening', () => {
    it('strengthens concept and updates epistemic state via developFromExperience', async () => {
      const now = new Date().toISOString();
      const conceptName = 'SubspaceRelayAlpha';

      await cell.cognitiveGraph.insertConcept({
        conceptId: 'concept_subspace_01',
        canonicalName: conceptName,
        description: 'Subspace relay transceiver node',
        category: InformationCategory.NETWORKING,
        sourceKnowledgeIds: ['k_002'],
        sourceExperienceIds: [],
        originatingCellId: cell.nodeId,
        confidence: 0.5,
        verificationStatus: RepresentationVerificationStatus.PENDING,
        createdAt: now,
        updatedAt: now,
        version: 1,
        provenance: [cell.nodeId],
        metadata: {}
      });

      const fakeExperience: Experience = {
        experienceId: 'exp_subspace_confirm_01',
        transactionId: 'tx_001',
        cellId: cell.nodeId,
        timestamp: now,
        informationId: 'obs_subspace_01',
        knowledgeIds: ['k_002'],
        category: InformationCategory.NETWORKING,
        outcome: MetabolismStatus.ACCEPTED,
        noveltyClassification: NoveltyClassification.REINFORCEMENT,
        noveltyScore: 0.1,
        source: 'diagnostic_daemon',
        confidence: 0.9,
        verificationStatus: 'CONFIRMED_BY_WORLD',
        lessonsDerived: ['subspace_signal_locked_and_stable'],
        observationId: 'obs_subspace_01'
      };

      const devResult = await cell.developFromExperience(fakeExperience, {
        relatedConceptIds: ['concept_subspace_01']
      });

      expect(devResult.conceptsStrengthened).toContain('concept_subspace_01');
      const concept = cell.cognitiveGraph.getConcept('concept_subspace_01');
      expect(concept?.confidence).toBeGreaterThan(0.5);
      expect(concept?.sourceExperienceIds).toContain('exp_subspace_confirm_01');
    });
  });

  describe('3. Negative & Conflicting Evidence Weakening', () => {
    it('weakens concept confidence, detects conflict, and records knowledge gaps on contradictory experience', async () => {
      const now = new Date().toISOString();
      const conceptName = 'PlasmaContainmentField';

      await cell.cognitiveGraph.insertConcept({
        conceptId: 'concept_plasma_01',
        canonicalName: conceptName,
        description: 'High energy plasma containment grid',
        category: InformationCategory.HARDWARE,
        sourceKnowledgeIds: ['k_003'],
        sourceExperienceIds: [],
        originatingCellId: cell.nodeId,
        confidence: 0.85,
        verificationStatus: RepresentationVerificationStatus.VERIFIED,
        createdAt: now,
        updatedAt: now,
        version: 1,
        provenance: [cell.nodeId],
        metadata: {}
      });

      const initialConcept = cell.cognitiveGraph.getConcept('concept_plasma_01');
      expect(initialConcept?.confidence).toBe(0.85);

      const conflictExperience: Experience = {
        experienceId: 'exp_plasma_breach_01',
        transactionId: 'tx_002',
        cellId: cell.nodeId,
        timestamp: now,
        informationId: 'obs_plasma_02',
        knowledgeIds: ['k_003'],
        category: InformationCategory.HARDWARE,
        outcome: MetabolismStatus.ACCEPTED,
        noveltyClassification: NoveltyClassification.CONTRADICTION,
        noveltyScore: 0.9,
        source: 'chamber_pressure_monitor',
        confidence: 0.95,
        verificationStatus: 'CONTRADICTED_BY_WORLD',
        lessonsDerived: ['plasma_breach_detected', 'containment_rupture'],
        observationId: 'obs_plasma_02'
      };

      const devResult = await cell.developFromExperience(conflictExperience, {
        relatedConceptIds: ['concept_plasma_01']
      });

      expect(devResult.conceptsWeakened).toContain('concept_plasma_01');
      expect(devResult.conflictsDetected).toBeGreaterThanOrEqual(1);
      expect(devResult.unresolvedGapsRecorded).toBeDefined();

      const weakenedConcept = cell.cognitiveGraph.getConcept('concept_plasma_01');
      expect(weakenedConcept?.confidence).toBeLessThan(0.85);

      // CognitiveState should record unresolved KnowledgeGap for cognitive friction
      const state = cell.cognitiveState.getState();
      const hasGap = state.knowledgeGaps.some(g => g.topic.includes('concept_plasma_01') || g.topic.includes('PlasmaContainmentField') || g.reason.includes('contradiction'));
      expect(hasGap).toBe(true);
    });
  });

  describe('4. Atomic Transactions, History Replay & Restart Recovery', () => {
    it('maintains transition history, enables deterministic replay and recovers state across restarts', async () => {
      const now = new Date().toISOString();
      const conceptName = 'ShieldHarmonicsMatrix';

      await cell.cognitiveGraph.insertConcept({
        conceptId: 'concept_shield_harmonics_01',
        canonicalName: conceptName,
        description: 'Multi-band shield modulation',
        category: InformationCategory.HARDWARE,
        sourceKnowledgeIds: ['k_004'],
        sourceExperienceIds: [],
        originatingCellId: cell.nodeId,
        confidence: 0.5,
        verificationStatus: RepresentationVerificationStatus.PENDING,
        createdAt: now,
        updatedAt: now,
        version: 1,
        provenance: [cell.nodeId],
        metadata: {}
      });

      // Experience 1: Positive reinforcement
      await cell.processObservation({
        observedSubject: conceptName,
        source: 'calibration_sweep',
        confidence: 0.9,
        content: { harmonicsAligned: true }
      }, { cycleNumber: 1 });

      // Check transition history recorded
      const replayResult = cell.cognitiveDevelopment.replayHistory('concept_shield_harmonics_01');
      expect(replayResult.replayedCount).toBeGreaterThanOrEqual(1);
      expect(replayResult.history[0].targetRepresentationId).toBe('concept_shield_harmonics_01');

      // Stop and restart cell
      await cell.stop();
      expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);

      const restartedCell = await Cell.loadFromStorage(TEST_STORAGE, DUMMY_API_KEY);
      await restartedCell.start();
      expect(restartedCell.lifecycle.getState()).toBe(CellState.ACTIVE);

      const recoveredConcept = restartedCell.cognitiveGraph.getConcept('concept_shield_harmonics_01');
      expect(recoveredConcept).toBeDefined();
      expect(recoveredConcept?.confidence).toBeGreaterThan(0.5);
      expect(recoveredConcept?.sourceExperienceIds.length).toBeGreaterThanOrEqual(1);

      await restartedCell.stop();
    });
  });
});
