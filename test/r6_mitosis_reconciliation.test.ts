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
    knowledgeState: { core: 'math', concept1: 'geometry', concept2: 'algebra' },
    cognitiveState: { mode: 'analytical', bias: 'logical', speed: 'fast' },
    reasoningState: { depth: 5, strategy: 'tree', heuristics: 'greedy' },
    experienceState: { encounters: 10, successRate: 0.9, failures: 1 },
    computationalCapability: aggregateCapabilities([p1, p2]),
    specializations: [
      { domain: 'programming', focusAreas: ['typescript'], level: 0.8 }
    ],
    lifecycle: LifecycleState.ACTIVE,
    provenance: ['genesis']
  });

  const reconciler = new MitosisReconciler();

  const baseSpec = {
    mitosisId: 'mitosis-evt-base',
    parentState,
    differentiationProfileA: [{ domain: 'logic', focusAreas: ['deductive'], level: 0.9 }],
    differentiationProfileB: [{ domain: 'creative', focusAreas: ['abductive'], level: 0.9 }],
    partitionDistribution: { childA: [p1.partitionId], childB: [p2.partitionId] },
    memoryDistribution: { childA: ['mem1', 'mem3'], childB: ['mem2'] },
    knowledgeDistribution: { childA: ['concept1'], childB: ['core', 'concept2'] },
    cognitiveDistribution: { childA: ['mode', 'bias'], childB: ['speed'] },
    reasoningDistribution: { childA: ['depth', 'strategy'], childB: ['heuristics'] },
    experienceDistribution: { childA: ['encounters', 'successRate'], childB: ['failures'] }
  };

  it('1. deterministic mitosis creates two distinct child states', () => {
    const result = reconciler.reconcile(baseSpec);
    expect(result.mitosisId).toBe('mitosis-evt-base');
    expect(result.childA.stateId).not.toBe(result.childB.stateId);
    expect(result.childA.stateId).not.toBe(parentState.stateId);
    expect(result.childB.stateId).not.toBe(parentState.stateId);
    expect(result.childA.cellIdentity).not.toBe(result.childB.cellIdentity);
    expect(result.childA.cellIdentity).toContain('parent-cell-alpha_A_');
    expect(result.childB.cellIdentity).toContain('parent-cell-alpha_B_');
  });

  it('2. children are not full clones of parent', () => {
    const result = reconciler.reconcile(baseSpec);
    expect(Object.keys(result.childA.memoryState)).toEqual(['mem1', 'mem3']);
    expect(Object.keys(result.childB.memoryState)).toEqual(['mem2']);
    expect(result.childA.specializations[0].domain).toBe('logic');
    expect(result.childB.specializations[0].domain).toBe('creative');
  });

  it('3. parent remains immutable', () => {
    const originalParent = structuredClone(parentState);
    reconciler.reconcile(baseSpec);
    expect(parentState).toEqual(originalParent);
  });

  it('4. differentiated compute partitions ownership', () => {
    const result = reconciler.reconcile(baseSpec);
    const p1A = result.childA.computationalCapability.partitions![0];
    expect(p1A.cellIdentity).toBe(result.childA.cellIdentity);
    expect(p1A.partitionId).not.toBe(p1.partitionId);
    expect(p1A.capacity).toBe(p1.capacity);
    const p2B = result.childB.computationalCapability.partitions![0];
    expect(p2B.cellIdentity).toBe(result.childB.cellIdentity);
    expect(p2B.capacity).toBe(p2.capacity);
  });

  it('5. lineage and provenance preservation', () => {
    const result = reconciler.reconcile(baseSpec);
    expect(result.childA.provenance).toContain('genesis');
    expect(result.childA.provenance).toContain('mitosis:mitosis-evt-base:childA');
    expect(result.childB.provenance).toContain('genesis');
    expect(result.childB.provenance).toContain('mitosis:mitosis-evt-base:childB');
  });

  it('6. differentiated knowledge state distribution', () => {
    const result = reconciler.reconcile(baseSpec);
    expect(Object.keys(result.childA.knowledgeState)).toEqual(['concept1']);
    expect(Object.keys(result.childB.knowledgeState)).toEqual(['core', 'concept2']);
  });

  it('7. differentiated cognitive state distribution', () => {
    const result = reconciler.reconcile(baseSpec);
    expect(Object.keys(result.childA.cognitiveState)).toEqual(['mode', 'bias']);
    expect(Object.keys(result.childB.cognitiveState)).toEqual(['speed']);
  });

  it('8. differentiated reasoning state distribution', () => {
    const result = reconciler.reconcile(baseSpec);
    expect(Object.keys(result.childA.reasoningState)).toEqual(['depth', 'strategy']);
    expect(Object.keys(result.childB.reasoningState)).toEqual(['heuristics']);
  });

  it('9. differentiated experience state distribution', () => {
    const result = reconciler.reconcile(baseSpec);
    expect(Object.keys(result.childA.experienceState)).toEqual(['encounters', 'successRate']);
    expect(Object.keys(result.childB.experienceState)).toEqual(['failures']);
  });

  it('10. missing keys in knowledge distribution throws error', () => {
    const spec = { ...baseSpec, knowledgeDistribution: { childA: ['non_existent'], childB: [] } };
    expect(() => reconciler.reconcile(spec)).toThrow(/Key 'non_existent' not found/);
  });

  it('11. missing keys in cognitive distribution throws error', () => {
    const spec = { ...baseSpec, cognitiveDistribution: { childA: [], childB: ['non_existent'] } };
    expect(() => reconciler.reconcile(spec)).toThrow(/Key 'non_existent' not found/);
  });

  it('12. missing keys in reasoning distribution throws error', () => {
    const spec = { ...baseSpec, reasoningDistribution: { childA: ['non_existent'], childB: ['also_missing'] } };
    expect(() => reconciler.reconcile(spec)).toThrow(/Key 'non_existent' not found/);
  });

  it('13. missing keys in experience distribution throws error', () => {
    const spec = { ...baseSpec, experienceDistribution: { childA: ['non_existent'], childB: [] } };
    expect(() => reconciler.reconcile(spec)).toThrow(/Key 'non_existent' not found/);
  });

  it('14. overlapping keys in distributions fail by default', () => {
    const spec = { ...baseSpec, knowledgeDistribution: { childA: ['core'], childB: ['core'] } };
    expect(() => reconciler.reconcile(spec)).toThrow(/Overlapping inheritance/);
  });

  it('14b. overlapping keys in distributions pass with allowSharedInheritance', () => {
    const spec = { ...baseSpec, allowSharedInheritance: true, knowledgeDistribution: { childA: ['core'], childB: ['core'] } };
    const result = reconciler.reconcile(spec);
    expect(Object.keys(result.childA.knowledgeState)).toEqual(['core']);
    expect(Object.keys(result.childB.knowledgeState)).toEqual(['core']);
  });

  it('15. empty distributions result in empty child states', () => {
    const spec = {
      ...baseSpec,
      knowledgeDistribution: { childA: [], childB: [] },
      cognitiveDistribution: { childA: [], childB: [] },
      reasoningDistribution: { childA: [], childB: [] },
      experienceDistribution: { childA: [], childB: [] }
    };
    const result = reconciler.reconcile(spec);
    expect(Object.keys(result.childA.knowledgeState).length).toBe(0);
    expect(Object.keys(result.childB.cognitiveState).length).toBe(0);
  });

  it('16. spec signature incorporates all new distributions deterministically', () => {
    const spec1 = { ...baseSpec, mitosisId: 'test-123' };
    const spec2 = { ...baseSpec, mitosisId: 'test-123', knowledgeDistribution: { childA: ['core'], childB: [] } };
    
    const result1 = reconciler.reconcile(spec1);
    const result2 = reconciler.reconcile(spec2);
    
    // Because knowledgeDistribution differs, the signature in cellIdentity should differ
    expect(result1.childA.cellIdentity).not.toBe(result2.childA.cellIdentity);
  });

  it('17. nonexistent partition ID throws error (FAIL FAST)', () => {
    const spec = { 
      ...baseSpec, 
      partitionDistribution: { childA: ['non_existent_part'], childB: [p2.partitionId] } 
    };
    expect(() => reconciler.reconcile(spec)).toThrow(/Partition ID 'non_existent_part' not found/);
  });

  it('18. overlapping partition IDs default fails (FAIL FAST)', () => {
    const spec = { 
      ...baseSpec, 
      partitionDistribution: { childA: [p1.partitionId], childB: [p1.partitionId] } 
    };
    expect(() => reconciler.reconcile(spec)).toThrow(/Overlapping inheritance in partitionDistribution/);
  });

  it('19. overlapping partition IDs pass with allowSharedInheritance=true', () => {
    const spec = { 
      ...baseSpec, 
      allowSharedInheritance: true, 
      partitionDistribution: { childA: [p1.partitionId], childB: [p1.partitionId] } 
    };
    const result = reconciler.reconcile(spec);
    expect(result.childA.computationalCapability.partitions![0].name).toBe('P1');
    expect(result.childB.computationalCapability.partitions![0].name).toBe('P1');
    expect(result.childA.computationalCapability.partitions![0].cellIdentity).toBe(result.childA.cellIdentity);
    expect(result.childB.computationalCapability.partitions![0].cellIdentity).toBe(result.childB.cellIdentity);
  });

  describe('Cognitive Representation Ownership & Immutability', () => {
    const conceptRepA = {
      conceptId: 'concept-geom',
      canonicalName: 'Geometry',
      category: 'abstract',
      attributes: {},
      originatingCellId: 'parent-cell-alpha',
      currentHolderCellId: 'parent-cell-alpha',
      provenance: ['genesis'],
      createdAt: new Date().toISOString(),
      confidence: 0.95,
      verificationStatus: 'VERIFIED',
      version: 1
    };

    const conceptRepB = {
      conceptId: 'concept-alg',
      canonicalName: 'Algebra',
      category: 'abstract',
      attributes: {},
      originatingCellId: 'parent-cell-alpha',
      currentHolderCellId: 'parent-cell-alpha',
      provenance: ['genesis'],
      createdAt: new Date().toISOString(),
      confidence: 0.92,
      verificationStatus: 'VERIFIED',
      version: 1
    };

    const parentWithRep = stateManager.createInitialState({
      cellIdentity: 'parent-cell-alpha',
      genomeReference: 'genome-v1',
      memoryState: {},
      knowledgeState: { cA: conceptRepA, cB: conceptRepB },
      cognitiveState: {},
      reasoningState: {},
      experienceState: {},
      computationalCapability: aggregateCapabilities([p1, p2]),
      specializations: [{ domain: 'math', focusAreas: ['core'], level: 1.0 }],
      lifecycle: LifecycleState.ACTIVE,
      provenance: ['genesis']
    });

    const repSpec = {
      mitosisId: 'mitosis-rep-test',
      parentState: parentWithRep,
      differentiationProfileA: [{ domain: 'geometry', focusAreas: ['spatial'], level: 0.9 }],
      differentiationProfileB: [{ domain: 'algebra', focusAreas: ['symbolic'], level: 0.9 }],
      partitionDistribution: { childA: [p1.partitionId], childB: [p2.partitionId] },
      memoryDistribution: { childA: [], childB: [] },
      knowledgeDistribution: { childA: ['cA'], childB: ['cB'] },
      cognitiveDistribution: { childA: [], childB: [] },
      reasoningDistribution: { childA: [], childB: [] },
      experienceDistribution: { childA: [], childB: [] }
    };

    it('20. inherited representation keeps original originatingCellId', () => {
      const result = reconciler.reconcile(repSpec);
      const inheritedA = result.childA.knowledgeState['cA'] as any;
      const inheritedB = result.childB.knowledgeState['cB'] as any;

      expect(inheritedA.originatingCellId).toBe('parent-cell-alpha');
      expect(inheritedB.originatingCellId).toBe('parent-cell-alpha');
      expect(inheritedA.originatingCellId).not.toBe(result.childA.cellIdentity);
      expect(inheritedB.originatingCellId).not.toBe(result.childB.cellIdentity);
    });

    it('21. inherited representation gets correct currentHolderCellId', () => {
      const result = reconciler.reconcile(repSpec);
      const inheritedA = result.childA.knowledgeState['cA'] as any;
      const inheritedB = result.childB.knowledgeState['cB'] as any;

      expect(inheritedA.currentHolderCellId).toBe(result.childA.cellIdentity);
      expect(inheritedB.currentHolderCellId).toBe(result.childB.cellIdentity);
    });

    it('22. Child A and Child B partition and representation ownership are distinct and correct', () => {
      const result = reconciler.reconcile(repSpec);
      
      // Partition ownership verification
      expect(result.childA.computationalCapability.partitions![0].cellIdentity).toBe(result.childA.cellIdentity);
      expect(result.childB.computationalCapability.partitions![0].cellIdentity).toBe(result.childB.cellIdentity);
      expect(result.childA.computationalCapability.partitions![0].cellIdentity).not.toBe(
        result.childB.computationalCapability.partitions![0].cellIdentity
      );

      // Representation ownership verification
      const inheritedA = result.childA.knowledgeState['cA'] as any;
      const inheritedB = result.childB.knowledgeState['cB'] as any;
      expect(inheritedA.currentHolderCellId).toBe(result.childA.cellIdentity);
      expect(inheritedB.currentHolderCellId).toBe(result.childB.cellIdentity);
      expect(inheritedA.currentHolderCellId).not.toBe(inheritedB.currentHolderCellId);
    });
  });
});
