/**
 * Red Queen Unified Lifelong Learning & Epistemic Discovery Engine (Phase 8)
 * 
 * Central coordinator combining:
 * 1. Autonomous Curiosity Loop (Gap & Entropy Detection)
 * 2. Cross-Domain Analogy Engine (Structural Isomorphism in 4096-bit HDC)
 * 3. Hypothesis Generation & Symbolic Self-Verification (ATP Staking & Discovery Promotion)
 * 4. Sleep-Phase Memory Consolidation (Replay Buffer, Pruning, Zero Catastrophic Forgetting)
 */

import { AutonomousCuriosityEngine, KnowledgeGap, CuriosityInvestigationResult } from './curiosity_loop';
import { CrossDomainAnalogyEngine, AnalogySynthesisResult } from './cross_domain_analogy';
import { HypothesisVerificationEngine, CandidateHypothesis, EpistemicDiscovery } from './hypothesis_engine';
import { SleepPhaseConsolidator, SleepConsolidationReport } from './sleep_consolidator';
import { KnowledgeDistillationEngine } from '../knowledge_distillation';
import { WikipediaIngestionPipeline } from '../wiki_pipeline';

export interface LifelongTelemetry {
  isDaemonActive: boolean;
  daemonIntervalMs: number;
  totalLifelongCyclesRun: number;
  activeKnowledgeGapsCount: number;
  epistemicDiscoveriesCount: number;
  analogiesSynthesizedCount: number;
  replayBufferSize: number;
  sleepConsolidationsCount: number;
  retentionStabilityIndex: number; // 1.0 = 100%
  atpStakeBalance: {
    totalStaked: number;
    totalRewarded: number;
    netYield: number;
  };
  lastDiscovery?: EpistemicDiscovery;
  lastSleepReport?: SleepConsolidationReport;
}

export class LifelongLearningEngine {
  public readonly curiosity: AutonomousCuriosityEngine;
  public readonly analogy: CrossDomainAnalogyEngine;
  public readonly hypothesis: HypothesisVerificationEngine;
  public readonly sleepConsolidator: SleepPhaseConsolidator;

  private isDaemonActive: boolean = false;
  private daemonTimer: NodeJS.Timeout | null = null;
  private totalLifelongCyclesRun: number = 0;

  constructor(
    private readonly knowledgeBase?: KnowledgeDistillationEngine,
    private readonly wikiPipeline?: WikipediaIngestionPipeline
  ) {
    this.curiosity = new AutonomousCuriosityEngine(this.knowledgeBase, this.wikiPipeline);
    this.analogy = new CrossDomainAnalogyEngine();
    this.hypothesis = new HypothesisVerificationEngine(this.knowledgeBase, this.wikiPipeline);
    this.sleepConsolidator = new SleepPhaseConsolidator(this.knowledgeBase);

    // Bootstrap initial discovery scans
    this.curiosity.scanForGaps(3);
  }

  /**
   * Runs an integrated autonomous learning cycle (Curiosity -> Hypothesis -> Verification)
   */
  public runLearningCycle(): {
    investigation: CuriosityInvestigationResult;
    discovery: EpistemicDiscovery | null;
  } {
    this.totalLifelongCyclesRun++;

    // 1. Scan and investigate an existing knowledge gap
    const investigation = this.curiosity.investigateGap();

    // 2. Formulate and verify an epistemic hypothesis with ATP staking
    const candidate = this.hypothesis.generateHypothesis(investigation.deducedTriplet?.category || 'Cybersecurity', 10);
    const discovery = this.hypothesis.verifyHypothesis(candidate.hypothesisId);

    // 3. Record trace into sleep replay buffer
    this.sleepConsolidator.recordExperience(
      `Autonomous Learning Cycle #${this.totalLifelongCyclesRun}: Target ${investigation.targetEntity} -> Status ${investigation.status}`,
      'INFERENCE'
    );

    return {
      investigation,
      discovery
    };
  }

  /**
   * Synthesizes cross-domain analogy between two selected domains
   */
  public synthesizeAnalogy(sourceDomain?: string, targetDomain?: string): AnalogySynthesisResult {
    const res = this.analogy.synthesizeAnalogy(sourceDomain, targetDomain);
    this.sleepConsolidator.recordExperience(
      `Cross-Domain Analogy: ${res.sourceDomain} <-> ${res.targetDomain} with resonance ${(res.isomorphismScore * 100).toFixed(1)}%`,
      'INFERENCE'
    );
    return res;
  }

  /**
   * Generates a new theoretical proposition and runs automated logic prover
   */
  public generateAndVerifyHypothesis(topic?: string, atpStake: number = 10): {
    candidate: CandidateHypothesis;
    discovery: EpistemicDiscovery | null;
  } {
    const candidate = this.hypothesis.generateHypothesis(topic, atpStake);
    const discovery = this.hypothesis.verifyHypothesis(candidate.hypothesisId);
    return { candidate, discovery };
  }

  /**
   * Triggers biological Slow-Wave Sleep Memory Consolidation
   */
  public triggerSleepConsolidation(): SleepConsolidationReport {
    return this.sleepConsolidator.executeSleepCycle();
  }

  /**
   * Starts background autonomous learning daemon
   */
  public startAutonomousDaemon(intervalMs: number = 30000): void {
    if (this.isDaemonActive) return;
    this.isDaemonActive = true;
    this.daemonTimer = setInterval(() => {
      try {
        this.runLearningCycle();
      } catch (err) {
        console.error('[LifelongLearningDaemon] Error executing cycle:', err);
      }
    }, intervalMs);
    // Unref daemon timer so it does not block Node process exit in tests
    if (this.daemonTimer.unref) {
      this.daemonTimer.unref();
    }
  }

  /**
   * Stops background autonomous learning daemon
   */
  public stopAutonomousDaemon(): void {
    this.isDaemonActive = false;
    if (this.daemonTimer) {
      clearInterval(this.daemonTimer);
      this.daemonTimer = null;
    }
  }

  /**
   * Returns comprehensive lifelong learning telemetry
   */
  public getTelemetry(): LifelongTelemetry {
    const gaps = this.curiosity.getActiveGaps();
    const discoveries = this.hypothesis.getDiscoveries();
    const hypStats = this.hypothesis.getStats();
    const lastSleep = this.sleepConsolidator.getLastReport();

    return {
      isDaemonActive: this.isDaemonActive,
      daemonIntervalMs: 30000,
      totalLifelongCyclesRun: this.totalLifelongCyclesRun,
      activeKnowledgeGapsCount: gaps.length,
      epistemicDiscoveriesCount: discoveries.length,
      analogiesSynthesizedCount: this.analogy.getAnalogyHistory().length,
      replayBufferSize: this.sleepConsolidator.getReplayBufferSize(),
      sleepConsolidationsCount: this.sleepConsolidator.getConsolidationHistory().length,
      retentionStabilityIndex: lastSleep ? lastSleep.retentionStabilityScore : 1.0,
      atpStakeBalance: {
        totalStaked: hypStats.totalAtpStaked,
        totalRewarded: hypStats.totalAtpRewarded,
        netYield: hypStats.netAtpYield
      },
      lastDiscovery: discoveries[0],
      lastSleepReport: lastSleep || undefined
    };
  }
}
