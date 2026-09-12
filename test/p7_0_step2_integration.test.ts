import { describe, test, expect, beforeEach } from 'vitest';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { MemoryStore, MemoryCategory, MemoryEntry } from '../src/redqueen/memory/store';
import { CognitiveRepresentationEngine } from '../src/redqueen/cognition/representation/engine';
import { EpistemicStatus } from '../src/redqueen/cognition/epistemic/types';
import { EpistemicAdapter } from '../src/redqueen/cognition/epistemic/adapter';
import { RepresentationVerificationStatus, CognitiveConcept } from '../src/redqueen/cognition/representation/types';
import { InformationCategory } from '../src/redqueen/metabolism/types';

class MockMemoryStore implements MemoryStore {
  public data = new Map<string, MemoryEntry>();
  async initialize() {}
  async put(entry: MemoryEntry) { this.data.set(entry.id, entry); }
  async get(id: string) { return this.data.get(id) || null; }
  async search(query: any) { 
    return Array.from(this.data.values()).filter(e => (!query.category || e.category === query.category));
  }
  async delete(id: string) { this.data.delete(id); return true; }
  async remove(id: string) { this.data.delete(id); }
  async clear() { this.data.clear(); }
  getStats() { return { total: 0, episodic: 0, semantic: 0, procedural: 0 }; }
}

const mockKnowledge = (id: string, title: string) => ({
  knowledgeId: id,
  owningCellId: 'cell-test',
  title,
  summary: '',
  category: InformationCategory.GENERAL_TECHNOLOGY,
  confidence: 0.8,
  facts: [],
  relationships: [],
  contradictions: [],
  structuredContent: {},
  sourceIdentifiers: [],
  sourceProvenance: [],
  reinforcementCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: 1
} as any);

describe('P7.0 Step 2: EpistemicState Integration with P5.1 Representations', () => {
  let memory: MockMemoryStore;
  let graph: CognitiveGraph;
  let engine: CognitiveRepresentationEngine;

  beforeEach(() => {
    memory = new MockMemoryStore();
    graph = new CognitiveGraph('cell-test', memory);
    engine = new CognitiveRepresentationEngine('cell-test');
  });

  // TEST 1, 2, 3, 5, 9, 10
  test('TEST 1, 2, 3, 5, 9, 10: Representations carry valid epistemic states', async () => {
    const rep = await engine.extractRepresentations({
      ...mockKnowledge('k-1', 'Test Concept'),
      facts: ['a is b', 'b is c']
    });

    expect(rep.concepts.length).toBeGreaterThan(0);
    const concept = rep.concepts[0];
    
    // Check epistemic reference
    expect(concept.epistemicStateId).toBeDefined();

    const es = rep.epistemicStates.find(e => e.stateId === concept.epistemicStateId);
    expect(es).toBeDefined();

    // TEST 3: rawConfidence preserved
    expect(es!.rawConfidence).toBe(concept.confidence);
    
    // Because there's no fabricated opinion for basic scalar
    expect(es!.opinion).toBeUndefined();

    // TEST 5: SUPPORTED -> BELIEVED
    expect(concept.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
    expect(es!.status).toBe(EpistemicStatus.BELIEVED);
    
    // TEST 9, 10: Context domain and immutable
    expect(es!.context.domain).toBe(InformationCategory.GENERAL_TECHNOLOGY);
    expect(() => { (es!.context as any).domain = 'HACKED'; }).toThrowError();
  });

  test('TEST 4: Confidence 0.99 does not automatically mean VERIFIED', async () => {
    const rep = await engine.extractRepresentations({
      ...mockKnowledge('k-2', 'High Confidence Concept'),
      confidence: 0.99,
      facts: ['x is y']
    });

    const concept = rep.concepts[0];
    const es = rep.epistemicStates.find(e => e.stateId === concept.epistemicStateId);
    
    // Engine uses SUPPORTED for standard extraction
    expect(es!.status).toBe(EpistemicStatus.BELIEVED);
    expect(es!.status).not.toBe(EpistemicStatus.VERIFIED);
  });

  test('TEST 11 & 12: Persistence reload and no dangling reference', async () => {
    const rep = await engine.extractRepresentations({
      ...mockKnowledge('k-3', 'Persistent Concept'),
      facts: ['p is q']
    });

    for (const c of rep.concepts) await graph.insertConcept(c);
    for (const e of rep.epistemicStates) await graph.insertEpistemicState(e);

    const newGraph = new CognitiveGraph('cell-test', memory);
    await newGraph.load();

    const loadedConcept = newGraph.getAllConcepts()[0];
    expect(loadedConcept).toBeDefined();
    expect(loadedConcept.epistemicStateId).toBeDefined();

    const loadedEs = newGraph.getEpistemicState(loadedConcept.epistemicStateId!);
    expect(loadedEs).toBeDefined(); // No dangling reference
    expect(loadedEs!.status).toBe(EpistemicStatus.BELIEVED);
  });

  test('TEST 14 & 15: Backward compatible legacy data', async () => {
    // Inject legacy concept directly to memory
    const legacyConcept: CognitiveConcept = {
      conceptId: 'legacy-1',
      canonicalName: 'Legacy Concept',
      description: 'Legacy description',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      sourceKnowledgeIds: ['k-legacy'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-test',
      confidence: 0.7,
      verificationStatus: RepresentationVerificationStatus.VERIFIED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      provenance: ['cell-test'],
      metadata: {}
    };

    await memory.put({
      id: legacyConcept.conceptId,
      category: MemoryCategory.SEMANTIC,
      type: 'COGNITIVE_CONCEPT',
      content: legacyConcept,
      source: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1,
      provenance: [],
      version: 1,
      hash: 'test-hash'
    });

    const newGraph = new CognitiveGraph('cell-test', memory);
    await newGraph.load();

    const loaded = newGraph.getAllConcepts().find(c => c.conceptId === 'legacy-1');
    expect(loaded).toBeDefined();
    expect(loaded!.epistemicStateId).toBeUndefined(); // Safe backwards compat
    expect(loaded!.confidence).toBe(0.7); // Remains untouched
  });

  test('TEST 16 & 17: Conflict preserves epistemic synchronization', async () => {
    const repA = await engine.extractRepresentations({
      ...mockKnowledge('k-a', 'Concept A'),
      facts: ['a']
    });
    const repB = await engine.extractRepresentations({
      ...mockKnowledge('k-b', 'Concept A'),
      facts: ['b']
    });
    // Manually ensure they don't merge by changing name or bypassing detect
    // Actually, preserveConflict takes ID
    for (const c of repA.concepts) await graph.insertConcept(c);
    for (const c of repB.concepts) { c.canonicalName = 'Concept B'; await graph.insertConcept(c); }
    for (const e of repA.epistemicStates) await graph.insertEpistemicState(e);
    for (const e of repB.epistemicStates) await graph.insertEpistemicState(e);

    const c1 = repA.concepts[0];
    const c2 = repB.concepts[0];

    await graph.preserveConflict(c1.conceptId, c2.conceptId, 'Contradicting facts');

    const updatedC1 = graph.getAllConcepts().find(c => c.conceptId === c1.conceptId);
    expect(updatedC1!.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);

    const updatedEs1 = graph.getEpistemicState(updatedC1!.epistemicStateId!);
    expect(updatedEs1!.status).toBe(EpistemicStatus.CONTRADICTED);
    expect(updatedEs1!.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);
  });
});

  test('TEST 7 & 8: Explicit VERIFIED and CONTRADICTED mapping', () => {
    const esVerified = EpistemicAdapter.fromP5(0.9, RepresentationVerificationStatus.VERIFIED, { contextId: 'x', domain: InformationCategory.GENERAL_TECHNOLOGY });
    expect(esVerified.status).toBe(EpistemicStatus.VERIFIED);
    
    const esContradicted = EpistemicAdapter.fromP5(0.1, RepresentationVerificationStatus.CONTRADICTED, { contextId: 'x', domain: InformationCategory.GENERAL_TECHNOLOGY });
    expect(esContradicted.status).toBe(EpistemicStatus.CONTRADICTED);
  });
