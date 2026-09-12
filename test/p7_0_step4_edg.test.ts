import { describe, test, expect, beforeEach } from 'vitest';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { MemoryStore, MemoryCategory, MemoryEntry } from '../src/redqueen/memory/store';
import {
  Evidence,
  EvidenceDependency,
  EvidenceDependencySchema,
  EvidenceDependencyType,
  freezeEvidenceDependency
} from '../src/redqueen/cognition/evidence/types';
import { EvidenceDependencyGraph } from '../src/redqueen/cognition/evidence/graph';

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

const mockContext = { contextId: 'ctx-edg', domain: 'CYBER_INTEL' };

const createTestEvidence = (
  id: string,
  sourceId: string,
  observationId?: string,
  derivedFrom?: string[],
  supportingReps?: string[]
): Evidence => {
  const ts = new Date().toISOString();
  return {
    evidenceId: id,
    sourceId,
    observationId,
    timestamp: ts,
    provenance: {
      sourceId,
      observationId,
      timestamp: ts,
      derivedFrom,
      supportingRepresentationIds: supportingReps
    },
    context: mockContext
  };
};

describe('P7.0 Step 4: Evidence Dependency Graph (EDG)', () => {
  let memory: MockMemoryStore;
  let graph: CognitiveGraph;
  let edg: EvidenceDependencyGraph;

  beforeEach(() => {
    memory = new MockMemoryStore();
    graph = new CognitiveGraph('cell-alpha', memory);
    edg = new EvidenceDependencyGraph();
  });

  // 1. Membuat dependency valid
  test('TEST 1: Membuat dependency valid', () => {
    const validDep: EvidenceDependency = {
      dependencyId: 'dep-1',
      evidenceIdA: 'ev-1',
      evidenceIdB: 'ev-2',
      type: EvidenceDependencyType.INDEPENDENT,
      basis: 'Distinct sources and observations',
      confidence: 0.95,
      provenance: ['edg'],
      createdAt: new Date().toISOString()
    };

    expect(() => EvidenceDependencySchema.parse(validDep)).not.toThrow();
  });

  // 2. Schema validation
  test('TEST 2: Schema validation menolak data tidak lengkap atau salah tipe', () => {
    // Missing dependencyId
    expect(() =>
      EvidenceDependencySchema.parse({
        evidenceIdA: 'ev-1',
        evidenceIdB: 'ev-2',
        type: EvidenceDependencyType.INDEPENDENT,
        basis: 'basis',
        provenance: ['edg'],
        createdAt: new Date().toISOString()
      })
    ).toThrow();

    // Invalid type enum
    expect(() =>
      EvidenceDependencySchema.parse({
        dependencyId: 'dep-invalid-type',
        evidenceIdA: 'ev-1',
        evidenceIdB: 'ev-2',
        type: 'CIRCULAR_DEPENDENCY' as any,
        basis: 'basis',
        provenance: ['edg'],
        createdAt: new Date().toISOString()
      })
    ).toThrow();

    // Invalid confidence (> 1)
    expect(() =>
      EvidenceDependencySchema.parse({
        dependencyId: 'dep-bad-conf',
        evidenceIdA: 'ev-1',
        evidenceIdB: 'ev-2',
        type: EvidenceDependencyType.CORRELATED,
        basis: 'basis',
        confidence: 1.5,
        provenance: ['edg'],
        createdAt: new Date().toISOString()
      })
    ).toThrow();

    // Missing basis
    expect(() =>
      EvidenceDependencySchema.parse({
        dependencyId: 'dep-no-basis',
        evidenceIdA: 'ev-1',
        evidenceIdB: 'ev-2',
        type: EvidenceDependencyType.UNKNOWN,
        basis: '',
        provenance: ['edg'],
        createdAt: new Date().toISOString()
      })
    ).toThrow();
  });

  // 3. Immutable dependency
  test('TEST 3: Immutable dependency', () => {
    const dep: EvidenceDependency = {
      dependencyId: 'dep-imm',
      evidenceIdA: 'ev-1',
      evidenceIdB: 'ev-2',
      type: EvidenceDependencyType.DEPENDENT,
      basis: 'Direct derivation',
      provenance: ['edg'],
      createdAt: new Date().toISOString()
    };

    const frozen = freezeEvidenceDependency(dep);

    expect(() => {
      (frozen as any).type = EvidenceDependencyType.INDEPENDENT;
    }).toThrow();

    expect(() => {
      (frozen.provenance as any).push('tamper');
    }).toThrow();
  });

  // 4. DEPENDENT detection
  test('TEST 4: DEPENDENT detection (direct and reverse derivation)', () => {
    const ev1 = createTestEvidence('ev-parent', 'source-A', 'obs-1');
    const ev2 = createTestEvidence('ev-child', 'source-A', 'obs-2', ['ev-parent']);

    const dep1 = edg.determineDependency(ev1, ev2);
    expect(dep1.type).toBe(EvidenceDependencyType.DEPENDENT);
    expect(dep1.basis).toContain('directly derived');

    // Reverse order check
    const dep2 = edg.determineDependency(ev2, ev1);
    expect(dep2.type).toBe(EvidenceDependencyType.DEPENDENT);
  });

  // 5. CORRELATED detection
  test('TEST 5: CORRELATED detection (shared observation, shared representation, shared ancestor)', () => {
    // 5A: Shared observation from distinct sources
    const evA = createTestEvidence('ev-a', 'source-sensor-1', 'obs-earthquake');
    const evB = createTestEvidence('ev-b', 'source-sensor-2', 'obs-earthquake');
    const resA = edg.determineDependency(evA, evB);
    expect(resA.type).toBe(EvidenceDependencyType.CORRELATED);
    expect(resA.basis).toContain('Shared observation ID');

    // 5B: Shared targeted representation in provenance
    const evC = createTestEvidence('ev-c', 'source-analyst-1', undefined, undefined, ['concept-malware-x']);
    const evD = createTestEvidence('ev-d', 'source-analyst-2', undefined, undefined, ['concept-malware-x']);
    const resB = edg.determineDependency(evC, evD);
    expect(resB.type).toBe(EvidenceDependencyType.CORRELATED);
    expect(resB.basis).toContain('Shared targeted cognitive representation');

    // 5C: Shared ancestor derivation
    const evE = createTestEvidence('ev-e', 'source-3', 'obs-e', ['root-ev']);
    const evF = createTestEvidence('ev-f', 'source-4', 'obs-f', ['root-ev']);
    const resC = edg.determineDependency(evE, evF);
    expect(resC.type).toBe(EvidenceDependencyType.CORRELATED);
    expect(resC.basis).toContain('common derivation ancestor');
  });

  // 6. INDEPENDENT detection
  test('TEST 6: INDEPENDENT detection across distinct sources & distinct observations', () => {
    const ev1 = createTestEvidence('ev-sat-1', 'source-satellite-alpha', 'obs-region-1');
    const ev2 = createTestEvidence('ev-ground-2', 'source-radar-beta', 'obs-region-2');

    const result = edg.determineDependency(ev1, ev2);
    expect(result.type).toBe(EvidenceDependencyType.INDEPENDENT);
    expect(result.basis).toContain('Distinct sources');
  });

  // 7. UNKNOWN ketika informasi tidak cukup
  test('TEST 7: UNKNOWN ketika informasi tidak cukup', () => {
    // Observations missing, no provenance linkage
    const ev1 = createTestEvidence('ev-sparse-1', 'source-x');
    const ev2 = createTestEvidence('ev-sparse-2', 'source-y');

    const result = edg.determineDependency(ev1, ev2);
    expect(result.type).toBe(EvidenceDependencyType.UNKNOWN);
    expect(result.basis).toContain('Insufficient');
  });

  // 8. derived evidence → DEPENDENT
  test('TEST 8: derived evidence menghasilkan DEPENDENT', () => {
    const parent = createTestEvidence('ev-raw-feed', 'source-rss', 'obs-raw');
    const child = createTestEvidence('ev-extracted-feed', 'cell-alpha', 'obs-summary', ['ev-raw-feed']);

    const dep = edg.determineDependency(parent, child);
    expect(dep.type).toBe(EvidenceDependencyType.DEPENDENT);
  });

  // 9. dependency tidak boleh menunjuk Evidence yang tidak ada
  test('TEST 9: dependency tidak boleh menunjuk Evidence yang tidak ada', async () => {
    const evReal = createTestEvidence('ev-real', 'src-1', 'obs-1');
    await graph.insertEvidence(evReal);

    const danglingDep: EvidenceDependency = {
      dependencyId: 'dep-dangling',
      evidenceIdA: 'ev-real',
      evidenceIdB: 'ev-ghost',
      type: EvidenceDependencyType.INDEPENDENT,
      basis: 'Invalid ref',
      provenance: ['edg'],
      createdAt: new Date().toISOString()
    };

    await expect(graph.insertDependency(danglingDep)).rejects.toThrow(
      /does not exist in graph/
    );
  });

  // 10. duplicate dependency tidak membuat record ganda
  test('TEST 10: duplicate dependency tidak membuat record ganda', async () => {
    const ev1 = createTestEvidence('ev-10a', 'source-1', 'obs-1');
    const ev2 = createTestEvidence('ev-10b', 'source-2', 'obs-2');
    await graph.insertEvidence(ev1);
    await graph.insertEvidence(ev2);

    const depCandidate: EvidenceDependency = {
      dependencyId: 'dep-dup-test',
      evidenceIdA: 'ev-10a',
      evidenceIdB: 'ev-10b',
      type: EvidenceDependencyType.INDEPENDENT,
      basis: 'Independent pair',
      provenance: ['edg'],
      createdAt: new Date().toISOString()
    };

    // First insertion
    await graph.insertDependency(depCandidate);
    expect(graph.getDependencies().length).toBe(1);

    // Second insertion (duplicate ID or duplicate pair)
    await graph.insertDependency(depCandidate);
    expect(graph.getDependencies().length).toBe(1);

    // Another dependency targeting the same pair with different ID
    const depCandidate2: EvidenceDependency = {
      dependencyId: 'dep-dup-test-2',
      evidenceIdA: 'ev-10b',
      evidenceIdB: 'ev-10a',
      type: EvidenceDependencyType.INDEPENDENT,
      basis: 'Reverse pair duplicate',
      provenance: ['edg'],
      createdAt: new Date().toISOString()
    };

    await graph.insertDependency(depCandidate2);
    expect(graph.getDependencies().length).toBe(1);
  });

  // 11. Persistence
  test('TEST 11: Dependency dapat dipersist ke MemoryStore', async () => {
    const ev1 = createTestEvidence('ev-p1', 'src-p1', 'obs-p1');
    const ev2 = createTestEvidence('ev-p2', 'src-p2', 'obs-p2');
    await graph.insertEvidence(ev1);
    await graph.insertEvidence(ev2);

    const dep: EvidenceDependency = {
      dependencyId: 'dep-persist-1',
      evidenceIdA: 'ev-p1',
      evidenceIdB: 'ev-p2',
      type: EvidenceDependencyType.INDEPENDENT,
      basis: 'Persisted test',
      provenance: ['edg'],
      createdAt: new Date().toISOString()
    };

    await graph.insertDependency(dep);

    const memoryEntry = await memory.get('dep-persist-1');
    expect(memoryEntry).not.toBeNull();
    expect(memoryEntry?.type).toBe('EVIDENCE_DEPENDENCY');
    expect(memoryEntry?.content.dependencyId).toBe('dep-persist-1');
  });

  // 12. Reload
  test('TEST 12: Reload menghasilkan graph yang sama', async () => {
    const ev1 = createTestEvidence('ev-r1', 'src-r1', 'obs-r1');
    const ev2 = createTestEvidence('ev-r2', 'src-r2', 'obs-r2');
    await graph.insertEvidence(ev1);
    await graph.insertEvidence(ev2);

    const dep: EvidenceDependency = {
      dependencyId: 'dep-reload-1',
      evidenceIdA: 'ev-r1',
      evidenceIdB: 'ev-r2',
      type: EvidenceDependencyType.INDEPENDENT,
      basis: 'Reload test',
      confidence: 0.9,
      provenance: ['edg'],
      createdAt: new Date().toISOString()
    };
    await graph.insertDependency(dep);

    // Create a new fresh CognitiveGraph and load
    const reloadedGraph = new CognitiveGraph('cell-alpha', memory);
    await reloadedGraph.load();

    expect(reloadedGraph.getDependencies().length).toBe(1);
    const loadedDep = reloadedGraph.getDependency('dep-reload-1');
    expect(loadedDep).toBeDefined();
    expect(loadedDep?.evidenceIdA).toBe('ev-r1');
    expect(loadedDep?.evidenceIdB).toBe('ev-r2');
    expect(loadedDep?.type).toBe(EvidenceDependencyType.INDEPENDENT);

    // Test getDependencyBetween
    const between = reloadedGraph.getDependencyBetween('ev-r1', 'ev-r2');
    expect(between).toBeDefined();
    expect(between?.dependencyId).toBe('dep-reload-1');

    // Test reverse lookup in getDependencyBetween
    const betweenRev = reloadedGraph.getDependencyBetween('ev-r2', 'ev-r1');
    expect(betweenRev).toBeDefined();
    expect(betweenRev?.dependencyId).toBe('dep-reload-1');

    // Test getDependenciesForEvidence
    const forEv = reloadedGraph.getDependenciesForEvidence('ev-r1');
    expect(forEv.length).toBe(1);
  });

  // 13. Malformed dependency ditolak
  test('TEST 13: Malformed dependency ditolak', async () => {
    const ev1 = createTestEvidence('ev-m1', 'src-m1');
    const ev2 = createTestEvidence('ev-m2', 'src-m2');
    await graph.insertEvidence(ev1);
    await graph.insertEvidence(ev2);

    const malformed = {
      dependencyId: 'bad-dep',
      evidenceIdA: 'ev-m1',
      evidenceIdB: 'ev-m2',
      type: 'INVALID_STATUS',
      basis: 12345 // bad type
    } as any;

    await expect(graph.insertDependency(malformed)).rejects.toThrow();
  });

  // 14. Backward compatibility dengan Evidence Step 3
  test('TEST 14: Backward compatibility dengan Evidence Step 3', async () => {
    // Insert step 3 evidence directly into memory
    const step3Evidence = {
      evidenceId: 'ev-step3',
      sourceId: 'source-step3',
      observationId: 'obs-step3',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'source-step3',
        timestamp: new Date().toISOString()
      },
      context: mockContext
    };

    await memory.put({
      id: 'ev-step3',
      cellId: 'cell-alpha',
      category: MemoryCategory.SEMANTIC,
      type: 'COGNITIVE_EVIDENCE',
      content: step3Evidence,
      source: 'cognitive_graph',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1.0,
      hash: '',
      provenance: [],
      version: 1
    });

    const newGraph = new CognitiveGraph('cell-alpha', memory);
    await newGraph.load();

    const loaded = newGraph.getEvidence('ev-step3');
    expect(loaded).toBeDefined();
    expect(loaded?.sourceId).toBe('source-step3');
    // EDG should work seamlessly with legacy evidence
    expect(newGraph.getDependencies().length).toBe(0);
  });

  // 15. Minimal stress test ±100 dependency records
  test('TEST 15: Minimal stress test ±100 dependency records', async () => {
    const N = 105;
    const start = Date.now();

    // Create 106 evidence items
    for (let i = 0; i <= N; i++) {
      const ev = createTestEvidence(`ev-stress-${i}`, `source-stress-${i % 10}`, `obs-stress-${i}`);
      await graph.insertEvidence(ev);
    }

    // Create 100 dependency records connecting consecutive pairs
    for (let i = 0; i < 100; i++) {
      const dep: EvidenceDependency = {
        dependencyId: `dep-stress-${i}`,
        evidenceIdA: `ev-stress-${i}`,
        evidenceIdB: `ev-stress-${i + 1}`,
        type: i % 2 === 0 ? EvidenceDependencyType.INDEPENDENT : EvidenceDependencyType.CORRELATED,
        basis: `Stress test edge ${i}`,
        confidence: 0.8,
        provenance: ['edg_stress'],
        createdAt: new Date().toISOString()
      };
      await graph.insertDependency(dep);
    }

    const duration = Date.now() - start;
    expect(graph.getDependencies().length).toBe(100);
    expect(graph.getStats().dependencies).toBe(100);
    expect(duration).toBeLessThan(2500);

    // Verify lookup of 50th dependency
    const dep50 = graph.getDependency('dep-stress-50');
    expect(dep50).toBeDefined();
    expect(dep50?.evidenceIdA).toBe('ev-stress-50');
    expect(dep50?.evidenceIdB).toBe('ev-stress-51');

    // Verify between lookup
    const between = graph.getDependencyBetween('ev-stress-50', 'ev-stress-51');
    expect(between?.dependencyId).toBe('dep-stress-50');
  });

  // 16. Deterministic result untuk input yang sama
  test('TEST 16: Deterministic result untuk input yang sama', () => {
    const ev1 = createTestEvidence('ev-det-1', 'src-satellite', 'obs-det-1');
    const ev2 = createTestEvidence('ev-det-2', 'src-radar', 'obs-det-2');

    // Run 10 times
    const firstResult = edg.determineDependency(ev1, ev2);
    for (let i = 0; i < 10; i++) {
      const runResult = edg.determineDependency(ev1, ev2);
      expect(runResult.type).toBe(firstResult.type);
      expect(runResult.basis).toBe(firstResult.basis);
      expect(runResult.confidence).toBe(firstResult.confidence);
    }

    // Inverted arguments produce identical type & confidence
    const invertedResult = edg.determineDependency(ev2, ev1);
    expect(invertedResult.type).toBe(firstResult.type);
    expect(invertedResult.confidence).toBe(firstResult.confidence);

    // Derived case deterministic test
    const parent = createTestEvidence('ev-det-p', 'src-p', 'obs-p');
    const child = createTestEvidence('ev-det-c', 'src-c', 'obs-c', ['ev-det-p']);

    const depDerived1 = edg.determineDependency(parent, child);
    const depDerived2 = edg.determineDependency(child, parent);
    expect(depDerived1.type).toBe(EvidenceDependencyType.DEPENDENT);
    expect(depDerived2.type).toBe(EvidenceDependencyType.DEPENDENT);
  });
});
