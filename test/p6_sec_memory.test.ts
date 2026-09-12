import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JsonFileMemoryStore, MemoryCategory } from '../src/redqueen/memory/store';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';

describe('SEC-04: MemoryStore Defensive Copy & Concurrency', () => {
  const TEST_DIR = './test/.test_memory_sec';
  
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should return defensive copies in get and search', async () => {
    const store = new JsonFileMemoryStore(`${TEST_DIR}/mem1.json`);
    await store.initialize();
    
    await store.put({
      id: 'test-1',
      content: { secret: 'safe' },
      source: 'test',
      createdAt: '', updatedAt: '', confidence: 1, hash: '', provenance: []
    });
    
    // Mutate the returned object
    const entry = await store.get('test-1');
    expect(entry).toBeDefined();
    entry!.content.secret = 'hacked';
    
    // Original should remain intact
    const verify = await store.get('test-1');
    expect(verify!.content.secret).toBe('safe');
    
    // Search defensive copy
    const searchRes = await store.search({ id: 'test-1' });
    searchRes[0].content.secret = 'hacked-search';
    
    const verify2 = await store.get('test-1');
    expect(verify2!.content.secret).toBe('safe');
  });
  
  it('should detect stale updates (optimistic locking)', async () => {
     const path = `${TEST_DIR}/mem2.json`;
     const store1 = new JsonFileMemoryStore(path);
     await store1.initialize();
     
     await store1.put({
       id: 'concur-1',
       content: { count: 1 },
       source: 'test', createdAt: '', updatedAt: '', confidence: 1, hash: '', provenance: []
     });
     
     const store2 = new JsonFileMemoryStore(path);
     await store2.initialize(); // loads from disk, version 1
     
     const e1 = await store1.get('concur-1');
     const e2 = await store2.get('concur-1');
     
     // Store 1 updates it
     e1!.content.count = 2;
     await store1.put(e1!); // writes version 2
     
     // Store 2 tries to update stale object
     e2!.content.count = 99;
     await expect(store2.put(e2!)).rejects.toThrow(/Concurrency Conflict/);
  });
});
