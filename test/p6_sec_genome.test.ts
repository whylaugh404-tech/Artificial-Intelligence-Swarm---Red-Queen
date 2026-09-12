import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import * as fs from 'fs/promises';
import { createGenesisGenome } from '../src/redqueen/genome';
import { deriveProgenyGenome } from '../src/redqueen/genome/genome';
import { identityCrypto } from '../src/redqueen/crypto/identity';

describe('GEN-01 & GEN-02 & GEN-03: Genome Integrity', () => {
  const TEST_DIR = './test/.test_genome_sec';
  
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should initialize genesis genome on new cell', () => {
    const cell = new Cell(`${TEST_DIR}/mem1.json`, 'mock-key');
    expect(cell.genome.generation).toBe(0);
  });

  it('should reject malformed genome during recovery and fail closed', () => {
    const badGenome = {
      genomeId: 'abc', // Missing other required fields
    };
    const kp = identityCrypto.generateKeyPair();
    
    expect(() => {
      new Cell(`${TEST_DIR}/mem2.json`, 'mock-key', kp.privateKey, kp.publicKey, undefined, {
        isRecovery: true,
        genome: badGenome as any
      });
    }).toThrow('Cell recovery failed: corrupted genome in storage');
  });

  it('should reject missing parentCellId for generation > 0', () => {
    const parentGenome = createGenesisGenome();
    const childGenome = deriveProgenyGenome(parentGenome, 'parent-cell-id', {});
    
    // Corrupt it
    const corruptedChild: any = { ...childGenome };
    corruptedChild.parentCellId = null;

    const kp = identityCrypto.generateKeyPair();
    expect(() => {
      new Cell(`${TEST_DIR}/mem3.json`, 'mock-key', kp.privateKey, kp.publicKey, undefined, {
        isRecovery: true,
        genome: corruptedChild
      });
    }).toThrow('parentCellId must be defined for generation > 0');
  });
  
  it('should not silently overwrite corrupted genome with genesis genome', async () => {
    const storagePath = `${TEST_DIR}/mem4.json`;
    const parentGenome = createGenesisGenome();
    
    const kp = identityCrypto.generateKeyPair();
    // Attempting to instantiate recovery with invalid genome should throw
    // The previous implementation used to catch this in restoreOrPersistGenome and overwrite.
    expect(() => {
      new Cell(storagePath, 'mock-key', kp.privateKey, kp.publicKey, undefined, {
        isRecovery: true,
        genome: { ...parentGenome, generation: -1 } as any
      });
    }).toThrow('generation must be a non-negative integer');
  });

  it('should restore valid genome successfully', async () => {
    const storagePath = `${TEST_DIR}/mem5.json`;
    const cellA = new Cell(storagePath, 'mock-key');
    await cellA.start(0);
    const genomeId = cellA.genome.genomeId;
    await cellA.stop();
    
    const cellB = await Cell.loadFromStorage(storagePath, 'mock-key');
    expect(cellB.genome.genomeId).toBe(genomeId);
  });
});
