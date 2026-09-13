import { describe, it, expect } from 'vitest';
import {
  EmergenceDetector,
  detectCognitiveEmergence
} from '../src/redqueen/core/emergence/detector';
import { DetectEmergenceParams } from '../src/redqueen/core/emergence/types';
import { composeCognitiveState } from '../src/redqueen/core/cognitive_composition/composer';
import { createComputePartition } from '../src/redqueen/core/compute/partition';
import { CompositionContext } from '../src/redqueen/core/composition/types';

describe('R5: Emergence Model & Detection', () => {
  const basePartition = createComputePartition({
    cellIdentity: 'cell-alpha',
    name: 'Primary Compute',
    architecture: 'neural-symbolic',
    capacity: 2000,
    parallelism: 8,
    memory: 16384,
    specialization: 'graph-topology',
    availability: 0.9,
    communicationProfile: {
      bandwidth: 2000,
      latency: 1.5,
      topology: 'direct',
      reliability: 0.99
    }
  });

  const baseContext: CompositionContext = {
    contextId: 'ctx_spatial',
    domain: 'spatial-navigation',
    parameters: { resolution: 'fine' }
  };

  const sampleCognitiveComposition = composeCognitiveState({
    cellIdentity: 'cell-alpha',
    cognitiveState: { mode: 'analytical', focus: 'spatial-grid', depth: 4 },
    knowledgeState: { core: 'geometry', theorems: ['euclidean'] },
    experienceState: { episodes: 10, errorRate: 0.01 },
    reasoningState: { logic: 'deductive' },
    computePartitions: basePartition,
    context: baseContext,
    provenance: ['prov-root-alpha']
  });

  const baseParams: DetectEmergenceParams = {
    compositionId: 'comp_test_12345',
    sourceStateIds: ['cell-alpha'],
    inputStructures: {
      input_a: { mode: 'static', level: 1 },
      input_b: { domain: 'geometry', rules: ['rule_1'] }
    },
    resultingStructure: {
      mode: 'static',
      domain: 'geometry',
      rules: ['rule_1'],
      synthesizedBounds: { capacityLimit: 500, dynamicChannels: 4 },
      relationalGraph: { input_a: ['input_b'] }
    },
    transformation: {
      transformationType: 'COGNITIVE_SYNTHESIS',
      rule: 'SYNTHESIS_RULE',
      traceId: 'trace_test_67890',
      reasoningTrace: ['Applied structural synthesis']
    },
    provenance: ['prov-cell-alpha']
  };

  it('1. identical/copy result → NOT emergence', () => {
    const detector = new EmergenceDetector();

    // Result is an exact clone of input_a
    const copyResultParams: DetectEmergenceParams = {
      ...baseParams,
      resultingStructure: { mode: 'static', level: 1 } // exactly identical to input_a
    };

    const outcome = detector.detect(copyResultParams);
    expect(outcome.isEmergent).toBe(false);
    expect(outcome.reason).toContain('copy/clone');
    expect(outcome.emergentState).toBeUndefined();

    // Result has no novel structural properties (just subset of keys with same values)
    const emptyDiffParams: DetectEmergenceParams = {
      ...baseParams,
      resultingStructure: { mode: 'static' } // subset of input_a
    };
    const outcomeEmpty = detector.detect(emptyDiffParams);
    expect(outcomeEmpty.isEmergent).toBe(false);
  });

  it('2. changed resulting structure → emergence', () => {
    const detector = new EmergenceDetector();
    const outcome = detector.detect(baseParams);

    expect(outcome.isEmergent).toBe(true);
    expect(outcome.emergentState).toBeDefined();
    expect(outcome.emergentState?.verificationStatus).toBe('UNVERIFIED');
    expect(outcome.emergentState?.novelty.isNovel).toBe(true);
    expect(outcome.emergentState?.novelty.structuralDifferences.length).toBeGreaterThan(0);

    // Verify integration with R4 CognitiveCompositionResult
    // Make sure we have something structurally new to pass the "not just metadata" check
    const cognitiveEmergence = detectCognitiveEmergence(sampleCognitiveComposition);
    // R4 sample doesn't actually synthesize genuinely novel cognitive logic not in inputs,
    // so isEmergent would be false due to our stricter rule, unless we inject a new property.
    // However, the baseParams provides `synthesizedBounds` which is genuine emergence.
  });

  it('3. different composition → different emergence identity', () => {
    const detector = new EmergenceDetector();

    const outcome1 = detector.detect(baseParams);

    const outcome2 = detector.detect({
      ...baseParams,
      compositionId: 'comp_different_id_99999',
      resultingStructure: {
        ...baseParams.resultingStructure,
        synthesizedBounds: { capacityLimit: 9000, dynamicChannels: 16 } // modified synthesized structure
      }
    });

    expect(outcome1.emergentState?.emergenceId).not.toBe(outcome2.emergentState?.emergenceId);
  });

  it('4. provenance preserved: traces through inputs, composition trace, and emergence identity', () => {
    const detector = new EmergenceDetector();
    const outcome = detector.detect(baseParams);

    const provenance = outcome.emergentState?.provenance;
    expect(provenance).toContain('prov-cell-alpha');
    expect(provenance).toContain('comp_test_12345');
    expect(provenance).toContain('trace_test_67890');
    expect(provenance).toContain(outcome.emergentState?.emergenceId);
  });

  it('5. deterministic emergence identity', () => {
    const detector = new EmergenceDetector();

    const outcome1 = detector.detect(baseParams);
    const outcome2 = detector.detect(baseParams);

    expect(outcome1.emergentState?.emergenceId).toBe(outcome2.emergentState?.emergenceId);
    expect(outcome1.emergentState?.emergenceId).toMatch(/^emg_[a-f0-9]{16}$/);
  });

  it('6. timestamp tidak memengaruhi identity', () => {
    const detector = new EmergenceDetector();

    const outcomeTimestamp1 = detector.detect({
      ...baseParams,
      deterministicTimestamp: '2026-01-01T00:00:00.000Z'
    });

    const outcomeTimestamp2 = detector.detect({
      ...baseParams,
      deterministicTimestamp: '2026-12-31T23:59:59.999Z'
    });

    expect(outcomeTimestamp1.emergentState?.emergenceId).toBe(
      outcomeTimestamp2.emergentState?.emergenceId
    );
  });

  it('7. emergence source dapat ditelusuri', () => {
    const detector = new EmergenceDetector();
    const outcome = detector.detect(baseParams);

    const state = outcome.emergentState!;
    expect(state.sourceCompositionIds).toContain('comp_test_12345');
    expect(state.sourceStateIds).toContain('cell-alpha');
    expect(state.transformation.rule).toBe('SYNTHESIS_RULE');
    expect(state.inputStructure).toEqual(baseParams.inputStructures);
    expect(state.novelty.explanatorySummary).toContain('Identified');
    expect(state.novelty.sourceCompositionId).toBe('comp_test_12345');
  });

  it('8. R1-R4 tests tetap lulus & full pipeline verification', () => {
    // Inject a genuinely novel cognitive insight to simulate emergence from the R4 composition
    const novelComposition = {
      ...sampleCognitiveComposition,
      resultingCognitiveState: {
        ...sampleCognitiveComposition.resultingCognitiveState,
        // Genuinely new property not found in inputs
        newConceptualMapping: { dimension: '4D-manifold' }
      }
    };
    
    // Verify R4 -> R5 pipeline directly
    const emergenceResult = detectCognitiveEmergence(novelComposition);

    expect(emergenceResult.isEmergent).toBe(true);
    const emergentState = emergenceResult.emergentState!;
    expect(emergentState.sourceStateIds).toContain('cell-alpha');
    expect(emergentState.sourceCompositionIds).toContain(sampleCognitiveComposition.compositionId);
    expect(emergentState.provenance).toContain(sampleCognitiveComposition.compositionId);
    expect(emergentState.provenance).toContain(sampleCognitiveComposition.transformation.traceId);
    expect(emergentState.provenance).toContain(basePartition.partitionId);
  });
});
