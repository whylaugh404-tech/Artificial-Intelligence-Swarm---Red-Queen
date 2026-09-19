import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Cell } from '../src/redqueen/core/cell';
import { EvolutionEngine } from '../src/redqueen/evolution/engine';
import {
  EvolutionTriggerType,
  EvolutionTriggerPolicy,
  ExperienceFeedbackTelemetrySchema,
  PopulationTelemetryMetricsSchema
} from '../src/redqueen/evolution/types';
import {
  MetabolismStatus,
  Experience,
  InformationCategory,
  NoveltyClassification
} from '../src/redqueen/metabolism/types';
import { CognitiveDevelopmentResult } from '../src/redqueen/cognition/development/engine';
import { transitionExperienceToEvolutionTelemetry } from '../src/redqueen/feedback/transitions';
import { SemanticBoundaryViolationError } from '../src/redqueen/feedback/errors';
import { DomainKind } from '../src/redqueen/feedback/types';
import { createGenesisGenome } from '../src/redqueen/genome';

describe('RED QUEEN P07: Experience / Learning -> Evolution Telemetry Bridge', () => {
  let tmpDir: string;
  let cell: Cell;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'redqueen_p07_test_'));
    process.env.REDQUEEN_STORAGE_SECRET = 'test_secret_for_redqueen_p07_verification_key_32bytes!!';
    const storagePath = path.join(tmpDir, 'cell_p07.json');
    cell = new Cell(storagePath, 'dummy-api-key', undefined, undefined, undefined, {
      storageSecret: 'test_secret_for_redqueen_p07_verification_key_32bytes!!'
    });
    await cell.memory.initialize();
  });

  afterEach(async () => {
    try {
      if (cell) {
        await cell.stop();
      }
    } catch (_) {}
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  const createMockExperience = (overrides: Partial<Experience> & Record<string, any> = {}): Experience => ({
    experienceId: overrides.experienceId || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    transactionId: overrides.transactionId || 'tx_test',
    cellId: overrides.cellId || cell.nodeId,
    timestamp: overrides.timestamp || new Date().toISOString(),
    informationId: overrides.informationId || 'info_test',
    knowledgeIds: overrides.knowledgeIds || [],
    category: overrides.category || InformationCategory.AI,
    outcome: overrides.outcome || MetabolismStatus.ACCEPTED,
    noveltyClassification: overrides.noveltyClassification || NoveltyClassification.NOVEL,
    noveltyScore: overrides.noveltyScore ?? 0.2,
    source: overrides.source || 'test_source',
    confidence: overrides.confidence ?? 0.9,
    verificationStatus: overrides.verificationStatus || 'CONFIRMED_BY_WORLD',
    lessonsDerived: overrides.lessonsDerived || [],
    ...overrides
  } as Experience);

  describe('1. Causal Bridge Extraction: Relevant Telemetry from Experience & Learning', () => {
    it('should extract comprehensive, bounded metrics matching all prompt requirements', () => {
      const evolution = cell.evolution;
      const experience: Experience = createMockExperience({
        experienceId: 'exp_success_001',
        outcome: MetabolismStatus.ACCEPTED,
        confidence: 0.92,
        noveltyScore: 0.2,
        lessonsDerived: ['Lesson 1: Verified epistemic alignment', 'Lesson 2: Energy stability'],
        verificationStatus: 'CONFIRMED_BY_WORLD',
        timestamp: new Date().toISOString()
      });

      const learningResult: CognitiveDevelopmentResult = {
        conceptsStrengthened: ['concept_alpha', 'concept_beta'],
        conceptsWeakened: [],
        relationsStrengthened: ['rel_ab'],
        relationsWeakened: [],
        conflictsDetected: 0
      };

      const telemetry = evolution.extractTelemetryFromExperience(
        experience,
        learningResult,
        { resourceScore: 0.88, operationalConfidence: 0.95 },
        cell
      );

      // Verify validation against schema
      expect(() => ExperienceFeedbackTelemetrySchema.parse(telemetry)).not.toThrow();

      // Check all 8+ required telemetry categories
      expect(telemetry.metrics.taskOutcome).toBe(MetabolismStatus.ACCEPTED);
      expect(telemetry.metrics.predictionAccuracy).toBe(1.0); // CONFIRMED_BY_WORLD
      expect(telemetry.metrics.verificationResult).toBe('CONFIRMED_BY_WORLD');
      expect(telemetry.metrics.confidenceChange).toBeGreaterThan(0);
      expect(telemetry.metrics.repeatedFailure).toBe(0);
      expect(telemetry.metrics.adaptation.conceptsAdapted).toBe(2);
      expect(telemetry.metrics.adaptation.relationsAdapted).toBe(1);
      expect(telemetry.metrics.adaptation.conflictsDetected).toBe(0);
      expect(telemetry.metrics.adaptation.adaptationMagnitude).toBeGreaterThan(0);
      expect(telemetry.metrics.resourceEfficiency).toBe(0.88);
      expect(telemetry.metrics.robustness).toBe(1.0);
      expect(telemetry.metrics.knowledgeOutcome.lessonsCount).toBe(2);

      // Uninterrupted provenance & deterministic identity
      expect(telemetry.provenance).toContain(cell.nodeId);
      expect(telemetry.provenance).toContain('exp_success_001');
      expect(telemetry.provenance).toContain('EXPERIENCE_EVOLUTION_TELEMETRY');
      expect(telemetry.deterministicHash).toBeDefined();
      expect(telemetry.deterministicHash.length).toBe(64);
    });

    it('should correctly capture failure signals and repeated failures', () => {
      const evolution = cell.evolution;
      const failExperience: Experience = createMockExperience({
        experienceId: 'exp_fail_001',
        outcome: MetabolismStatus.REJECTED,
        confidence: 0.3,
        noveltyScore: 0.7,
        lessonsDerived: ['Failure: Route timed out'],
        verificationStatus: 'CONTRADICTED_BY_WORLD',
        timestamp: new Date().toISOString()
      });

      const telemetry1 = evolution.extractTelemetryFromExperience(failExperience, undefined, undefined, cell);
      evolution.recordExperienceTelemetry(telemetry1);

      expect(telemetry1.metrics.taskOutcome).toBe(MetabolismStatus.REJECTED);
      expect(telemetry1.metrics.predictionAccuracy).toBe(0.0);
      expect(telemetry1.metrics.confidenceChange).toBeLessThan(0);
      expect(evolution.getConsecutiveFailures(cell.nodeId)).toBe(1);

      // Second consecutive failure
      const telemetry2 = evolution.extractTelemetryFromExperience(failExperience, undefined, undefined, cell);
      evolution.recordExperienceTelemetry(telemetry2);
      expect(evolution.getConsecutiveFailures(cell.nodeId)).toBe(2);

      // Subsequent success resets consecutive failures
      const successExperience: Experience = createMockExperience({
        ...failExperience,
        experienceId: 'exp_succ_002',
        outcome: MetabolismStatus.ACCEPTED,
        verificationStatus: 'CONFIRMED_BY_WORLD'
      });
      const telemetry3 = evolution.extractTelemetryFromExperience(successExperience, undefined, undefined, cell);
      evolution.recordExperienceTelemetry(telemetry3);
      expect(evolution.getConsecutiveFailures(cell.nodeId)).toBe(0);
    });
  });

  describe('2. Multi-Stage Separation: Experience -> Learning -> Evolution Telemetry -> Evolution Cycle', () => {
    it('does NOT mutate the genome upon recording experience telemetry', async () => {
      const initialGenome = cell.genome;
      const initialGeneration = initialGenome.generation;
      const initialGenomeId = initialGenome.genomeId;

      const experience: Experience = createMockExperience({
        experienceId: 'exp_stage_sep_01',
        outcome: MetabolismStatus.ACCEPTED,
        confidence: 0.85,
        timestamp: new Date().toISOString()
      });

      // Recording telemetry
      await cell.recordExperienceTelemetry(experience);

      // Verification: Telemetry is recorded in EvolutionEngine
      const telemetries = cell.evolution.getExperienceTelemetry(cell.nodeId);
      expect(telemetries.length).toBe(1);
      expect(telemetries[0].experienceId).toBe('exp_stage_sep_01');

      // Crucial: Genome is NOT mutated!
      expect(cell.genome.generation).toBe(initialGeneration);
      expect(cell.genome.genomeId).toBe(initialGenomeId);
    });

    it('enforces strict semantic boundary via feedback transition domain', () => {
      const experiencePayload: Experience = createMockExperience({
        experienceId: 'dom_exp_01',
        outcome: MetabolismStatus.ACCEPTED,
        confidence: 0.9,
        timestamp: new Date().toISOString()
      });

      const domainExperience = {
        contractVersion: 1,
        domainKind: DomainKind.EXPERIENCE,
        deterministicId: 'exp_det_01',
        cellId: cell.nodeId,
        cycleNumber: 1,
        timestamp: new Date().toISOString(),
        causalReferences: [],
        provenance: [cell.nodeId],
        confidence: 0.9,
        status: MetabolismStatus.ACCEPTED,
        payload: experiencePayload
      };

      const fitness = cell.evolution.evaluateFitness(cell);

      const transitionParams = {
        cellId: cell.nodeId,
        lineageId: cell.lineage.lineageId,
        generation: cell.genome.generation,
        cycleNumber: 1,
        fitnessComponents: fitness.components,
        overallFitness: fitness.overallFitness,
        metrics: {
          taskOutcome: MetabolismStatus.ACCEPTED,
          predictionAccuracy: 0.95,
          verificationResult: 'CONFIRMED' as const,
          confidenceChange: 0.05,
          repeatedFailure: 0,
          adaptation: {
            conceptsAdapted: 1,
            relationsAdapted: 1,
            conflictsDetected: 0,
            adaptationMagnitude: 0.1
          },
          resourceEfficiency: 0.85,
          robustness: 0.9,
          knowledgeOutcome: {
            conceptsCount: 2,
            relationsCount: 1,
            lessonsCount: 1
          }
        },
        measurementWindow: {
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString()
        }
      };

      const transition = transitionExperienceToEvolutionTelemetry(domainExperience as any, transitionParams);
      expect(transition.envelope.sourceDomain).toBe(DomainKind.EXPERIENCE);
      expect(transition.envelope.targetDomain).toBe(DomainKind.EVOLUTION_TELEMETRY);
      expect(transition.evolutionTelemetry.payload.taskOutcome).toBe(MetabolismStatus.ACCEPTED);

      // Invalid input domain kind must trigger SemanticBoundaryViolationError
      expect(() => {
        transitionExperienceToEvolutionTelemetry({
          ...domainExperience,
          domainKind: DomainKind.OBSERVATION as any
        } as any, transitionParams);
      }).toThrow(SemanticBoundaryViolationError);
    });
  });

  describe('3. Bounded Trigger Policy: Evolution Cycles are Governed', () => {
    it('evaluates warrant as false when thresholds are not met', () => {
      const evolution = cell.evolution;
      const evaluation = evolution.evaluateEvolutionWarrant(cell, {
        minTelemetryCount: 5,
        maxConsecutiveFailures: 3
      });

      expect(evaluation.warranted).toBe(false);
      expect(evaluation.triggerType).toBe(EvolutionTriggerType.NONE);
    });

    it('triggers evolution cycle when consecutive failure threshold is breached', async () => {
      const evolution = cell.evolution;
      const initialGenomeVersion = cell.genome.genomeVersion;
      const initialGenomeId = cell.genome.genomeId;

      const failExp: Experience = createMockExperience({
        experienceId: 'exp_fail_repeat',
        outcome: MetabolismStatus.FAILED,
        verificationStatus: 'CONTRADICTED_BY_WORLD',
        timestamp: new Date().toISOString()
      });

      const policy: Partial<EvolutionTriggerPolicy> = {
        maxConsecutiveFailures: 2,
        minCooldownMs: 0 // Zero cooldown for test
      };

      // Record 1 failure
      const telem1 = evolution.extractTelemetryFromExperience(failExp, undefined, undefined, cell);
      await evolution.recordExperienceTelemetry(telem1);
      let warrant = evolution.evaluateEvolutionWarrant(cell, policy);
      expect(warrant.warranted).toBe(false);

      // Record 2nd failure -> reaches maxConsecutiveFailures threshold
      const telem2 = evolution.extractTelemetryFromExperience(failExp, undefined, undefined, cell);
      await evolution.recordExperienceTelemetry(telem2);
      warrant = evolution.evaluateEvolutionWarrant(cell, policy);
      expect(warrant.warranted).toBe(true);
      expect(warrant.triggerType).toBe(EvolutionTriggerType.CONSECUTIVE_FAILURES);

      // Now execute bounded trigger
      const event = await cell.checkAndTriggerEvolution({
        seed: 'test_repair_seed',
        policy
      });

      expect(event).not.toBeNull();
      expect(event?.newGenomeId).not.toBe(initialGenomeId);
      expect(cell.genome.genomeVersion).toBe(initialGenomeVersion + 1);
      expect(evolution.getConsecutiveFailures(cell.nodeId)).toBe(0); // Reset after cycle
    });

    it('triggers evolution cycle when telemetry batch epoch is reached', async () => {
      const evolution = cell.evolution;
      const initialGenomeVersion = cell.genome.genomeVersion;
      const initialGenomeId = cell.genome.genomeId;

      const policy: Partial<EvolutionTriggerPolicy> = {
        minTelemetryCount: 3,
        adaptationPlateauThreshold: 3,
        minCooldownMs: 0
      };

      for (let i = 0; i < 3; i++) {
        const exp: Experience = createMockExperience({
          experienceId: `exp_batch_${i}`,
          outcome: MetabolismStatus.ACCEPTED,
          verificationStatus: 'CONFIRMED_BY_WORLD',
          confidence: 0.9,
          timestamp: new Date().toISOString()
        });
        const telem = evolution.extractTelemetryFromExperience(exp, undefined, undefined, cell);
        await evolution.recordExperienceTelemetry(telem);
      }

      const warrant = evolution.evaluateEvolutionWarrant(cell, policy);
      expect(warrant.warranted).toBe(true);
      expect(warrant.triggerType).toBe(EvolutionTriggerType.TELEMETRY_WINDOW);

      const event = await cell.checkAndTriggerEvolution({
        seed: 'test_batch_seed',
        policy
      });

      expect(event).not.toBeNull();
      expect(event?.newGenomeId).not.toBe(initialGenomeId);
      expect(cell.genome.genomeVersion).toBe(initialGenomeVersion + 1);
    });

    it('enforces cooldown period between evolution cycles', async () => {
      const evolution = cell.evolution;
      const policy: Partial<EvolutionTriggerPolicy> = {
        maxConsecutiveFailures: 1,
        minCooldownMs: 10000 // 10s cooldown
      };

      const failExp: Experience = createMockExperience({
        experienceId: 'exp_cooldown_fail',
        outcome: MetabolismStatus.FAILED,
        verificationStatus: 'CONTRADICTED_BY_WORLD',
        timestamp: new Date().toISOString()
      });

      // 1 failure triggers
      const telem1 = evolution.extractTelemetryFromExperience(failExp, undefined, undefined, cell);
      await evolution.recordExperienceTelemetry(telem1);

      const event = await cell.checkAndTriggerEvolution({ seed: 'test_seed_1', policy });
      expect(event).not.toBeNull();

      // Immediately trigger another failure
      const telem2 = evolution.extractTelemetryFromExperience(failExp, undefined, undefined, cell);
      await evolution.recordExperienceTelemetry(telem2);

      // Warrant evaluation must be blocked by cooldown!
      const warrant = evolution.evaluateEvolutionWarrant(cell, policy);
      expect(warrant.warranted).toBe(false);
      expect(warrant.reason).toContain('cooldown');

      // Execution returns null
      const secondEvent = await cell.checkAndTriggerEvolution({ seed: 'test_seed_2', policy });
      expect(secondEvent).toBeNull();
    });
  });

  describe('4. Production Call Path: developFromExperience -> Evolution Telemetry Bridge', () => {
    it('automatically transitions experience and learning into evolution telemetry during developFromExperience', async () => {
      const experience: Experience = createMockExperience({
        experienceId: 'exp_production_001',
        outcome: MetabolismStatus.ACCEPTED,
        confidence: 0.88,
        verificationStatus: 'CONFIRMED_BY_WORLD',
        timestamp: new Date().toISOString(),
        lessonsDerived: ['Adaptive stability confirmed']
      });

      // In production, when a cell develops an experience, it updates cognitive representations AND bridges telemetry
      const result = await cell.developFromExperience(experience);
      expect(result).toBeDefined();

      // Verify that the EvolutionEngine received the evolutionary telemetry
      const telemetries = cell.evolution.getExperienceTelemetry(cell.nodeId);
      expect(telemetries.length).toBeGreaterThan(0);

      const latest = telemetries[telemetries.length - 1];
      expect(latest.experienceId).toBe('exp_production_001');
      expect(latest.cellId).toBe(cell.nodeId);
      expect(latest.lineageId).toBe(cell.lineage.lineageId);
      expect(latest.metrics.taskOutcome).toBe(MetabolismStatus.ACCEPTED);
      expect(latest.metrics.verificationResult).toBe('CONFIRMED_BY_WORLD');
      expect(latest.provenance).toContain(cell.nodeId);
      expect(latest.provenance).toContain('exp_production_001');
    });

    it('persists telemetry and allows recovery across engine / store restarts', async () => {
      const experience: Experience = createMockExperience({
        experienceId: 'exp_persist_001',
        outcome: MetabolismStatus.ACCEPTED,
        confidence: 0.94,
        verificationStatus: 'CONFIRMED_BY_WORLD',
        timestamp: new Date().toISOString()
      });

      await cell.developFromExperience(experience);

      // Create a fresh evolution engine for the cell
      const newEvolutionEngine = new EvolutionEngine(cell);
      expect(newEvolutionEngine.getExperienceTelemetry(cell.nodeId).length).toBe(0);

      // Recover persisted telemetry from the Cell's JsonFileMemoryStore
      const recoveredCount = await newEvolutionEngine.recoverTelemetry(cell.memory, cell.nodeId);
      expect(recoveredCount).toBeGreaterThan(0);

      const recovered = newEvolutionEngine.getExperienceTelemetry(cell.nodeId);
      expect(recovered.some(t => t.experienceId === 'exp_persist_001')).toBe(true);
    });
  });

  describe('5. Decentralized Population Aggregation (Anti-Centralization)', () => {
    it('aggregates peer telemetries locally in a decentralized cell-centric manner', () => {
      const evolution = cell.evolution;

      const peerTelemetries = [
        evolution.extractTelemetryFromExperience(createMockExperience({
          experienceId: 'peer_exp_1',
          outcome: MetabolismStatus.ACCEPTED,
          verificationStatus: 'CONFIRMED_BY_WORLD',
          confidence: 0.9,
          timestamp: new Date().toISOString()
        }), undefined, undefined, cell),
        evolution.extractTelemetryFromExperience(createMockExperience({
          experienceId: 'peer_exp_2',
          outcome: MetabolismStatus.REJECTED,
          verificationStatus: 'CONTRADICTED_BY_WORLD',
          confidence: 0.2,
          timestamp: new Date().toISOString()
        }), undefined, undefined, cell)
      ];

      const populationMetrics = evolution.aggregatePeerTelemetry(peerTelemetries);

      expect(() => PopulationTelemetryMetricsSchema.parse(populationMetrics)).not.toThrow();
      expect(populationMetrics.totalTelemetries).toBe(2);
      expect(populationMetrics.overallFailureRate).toBe(0.5);
      expect(populationMetrics.averageFitness).toBeGreaterThan(0);
      expect(populationMetrics.deterministicHash).toBeDefined();
    });
  });
});
