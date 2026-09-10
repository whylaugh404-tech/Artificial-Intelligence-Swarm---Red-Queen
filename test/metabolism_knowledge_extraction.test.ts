import { describe, it, expect } from 'vitest';
import { KnowledgeExtractor } from '../src/redqueen/metabolism/extractor';
import { NoveltyEvaluator } from '../src/redqueen/metabolism/deduplicator';
import {
  InformationCategory,
  InformationSourceType,
  KnowledgeRecordSchema,
  NoveltyClassification
} from '../src/redqueen/metabolism/types';
import { normalizeInformation } from '../src/redqueen/metabolism/normalizer';
import { JsonFileMemoryStore, MemoryCategory } from '../src/redqueen/memory/store';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('P4 Metabolism: Knowledge Extraction & Provenance Tracking', () => {
  const extractor = new KnowledgeExtractor();

  it('extracts structured KnowledgeRecord with title, summary, CVEs, IPs, and facts', () => {
    const rawContent = `
# Zero-Day Vulnerability Report
A critical buffer overflow was found in perimeter routers.
- Mitigation is available immediately.
- Attackers exploit CVE-2024-5555 to execute commands.
- Suspicious traffic originates from 198.51.100.42 and 203.0.113.195.
- Firewall rule update required on port 8080.
`;

    const { normalized } = normalizeInformation({
      sourceType: InformationSourceType.DOCUMENT,
      sourceUri: 'https://cert.org/advisory/2024-001',
      content: rawContent
    });

    const relevance = {
      relevanceScore: 0.9,
      matchedSpecialization: 'CYBERSECURITY',
      noveltyScore: 1.0,
      reason: 'Direct match',
      matchedCategories: [InformationCategory.CYBERSECURITY]
    };

    const quality = {
      qualityScore: 0.85,
      confidence: 0.88,
      factors: { sourceCredibility: 0.9, contentCompleteness: 0.85, structureScore: 0.8 },
      reason: 'High quality advisory'
    };

    const knowledge = extractor.extractKnowledge(
      normalized,
      InformationCategory.CYBERSECURITY,
      relevance,
      quality,
      'cell_alpha_1'
    );

    // Schema validation
    const parseResult = KnowledgeRecordSchema.safeParse(knowledge);
    expect(parseResult.success).toBe(true);

    expect(knowledge.title).toBe('Zero-Day Vulnerability Report');
    expect(knowledge.category).toBe(InformationCategory.CYBERSECURITY);
    expect(knowledge.owningCellId).toBe('cell_alpha_1');
    expect(knowledge.confidence).toBe(0.88);
    expect(knowledge.relevance).toBe(0.9);

    // Provenance verification
    expect(knowledge.sourceInformationIds).toContain(normalized.informationId);
    expect(knowledge.sourceContentHashes).toContain(normalized.contentHash);
    expect(knowledge.sourceProvenance.length).toBe(1);
    expect(knowledge.sourceProvenance[0].sourceIdentifier).toBe('https://cert.org/advisory/2024-001');

    // Facts extraction verification
    expect(knowledge.facts.some(f => f.includes('CVE-2024-5555'))).toBe(true);
    expect(knowledge.facts.some(f => f.includes('198.51.100.42'))).toBe(true);
    expect(knowledge.structuredContent.cveReferences).toContain('CVE-2024-5555');
    expect(knowledge.structuredContent.ipReferences).toContain('198.51.100.42');
  });
});

describe('P4 Metabolism: Novelty Evaluation', () => {
  const cellId = 'cell_dup_test';
  const testStoragePath = path.join(process.cwd(), 'data', 'test_dup_memory.json');

  it('detects duplicates and assesses novelty', async () => {
    await fs.rm(testStoragePath, { force: true });
    const memory = new JsonFileMemoryStore(testStoragePath, cellId);
    await memory.initialize();

    const evaluator = new NoveltyEvaluator(cellId);

    const { normalized } = normalizeInformation({
      sourceType: InformationSourceType.DOCUMENT,
      content: 'Unique knowledge content for duplicate detection test.'
    });

    // Check before registering
    const check1 = await evaluator.evaluateNovelty(normalized, memory, []);
    expect(check1.classification).toBe(NoveltyClassification.NOVEL);
    expect(check1.score).toBe(1.0);

    // Register in detector cache
    evaluator.registerHash(normalized.contentHash, 'know_123');
    
    // Create dummy memory entry so that evaluating exact duplicate doesn't fail on retrieval
    await memory.put({
      id: 'know_123',
      cellId,
      category: MemoryCategory.SEMANTIC,
      type: 'KNOWLEDGE_RECORD',
      content: { knowledgeId: 'know_123' },
      source: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1.0,
      hash: normalized.contentHash,
      provenance: [],
      version: 1
    });

    // Check after registering in cache
    const check2 = await evaluator.evaluateNovelty(normalized, memory, []);
    expect(check2.classification).toBe(NoveltyClassification.EXACT_DUPLICATE);
    expect(check2.existingKnowledgeId).toBe('know_123');

    // Clean up
    await fs.rm(testStoragePath, { force: true });
  });
});
