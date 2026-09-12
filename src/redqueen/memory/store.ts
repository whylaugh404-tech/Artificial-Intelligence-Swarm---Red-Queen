import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../core/logger';

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
  private lastMtimeMs: number = 0;

  constructor(
    private readonly storagePath: string,
    private readonly owningCellId?: string
  ) {
    if (this.owningCellId) {
      this.normalizedOwningCellId = validateCellId(this.owningCellId);
    }
  }

  public getStoragePath(): string {
    return this.storagePath;
  }

  public getOwningCellId(): string | undefined {
    return this.owningCellId;
  }

  /**
   * Re-synchronizes in-memory map with on-disk state if the file was modified externally.
   * Merges external entries to avoid last-writer-wins clobbering across processes.
   */
  public async syncWithDisk(): Promise<void> {
    try {
      const stat = await fs.stat(this.storagePath);
      if (stat.mtimeMs !== this.lastMtimeMs) {
        const data = await fs.readFile(this.storagePath, 'utf8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (!entry || !entry.id) continue;
            try {
              validateMemoryId(entry.id);
            } catch {
              continue;
            }

            if (this.normalizedOwningCellId && entry.cellId) {
              try {
                const normalizedEntryCell = validateCellId(entry.cellId);
                if (normalizedEntryCell !== this.normalizedOwningCellId) {
                  continue;
                }
              } catch {
                continue;
              }
            }

            const existing = this.memoryMap.get(entry.id);
            if (!existing) {
              this.memoryMap.set(entry.id, entry);
            } else {
              const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
              const diskTime = entry.updatedAt ? new Date(entry.updatedAt).getTime() : 0;
              if (diskTime >= existingTime) {
                this.memoryMap.set(entry.id, entry);
              }
            }
          }
        }
        this.lastMtimeMs = stat.mtimeMs;
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        logger.debug(this.component, 'sync_with_disk_ignored', { error: err.message });
      }
    }
  }

  async initialize(): Promise<void> {
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
        try {
          const stat = await fs.stat(this.storagePath);
          this.lastMtimeMs = stat.mtimeMs;
        } catch {}
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

  private async acquireLock(): Promise<void> {
    const lockPath = `${this.storagePath}.lock`;
    let attempts = 0;
    while (attempts < 50) {
      try {
        await fs.mkdir(lockPath);
        return;
      } catch (err: any) {
        if (err.code === 'EEXIST') {
          try {
            const stat = await fs.stat(lockPath);
            if (Date.now() - stat.mtimeMs > 5000) {
               await fs.rm(lockPath, { recursive: true, force: true });
               continue;
            }
          } catch (e) {
             // likely removed
          }
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        } else {
          throw err;
        }
      }
    }
    throw new Error('Timeout acquiring lock on memory store');
  }

  private async releaseLock(): Promise<void> {
    const lockPath = `${this.storagePath}.lock`;
    try {
      await fs.rm(lockPath, { recursive: true, force: true });
    } catch {}
  }

  private async syncFromDisk(): Promise<void> {
     try {
        const data = await fs.readFile(this.storagePath, 'utf8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
           this.memoryMap.clear();
           for (const entry of parsed) {
              this.memoryMap.set(entry.id, entry);
           }
        }
     } catch (err: any) {
        if (err.code !== 'ENOENT') throw err;
     }
  }

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
    const data = Array.from(this.memoryMap.values());
    const tempPath = `${this.storagePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tempPath, this.storagePath);
    try {
      const stat = await fs.stat(this.storagePath);
      this.lastMtimeMs = stat.mtimeMs;
    } catch {}
  }

  async put(entry: MemoryEntry): Promise<void> {
    await this.syncWithDisk();
    const validId = validateMemoryId(entry.id);
    const clonedEntry = JSON.parse(JSON.stringify(entry)) as MemoryEntry;
    clonedEntry.id = validId;

    // Enforce Cell Ownership: A cell cannot store entries belonging to another cell
    if (this.normalizedOwningCellId) {
      if (clonedEntry.cellId) {
        const normalizedEntryCell = validateCellId(clonedEntry.cellId);
        if (normalizedEntryCell !== this.normalizedOwningCellId) {
          throw new Error(
            `Memory ownership violation: Cell ${this.owningCellId} cannot store entry owned by Cell ${clonedEntry.cellId}`
          );
        }
        clonedEntry.cellId = this.owningCellId;
      } else {
        clonedEntry.cellId = this.owningCellId;
      }
    }

    // Default category if not specified
    if (!clonedEntry.category) {
      clonedEntry.category = MemoryCategory.SEMANTIC;
    }

    // Default version
    const callerProvidedVersion = entry.version !== undefined;
    if (clonedEntry.version === undefined) {
      clonedEntry.version = 1;
    }

    // Attempt concurrent-safe write
    await this.acquireLock();
    try {
      await this.syncFromDisk(); // Refresh map
      const existing = this.memoryMap.get(validId);
      if (existing && existing.version && callerProvidedVersion && clonedEntry.version) {
         // If caller's version is less than what's on disk, they are trying to write over a newer change
         if (clonedEntry.version < existing.version) {
           throw new Error(`Concurrency Conflict: Attempted to write stale version for ${validId}. Expected >= ${existing.version}, got ${clonedEntry.version}`);
         }
      }
      if (existing) {
         clonedEntry.version = existing.version ? existing.version + 1 : 2;
      }
      this.memoryMap.set(validId, clonedEntry);
      
      // Update caller's object version so they can do subsequent puts
      entry.version = clonedEntry.version;
      
      await this.persist();
    } finally {
      await this.releaseLock();
    }

    logger.debug(this.component, 'memory_put', { id: validId, category: clonedEntry.category, cellId: clonedEntry.cellId });
  }

  async get(id: string): Promise<MemoryEntry | null> {
    await this.syncWithDisk();
    const validId = validateMemoryId(id);
    const entry = this.memoryMap.get(validId);
    if (!entry) return null;
    if (this.normalizedOwningCellId && entry.cellId) {
      const normalizedEntryCell = validateCellId(entry.cellId);
      if (normalizedEntryCell !== this.normalizedOwningCellId) {
        return null;
      }
    }
    return JSON.parse(JSON.stringify(entry)); // Defensive copy
  }

  async search(query: Partial<MemoryEntry>): Promise<MemoryEntry[]> {
    await this.syncWithDisk();
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
      if (match) results.push(JSON.parse(JSON.stringify(entry))); // Defensive copy
    }
    return results;
  }

  async delete(id: string): Promise<boolean> {
    await this.syncWithDisk();
    const validId = validateMemoryId(id);
    
    await this.acquireLock();
    let deleted = false;
    try {
      await this.syncFromDisk();
      const entry = this.memoryMap.get(validId);
      if (!entry) return false;
      if (this.normalizedOwningCellId && entry.cellId) {
        const normalizedEntryCell = validateCellId(entry.cellId);
        if (normalizedEntryCell !== this.normalizedOwningCellId) {
          throw new Error(`Memory ownership violation: Cannot delete memory belonging to another cell`);
        }
      }

      deleted = this.memoryMap.delete(validId);
      if (deleted) {
        await this.persist();
      }
    } finally {
      await this.releaseLock();
    }
    
    if (deleted) {
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
