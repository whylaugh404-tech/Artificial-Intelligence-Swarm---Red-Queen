import { describe, it, expect } from 'vitest';
import { IdentityCrypto } from '../src/redqueen/crypto/identity';

describe('IdentityCrypto', () => {
  it('should generate a keypair and derive a node ID', () => {
    const crypto = new IdentityCrypto();
    const kp = crypto.generateKeyPair();
    expect(kp.publicKey).toBeDefined();
    expect(kp.privateKey).toBeDefined();
    
    const nodeId = crypto.deriveNodeId(kp.publicKey);
    expect(nodeId).toBeDefined();
    expect(typeof nodeId).toBe('string');
  });
});
