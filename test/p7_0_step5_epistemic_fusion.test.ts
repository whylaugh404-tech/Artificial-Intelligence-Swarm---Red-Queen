import { describe, test, expect, beforeEach } from 'vitest';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { MemoryStore, MemoryCategory, MemoryEntry } from '../src/redqueen/memory/store';
import {
  Evidence,
  EvidenceDependency,
  EvidenceDependencyType
} from '../src/redqueen/cognition/evidence/types';
import { EvidenceDependencyGraph } from '../src/redqueen/cognition/evidence/graph';
import {
  EpistemicFusionEngine,
  EvidencePolarity,
  AttributedEvidence,
  EpistemicFusionResult,
  freezeFusionResult
} from '../src/redqueen/cognition/epistemic/fusion';
import {
  EpistemicStatus,
  Context
} from '../src/redqueen/cognition/epistemic/types';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';

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

const mockContext: Context = {
  contextId: 'ctx-fusion-test',
  domain: 'CYBER_INTELLIGENCE'
};

const createTestEvidence = (
  id: string,
  sourceId: string,
  observationId?: string,
  derivedFrom?: string[],
  supportingReps?: string[],
  contradictingReps?: string[]
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
      supportingRepresentationIds: supportingReps,
      contradictingRepresentationIds: contradictingReps
    },
    context: mockContext
  };
};

describe('P7.0 Step 5: Epistemic Fusion & Conflict Resolution', () => {
  let memory: MockMemoryStore;
  let graph: CognitiveGraph;
  let edg: EvidenceDependencyGraph;
  let fusionEngine: EpistemicFusionEngine;

  beforeEach(() => {
    memory = new MockMemoryStore();
    graph = new CognitiveGraph('cell-intel-alpha', memory);
    edg = new EvidenceDependencyGraph();
    fusionEngine = new EpistemicFusionEngine();
  });

  // 1. Satu evidence
  test('TEST 1: Satu evidence menghasilkan epistemic state valid', () => {
    const ev1 = createTestEvidence('ev-1', 'source-sigint-1', 'obs-1');
    edg.addEvidence(ev1);

    const result = fusionEngine.fuse([ev1], mockContext, edg);

    expect(result).toBeDefined();
    expect(result.supportingEvidence.length).toBe(1);
    expect(result.conflictingEvidence.length).toBe(0);
    expect(result.effectiveSupportMass).toBe(1.0);
    expect(result.effectiveConflictMass).toBe(0);
    expect(result.hasConflict).toBe(false);

    // Subjective Logic check: mass=1.0, W=2.0 -> belief = 1/3, disbelief = 0, uncertainty = 2/3
    expect(result.fusedState.opinion).toBeDefined();
    expect(result.fusedState.opinion?.belief).toBeCloseTo(1 / 3, 4);
    expect(result.fusedState.opinion?.disbelief).toBe(0);
    expect(result.fusedState.opinion?.uncertainty).toBeCloseTo(2 / 3, 4);
    expect(result.fusedState.status).toBe(EpistemicStatus.BELIEVED);
    expect(result.fusedState.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
  });

  // 2. Dua evidence INDEPENDENT → dukungan dapat digabung secara aditif
  test('TEST 2: Dua evidence INDEPENDENT → dukungan dapat digabung', () => {
    // Distinct sources, distinct observations, no shared lineage -> INDEPENDENT
    const ev1 = createTestEvidence('ev-sat-1', 'source-satellite', 'obs-recon-1');
    const ev2 = createTestEvidence('ev-hum-1', 'source-humint', 'obs-recon-2');
    edg.addEvidence(ev1);
    edg.addEvidence(ev2);

    // Verify EDG classification is INDEPENDENT
    const depCheck = edg.determineDependency(ev1, ev2);
    expect(depCheck.type).toBe(EvidenceDependencyType.INDEPENDENT);

    const result = fusionEngine.fuse([ev1, ev2], mockContext, edg);

    // Two independent evidences of weight 1.0 -> effectiveSupportMass = 2.0
    expect(result.effectiveSupportMass).toBe(2.0);
    expect(result.supportingEvidence.length).toBe(2);

    // With effective mass = 2.0, W = 2.0: belief = 2/(2+2) = 0.50, uncertainty = 0.50
    expect(result.fusedState.opinion?.belief).toBeCloseTo(0.5, 4);
    expect(result.fusedState.opinion?.uncertainty).toBeCloseTo(0.5, 4);
    
    // Fusion DOES NOT automatically VERIFY just because of independent mass.
    expect(result.fusedState.status).toBe(EpistemicStatus.BELIEVED);
    expect(result.fusedState.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
  });

  // 3. CORRELATED → tidak double-count
  test('TEST 3: CORRELATED → tidak double-count (mass scaled down)', () => {
    // Shared observationId -> CORRELATED
    const evA = createTestEvidence('ev-shared-1', 'source-feed-A', 'obs-common-feed');
    const evB = createTestEvidence('ev-shared-2', 'source-feed-B', 'obs-common-feed');
    edg.addEvidence(evA);
    edg.addEvidence(evB);

    const depCheck = edg.determineDependency(evA, evB);
    expect(depCheck.type).toBe(EvidenceDependencyType.CORRELATED);

    const resultCorrelated = fusionEngine.fuse([evA, evB], mockContext, edg);

    // First evidence gives 1.0. Second is correlated (shared observation)
    // so it provides exactly 0 independent mass.
    expect(resultCorrelated.effectiveSupportMass).toBeCloseTo(1.0, 4);
    expect(resultCorrelated.effectiveSupportMass).toBeLessThan(2.0);
    expect(resultCorrelated.fusedState.opinion?.belief).toBeLessThan(0.5); // strictly less belief than independent
  });

  // 4. DEPENDENT → tidak double-count
  test('TEST 4: DEPENDENT → tidak double-count (mass addition is 0)', () => {
    // evChild derives directly from evParent -> DEPENDENT
    const evParent = createTestEvidence('ev-root-raw', 'source-ap-news', 'obs-ap-1');
    const evChild = createTestEvidence('ev-derived-summary', 'cell-internal', 'obs-ap-summary', ['ev-root-raw']);
    edg.addEvidence(evParent);
    edg.addEvidence(evChild);

    const depCheck = edg.determineDependency(evParent, evChild);
    expect(depCheck.type).toBe(EvidenceDependencyType.DEPENDENT);

    const result = fusionEngine.fuse([evParent, evChild], mockContext, edg);

    // Parent gives 1.0. Child is directly derived, so it contributes exactly 0 additional mass.
    expect(result.effectiveSupportMass).toBe(1.0);
    expect(result.supportingEvidence.length).toBe(2); // Both kept in audit trail
    // Belief with 2 dependent items is IDENTICAL to belief with 1 item
    expect(result.fusedState.opinion?.belief).toBeCloseTo(1 / 3, 4);
  });

  // 5. UNKNOWN → conservative
  test('TEST 5: UNKNOWN → conservative (mass scaled by conservative factor)', () => {
    // Sparse evidence without observationId or lineage -> UNKNOWN
    const ev1 = createTestEvidence('ev-sparse-1', 'source-x');
    const ev2 = createTestEvidence('ev-sparse-2', 'source-y');
    edg.addEvidence(ev1);
    edg.addEvidence(ev2);

    const depCheck = edg.determineDependency(ev1, ev2);
    expect(depCheck.type).toBe(EvidenceDependencyType.UNKNOWN);

    const result = fusionEngine.fuse([ev1, ev2], mockContext, edg);

    // First gives 1.0. Second gives unknown (factor 0.0).
    // Effective mass = 1.0 (conservative, assuming they might be the same evidence)
    expect(result.effectiveSupportMass).toBeCloseTo(1.00, 4);
    expect(result.effectiveSupportMass).toBeLessThan(2.0);
  });

  // 6. Evidence konflik
  test('TEST 6: Evidence konflik terdeteksi tidak otomatis menghasilkan status CONTRADICTED', () => {
    const evSupp = createTestEvidence('ev-supp-1', 'source-sat', 'obs-sat-1');
    const evContr = createTestEvidence('ev-contr-1', 'source-radar', 'obs-radar-1');

    const attributed: AttributedEvidence[] = [
      { evidence: evSupp, polarity: EvidencePolarity.SUPPORTS, weight: 1.0 },
      { evidence: evContr, polarity: EvidencePolarity.CONTRADICTS, weight: 1.0 }
    ];

    const result = fusionEngine.fuse(attributed, mockContext, edg);

    expect(result.hasConflict).toBe(true);
    expect(result.unresolvedConflict).toBeDefined();
    expect(result.unresolvedConflict?.supportingEvidenceIds).toContain('ev-supp-1');
    expect(result.unresolvedConflict?.conflictingEvidenceIds).toContain('ev-contr-1');
    // Maintain unresolved/pending state instead of auto-contradicted
    expect(result.fusedState.status).toBe(EpistemicStatus.UNKNOWN);
    expect(result.fusedState.verificationStatus).toBe(RepresentationVerificationStatus.PENDING);
    expect(result.fusedState.opinion?.belief).toBeGreaterThan(0);
    expect(result.fusedState.opinion?.disbelief).toBeGreaterThan(0);
  });

  // 7. Konflik tidak menghapus evidence
  test('TEST 7: Konflik tidak menghapus evidence (kedua kubu dipertahankan)', () => {
    const evSupp1 = createTestEvidence('ev-s-1', 'src-1', 'obs-1');
    const evSupp2 = createTestEvidence('ev-s-2', 'src-2', 'obs-2');
    const evContr1 = createTestEvidence('ev-c-1', 'src-3', 'obs-3');

    const attributed: AttributedEvidence[] = [
      { evidence: evSupp1, polarity: EvidencePolarity.SUPPORTS, weight: 1.0 },
      { evidence: evSupp2, polarity: EvidencePolarity.SUPPORTS, weight: 1.0 },
      { evidence: evContr1, polarity: EvidencePolarity.CONTRADICTS, weight: 1.0 }
    ];

    const result = fusionEngine.fuse(attributed, mockContext, edg);

    expect(result.supportingEvidence.length).toBe(2);
    expect(result.conflictingEvidence.length).toBe(1);
    expect(result.supportingEvidence.map(e => e.evidenceId)).toEqual(
      expect.arrayContaining(['ev-s-1', 'ev-s-2'])
    );
    expect(result.conflictingEvidence.map(e => e.evidenceId)).toEqual(['ev-c-1']);
  });

  // 8. Provenance tetap utuh
  test('TEST 8: Provenance tetap utuh pada setiap evidence', () => {
    const ev1 = createTestEvidence('ev-prov-1', 'src-sensor-alpha', 'obs-wave-10', ['parent-ev-99']);
    const ev2 = createTestEvidence('ev-prov-2', 'src-sensor-beta', 'obs-wave-20');

    const result = fusionEngine.fuse([ev1, ev2], mockContext, edg);

    const found1 = result.supportingEvidence.find(e => e.evidenceId === 'ev-prov-1');
    expect(found1?.provenance.sourceId).toBe('src-sensor-alpha');
    expect(found1?.provenance.observationId).toBe('obs-wave-10');
    expect(found1?.provenance.derivedFrom).toEqual(['parent-ev-99']);
  });

  // 9. Context tetap utuh
  test('TEST 9: Context tetap utuh dan immutable', () => {
    const customContext: Context = {
      contextId: 'ctx-military-intel',
      domain: 'DEFENSE',
      temporalBounds: { start: 1700000000, end: 1700086400 }
    };

    const ev1 = createTestEvidence('ev-ctx-1', 'src-1', 'obs-1');
    const result = fusionEngine.fuse([ev1], customContext, edg);

    expect(result.context.contextId).toBe('ctx-military-intel');
    expect(result.context.domain).toBe('DEFENSE');
    expect(result.context.temporalBounds?.start).toBe(1700000000);

    // Immutability check
    expect(() => {
      (result.context as any).domain = 'HACKED';
    }).toThrow();
  });

  // 10. Hasil fusion deterministic
  test('TEST 10: Hasil fusion deterministic untuk input berulang dan urutan berbeda', () => {
    const evA = createTestEvidence('ev-det-a', 'src-a', 'obs-a');
    const evB = createTestEvidence('ev-det-b', 'src-b', 'obs-b');
    const evC = createTestEvidence('ev-det-c', 'src-c', 'obs-c');

    const run1 = fusionEngine.fuse([evA, evB, evC], mockContext, edg, { fusionId: 'fixed-id' });
    const run2 = fusionEngine.fuse([evC, evA, evB], mockContext, edg, { fusionId: 'fixed-id' }); // shuffled

    expect(run1.effectiveSupportMass).toBe(run2.effectiveSupportMass);
    expect(run1.fusedState.opinion?.belief).toBe(run2.fusedState.opinion?.belief);
    expect(run1.fusedState.opinion?.uncertainty).toBe(run2.fusedState.opinion?.uncertainty);
    expect(run1.fusedState.status).toBe(run2.fusedState.status);
    expect(run1.supportingEvidence.map(e => e.evidenceId)).toEqual(
      run2.supportingEvidence.map(e => e.evidenceId)
    );
  });

  // 11. Persistence + reload
  test('TEST 11: Persistence + reload menghasilkan hasil yang identik', () => {
    const ev1 = createTestEvidence('ev-p-1', 'src-p1', 'obs-p1');
    const ev2 = createTestEvidence('ev-p-2', 'src-p2', 'obs-p2');

    const result = fusionEngine.fuse([ev1, ev2], mockContext, edg);
    const serialized = fusionEngine.persist(result);

    const reloaded = fusionEngine.reload(serialized);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.fusionId).toBe(result.fusionId);
    expect(reloaded?.effectiveSupportMass).toBe(result.effectiveSupportMass);
    expect(reloaded?.fusedState.opinion?.belief).toBe(result.fusedState.opinion?.belief);
    expect(reloaded?.supportingEvidence.length).toBe(2);

    // Check reloaded result is deeply frozen
    expect(() => {
      (reloaded as any).effectiveSupportMass = 999;
    }).toThrow();
  });

  // 12. Malformed input ditolak
  test('TEST 12: Malformed input ditolak', () => {
    // Empty evidence array
    expect(() => fusionEngine.fuse([], mockContext, edg)).toThrow();

    // Invalid context
    const badContext = { contextId: '', domain: '' } as any;
    const ev = createTestEvidence('ev-m', 'src-m', 'obs-m');
    expect(() => fusionEngine.fuse([ev], badContext, edg)).toThrow();

    // Invalid reload string
    expect(fusionEngine.reload('not-json')).toBeNull();
    expect(fusionEngine.reload(JSON.stringify({ bad: 'schema' }))).toBeNull();
  });

  // 13. Duplicate evidence tidak menggandakan hasil
  test('TEST 13: Duplicate evidence tidak menggandakan hasil', () => {
    const ev = createTestEvidence('ev-dup-target', 'src-target', 'obs-target');

    // Passing the exact same evidence 4 times
    const duplicatedList = [ev, ev, ev, ev];
    const result = fusionEngine.fuse(duplicatedList, mockContext, edg);

    // Must deduplicate down to 1 evidence item
    expect(result.supportingEvidence.length).toBe(1);
    expect(result.effectiveSupportMass).toBe(1.0);
    expect(result.fusedState.opinion?.belief).toBeCloseTo(1 / 3, 4);
  });

  // 14. ±100 evidence/dependency stress test
  test('TEST 14: ±100 evidence/dependency stress test', () => {
    const N = 100;
    const evidences: Evidence[] = [];

    // Create 100 evidences with mixed dependencies
    // Evidences 0..19: Independent sensor feeds
    // Evidences 20..39: Correlated with Evidences 0..19 (shared observations)
    // Evidences 40..59: Derived from Evidences 0..19 (dependent)
    // Evidences 60..79: Conflicting observations
    // Evidences 80..99: Independent signals
    for (let i = 0; i < N; i++) {
      if (i < 20) {
        evidences.push(createTestEvidence(`ev-stress-${i}`, `source-sat-${i}`, `obs-${i}`));
      } else if (i < 40) {
        // Correlated with i - 20 (same observationId, different source)
        evidences.push(createTestEvidence(`ev-stress-${i}`, `source-radar-${i}`, `obs-${i - 20}`));
      } else if (i < 60) {
        // Derived from i - 40
        evidences.push(createTestEvidence(`ev-stress-${i}`, `cell-derived-${i}`, `obs-der-${i}`, [`ev-stress-${i - 40}`]));
      } else if (i < 80) {
        // Conflicting
        evidences.push(createTestEvidence(`ev-stress-${i}`, `source-adversary-${i}`, `obs-adv-${i}`));
      } else {
        // Independent
        evidences.push(createTestEvidence(`ev-stress-${i}`, `source-osint-${i}`, `obs-${i}`));
      }
    }

    const attributed: AttributedEvidence[] = evidences.map((ev, idx) => ({
      evidence: ev,
      polarity: (idx >= 60 && idx < 80) ? EvidencePolarity.CONTRADICTS : EvidencePolarity.SUPPORTS,
      weight: 1.0
    }));

    const start = Date.now();
    const result = fusionEngine.fuse(attributed, mockContext, edg);
    const duration = Date.now() - start;

    expect(result).toBeDefined();
    expect(result.supportingEvidence.length).toBe(80);
    expect(result.conflictingEvidence.length).toBe(20);
    expect(result.hasConflict).toBe(true);
    expect(result.unresolvedConflict).toBeDefined();

    // Derived evidences (40..59) should not double-count their parents (0..19)
    // Correlated evidences (20..39) should be scaled down
    expect(result.effectiveSupportMass).toBeLessThan(80); // Strict proof of anti-double-counting
    expect(result.effectiveSupportMass).toBeGreaterThan(20);

    // Sum of opinions must be 1.0 within EPSILON
    const sumOpinion = (result.fusedState.opinion?.belief || 0) +
                       (result.fusedState.opinion?.disbelief || 0) +
                       (result.fusedState.opinion?.uncertainty || 0);
    expect(Math.abs(sumOpinion - 1.0)).toBeLessThanOrEqual(1e-6);

    // Must execute efficiently (< 3000ms)
    expect(duration).toBeLessThan(3000);
  });

  // 15. Integration with CognitiveGraph.fuseEvidences
  test('TEST 15: Integration dengan CognitiveGraph.fuseEvidences', async () => {
    const ev1 = createTestEvidence('ev-cg-1', 'src-sat-1', 'obs-1');
    const ev2 = createTestEvidence('ev-cg-2', 'src-radar-2', 'obs-2');
    await graph.insertEvidence(ev1);
    await graph.insertEvidence(ev2);

    const result = await graph.fuseEvidences([ev1, ev2], mockContext);

    expect(result).toBeDefined();
    expect(result.supportingEvidence.length).toBe(2);
    expect(result.effectiveSupportMass).toBe(2.0);
    expect(graph.getEpistemicState(result.fusedState.stateId)).toBeDefined();

    // Verify stored memory entry
    const mem = await memory.get(result.fusedState.stateId);
    expect(mem).not.toBeNull();
    expect(mem?.type).toBe('EPISTEMIC_STATE');
  });
});
