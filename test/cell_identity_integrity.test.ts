import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import { Cell } from '../src/redqueen/core/cell';
import { identityCrypto } from '../src/redqueen/crypto/identity';

describe('Cell Identity Integrity', () => {
  const TEST_STORAGE = 'test_identity_integrity_storage.json';
  
  beforeEach(async () => {
    try {
      await fs.unlink(TEST_STORAGE);
    } catch (e) {}
  });

  it('should reject invalid private/public key pair', async () => {
    const kp1 = identityCrypto.generateKeyPair();
    const kp2 = identityCrypto.generateKeyPair();

    expect(() => {
      new Cell(
        TEST_STORAGE,
        'dummy-key',
        kp1.privateKey,
        kp2.publicKey // mismatched!
      );
    }).toThrow('Invalid cell identity: provided private and public keys are not a valid cryptographic pair.');
  });

  it('should fail closed when loading storage with state but missing identity', async () => {
    // Manually create a corrupt storage file (has entries but no identity)
    const fakeState = [
      { id: 'cell_genome_something', content: { traits: [] } }
    ];
    await fs.writeFile(TEST_STORAGE, JSON.stringify(fakeState));

    await expect(Cell.loadFromStorage(TEST_STORAGE, 'dummy-key'))
      .rejects.toThrow(/Corrupted cell storage: storage contains state but identity is missing or corrupted/);
  });

  it('should generate new identity when storage is completely empty', async () => {
    await fs.writeFile(TEST_STORAGE, JSON.stringify([]));

    const cell = await Cell.loadFromStorage(TEST_STORAGE, 'dummy-key');
    expect(cell.privateKey).toBeDefined();
    expect(cell.publicKey).toBeDefined();
    expect(cell.nodeId).toBeDefined();
    
    // nodeId must be derived from public key
    expect(cell.nodeId).toBe(identityCrypto.deriveNodeId(cell.publicKey));
  });
});
