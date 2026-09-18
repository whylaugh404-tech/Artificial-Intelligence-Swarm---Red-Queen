import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import { Cell } from '../src/redqueen/core/cell';
import { CellState } from '../src/redqueen/core/lifecycle';
import { createGenesisGenome, CellGenome } from '../src/redqueen/genome';
import { CognitiveStateManager } from '../src/redqueen/cognition/state';
import { CellStateManager } from '../src/redqueen/core/state/engine';

describe('Genome and CognitiveState Integrity', () => {
  const TEST_STORAGE = 'test_integrity_storage.json';

  beforeEach(async () => {
    try {
      await fs.unlink(TEST_STORAGE);
    } catch (e) {
      // Ignore if file doesn't exist
    }
  });

  it('should initialize in correct order and synchronize CognitiveState with Genome', async () => {
    // 1. Create a cell with an initial specialization
    const cell = new Cell(TEST_STORAGE, 'dummy-key', undefined, undefined, undefined, {
      specialization: 'initial-specialization'
    });

    await cell.start();
    expect(cell.genome.specialization).toBe('initial-specialization');
    expect(cell.cognitiveState.getSpecialization()).toBe('initial-specialization');
    
    // Stop cell so we can simulate a runtime change
    await cell.stop();

    // 2. We simulate a restored Genome with a completely different specialization
    const newGenome = createGenesisGenome({
      specialization: 'new-restored-specialization'
    });
    
    // If a genome is restored directly at runtime, cognitiveState should sync
    cell.restoreGenome(newGenome);
    
    expect(cell.genome.specialization).toBe('new-restored-specialization');
    expect(cell.cognitiveState.getSpecialization()).toBe('new-restored-specialization');
  });

  it('should sync specialized capability when CellStateManager applies GENOME_SYNCHRONIZATION', () => {
    const manager = new CellStateManager();
    
    const initialState = manager.createInitialState({
      cellIdentity: 'cell-123',
      genomeReference: 'gen-0',
      memoryState: {},
      knowledgeState: {},
      cognitiveState: {},
      reasoningState: {},
      experienceState: {},
      computationalCapability: {
        architecture: 'A1',
        capacity: 100,
        parallelism: 1,
        memoryLimit: 1024,
        availability: 1.0,
        communicationProfile: {}
      },
      specializations: [],
      lifecycle: 'ACTIVE' as any,
      provenance: ['cell-123']
    });

    // Emulate a genome sync
    const syncResult = manager.syncWithGenome(
      initialState,
      'gen-1',
      [{ domain: 'new-domain', focusAreas: ['test'], level: 1.0 }],
      { ...initialState.computationalCapability, architecture: 'A2' },
      ['cell-123']
    );

    expect(syncResult.newState.genomeReference).toBe('gen-1');
    expect(syncResult.newState.specializations[0].domain).toBe('new-domain');
    expect(syncResult.newState.computationalCapability.architecture).toBe('A2');
    expect(syncResult.transition.transitionType).toBe('GENOME_SYNCHRONIZATION');
  });
});
