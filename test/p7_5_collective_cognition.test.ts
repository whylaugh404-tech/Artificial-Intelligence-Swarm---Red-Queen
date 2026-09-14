import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { CollectiveCognitionEngine } from '../src/redqueen/cognition/collective/engine';
import { CognitiveRelationPredicate, RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';
import { InformationCategory } from '../src/redqueen/metabolism/types';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

describe('P7.5 - Collective Cognition Engine', () => {
  let cellA: Cell;
  let cellB: Cell;
  let cellC: Cell;
  let collectiveEngine: CollectiveCognitionEngine;

  const storagePathA = join(process.cwd(), '.tmp_test_collective_cell_A');
  const storagePathB = join(process.cwd(), '.tmp_test_collective_cell_B');
  const storagePathC = join(process.cwd(), '.tmp_test_collective_cell_C');

  beforeEach(async () => {
    if (existsSync(storagePathA)) unlinkSync(storagePathA);
    if (existsSync(storagePathB)) unlinkSync(storagePathB);
    if (existsSync(storagePathC)) unlinkSync(storagePathC);

    cellA = new Cell(storagePathA, 'dummy-key');
    cellB = new Cell(storagePathB, 'dummy-key');
    cellC = new Cell(storagePathC, 'dummy-key');

    collectiveEngine = new CollectiveCognitionEngine(cellA);
  });

  afterEach(async () => {
    await cellA.stop();
    await cellB.stop();
    await cellC.stop();
    if (existsSync(storagePathA)) unlinkSync(storagePathA);
    if (existsSync(storagePathB)) unlinkSync(storagePathB);
    if (existsSync(storagePathC)) unlinkSync(storagePathC);
  });

  it('should exchange and synchronize concepts and relations compositionally', async () => {
    // 1. Prepare data in Cell B
    await cellB.cognitiveGraph.insertConcept({
      conceptId: 'concept_b_1',
      canonicalName: 'Collective Behavior',
      description: 'Emergent group behavior',
      category: InformationCategory.AI,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
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
    await cellA.cognitiveGraph.insertConcept({
      conceptId: 'concept_shared_1',
      canonicalName: 'Agent Framework',
      description: 'System for agents',
      category: InformationCategory.AI,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
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
      category: InformationCategory.AI,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
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
      category: InformationCategory.SOFTWARE,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
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
    expect(result.conflictsDetected).toBeGreaterThan(0);

    const relA = cellA.cognitiveGraph.getRelation('rel_a_1');
    const relB = cellA.cognitiveGraph.getRelation('rel_b_1');
    expect(relA).toBeDefined();
    expect(relB).toBeDefined();
  });

  it('should perform semantic composition across multi-cell collective and generate traceable CognitiveUnderstanding', async () => {
    // Cell A has Concept 1
    await cellA.cognitiveGraph.insertConcept({
      conceptId: 'c_cell_a',
      canonicalName: 'Distributed Consensus',
      description: 'State machine replication',
      category: InformationCategory.NETWORKING,
      sourceKnowledgeIds: ['k_a'],
      sourceExperienceIds: [],
      confidence: 0.95,
      provenance: [cellA.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cellA.nodeId,
      metadata: {}
    });

    // Cell B has Concept 2
    await cellB.cognitiveGraph.insertConcept({
      conceptId: 'c_cell_b',
      canonicalName: 'Fault Tolerance',
      description: 'System continues functioning despite partial failures',
      category: InformationCategory.NETWORKING,
      sourceKnowledgeIds: ['k_b'],
      sourceExperienceIds: [],
      confidence: 0.9,
      provenance: [cellB.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cellB.nodeId,
      metadata: {}
    });

    // Cell C has Relation connecting Concept 1 and Concept 2
    await cellC.cognitiveGraph.insertRelation({
      relationId: 'rel_c_enables',
      subjectConceptId: 'c_cell_a',
      predicate: CognitiveRelationPredicate.CAUSES,
      objectConceptId: 'c_cell_b',
      confidence: 0.88,
      provenance: [cellC.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      originatingCellId: cellC.nodeId,
      metadata: {}
    });

    // Synthesize Cell A with [Cell B, Cell C]
    const result = await collectiveEngine.synthesizeWithPeers([cellB, cellC]);

    expect(result.collectiveUnderstanding).toBeDefined();
    expect(result.collectiveUnderstanding?.dependencies.length).toBeGreaterThanOrEqual(3);
    expect(result.contributions[cellB.nodeId].concepts).toContain('c_cell_b');
    expect(result.contributions[cellC.nodeId].relations).toContain('rel_c_enables');

    // Traceability check: Understanding -> Concept in CognitiveGraph -> Evidence / Provenance
    const und = cellA.cognitiveGraph.getUnderstanding(result.collectiveUnderstanding!.understandingId);
    expect(und).toBeDefined();
    expect(und?.dependencies.some(d => d.sourceId === 'c_cell_b')).toBe(true);
    expect(und?.dependencies.some(d => d.sourceId === 'rel_c_enables')).toBe(true);
    expect(und?.provenance).toContain(cellB.nodeId);
    expect(und?.provenance).toContain(cellC.nodeId);

    // Check immutability
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('should generate deterministic collective identity based on semantic inputs', async () => {
    await cellB.cognitiveGraph.insertConcept({
      conceptId: 'concept_det_1',
      canonicalName: 'Deterministic Hash',
      description: 'Strict identity calculation',
      category: InformationCategory.CYBERSECURITY,
      sourceKnowledgeIds: ['k_det'],
      sourceExperienceIds: [],
      confidence: 0.9,
      provenance: [cellB.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cellB.nodeId,
      metadata: {}
    });

    const result1 = await collectiveEngine.synthesizeWithPeers([cellB]);
    expect(result1.collectiveId).toMatch(/^coll_[a-f0-9]{16}$/);

    // Running again with identical semantic inputs produces the exact same collectiveId
    const result2 = await collectiveEngine.synthesizeWithPeers([cellB]);
    expect(result2.collectiveId).toBe(result1.collectiveId);
  });

  it('should select relevant peers based on capability and category criteria', async () => {
    await cellB.cognitiveGraph.insertConcept({
      conceptId: 'c_crypto',
      canonicalName: 'Cryptography',
      description: 'Encryption methods',
      category: InformationCategory.CYBERSECURITY,
      sourceKnowledgeIds: ['k_sec'],
      sourceExperienceIds: [],
      confidence: 0.9,
      provenance: [cellB.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cellB.nodeId,
      metadata: {}
    });

    await cellC.cognitiveGraph.insertConcept({
      conceptId: 'c_hw',
      canonicalName: 'Hardware Security Module',
      description: 'Physical cryptographic hardware',
      category: InformationCategory.HARDWARE,
      sourceKnowledgeIds: ['k_hw'],
      sourceExperienceIds: [],
      confidence: 0.9,
      provenance: [cellC.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cellC.nodeId,
      metadata: {}
    });

    // Select with category filter CYBERSECURITY
    const selected = collectiveEngine.selectRelevantPeers([cellB, cellC], {
      targetCategory: InformationCategory.CYBERSECURITY
    });

    expect(selected.length).toBe(1);
    expect(selected[0].nodeId).toBe(cellB.nodeId);
  });

  it('should handle peer failure or unresponsiveness gracefully without corrupting local state', async () => {
    // Simulate faulty peer that throws on cognitiveGraph access
    const faultyPeer = {
      nodeId: 'faulty_peer_999',
      get cognitiveGraph(): any {
        throw new Error('Network timeout / peer crash');
      }
    } as any;

    const initialConceptsCount = cellA.cognitiveGraph.getAllConcepts().length;

    const result = await collectiveEngine.synthesizeWithPeers([faultyPeer]);

    expect(result.failedPeers).toContain('faulty_peer_999');
    // Local graph remains uncorrupted
    expect(cellA.cognitiveGraph.getAllConcepts().length).toBe(initialConceptsCount);
  });
});
