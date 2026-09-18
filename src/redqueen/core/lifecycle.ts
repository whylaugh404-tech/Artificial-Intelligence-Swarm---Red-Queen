import { logger } from './logger';

export enum CellState {
  CREATED = 'CREATED',
  INITIALIZING = 'INITIALIZING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  RETIRED = 'RETIRED',
  DEGRADED = 'DEGRADED',
  RECOVERING = 'RECOVERING',
  SHUTTING_DOWN = 'SHUTTING_DOWN',
  STOPPED = 'STOPPED',
}

export class Lifecycle {
  private state: CellState = CellState.CREATED;
  private readonly component = 'lifecycle';
  private shutdownHooks: Array<() => Promise<void>> = [];
  private transitionQueue: Promise<void> = Promise.resolve();

  constructor(private readonly cellId: string) {}

  getState(): CellState {
    return this.state;
  }

  private transition(targetState: CellState, allowedFrom: CellState[]) {
    if (!allowedFrom.includes(this.state)) {
      const errorMsg = `Illegal state transition from ${this.state} to ${targetState}`;
      logger.error(this.component, 'illegal_transition', new Error(errorMsg), { cellId: this.cellId });
      throw new Error(errorMsg);
    }
    
    logger.info(this.component, 'state_transition', { 
      cellId: this.cellId, 
      from: this.state, 
      to: targetState 
    });
    this.state = targetState;
  }

  /**
   * Serializes async lifecycle transitions to prevent transition races.
   */
  private serializeTransition<T>(action: () => Promise<T>): Promise<T> {
    const next = this.transitionQueue.then(action, action);
    this.transitionQueue = next.then(() => {}, () => {});
    return next;
  }

  isTransitioning(): boolean {
    return (
      this.state === CellState.INITIALIZING ||
      this.state === CellState.SHUTTING_DOWN ||
      this.state === CellState.RECOVERING
    );
  }

  async initialize(initFn: () => Promise<void>): Promise<void> {
    return this.serializeTransition(async () => {
      if (this.state === CellState.ACTIVE) {
        logger.debug(this.component, 'initialize_noop_already_active', { cellId: this.cellId });
        return;
      }
      this.transition(CellState.INITIALIZING, [CellState.CREATED, CellState.STOPPED]);
      try {
        await initFn();
        this.transition(CellState.ACTIVE, [CellState.INITIALIZING]);
      } catch (error) {
        logger.error(this.component, 'initialization_failed', error, { cellId: this.cellId });
        // Transition through SHUTTING_DOWN to clean up partial resources safely
        this.transition(CellState.SHUTTING_DOWN, [CellState.INITIALIZING]);
        for (const hook of this.shutdownHooks) {
          try {
            await hook();
          } catch (hookErr) {
            logger.error(this.component, 'shutdown_hook_failed', hookErr, { cellId: this.cellId });
          }
        }
        this.transition(CellState.STOPPED, [CellState.SHUTTING_DOWN]);
        throw error;
      }
    });
  }

  suspend(reason: string) {
    this.transition(CellState.SUSPENDED, [CellState.ACTIVE, CellState.DEGRADED]);
    logger.info(this.component, 'cell_suspended', { cellId: this.cellId, reason });
  }

  resume() {
    this.transition(CellState.ACTIVE, [CellState.SUSPENDED]);
    logger.info(this.component, 'cell_resumed', { cellId: this.cellId });
  }

  retire(reason: string) {
    this.transition(CellState.RETIRED, [
      CellState.ACTIVE,
      CellState.SUSPENDED,
      CellState.DEGRADED,
      CellState.STOPPED
    ]);
    logger.info(this.component, 'cell_retired', { cellId: this.cellId, reason });
  }

  degrade(reason: string) {
    this.transition(CellState.DEGRADED, [CellState.ACTIVE, CellState.RECOVERING]);
    logger.warn(this.component, 'system_degraded', { cellId: this.cellId, reason });
  }

  async recover(recoverFn: () => Promise<boolean>): Promise<void> {
    return this.serializeTransition(async () => {
      this.transition(CellState.RECOVERING, [CellState.DEGRADED]);
      try {
        const success = await recoverFn();
        if (success) {
          this.transition(CellState.ACTIVE, [CellState.RECOVERING]);
        } else {
          this.transition(CellState.DEGRADED, [CellState.RECOVERING]);
        }
      } catch (error) {
        logger.error(this.component, 'recovery_failed', error, { cellId: this.cellId });
        this.transition(CellState.DEGRADED, [CellState.RECOVERING]);
      }
    });
  }

  registerShutdownHook(hook: () => Promise<void>) {
    this.shutdownHooks.push(hook);
  }

  async shutdown(): Promise<void> {
    return this.serializeTransition(async () => {
      if (this.state === CellState.STOPPED || this.state === CellState.SHUTTING_DOWN) {
        return;
      }
      
      this.transition(CellState.SHUTTING_DOWN, [
        CellState.CREATED,
        CellState.INITIALIZING,
        CellState.ACTIVE,
        CellState.DEGRADED,
        CellState.RECOVERING,
        CellState.SUSPENDED,
        CellState.RETIRED
      ]);
      
      logger.info(this.component, 'shutdown_started', { cellId: this.cellId, hooks: this.shutdownHooks.length });
      
      for (const hook of this.shutdownHooks) {
        try {
          await hook();
        } catch (error) {
          logger.error(this.component, 'shutdown_hook_failed', error, { cellId: this.cellId });
        }
      }
      
      this.transition(CellState.STOPPED, [CellState.SHUTTING_DOWN]);
      logger.info(this.component, 'shutdown_complete', { cellId: this.cellId });
    });
  }
}
