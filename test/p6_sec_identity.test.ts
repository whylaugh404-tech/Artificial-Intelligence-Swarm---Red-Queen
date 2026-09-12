import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import * as fs from 'fs/promises';
import * as path from 'path';
import { identityCrypto } from '../src/redqueen/crypto/identity';

describe('SEC-01 & SEC-03: Identity Protection & Validation', () => {
  const TEST_DIR = './test/.test_identity_sec';
  
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should not allow mismatched private/public keys on creation', () => {
    const kp1 = identityCrypto.generateKeyPair();
    const kp2 = identityCrypto.generateKeyPair();
    
    expect(() => {
      new Cell(`${TEST_DIR}/mem.json`, 'mock-key', kp1.privateKey, kp2.publicKey);
    }).toThrow('identity corruption');
  });

  it('should store identity in a separate .identity file, not in memory.json', async () => {
    const storagePath = `${TEST_DIR}/mem_isolated.json`;
    const cell = new Cell(storagePath, 'mock-key');
    await cell.start(0);
    
    // Read the main memory JSON
    const memData = await fs.readFile(storagePath, 'utf8');
    const entries = JSON.parse(memData);
    
    const hasIdentity = entries.some((e: any) => e.id.startsWith('cell_identity_'));
    expect(hasIdentity).toBe(false); // Must not be in the generic memory json
    
    // Identity must exist in .identity
    const idData = await fs.readFile(`${storagePath}.identity`, 'utf8');
    const identity = JSON.parse(idData);
    expect(identity.privateKey).toBe(cell.privateKey);
    
    await cell.stop();
  });

  it('should restore identity correctly from .identity using loadFromStorage', async () => {
    const storagePath = `${TEST_DIR}/mem_isolated.json`;
    const cell = await Cell.loadFromStorage(storagePath, 'mock-key');
    
    expect(cell.privateKey).toBeDefined();
    
    const idData = await fs.readFile(`${storagePath}.identity`, 'utf8');
    const identity = JSON.parse(idData);
    expect(cell.privateKey).toBe(identity.privateKey);
    expect(cell.publicKey).toBe(identity.publicKey);
    expect(cell.nodeId).toBe(identity.nodeId);
    
    await cell.stop();
  });
  
  it('should fail recovery if identity is completely missing and isRecovery is set', () => {
    expect(() => {
      new Cell(`${TEST_DIR}/mem_no_id.json`, 'mock-key', undefined, undefined, undefined, { isRecovery: true });
    }).toThrow('missing existing identity keys');
  });
});
