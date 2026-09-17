import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../core/logger';
import { computeDeterministicHash } from '../cognition/computation/canonical';

export enum MemoryCategory {
  EPISODIC = 'EPISODIC',   // Events, actions, and historical observations
  SEMANTIC = 'SEMANTIC',   // Facts, learned concepts, and knowledge
  PROCEDURAL = 'PROCEDURAL' // Skills, procedures, and behavioral policies
}

export interface MemoryEntry {
  id: string;
  cellId?: string;
  category?: MemoryCategory;
  type?: string;
  content: any;
  source: string;
  createdAt: string;
  updatedAt: string;
  confidence: number;
  hash: string;
  provenance: string[];
  version?: number;
}

export interface MemoryStats {
  total: number;
  episodic: number;
  semantic: number;
  procedural: number;
}

export interface MemoryStore {
  initialize(): Promise<void>;
  put(entry: MemoryEntry): Promise<void>;
  get(id: string): Promise<MemoryEntry | null>;
  search(query: Partial<MemoryEntry>): Promise<MemoryEntry[]>;
  delete(id: string): Promise<boolean>;
  getStats?(): MemoryStats;
  getOwningCellId?(): string | undefined;
}

/**
 * Validates a memory entry ID to prevent path traversal and arbitrary key injection.
 */
export function validateMemoryId(id: string): string {
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid memory ID: must be a non-empty string');
  }
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > 256) {
    throw new Error('Invalid memory ID: length must be between 1 and 256 characters');
  }
  if (
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0') ||
    /%2e|%2f|%5c/i.test(trimmed) ||
    trimmed.startsWith('.')
  ) {
    throw new Error(`Path traversal or invalid characters detected in memory ID: '${id}'`);
  }
  return trimmed;
}

/**
 * Validates and normalizes a cell ID to prevent path traversal, separator tricks, and case-casing mismatches.
 */
export function validateCellId(cellId: string): string {
  if (!cellId || typeof cellId !== 'string') {
    throw new Error('Invalid cellId: must be a non-empty string');
  }
  const normalized = cellId.trim().toLowerCase();
  if (
    normalized.includes('..') ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    normalized.includes('\0') ||
    /%2e|%2f|%5c/i.test(normalized) ||
    normalized.startsWith('.')
  ) {
    throw new Error(`Path traversal or invalid characters detected in cellId: '${cellId}'`);
  }
  return normalized;
}

export class JsonFileMemoryStore implements MemoryStore {
  private memoryMap: Map<string, MemoryEntry> = new Map();
  private readonly component = 'memory_store';
  private readonly normalizedOwningCellId?: string;

  constructor(
    private readonly storagePath: string,
    private readonly owningCellId?: string
  ) {
    if (this.owningCellId) {
      this.normalizedOwningCellId = validateCellId(this.owningCellId);
    }
  }

  public getOwningCellId(): string | undefined {
    return this.owningCellId;
  }

  async initialize(): Promise<void> {
    if (this.storagePath === ':memory:') {
      return;
    }
    try {
      await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
      
      // Clean up orphaned .tmp file if present from a previous abrupt crash
      try {
        await fs.rm(`${this.storagePath}.tmp`, { force: true });
      } catch {}

      try {
        const data = await fs.readFile(this.storagePath, 'utf8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            // Validate memory ID
            try {
              validateMemoryId(entry.id);
            } catch {
              continue;
            }

            // If store is scoped to a specific cell, enforce isolation
            if (this.normalizedOwningCellId && entry.cellId) {
              try {
                const normalizedEntryCell = validateCellId(entry.cellId);
                if (normalizedEntryCell !== this.normalizedOwningCellId) {
                  logger.warn(this.component, 'foreign_cell_memory_skipped', {
                    expectedCell: this.owningCellId,
                    foundCell: entry.cellId,
                    memoryId: entry.id
                  });
                  continue;
                }
              } catch {
                continue;
              }
            }
            this.memoryMap.set(entry.id, entry);
          }
        }
        logger.info(this.component, 'memory_loaded', { count: this.memoryMap.size, cellId: this.owningCellId });
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          logger.info(this.component, 'memory_store_created', { path: this.storagePath });
          await this.persist();
        } else {
          throw err;
        }
      }
    } catch (err) {
      logger.error(this.component, 'memory_init_failed', err);
      throw err;
    }
  }

  private persistenceQueue: Promise<void> = Promise.resolve();

  /**
   * Durably persists in-memory entries to disk.
   * Persistence Semantics:
   * 1. Serialization: In-memory map entries are serialized to JSON.
   * 2. Staging Write: Serialized data is written to a temporary sibling file (${storagePath}.tmp).
   * 3. Atomic Directory Swap: fs.rename performs an atomic POSIX rename(2) replacement.
   *    Concurrent readers see either the old full file or the new full file; never partial state.
   *    In the event of a power crash during writeFile, original storagePath is untouched.
   */
  private async persist(): Promise<void> {
    if (this.storagePath === ':memory:') {
      return;
    }
    
    // Capture the current promise before we overwrite it
    let releaseQueue: () => void = () => {};
    const nextQueuePromise = new Promise<void>(resolve => {
      releaseQueue = resolve;
    });

    const previousQueue = this.persistenceQueue;
    this.persistenceQueue = previousQueue.then(() => nextQueuePromise).catch(() => nextQueuePromise);

    await previousQueue.catch(() => {}); // Wait for queue to drain without failing our task

    try {
      const data = Array.from(this.memoryMap.values());
      const tempPath = `${this.storagePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tempPath, this.storagePath);
    } catch (err) {
      logger.error(this.component, 'persistence_failed', err);
      throw err;
    } finally {
      releaseQueue();
    }
  }

  async put(entry: MemoryEntry): Promise<void> {
    const validId = validateMemoryId(entry.id);
    entry.id = validId;

    // Enforce Cell Ownership: A cell cannot store entries belonging to another cell
    if (this.normalizedOwningCellId) {
      if (entry.cellId) {
        const normalizedEntryCell = validateCellId(entry.cellId);
        if (normalizedEntryCell !== this.normalizedOwningCellId) {
          throw new Error(
            `Memory ownership violation: Cell ${this.owningCellId} cannot store entry owned by Cell ${entry.cellId}`
          );
        }
        entry.cellId = this.owningCellId;
      } else {
        entry.cellId = this.owningCellId;
      }
    }

    // Default category if not specified
    if (!entry.category) {
      entry.category = MemoryCategory.SEMANTIC;
    }

    // Default version
    if (entry.version === undefined) {
      entry.version = 1;
    }

    // Ensure deterministic content hash if missing or empty
    if (!entry.hash || entry.hash === '') {
      entry.hash = computeDeterministicHash(entry.content);
    }

    // Ensure ISO timestamps
    if (!entry.createdAt) {
      entry.createdAt = new Date().toISOString();
    }
    if (!entry.updatedAt) {
      entry.updatedAt = new Date().toISOString();
    }

    // Ensure provenance tracking
    if (!Array.isArray(entry.provenance) || entry.provenance.length === 0) {
      entry.provenance = [entry.cellId || 'local'];
    }

    this.memoryMap.set(entry.id, entry);
    await this.persist();
    logger.debug(this.component, 'memory_put', { id: entry.id, category: entry.category, cellId: entry.cellId });
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const validId = validateMemoryId(id);
    const entry = this.memoryMap.get(validId);
    if (!entry) return null;
    if (this.normalizedOwningCellId && entry.cellId) {
      const normalizedEntryCell = validateCellId(entry.cellId);
      if (normalizedEntryCell !== this.normalizedOwningCellId) {
        return null;
      }
    }
    return entry;
  }

  async search(query: Partial<MemoryEntry>): Promise<MemoryEntry[]> {
    if (query.cellId) {
      const normalizedQueryCell = validateCellId(query.cellId);
      if (this.normalizedOwningCellId && normalizedQueryCell !== this.normalizedOwningCellId) {
        throw new Error('Memory ownership violation: Cannot enumerate or search memory belonging to another cell');
      }
    }

    const results: MemoryEntry[] = [];
    for (const entry of this.memoryMap.values()) {
      if (this.normalizedOwningCellId && entry.cellId) {
        const normalizedEntryCell = validateCellId(entry.cellId);
        if (normalizedEntryCell !== this.normalizedOwningCellId) {
          continue;
        }
      }

      let match = true;
      for (const [key, value] of Object.entries(query)) {
        if (key === 'cellId' && typeof value === 'string') {
          if (!entry.cellId || validateCellId(entry.cellId) !== validateCellId(value)) {
            match = false;
            break;
          }
          continue;
        }
        if ((entry as any)[key] !== value) {
          match = false;
          break;
        }
      }
      if (match) results.push(entry);
    }
    return results;
  }

  async delete(id: string): Promise<boolean> {
    const validId = validateMemoryId(id);
    const entry = this.memoryMap.get(validId);
    if (!entry) return false;
    if (this.normalizedOwningCellId && entry.cellId) {
      const normalizedEntryCell = validateCellId(entry.cellId);
      if (normalizedEntryCell !== this.normalizedOwningCellId) {
        throw new Error(`Memory ownership violation: Cannot delete memory belonging to another cell`);
      }
    }

    const deleted = this.memoryMap.delete(validId);
    if (deleted) {
      await this.persist();
      logger.debug(this.component, 'memory_deleted', { id: validId });
    }
    return deleted;
  }

  public getStats(): MemoryStats {
    let episodic = 0;
    let semantic = 0;
    let procedural = 0;

    for (const entry of this.memoryMap.values()) {
      if (this.normalizedOwningCellId && entry.cellId) {
        const normalizedEntryCell = validateCellId(entry.cellId);
        if (normalizedEntryCell !== this.normalizedOwningCellId) {
          continue;
        }
      }
      if (entry.category === MemoryCategory.EPISODIC) episodic++;
      else if (entry.category === MemoryCategory.PROCEDURAL) procedural++;
      else semantic++;
    }

    return {
      total: this.memoryMap.size,
      episodic,
      semantic,
      procedural
    };
  }
}
