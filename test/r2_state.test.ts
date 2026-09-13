import { describe, it, expect } from 'vitest';
import { CellStateManager } from '../src/redqueen/core/state/engine';
import { LifecycleState } from '../src/redqueen/core/state/types';

describe('R2: Cell Cognitive-Computational State', () => {
  const stateManager = new CellStateManager();

  const baseStateData = {
    cellIdentity: 'cell-alpha',
    genomeReference: 'genome-v1',
    memoryState: { capacity: 100 },
    knowledgeState: { core: 'math' },
    cognitiveState: { mode: 'analytical' },
    reasoningState: { depth: 5 },
    experienceState: { encounters: 10 },
    computationalCapability: {
      architecture: 'neural-symbolic',
      capacity: 1000,
      parallelism: 4,
      memoryLimit: 8192,
      availability: 0.9,
      communicationProfile: { protocol: 'p2p' }
    },
    specializations: [
      { domain: 'programming', focusAreas: ['typescript', 'rust'], level: 0.8 }
    ],
    lifecycle: LifecycleState.ACTIVE,
    provenance: ['genesis']
  };

  it('should generate deterministic semantic state identity', () => {
    const state1 = stateManager.createInitialState(baseStateData);
    const state2 = stateManager.createInitialState(baseStateData);
    
    expect(state1.stateId).toBe(state2.stateId);
    expect(state1.stateId).toMatch(/^state_[a-f0-9]{16}$/);

    // Key order should not affect identity (canonical serialization)
    const baseStateDataReordered = {
      ...baseStateData,
      memoryState: { capacity: 100, extra: 'a' }
    };
    const stateReordered1 = stateManager.createInitialState(baseStateDataReordered);

    const baseStateDataReordered2 = {
      ...baseStateData,
      memoryState: { extra: 'a', capacity: 100 }
    };
    const stateReordered2 = stateManager.createInitialState(baseStateDataReordered2);
    
    expect(stateReordered1.stateId).toBe(stateReordered2.stateId);
  });

  it('should change identity when semantic state changes', () => {
    const state1 = stateManager.createInitialState(baseStateData);
    
    const state2 = stateManager.createInitialState({
      ...baseStateData,
      knowledgeState: { core: 'physics' }
    });
    
    expect(state1.stateId).not.toBe(state2.stateId);
  });

  it('should enforce immutability on state updates', () => {
    const state1 = stateManager.createInitialState(baseStateData);
    
    // Modifying state1 directly should throw in strict mode due to Object.freeze
    expect(() => {
      (state1 as any).lifecycle = LifecycleState.DORMANT;
    }).toThrow();
    
    expect(() => {
      (state1 as any).knowledgeState.core = 'hacked';
    }).toThrow();

    const { newState, transition } = stateManager.applyTransition(
      state1,
      'KNOWLEDGE_UPGRADE',
      { knowledgeState: { core: 'math', advanced: true } },
      ['learning-event-1']
    );

    // Old state remains unmodified
    expect(state1.knowledgeState).toEqual({ core: 'math' });
    
    // New state is updated
    expect(newState.knowledgeState).toEqual({ core: 'math', advanced: true });
    expect(newState.stateId).not.toBe(state1.stateId);
    
    // Provenance is merged
    expect(newState.provenance).toContain('genesis');
    expect(newState.provenance).toContain('learning-event-1');
  });

  it('should provide explicit state transitions', () => {
    const state1 = stateManager.createInitialState(baseStateData);
    const { newState, transition } = stateManager.applyTransition(
      state1,
      'LIFECYCLE_CHANGE',
      { lifecycle: LifecycleState.DORMANT },
      ['cmd-sleep'],
      '2026-01-01T00:00:00.000Z'
    );

    expect(transition.sourceStateId).toBe(state1.stateId);
    expect(transition.targetStateId).toBe(newState.stateId);
    expect(transition.transitionType).toBe('LIFECYCLE_CHANGE');
    expect(transition.changedFields).toEqual(['lifecycle']);
    expect(transition.timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(transition.transitionId).toMatch(/^trans_[a-f0-9]{16}$/);
    
    // Immutability of transition
    expect(() => {
      (transition as any).timestamp = 'now';
    }).toThrow();
  });

  it('should maintain individual cell isolation', () => {
    const cellAState = stateManager.createInitialState({
      ...baseStateData,
      cellIdentity: 'cell-A'
    });
    
    const cellBState = stateManager.createInitialState({
      ...baseStateData,
      cellIdentity: 'cell-B'
    });
    
    expect(cellAState.stateId).not.toBe(cellBState.stateId);
    
    const { newState: newCellA } = stateManager.applyTransition(
      cellAState, 'UPDATE', { knowledgeState: { ok: true } }, ['src']
    );
    
    // Cell B remains unchanged
    expect(cellBState.knowledgeState).toEqual(baseStateData.knowledgeState);
    expect(newCellA.stateId).not.toBe(cellBState.stateId);
  });

  it('should enforce transition provenance ordering determinism', () => {
    const state1 = stateManager.createInitialState(baseStateData);

    const { transition: transition1 } = stateManager.applyTransition(
      state1,
      'UPDATE',
      { knowledgeState: { core: 'physics' } },
      ['prov-B', 'prov-A']
    );

    const { transition: transition2 } = stateManager.applyTransition(
      state1,
      'UPDATE',
      { knowledgeState: { core: 'physics' } },
      ['prov-A', 'prov-B']
    );

    expect(transition1.transitionId).toBe(transition2.transitionId);
  });

  it('should verify timestamp does not affect state or transition semantic identity', () => {
    const state1 = stateManager.createInitialState(baseStateData);

    const { newState: newState1, transition: transition1 } = stateManager.applyTransition(
      state1,
      'LIFECYCLE_CHANGE',
      { lifecycle: LifecycleState.DORMANT },
      ['cmd-sleep'],
      '2026-01-01T00:00:00.000Z'
    );

    const { newState: newState2, transition: transition2 } = stateManager.applyTransition(
      state1,
      'LIFECYCLE_CHANGE',
      { lifecycle: LifecycleState.DORMANT },
      ['cmd-sleep'],
      '2026-12-31T23:59:59.999Z'
    );

    // Metadata is different
    expect(transition1.timestamp).not.toBe(transition2.timestamp);
    
    // Semantic identity MUST be exactly the same
    expect(newState1.stateId).toBe(newState2.stateId);
    expect(transition1.transitionId).toBe(transition2.transitionId);
  });

  it('should perform nested object updates as explicit replacements', () => {
    const state1 = stateManager.createInitialState({
      ...baseStateData,
      knowledgeState: {
        core: 'math',
        algorithms: ['graph']
      }
    });

    // We apply an update that omits "algorithms"
    const { newState } = stateManager.applyTransition(
      state1,
      'KNOWLEDGE_UPDATE',
      {
        knowledgeState: {
          core: 'physics'
        }
      },
      ['event-1']
    );

    // The entire object is replaced based on existing semantics,
    // which aligns with standard spread operator behavior.
    expect(newState.knowledgeState).toEqual({ core: 'physics' });
    expect((newState.knowledgeState as any).algorithms).toBeUndefined();
  });
});
