import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { JsonFileMemoryStore } from '../src/redqueen/memory/store';
import { CognitiveConcept, CognitiveRelation, CognitiveRelationPredicate, RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';
import * as fs from 'fs/promises';

describe('SEC-07: Graph Persistence Rollback Consistency', () => {
  const TEST_DIR = './test/.test_graph_tx_sec';
  let memory: JsonFileMemoryStore;
  let graph: CognitiveGraph;
  const cellId = 'test-cell-graph-tx';

  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    memory = new JsonFileMemoryStore(`${TEST_DIR}/memory.json`, cellId);
    await memory.initialize();
    graph = new CognitiveGraph(cellId, memory);
    await graph.load();
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should successfully commit a valid transaction', async () => {
    graph.beginTransaction();
    
    const conceptA: CognitiveConcept = {
      conceptId: 'c1',
      canonicalName: 'Test Concept A',
      description: 'Test description',
      category: 'UNKNOWN' as any,
      confidence: 1,
      provenance: [cellId],
      verificationStatus: RepresentationVerificationStatus.VERIFIED,
      originatingCellId: cellId,
      sourceKnowledgeIds: ['k1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };
    
    try {
      await graph.insertConcept(conceptA);
      await graph.commitTransaction();
    } catch(err) {
      graph.rollbackTransaction();
      throw err;
    }
    
    const stats = graph.getStats();
    expect(stats.concepts).toBe(1);
    
    // Check it's on disk
    const diskMem = await memory.get('c1');
    expect(diskMem).toBeDefined();
    expect(diskMem?.type).toBe('COGNITIVE_CONCEPT');
  });

  it('should rollback in-memory and disk on failed transaction', async () => {
    graph.beginTransaction();
    
    const conceptB: CognitiveConcept = {
      conceptId: 'c2',
      canonicalName: 'Test Concept B',
      description: 'Test desc',
      category: 'UNKNOWN' as any,
      confidence: 1,
      provenance: [cellId],
      verificationStatus: RepresentationVerificationStatus.VERIFIED,
      originatingCellId: cellId,
      sourceKnowledgeIds: ['k1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };
    
    await graph.insertConcept(conceptB);
    
    // Create an invalid relation (self loop) which throws error in insertRelation
    const relation: CognitiveRelation = {
      relationId: 'r1',
      subjectConceptId: 'c2',
      predicate: CognitiveRelationPredicate.CAUSES,
      objectConceptId: 'c2', // self loop!
      confidence: 1,
      provenance: [cellId],
      verificationStatus: RepresentationVerificationStatus.VERIFIED,
      originatingCellId: cellId,
      sourceKnowledgeIds: ['k1'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };
    
    try {
      await graph.insertRelation(relation);
      await graph.commitTransaction(); // Will not reach here if insertRelation throws
    } catch(err) {
      graph.rollbackTransaction();
    }
    
    // The concept c2 should NOT be in the graph maps!
    const stats = graph.getStats();
    expect(stats.concepts).toBe(1); // Only c1 should be there
    expect(stats.relations).toBe(0);
    
    // And it should not be in memory store because we didn't commit
    const diskMem = await memory.get('c2');
    expect(diskMem).toBeNull();
  });
});
