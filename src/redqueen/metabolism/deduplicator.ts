import { MemoryStore, MemoryCategory } from '../memory/store';
import { InformationRecord } from './types';
import { logger } from '../core/logger';

export interface DuplicateCheckResult {
  readonly isDuplicate: boolean;
  readonly existingKnowledgeId?: string;
  readonly reason?: string;
}

export class DuplicateDetector {
  private readonly component = 'duplicate_detector';
  private readonly knownContentHashes = new Map<string, string>(); // hash -> knowledgeId

  constructor(private readonly cellId: string) {}

  /**
   * Indexes an existing knowledge record's content hash
   */
  public registerHash(contentHash: string, knowledgeId: string): void {
    if (contentHash && knowledgeId) {
      this.knownContentHashes.set(contentHash, knowledgeId);
    }
  }

  /**
   * Checks if an incoming InformationRecord's content hash has already been metabolized by this cell.
   */
  public async checkDuplicate(
    record: InformationRecord,
    memoryStore?: MemoryStore
  ): Promise<DuplicateCheckResult> {
    // 1. Fast in-memory cache check
    const cachedKnowledgeId = this.knownContentHashes.get(record.contentHash);
    if (cachedKnowledgeId) {
      logger.debug(this.component, 'duplicate_detected_in_cache', {
        cellId: this.cellId,
        contentHash: record.contentHash,
        existingKnowledgeId: cachedKnowledgeId
      });
      return {
        isDuplicate: true,
        existingKnowledgeId: cachedKnowledgeId,
        reason: `Identical content hash (${record.contentHash}) previously metabolized as Knowledge ID ${cachedKnowledgeId}`
      };
    }

    // 2. Memory Store persistence check
    if (memoryStore) {
      try {
        const results = await memoryStore.search({
          category: MemoryCategory.SEMANTIC,
          hash: record.contentHash
        });

        if (results.length > 0) {
          const matchedEntry = results[0];
          this.knownContentHashes.set(record.contentHash, matchedEntry.id);
          return {
            isDuplicate: true,
            existingKnowledgeId: matchedEntry.id,
            reason: `Found existing memory entry '${matchedEntry.id}' with matching content hash '${record.contentHash}'`
          };
        }
      } catch (err: any) {
        logger.warn(this.component, 'duplicate_search_failed', { error: err.message });
      }
    }

    return {
      isDuplicate: false
    };
  }
}
