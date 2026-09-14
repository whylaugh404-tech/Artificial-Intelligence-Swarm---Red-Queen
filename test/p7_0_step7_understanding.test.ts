import { describe, test, expect } from 'vitest';
import { UnderstandingEngine } from '../src/redqueen/cognition/understanding/engine';
import { CognitiveConcept, CognitiveRelation, CognitiveRelationPredicate, RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';
import { Evidence } from '../src/redqueen/cognition/evidence/types';
import { Context } from '../src/redqueen/cognition/epistemic/types';

describe('P7.0 Step 7: Native Understanding Engine', () => {
  const engine = new UnderstandingEngine();

  const mockContext: Context = {
    contextId: 'ctx_001',
    domain: 'TEST'
  };

  const concept1: CognitiveConcept = {
    conceptId: 'con_1',
    canonicalName: 'Apple',
    description: 'A fruit',
    category: 'CONCEPTUAL' as any,
    sourceKnowledgeIds: ['k1'],
    sourceExperienceIds: [],
    originatingCellId: 'cell_A',
    confidence: 0.9,
    verificationStatus: RepresentationVerificationStatus.VERIFIED,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    provenance: ['cell_A'],
    evidenceIds: ['ev_1'],
    metadata: {}
  };

  const concept2: CognitiveConcept = {
    conceptId: 'con_2',
    canonicalName: 'Red',
    description: 'A color',
    category: 'CONCEPTUAL' as any,
    sourceKnowledgeIds: ['k2'],
    sourceExperienceIds: [],
    originatingCellId: 'cell_B',
    confidence: 0.9,
    verificationStatus: RepresentationVerificationStatus.PENDING,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    provenance: ['cell_B'],
    evidenceIds: [],
    metadata: {}
  };

  const relation: CognitiveRelation = {
    relationId: 'rel_1',
    subjectConceptId: 'con_1',
    predicate: CognitiveRelationPredicate.RELATED_TO,
    objectConceptId: 'con_2',
    confidence: 0.8,
    provenance: ['cell_C'],
    verificationStatus: RepresentationVerificationStatus.SUPPORTED,
    createdAt: new Date().toISOString(),
    originatingCellId: 'cell_C',
    evidenceIds: ['ev_2'],
    metadata: {}
  };

  const evidence1: Evidence = {
    evidenceId: 'ev_3',
    sourceId: "cell_D", timestamp: new Date().toISOString(),
    provenance: { sourceId: 'cell_D', timestamp: new Date().toISOString() },
    context: mockContext
  };

  test('Should compose a new CognitiveUnderstanding with correct deterministic ID', () => {
    const input1 = {
      summary: 'Apples are related to the color red.',
      concepts: [concept1, concept2],
      relations: [relation],
      evidences: [evidence1],
      context: mockContext,
      originatingCellId: 'cell_X'
    };

    const understanding1 = engine.compose(input1);
    
    expect(understanding1.understandingId).toMatch(/^und_[a-f0-9]{16}$/);
    expect(understanding1.dependencies.length).toBe(4);
    
    // Determinism test
    const understanding2 = engine.compose(input1);
    expect(understanding1.understandingId).toBe(understanding2.understandingId);
  });

  test('Should preserve source traceability and provenance', () => {
    const understanding = engine.compose({
      summary: 'Apples are red.',
      concepts: [concept1, concept2],
      relations: [relation],
      evidences: [evidence1],
      context: mockContext,
      originatingCellId: 'cell_X'
    });

    const dependencySourceIds = understanding.dependencies.map(d => d.sourceId);
    expect(dependencySourceIds).toContain('con_1');
    expect(dependencySourceIds).toContain('con_2');
    expect(dependencySourceIds).toContain('rel_1');
    expect(dependencySourceIds).toContain('ev_3');

    // Provenance must be preserved
    expect(understanding.provenance).toContain('cell_A');
    expect(understanding.provenance).toContain('cell_B');
    expect(understanding.provenance).toContain('cell_C');
    expect(understanding.provenance).toContain('cell_D');
  });

  test('Should preserve epistemic state - SUPPORTED when valid evidence exists', () => {
    const understanding = engine.compose({
      summary: 'Valid summary',
      concepts: [concept1],
      context: mockContext,
      originatingCellId: 'cell_X'
    });
    // Concept1 has VERIFIED status and evidence 'ev_1'. Engine will set it to SUPPORTED.
    expect(understanding.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
    expect(understanding.evidenceIds).toContain('ev_1');
  });

  test('Should preserve epistemic state - CONTRADICTED when conflicting source exists', () => {
    const conflictConcept: CognitiveConcept = {
      ...concept2,
      verificationStatus: RepresentationVerificationStatus.CONTRADICTED
    };

    const understanding = engine.compose({
      summary: 'Conflicting summary',
      concepts: [concept1, conflictConcept],
      context: mockContext,
      originatingCellId: 'cell_X'
    });

    expect(understanding.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);
  });

  test('Should be immutable', () => {
    const understanding = engine.compose({
      summary: 'Immutable summary',
      concepts: [concept1],
      context: mockContext,
      originatingCellId: 'cell_X'
    });

    expect(Object.isFrozen(understanding)).toBe(true);
    expect(() => {
      (understanding as any).summary = 'Changed';
    }).toThrow();
  });

  test('Semantic ID should ignore summary changes', () => {
    const und1 = engine.compose({
      summary: 'Summary A',
      concepts: [concept1],
      context: mockContext,
      originatingCellId: 'cell_X'
    });
    
    const und2 = engine.compose({
      summary: 'Summary B', // Different summary
      concepts: [concept1],
      context: mockContext,
      originatingCellId: 'cell_Y' // Different originating cell
    });

    expect(und1.understandingId).toBe(und2.understandingId);
  });

  test('Semantic ID should ignore order of inputs', () => {
    const und1 = engine.compose({
      concepts: [concept1, concept2], // concept1 then concept2
      context: mockContext,
      originatingCellId: 'cell_X'
    });
    
    const und2 = engine.compose({
      concepts: [concept2, concept1], // concept2 then concept1
      context: mockContext,
      originatingCellId: 'cell_X'
    });

    expect(und1.understandingId).toBe(und2.understandingId);
  });

  test('Semantic ID should change when semantic inputs change', () => {
    const und1 = engine.compose({
      concepts: [concept1],
      context: mockContext,
      originatingCellId: 'cell_X'
    });
    
    const und2 = engine.compose({
      concepts: [concept1, concept2], // Additional concept
      context: mockContext,
      originatingCellId: 'cell_X'
    });

    expect(und1.understandingId).not.toBe(und2.understandingId);
  });

  test('Semantic ID should change when semantic context changes', () => {
    const und1 = engine.compose({
      concepts: [concept1],
      context: mockContext,
      originatingCellId: 'cell_X'
    });
    
    const diffContext = { ...mockContext, domain: 'DIFFERENT' };
    const und2 = engine.compose({
      concepts: [concept1],
      context: diffContext,
      originatingCellId: 'cell_X'
    });

    expect(und1.understandingId).not.toBe(und2.understandingId);
  });

  test('Semantic ID should remain same even if object keys are reordered in context', () => {
    const und1 = engine.compose({
      concepts: [concept1],
      context: { contextId: 'ctx_001', domain: 'TEST' },
      originatingCellId: 'cell_X'
    });
    
    const und2 = engine.compose({
      concepts: [concept1],
      context: { domain: 'TEST', contextId: 'ctx_001' },
      originatingCellId: 'cell_X'
    });

    expect(und1.understandingId).toBe(und2.understandingId);
  });
});
