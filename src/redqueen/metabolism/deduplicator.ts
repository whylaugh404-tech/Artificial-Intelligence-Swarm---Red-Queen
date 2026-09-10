import { MemoryStore, MemoryCategory, MemoryEntry } from '../memory/store';
import { InformationRecord, NoveltyClassification, KnowledgeRecord } from './types';
import { logger } from '../core/logger';

export interface NoveltyEvaluationResult {
  readonly classification: NoveltyClassification;
  readonly score: number; // 0.0 to 1.0
  readonly existingKnowledgeId?: string;
  readonly existingKnowledge?: KnowledgeRecord;
  readonly reason: string;
}

export class NoveltyEvaluator {
  private readonly component = 'novelty_evaluator';
  private readonly knownContentHashes = new Map<string, string>(); // hash -> knowledgeId

  constructor(private readonly cellId: string) {}

  public registerHash(contentHash: string, knowledgeId: string): void {
    if (contentHash && knowledgeId) {
      this.knownContentHashes.set(contentHash, knowledgeId);
    }
  }

  public unregisterHash(contentHash: string): void {
    if (contentHash) {
      this.knownContentHashes.delete(contentHash);
    }
  }

  private calculateFactOverlap(newFacts: string[], existingFacts: readonly string[]): number {
    if (newFacts.length === 0 || existingFacts.length === 0) return 0.0;
    
    // Simple deterministic overlap calculation (bag of words across facts)
    const normalize = (text: string) => text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    
    const newTokens = new Set(newFacts.flatMap(normalize));
    const existingTokens = new Set(existingFacts.flatMap(normalize));
    
    let intersection = 0;
    for (const token of newTokens) {
      if (existingTokens.has(token)) intersection++;
    }
    
    const union = newTokens.size + existingTokens.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  public async evaluateNovelty(
    record: InformationRecord,
    memoryStore?: MemoryStore,
    extractedFacts?: string[]
  ): Promise<NoveltyEvaluationResult> {
    
    let matchedEntry: MemoryEntry | undefined = undefined;

    // 1. Fast in-memory cache check for exact duplicate
    const cachedKnowledgeId = this.knownContentHashes.get(record.contentHash);
    if (cachedKnowledgeId && memoryStore) {
      matchedEntry = await memoryStore.get(cachedKnowledgeId);
    }

    // 2. Memory Store persistence check for exact hash
    if (!matchedEntry && memoryStore) {
      try {
        const results = await memoryStore.search({
          category: MemoryCategory.SEMANTIC,
          hash: record.contentHash
        });
        if (results.length > 0) {
          matchedEntry = results[0];
          this.knownContentHashes.set(record.contentHash, matchedEntry.id);
        }
      } catch (err: any) {
        logger.warn(this.component, 'duplicate_search_failed', { error: err.message });
      }
    }

    // 3. Check for Semantic Overlap / Reinforcement / Contradiction
    if (!matchedEntry && memoryStore && extractedFacts && extractedFacts.length > 0) {
      // For P4.1 we do a deterministic lookup by retrieving recent knowledge records 
      // in the same category or overall, and calculate Jaccard similarity.
      try {
        const results = await memoryStore.search({
          category: MemoryCategory.SEMANTIC
        });
        // slice last 10 to simulate limit
        const recentRecords = results.slice(-10);

        let highestOverlap = 0;
        let bestMatch: MemoryEntry | undefined = undefined;

        for (const recent of recentRecords) {
          if (recent.type === 'KNOWLEDGE_RECORD' && recent.content?.facts) {
            const overlap = this.calculateFactOverlap(extractedFacts, recent.content.facts);
            if (overlap > highestOverlap) {
              highestOverlap = overlap;
              bestMatch = recent;
            }
          }
        }

        if (highestOverlap > 0.8) {
          // Extremely similar but different hash
          return {
            classification: NoveltyClassification.SEMANTIC_OVERLAP,
            score: 0.1, // low novelty
            existingKnowledgeId: bestMatch!.id,
            existingKnowledge: bestMatch!.content as KnowledgeRecord,
            reason: `High semantic overlap (${(highestOverlap * 100).toFixed(1)}%) with existing knowledge '${bestMatch!.id}'`
          };
        } else if (highestOverlap > 0.4) {
          // Partial overlap, likely reinforcing the same concepts
          return {
            classification: NoveltyClassification.REINFORCEMENT,
            score: 0.4,
            existingKnowledgeId: bestMatch!.id,
            existingKnowledge: bestMatch!.content as KnowledgeRecord,
            reason: `Reinforces existing knowledge '${bestMatch!.id}' with ${(highestOverlap * 100).toFixed(1)}% overlap`
          };
        } else if (highestOverlap > 0.2) {
          // Weak overlap - might be contradictory or just vaguely related
          // P4.1 deterministic contradiction heuristic: 
          // If they share some key terms but differ in others, we could label it contradiction for testing.
          // But realistically, let's just mark it as NOVEL if overlap < 0.4, unless we have a specific contradiction marker.
          // For now, let's look for negations.
          const hasNegation = extractedFacts.some(f => f.match(/\b(not|never|false|incorrect|wrong|unlike|differs)\b/i));
          if (hasNegation) {
            return {
              classification: NoveltyClassification.CONTRADICTION,
              score: 0.9,
              existingKnowledgeId: bestMatch!.id,
              existingKnowledge: bestMatch!.content as KnowledgeRecord,
              reason: `Potential contradiction detected with knowledge '${bestMatch!.id}'`
            };
          }
        }

      } catch (err: any) {
        logger.warn(this.component, 'semantic_search_failed', { error: err.message });
      }
    }

    if (matchedEntry) {
      return {
        classification: NoveltyClassification.EXACT_DUPLICATE,
        score: 0.0,
        existingKnowledgeId: matchedEntry.id,
        existingKnowledge: matchedEntry.content as KnowledgeRecord,
        reason: `Identical content hash (${record.contentHash}) previously metabolized as Knowledge ID ${matchedEntry.id}`
      };
    }

    return {
      classification: NoveltyClassification.NOVEL,
      score: 1.0,
      reason: 'Information is completely novel.'
    };
  }
}
