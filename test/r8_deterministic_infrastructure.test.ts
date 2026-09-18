import { describe, it, expect } from 'vitest';
import {
  canonicalSerialize,
  computeCanonicalHash,
  canonicalizeProvenance,
  deepFreeze
} from '../src/redqueen/core/canonical';
import { CellStateManager } from '../src/redqueen/core/state/engine';
import { LifecycleState } from '../src/redqueen/core/state/types';
import {
  createComputePartition,
  aggregateCapabilities,
  calculateEffectiveCollectiveCapacity
} from '../src/redqueen/core/compute/partition';
import { CompositionEngine } from '../src/redqueen/core/composition/engine';
import {
  CompositionInput,
  CompositionRelation,
  CompositionType,
  CompositionTopology,
  CompositionTransformationRule
} from '../src/redqueen/core/composition/types';
import { composeCognitiveState } from '../src/redqueen/core/cognitive_composition/composer';
import { EpistemicStatus } from '../src/redqueen/cognition/epistemic/types';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';

describe('R8: Deterministic Infrastructure & Canonical Semantic Identity', () => {
  describe('1. Shared Canonical Helper (RFC 8785 & Full 256-bit SHA-256)', () => {
    it('serializes objects identically regardless of property insertion order', () => {
      const objA = { z: 1, a: 2, m: { y: 3, x: 4 } };
      const objB = { a: 2, m: { x: 4, y: 3 }, z: 1 };

      expect(canonicalSerialize(objA)).toBe(canonicalSerialize(objB));
      expect(computeCanonicalHash(objA)).toBe(computeCanonicalHash(objB));
      expect(computeCanonicalHash(objA)).toMatch(/^[a-f0-9]{64}$/);
    });

    it('handles nested arrays, primitives, and nulls deterministically', () => {
      const data1 = { tags: ['alpha', 'beta'], flag: true, val: 42, empty: null };
      const data2 = { empty: null, val: 42, flag: true, tags: ['alpha', 'beta'] };

      expect(canonicalSerialize(data1)).toBe(canonicalSerialize(data2));
      expect(computeCanonicalHash(data1)).toBe(computeCanonicalHash(data2));
    });

    it('canonicalizes provenance arrays: deduplication and deterministic sorting', () => {
      const raw1 = ['source_b', 'source_a', 'source_c', 'source_a'];
      const raw2 = ['source_a', 'source_c', 'source_b'];

      const canon1 = canonicalizeProvenance(raw1);
      const canon2 = canonicalizeProvenance(raw2);

      expect(canon1).toEqual(['source_a', 'source_b', 'source_c']);
      expect(canon1).toEqual(canon2);
    });
  });

  describe('2. State Semantic Identity Determinism (CellStateManager)', () => {
    const manager = new CellStateManager();

    const baseStateInput = {
      cellIdentity: 'cell-core-01',
      genomeReference: 'genome-ref-xyz',
      memoryState: { capacity: 1024, utilized: 256 },
      knowledgeState: { domain: 'logic', axioms: 42 },
      cognitiveState: { mode: 'analytical', depth: 3 },
      reasoningState: { rules: ['deduction', 'induction'] },
      experienceState: { episodes: 15 },
      computationalCapability: {
        architecture: 'arm64',
        capacity: 500,
        parallelism: 8,
        memoryLimit: 16384,
        availability: 0.99,
        communicationProfile: { bandwidth: 1000, latency: 1, topology: 'direct', reliability: 0.99 }
      },
      specializations: [
        { domain: 'analysis', focusAreas: ['graph'], level: 0.85 }
      ],
      lifecycle: LifecycleState.ACTIVE,
      provenance: ['prov_init_1', 'prov_init_2']
    };

    it('same semantic input + same schema/version → same deterministic stateId', () => {
      const state1 = manager.createInitialState(baseStateInput);
      
      // Permuted key order in nested objects
      const state2 = manager.createInitialState({
        ...baseStateInput,
        knowledgeState: { axioms: 42, domain: 'logic' },
        memoryState: { utilized: 256, capacity: 1024 },
        provenance: ['prov_init_2', 'prov_init_1'] // Permuted provenance order
      });

      expect(state1.stateId).toBe(state2.stateId);
      expect(state1.stateId).toMatch(/^state_[a-f0-9]{64}$/);
    });

    it('timestamp metadata variations do not alter transition or state semantic identity', () => {
      const state1 = manager.createInitialState(baseStateInput);
      const { newState: ns1, transition: t1 } = manager.applyTransition(
        state1,
        'LIFECYCLE_CHANGE',
        { lifecycle: LifecycleState.DORMANT },
        ['cmd-sleep'],
        '2026-01-01T00:00:00.000Z'
      );

      const { newState: ns2, transition: t2 } = manager.applyTransition(
        state1,
        'LIFECYCLE_CHANGE',
        { lifecycle: LifecycleState.DORMANT },
        ['cmd-sleep'],
        '2026-12-31T23:59:59.999Z'
      );

      expect(t1.timestamp).not.toBe(t2.timestamp);
      expect(ns1.stateId).toBe(ns2.stateId);
      expect(t1.transitionId).toBe(t2.transitionId);
    });

    it('semantic state changes alter stateId and create deterministic transitionId', () => {
      const state = manager.createInitialState(baseStateInput);
      const { newState, transition } = manager.applyTransition(
        state,
        'KNOWLEDGE_UPGRADE',
        { knowledgeState: { domain: 'logic', axioms: 43 } },
        ['upgrade_event_01']
      );

      expect(newState.stateId).not.toBe(state.stateId);
      expect(transition.transitionId).toMatch(/^trans_[a-f0-9]{64}$/);
      expect(transition.sourceStateId).toBe(state.stateId);
      expect(transition.targetStateId).toBe(newState.stateId);
    });
  });

  describe('3. Compute Partition Determinism & Effective Collective Capacity', () => {
    it('generates deterministic 256-bit partitionId regardless of property order', () => {
      const p1 = createComputePartition({
        cellIdentity: 'cell-p',
        name: 'part-01',
        architecture: 'x86_64',
        capacity: 1000,
        parallelism: 4,
        memory: 4096,
        specialization: 'matrix-ops',
        availability: 0.98,
        communicationProfile: { bandwidth: 2000, latency: 2, topology: 'mesh', reliability: 0.99 }
      });

      const p2 = createComputePartition({
        name: 'part-01',
        architecture: 'x86_64',
        cellIdentity: 'cell-p',
        parallelism: 4,
        capacity: 1000,
        availability: 0.98,
        specialization: 'matrix-ops',
        memory: 4096,
        communicationProfile: { reliability: 0.99, topology: 'mesh', latency: 2, bandwidth: 2000 }
      });

      expect(p1.partitionId).toBe(p2.partitionId);
      expect(p1.partitionId).toMatch(/^part_[a-f0-9]{64}$/);
    });

    it('refuses the naive assumption that sum(capacity) equals effective collective capacity', () => {
      const pA = createComputePartition({
        cellIdentity: 'cell-alpha',
        name: 'A',
        architecture: 'neural-vector',
        capacity: 1000,
        parallelism: 4,
        memory: 4096,
        specialization: 'tensor',
        availability: 0.95,
        communicationProfile: { bandwidth: 1000, latency: 5, topology: 'mesh', reliability: 0.95 }
      });

      const pB = createComputePartition({
        cellIdentity: 'cell-alpha',
        name: 'B',
        architecture: 'neural-vector',
        capacity: 1000,
        parallelism: 4,
        memory: 4096,
        specialization: 'tensor',
        availability: 0.95,
        communicationProfile: { bandwidth: 1000, latency: 5, topology: 'mesh', reliability: 0.95 }
      });

      const details = calculateEffectiveCollectiveCapacity([pA, pB]);

      expect(details.nominalCapacity).toBe(2000);
      // Effective collective capacity must be strictly less than nominal due to coordination, latency, and availability overhead
      expect(details.effectiveCapacity).toBeLessThan(details.nominalCapacity);
      expect(details.coordinationEfficiency).toBeLessThan(1.0);
      expect(details.concurrencyScalingFactor).toBeLessThan(1.0);

      const aggregate = aggregateCapabilities([pA, pB]);
      expect(aggregate.capacity).toBe(details.effectiveCapacity);
      const commProfile = aggregate.communicationProfile as Record<string, unknown>;
      expect(commProfile.nominalCapacity).toBe(2000);
      expect(commProfile.effectiveCollectiveCapacity).toBe(details.effectiveCapacity);
    });
  });

  describe('4. Composition Engine Semantic Determinism', () => {
    const engine = new CompositionEngine();

    const sumRule: CompositionTransformationRule = {
      transformationType: 'SUM_STRUCTURES',
      supportedTypes: [CompositionType.GENERIC_STRUCTURE],
      canApply: () => true,
      apply: (inputs) => {
        const sum = inputs.reduce((acc, i) => acc + ((i.structure as { value: number }).value || 0), 0);
        return {
          derivedStructure: { total: sum },
          reasoningTrace: [`Summed ${inputs.length} inputs.`]
        };
      }
    };

    engine.registerRule(sumRule);

    it('same semantic inputs in different order produce identical traceId and resultId', () => {
      const inputA: CompositionInput = {
        inputId: 'in_a',
        type: CompositionType.GENERIC_STRUCTURE,
        structure: { value: 10 },
        provenance: ['origin_a']
      };

      const inputB: CompositionInput = {
        inputId: 'in_b',
        type: CompositionType.GENERIC_STRUCTURE,
        structure: { value: 20 },
        provenance: ['origin_b']
      };

      const context = { contextId: 'ctx_shared', domain: 'math', parameters: {} };

      const res1 = engine.compose('SUM_STRUCTURES', [inputA, inputB], [], undefined, [], context, '2026-01-01T00:00:00Z');
      const res2 = engine.compose('SUM_STRUCTURES', [inputB, inputA], [], undefined, [], context, '2026-09-01T12:00:00Z');

      expect(res1.trace.traceId).toBe(res2.trace.traceId);
      expect(res1.resultId).toBe(res2.resultId);
      expect(res1.trace.traceId).toMatch(/^trace_[a-f0-9]{64}$/);
      expect(res1.resultId).toMatch(/^comp_[a-f0-9]{64}$/);
      expect(res1.provenance).toEqual(res2.provenance);
    });
  });

  describe('5. Data-Driven Cognitive Composition Replay & Zero-Index Bias', () => {
    it('replaying cognitive composition with identical data produces bit-for-bit identical output', () => {
      const partition = createComputePartition({
        cellIdentity: 'cell-replay',
        name: 'Partition Replay',
        architecture: 'sym',
        capacity: 1000,
        parallelism: 2,
        memory: 4096,
        specialization: 'knowledge-graph',
        availability: 1.0,
        communicationProfile: { bandwidth: 1000, latency: 1, topology: 'direct', reliability: 1.0 }
      });

      const params = {
        cellIdentity: 'cell-replay',
        computePartitions: [partition],
        cognitiveState: { mode: 'deductive', focusAreas: ['math', 'proofs'], attentionSpan: 0.9 },
        knowledgeState: { facts: ['fact1', 'fact2', 'fact3'], completeness: 0.8 },
        experienceState: { totalEpisodes: 25, successRate: 0.92 },
        reasoningState: { inferenceCount: 40, averageConfidence: 0.88 },
        epistemicState: { status: EpistemicStatus.VERIFIED, verificationStatus: RepresentationVerificationStatus.VERIFIED, rawConfidence: 0.95 },
        specialization: [{ domain: 'logic', focusAreas: ['rules'], level: 0.9 }],
        context: { contextId: 'ctx_replay', domain: 'audit', parameters: {} }
      };

      const res1 = composeCognitiveState(params);
      const res2 = composeCognitiveState(params);

      expect(res1.compositionId).toBe(res2.compositionId);
      expect(res1.transformation.traceId).toBe(res2.transformation.traceId);
      expect(res1.resultVector).toEqual(res2.resultVector);
      expect(res1.featureProvenance).toEqual(res2.featureProvenance);
      expect(res1.compositionId).toMatch(/^comp_[a-f0-9]{64}$/);

      // Verify every feature has complete traceable provenance
      expect(res1.featureProvenance).toBeDefined();
      expect(Object.keys(res1.featureProvenance || {}).length).toBeGreaterThan(0);
      for (const [feat, prov] of Object.entries(res1.featureProvenance || {})) {
        expect(feat).toBeDefined();
        expect(prov).toBeDefined();
        expect(prov.length).toBeGreaterThan(0);
      }
    });
  });
});
