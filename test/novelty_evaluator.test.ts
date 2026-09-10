import { describe, it, expect } from 'vitest';
import { NoveltyEvaluator } from '../src/redqueen/metabolism/deduplicator';
import { NoveltyClassification, KnowledgeRecord, InformationCategory } from '../src/redqueen/metabolism/types';
import { JsonFileMemoryStore, MemoryCategory } from '../src/redqueen/memory/store';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('P4.1 Metabolism: Novelty & Semantic Overlap Evaluation', () => {
  const cellId = 'cell_novelty_test';
  const testStoragePath = path.join(process.cwd(), 'data', 'test_novelty_memory.json');

  it('correctly classifies EXACT_DUPLICATE, NOVEL, REINFORCEMENT, and CONTRADICTION', async () => {
    await fs.rm(testStoragePath, { force: true });
    const memory = new JsonFileMemoryStore(testStoragePath, cellId);
    await memory.initialize();

    const evaluator = new NoveltyEvaluator(cellId);

    // 1. NOVEL
    const novelRecord = {
      informationId: 'info_1',
      sourceType: 'DOCUMENT' as any,
      sourceIdentifier: 'doc1',
      acquiredAt: new Date().toISOString(),
      content: 'Some random completely novel text about quantum mechanics.',
      contentType: 'text/plain',
      language: 'en',
      contentHash: 'hash1',
      metadata: {}
    };

    const res1 = await evaluator.evaluateNovelty(novelRecord, memory, ['quantum mechanics is novel']);
    expect(res1.classification).toBe(NoveltyClassification.NOVEL);
    expect(res1.score).toBe(1.0);

    // Register a baseline knowledge for future overlaps
    const baselineKnowledge: KnowledgeRecord = {
      knowledgeId: 'know_baseline',
      owningCellId: cellId,
      category: InformationCategory.AI,
      title: 'Baseline AI Knowledge',
      summary: 'AI requires lots of data.',
      facts: ['AI needs data', 'neural networks use backpropagation', 'GPUs accelerate training'],
      relationships: [],
      contradictions: [],
      structuredContent: {},
      sourceInformationIds: ['info_2'],
      sourceContentHashes: ['hash_baseline'],
      sourceProvenance: [],
      reinforcementCount: 0,
      confidence: 0.9,
      relevance: 0.8,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      knowledgeVersion: 1
    };

    await memory.put({
      id: 'know_baseline',
      cellId,
      category: MemoryCategory.SEMANTIC,
      type: 'KNOWLEDGE_RECORD',
      content: baselineKnowledge,
      source: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 0.9,
      hash: 'hash_baseline',
      provenance: [],
      version: 1
    });

    // 2. EXACT_DUPLICATE
    const exactRecord = { ...novelRecord, contentHash: 'hash_baseline' };
    const res2 = await evaluator.evaluateNovelty(exactRecord, memory, []);
    expect(res2.classification).toBe(NoveltyClassification.EXACT_DUPLICATE);
    expect(res2.existingKnowledgeId).toBe('know_baseline');

    // 3. REINFORCEMENT (Moderate overlap)
    const reinRecord = { ...novelRecord, contentHash: 'hash_reinforce' };
    const res3 = await evaluator.evaluateNovelty(reinRecord, memory, ['AI needs data', 'models require training']);
    // 'AI needs data' matches exactly one of the baseline facts.
    // Overlap should be around 1 / 4 or something > 0.4 depending on tokenization.
    // Tokenization of baseline: ai, needs, data, neural, networks, use, backpropagation, gpus, accelerate, training (10)
    // Tokenization of reinRecord: ai, needs, data, models, require, training (6)
    // Intersection: ai, needs, data, training (4)
    // Union: 10 + 6 - 4 = 12
    // Jaccard: 4 / 12 = 0.33 -> actually less than 0.4! Let's make it more similar.
    
    const reinRecordStrong = { ...novelRecord, contentHash: 'hash_reinforce_strong' };
    const res3b = await evaluator.evaluateNovelty(reinRecordStrong, memory, [
      'AI needs data', 
      'neural networks use backpropagation', 
      'some other small thing'
    ]);
    expect(res3b.classification).toBe(NoveltyClassification.REINFORCEMENT);

    // 4. SEMANTIC_OVERLAP (High overlap)
    const overlapRecord = { ...novelRecord, contentHash: 'hash_overlap' };
    const res4 = await evaluator.evaluateNovelty(overlapRecord, memory, [
      'AI needs data', 
      'neural networks use backpropagation',
      'GPUs accelerate training'
    ]);
    expect(res4.classification).toBe(NoveltyClassification.SEMANTIC_OVERLAP);
    expect(res4.score).toBe(0.1);

    // 5. CONTRADICTION (Contains negation with low/moderate overlap)
    const contradictRecord = { ...novelRecord, contentHash: 'hash_contradict' };
    const res5 = await evaluator.evaluateNovelty(contradictRecord, memory, [
      'neural networks do NOT use backpropagation',
      'AI is totally different'
    ]);
    expect(res5.classification).toBe(NoveltyClassification.CONTRADICTION);
    
    await fs.rm(testStoragePath, { force: true });
  });
});