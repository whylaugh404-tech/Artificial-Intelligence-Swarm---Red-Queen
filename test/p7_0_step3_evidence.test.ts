import { describe, test, expect, beforeEach } from 'vitest';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { MemoryStore, MemoryCategory, MemoryEntry } from '../src/redqueen/memory/store';
import { EvidenceSchema, freezeEvidence, Evidence } from '../src/redqueen/cognition/evidence/types';
import { EpistemicStatus } from '../src/redqueen/cognition/epistemic/types';
import { RepresentationVerificationStatus, CognitiveConcept } from '../src/redqueen/cognition/representation/types';

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

const mockContext = { contextId: 'ctx-1', domain: 'TEST' };

const createValidEvidence = (id: string, sourceId: string): Evidence => {
  const ts = new Date().toISOString();
  return {
    evidenceId: id,
    sourceId,
    timestamp: ts,
    provenance: {
      sourceId,
      timestamp: ts
    },
    context: mockContext
  };
};

describe('P7.0 Step 3: Evidence Identity & Provenance', () => {
  let memory: MockMemoryStore;
  let graph: CognitiveGraph;

  beforeEach(() => {
    memory = new MockMemoryStore();
    graph = new CognitiveGraph('cell-test', memory);
  });

  // 1, 2, 3, 4: Creation and Validation
  test('TEST 1-4: Valid evidence creation and Zod schema validation', () => {
    const valid = createValidEvidence('e-1', 's-1');
    expect(() => EvidenceSchema.parse(valid)).not.toThrow();

    // 2. Evidence ID wajib ada
    const noId = { ...valid, evidenceId: undefined } as any;
    expect(() => EvidenceSchema.parse(noId)).toThrow();

    // 3. Source ID wajib ada
    const noSourceId = { ...valid, sourceId: undefined } as any;
    expect(() => EvidenceSchema.parse(noSourceId)).toThrow();

    // 4. Evidence tanpa provenance ditolak
    const noProv = { ...valid, provenance: undefined } as any;
    expect(() => EvidenceSchema.parse(noProv)).toThrow();
  });

  // 5, 6, 14: Immutability and Context
  test('TEST 5, 6, 14: Evidence, Provenance, and Context are immutable', () => {
    const valid = createValidEvidence('e-2', 's-2');
    const frozen = freezeEvidence(valid);

    // 5. Evidence immutable
    expect(() => { (frozen as any).evidenceId = 'hacked'; }).toThrow();

    // 6. Provenance immutable
    expect(() => { (frozen.provenance as any).sourceId = 'hacked'; }).toThrow();

    // 14. Context tetap terjaga
    expect(frozen.context.domain).toBe('TEST');
    expect(() => { (frozen.context as any).domain = 'hacked'; }).toThrow();
  });

  // 7, 8: Persistence
  test('TEST 7, 8: Evidence persistence and corruption rejection', async () => {
    const valid = createValidEvidence('e-3', 's-3');
    await graph.insertEvidence(valid);

    const reloadedGraph = new CognitiveGraph('cell-test', memory);
    await reloadedGraph.load();

    // 7. Dapat dipersist -> reload
    const reloadedEv = reloadedGraph.getEvidence('e-3');
    expect(reloadedEv).toBeDefined();
    expect(reloadedEv?.sourceId).toBe('s-3');

    // 8. Evidence rusak ditolak
    await memory.put({
      id: 'e-corrupt',
      category: MemoryCategory.SEMANTIC,
      type: 'COGNITIVE_EVIDENCE',
      content: { evidenceId: 'e-corrupt' }, // missing sourceId, etc.
      source: 'test', createdAt: '', updatedAt: '', confidence: 1, hash: 'h', provenance: [], version: 1
    });

    const graph2 = new CognitiveGraph('cell-test', memory);
    await graph2.load();
    expect(graph2.getEvidence('e-corrupt')).toBeUndefined(); // Should be skipped
  });

  // 9: Referenced by Representation
  test('TEST 9: Evidence direferensikan oleh representation', async () => {
    const concept: CognitiveConcept = {
      conceptId: 'c-1',
      canonicalName: 'Test',
      description: 'Desc',
      category: 'GENERAL_TECHNOLOGY' as any,
      sourceKnowledgeIds: ['k-1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-test',
      confidence: 0.9,
      verificationStatus: RepresentationVerificationStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      provenance: ['cell-test'],
      evidenceIds: ['e-1'],
      metadata: {}
    };

    const inserted = await graph.insertConcept(concept);
    expect(inserted.evidenceIds).toContain('e-1');
  });

  // 10, 11: Derived evidence provenance
  test('TEST 10, 11: Derived evidence and source independence', () => {
    const ev1 = createValidEvidence('e-4', 's-4');
    
    // 10. Evidence yang berasal dari evidence lain mempertahankan parent provenance
    const ev2: Evidence = {
      ...createValidEvidence('e-5', 's-4'),
      provenance: {
        sourceId: 's-4',
        timestamp: new Date().toISOString(),
        derivedFrom: ['e-4']
      }
    };
    const frozen = freezeEvidence(ev2);
    expect(frozen.provenance.derivedFrom).toContain('e-4');

    // 11. Dua evidence dari source yang sama TIDAK otomatis dianggap independen.
    // They share the same sourceId 's-4'. Downstream logic can see they are correlated.
    expect(ev1.sourceId).toBe(ev2.sourceId);
  });

  // 12: Backward compatibility
  test('TEST 12: Data P5.1 lama tanpa evidence tetap dapat direload', async () => {
    const legacyConcept: any = {
      conceptId: 'legacy-1',
      canonicalName: 'Legacy',
      description: 'Legacy desc',
      category: 'GENERAL_TECHNOLOGY',
      sourceKnowledgeIds: ['k-1'],
      originatingCellId: 'cell-test',
      confidence: 0.8,
      verificationStatus: 'VERIFIED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      provenance: ['cell-test'],
      metadata: {}
    };

    await memory.put({
      id: 'legacy-1',
      category: MemoryCategory.SEMANTIC,
      type: 'COGNITIVE_CONCEPT',
      content: legacyConcept,
      source: 'test', createdAt: '', updatedAt: '', confidence: 1, hash: 'h', provenance: [], version: 1
    });

    const newGraph = new CognitiveGraph('cell-test', memory);
    await newGraph.load();

    const loaded = newGraph.getAllConcepts().find(c => c.conceptId === 'legacy-1');
    expect(loaded).toBeDefined();
    // It should not hallucinate evidence
    expect(loaded!.evidenceIds).toBeUndefined();
  });

  // 13: Dangling evidence reference check
  test('TEST 13: Cek referensi dangling evidence', async () => {
    const concept: CognitiveConcept = {
      conceptId: 'c-dangling',
      canonicalName: 'Test',
      description: 'Desc',
      category: 'GENERAL_TECHNOLOGY' as any,
      sourceKnowledgeIds: ['k-1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-test',
      confidence: 0.9,
      verificationStatus: RepresentationVerificationStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      provenance: ['cell-test'],
      evidenceIds: ['e-missing'], // Dangling
      metadata: {}
    };

    await graph.insertConcept(concept);
    const loadedConcept = graph.getAllConcepts().find(c => c.conceptId === 'c-dangling');
    
    // Engine/Graph allows the ref, but if we resolve it:
    const resolvedEv = loadedConcept?.evidenceIds?.map(id => graph.getEvidence(id)).filter(e => e !== undefined);
    
    expect(resolvedEv?.length).toBe(0); // Safely handles dangling without crashing
  });
});
