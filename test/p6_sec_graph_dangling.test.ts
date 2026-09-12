import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { JsonFileMemoryStore } from '../src/redqueen/memory/store';
import { CognitiveConcept, CognitiveRelation, CognitiveRelationPredicate, RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';
import * as fs from 'fs/promises';

describe('SEC-09: Graph Dangling References', () => {
  const TEST_DIR = './test/.test_graph_dangling_sec';
  let memory: JsonFileMemoryStore;
  let graph: CognitiveGraph;
  const cellId = 'test-cell-dangling';

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

  it('should remove dangling relations when loading', async () => {
    // 1. Manually insert a relation where the concepts don't exist in memory
    const rel: CognitiveRelation = {
      relationId: 'r1',
      subjectConceptId: 'missing-1',
      predicate: CognitiveRelationPredicate.CAUSES,
      objectConceptId: 'missing-2',
      confidence: 1,
      provenance: [cellId],
      verificationStatus: RepresentationVerificationStatus.VERIFIED,
      originatingCellId: cellId,
      metadata: {},
      createdAt: new Date().toISOString()
    };
    
    await memory.put({
      id: 'r1',
      cellId,
      category: 'SEMANTIC' as any,
      type: 'COGNITIVE_RELATION',
      content: rel,
      source: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1,
      hash: '',
      provenance: [cellId],
      version: 1
    });
    
    // 2. Load the graph
    const newGraph = new CognitiveGraph(cellId, memory);
    await newGraph.load();
    
    // 3. The dangling relation should be purged (or at least not loaded)
    const stats = newGraph.getStats();
    expect(stats.relations).toBe(0);
    
    // 4. Memory should NOT contain it anymore (cleaned up)
    const memEntry = await memory.get('r1');
    expect(memEntry).toBeNull();
  });
});
