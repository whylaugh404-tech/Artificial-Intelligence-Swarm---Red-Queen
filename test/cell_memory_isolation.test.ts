import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { JsonFileMemoryStore, MemoryCategory, MemoryEntry } from '../src/redqueen/memory/store';

describe('P3: Cell Memory Isolation & Ownership', () => {
  const STORAGE_CELL_A = './data/test_cell_a_mem.json';
  const STORAGE_CELL_B = './data/test_cell_b_mem.json';
  const SHARED_STORAGE = './data/test_shared_mem.json';

  const CELL_A = 'cell_alpha_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const CELL_B = 'cell_beta_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  beforeEach(async () => {
    try { await fs.unlink(STORAGE_CELL_A); } catch {}
    try { await fs.unlink(STORAGE_CELL_B); } catch {}
    try { await fs.unlink(SHARED_STORAGE); } catch {}
  });

  afterEach(async () => {
    try { await fs.unlink(STORAGE_CELL_A); } catch {}
    try { await fs.unlink(STORAGE_CELL_B); } catch {}
    try { await fs.unlink(SHARED_STORAGE); } catch {}
  });

  it('24. maintains total data isolation between distinct cells in separate stores', async () => {
    const storeA = new JsonFileMemoryStore(STORAGE_CELL_A, CELL_A);
    const storeB = new JsonFileMemoryStore(STORAGE_CELL_B, CELL_B);

    await storeA.initialize();
    await storeB.initialize();

    await storeA.put({
      id: 'recon_target_1',
      cellId: CELL_A,
      category: MemoryCategory.EPISODIC,
      content: { ip: '192.168.1.100', openPorts: [80, 443] },
      source: 'osint_recon',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 0.95,
      hash: '',
      provenance: [CELL_A]
    });

    const foundInA = await storeA.get('recon_target_1');
    expect(foundInA).not.toBeNull();
    expect(foundInA?.content.ip).toBe('192.168.1.100');

    // Cell B has no access to Cell A's memory
    const foundInB = await storeB.get('recon_target_1');
    expect(foundInB).toBeNull();

    const searchB = await storeB.search({});
    expect(searchB.length).toBe(0);
  });

  it('25. enforces memory ownership: throws error if cell attempts to store entry owned by another cell', async () => {
    const storeA = new JsonFileMemoryStore(STORAGE_CELL_A, CELL_A);
    await storeA.initialize();

    const foreignEntry: MemoryEntry = {
      id: 'entry_foreign',
      cellId: CELL_B, // Wrong cell!
      category: MemoryCategory.SEMANTIC,
      content: { data: 'secret' },
      source: 'foreign_agent',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1.0,
      hash: '',
      provenance: [CELL_B]
    };

    await expect(storeA.put(foreignEntry)).rejects.toThrow(/Memory ownership violation/);
  });

  it('26. automatically assigns cellId if omitted when writing to a scoped store', async () => {
    const storeA = new JsonFileMemoryStore(STORAGE_CELL_A, CELL_A);
    await storeA.initialize();

    const entry: MemoryEntry = {
      id: 'auto_scoped_entry',
      category: MemoryCategory.PROCEDURAL,
      content: { rule: 'rate_limit_requests' },
      source: 'policy',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1.0,
      hash: '',
      provenance: []
    };

    await storeA.put(entry);

    const saved = await storeA.get('auto_scoped_entry');
    expect(saved?.cellId).toBe(CELL_A);
  });

  it('27. classifies memories into EPISODIC, SEMANTIC, and PROCEDURAL categories', async () => {
    const store = new JsonFileMemoryStore(STORAGE_CELL_A, CELL_A);
    await store.initialize();

    await store.put({
      id: 'ep_1',
      category: MemoryCategory.EPISODIC,
      content: { event: 'port_scan_completed' },
      source: 'scanner',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1.0,
      hash: '',
      provenance: [CELL_A]
    });

    await store.put({
      id: 'sem_1',
      category: MemoryCategory.SEMANTIC,
      content: { fact: 'nginx_vulnerable_cve' },
      source: 'vuln_db',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1.0,
      hash: '',
      provenance: [CELL_A]
    });

    await store.put({
      id: 'proc_1',
      category: MemoryCategory.PROCEDURAL,
      content: { procedure: 'backoff_retry_algorithm' },
      source: 'kernel',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1.0,
      hash: '',
      provenance: [CELL_A]
    });

    const stats = store.getStats!();
    expect(stats.total).toBe(3);
    expect(stats.episodic).toBe(1);
    expect(stats.semantic).toBe(1);
    expect(stats.procedural).toBe(1);

    const episodicSearch = await store.search({ category: MemoryCategory.EPISODIC });
    expect(episodicSearch.length).toBe(1);
    expect(episodicSearch[0].id).toBe('ep_1');
  });

  it('28. filters out foreign cell records if loaded into a cell-scoped memory store', async () => {
    // Write raw data with entries from both Cell A and Cell B
    const mixedData = [
      {
        id: 'mem_a',
        cellId: CELL_A,
        category: MemoryCategory.SEMANTIC,
        content: { info: 'for A' },
        source: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1.0,
        hash: '',
        provenance: [CELL_A]
      },
      {
        id: 'mem_b',
        cellId: CELL_B,
        category: MemoryCategory.SEMANTIC,
        content: { info: 'for B' },
        source: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1.0,
        hash: '',
        provenance: [CELL_B]
      }
    ];

    await fs.writeFile(SHARED_STORAGE, JSON.stringify(mixedData, null, 2), 'utf8');

    // Load store scoped to Cell A
    const storeA = new JsonFileMemoryStore(SHARED_STORAGE, CELL_A);
    await storeA.initialize();

    expect(await storeA.get('mem_a')).not.toBeNull();
    expect(await storeA.get('mem_b')).toBeNull(); // Foreign entry is excluded
    expect(storeA.getStats!().total).toBe(1);
  });
});
