import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { Cell } from '../src/redqueen/core/cell';
import { CellState } from '../src/redqueen/core/lifecycle';

describe('Cell Lifecycle Concurrency & Idempotency Audit', () => {
  const TEST_STORAGE = './data/test_lifecycle_cell.json';
  const DUMMY_API_KEY = 'sk-or-v1-0000000000000000000000000000000000000000000000000000000000000000';

  beforeEach(async () => {
    try { await fs.unlink(TEST_STORAGE); } catch {}
  });

  afterEach(async () => {
    try { await fs.unlink(TEST_STORAGE); } catch {}
  });

  it('follows CREATED -> INITIALIZING -> ACTIVE transition', async () => {
    const cell = new Cell(TEST_STORAGE, DUMMY_API_KEY);
    expect(cell.lifecycle.getState()).toBe(CellState.CREATED);

    await cell.start();
    expect(cell.lifecycle.getState()).toBe(CellState.ACTIVE);
    expect(cell.cognitiveState.getState().lifecycleState).toBe(CellState.ACTIVE);

    await cell.stop();
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);
  });

  it('executes ACTIVE -> SHUTTING_DOWN -> STOPPED -> INITIALIZING -> ACTIVE repeatedly', async () => {
    const cell = new Cell(TEST_STORAGE, DUMMY_API_KEY);
    
    // Cycle 1
    await cell.start(34120);
    expect(cell.lifecycle.getState()).toBe(CellState.ACTIVE);
    await cell.stop();
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);

    // Cycle 2: restart
    await cell.start();
    expect(cell.lifecycle.getState()).toBe(CellState.ACTIVE);
    expect(cell.cognitiveState.getState().lifecycleState).toBe(CellState.ACTIVE);
    await cell.stop();
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);

    // Cycle 3: restart again
    await cell.start(34120);
    expect(cell.lifecycle.getState()).toBe(CellState.ACTIVE);
    await cell.stop();
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);
  });

  it('guarantees shutdown is idempotent without duplicate hook execution or resource corruption', async () => {
    const cell = new Cell(TEST_STORAGE, DUMMY_API_KEY);
    await cell.start();

    // Call stop() multiple times concurrently
    const [r1, r2, r3] = await Promise.allSettled([
      cell.stop(),
      cell.stop(),
      cell.stop()
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
    expect(r3.status).toBe('fulfilled');
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);

    // Calling stop() sequentially again on already STOPPED cell
    await expect(cell.stop()).resolves.toBeUndefined();
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);
  });

  it('prevents transition race between concurrent start() and stop() calls', async () => {
    const cell = new Cell(TEST_STORAGE, DUMMY_API_KEY);

    // Launch start() and stop() concurrently
    const [startResult, stopResult] = await Promise.allSettled([
      cell.start(),
      cell.stop()
    ]);

    expect(startResult.status).toBe('fulfilled');
    expect(stopResult.status).toBe('fulfilled');
    // Because start was queued before stop, end state must be STOPPED
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);

    // Starting again after concurrent resolution must work smoothly
    await cell.start();
    expect(cell.lifecycle.getState()).toBe(CellState.ACTIVE);
    await cell.stop();
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);
  });

  it('handles multiple concurrent start() calls idempotently', async () => {
    const cell = new Cell(TEST_STORAGE, DUMMY_API_KEY);

    const [s1, s2, s3] = await Promise.allSettled([
      cell.start(),
      cell.start(),
      cell.start()
    ]);

    expect(s1.status).toBe('fulfilled');
    expect(s2.status).toBe('fulfilled');
    expect(s3.status).toBe('fulfilled');
    expect(cell.lifecycle.getState()).toBe(CellState.ACTIVE);

    await cell.stop();
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);
  });

  it('keeps subsystems safe and functioning through start -> stop -> start', async () => {
    const cell = new Cell(TEST_STORAGE, DUMMY_API_KEY);
    await cell.start(34125);

    expect(cell.transport.getActivePeerCount()).toBe(0);
    expect(cell.swarm.getMembershipState(cell.nodeId)).toBeDefined();

    // Stop cell
    await cell.stop();
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);

    // Restart cell
    await cell.start();
    expect(cell.lifecycle.getState()).toBe(CellState.ACTIVE);

    // Verify status reports cleanly without error
    const status = cell.getStatus();
    expect(status.state).toBe(CellState.ACTIVE);
    expect(status.nodeId).toBe(cell.nodeId);

    await cell.stop();
  });

  it('allows stopping a CREATED cell and subsequently starting it cleanly', async () => {
    const cell = new Cell(TEST_STORAGE, DUMMY_API_KEY);
    expect(cell.lifecycle.getState()).toBe(CellState.CREATED);

    // Stop before ever starting
    await cell.shutdown();
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);

    // Starting from STOPPED must follow STOPPED -> INITIALIZING -> ACTIVE
    await cell.start();
    expect(cell.lifecycle.getState()).toBe(CellState.ACTIVE);

    await cell.stop();
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);
  });

  it('recovers cleanly when initialization fails and transitions through SHUTTING_DOWN -> STOPPED', async () => {
    const cell = new Cell(TEST_STORAGE, DUMMY_API_KEY);
    
    // Simulate failure during start by temporarily breaking memory.initialize
    const originalInit = cell.memory.initialize;
    cell.memory.initialize = async () => {
      throw new Error('Simulated memory storage IO failure');
    };

    await expect(cell.start()).rejects.toThrow('Simulated memory storage IO failure');
    // State must be cleanly STOPPED after failing
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);

    // Restore memory initialize and retry start
    cell.memory.initialize = originalInit;
    await cell.start();
    expect(cell.lifecycle.getState()).toBe(CellState.ACTIVE);

    await cell.stop();
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);
  });

  it('handles interleaved concurrent start(), stop(), and shutdown() storm safely without corruption', async () => {
    const cell = new Cell(TEST_STORAGE, DUMMY_API_KEY);

    // Launch a flurry of concurrent lifecycle actions
    const actions = [
      cell.start(),
      cell.shutdown(),
      cell.start(),
      cell.stop(),
      cell.shutdown(),
      cell.start()
    ];

    const results = await Promise.allSettled(actions);
    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }

    // Because the last action in the serialized queue was start(), final state must be ACTIVE
    expect(cell.lifecycle.getState()).toBe(CellState.ACTIVE);

    // Clean up
    await cell.stop();
    expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);
  });
});
