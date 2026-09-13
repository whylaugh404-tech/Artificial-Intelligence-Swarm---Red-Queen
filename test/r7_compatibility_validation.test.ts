import { describe, it, expect } from 'vitest';
import { CellStateManager } from '../src/redqueen/core/state/engine';
import { LifecycleState } from '../src/redqueen/core/state/types';
import { MitosisReconciler } from '../src/redqueen/core/mitosis_reconciliation/reconciler';
import { ArchitecturalCompatibilityValidator } from '../src/redqueen/core/compatibility/validator';
import { createComputePartition, aggregateCapabilities } from '../src/redqueen/core/compute/partition';

describe('R7: Compatibility Validation (P5/P6)', () => {
  const stateManager = new CellStateManager();
  const reconciler = new MitosisReconciler();
  const validator = new ArchitecturalCompatibilityValidator();

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

  const parentState = stateManager.createInitialState({
    cellIdentity: 'parent-cell-alpha',
    genomeReference: 'genome-v1',
    memoryState: { },
    knowledgeState: { },
    cognitiveState: { },
    reasoningState: { },
    experienceState: { },
    computationalCapability: aggregateCapabilities([p1]),
    specializations: [],
    lifecycle: LifecycleState.ACTIVE,
    provenance: ['genesis']
  });

  it('1. validates a successful and compliant mitosis reconciliation', () => {
    const spec = {
      mitosisId: 'mitosis-valid-01',
      parentState,
      differentiationProfileA: [],
      differentiationProfileB: [],
      partitionDistribution: {
        childA: [p1.partitionId],
        childB: []
      },
      memoryDistribution: { childA: [], childB: [] }
    };

    const result = reconciler.reconcile(spec);
    const validation = validator.validateMitosisResult(result);

    expect(validation.status).toBe('COMPATIBLE');
    expect(validation.anomalies.length).toBe(0);
  });

  it('2. detects and rejects invalid partition ownership (R3 incompatibility)', () => {
    const spec = {
      mitosisId: 'mitosis-valid-02',
      parentState,
      differentiationProfileA: [],
      differentiationProfileB: [],
      partitionDistribution: {
        childA: [p1.partitionId],
        childB: []
      },
      memoryDistribution: { childA: [], childB: [] }
    };

    const result = reconciler.reconcile(spec);

    // Deliberately tamper with the child to break ownership
    // By re-injecting the parent's raw partition (which still has parent's cellIdentity)
    const tamperedChildA = {
       ...result.childA,
       computationalCapability: aggregateCapabilities([p1]) 
    };

    const tamperedResult = {
       ...result,
       childA: tamperedChildA
    };

    const validation = validator.validateMitosisResult(tamperedResult);

    expect(validation.status).toBe('INCOMPATIBLE');
    expect(validation.anomalies.some(a => a.component === 'R3_COMPUTE')).toBe(true);
  });

  it('3. detects missing mitosis provenance (R5 emergence incompatibility)', () => {
    const spec = {
      mitosisId: 'mitosis-valid-03',
      parentState,
      differentiationProfileA: [],
      differentiationProfileB: [],
      partitionDistribution: {
        childA: [],
        childB: []
      },
      memoryDistribution: { childA: [], childB: [] }
    };

    const result = reconciler.reconcile(spec);

    // Deliberately remove mitosis provenance
    const tamperedChildB = {
       ...result.childB,
       provenance: ['genesis'] // stripped mitosis provenance
    };

    const tamperedResult = {
       ...result,
       childB: tamperedChildB
    };

    const validation = validator.validateMitosisResult(tamperedResult);

    expect(validation.status).toBe('INCOMPATIBLE');
    expect(validation.anomalies.some(a => a.component === 'R5_EMERGENCE')).toBe(true);
  });
});
