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

export class JsonFileMemoryStore implements MemoryStore {
  private memoryMap: Map<string, MemoryEntry> = new Map();
  private readonly component = 'memory_store';

  constructor(
    private readonly storagePath: string,
    private readonly owningCellId?: string
  ) {}

  public getOwningCellId(): string | undefined {
    return this.owningCellId;
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
      try {
        const data = await fs.readFile(this.storagePath, 'utf8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            // If store is scoped to a specific cell, enforce isolation
            if (this.owningCellId && entry.cellId && entry.cellId !== this.owningCellId) {
              logger.warn(this.component, 'foreign_cell_memory_skipped', {
                expectedCell: this.owningCellId,
                foundCell: entry.cellId,
                memoryId: entry.id
              });
              continue;
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

  private async persist(): Promise<void> {
    const data = Array.from(this.memoryMap.values());
    const tempPath = `${this.storagePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tempPath, this.storagePath);
  }

  async put(entry: MemoryEntry): Promise<void> {
    // Enforce Cell Ownership: A cell cannot store entries belonging to another cell
    if (this.owningCellId) {
      if (entry.cellId && entry.cellId !== this.owningCellId) {
        throw new Error(
          `Memory ownership violation: Cell ${this.owningCellId} cannot store entry owned by Cell ${entry.cellId}`
        );
      }
      if (!entry.cellId) {
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

    this.memoryMap.set(entry.id, entry);
    await this.persist();
    logger.debug(this.component, 'memory_put', { id: entry.id, category: entry.category, cellId: entry.cellId });
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const entry = this.memoryMap.get(id);
    if (!entry) return null;
    if (this.owningCellId && entry.cellId && entry.cellId !== this.owningCellId) {
      return null;
    }
    return entry;
  }

  async search(query: Partial<MemoryEntry>): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    for (const entry of this.memoryMap.values()) {
      if (this.owningCellId && entry.cellId && entry.cellId !== this.owningCellId) {
        continue;
      }

      let match = true;
      for (const [key, value] of Object.entries(query)) {
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
    const entry = this.memoryMap.get(id);
    if (!entry) return false;
    if (this.owningCellId && entry.cellId && entry.cellId !== this.owningCellId) {
      throw new Error(`Memory ownership violation: Cannot delete memory belonging to another cell`);
    }

    const deleted = this.memoryMap.delete(id);
    if (deleted) {
      await this.persist();
      logger.debug(this.component, 'memory_deleted', { id });
    }
    return deleted;
  }

  public getStats(): MemoryStats {
    let episodic = 0;
    let semantic = 0;
    let procedural = 0;

    for (const entry of this.memoryMap.values()) {
      if (this.owningCellId && entry.cellId && entry.cellId !== this.owningCellId) {
        continue;
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
