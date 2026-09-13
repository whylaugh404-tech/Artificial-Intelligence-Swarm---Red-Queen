import { describe, it, expect } from 'vitest';
import { CellStateManager } from '../src/redqueen/core/state/engine';
import { LifecycleState } from '../src/redqueen/core/state/types';
import { MitosisReconciler } from '../src/redqueen/core/mitosis_reconciliation/reconciler';
import { createComputePartition, aggregateCapabilities } from '../src/redqueen/core/compute/partition';

describe('R6: Mitosis Reconciliation', () => {
  const stateManager = new CellStateManager();

  const p1 = createComputePartition({
    cellIdentity: 'parent-cell-alpha',
    name: 'P1',
    architecture: 'neural',
    capacity: 1000,
    parallelism: 4,
    memory: 4096,
    specialization: 'logic',
    availability: 1.0,
    communicationProfile: { bandwidth: 1000, latency: 1, topology: 'direct', reliability: 0.99 }
  });

  const p2 = createComputePartition({
    cellIdentity: 'parent-cell-alpha',
    name: 'P2',
    architecture: 'neural',
    capacity: 2000,
    parallelism: 8,
    memory: 8192,
    specialization: 'graph',
    availability: 1.0,
    communicationProfile: { bandwidth: 2000, latency: 1, topology: 'direct', reliability: 0.99 }
  });

  const parentState = stateManager.createInitialState({
    cellIdentity: 'parent-cell-alpha',
    genomeReference: 'genome-v1',
    memoryState: { 
      'mem1': { data: 'memory-1' },
      'mem2': { data: 'memory-2' },
      'mem3': { data: 'memory-3' }
    },
    knowledgeState: { core: 'math', concept1: 'geometry' },
    cognitiveState: { mode: 'analytical' },
    reasoningState: { depth: 5 },
    experienceState: { encounters: 10 },
    computationalCapability: aggregateCapabilities([p1, p2]),
    specializations: [
      { domain: 'programming', focusAreas: ['typescript'], level: 0.8 }
    ],
    lifecycle: LifecycleState.ACTIVE,
    provenance: ['genesis']
  });

  const reconciler = new MitosisReconciler();

  it('1. deterministic mitosis creates two distinct child states', () => {
    const spec = {
      mitosisId: 'mitosis-evt-123',
      parentState,
      differentiationProfileA: [{ domain: 'logic', focusAreas: ['deductive'], level: 0.9 }],
      differentiationProfileB: [{ domain: 'creative', focusAreas: ['abductive'], level: 0.9 }],
      partitionDistribution: {
        childA: [p1.partitionId],
        childB: [p2.partitionId]
      },
      memoryDistribution: {
        childA: ['mem1', 'mem3'],
        childB: ['mem2']
      }
    };

    const result = reconciler.reconcile(spec);

    expect(result.mitosisId).toBe('mitosis-evt-123');
    expect(result.childA.stateId).not.toBe(result.childB.stateId);
    expect(result.childA.stateId).not.toBe(parentState.stateId);
    expect(result.childB.stateId).not.toBe(parentState.stateId);

    // Rule 1: Child A != Child B identities
    expect(result.childA.cellIdentity).not.toBe(result.childB.cellIdentity);
    expect(result.childA.cellIdentity).toContain('parent-cell-alpha_A_');
    expect(result.childB.cellIdentity).toContain('parent-cell-alpha_B_');
  });

  it('2. children are not full clones of parent', () => {
    const spec = {
      mitosisId: 'mitosis-evt-124',
      parentState,
      differentiationProfileA: [{ domain: 'logic', focusAreas: ['deductive'], level: 0.9 }],
      differentiationProfileB: [{ domain: 'creative', focusAreas: ['abductive'], level: 0.9 }],
      partitionDistribution: {
        childA: [p1.partitionId],
        childB: [p2.partitionId]
      },
      memoryDistribution: {
        childA: ['mem1', 'mem3'],
        childB: ['mem2']
      }
    };

    const result = reconciler.reconcile(spec);

    // Differentiated memory
    expect(Object.keys(result.childA.memoryState)).toEqual(['mem1', 'mem3']);
    expect(Object.keys(result.childB.memoryState)).toEqual(['mem2']);

    // Differentiated specializations
    expect(result.childA.specializations[0].domain).toBe('logic');
    expect(result.childB.specializations[0].domain).toBe('creative');
  });

  it('3. parent remains immutable', () => {
    const originalParent = structuredClone(parentState);

    const spec = {
      mitosisId: 'mitosis-evt-125',
      parentState,
      differentiationProfileA: [],
      differentiationProfileB: [],
      partitionDistribution: { childA: [], childB: [] },
      memoryDistribution: { childA: [], childB: [] }
    };

    reconciler.reconcile(spec);

    // Verify deep freeze / no mutation
    expect(parentState).toEqual(originalParent);
  });

  it('4. differentiated compute partitions ownership', () => {
    const spec = {
      mitosisId: 'mitosis-evt-126',
      parentState,
      differentiationProfileA: [],
      differentiationProfileB: [],
      partitionDistribution: {
        childA: [p1.partitionId],
        childB: [p2.partitionId]
      },
      memoryDistribution: { childA: [], childB: [] }
    };

    const result = reconciler.reconcile(spec);

    // Child A should own a clone of P1 with Child A's identity
    const p1A = result.childA.computationalCapability.partitions![0];
    expect(p1A.cellIdentity).toBe(result.childA.cellIdentity);
    // Identity of the partition changed because cellIdentity changed
    expect(p1A.partitionId).not.toBe(p1.partitionId);
    expect(p1A.capacity).toBe(p1.capacity);

    // Child B should own a clone of P2 with Child B's identity
    const p2B = result.childB.computationalCapability.partitions![0];
    expect(p2B.cellIdentity).toBe(result.childB.cellIdentity);
    expect(p2B.capacity).toBe(p2.capacity);
  });

  it('5. lineage and provenance preservation', () => {
    const spec = {
      mitosisId: 'mitosis-evt-127',
      parentState,
      differentiationProfileA: [],
      differentiationProfileB: [],
      partitionDistribution: { childA: [], childB: [] },
      memoryDistribution: { childA: [], childB: [] }
    };

    const result = reconciler.reconcile(spec);

    expect(result.childA.provenance).toContain('genesis');
    expect(result.childA.provenance).toContain('mitosis:mitosis-evt-127:childA');
    expect(result.childB.provenance).toContain('genesis');
    expect(result.childB.provenance).toContain('mitosis:mitosis-evt-127:childB');
  });
});
