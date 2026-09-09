import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { CognitiveStateManager, CognitiveStateSchema } from '../src/redqueen/cognition/state';
import { CellState, Lifecycle } from '../src/redqueen/core/lifecycle';
import { JsonFileMemoryStore, MemoryCategory } from '../src/redqueen/memory/store';

describe('P3: Cognitive State & Lifecycle Abstraction', () => {
  const TEST_STORAGE = './data/test_cognitive_state.json';
  const CELL_ID = 'test_cell_cognitive_123';

  beforeEach(async () => {
    try {
      await fs.unlink(TEST_STORAGE);
    } catch {}
  });

  afterEach(async () => {
    try {
      await fs.unlink(TEST_STORAGE);
    } catch {}
  });

  it('15. initializes cognitive state with clean defaults and valid schema', () => {
    const manager = new CognitiveStateManager(CELL_ID, 'RECONNAISSANCE', ['scan_target_a'], 0.95);
    const state = manager.getState();

    expect(state.cellId).toBe(CELL_ID);
    expect(state.specialization).toBe('RECONNAISSANCE');
    expect(state.activeGoals).toEqual(['scan_target_a']);
    expect(state.operationalConfidence).toBe(0.95);
    expect(state.lifecycleState).toBe(CellState.CREATED);
    expect(state.memoryStats).toEqual({ total: 0, episodic: 0, semantic: 0, procedural: 0 });

    const check = CognitiveStateSchema.safeParse(state);
    expect(check.success).toBe(true);
  });

  it('16. updates and manages specialization dynamically', () => {
    const manager = new CognitiveStateManager(CELL_ID);
    expect(manager.getSpecialization()).toBeNull();

    manager.setSpecialization('EXPLOIT_ANALYSIS');
    expect(manager.getSpecialization()).toBe('EXPLOIT_ANALYSIS');
    expect(manager.getState().specialization).toBe('EXPLOIT_ANALYSIS');

    manager.setSpecialization(null);
    expect(manager.getSpecialization()).toBeNull();
  });

  it('17. adds and completes goals with proper deduplication and removal', () => {
    const manager = new CognitiveStateManager(CELL_ID);

    manager.addGoal('identify_perimeter');
    manager.addGoal('scan_ports');
    manager.addGoal('identify_perimeter'); // Duplicate should be ignored

    expect(manager.getState().activeGoals).toEqual(['identify_perimeter', 'scan_ports']);

    manager.completeGoal('identify_perimeter');
    expect(manager.getState().activeGoals).toEqual(['scan_ports']);

    // Non-existent goal completion should be a no-op
    manager.completeGoal('non_existent');
    expect(manager.getState().activeGoals).toEqual(['scan_ports']);
  });

  it('18. updates operational confidence clamped strictly to [0.0, 1.0]', () => {
    const manager = new CognitiveStateManager(CELL_ID);

    manager.updateConfidence(0.75);
    expect(manager.getState().operationalConfidence).toBe(0.75);

    manager.updateConfidence(1.8);
    expect(manager.getState().operationalConfidence).toBe(1.0);

    manager.updateConfidence(-0.5);
    expect(manager.getState().operationalConfidence).toBe(0.0);
  });

  it('19. records memory statistics breakdown across episodic, semantic, and procedural', () => {
    const manager = new CognitiveStateManager(CELL_ID);

    manager.updateMemoryStats({
      total: 35,
      episodic: 15,
      semantic: 12,
      procedural: 8
    });

    const stats = manager.getState().memoryStats;
    expect(stats.total).toBe(35);
    expect(stats.episodic).toBe(15);
    expect(stats.semantic).toBe(12);
    expect(stats.procedural).toBe(8);
  });

  it('20. synchronizes lifecycle states correctly into cognitive state', () => {
    const manager = new CognitiveStateManager(CELL_ID);
    expect(manager.getState().lifecycleState).toBe(CellState.CREATED);

    manager.syncLifecycleState(CellState.ACTIVE);
    expect(manager.getState().lifecycleState).toBe(CellState.ACTIVE);

    manager.syncLifecycleState(CellState.SUSPENDED);
    expect(manager.getState().lifecycleState).toBe(CellState.SUSPENDED);

    manager.syncLifecycleState(CellState.RETIRED);
    expect(manager.getState().lifecycleState).toBe(CellState.RETIRED);
  });

  it('21. supports full lifecycle state transitions: CREATED -> INITIALIZING -> ACTIVE -> SUSPENDED -> ACTIVE -> RETIRED', async () => {
    const lifecycle = new Lifecycle(CELL_ID);
    expect(lifecycle.getState()).toBe(CellState.CREATED);

    await lifecycle.initialize(async () => {
      expect(lifecycle.getState()).toBe(CellState.INITIALIZING);
    });
    expect(lifecycle.getState()).toBe(CellState.ACTIVE);

    lifecycle.suspend('Resource conservation');
    expect(lifecycle.getState()).toBe(CellState.SUSPENDED);

    lifecycle.resume();
    expect(lifecycle.getState()).toBe(CellState.ACTIVE);

    lifecycle.retire('Task completed permanently');
    expect(lifecycle.getState()).toBe(CellState.RETIRED);

    // After retirement, transitions are locked except shutdown
    expect(() => lifecycle.suspend('invalid')).toThrow();
  });

  it('22. persists cognitive state and restores accurately across simulated restart', async () => {
    const store = new JsonFileMemoryStore(TEST_STORAGE, CELL_ID);
    await store.initialize();

    const initialManager = new CognitiveStateManager(CELL_ID, 'FORENSICS', ['audit_log'], 0.88);
    initialManager.addKnowledgeReference('cve-2024-0001');
    initialManager.setMetadata('environment', 'staging');
    initialManager.updateMemoryStats({ total: 10, episodic: 4, semantic: 4, procedural: 2 });
    initialManager.syncLifecycleState(CellState.ACTIVE);

    // Persist
    await initialManager.persist(store);

    // Simulate restart with a new manager
    const restoredManager = new CognitiveStateManager(CELL_ID);
    const restored = await restoredManager.restore(store);
    expect(restored).toBe(true);

    const restoredState = restoredManager.getState();
    expect(restoredState.specialization).toBe('FORENSICS');
    expect(restoredState.activeGoals).toContain('audit_log');
    expect(restoredState.knowledgeReferences).toContain('cve-2024-0001');
    expect(restoredState.operationalConfidence).toBe(0.88);
    expect(restoredState.memoryStats.total).toBe(10);
    expect(restoredState.metadata.environment).toBe('staging');
  });

  it('23. guarantees toJSON does not expose cryptographic private keys or secrets', () => {
    const manager = new CognitiveStateManager(CELL_ID, 'TEST', ['goal_1']);
    const serialized = manager.toJSON();

    expect((serialized as any).privateKey).toBeUndefined();
    expect((serialized as any).secret).toBeUndefined();
    expect((serialized as any).credentials).toBeUndefined();
    expect(JSON.stringify(serialized)).not.toContain('privateKey');
  });
});
