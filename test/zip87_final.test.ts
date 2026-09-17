import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Peer, PeerState } from '../src/redqueen/network/peer';
import { WebSocket } from 'ws';
import { verifyMembershipCertificate } from '../src/redqueen/swarm/verifier';
import { MembershipCertificate } from '../src/redqueen/swarm/types';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import { Cell } from '../src/redqueen/core/cell';
import { CognitiveRuntime } from '../src/redqueen/cognition/runtime';
import { OpenRouterAIProvider } from '../src/redqueen/cognition/ai-provider';
import { JsonFileMemoryStore } from '../src/redqueen/memory/store';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';

describe('ZIP87 Final Critical Bug Repair Suite', () => {

  describe('P0: Transport Encryption (Confidentiality)', () => {
    test('1. Peer should send ENCRYPTED envelope after AUTHENTICATED state', () => {
      // Create fake websocket
      const mockWs = {
        on: vi.fn(),
        send: vi.fn(),
        readyState: 1 // OPEN
      } as unknown as WebSocket;

      const kp = identityCrypto.generateKeyPair();
      const peer = new Peer(
        mockWs,
        'localNode',
        kp.privateKey,
        kp.publicKey,
        true, // initiator
        'ws://local',
        () => {},
        () => {},
        () => {}
      );
      
      // Force it to AUTHENTICATED and set a fake session key
      (peer as any).state = PeerState.AUTHENTICATED;
      (peer as any).sessionKey = Buffer.alloc(32, 1);

      peer.send('TEST_MESSAGE' as any, { hello: 'world' });

      // Expect socket to have sent an ENCRYPTED message
      expect(mockWs.send).toHaveBeenCalled();
      const sentRaw = (mockWs.send as any).mock.calls[1][0]; // First was HELLO
      const parsed = JSON.parse(sentRaw);
      
      expect(parsed.type).toBe('ENCRYPTED');
      expect(parsed.envelope).toBeDefined();
      expect(parsed.envelope.ciphertext).toBeDefined();
      expect(parsed.payload).toBeUndefined(); // Raw payload should NOT be exposed
    });
  });

  describe('P2: Remove Trust-On-First-Use (TOFU) in Membership', () => {
    test('2. verifyMembershipCertificate must reject if trustedIssuerPublicKey is omitted', () => {
      const issuerKp = identityCrypto.generateKeyPair();
      const memberKp = identityCrypto.generateKeyPair();
      
      const mockCert: MembershipCertificate = {
        certificateId: randomUUID(),
        swarmId: 'swarm-1',
        issuerId: identityCrypto.deriveNodeId(issuerKp.publicKey),
        issuerPublicKey: issuerKp.publicKey,
        memberNodeId: identityCrypto.deriveNodeId(memberKp.publicKey),
        memberPublicKey: memberKp.publicKey,
        capabilities: ['computation'],
        issuedAt: Date.now() - 1000,
        expiresAt: Date.now() + 10000,
        revocationEpoch: 0,
        signature: 'c'.repeat(128), // Valid length, format (but invalid mathematically)
        protocolVersion: 1,
        membershipVersion: 1
      };

      const result = verifyMembershipCertificate(mockCert, 'swarm-1', undefined);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('TOFU rejected');
    });
  });

  describe('P3: Secure Private Key Persistence', () => {
    const storagePath = './test-cell-p3.json';

    afterEach(async () => {
      try {
        await fs.unlink(storagePath);
      } catch(e) {}
    });

    test('3. Cell constructor must require storageSecret', () => {
      const old = process.env.REDQUEEN_STORAGE_SECRET;
      delete process.env.REDQUEEN_STORAGE_SECRET;
      expect(() => {
        new Cell(storagePath, 'test-key', undefined, undefined, undefined, { });
      }).toThrow('REDQUEEN_STORAGE_SECRET');
      if (old) process.env.REDQUEEN_STORAGE_SECRET = old;
    });

    test('4. restoreOrPersistIdentity must encrypt privateKey on disk', async () => {
      const cell = new Cell(storagePath, 'test-key', undefined, undefined, undefined, { storageSecret: 'test_secret' });
      await cell.restoreOrPersistIdentity();
      if ((cell.memory as any).persist) {
        await (cell.memory as any).persist();
      }

      const diskData = JSON.parse(await fs.readFile(storagePath, 'utf8'));
      const idEntry = diskData.find((e: any) => e.id.startsWith('cell_identity_'));
      expect(idEntry.content.privateKey).toBeUndefined();
      expect(idEntry.content.encryptedPrivateKey).toBeDefined();
    });
  });

  describe('P7: Epistemic Correctness (Fabricated Confidence)', () => {
    test('5. Extracted concepts and relations must have 0.0 confidence initially (no fabricated weight)', () => {
      const runtime = new CognitiveRuntime([]); // Empty population

      const result = (runtime as any).extractConceptsAndRelations({
        intentType: 'STATEMENT',
        domain: 'TEST',
        concepts: ['Alpha', 'Beta'],
        relations: [{ subject: 'Alpha', predicate: 'CAUSES', object: 'Beta' }],
        urgency: 'LOW'
      }, { contextId: 'ctx', semanticKeywords: [], entities: [], metadata: {} });

      expect(result.concepts[0].confidence).toBe(0.0);
      expect(result.relations[0].confidence).toBe(0.0);
      expect(result.relations[0].weight).toBe(0.0);
    });
  });
});
