import { z } from 'zod';
import { CellState } from '../core/lifecycle';
import { MemoryStore, MemoryStats, MemoryCategory } from '../memory/store';
import { logger } from '../core/logger';
import { KnowledgeGapSchema, KnowledgeGap, InformationCategory } from '../metabolism/types';
import { v4 as uuidv4 } from 'uuid';

export const CognitiveStateSchema = z.object({
  cellId: z.string().min(1),
  lifecycleState: z.nativeEnum(CellState),
  specialization: z.string().nullable(),
  activeGoals: z.array(z.string()),
  knowledgeReferences: z.array(z.string()),
  conceptReferences: z.array(z.string()).default([]),
  knowledgeGaps: z.array(KnowledgeGapSchema).default([]),
  operationalConfidence: z.number().min(0).max(1),
  lastCognitiveUpdate: z.string().datetime(),
  memoryStats: z.object({
    total: z.number().int().min(0),
    episodic: z.number().int().min(0),
    semantic: z.number().int().min(0),
    procedural: z.number().int().min(0)
  }),
  metadata: z.record(z.string(), z.string())
});

export type CognitiveState = z.infer<typeof CognitiveStateSchema>;

/**
 * Manages the individual, persistent cognitive and operational state of a Cell.
 * 
 * Note: This software architecture represents a localized computational state machine
 * and knowledge index. It does not claim or simulate consciousness or biological life.
 */
export class CognitiveStateManager {
  private readonly component = 'cognitive_state';
  private state: CognitiveState;

  constructor(
    private readonly cellId: string,
    initialSpecialization: string | null = null,
    initialGoals: string[] = [],
    initialConfidence: number = 1.0
  ) {
    this.state = {
      cellId: this.cellId,
      lifecycleState: CellState.CREATED,
      specialization: initialSpecialization,
      activeGoals: initialGoals.map(g => g.trim()).filter(Boolean),
      knowledgeReferences: [],
      conceptReferences: [],
      knowledgeGaps: [],
      operationalConfidence: typeof initialConfidence === 'number' && !Number.isNaN(initialConfidence) && Number.isFinite(initialConfidence)
        ? Math.max(0, Math.min(1, initialConfidence))
        : 1.0,
      lastCognitiveUpdate: new Date().toISOString(),
      memoryStats: {
        total: 0,
        episodic: 0,
        semantic: 0,
        procedural: 0
      },
      metadata: {}
    };
  }

  public getState(): Readonly<CognitiveState> {
    return { ...this.state };
  }

  public getSpecialization(): string | null {
    return this.state.specialization;
  }

  public setSpecialization(specialization: string | null): void {
    const prev = this.state.specialization;
    this.state.specialization = specialization;
    this.state.lastCognitiveUpdate = new Date().toISOString();
    logger.info(this.component, 'specialization_updated', {
      cellId: this.cellId,
      from: prev,
      to: specialization
    });
  }

  public addGoal(goal: string): void {
    if (!goal || typeof goal !== 'string') return;
    const trimmed = goal.trim();
    if (!trimmed || this.state.activeGoals.includes(trimmed)) return;
    this.state.activeGoals.push(trimmed);
    this.state.lastCognitiveUpdate = new Date().toISOString();
    logger.debug(this.component, 'goal_added', { cellId: this.cellId, goal: trimmed });
  }

  public completeGoal(goal: string): void {
    if (!goal || typeof goal !== 'string') return;
    const trimmed = goal.trim();
    const idx = this.state.activeGoals.indexOf(trimmed);
    if (idx !== -1) {
      this.state.activeGoals.splice(idx, 1);
      this.state.lastCognitiveUpdate = new Date().toISOString();
      logger.debug(this.component, 'goal_completed', { cellId: this.cellId, goal: trimmed });
    }
  }

  public addKnowledgeReference(ref: string): void {
    if (!ref || typeof ref !== 'string') return;
    const trimmed = ref.trim();
    if (!trimmed || this.state.knowledgeReferences.includes(trimmed)) return;
    this.state.knowledgeReferences.push(trimmed);
    this.state.lastCognitiveUpdate = new Date().toISOString();
  }

  public addConceptReference(ref: string): void {
    if (!ref || typeof ref !== 'string') return;
    const trimmed = ref.trim();
    if (!trimmed || this.state.conceptReferences.includes(trimmed)) return;
    this.state.conceptReferences.push(trimmed);
    this.state.lastCognitiveUpdate = new Date().toISOString();
  }

  public recordKnowledgeGap(topic: string, category: InformationCategory, reason: string, priority: number): KnowledgeGap {
    const gap: KnowledgeGap = {
      gapId: `gap_${uuidv4()}`,
      cellId: this.cellId,
      topic,
      category,
      reason,
      priority: Math.max(0, Math.min(1, priority)),
      createdAt: new Date().toISOString()
    };
    
    this.state.knowledgeGaps.push(gap);
    this.state.lastCognitiveUpdate = new Date().toISOString();
    logger.debug(this.component, 'knowledge_gap_recorded', { cellId: this.cellId, gapId: gap.gapId, topic });
    return gap;
  }

  public updateConfidence(confidence: number): void {
    if (typeof confidence !== 'number' || Number.isNaN(confidence) || !Number.isFinite(confidence)) {
      throw new Error(`Invalid confidence value: must be a valid finite number, received ${confidence}`);
    }
    this.state.operationalConfidence = Math.max(0, Math.min(1, confidence));
    this.state.lastCognitiveUpdate = new Date().toISOString();
  }

  public syncLifecycleState(state: CellState): void {
    this.state.lifecycleState = state;
    this.state.lastCognitiveUpdate = new Date().toISOString();
  }

  public updateMemoryStats(stats: MemoryStats): void {
    this.state.memoryStats = { ...stats };
    this.state.lastCognitiveUpdate = new Date().toISOString();
  }

  public setMetadata(key: string, value: string): void {
    this.state.metadata[key] = value;
    this.state.lastCognitiveUpdate = new Date().toISOString();
  }

  /**
   * Persists cognitive state to the cell's memory store.
   * Cryptographic private keys are never stored here.
   */
  public async persist(store: MemoryStore): Promise<void> {
    try {
      await store.put({
        id: `cognitive_state_${this.cellId}`,
        cellId: this.cellId,
        category: MemoryCategory.SEMANTIC,
        content: this.state,
        source: 'cognitive_state_manager',
        createdAt: this.state.lastCognitiveUpdate,
        updatedAt: new Date().toISOString(),
        confidence: this.state.operationalConfidence,
        hash: '',
        provenance: [this.cellId],
        version: 1
      });
      logger.debug(this.component, 'cognitive_state_persisted', { cellId: this.cellId });
    } catch (err: any) {
      logger.error(this.component, 'cognitive_state_persist_failed', err, { cellId: this.cellId });
      throw new Error(`Failed to persist cognitive state: ${err.message}`);
    }
  }

  /**
   * Restores cognitive state from the cell's memory store.
   */
  public async restore(store: MemoryStore): Promise<boolean> {
    try {
      const entry = await store.get(`cognitive_state_${this.cellId}`);
      if (entry && entry.content) {
        const parsed = CognitiveStateSchema.safeParse(entry.content);
        if (parsed.success) {
          // Restore properties while retaining the correct cellId
          this.state = {
            ...parsed.data,
            cellId: this.cellId
          };
          logger.info(this.component, 'cognitive_state_restored', {
            cellId: this.cellId,
            specialization: this.state.specialization,
            goals: this.state.activeGoals.length
          });
          return true;
        } else {
          logger.warn(this.component, 'stored_cognitive_state_invalid', { errors: parsed.error });
        }
      }
    } catch (err) {
      logger.warn(this.component, 'cognitive_state_restore_failed', { err });
    }
    return false;
  }

  /**
   * Safe serialization without secrets.
   */
  public toJSON(): CognitiveState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Restores cognitive state from an exact snapshot, used for transaction rollbacks.
   */
  public restoreFromSnapshot(snapshot: CognitiveState): void {
    const parsed = CognitiveStateSchema.safeParse(snapshot);
    if (parsed.success) {
      this.state = {
        ...parsed.data,
        cellId: this.cellId
      };
      logger.debug(this.component, 'cognitive_state_restored_from_snapshot', { cellId: this.cellId });
    } else {
      logger.warn(this.component, 'failed_to_restore_snapshot', { errors: parsed.error });
    }
  }
}
