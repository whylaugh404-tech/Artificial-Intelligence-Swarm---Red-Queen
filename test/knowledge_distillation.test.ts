import { describe, it, expect } from 'vitest';
import { 
  KnowledgeDistillationEngine, 
  CompactHdcIndex 
} from '../src/redqueen/cognition/knowledge_distillation';

describe('Phase 6: Large-Scale Knowledge Distillation & 100k HDC Slab Index', () => {
  it('should initialize contiguous binary slab with exact memory allocation', () => {
    const index = new CompactHdcIndex(1000, 1024);
    expect(index.dimension).toBe(1024);
    expect(index.wordsPerVector).toBe(32);
    expect(index.bytesPerVector).toBe(128);
    expect(index.size).toBe(0);
  });

  it('should encode factual triplets (Subject * Predicate * Object) into bound hypervectors', () => {
    const engine = new KnowledgeDistillationEngine(1000, 1024);
    const vec1 = engine.encodeTriplet('Firewall', 'mitigates', 'DDoSFlood');
    const vec2 = engine.encodeTriplet('Firewall', 'mitigates', 'DDoSFlood');
    const vec3 = engine.encodeTriplet('Kyber', 'encrypts', 'SessionKey');

    expect(vec1.dimension).toBe(1024);
    expect(vec1.similarity(vec2)).toBe(1.0); // Deterministic exact match
    expect(vec1.similarity(vec3)).toBeLessThan(0.60); // Orthogonal dissimilar
  });

  it('should ingest and index structured facts into the contiguous slab', async () => {
    const engine = new KnowledgeDistillationEngine(5000, 1024);
    
    // Ingest initial batch of 2,500 facts
    const count = await engine.populateMassiveCorpus(2500);
    expect(count).toBe(2500);
    expect(engine.index.size).toBe(2500);

    const stats = engine.getStats();
    expect(stats.totalFacts).toBe(2500);
    expect(stats.slabMemoryMb).toBeLessThan(5); // Ultra-lightweight memory
    expect(stats.isReady).toBe(true);
  });

  it('should execute fast nearest-neighbor search across the knowledge slab', async () => {
    const engine = new KnowledgeDistillationEngine(3000, 1024);
    await engine.populateMassiveCorpus(2000);

    // Search query for cryptography
    const matches = engine.search('Ed25519Signature', 5);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].similarity).toBeGreaterThan(0.48);
    expect(matches[0].fact.subject).toBeDefined();
    expect(matches[0].fact.predicate).toBeDefined();
    expect(matches[0].fact.object).toBeDefined();
  });

  it('supports domain filtering during retrieval', async () => {
    const engine = new KnowledgeDistillationEngine(2000, 1024);
    await engine.populateMassiveCorpus(1000);

    const cyberMatches = engine.index.searchNearest(
      engine.encodeTriplet('Firewall', 'mitigates', 'Threat'),
      3,
      'CYBERSECURITY'
    );
    
    for (const match of cyberMatches) {
      expect(match.domain).toBe('CYBERSECURITY');
    }
  });
});
