import { describe, it, expect } from 'vitest';
import {
  composeCognitiveState,
  composeFromCellState
} from '../src/redqueen/core/cognitive_composition/composer';
import { ComposeCognitiveStateParams } from '../src/redqueen/core/cognitive_composition/types';
import { createComputePartition } from '../src/redqueen/core/compute/partition';
import { CellStateManager } from '../src/redqueen/core/state/engine';
import { LifecycleState } from '../src/redqueen/core/state/types';
import {
  CompositionConstraint,
  CompositionContext,
  CompositionRelation,
  CompositionTopology
} from '../src/redqueen/core/composition/types';

describe('R4: Cognitive Composition', () => {
  const basePartition = createComputePartition({
    cellIdentity: 'cell-alpha',
    name: 'Primary Compute',
    architecture: 'neural-symbolic',
    capacity: 1000,
    parallelism: 4,
    memory: 8192,
    specialization: 'graph-analysis',
    availability: 0.9,
    communicationProfile: {
      bandwidth: 1200,
      latency: 2.0,
      topology: 'direct',
      reliability: 0.99
    }
  });

  const baseContext: CompositionContext = {
    contextId: 'ctx_spatial_reasoning',
    domain: 'spatial-navigation',
    parameters: { resolution: 'fine', priority: 'precision' }
  };

  const baseParams: ComposeCognitiveStateParams = {
    cellIdentity: 'cell-alpha',
    cognitiveState: { mode: 'analytical', focus: 'spatial-grid', depth: 3 },
    knowledgeState: { core: 'geometry', theorems: ['euclidean-metric', 'voronoi'] },
    experienceState: { successfulNavigations: 42, errorRate: 0.02 },
    reasoningState: { strategy: 'heuristic-search', heuristic: 'a-star' },
    computePartitions: basePartition,
    context: baseContext,
    provenance: ['provenance-genesis']
  };

  it('1. same cognitive inputs → same identity', () => {
    const res1 = composeCognitiveState(baseParams);
    const res2 = composeCognitiveState(baseParams);

    expect(res1.compositionId).toBe(res2.compositionId);
    expect(res1.transformation.traceId).toBe(res2.transformation.traceId);
    expect(res1.compositionId).toMatch(/^comp_[a-f0-9]{16}$/);

    // Wall-clock/timestamp should NOT affect semantic compositionId or traceId
    const resDifferentTimestamp1 = composeCognitiveState({
      ...baseParams,
      deterministicTimestamp: '2026-01-01T00:00:00.000Z'
    });
    const resDifferentTimestamp2 = composeCognitiveState({
      ...baseParams,
      deterministicTimestamp: '2026-12-31T23:59:59.999Z'
    });

    expect(resDifferentTimestamp1.compositionId).toBe(resDifferentTimestamp2.compositionId);
    expect(resDifferentTimestamp1.transformation.traceId).toBe(resDifferentTimestamp2.transformation.traceId);
  });

  it('2. changed cognitive state → different identity', () => {
    const resOriginal = composeCognitiveState(baseParams);

    const resModifiedCognitive = composeCognitiveState({
      ...baseParams,
      cognitiveState: { mode: 'exploratory', focus: 'topology-drift', depth: 1 }
    });

    expect(resModifiedCognitive.compositionId).not.toBe(resOriginal.compositionId);
    expect(resModifiedCognitive.transformation.traceId).not.toBe(resOriginal.transformation.traceId);
  });

  it('3. changed ComputePartition → different identity', () => {
    const resOriginal = composeCognitiveState(baseParams);

    const higherCapacityPartition = createComputePartition({
      cellIdentity: 'cell-alpha',
      name: 'Primary Compute',
      architecture: 'neural-symbolic',
      capacity: 5000, // modified capacity
      parallelism: 8,
      memory: 16384,
      specialization: 'graph-analysis',
      availability: 0.95,
      communicationProfile: {
        bandwidth: 5000,
        latency: 1.0,
        topology: 'mesh',
        reliability: 0.999
      }
    });

    const resModifiedCompute = composeCognitiveState({
      ...baseParams,
      computePartitions: higherCapacityPartition
    });

    expect(resModifiedCompute.compositionId).not.toBe(resOriginal.compositionId);
    expect(resModifiedCompute.computeResources.aggregateCapability.capacity).toBe(5000);
    expect(resModifiedCompute.resultingCognitiveState.operationalBounds.effectiveCapacity).toBe(
      Math.round(5000 * 0.95)
    );
  });

  it('4. changed relation → different identity', () => {
    const customRelations1: CompositionRelation[] = [
      {
        relationId: 'rel-1',
        sourceInputId: 'input_knowledge_cell-alpha',
        targetInputId: 'input_reasoning_cell-alpha',
        relationType: 'INFORMS',
        semantics: { weight: 0.8 }
      },
      {
        relationId: 'rel-2',
        sourceInputId: 'input_reasoning_cell-alpha',
        targetInputId: 'input_cognition_cell-alpha',
        relationType: 'MODULATES',
        semantics: { directControl: true }
      }
    ];

    const customRelations2: CompositionRelation[] = [
      {
        relationId: 'rel-1',
        sourceInputId: 'input_knowledge_cell-alpha',
        targetInputId: 'input_reasoning_cell-alpha',
        relationType: 'OVERRULES', // changed relation type
        semantics: { weight: 0.8 }
      },
      {
        relationId: 'rel-2',
        sourceInputId: 'input_reasoning_cell-alpha',
        targetInputId: 'input_cognition_cell-alpha',
        relationType: 'MODULATES',
        semantics: { directControl: true }
      }
    ];

    const res1 = composeCognitiveState({ ...baseParams, relations: customRelations1 });
    const res2 = composeCognitiveState({ ...baseParams, relations: customRelations2 });

    expect(res1.compositionId).not.toBe(res2.compositionId);
    
    // Check that relationType was preserved structurally
    const relationGraph1 = res1.resultingCognitiveState.relationGraph;
    const relationGraph2 = res2.resultingCognitiveState.relationGraph;
    
    expect(relationGraph1).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationType: 'INFORMS', semantics: { weight: 0.8 } }),
        expect.objectContaining({ relationType: 'MODULATES' })
      ])
    );

    expect(relationGraph2).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationType: 'OVERRULES', semantics: { weight: 0.8 } }),
        expect.objectContaining({ relationType: 'MODULATES' })
      ])
    );
  });

  it('5. changed topology → different identity', () => {
    const topologyPipeline: CompositionTopology = {
      topologyId: 'topo-pipeline',
      arrangementType: 'PIPELINE',
      graphMapping: {
        'input_knowledge_cell-alpha': ['input_reasoning_cell-alpha'],
        'input_reasoning_cell-alpha': ['input_cognition_cell-alpha']
      }
    };

    const topologyParallel: CompositionTopology = {
      topologyId: 'topo-parallel',
      arrangementType: 'PARALLEL',
      graphMapping: {
        'input_knowledge_cell-alpha': ['input_cognition_cell-alpha'],
        'input_reasoning_cell-alpha': ['input_cognition_cell-alpha']
      }
    };

    const res1 = composeCognitiveState({ ...baseParams, topology: topologyPipeline });
    const res2 = composeCognitiveState({ ...baseParams, topology: topologyParallel });

    expect(res1.compositionId).not.toBe(res2.compositionId);
    expect(res1.topology?.arrangementType).toBe('PIPELINE');
    expect(res2.topology?.arrangementType).toBe('PARALLEL');
  });

  it('6. changed context/constraint → different identity', () => {
    const resOriginal = composeCognitiveState(baseParams);

    // Changed context domain
    const resDifferentContext = composeCognitiveState({
      ...baseParams,
      context: {
        ...baseContext,
        domain: 'cryptographic-audit'
      }
    });
    expect(resDifferentContext.compositionId).not.toBe(resOriginal.compositionId);

    // Added constraint
    const capacityConstraint: CompositionConstraint = {
      constraintId: 'constraint-cap-500',
      type: 'CAPACITY',
      condition: { minCapacity: 500 }
    };

    const resWithConstraint = composeCognitiveState({
      ...baseParams,
      constraints: [capacityConstraint]
    });
    expect(resWithConstraint.compositionId).not.toBe(resOriginal.compositionId);

    // Failing constraint throws CompositionError
    const impossibleConstraint: CompositionConstraint = {
      constraintId: 'constraint-cap-impossible',
      type: 'CAPACITY',
      condition: { minCapacity: 99999 }
    };
    expect(() =>
      composeCognitiveState({
        ...baseParams,
        constraints: [impossibleConstraint]
      })
    ).toThrow();
  });

  it('7. input immutable: guarantees input objects are not mutated and result is frozen', () => {
    const rawCognitive = { mode: 'analytical', testKey: 'original' };
    const partitionClone = createComputePartition({
      cellIdentity: 'cell-alpha',
      name: 'Mutable Test',
      architecture: 'x86_64',
      capacity: 100,
      parallelism: 1,
      memory: 1024,
      specialization: 'test',
      availability: 1,
      communicationProfile: { bandwidth: 100, latency: 1, topology: 'p2p', reliability: 1 }
    });

    const res = composeCognitiveState({
      ...baseParams,
      cognitiveState: rawCognitive,
      computePartitions: partitionClone
    });

    // Inputs must not have been mutated
    expect(rawCognitive).toEqual({ mode: 'analytical', testKey: 'original' });
    expect(partitionClone.capacity).toBe(100);

    // Output must be deep frozen
    expect(() => {
      (res as any).compositionId = 'tampered';
    }).toThrow();

    expect(() => {
      (res.resultingCognitiveState as any).mode = 'hacked';
    }).toThrow();
  });

  it('8. provenance preserved: traces origin from inputs, partitions, and transformation', () => {
    const res = composeCognitiveState({
      ...baseParams,
      provenance: ['genesis-prov', 'sensor-log-alpha']
    });

    expect(res.provenance).toContain('genesis-prov');
    expect(res.provenance).toContain('sensor-log-alpha');
    expect(res.provenance).toContain(basePartition.partitionId);
    expect(res.provenance).toContain(res.transformation.traceId);
  });

  it('9. structure/relations preserved: non-additive integrated result with distinct boundaries', () => {
    const res = composeCognitiveState(baseParams);

    // Check structure separation
    expect(res.inputStates.cognitiveState).toEqual(baseParams.cognitiveState);
    expect(res.inputStates.knowledgeState).toEqual(baseParams.knowledgeState);
    expect(res.inputStates.experienceState).toEqual(baseParams.experienceState);
    expect(res.inputStates.reasoningState).toEqual(baseParams.reasoningState);

    // Check non-additive operational bounds and mapping
    expect(res.resultingCognitiveState.operationalBounds.allocatedParallelism).toBe(4);
    expect(res.resultingCognitiveState.operationalBounds.effectiveCapacity).toBe(900); // 1000 * 0.9
    expect(res.resultingCognitiveState.specializationAlignment).toContain('graph-analysis');
    expect(res.resultingCognitiveState.relationGraph).toBeDefined();

    // Traceability step-by-step
    expect(res.transformation.reasoningTrace.length).toBeGreaterThanOrEqual(4);
  });

  it('10. R1/R2/R3 integration: composeFromCellState seamlessly integrates CellState with Partitions', () => {
    const stateManager = new CellStateManager();

    const cellState = stateManager.createInitialState({
      cellIdentity: 'cell-alpha',
      genomeReference: 'genome-v1',
      memoryState: { memoryEntries: 10 },
      knowledgeState: { domain: 'autonomous-systems' },
      cognitiveState: { mode: 'hybrid-reasoner' },
      reasoningState: { logic: 'first-order' },
      experienceState: { episodes: 5 },
      computationalCapability: {
        architecture: 'neural-symbolic',
        capacity: 1000,
        parallelism: 4,
        memoryLimit: 8192,
        availability: 0.9,
        communicationProfile: { protocol: 'p2p' },
        partitions: [basePartition]
      },
      specializations: [
        { domain: 'navigation', focusAreas: ['mapping'], level: 0.9 }
      ],
      lifecycle: LifecycleState.ACTIVE,
      provenance: ['cell-genesis']
    });

    const result = composeFromCellState(cellState, {
      context: baseContext
    });

    expect(result.compositionId).toMatch(/^comp_[a-f0-9]{16}$/);
    expect(result.cellIdentity).toBe('cell-alpha');
    expect(result.computeResources.partitions).toHaveLength(1);
    expect(result.computeResources.partitions[0].partitionId).toBe(basePartition.partitionId);
    expect(result.resultingCognitiveState.mode).toBe('hybrid-reasoner');
  });
});
