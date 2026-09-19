import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { Experience, MetabolismStatus, InformationCategory, NoveltyClassification } from '../src/redqueen/metabolism/types';
import { Context } from '../src/redqueen/cognition/epistemic/types';
import { CognitiveRelationPredicate, RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

describe('P7.6 - Cognitive Development', () => {
  let cell: Cell;
  let cellNeighbor: Cell;
  const storagePath = join(process.cwd(), '.tmp_test_dev_cell');
  const storagePathNeighbor = join(process.cwd(), '.tmp_test_dev_neighbor');

  const dummyContext: Context = {
    contextId: 'ctx_dev',
    domain: 'SYSTEM_TEST'
  };

  beforeEach(async () => {
    if (existsSync(storagePath)) unlinkSync(storagePath);
    if (existsSync(storagePathNeighbor)) unlinkSync(storagePathNeighbor);
    cell = new Cell(storagePath, 'dummy-key', undefined, undefined, undefined, { storageSecret: 'test-secret' });
    cellNeighbor = new Cell(storagePathNeighbor, 'dummy-key', undefined, undefined, undefined, { storageSecret: 'test-secret' });
  });

  afterEach(async () => {
    await cell.stop();
    await cellNeighbor.stop();
    if (existsSync(storagePath)) unlinkSync(storagePath);
    if (existsSync(storagePathNeighbor)) unlinkSync(storagePathNeighbor);
  });

  it('should strengthen validated knowledge on positive experience', async () => {
    // 1. Initial Concept
    await cell.cognitiveGraph.insertConcept({
      conceptId: 'concept_dev_1',
      canonicalName: 'Test Automation',
      description: 'System for running tests',
      category: InformationCategory.SOFTWARE,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
      confidence: 0.8,
      provenance: [cell.nodeId],
      verificationStatus: RepresentationVerificationStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cell.nodeId,
      metadata: {}
    });

    const exp: Experience = {
      experienceId: 'exp_pos_1',
      transactionId: 'tx1',
      cellId: cell.nodeId,
      timestamp: new Date().toISOString(),
      informationId: 'info1',
      knowledgeIds: ['k1'],
      category: InformationCategory.SOFTWARE,
      outcome: MetabolismStatus.ACCEPTED,
      noveltyClassification: NoveltyClassification.REINFORCEMENT,
      noveltyScore: 0.1,
      source: 'TEST',
      confidence: 0.9
    };

    // 2. Evaluate Experience
    const result = await cell.cognitiveDevelopment.evaluateExperience(
      exp, 
      dummyContext, 
      ['concept_dev_1'], 
      [], 
      []
    );
    expect(result.conceptsStrengthened).toContain('concept_dev_1');
    
    // 3. Verify concept upgraded
    const concept = cell.cognitiveGraph.getConcept('concept_dev_1');
    expect(concept).toBeDefined();
    expect(concept?.confidence).toBeGreaterThan(0.8);
    expect(concept?.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
    expect(concept?.version).toBe(2);
  });

  it('should weaken contradicted beliefs on negative experience and trigger contradiction', async () => {
    // 1. Initial Concept with low confidence
    await cell.cognitiveGraph.insertConcept({
      conceptId: 'concept_dev_weak',
      canonicalName: 'Flaky Logic',
      description: 'Logic that fails often',
      category: InformationCategory.SOFTWARE,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
      confidence: 0.4,
      provenance: [cell.nodeId],
      verificationStatus: RepresentationVerificationStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cell.nodeId,
      metadata: {}
    });

    const exp: Experience = {
      experienceId: 'exp_neg_1',
      transactionId: 'tx2',
      cellId: cell.nodeId,
      timestamp: new Date().toISOString(),
      informationId: 'info2',
      knowledgeIds: ['k2'],
      category: InformationCategory.SOFTWARE,
      outcome: MetabolismStatus.REJECTED,
      noveltyClassification: NoveltyClassification.CONTRADICTION,
      noveltyScore: 0.8,
      source: 'TEST',
      confidence: 0.9
    };

    // 2. Evaluate Experience
    const result = await cell.cognitiveDevelopment.evaluateExperience(
      exp, 
      dummyContext, 
      ['concept_dev_weak'], 
      [], 
      []
    );
    expect(result.conceptsWeakened).toContain('concept_dev_weak');
    expect(result.conflictsDetected).toBe(1);

    // 3. Verify concept demoted to CONTRADICTED
    const concept = cell.cognitiveGraph.getConcept('concept_dev_weak');
    expect(concept).toBeDefined();
    expect(concept?.confidence).toBeLessThan(0.4);
    expect(concept?.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);
  });

  it('should maintain immutable history via Transition Engine for developmental changes', async () => {
    await cell.cognitiveGraph.insertRelation({
      relationId: 'rel_dev_1',
      subjectConceptId: 'c1',
      predicate: CognitiveRelationPredicate.CAUSES,
      objectConceptId: 'c2',
      confidence: 0.7,
      provenance: [cell.nodeId],
      verificationStatus: RepresentationVerificationStatus.PENDING,
      createdAt: new Date().toISOString(),
      originatingCellId: cell.nodeId,
      metadata: {}
    });

    const exp: Experience = {
      experienceId: 'exp_pos_2',
      transactionId: 'tx3',
      cellId: cell.nodeId,
      timestamp: new Date().toISOString(),
      informationId: 'info3',
      knowledgeIds: ['k3'],
      category: InformationCategory.SOFTWARE,
      outcome: MetabolismStatus.ACCEPTED,
      noveltyClassification: NoveltyClassification.NOVEL,
      noveltyScore: 0.7,
      source: 'TEST',
      confidence: 0.9
    };

    await cell.cognitiveDevelopment.evaluateExperience(
      exp, 
      dummyContext, 
      [], 
      ['rel_dev_1'], 
      []
    );

    // Verify history exists
    const transitions = cell.cognitiveGraph.getAllTransitions();
    const relTransitions = transitions.filter(t => t.targetRepresentationId === 'rel_dev_1');
    expect(relTransitions.length).toBe(1);

    const tr = relTransitions[0];
    expect(tr.reason).toContain('Strengthened');
    expect(tr.trigger).toBe('EVIDENCE_OBSERVED');
  });

  it('should strictly require reason and evidence for belief changes and calculate confidence proportionally', async () => {
    await cell.cognitiveGraph.insertConcept({
      conceptId: 'concept_evidence_req',
      canonicalName: 'Grounded Concept',
      description: 'Concept needing evidence',
      category: InformationCategory.SOFTWARE,
      sourceKnowledgeIds: ['k_req'],
      sourceExperienceIds: [],
      confidence: 0.5,
      provenance: [cell.nodeId],
      verificationStatus: RepresentationVerificationStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cell.nodeId,
      metadata: {}
    });

    // Without evidence -> must throw
    await expect(
      cell.cognitiveDevelopment.strengthenBelief('concept_evidence_req', dummyContext, [], 'Some reason')
    ).rejects.toThrow(/Evidence is required/);

    // Without reason -> must throw
    const dummyEv = {
      evidenceId: 'ev_test_1',
      sourceId: 'src_1',
      timestamp: new Date().toISOString(),
      confidence: 0.95,
      provenance: { sourceId: cell.nodeId, timestamp: new Date().toISOString() },
      context: dummyContext
    };
    await expect(
      cell.cognitiveDevelopment.strengthenBelief('concept_evidence_req', dummyContext, [dummyEv], '')
    ).rejects.toThrow(/Reason is required/);

    // With valid evidence and reason -> succeeds with grounded confidence increase
    const updated = await cell.cognitiveDevelopment.strengthenBelief(
      'concept_evidence_req',
      dummyContext,
      [dummyEv],
      'Direct rigorous validation'
    );
    expect(updated.confidence).toBeGreaterThan(0.5);
    expect(updated.confidence).toBeLessThanOrEqual(1.0);
  });

  it('should support atomic failure rollback and recovery without corrupting state', async () => {
    await cell.cognitiveGraph.insertConcept({
      conceptId: 'concept_atomic',
      canonicalName: 'Atomic Concept',
      description: 'Must remain atomic on failure',
      category: InformationCategory.CYBERSECURITY,
      sourceKnowledgeIds: ['k_atom'],
      sourceExperienceIds: [],
      confidence: 0.65,
      provenance: [cell.nodeId],
      verificationStatus: RepresentationVerificationStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cell.nodeId,
      metadata: {}
    });

    const initialConcept = cell.cognitiveGraph.getConcept('concept_atomic')!;
    const initialTransitions = cell.cognitiveGraph.getTransitionsForRepresentation('concept_atomic');

    // Simulate failure inside atomic execution
    await expect(
      cell.cognitiveGraph.executeAtomicDevelopmentUpdate('concept_atomic', async () => {
        // Mutate concept
        await cell.cognitiveGraph.updateConcept({
          ...initialConcept,
          confidence: 0.99
        });
        // Intentionally throw
        throw new Error('Simulated atomic step failure');
      })
    ).rejects.toThrow('Simulated atomic step failure');

    // State must be completely restored to initial state
    const afterFailed = cell.cognitiveGraph.getConcept('concept_atomic');
    expect(afterFailed?.confidence).toBe(0.65);
    expect(cell.cognitiveGraph.getTransitionsForRepresentation('concept_atomic').length).toBe(
      initialTransitions.length
    );

    // Recovery check
    const recovered = await cell.cognitiveDevelopment.recoverConsistentState('concept_atomic');
    expect(recovered).toBeDefined();
  });

  it('should deterministically replay development history', async () => {
    await cell.cognitiveGraph.insertConcept({
      conceptId: 'concept_replay',
      canonicalName: 'Replay Concept',
      description: 'Concept to replay',
      category: InformationCategory.PROGRAMMING,
      sourceKnowledgeIds: ['k_rep'],
      sourceExperienceIds: [],
      confidence: 0.5,
      provenance: [cell.nodeId],
      verificationStatus: RepresentationVerificationStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cell.nodeId,
      metadata: {}
    });

    const ev1 = {
      evidenceId: 'ev_rep_1',
      sourceId: 'src_rep_1',
      timestamp: new Date().toISOString(),
      confidence: 0.9,
      provenance: { sourceId: cell.nodeId, timestamp: new Date().toISOString() },
      context: dummyContext
    };

    // Apply step 1
    await cell.cognitiveDevelopment.strengthenBelief('concept_replay', dummyContext, [ev1], 'Step 1');

    const ev2 = {
      evidenceId: 'ev_rep_2',
      sourceId: 'src_rep_2',
      timestamp: new Date().toISOString(),
      confidence: 0.9,
      provenance: { sourceId: cell.nodeId, timestamp: new Date().toISOString() },
      context: dummyContext
    };

    // Apply step 2
    await cell.cognitiveDevelopment.strengthenBelief('concept_replay', dummyContext, [ev2], 'Step 2');

    // Replay
    const replayResult = cell.cognitiveDevelopment.replayHistory('concept_replay');
    expect(replayResult.replayedCount).toBe(2);
    expect(replayResult.isDeterministic).toBe(true);
    expect(replayResult.history.length).toBe(2);
  });

  it('should preserve strict Cell isolation during cognitive development', async () => {
    // Seed neighbor cell with concept
    await cellNeighbor.cognitiveGraph.insertConcept({
      conceptId: 'concept_neighbor',
      canonicalName: 'Neighbor Concept',
      description: 'Must not be touched',
      category: InformationCategory.AI,
      sourceKnowledgeIds: ['k_iso'],
      sourceExperienceIds: [],
      confidence: 0.77,
      provenance: [cellNeighbor.nodeId],
      verificationStatus: RepresentationVerificationStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cellNeighbor.nodeId,
      metadata: {}
    });

    // Develop Cell 1
    await cell.cognitiveGraph.insertConcept({
      conceptId: 'concept_cell1',
      canonicalName: 'Local Concept',
      description: 'Local development',
      category: InformationCategory.AI,
      sourceKnowledgeIds: ['k_local'],
      sourceExperienceIds: [],
      confidence: 0.5,
      provenance: [cell.nodeId],
      verificationStatus: RepresentationVerificationStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cell.nodeId,
      metadata: {}
    });

    const ev = {
      evidenceId: 'ev_iso_1',
      sourceId: 'src_iso',
      timestamp: new Date().toISOString(),
      confidence: 0.9,
      provenance: { sourceId: cell.nodeId, timestamp: new Date().toISOString() },
      context: dummyContext
    };

    await cell.cognitiveDevelopment.strengthenBelief('concept_cell1', dummyContext, [ev], 'Local test');

    // Check Neighbor Cell is completely unaffected
    const neighborConcept = cellNeighbor.cognitiveGraph.getConcept('concept_neighbor');
    expect(neighborConcept).toBeDefined();
    expect(neighborConcept?.confidence).toBe(0.77);
    expect(neighborConcept?.version).toBe(1);
    expect(cellNeighbor.cognitiveGraph.getConcept('concept_cell1')).toBeUndefined();
    expect(cellNeighbor.cognitiveGraph.getAllTransitions().length).toBe(0);
  });

  it('strengthenBelief() with all undefined evidence confidence MUST NOT increase confidence', async () => {
    const concept = await cell.cognitiveGraph.executeAtomicDevelopmentUpdate('test_c_1', async () => {
      return cell.cognitiveGraph.insertConcept({
        conceptId: 'test_c_1',
        canonicalName: 'TEST_CONCEPT_1',
        description: 'A test concept',
        category: InformationCategory.UNKNOWN,
        sourceKnowledgeIds: ['k_1'],
        sourceExperienceIds: [],
        originatingCellId: cell.nodeId,
        confidence: 0.1,
        verificationStatus: RepresentationVerificationStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        provenance: ['node_1'],
        metadata: {}
      });
    });

    const evidence = [
      { evidenceId: 'ev_1', confidence: undefined, reason: 'test', type: 'SUPPORTING' },
      { evidenceId: 'ev_2', confidence: undefined, reason: 'test', type: 'SUPPORTING' }
    ] as any;

    const result = await cell.cognitiveDevelopment.strengthenBelief(concept.conceptId, dummyContext, evidence, 'test');
    expect(result.confidence).toBe(0.1);
  });

  it('strengthenRelation() with all undefined evidence confidence MUST NOT increase confidence', async () => {
    const concept1 = await cell.cognitiveGraph.executeAtomicDevelopmentUpdate('test_c_2', async () => {
      return cell.cognitiveGraph.insertConcept({
        conceptId: 'test_c_2',
        canonicalName: 'TEST_CONCEPT_2',
        description: 'A test concept',
        category: InformationCategory.UNKNOWN,
        sourceKnowledgeIds: ['k_1'],
        sourceExperienceIds: [],
        originatingCellId: cell.nodeId,
        confidence: 0.5,
        verificationStatus: RepresentationVerificationStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        provenance: ['node_1'],
        metadata: {}
      });
    });

    const concept2 = await cell.cognitiveGraph.executeAtomicDevelopmentUpdate('test_c_3', async () => {
      return cell.cognitiveGraph.insertConcept({
        conceptId: 'test_c_3',
        canonicalName: 'TEST_CONCEPT_3',
        description: 'A test concept',
        category: InformationCategory.UNKNOWN,
        sourceKnowledgeIds: ['k_1'],
        sourceExperienceIds: [],
        originatingCellId: cell.nodeId,
        confidence: 0.5,
        verificationStatus: RepresentationVerificationStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        provenance: ['node_1'],
        metadata: {}
      });
    });

    const rel = await cell.cognitiveGraph.executeAtomicDevelopmentUpdate('test_r_1', async () => {
      return cell.cognitiveGraph.insertRelation({
        relationId: 'test_r_1',
        subjectConceptId: concept1.conceptId,
        predicate: CognitiveRelationPredicate.CAUSES,
        objectConceptId: concept2.conceptId,
        confidence: 0.1,
        verificationStatus: RepresentationVerificationStatus.PENDING,
        createdAt: new Date().toISOString(),
        originatingCellId: cell.nodeId,
        provenance: ['node_1'],
        metadata: {}
      });
    });

    const evidence = [
      { evidenceId: 'ev_3', confidence: undefined, reason: 'test', type: 'SUPPORTING' },
      { evidenceId: 'ev_4', confidence: undefined, reason: 'test', type: 'SUPPORTING' }
    ] as any;

    const result = await cell.cognitiveDevelopment.strengthenRelation(rel.relationId, dummyContext, evidence, 'test');
    expect(result.confidence).toBe(0.1);
  });
});
