import { z } from 'zod';
import { CellState } from '../core/lifecycle';
import { MemoryStore, MemoryStats, MemoryCategory } from '../memory/store';
import { logger } from '../core/logger';

export const CognitiveStateSchema = z.object({
  cellId: z.string().min(1),
  lifecycleState: z.nativeEnum(CellState),
  specialization: z.string().nullable(),
  activeGoals: z.array(z.string()),
  knowledgeReferences: z.array(z.string()),
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
      activeGoals: [...initialGoals],
      knowledgeReferences: [],
      operationalConfidence: Math.max(0, Math.min(1, initialConfidence)),
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
    if (!goal || this.state.activeGoals.includes(goal)) return;
    this.state.activeGoals.push(goal);
    this.state.lastCognitiveUpdate = new Date().toISOString();
    logger.debug(this.component, 'goal_added', { cellId: this.cellId, goal });
  }

  public completeGoal(goal: string): void {
    const idx = this.state.activeGoals.indexOf(goal);
    if (idx !== -1) {
      this.state.activeGoals.splice(idx, 1);
      this.state.lastCognitiveUpdate = new Date().toISOString();
      logger.debug(this.component, 'goal_completed', { cellId: this.cellId, goal });
    }
  }

  public addKnowledgeReference(ref: string): void {
    if (!ref || this.state.knowledgeReferences.includes(ref)) return;
    this.state.knowledgeReferences.push(ref);
    this.state.lastCognitiveUpdate = new Date().toISOString();
  }

  public updateConfidence(confidence: number): void {
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
    } catch (err) {
      logger.error(this.component, 'cognitive_state_persist_failed', err, { cellId: this.cellId });
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
    return { ...this.state };
  }
}
