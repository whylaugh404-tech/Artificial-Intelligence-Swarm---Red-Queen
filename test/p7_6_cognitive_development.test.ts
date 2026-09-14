import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { Experience, MetabolismStatus, InformationCategory } from '../src/redqueen/metabolism/types';
import { Context } from '../src/redqueen/cognition/epistemic/types';
import { CognitiveRelationPredicate, RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

describe('P7.6 - Cognitive Development', () => {
  let cell: Cell;
  const storagePath = join(process.cwd(), '.tmp_test_dev_cell');
  
  const dummyContext: Context = {
    contextId: 'ctx_dev',
    domain: 'SYSTEM_TEST',
    confidence: 1.0,
    timestamp: new Date().toISOString()
  };

  beforeEach(async () => {
    if (existsSync(storagePath)) unlinkSync(storagePath);
    cell = new Cell(storagePath, 'dummy-key');
  });

  afterEach(async () => {
    await cell.stop();
    if (existsSync(storagePath)) unlinkSync(storagePath);
  });

  it('should strengthen validated knowledge on positive experience', async () => {
    // 1. Initial Concept
    await cell.cognitiveGraph.insertConcept({
      conceptId: 'concept_dev_1',
      canonicalName: 'Test Automation',
      description: 'System for running tests',
      category: 'SOFTWARE',
      sourceKnowledgeIds: ['k1'],
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
      category: 'SOFTWARE',
      outcome: MetabolismStatus.ASSIMILATED,
      noveltyClassification: 'KNOWN_MATCH',
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
      category: 'SOFTWARE',
      sourceKnowledgeIds: ['k1'],
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
      category: 'SOFTWARE',
      outcome: MetabolismStatus.REJECTED,
      noveltyClassification: 'UNKNOWN',
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
      category: 'SOFTWARE',
      outcome: MetabolismStatus.ACCOMMODATED,
      noveltyClassification: 'NEW_PATTERN',
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
    expect(relTransitions.length).toBe(1); // 1 state transition explicitly recorded for strengthening

    const tr = relTransitions[0];
    expect(tr.reason).toContain('Strengthened');
    expect(tr.trigger).toBe('EVIDENCE_OBSERVED');
  });
});
