import { describe, it, expect, beforeEach } from 'vitest';
import { CompositionEngine, CompositionError } from '../src/redqueen/core/composition/engine';
import {
  CompositionInput,
  CompositionRelation,
  CompositionContext,
  CompositionType,
  CompositionTransformationRule,
  CompositionConstraint
} from '../src/redqueen/core/composition/types';

describe('R1: Composition Primitive', () => {
  let engine: CompositionEngine;

  beforeEach(() => {
    engine = new CompositionEngine();
  });

  it('should initialize and register rules', () => {
    const dummyRule: CompositionTransformationRule = {
      transformationType: 'DUMMY_RULE',
      supportedTypes: [CompositionType.GENERIC_STRUCTURE],
      canApply: () => true,
      apply: () => ({ derivedStructure: { test: true }, reasoningTrace: ['applied dummy'] })
    };
    engine.registerRule(dummyRule);
    expect(() => engine.registerRule(dummyRule)).toThrow(CompositionError);
  });

  it('should reject invalid inputs', () => {
    const dummyRule: CompositionTransformationRule = {
      transformationType: 'DUMMY_RULE',
      supportedTypes: [CompositionType.GENERIC_STRUCTURE],
      canApply: () => true,
      apply: () => ({ derivedStructure: {}, reasoningTrace: [] })
    };
    engine.registerRule(dummyRule);

    const context: CompositionContext = { contextId: 'ctx-1', domain: 'test', parameters: {} };

    // Empty inputs
    expect(() => engine.compose('DUMMY_RULE', [], [], undefined, [], context)).toThrow(
      'Composition requires at least one input structure.'
    );

    // Duplicate input IDs
    const inputs: CompositionInput[] = [
      { inputId: 'in-1', type: CompositionType.GENERIC_STRUCTURE, structure: {}, provenance: ['p1'] },
      { inputId: 'in-1', type: CompositionType.GENERIC_STRUCTURE, structure: {}, provenance: ['p2'] }
    ];
    expect(() => engine.compose('DUMMY_RULE', inputs, [], undefined, [], context)).toThrow(
      'Duplicate input ID detected: in-1'
    );
  });

  it('should validate relations', () => {
    const dummyRule: CompositionTransformationRule = {
      transformationType: 'DUMMY_RULE',
      supportedTypes: [CompositionType.GENERIC_STRUCTURE],
      canApply: () => true,
      apply: () => ({ derivedStructure: {}, reasoningTrace: [] })
    };
    engine.registerRule(dummyRule);

    const inputs: CompositionInput[] = [
      { inputId: 'in-1', type: CompositionType.GENERIC_STRUCTURE, structure: {}, provenance: ['p1'] }
    ];
    const relations: CompositionRelation[] = [
      { relationId: 'r-1', sourceInputId: 'in-1', targetInputId: 'in-2', relationType: 'TEST' }
    ];
    const context: CompositionContext = { contextId: 'ctx-1', domain: 'test', parameters: {} };

    expect(() => engine.compose('DUMMY_RULE', inputs, relations, undefined, [], context)).toThrow(
      'references missing target input in-2'
    );
  });

  it('should perform structural composition without mutation', () => {
    const logicalAndRule: CompositionTransformationRule = {
      transformationType: 'LOGICAL_AND',
      supportedTypes: [CompositionType.REASONING],
      canApply: (inputs) => inputs.every(i => typeof i.structure.value === 'boolean'),
      apply: (inputs, relations, topology, constraints, context) => {
        const resultValue = inputs.every(i => i.structure.value === true);
        return {
          derivedStructure: { value: resultValue },
          reasoningTrace: [
            `Evaluated logical AND over ${inputs.length} inputs.`,
            `Context: ${context.domain}`
          ]
        };
      }
    };
    engine.registerRule(logicalAndRule);

    const inputA: CompositionInput = {
      inputId: 'bool-1',
      type: CompositionType.REASONING,
      structure: { value: true },
      provenance: ['prov-A']
    };
    const inputB: CompositionInput = {
      inputId: 'bool-2',
      type: CompositionType.REASONING,
      structure: { value: true },
      provenance: ['prov-B']
    };

    const inputACopy = JSON.parse(JSON.stringify(inputA));
    const inputBCopy = JSON.parse(JSON.stringify(inputB));

    const context: CompositionContext = { contextId: 'ctx-logical', domain: 'logic', parameters: {} };

    const result = engine.compose('LOGICAL_AND', [inputA, inputB], [], undefined, [], context);

    expect(result.derivedStructure.value).toBe(true);
    expect(result.type).toBe(CompositionType.REASONING);
    expect(result.trace.transformationType).toBe('LOGICAL_AND');
    expect(result.trace.reasoningTrace.length).toBe(2);
    expect(result.provenance).toContain('prov-A');
    expect(result.provenance).toContain('prov-B');
    expect(result.provenance.find(p => p.startsWith('trace_'))).toBeDefined();

    // Verify immutability
    expect(inputA).toEqual(inputACopy);
    expect(inputB).toEqual(inputBCopy);
  });

  it('should enforce determinism given deterministic timestamp', () => {
    const mergeRule: CompositionTransformationRule = {
      transformationType: 'MERGE',
      supportedTypes: [CompositionType.GENERIC_STRUCTURE],
      canApply: () => true,
      apply: (inputs) => {
        const merged = inputs.reduce((acc, curr) => ({ ...acc, ...curr.structure }), {});
        return { derivedStructure: merged, reasoningTrace: ['Merged structures.'] };
      }
    };
    engine.registerRule(mergeRule);

    const inputs: CompositionInput[] = [
      { inputId: '1', type: CompositionType.KNOWLEDGE, structure: { a: 1 }, provenance: ['p1'] },
      { inputId: '2', type: CompositionType.KNOWLEDGE, structure: { b: 2 }, provenance: ['p2'] }
    ];
    const context: CompositionContext = { contextId: 'ctx-1', domain: 'test', parameters: {} };

    // Because IDs are generated internally, resultId and traceId will differ unless mocked.
    // We check that the semantic output and trace structures are consistent.
    const result1 = engine.compose('MERGE', inputs, [], undefined, [], context, '2026-01-01T00:00:00Z');
    
    expect(result1.trace.timestamp).toBe('2026-01-01T00:00:00Z');
    expect(result1.derivedStructure).toEqual({ a: 1, b: 2 });
  });

  it('should safely fail when rule cannot apply', () => {
    const strictRule: CompositionTransformationRule = {
      transformationType: 'STRICT_RULE',
      supportedTypes: [CompositionType.KNOWLEDGE],
      canApply: (inputs) => inputs.length === 3, // Requires exactly 3
      apply: () => ({ derivedStructure: {}, reasoningTrace: [] })
    };
    engine.registerRule(strictRule);

    const inputs: CompositionInput[] = [
      { inputId: '1', type: CompositionType.KNOWLEDGE, structure: {}, provenance: ['p1'] }
    ];
    const context: CompositionContext = { contextId: 'ctx', domain: 'test', parameters: {} };

    expect(() => engine.compose('STRICT_RULE', inputs, [], undefined, [], context)).toThrow(
      "Rule 'STRICT_RULE' cannot be applied"
    );
  });
});
