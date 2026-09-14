import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { CollectiveCognitionEngine } from '../src/redqueen/cognition/collective/engine';
import { CognitiveRelationPredicate, RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

describe('P7.5 - Collective Cognition Engine', () => {
  let cellA: Cell;
  let cellB: Cell;
  let collectiveEngine: CollectiveCognitionEngine;
  
  const storagePathA = join(process.cwd(), '.tmp_test_collective_cell_A');
  const storagePathB = join(process.cwd(), '.tmp_test_collective_cell_B');

  beforeEach(async () => {
    if (existsSync(storagePathA)) unlinkSync(storagePathA);
    if (existsSync(storagePathB)) unlinkSync(storagePathB);

    cellA = new Cell(storagePathA, 'dummy-key');
    cellB = new Cell(storagePathB, 'dummy-key');

    collectiveEngine = new CollectiveCognitionEngine(cellA);
  });

  afterEach(async () => {
    await cellA.stop();
    await cellB.stop();
    if (existsSync(storagePathA)) unlinkSync(storagePathA);
    if (existsSync(storagePathB)) unlinkSync(storagePathB);
  });

  it('should exchange and synchronize concepts and relations compositionally', async () => {
    // 1. Prepare data in Cell B
    await cellB.cognitiveGraph.insertConcept({
      conceptId: 'concept_b_1',
      canonicalName: 'Collective Behavior',
      description: 'Emergent group behavior',
      category: 'AI',
      sourceKnowledgeIds: ['k1'],
      confidence: 1.0,
      provenance: [cellB.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cellB.nodeId,
      metadata: {}
    });

    // 2. Run synthesize
    const result = await collectiveEngine.synthesizeWithPeers([cellB]);
    expect(result.syncedConcepts).toBeGreaterThan(0);
    expect(result.provenanceCells).toContain(cellB.nodeId);

    // 3. Verify Cell A acquired the concept with provenance updated
    const acquired = cellA.cognitiveGraph.getConcept('concept_b_1');
    expect(acquired).toBeDefined();
    if (acquired) {
      expect(acquired.provenance).toContain(cellB.nodeId);
    }
  });

  it('should detect and attempt to resolve conflicts using existing VerificationEngine', async () => {
    // Shared concept
    await cellA.cognitiveGraph.insertConcept({
      conceptId: 'concept_shared_1',
      canonicalName: 'Agent Framework',
      description: 'System for agents',
      category: 'AI',
      sourceKnowledgeIds: ['k1'],
      confidence: 1.0,
      provenance: [cellA.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cellA.nodeId,
      metadata: {}
    });

    await cellB.cognitiveGraph.insertConcept({
      conceptId: 'concept_shared_1',
      canonicalName: 'Agent Framework',
      description: 'System for agents',
      category: 'AI',
      sourceKnowledgeIds: ['k1'],
      confidence: 1.0,
      provenance: [cellB.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cellB.nodeId,
      metadata: {}
    });

    await cellA.cognitiveGraph.insertConcept({
      conceptId: 'concept_shared_2',
      canonicalName: 'Rigid Design',
      description: 'Fixed structure',
      category: 'SOFTWARE',
      sourceKnowledgeIds: ['k1'],
      confidence: 1.0,
      provenance: [cellA.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cellA.nodeId,
      metadata: {}
    });

    // Cell A believes Agent Framework REQUIRES Rigid Design
    await cellA.cognitiveGraph.insertRelation({
      relationId: 'rel_a_1',
      subjectConceptId: 'concept_shared_1',
      predicate: CognitiveRelationPredicate.REQUIRES,
      objectConceptId: 'concept_shared_2',
      confidence: 0.9,
      provenance: [cellA.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      originatingCellId: cellA.nodeId,
      metadata: {}
    });

    // Cell B believes Agent Framework CONTRADICTS Rigid Design (conflict)
    await cellB.cognitiveGraph.insertRelation({
      relationId: 'rel_b_1',
      subjectConceptId: 'concept_shared_1',
      predicate: CognitiveRelationPredicate.CONTRADICTS,
      objectConceptId: 'concept_shared_2',
      confidence: 0.8,
      provenance: [cellB.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      originatingCellId: cellB.nodeId,
      metadata: {}
    });

    const result = await collectiveEngine.synthesizeWithPeers([cellB]);
    
    // We expect the conflict to be detected.
    // It may be resolved or unresolved depending on VerificationEngine's internal logic
    // (since scoreA = 0.9 and scoreB = 0.8, difference is 0.1, which is < 1.0, so it will be UNRESOLVED).
    expect(result.conflictsDetected).toBeGreaterThan(0);
    
    // Both relations should be in cell A now
    const relA = cellA.cognitiveGraph.getRelation('rel_a_1');
    const relB = cellA.cognitiveGraph.getRelation('rel_b_1');
    expect(relA).toBeDefined();
    expect(relB).toBeDefined();
  });
});
