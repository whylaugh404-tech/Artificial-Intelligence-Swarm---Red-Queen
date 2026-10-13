/**
 * Red Queen Evolutionary Cellular Vitality & Dynamic Metabolism Engine (Langkah 5)
 * 
 * Replaces simplistic integer accounting with a biomimetic energetic survival model:
 * - Dynamic ATP energy pool with homeostatic capacity constraints
 * - Catabolic waste accumulation, toxicity penalties, and metabolic inefficiency under load
 * - Basal Metabolic Rate (BMR) consumption per cycle
 * - Multi-tiered Evolutionary Survival Pressure states: OPTIMAL, STRESSED, STARVATION, CRITICAL_APOPTOSIS_RISK
 * - Autonomous Reasoning Pathway Restructuring: prunes low-confidence speculative paths to prevent cellular failure
 * - Autophagic recycling of catabolic debris into emergency ATP
 * - Active Glymphatic Clearance during sleep cycles
 */

import {
  CellVitalityState,
  CellVitalityTelemetry,
  CognitiveReasoningMode,
  MetabolismEventType,
  RestructureReasoningReport
} from './types';
import { MetabolismAuditTrail } from './audit';
import { MemoryStore, MemoryCategory } from '../memory/store';
import { logger } from '../core/logger';
import type { CognitiveGraph } from '../cognition/representation/graph';

export type VitalityTelemetry = CellVitalityTelemetry;

export interface CellularVitalityConfig {
  readonly initialAtp?: number;
  readonly maxAtpPool?: number;
  readonly capacity?: number;
  readonly basalMetabolicRate?: number;
  readonly toxicityThreshold?: number;
  readonly criticalStarvationThreshold?: number;
  readonly starvationThreshold?: number;
  readonly criticalThreshold?: number;
}

export interface CellVitalitySnapshot {
  readonly cellId: string;
  readonly atpPool: number;
  readonly atpCapacity: number;
  readonly maxAtpPool: number;
  readonly catabolicWaste: number;
  readonly toxicityThreshold: number;
  readonly basalMetabolicRate: number;
  readonly vitalityState: CellVitalityState;
  readonly activeMode: CognitiveReasoningMode;
  readonly activeReasoningMode: CognitiveReasoningMode;
  readonly survivalRestructuringCount: number;
  readonly pathwaysRestructuredCount: number;
  readonly autophagicPruningCount: number;
  readonly autophagicSalvagedAtp: number;
  readonly totalAtpConsumed: number;
  readonly totalAtpGenerated: number;
}

export class CellMetabolismController {
  private readonly component = 'cellular_metabolism';
  public readonly cellId: string;
  private readonly audit?: MetabolismAuditTrail;
  private readonly memoryStore?: MemoryStore;

  private atpPool: number;
  private readonly maxAtpPool: number;
  private catabolicWaste: number;
  private readonly basalMetabolicRate: number;
  private readonly toxicityThreshold: number;
  private readonly criticalStarvationThreshold: number;
  private readonly starvationThreshold: number;

  private totalAtpConsumed: number = 0;
  private totalAtpGenerated: number = 0;
  private survivalPressureEventsCount: number = 0;
  private pathwaysRestructuredCount: number = 0;
  private autophagicPruningCount: number = 0;
  private autophagicSalvagedAtp: number = 0;
  private activeReasoningMode: CognitiveReasoningMode = 'BALANCED';

  constructor(
    cellIdOrConfig?: string | CellularVitalityConfig,
    audit?: MetabolismAuditTrail,
    memoryStore?: MemoryStore,
    config?: CellularVitalityConfig
  ) {
    let resolvedConfig: CellularVitalityConfig | undefined = config;
    if (typeof cellIdOrConfig === 'string') {
      this.cellId = cellIdOrConfig;
      if (audit && typeof (audit as any).recordEvent === 'function') {
        this.audit = audit;
        this.memoryStore = memoryStore;
        resolvedConfig = config;
      } else if (audit && typeof audit === 'object') {
        this.audit = undefined;
        this.memoryStore = undefined;
        resolvedConfig = audit as CellularVitalityConfig;
      } else {
        this.audit = undefined;
        this.memoryStore = memoryStore;
        resolvedConfig = config;
      }
    } else {
      this.cellId = 'cell_local';
      this.audit = undefined;
      this.memoryStore = undefined;
      resolvedConfig = cellIdOrConfig;
    }

    this.maxAtpPool = resolvedConfig?.maxAtpPool ?? resolvedConfig?.capacity ?? 150.0;
    this.atpPool = Math.min(this.maxAtpPool, resolvedConfig?.initialAtp ?? 100.0);
    this.catabolicWaste = 0.0;
    this.basalMetabolicRate = resolvedConfig?.basalMetabolicRate ?? 0.25;
    this.toxicityThreshold = resolvedConfig?.toxicityThreshold ?? 25.0;
    this.criticalStarvationThreshold = resolvedConfig?.criticalStarvationThreshold ?? resolvedConfig?.criticalThreshold ?? 15.0;
    this.starvationThreshold = resolvedConfig?.starvationThreshold ?? 35.0;
  }

  /**
   * Returns complete snapshot of cellular vitality
   */
  public getSnapshot(): CellVitalitySnapshot {
    return {
      cellId: this.cellId,
      atpPool: this.atpPool,
      atpCapacity: this.maxAtpPool,
      maxAtpPool: this.maxAtpPool,
      catabolicWaste: this.catabolicWaste,
      toxicityThreshold: this.toxicityThreshold,
      basalMetabolicRate: this.basalMetabolicRate,
      vitalityState: this.getVitalityState(),
      activeMode: this.activeReasoningMode,
      activeReasoningMode: this.activeReasoningMode,
      survivalRestructuringCount: this.survivalPressureEventsCount,
      pathwaysRestructuredCount: this.pathwaysRestructuredCount,
      autophagicPruningCount: this.autophagicPruningCount,
      autophagicSalvagedAtp: this.autophagicSalvagedAtp,
      totalAtpConsumed: this.totalAtpConsumed,
      totalAtpGenerated: this.totalAtpGenerated
    };
  }

  /**
   * Returns state overview containing atp, waste, mode, and state
   */
  public getState() {
    const snapshot = this.getSnapshot();
    return {
      atp: this.atpPool,
      waste: this.catabolicWaste,
      mode: this.activeReasoningMode,
      state: snapshot.vitalityState,
      snapshot
    };
  }

  /**
   * Evaluates current biological vitality state based on ATP pool and catabolic waste
   */
  public getVitalityState(): CellVitalityState {
    if (this.atpPool < this.criticalStarvationThreshold) {
      return CellVitalityState.CRITICAL_APOPTOSIS_RISK;
    }
    if (this.atpPool < this.starvationThreshold || this.catabolicWaste >= 50.0) {
      return CellVitalityState.STARVATION;
    }
    if (this.atpPool < 65.0 || this.catabolicWaste >= this.toxicityThreshold) {
      return CellVitalityState.STRESSED;
    }
    return CellVitalityState.OPTIMAL;
  }

  public evaluateVitality(): CellVitalityState {
    return this.getVitalityState();
  }

  public getSurvivalEvents(limit: number = 50) {
    if (!this.audit) return [];
    return this.audit.getEvents(limit).filter(e =>
      e.eventType === MetabolismEventType.METABOLIC_PRESSURE_TRIGGERED ||
      e.eventType === MetabolismEventType.PATHWAY_RESTRUCTURED ||
      e.eventType === MetabolismEventType.AUTOPHAGIC_PRUNING ||
      e.eventType === MetabolismEventType.GLYMPHATIC_CLEARANCE
    );
  }

  /**
   * Consumes ATP for metabolic, cognitive, or network operations.
   * Catabolic waste penalty increases energetic expenditure when toxicity is high.
   */
  public consumeAtp(
    baseAmount: number,
    reason: string,
    metadata?: Record<string, unknown>
  ): {
    success: boolean;
    actualConsumed: number;
    remainingAtp: number;
    vitalityState: CellVitalityState;
    survivalPressureTriggered: boolean;
  } {
    if (baseAmount < 0) {
      throw new Error(`Cannot consume negative ATP: ${baseAmount}`);
    }

    // Toxicity penalty: if waste exceeds threshold, metabolic efficiency drops
    const wasteToxicityFactor = this.catabolicWaste > this.toxicityThreshold
      ? 1.0 + Math.min(0.75, (this.catabolicWaste - this.toxicityThreshold) / 50.0)
      : 1.0;

    const actualConsumed = parseFloat((baseAmount * wasteToxicityFactor).toFixed(3));
    this.atpPool = Math.max(0, parseFloat((this.atpPool - actualConsumed).toFixed(3)));
    this.totalAtpConsumed = parseFloat((this.totalAtpConsumed + actualConsumed).toFixed(3));

    // Catabolic waste generation (entropy of combustion)
    const wasteGenerated = parseFloat((actualConsumed * 0.15).toFixed(3));
    this.catabolicWaste = Math.min(100.0, parseFloat((this.catabolicWaste + wasteGenerated).toFixed(3)));

    const vitalityState = this.getVitalityState();
    const survivalPressureTriggered = vitalityState === CellVitalityState.STARVATION || vitalityState === CellVitalityState.CRITICAL_APOPTOSIS_RISK;

    if (this.audit) {
      this.audit.recordEvent(
        MetabolismEventType.ATP_CONSUMED,
        `atp_${Date.now()}`,
        {
          reason,
          baseAmount,
          actualConsumed,
          wasteToxicityFactor,
          remainingAtp: this.atpPool,
          catabolicWaste: this.catabolicWaste,
          vitalityState,
          ...metadata
        }
      );

      if (survivalPressureTriggered) {
        this.audit.recordEvent(
          MetabolismEventType.METABOLIC_PRESSURE_TRIGGERED,
          `pressure_${Date.now()}`,
          {
            reason: `Vitality degraded to ${vitalityState}`,
            remainingAtp: this.atpPool,
            catabolicWaste: this.catabolicWaste
          }
        );
      }
    }

    if (survivalPressureTriggered) {
      this.survivalPressureEventsCount++;
    }

    return {
      success: this.atpPool > 0,
      actualConsumed,
      remainingAtp: this.atpPool,
      vitalityState,
      survivalPressureTriggered
    };
  }

  /**
   * Generates and adds ATP to the pool from successful cognitive harvest, validated discoveries, or external energy input.
   */
  public generateAtp(
    amount: number,
    reason: string,
    metadata?: Record<string, unknown>
  ): {
    amountGained: number;
    newAtpPool: number;
    vitalityState: CellVitalityState;
  } {
    if (amount < 0) {
      throw new Error(`Cannot generate negative ATP: ${amount}`);
    }

    const previousAtp = this.atpPool;
    this.atpPool = Math.min(this.maxAtpPool, parseFloat((this.atpPool + amount).toFixed(3)));
    const amountGained = parseFloat((this.atpPool - previousAtp).toFixed(3));
    this.totalAtpGenerated = parseFloat((this.totalAtpGenerated + amountGained).toFixed(3));

    const vitalityState = this.getVitalityState();

    if (this.audit) {
      this.audit.recordEvent(
        MetabolismEventType.ATP_GENERATED,
        `atp_gen_${Date.now()}`,
        {
          reason,
          amountRequested: amount,
          amountGained,
          newAtpPool: this.atpPool,
          vitalityState,
          ...metadata
        }
      );
    }

    return {
      amountGained,
      newAtpPool: this.atpPool,
      vitalityState
    };
  }

  /**
   * Applies Basal Metabolic Rate (BMR) consumption for maintaining cellular viability.
   */
  public applyBasalMetabolism(cycles: number = 1): { consumed: number; remainingAtp: number; vitalityState: CellVitalityState } {
    const totalBasal = parseFloat((this.basalMetabolicRate * Math.max(1, cycles)).toFixed(3));
    const res = this.consumeAtp(totalBasal, 'BASAL_METABOLIC_RATE_MAINTENANCE');
    return {
      consumed: res.actualConsumed,
      remainingAtp: res.remainingAtp,
      vitalityState: res.vitalityState
    };
  }

  /**
   * Glymphatic Clearance: flushes catabolic toxic waste during sleep or quiet periods.
   */
  public glymphaticClearance(fraction: number = 0.8): { wasteCleared: number; remainingWaste: number } {
    const clamped = Math.max(0.1, Math.min(1.0, fraction));
    const wasteCleared = parseFloat((this.catabolicWaste * clamped).toFixed(3));
    this.catabolicWaste = Math.max(0, parseFloat((this.catabolicWaste - wasteCleared).toFixed(3)));

    if (this.audit) {
      this.audit.recordEvent(
        MetabolismEventType.GLYMPHATIC_CLEARANCE,
        `clearance_${Date.now()}`,
        {
          fraction: clamped,
          wasteCleared,
          remainingWaste: this.catabolicWaste
        }
      );
    }

    return {
      wasteCleared,
      remainingWaste: this.catabolicWaste
    };
  }

  /**
   * Evolutionary Survival Restructuring:
   * When the cell faces starvation or apoptosis risk, it executes genuine biological survival actions:
   * 1. Restructures reasoning pathways (demotes exploratory speculative chains to conservative heuristics)
   * 2. Prunes speculative/unverified candidate hypotheses from memory
   * 3. Triggers Autophagic recycling (converts catabolic debris into emergency ATP)
   */
  public restructureReasoningPathways(options?: {
    hypothesisPruner?: () => number;
    graphPruner?: () => number;
  }): RestructureReasoningReport {
    const priorState = this.getVitalityState();
    const actions: string[] = [];

    // 1. Shift reasoning pathway mode based on metabolic stress
    let targetMode: CognitiveReasoningMode = 'BALANCED';
    if (this.atpPool < this.criticalStarvationThreshold) {
      targetMode = 'EMERGENCY_MINIMAL';
      actions.push('Rerouted all reasoning pathways to EMERGENCY_MINIMAL: zero exploration, strict cache lookup only');
    } else if (this.atpPool < 35.0 || this.catabolicWaste >= 50.0) {
      targetMode = 'CONSERVATIVE_HEURISTIC';
      actions.push('Restructured pathways to CONSERVATIVE_HEURISTIC: disabled multi-hop speculative queries');
    } else {
      targetMode = 'BALANCED';
      actions.push('Restructured pathways to BALANCED homeostatic equilibrium');
    }
    this.activeReasoningMode = targetMode;

    // 2. Prune low-utility hypotheses if pruner provided
    let hypothesesPruned = 0;
    if (options?.hypothesisPruner) {
      hypothesesPruned = options.hypothesisPruner();
      if (hypothesesPruned > 0) {
        actions.push(`Pruned ${hypothesesPruned} speculative candidate hypotheses to eliminate ATP stake drain`);
      }
    }

    // 3. Autophagic Recycling: lyse internal catabolic waste into emergency ATP
    let wasteRecycled = 0;
    let salvagedAtp = 0;
    if (this.catabolicWaste > 5.0) {
      wasteRecycled = parseFloat((this.catabolicWaste * 0.5).toFixed(3));
      this.catabolicWaste = parseFloat((this.catabolicWaste - wasteRecycled).toFixed(3));
      // Salvage ratio: 2.0 waste yields 1.0 ATP
      salvagedAtp = parseFloat((wasteRecycled * 0.5).toFixed(3));
      this.atpPool = Math.min(this.maxAtpPool, parseFloat((this.atpPool + salvagedAtp).toFixed(3)));
      this.autophagicSalvagedAtp = parseFloat((this.autophagicSalvagedAtp + salvagedAtp).toFixed(3));
      this.autophagicPruningCount++;
      actions.push(`Autophagy executed: recycled ${wasteRecycled} waste units into +${salvagedAtp} emergency ATP`);

      if (this.audit) {
        this.audit.recordEvent(
          MetabolismEventType.AUTOPHAGIC_PRUNING,
          `autophagy_${Date.now()}`,
          { wasteRecycled, salvagedAtp, newAtpPool: this.atpPool }
        );
      }
    }

    this.pathwaysRestructuredCount++;
    const resultingState = this.getVitalityState();

    if (this.audit) {
      this.audit.recordEvent(
        MetabolismEventType.PATHWAY_RESTRUCTURED,
        `restructure_${Date.now()}`,
        {
          priorState,
          resultingState,
          targetMode,
          hypothesesPruned,
          wasteRecycled,
          salvagedAtp
        }
      );
    }

    logger.info(this.component, 'evolutionary_pathway_restructuring_executed', {
      cellId: this.cellId,
      priorState,
      resultingState,
      targetMode,
      hypothesesPruned,
      salvagedAtp
    });

    return {
      timestamp: new Date().toISOString(),
      priorVitalityState: priorState,
      resultingVitalityState: resultingState,
      targetReasoningMode: targetMode,
      hypothesesPrunedCount: hypothesesPruned,
      catabolicWasteRecycled: wasteRecycled,
      salvagedAtp,
      actionsExecuted: Object.freeze(actions)
    };
  }

  /**
   * Synaptic Energy Degradation (Tingkat Sinapsis):
   * Charges per-concept metabolic maintenance costs on the Cognitive Graph.
   * Under starvation or energy strain, automatically prunes low-confidence
   * or contradicted concepts and relations to conserve ATP.
   */
  public async degradeSynapticEnergy(
    graph: CognitiveGraph,
    options?: {
      perConceptRetentionCost?: number;
      atrophyThreshold?: number;
      maxPrune?: number;
    }
  ): Promise<{
    retentionCostCharged: number;
    conceptsCount: number;
    prunedConceptsCount: number;
    prunedRelationsCount: number;
    energySaved: number;
    resultingAtpPool: number;
    vitalityState: CellVitalityState;
  }> {
    const concepts = graph.getAllConcepts();
    const count = concepts.length;
    const unitCost = options?.perConceptRetentionCost ?? 0.05;
    const retentionCost = parseFloat((count * unitCost).toFixed(3));

    // Deduct retention cost from ATP pool
    this.consumeAtp(retentionCost, 'synaptic_maintenance_retention', { conceptsCount: count });

    let prunedConceptsCount = 0;
    let prunedRelationsCount = 0;
    let energySaved = 0;

    const state = this.getVitalityState();
    // If under pressure or explicitly low ATP, trigger atrophy pruning
    if (state === CellVitalityState.STARVATION || state === CellVitalityState.CRITICAL_APOPTOSIS_RISK || this.atpPool < 35.0) {
      const pruneRes = await graph.pruneAtrophiedSynapses({
        confidenceThreshold: options?.atrophyThreshold ?? 0.40,
        maxPruneCount: options?.maxPrune ?? 15
      });
      prunedConceptsCount = pruneRes.prunedConcepts.length;
      prunedRelationsCount = pruneRes.prunedRelations.length;
      energySaved = pruneRes.energySaved;

      if (prunedConceptsCount > 0 || prunedRelationsCount > 0) {
        // Partial energy rebate from reduced maintenance load
        this.atpPool = Math.min(this.maxAtpPool, parseFloat((this.atpPool + energySaved * 0.5).toFixed(3)));
        if (this.audit) {
          this.audit.recordEvent(
            MetabolismEventType.SYNAPTIC_PRUNING,
            `synaptic_prune_${Date.now()}`,
            {
              prunedConceptsCount,
              prunedRelationsCount,
              energySaved,
              newAtpPool: this.atpPool
            }
          );
        }
      }
    }

    return {
      retentionCostCharged: retentionCost,
      conceptsCount: count,
      prunedConceptsCount,
      prunedRelationsCount,
      energySaved,
      resultingAtpPool: this.atpPool,
      vitalityState: this.getVitalityState()
    };
  }

  /**
   * Returns current biological vitality telemetry
   */
  public getTelemetry(): CellVitalityTelemetry {
    return {
      cellId: this.cellId,
      atpPool: this.atpPool,
      maxAtpPool: this.maxAtpPool,
      catabolicWaste: this.catabolicWaste,
      toxicityThreshold: this.toxicityThreshold,
      basalMetabolicRate: this.basalMetabolicRate,
      vitalityState: this.getVitalityState(),
      totalAtpConsumed: this.totalAtpConsumed,
      totalAtpGenerated: this.totalAtpGenerated,
      survivalPressureEventsCount: this.survivalPressureEventsCount,
      pathwaysRestructuredCount: this.pathwaysRestructuredCount,
      autophagicPruningCount: this.autophagicPruningCount,
      autophagicSalvagedAtp: this.autophagicSalvagedAtp,
      activeReasoningMode: this.activeReasoningMode,
      lastEvaluatedAt: new Date().toISOString()
    };
  }

  /**
   * Persists metabolic state to disk/storage
   */
  public async persist(): Promise<void> {
    if (!this.memoryStore) return;
    const key = `cell_metabolic_vitality_${this.cellId}`;
    await this.memoryStore.put({
      id: key,
      cellId: this.cellId,
      category: MemoryCategory.PROCEDURAL,
      content: {
        atpPool: this.atpPool,
        catabolicWaste: this.catabolicWaste,
        totalAtpConsumed: this.totalAtpConsumed,
        totalAtpGenerated: this.totalAtpGenerated,
        survivalPressureEventsCount: this.survivalPressureEventsCount,
        pathwaysRestructuredCount: this.pathwaysRestructuredCount,
        autophagicPruningCount: this.autophagicPruningCount,
        autophagicSalvagedAtp: this.autophagicSalvagedAtp,
        activeReasoningMode: this.activeReasoningMode
      },
      source: 'cellular_metabolism',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1.0,
      hash: '',
      provenance: [this.cellId],
      version: 1
    });
  }

  /**
   * Restores persisted metabolic state
   */
  public async restore(): Promise<void> {
    if (!this.memoryStore) return;
    const key = `cell_metabolic_vitality_${this.cellId}`;
    const entry = await this.memoryStore.get(key);
    if (entry && entry.content) {
      const c = entry.content as any;
      if (typeof c.atpPool === 'number') this.atpPool = c.atpPool;
      if (typeof c.catabolicWaste === 'number') this.catabolicWaste = c.catabolicWaste;
      if (typeof c.totalAtpConsumed === 'number') this.totalAtpConsumed = c.totalAtpConsumed;
      if (typeof c.totalAtpGenerated === 'number') this.totalAtpGenerated = c.totalAtpGenerated;
      if (typeof c.survivalPressureEventsCount === 'number') this.survivalPressureEventsCount = c.survivalPressureEventsCount;
      if (typeof c.pathwaysRestructuredCount === 'number') this.pathwaysRestructuredCount = c.pathwaysRestructuredCount;
      if (typeof c.autophagicPruningCount === 'number') this.autophagicPruningCount = c.autophagicPruningCount;
      if (typeof c.autophagicSalvagedAtp === 'number') this.autophagicSalvagedAtp = c.autophagicSalvagedAtp;
      if (c.activeReasoningMode) this.activeReasoningMode = c.activeReasoningMode;
    }
  }
}
