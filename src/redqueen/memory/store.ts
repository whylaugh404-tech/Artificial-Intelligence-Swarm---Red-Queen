import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../core/logger';

export interface MemoryEntry {
  id: string;
  content: any;
  source: string;
  createdAt: string;
  updatedAt: string;
  confidence: number;
  hash: string;
  provenance: string[];
}

export interface MemoryStore {
  put(entry: MemoryEntry): Promise<void>;
  get(id: string): Promise<MemoryEntry | null>;
  search(query: Partial<MemoryEntry>): Promise<MemoryEntry[]>;
  delete(id: string): Promise<boolean>;
}

export class JsonFileMemoryStore implements MemoryStore {
  private memoryMap: Map<string, MemoryEntry> = new Map();
  private readonly component = 'memory_store';

  constructor(private readonly storagePath: string) {}

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
      try {
        const data = await fs.readFile(this.storagePath, 'utf8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            this.memoryMap.set(entry.id, entry);
          }
        }
        logger.info(this.component, 'memory_loaded', { count: this.memoryMap.size });
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
    // Use an atomic write approach (write to temp file, then rename) to prevent corruption
    const tempPath = `${this.storagePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tempPath, this.storagePath);
  }

  async put(entry: MemoryEntry): Promise<void> {
    this.memoryMap.set(entry.id, entry);
    await this.persist();
    logger.debug(this.component, 'memory_put', { id: entry.id });
  }

  async get(id: string): Promise<MemoryEntry | null> {
    return this.memoryMap.get(id) || null;
  }

  async search(query: Partial<MemoryEntry>): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    for (const entry of this.memoryMap.values()) {
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
    const deleted = this.memoryMap.delete(id);
    if (deleted) {
      await this.persist();
      logger.debug(this.component, 'memory_deleted', { id });
    }
    return deleted;
  }
}
