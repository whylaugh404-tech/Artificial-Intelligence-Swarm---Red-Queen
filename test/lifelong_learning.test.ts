import { describe, it, expect, beforeEach } from 'vitest';
import { AutonomousCuriosityEngine } from '../src/redqueen/cognition/lifelong_learning/curiosity_loop';
import { CrossDomainAnalogyEngine } from '../src/redqueen/cognition/lifelong_learning/cross_domain_analogy';
import { HypothesisVerificationEngine } from '../src/redqueen/cognition/lifelong_learning/hypothesis_engine';
import { SleepPhaseConsolidator } from '../src/redqueen/cognition/lifelong_learning/sleep_consolidator';
import { LifelongLearningEngine } from '../src/redqueen/cognition/lifelong_learning/lifelong_engine';
import { NeuroSymbolicEngine } from '../src/redqueen/cognition/neuro_symbolic_engine';
import { KnowledgeDistillationEngine } from '../src/redqueen/cognition/knowledge_distillation';
import { WikipediaIngestionPipeline } from '../src/redqueen/cognition/wiki_pipeline';

describe('Phase 8: Continuous Autonomous Lifelong Learning & Epistemic Discovery Engine', () => {
  let kb: KnowledgeDistillationEngine;
  let wiki: WikipediaIngestionPipeline;

  beforeEach(() => {
    kb = new KnowledgeDistillationEngine(20000, 128);
    wiki = new WikipediaIngestionPipeline(kb.index);
  });

  describe('8.1. Autonomous Curiosity Loop Engine', () => {
    it('should detect knowledge gaps and missing causal links', () => {
      const curiosity = new AutonomousCuriosityEngine(kb, wiki);
      const gaps = curiosity.scanForGaps(4);
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps[0].gapId).toBeDefined();
      expect(gaps[0].formulatedInquiry).toBeDefined();
      expect(gaps[0].priority).toBeGreaterThan(0.5);
    });

    it('should proactively investigate and resolve a knowledge gap', () => {
      const curiosity = new AutonomousCuriosityEngine(kb, wiki);
      const gaps = curiosity.scanForGaps(2);
      expect(gaps.length).toBeGreaterThan(0);

      const investigation = curiosity.investigateGap(gaps[0].gapId);
      expect(investigation.status).toBe('RESOLVED');
      expect(investigation.deducedTriplet).toBeDefined();
      expect(investigation.deducedTriplet?.subject).toBe(gaps[0].targetEntity);
      expect(investigation.epistemicConfidence).toBeGreaterThanOrEqual(0.85);
      expect(investigation.atpConsumed).toBeGreaterThan(0);
      expect(investigation.evidenceTraces.length).toBeGreaterThan(0);
    });
  });

  describe('8.2. Cross-Domain Analogy Engine (4096-bit HDC Isomorphism)', () => {
    it('should synthesize structural isomorphism between immunology and cybersecurity', () => {
      const analogyEngine = new CrossDomainAnalogyEngine();
      const result = analogyEngine.synthesizeAnalogy('CELLULAR_IMMUNOLOGY', 'CYBERSECURITY_ZERO_TRUST');

      expect(result.sourceDomain).toBe('CELLULAR_IMMUNOLOGY');
      expect(result.targetDomain).toBe('CYBERSECURITY_ZERO_TRUST');
      expect(result.isomorphismScore).toBeGreaterThan(0.70);
      expect(result.roleMappings.length).toBeGreaterThanOrEqual(4);
      expect(result.derivedPrinciple).toContain('Isomorfisme Struktural');
      expect(result.actionableComputationalInsight).toBeDefined();
      expect(result.formalHypothesisTheorem).toBeDefined();
      expect(result.hdcStructuralSignature).toMatch(/^0x[0-9a-fA-F]+/);
    });

    it('should synthesize analogies between physics and distributed consensus', () => {
      const analogyEngine = new CrossDomainAnalogyEngine();
      const result = analogyEngine.synthesizeAnalogy('THERMODYNAMICS_PHYSICS', 'DISTRIBUTED_CONSENSUS');

      expect(result.isomorphismScore).toBeGreaterThan(0.70);
      expect(result.roleMappings.some(r => r.role === 'SENTINEL_SENSOR')).toBe(true);
    });
  });

  describe('8.3. Hypothesis Generation & Automated Symbolic Self-Verification (ATP Staking)', () => {
    it('should generate a candidate hypothesis from multi-hop knowledge premises', () => {
      const hypEngine = new HypothesisVerificationEngine(kb, wiki);
      const candidate = hypEngine.generateHypothesis('Cryptography', 12);

      expect(candidate.hypothesisId).toBeDefined();
      expect(candidate.premiseTriplets.length).toBe(2);
      expect(candidate.atpStake).toBe(12);
      expect(candidate.status).toBe('PENDING_VERIFICATION');
    });

    it('should execute symbolic proof, verify consistency, and reward ATP yield', () => {
      const hypEngine = new HypothesisVerificationEngine(kb, wiki);
      const candidate = hypEngine.generateHypothesis('Cybersecurity', 10);
      const discovery = hypEngine.verifyHypothesis(candidate.hypothesisId);

      expect(discovery).not.toBeNull();
      if (discovery) {
        expect(discovery.epistemicConfidence).toBeGreaterThanOrEqual(0.85);
        expect(discovery.atpInvested).toBe(10);
        expect(discovery.atpYieldReward).toBe(13); // +25% reward (rounded)
        expect(discovery.symbolicProofTrace.length).toBeGreaterThanOrEqual(3);
        expect(discovery.symbolicProofTrace.every(s => s.status === 'PASSED')).toBe(true);
      }

      const stats = hypEngine.getStats();
      expect(stats.totalDiscoveriesVerified).toBe(1);
      expect(stats.netAtpYield).toBeGreaterThan(0);
    });
  });

  describe('8.4. Sleep-Phase Memory Consolidation (Zero Catastrophic Forgetting)', () => {
    it('should record replay traces and execute slow-wave sleep consolidation', () => {
      const consolidator = new SleepPhaseConsolidator(kb);
      consolidator.recordExperience('Kueri pengguna terkait keamanan siber zero-trust', 'CONVERSATION');
      consolidator.recordExperience('Hasil inferensi analisis kriptografi Ed25519', 'INFERENCE');

      expect(consolidator.getReplayBufferSize()).toBe(2);

      const report = consolidator.executeSleepCycle();
      expect(report.sessionId).toBeDefined();
      expect(report.replayedItemsCount).toBe(2);
      expect(report.clustersConsolidated).toBeGreaterThan(0);
      expect(report.memoryCompressionRatio).toBeGreaterThan(1.0);
      expect(report.retentionStabilityScore).toBe(1.0); // 100% Zero Catastrophic Forgetting guarantee
      expect(report.benchmarkAxiomsRetained).toBe(report.benchmarkAxiomsChecked);
      expect(consolidator.getReplayBufferSize()).toBe(0); // Cleared after sleep
    });
  });

  describe('8.5. Unified Lifelong Learning & Epistemic Discovery Engine', () => {
    it('should run integrated learning cycles combining curiosity and hypothesis verification', () => {
      const engine = new LifelongLearningEngine(kb, wiki);
      const outcome = engine.runLearningCycle();

      expect(outcome.investigation).toBeDefined();
      expect(outcome.investigation.status).toBe('RESOLVED');
      expect(outcome.discovery).toBeDefined();

      const telemetry = engine.getTelemetry();
      expect(telemetry.totalLifelongCyclesRun).toBe(1);
      expect(telemetry.retentionStabilityIndex).toBe(1.0);
    });

    it('should integrate seamlessly into NeuroSymbolicEngine and feed into processChat', async () => {
      const ns = new NeuroSymbolicEngine();
      
      // Run autonomous learning cycle to discover a new theorem
      const cycle = ns.lifelongLearning.runLearningCycle();
      expect(cycle.discovery).not.toBeNull();

      // Process chat to verify Red Queen references or grounds responses
      const response = await ns.processChat('Jelaskan penemuan hipotesis baru tentang keamanan dan koordinasi sel');
      expect(response.statement).toBeDefined();
      expect(response.statement.length).toBeGreaterThan(20);
      expect(response.telemetry.lifelongTelemetry).toBeDefined();
      expect(response.telemetry.lifelongTelemetry?.epistemicDiscoveriesCount).toBeGreaterThanOrEqual(1);

      // Verify sleep replay recorded the interaction
      expect(response.telemetry.lifelongTelemetry?.replayBufferSize).toBeGreaterThanOrEqual(1);
    });
  });
});
