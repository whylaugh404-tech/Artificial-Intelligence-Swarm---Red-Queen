import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { Cell } from '../src/redqueen/core/cell';
import { CellState } from '../src/redqueen/core/lifecycle';
import {
  OrganicExperienceTransitionEngine,
  ExperienceTransitionResult
} from '../src/redqueen/cognition/experience';
import {
  MetabolismStatus,
  NoveltyClassification,
  InformationCategory,
  ExperienceSchema
} from '../src/redqueen/metabolism/types';
import { DomainKind } from '../src/redqueen/feedback/types';
import { SemanticBoundaryViolationError } from '../src/redqueen/feedback/errors';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';

describe('RED QUEEN — REPAIR PROMPT 05: OBSERVATION → EXPERIENCE ORGANIC TRANSITION', () => {
  const TEST_STORAGE = './data/test_obs_exp_cell.json';
  const DUMMY_API_KEY = 'sk-or-v1-0000000000000000000000000000000000000000000000000000000000000000';
  let cell: Cell;

  beforeEach(async () => {
    OrganicExperienceTransitionEngine.clearCache();
    try { await fs.unlink(TEST_STORAGE); } catch {}
    cell = new Cell(TEST_STORAGE, DUMMY_API_KEY);
    await cell.start();
  });

  afterEach(async () => {
    try {
      await cell.stop();
    } catch {}
    try { await fs.unlink(TEST_STORAGE); } catch {}
    OrganicExperienceTransitionEngine.clearCache();
  });

  describe('1. Semantic Boundary & Validation', () => {
    it('rejects null, undefined, or empty observation', async () => {
      await expect(cell.processObservation(null)).rejects.toThrow();
      await expect(cell.processObservation(undefined)).rejects.toThrow();
      await expect(cell.processObservation({})).rejects.toThrow();
    });

    it('rejects raw ComputationResult passed directly as an Observation', async () => {
      const fakeComputation = {
        domainKind: DomainKind.COMPUTATION_RESULT,
        deterministicId: 'comp_fake_001',
        payload: {
          status: 'SUCCESS',
          output: 'target_stabilized'
        }
      };

      await expect(cell.processObservation(fakeComputation)).rejects.toThrow(SemanticBoundaryViolationError);
    });

    it('validates and normalizes well-formed empirical observations', async () => {
      const observation = {
        observedSubject: 'QuantumTelemetrySensor',
        source: 'satellite_downlink_01',
        timestamp: new Date().toISOString(),
        confidence: 0.95,
        content: {
          frequencyHz: 1420.40575,
          signalStrengthDb: -42.5
        }
      };

      const result = await cell.processObservation(observation, { cycleNumber: 1 });
      expect(result.status).toBe('CREATED');
      expect(result.experience).toBeDefined();
      expect(result.experience.cellId).toBe(cell.nodeId);
      expect(result.experience.source).toBe('satellite_downlink_01');
      expect(result.experience.outcome).toBe(MetabolismStatus.ACCEPTED);
    });
  });

  describe('2. Canonical Transition & Causal Relationships', () => {
    it('captures full causal chain: triggering observation, prior state, resulting state, cell identity', async () => {
      const priorStateBefore = cell.cognitiveState.getState();
      const observation = {
        observedSubject: 'NetworkGatewayStatus',
        source: 'edge_telemetry_probe',
        confidence: 0.98,
        content: {
          port: 443,
          latencyMs: 12.4,
          status: 'ACTIVE'
        }
      };

      const result = await cell.processObservation(observation, {
        cycleNumber: 5,
        actionComputationId: 'comp_action_probe_ping_101',
        category: InformationCategory.NETWORKING
      });

      expect(result.status).toBe('CREATED');
      const exp = result.experience;

      // Validate against canonical ExperienceSchema
      const parseResult = ExperienceSchema.safeParse(exp);
      expect(parseResult.success).toBe(true);

      // Causal relationship assertions
      expect(exp.cellId).toBe(cell.nodeId);
      expect(exp.cycleNumber).toBe(5);
      expect(exp.actionComputationId).toBe('comp_action_probe_ping_101');
      expect(exp.observationId).toBeDefined();
      expect(exp.priorStateId).toBeDefined();
      expect(exp.resultingStateId).toBeDefined();
      expect(exp.priorStateId).not.toBe(exp.resultingStateId); // state evolved

      // Causal links sub-object
      expect(exp.causalLinks).toBeDefined();
      expect(exp.causalLinks?.triggeringObservationId).toBe(exp.observationId);
      expect(exp.causalLinks?.priorStateId).toBe(exp.priorStateId);
      expect(exp.causalLinks?.resultingStateId).toBe(exp.resultingStateId);
      expect(exp.causalLinks?.actionComputationId).toBe('comp_action_probe_ping_101');
      expect(exp.causalLinks?.cycleNumber).toBe(5);

      // CognitiveState synchronization
      const currentState = cell.cognitiveState.getState();
      expect(currentState.experienceReferences).toContain(exp.experienceId);

      // MemoryStore persistence
      const memoryRecord = await cell.memory.get(exp.experienceId);
      expect(memoryRecord).toBeDefined();
      expect(memoryRecord?.content.experienceId).toBe(exp.experienceId);
    });
  });

  describe('3. Duplicate Suppression (Idempotent Memory Protection)', () => {
    it('suppresses identical duplicate observations and prevents runaway experience creation', async () => {
      const observation = {
        observedSubject: 'CoreThermalSensor',
        source: 'probe_temp_alpha',
        confidence: 0.99,
        content: {
          temperatureCelsius: 41.2,
          coolantPressurePsi: 28.5
        }
      };

      // First submission
      const firstResult = await cell.processObservation(observation, { cycleNumber: 1 });
      expect(firstResult.status).toBe('CREATED');
      const firstExpId = firstResult.experience.experienceId;

      const initialExperienceCount = cell.cognitiveState.getState().experienceReferences.length;

      // Duplicate submission
      const secondResult = await cell.processObservation(observation, { cycleNumber: 1 });
      expect(secondResult.status).toBe('DUPLICATE');
      expect(secondResult.polarity).toBe('DUPLICATE');
      expect(secondResult.experience.experienceId).toBe(firstExpId);

      // Experience references must NOT have increased
      const updatedExperienceCount = cell.cognitiveState.getState().experienceReferences.length;
      expect(updatedExperienceCount).toBe(initialExperienceCount);
    });
  });

  describe('4. Contradictory Observations & Non-Destructive Conflict Preservation', () => {
    it('preserves contradictory observations as explicit evidence conflict without overwriting', async () => {
      // Step 1: Establish prior concept in CognitiveGraph
      const conceptName = 'ShieldDeflectorGrid';
      const now = new Date().toISOString();
      await cell.cognitiveGraph.insertConcept({
        conceptId: 'concept_shield_deflector_001',
        canonicalName: conceptName,
        description: 'Primary electromagnetic shield deflector grid',
        category: InformationCategory.HARDWARE,
        sourceKnowledgeIds: ['know_001'],
        sourceExperienceIds: [],
        originatingCellId: cell.nodeId,
        confidence: 0.95,
        verificationStatus: RepresentationVerificationStatus.VERIFIED,
        createdAt: now,
        updatedAt: now,
        version: 1,
        provenance: [cell.nodeId, 'prior_calibration'],
        metadata: {}
      });

      const priorConcept = await cell.cognitiveGraph.findConceptByName(conceptName);
      expect(priorConcept).toBeDefined();
      const originalConceptId = priorConcept!.conceptId;

      // Step 2: Feed a contradictory empirical observation
      const contradictoryObservation = {
        observedSubject: conceptName,
        source: 'orbital_spectrometer_09',
        confidence: 0.92,
        content: {
          contradicts: true,
          status: 'CONTRADICTED',
          measuredIntegrity: 0.0,
          failureMode: 'MAGNETIC_DISRUPTION'
        }
      };

      const result = await cell.processObservation(contradictoryObservation, {
        cycleNumber: 3,
        expectedContradiction: true
      });

      expect(result.status).toBe('CREATED');
      expect(result.polarity).toBe('CONTRADICTORY');
      expect(result.experience.noveltyClassification).toBe(NoveltyClassification.CONTRADICTION);
      expect(result.experience.verificationStatus).toBe('CONTRADICTED_BY_WORLD');

      // Crucial: Prior concept must NOT be deleted or overwritten
      const preservedConcept = await cell.cognitiveGraph.findConceptByName(conceptName);
      expect(preservedConcept).toBeDefined();
      expect(preservedConcept!.conceptId).toBe(originalConceptId);

      // Evidence conflict recorded
      expect(result.experience.evidenceIds).toBeDefined();
      expect(result.experience.evidenceIds!.length).toBeGreaterThan(0);
      const conflictEvId = result.experience.evidenceIds![0];

      const conflictEvidence = await cell.cognitiveGraph.getEvidence(conflictEvId);
      expect(conflictEvidence).toBeDefined();
      expect(conflictEvidence?.provenance.contradictingRepresentationIds).toContain(originalConceptId);

      // CognitiveState records KnowledgeGap for anomaly investigation
      const state = cell.cognitiveState.getState();
      const hasGap = state.knowledgeGaps.some(g => g.topic.includes(conceptName));
      expect(hasGap).toBe(true);
    });
  });

  describe('5. Experience Replay & Restart Recovery', () => {
    it('replays and verifies an experience causal trace from memory', async () => {
      const observation = {
        observedSubject: 'MemoryBusThroughput',
        source: 'system_monitor_daemon',
        confidence: 0.94,
        content: {
          readMbps: 3200,
          writeMbps: 2800
        }
      };

      const result = await cell.processObservation(observation, { cycleNumber: 7 });
      expect(result.status).toBe('CREATED');
      const expId = result.experience.experienceId;

      // Replay experience
      const replay = await cell.replayExperience(expId);
      expect(replay.experienceId).toBe(expId);
      expect(replay.cellId).toBe(cell.nodeId);
      expect(replay.priorStateId).toBe(result.experience.priorStateId);
      expect(replay.resultingStateId).toBe(result.experience.resultingStateId);
      expect(replay.observationFound).toBe(true);
      expect(replay.verified).toBe(true);
      expect(replay.replayStatus).toBe('VALID_CAUSAL_TRACE');
    });

    it('recovers all episodic experiences after cell shutdown and restart', async () => {
      // Produce 2 experiences
      await cell.processObservation({
        observedSubject: 'AtmosphericSensor_A',
        source: 'probe_01',
        content: { pressureHpa: 1013.25 }
      }, { cycleNumber: 1 });

      await cell.processObservation({
        observedSubject: 'AtmosphericSensor_B',
        source: 'probe_02',
        content: { humidityPct: 65.4 }
      }, { cycleNumber: 2 });

      const countBefore = cell.cognitiveState.getState().experienceReferences.length;
      expect(countBefore).toBeGreaterThanOrEqual(2);

      // Stop the cell (simulating shutdown)
      await cell.stop();
      expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);

      // Restart cell from existing storage
      const restartedCell = await Cell.loadFromStorage(TEST_STORAGE, DUMMY_API_KEY);
      await restartedCell.start();
      expect(restartedCell.lifecycle.getState()).toBe(CellState.ACTIVE);

      // Verify recovered experiences
      const recoveredExperiences = await restartedCell.recoverExperiences();
      expect(recoveredExperiences.length).toBeGreaterThanOrEqual(2);

      const recoveredState = restartedCell.cognitiveState.getState();
      for (const exp of recoveredExperiences) {
        expect(recoveredState.experienceReferences).toContain(exp.experienceId);
      }

      await restartedCell.stop();
    });
  });
});
