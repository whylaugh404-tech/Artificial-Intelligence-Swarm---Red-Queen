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
import { CellMetabolismController } from '../../metabolism/cellular_vitality';

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
    vitalityTelemetry?: any;
  };
  lastDiscovery?: EpistemicDiscovery;
  lastSleepReport?: SleepConsolidationReport;
}

export class LifelongLearningEngine {
  public readonly curiosity: AutonomousCuriosityEngine;
  public readonly analogy: CrossDomainAnalogyEngine;
  public readonly hypothesis: HypothesisVerificationEngine;
  public readonly sleepConsolidator: SleepPhaseConsolidator;
  public vitality?: CellMetabolismController;

  private isDaemonActive: boolean = false;
  private daemonTimer: NodeJS.Timeout | null = null;
  private totalLifelongCyclesRun: number = 0;

  constructor(
    private readonly knowledgeBase?: KnowledgeDistillationEngine,
    private readonly wikiPipeline?: WikipediaIngestionPipeline,
    vitality?: CellMetabolismController
  ) {
    this.vitality = vitality;
    this.curiosity = new AutonomousCuriosityEngine(this.knowledgeBase, this.wikiPipeline);
    this.analogy = new CrossDomainAnalogyEngine();
    this.hypothesis = new HypothesisVerificationEngine(this.knowledgeBase, this.wikiPipeline);
    this.sleepConsolidator = new SleepPhaseConsolidator(this.knowledgeBase);

    // Bootstrap initial discovery scans
    this.curiosity.scanForGaps(3);
  }

  public setVitality(vitality: CellMetabolismController): void {
    this.vitality = vitality;
  }

  /**
   * Runs an integrated autonomous learning cycle (Curiosity -> Hypothesis -> Verification)
   */
  public runLearningCycle(): {
    investigation: CuriosityInvestigationResult;
    discovery: EpistemicDiscovery | null;
  } {
    this.totalLifelongCyclesRun++;

    // Consume Basal Metabolic Rate per learning cycle
    this.vitality?.applyBasalMetabolism();

    // 1. Scan and investigate an existing knowledge gap
    const investigation = this.curiosity.investigateGap();
    if (this.vitality) {
      this.vitality.consumeAtp(investigation.atpConsumed || 1.0, 'CURIOSITY_INVESTIGATION', { target: investigation.targetEntity });
    }

    // 2. Formulate and verify an epistemic hypothesis with real ATP staking
    const stakeAmount = 10;
    const candidate = this.hypothesis.generateHypothesis(investigation.deducedTriplet?.category || 'Cybersecurity', stakeAmount);
    if (this.vitality) {
      this.vitality.consumeAtp(candidate.atpStake, 'HYPOTHESIS_STAKE', { hypothesisId: candidate.hypothesisId });
    }

    const discovery = this.hypothesis.verifyHypothesis(candidate.hypothesisId);
    if (discovery && this.vitality) {
      this.vitality.generateAtp(discovery.atpYieldReward, 'HYPOTHESIS_DISCOVERY_YIELD', { discoveryId: discovery.discoveryId });
    }

    // 3. Autonomous Evolutionary Survival Pressure Check:
    // If vitality drops into STARVATION or CRITICAL_APOPTOSIS_RISK, trigger pathway restructuring
    if (this.vitality) {
      const vState = this.vitality.getVitalityState();
      if (vState === 'STARVATION' || vState === 'CRITICAL_APOPTOSIS_RISK') {
        this.vitality.restructureReasoningPathways({
          hypothesisPruner: () => this.hypothesis.pruneSpeculativeHypotheses()
        });
      }
    }

    // 4. Record trace into sleep replay buffer
    this.sleepConsolidator.recordExperience(
      `Autonomous Learning Cycle #${this.totalLifelongCyclesRun}: Target ${investigation.targetEntity} -> Status ${investigation.status}`,
      'INFERENCE'
    );

    // 5. Periodically execute Slow-Wave Sleep Consolidation every 5 cycles
    if (this.totalLifelongCyclesRun % 5 === 0) {
      try {
        this.triggerSleepConsolidation();
      } catch (e) {
        // Safe continuation
      }
    }

    return {
      investigation,
      discovery
    };
  }

  /**
   * Synthesizes cross-domain analogy between two selected domains
   */
  public synthesizeAnalogy(sourceDomain?: string, targetDomain?: string): AnalogySynthesisResult {
    if (this.vitality) {
      this.vitality.consumeAtp(0.5, 'ANALOGY_SYNTHESIS', { sourceDomain, targetDomain });
    }
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
    if (this.vitality) {
      this.vitality.consumeAtp(atpStake, 'HYPOTHESIS_STAKE_MANUAL', { topic });
    }
    const candidate = this.hypothesis.generateHypothesis(topic, atpStake);
    const discovery = this.hypothesis.verifyHypothesis(candidate.hypothesisId);
    if (discovery && this.vitality) {
      this.vitality.generateAtp(discovery.atpYieldReward, 'HYPOTHESIS_DISCOVERY_YIELD_MANUAL', { discoveryId: discovery.discoveryId });
    }
    return { candidate, discovery };
  }

  /**
   * Triggers biological Slow-Wave Sleep Memory Consolidation and Glymphatic Clearance
   */
  public triggerSleepConsolidation(): SleepConsolidationReport {
    // Flush toxic catabolic waste during sleep phase
    this.vitality?.glymphaticClearance(0.85);
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
        netYield: hypStats.netAtpYield,
        vitalityTelemetry: this.vitality?.getTelemetry()
      },
      lastDiscovery: discoveries[0],
      lastSleepReport: lastSleep || undefined
    };
  }
}
