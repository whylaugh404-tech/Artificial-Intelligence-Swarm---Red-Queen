import { describe, it, expect } from 'vitest';
import { CellStateManager } from '../src/redqueen/core/state/engine';
import { LifecycleState } from '../src/redqueen/core/state/types';
import { MitosisReconciler } from '../src/redqueen/core/mitosis_reconciliation/reconciler';
import { ArchitecturalCompatibilityValidator } from '../src/redqueen/core/compatibility/validator';
import { createComputePartition, aggregateCapabilities } from '../src/redqueen/core/compute/partition';
import { RepresentationVerificationStatus, CognitiveRelationPredicate } from '../src/redqueen/cognition/representation/types';

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

  const baseSpec = {
    mitosisId: 'mitosis-valid-01',
    parentState,
    differentiationProfileA: [],
    differentiationProfileB: [],
    partitionDistribution: { childA: [p1.partitionId], childB: [] },
    memoryDistribution: { childA: [], childB: [] },
    knowledgeDistribution: { childA: [], childB: [] },
    cognitiveDistribution: { childA: [], childB: [] },
    reasoningDistribution: { childA: [], childB: [] },
    experienceDistribution: { childA: [], childB: [] }
  };

  const validConcept = {
    conceptId: 'concept-1',
    canonicalName: 'Test Concept',
    description: 'A test concept',
    category: 'UNKNOWN',
    sourceKnowledgeIds: ['k1'],
    sourceExperienceIds: [],
    originatingCellId: 'cell-alpha',
    confidence: 1.0,
    verificationStatus: RepresentationVerificationStatus.VERIFIED,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    provenance: ['genesis', 'eval-1']
  };

  const validRelation = {
    relationId: 'rel-1',
    subjectConceptId: 'concept-1',
    predicate: CognitiveRelationPredicate.RELATED_TO,
    objectConceptId: 'concept-2',
    confidence: 1.0,
    provenance: ['genesis', 'eval-1'],
    verificationStatus: RepresentationVerificationStatus.VERIFIED,
    createdAt: new Date().toISOString(),
    originatingCellId: 'cell-alpha'
  };

  it('1. validates a successful and compliant mitosis reconciliation', () => {
    const result = reconciler.reconcile(baseSpec);
    const validation = validator.validateMitosisResult(result);
    expect(validation.status).toBe('COMPATIBLE');
    expect(validation.anomalies.length).toBe(0);
  });

  it('2. detects and rejects invalid partition ownership (R3 incompatibility)', () => {
    const result = reconciler.reconcile(baseSpec);
    const tamperedChildA = { ...result.childA, computationalCapability: aggregateCapabilities([p1]) };
    const tamperedResult = { ...result, childA: tamperedChildA };
    const validation = validator.validateMitosisResult(tamperedResult);
    expect(validation.status).toBe('INCOMPATIBLE');
    expect(validation.anomalies.some(a => a.component === 'R3_COMPUTE')).toBe(true);
  });

  it('3. detects missing mitosis provenance (R5 emergence incompatibility)', () => {
    const result = reconciler.reconcile(baseSpec);
    const tamperedChildB = { ...result.childB, provenance: ['genesis'] };
    const tamperedResult = { ...result, childB: tamperedChildB };
    const validation = validator.validateMitosisResult(tamperedResult);
    expect(validation.status).toBe('INCOMPATIBLE');
    expect(validation.anomalies.some(a => a.component === 'R5_EMERGENCE')).toBe(true);
  });

  it('4. detects identical child stateIds (R2 incompatibility)', () => {
    const result = reconciler.reconcile(baseSpec);
    const tamperedResult = { ...result, childB: { ...result.childB, stateId: result.childA.stateId } };
    const validation = validator.validateMitosisResult(tamperedResult);
    expect(validation.status).toBe('INCOMPATIBLE');
    expect(validation.anomalies.some(a => a.component === 'R2_STATE' && a.issue.includes('stateIds'))).toBe(true);
  });

  it('5. detects identical cell identities (R2 incompatibility)', () => {
    const result = reconciler.reconcile(baseSpec);
    const tamperedResult = { ...result, childB: { ...result.childB, cellIdentity: result.childA.cellIdentity } };
    const validation = validator.validateMitosisResult(tamperedResult);
    expect(validation.status).toBe('INCOMPATIBLE');
    expect(validation.anomalies.some(a => a.component === 'R2_STATE' && a.issue.includes('cellIdentities'))).toBe(true);
  });

  it('6. detects child stateId matching parent stateId (R6 incompatibility)', () => {
    const result = reconciler.reconcile(baseSpec);
    const tamperedResult = { ...result, childA: { ...result.childA, stateId: result.parentStateId } };
    const validation = validator.validateMitosisResult(tamperedResult);
    expect(validation.status).toBe('INCOMPATIBLE');
    expect(validation.anomalies.some(a => a.component === 'R6_MITOSIS')).toBe(true);
  });

  it('7. detects missing cognitive continuity structures (R4 incompatibility)', () => {
    const result = reconciler.reconcile(baseSpec);
    const tamperedChildA: any = { ...result.childA };
    delete tamperedChildA.knowledgeState;
    const tamperedResult = { ...result, childA: tamperedChildA };
    const validation = validator.validateMitosisResult(tamperedResult);
    expect(validation.status).toBe('INCOMPATIBLE');
    expect(validation.anomalies.some(a => a.component === 'R4_COGNITIVE')).toBe(true);
  });

  it('8. validates compliant P5 Concept representation', () => {
    const validation = validator.validateP5Representation(validConcept, 'CONCEPT');
    expect(validation.status).toBe('COMPATIBLE');
  });

  it('9. rejects P5 Concept with missing canonicalName', () => {
    const { canonicalName, ...invalidConcept } = validConcept;
    const validation = validator.validateP5Representation(invalidConcept, 'CONCEPT');
    expect(validation.status).toBe('INCOMPATIBLE');
    expect(validation.anomalies.some(a => a.component === 'P5_REPRESENTATION')).toBe(true);
  });

  it('10. rejects P5 Concept with missing originatingCellId', () => {
    const { originatingCellId, ...invalidConcept } = validConcept;
    const validation = validator.validateP5Representation(invalidConcept, 'CONCEPT');
    expect(validation.status).toBe('INCOMPATIBLE');
    expect(validation.anomalies.some(a => a.component === 'P5_REPRESENTATION')).toBe(true);
  });

  it('11. rejects P5 Concept with missing or empty provenance (fail closed)', () => {
    const invalidConcept = { ...validConcept, provenance: [] };
    const validation = validator.validateP5Representation(invalidConcept, 'CONCEPT');
    expect(validation.status).toBe('INCOMPATIBLE');
    expect(validation.anomalies.some(a => a.component === 'P5_REPRESENTATION')).toBe(true);
  });

  it('12. validates compliant P5 Relation representation', () => {
    const validation = validator.validateP5Representation(validRelation, 'RELATION');
    expect(validation.status).toBe('COMPATIBLE');
  });

  it('13. rejects P5 Relation with missing subjectConceptId', () => {
    const { subjectConceptId, ...invalidRelation } = validRelation;
    const validation = validator.validateP5Representation(invalidRelation, 'RELATION');
    expect(validation.status).toBe('INCOMPATIBLE');
    expect(validation.anomalies.some(a => a.component === 'P5_REPRESENTATION')).toBe(true);
  });

  it('14. rejects unknown P5 representation type (fail closed)', () => {
    const validation = validator.validateP5Representation(validConcept, 'UNKNOWN' as any);
    expect(validation.status).toBe('INCOMPATIBLE');
    expect(validation.anomalies.some(a => a.component === 'P5_REPRESENTATION' && a.issue.includes('Unknown'))).toBe(true);
  });
});
