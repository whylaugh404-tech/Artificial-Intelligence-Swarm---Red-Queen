import { describe, it, expect } from 'vitest';
import { WikipediaIngestionPipeline } from '../src/redqueen/cognition/wiki_pipeline';
import { CompactHdcIndex } from '../src/redqueen/cognition/knowledge_distillation';

describe('Wikipedia Real-World Knowledge Ingestion Pipeline', () => {
  it('should initialize pipeline with status and storage configuration', () => {
    const slab = new CompactHdcIndex(1000, 1024);
    const pipeline = new WikipediaIngestionPipeline(slab, './data/test_wiki');

    const status = pipeline.getStatus();
    expect(status.isRunning).toBe(false);
    expect(status.targetCount).toBe(10000);
    expect(Array.isArray(status.recentFacts)).toBe(true);
  });

  it('should extract structured factual triplets from lead sentences', () => {
    const slab = new CompactHdcIndex(1000, 1024);
    const pipeline = new WikipediaIngestionPipeline(slab, './data/test_wiki');

    // Test internal triplet extraction logic
    const extractMethod = (pipeline as any).extractTriplets.bind(pipeline);
    
    // Sample 1: "Albert Einstein was a German-born theoretical physicist"
    const triplets1 = extractMethod(
      'Albert Einstein',
      'Albert Einstein was a German-born theoretical physicist who developed the theory of relativity.',
      'Theoretical physicist'
    );
    expect(triplets1.length).toBeGreaterThan(0);
    expect(triplets1.some((t: any) => t.predicate.includes('is defined as') || t.predicate.includes('is classified as'))).toBe(true);

    // Sample 2: "Linux is an open-source Unix-like operating system"
    const triplets2 = extractMethod(
      'Linux',
      'Linux is a family of open-source Unix-like operating systems based on the Linux kernel.',
      'Family of operating systems'
    );
    expect(triplets2.length).toBeGreaterThan(0);
  });

  it('should encode extracted facts into the contiguous HDC slab index', () => {
    const slab = new CompactHdcIndex(1000, 1024);
    const pipeline = new WikipediaIngestionPipeline(slab, './data/test_wiki');

    const initialSize = slab.size;
    const encodeMethod = (pipeline as any).encodeTriplet.bind(pipeline);
    const vec = encodeMethod('Linux', 'is classified as', 'operating system');
    
    slab.addFact({
      id: initialSize + 1,
      subject: 'Linux',
      predicate: 'is classified as',
      object: 'operating system',
      domain: 'CYBERSECURITY',
      confidence: 0.99
    }, vec);

    expect(slab.size).toBe(initialSize + 1);
  });

  it('should search and retrieve real Wikipedia facts correctly', () => {
    const slab = new CompactHdcIndex(15000, 1024);
    // Load from main ./data directory containing real_wiki_facts.json
    const pipeline = new WikipediaIngestionPipeline(slab, './data');

    const status = pipeline.getStatus();
    expect(status.factsCollected).toBeGreaterThanOrEqual(5000);

    // Search for Indonesia
    const indonesiaResults = pipeline.searchFacts('Indonesia');
    expect(indonesiaResults.length).toBeGreaterThan(0);
    expect(indonesiaResults[0].subject.toLowerCase()).toContain('indonesia');

    // Search for Einstein
    const einsteinResults = pipeline.searchFacts('Einstein');
    expect(einsteinResults.length).toBeGreaterThan(0);

    // Paginated retrieval
    const pageData = pipeline.getFacts(1, 10);
    expect(pageData.facts.length).toBe(10);
    expect(pageData.total).toBeGreaterThanOrEqual(5000);
  });
});
