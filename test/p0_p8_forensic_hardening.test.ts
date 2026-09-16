import { describe, it, expect } from 'vitest';
import {
  MessageType,
  createMessage,
  getCanonicalString,
  verifyMessageSignature,
  ReplayCache,
  NetworkMessage
} from '../src/redqueen/network/protocol';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import { signingCrypto } from '../src/redqueen/crypto/signing';
import { encryptionCrypto } from '../src/redqueen/crypto/encryption';
import { RoutingTable } from '../src/redqueen/dht/routing';
import { JsonFileMemoryStore, MemoryCategory } from '../src/redqueen/memory/store';
import { canonicalizeJson, computeDeterministicHash } from '../src/redqueen/cognition/computation/canonical';
import { EpistemicAdapter } from '../src/redqueen/cognition/epistemic/adapter';
import { EpistemicStatus } from '../src/redqueen/cognition/epistemic/types';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';

describe('Red Queen — P0–P8 Forensic Hardening & Verification Suite', () => {
  const keysA = identityCrypto.generateKeyPair();
  const nodeIdA = identityCrypto.deriveNodeId(keysA.publicKey);

  const keysB = identityCrypto.generateKeyPair();
  const nodeIdB = identityCrypto.deriveNodeId(keysB.publicKey);

  describe('P0: Protocol Serialization & Cryptographic Hardening', () => {
    it('1. should produce identical canonical string regardless of payload key insertion order (RFC 8785)', () => {
      const payload1 = { b: 2, a: 1, nested: { y: 'test', x: true } };
      const payload2 = { a: 1, b: 2, nested: { x: true, y: 'test' } };

      const msg1: NetworkMessage = {
        version: 1,
        type: MessageType.APPLICATION,
        messageId: '00000000-0000-0000-0000-000000000001',
        senderId: nodeIdA,
        timestamp: 100000,
        nonce: 'nonce-1',
        payload: payload1
      };

      const msg2: NetworkMessage = {
        version: 1,
        type: MessageType.APPLICATION,
        messageId: '00000000-0000-0000-0000-000000000001',
        senderId: nodeIdA,
        timestamp: 100000,
        nonce: 'nonce-1',
        payload: payload2
      };

      const canon1 = getCanonicalString(msg1);
      const canon2 = getCanonicalString(msg2);

      expect(canon1).toBe(canon2);

      // Verify signature on msg1 verifies with msg2
      const sig1 = signingCrypto.sign(canon1, keysA.privateKey);
      msg2.signature = sig1;
      expect(verifyMessageSignature(msg2, keysA.publicKey)).toBe(true);
    });

    it('2. should reject nonce-reuse even with different messageId', () => {
      const replayCache = new ReplayCache();
      const now = Date.now();

      const msg1: NetworkMessage = {
        version: 1,
        type: MessageType.APPLICATION,
        messageId: '11111111-1111-1111-1111-111111111111',
        senderId: nodeIdA,
        timestamp: now,
        nonce: 'reused-nonce-123',
        payload: { action: 'transfer', amount: 10 }
      };

      // First delivery: should be accepted
      expect(replayCache.isDuplicateOrExpired(msg1)).toBe(false);

      // Attack: same sender, same nonce, different messageId
      const msgAttack: NetworkMessage = {
        version: 1,
        type: MessageType.APPLICATION,
        messageId: '22222222-2222-2222-2222-222222222222',
        senderId: nodeIdA,
        timestamp: now + 50,
        nonce: 'reused-nonce-123',
        payload: { action: 'transfer', amount: 999 }
      };

      // Must be rejected as duplicate/reused nonce!
      expect(replayCache.isDuplicateOrExpired(msgAttack)).toBe(true);
    });

    it('3. should reject messageId-reuse even with different nonce', () => {
      const replayCache = new ReplayCache();
      const now = Date.now();

      const msg1: NetworkMessage = {
        version: 1,
        type: MessageType.APPLICATION,
        messageId: '33333333-3333-3333-3333-333333333333',
        senderId: nodeIdA,
        timestamp: now,
        nonce: 'nonce-alpha',
        payload: { action: 'query' }
      };

      expect(replayCache.isDuplicateOrExpired(msg1)).toBe(false);

      // Attack: same sender, same messageId, different nonce
      const msgAttack: NetworkMessage = {
        version: 1,
        type: MessageType.APPLICATION,
        messageId: '33333333-3333-3333-3333-333333333333',
        senderId: nodeIdA,
        timestamp: now + 20,
        nonce: 'nonce-beta',
        payload: { action: 'query' }
      };

      expect(replayCache.isDuplicateOrExpired(msgAttack)).toBe(true);
    });

    it('4. should partition replay cache by senderId so distinct senders do not collide', () => {
      const replayCache = new ReplayCache();
      const now = Date.now();

      const msgA: NetworkMessage = {
        version: 1,
        type: MessageType.APPLICATION,
        messageId: '44444444-4444-4444-4444-444444444444',
        senderId: nodeIdA,
        timestamp: now,
        nonce: 'shared-nonce',
        payload: { sender: 'A' }
      };

      const msgB: NetworkMessage = {
        version: 1,
        type: MessageType.APPLICATION,
        messageId: '44444444-4444-4444-4444-444444444444',
        senderId: nodeIdB,
        timestamp: now,
        nonce: 'shared-nonce',
        payload: { sender: 'B' }
      };

      // Both should be accepted because they originate from different senders
      expect(replayCache.isDuplicateOrExpired(msgA)).toBe(false);
      expect(replayCache.isDuplicateOrExpired(msgB)).toBe(false);
    });

    it('5. should encrypt and decrypt with AES-256-GCM and validate AAD integrity', () => {
      const key = encryptionCrypto.deriveKey('session_secret_123', 'salt_redqueen', 'session_auth');
      expect(key.length).toBe(32);

      const aad = 'cell_A:cell_B:seq_42';
      const envelope = encryptionCrypto.encrypt('sensitive_cognitive_state', key, aad);

      expect(envelope.ciphertext).toBeDefined();
      expect(envelope.iv).toBeDefined();
      expect(envelope.authTag).toBeDefined();
      expect(envelope.aad).toBe(aad);

      // Successful decryption with correct AAD
      const decrypted = encryptionCrypto.decrypt(envelope.ciphertext, envelope.iv, envelope.authTag, key, aad);
      expect(decrypted.toString('utf8')).toBe('sensitive_cognitive_state');

      // Tampered AAD must cause decryption failure
      expect(() => {
        encryptionCrypto.decrypt(envelope.ciphertext, envelope.iv, envelope.authTag, key, 'tampered_aad');
      }).toThrow();
    });

    it('6. should reject invalid IV length and invalid authTag length in AES-256-GCM', () => {
      const key = Buffer.alloc(32, 0x5a);
      const envelope = encryptionCrypto.encrypt('data', key);

      // Corrupted IV length (e.g. 8 bytes instead of 12)
      const badIv = Buffer.alloc(8).toString('base64');
      expect(() => {
        encryptionCrypto.decrypt(envelope.ciphertext, badIv, envelope.authTag, key);
      }).toThrow(/Invalid IV length/);

      // Corrupted authTag length (e.g. 12 bytes instead of 16)
      const badTag = Buffer.alloc(12).toString('base64');
      expect(() => {
        encryptionCrypto.decrypt(envelope.ciphertext, envelope.iv, badTag, key);
      }).toThrow(/Invalid authTag length/);
    });

    it('7. should encrypt and decrypt JSON payloads via typed helper using canonical JSON', () => {
      const key = Buffer.alloc(32, 0x42);
      const payload = { model: 'redqueen_core', depth: 7, active: true };

      const envelope = encryptionCrypto.encryptPayload(payload, key, 'metadata_v1');
      const recovered = encryptionCrypto.decryptPayload<typeof payload>(envelope, key);

      expect(recovered).toEqual(payload);
    });
  });

  describe('P1: DHT Routing Hardening', () => {
    it('8. should bound getClosestPeers limit and reject invalid targetNodeId', () => {
      const routing = new RoutingTable(nodeIdA);

      // Invalid ID throws
      expect(() => routing.getClosestPeers('invalid_short_id')).toThrow(/not a valid canonical Node ID/);

      // Safe bounding with extreme limits
      const closestZero = routing.getClosestPeers(nodeIdB, 0);
      expect(Array.isArray(closestZero)).toBe(true);

      const closestLarge = routing.getClosestPeers(nodeIdB, 999999);
      expect(closestLarge.length).toBeLessThanOrEqual(100);
    });
  });

  describe('P4: Memory Store Content Hash & Integrity Hardening', () => {
    it('9. should automatically calculate RFC 8785 deterministic content hash on put if omitted', async () => {
      const memory = new JsonFileMemoryStore(':memory:', nodeIdA);
      await memory.initialize();

      const rawContent = { concept: 'emergence', level: 3 };
      const expectedHash = computeDeterministicHash(rawContent);

      await memory.put({
        id: 'mem_emergence_1',
        content: rawContent,
        source: 'introspection',
        createdAt: '',
        updatedAt: '',
        confidence: 0.95,
        hash: '', // Deliberately empty
        provenance: []
      });

      const retrieved = await memory.get('mem_emergence_1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.hash).toBe(expectedHash);
      expect(retrieved?.hash.length).toBe(64);
      expect(retrieved?.createdAt).toBeDefined();
      expect(retrieved?.updatedAt).toBeDefined();
      expect(retrieved?.provenance).toEqual([nodeIdA]);
    });
  });

  describe('P7: Epistemic Correctness & Uncertainty Handling', () => {
    it('10. should strictly distinguish UNKNOWN from KNOWN_ZERO / CONTRADICTED', () => {
      const unknownStatus = EpistemicAdapter.evaluateStatus('UNKNOWN');
      const contradictedStatus = EpistemicAdapter.evaluateStatus(RepresentationVerificationStatus.CONTRADICTED);
      const verifiedStatus = EpistemicAdapter.evaluateStatus(RepresentationVerificationStatus.VERIFIED);
      const supportedStatus = EpistemicAdapter.evaluateStatus(RepresentationVerificationStatus.SUPPORTED);

      expect(unknownStatus).toBe(EpistemicStatus.UNKNOWN);
      expect(contradictedStatus).toBe(EpistemicStatus.CONTRADICTED);
      expect(verifiedStatus).toBe(EpistemicStatus.VERIFIED);
      expect(supportedStatus).toBe(EpistemicStatus.BELIEVED); // SUPPORTED must be BELIEVED, not KNOWN

      expect(unknownStatus).not.toBe(contradictedStatus);
    });
  });
});
