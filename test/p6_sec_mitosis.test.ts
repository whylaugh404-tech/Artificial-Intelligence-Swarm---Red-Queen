import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { MitosisEngine } from '../src/redqueen/reproduction/mitosis';
import { GovernanceEnforcer } from '../src/redqueen/reproduction/policy';
import * as fs from 'fs/promises';

describe('SEC-05: P6 Cross-Process Reproduction Locking', () => {
  const TEST_DIR = './test/.test_mitosis_sec';
  let engine: MitosisEngine;
  let cell: Cell;

  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    const gov = new GovernanceEnforcer({ requireAuthorization: false, populationCeiling: 10 });
    engine = new MitosisEngine(gov);
    cell = new Cell(`${TEST_DIR}/parent.json`, 'mock-key');
    await cell.start(0);
  });

  afterAll(async () => {
    await cell.stop();
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should timeout if cross-process lock is held', async () => {
    const lockPath = `${TEST_DIR}/global_mitosis.lock`;
    
    // Simulate another process holding the lock
    await fs.mkdir(lockPath);
    
    // This should fail to acquire lock
    const res = await engine.reproduce(cell, {
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'mock-key'
    });
    
    expect(res.result.success).toBe(false);
    expect(res.result.errors).toContain('Global cross-process reproduction lock timeout');
    
    // Clean up
    await fs.rm(lockPath, { recursive: true, force: true });
  }, 20000); // give it time to exhaust attempts

  it('should use dynamic population count from storage', async () => {
     // Create 10 mock cells to simulate population limit
     for(let i=0; i<10; i++) {
        await fs.writeFile(`${TEST_DIR}/cell_mock_${i}.json`, '{}');
     }
     
     // Even if we pass currentPopulation = 1, it should read 10 from fs and deny!
     const res = await engine.reproduce(cell, {
        storageBasePath: TEST_DIR,
        currentPopulation: 1, // Maliciously lying about population
        openRouterApiKey: 'mock-key'
     });
     
     expect(res.result.success).toBe(false);
     const hasPopulationError = res.result.errors?.some(e => e.includes('Population ceiling'));
     expect(hasPopulationError).toBe(true);
  });
});
