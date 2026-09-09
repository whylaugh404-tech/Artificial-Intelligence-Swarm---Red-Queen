import { describe, it, expect } from 'vitest';
import {
  isValidNodeId,
  validateNodeId,
  validateEndpoint,
  validatePeerIdentity,
  FindNodePayloadSchema,
  FindNodeResponsePayloadSchema
} from '../src/redqueen/validation/validators';
import { identityCrypto } from '../src/redqueen/crypto/identity';

describe('Validation & Protocol Resource Limits', () => {
  const validId = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  describe('Node ID Validation', () => {
    it('accepts strictly valid 64-character lowercase hex IDs', () => {
      expect(isValidNodeId(validId)).toBe(true);
      expect(validateNodeId(validId).valid).toBe(true);
    });

    it('rejects uppercase hex characters', () => {
      const upper = validId.toUpperCase();
      expect(isValidNodeId(upper)).toBe(false);
      const res = validateNodeId(upper);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('lowercase');
    });

    it('rejects incorrect lengths', () => {
      expect(isValidNodeId(validId.slice(0, 63))).toBe(false);
      expect(isValidNodeId(validId + '0')).toBe(false);
      expect(isValidNodeId('')).toBe(false);
    });

    it('rejects non-hex characters and symbols', () => {
      const badChars = 'g'.repeat(64);
      expect(isValidNodeId(badChars)).toBe(false);
      const withSpaces = validId.slice(0, 63) + ' ';
      expect(isValidNodeId(withSpaces)).toBe(false);
    });

    it('rejects non-string types', () => {
      expect(isValidNodeId(12345)).toBe(false);
      expect(isValidNodeId(null)).toBe(false);
      expect(isValidNodeId(undefined)).toBe(false);
      expect(isValidNodeId({})).toBe(false);
    });
  });

  describe('Endpoint Validation', () => {
    it('accepts valid ws and wss endpoints', () => {
      const ep1 = validateEndpoint('ws://localhost:4001');
      expect(ep1.valid).toBe(true);
      expect(ep1.normalizedUrl).toBe('ws://localhost:4001');

      const ep2 = validateEndpoint('wss://node1.redqueen.net:8443');
      expect(ep2.valid).toBe(true);
      expect(ep2.normalizedUrl).toBe('wss://node1.redqueen.net:8443');
    });

    it('rejects forbidden protocols (http, https, ftp, file)', () => {
      expect(validateEndpoint('http://localhost:8080').valid).toBe(false);
      expect(validateEndpoint('https://localhost:8443').valid).toBe(false);
      expect(validateEndpoint('ftp://localhost:21').valid).toBe(false);
      expect(validateEndpoint('file:///etc/passwd').valid).toBe(false);
    });

    it('rejects URLs containing embedded credentials', () => {
      const res = validateEndpoint('ws://admin:secret@127.0.0.1:4001');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('credentials');
    });

    it('rejects invalid ports (< 1 or > 65535 or non-numeric)', () => {
      expect(validateEndpoint('ws://localhost:0').valid).toBe(false);
      expect(validateEndpoint('ws://localhost:70000').valid).toBe(false);
      expect(validateEndpoint('ws://localhost:abc').valid).toBe(false);
    });

    it('rejects directory traversal in pathname', () => {
      expect(validateEndpoint('ws://localhost:4001/../admin').valid).toBe(false);
    });

    it('rejects query parameters and fragments', () => {
      expect(validateEndpoint('ws://localhost:4001/?inject=true').valid).toBe(false);
      expect(validateEndpoint('ws://localhost:4001/#fragment').valid).toBe(false);
    });
  });

  describe('Peer Identity Validation', () => {
    it('accepts legitimate keypair and derived Node ID', () => {
      const kp = identityCrypto.generateKeyPair();
      const derivedId = identityCrypto.deriveNodeId(kp.publicKey);
      const res = validatePeerIdentity(derivedId, kp.publicKey);
      expect(res.valid).toBe(true);
    });

    it('rejects mismatched Node ID and public key', () => {
      const kp = identityCrypto.generateKeyPair();
      const fakeId = '00'.repeat(32);
      const res = validatePeerIdentity(fakeId, kp.publicKey);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Node ID mismatch');
    });

    it('rejects malformed public key', () => {
      const res = validatePeerIdentity(validId, 'NOT_A_VALID_PEM_KEY');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Invalid Ed25519 public key format');
    });
  });

  describe('Payload Schemas & Resource Bounds', () => {
    it('validates FIND_NODE payload', () => {
      expect(FindNodePayloadSchema.safeParse({ targetNodeId: validId }).success).toBe(true);
      expect(FindNodePayloadSchema.safeParse({ targetNodeId: 'short' }).success).toBe(false);
      expect(FindNodePayloadSchema.safeParse({ targetNodeId: 123 }).success).toBe(false);
    });

    it('validates FIND_NODE_RESPONSE payload with <= 20 peers', () => {
      const kp = identityCrypto.generateKeyPair();
      const nodeId = identityCrypto.deriveNodeId(kp.publicKey);
      const validPeers = Array.from({ length: 20 }, () => ({
        nodeId,
        publicKey: kp.publicKey,
        endpoint: 'ws://localhost:4001'
      }));

      const resValid = FindNodeResponsePayloadSchema.safeParse({
        targetNodeId: validId,
        peers: validPeers
      });
      expect(resValid.success).toBe(true);

      // 21 peers must fail (bounded resource limit)
      const resTooMany = FindNodeResponsePayloadSchema.safeParse({
        targetNodeId: validId,
        peers: [...validPeers, { nodeId, publicKey: kp.publicKey }]
      });
      expect(resTooMany.success).toBe(false);
    });
  });
});
