import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Cell } from '../src/redqueen/core/cell';
import { GovernanceEnforcer } from '../src/redqueen/reproduction/policy';
import { MitosisEngine } from '../src/redqueen/reproduction/mitosis';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import {
  AuthorizationProof,
  AuthorizationVerificationState,
  StaticTrustAnchor
} from '../src/redqueen/reproduction/types';

const TEST_DIR = path.join(process.cwd(), 'data', 'test_p6_3_auth');

describe('P6.3 Trusted Cryptographic Authorization (AUTH-01 to AUTH-10)', () => {
  let parentCell: Cell;
  let trustedAuthorityKp: { publicKey: string; privateKey: string };
  let untrustedKp: { publicKey: string; privateKey: string };
  let trustAnchor: StaticTrustAnchor;
  let governance: GovernanceEnforcer;
  let mitosis: MitosisEngine;

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });

    // Setup keys
    trustedAuthorityKp = identityCrypto.generateKeyPair();
    untrustedKp = identityCrypto.generateKeyPair();

    // Trust anchor with only the trusted authority
    trustAnchor = new StaticTrustAnchor([
      { issuer: 'creator-root', publicKey: trustedAuthorityKp.publicKey }
    ]);

    // Governance enforcer with strict authorization and trust anchor
    governance = new GovernanceEnforcer(
      {
        populationCeiling: 10,
        cooldownMs: 0,
        requireAuthorization: true,
        minMemoryPressure: 0.0
      },
      trustAnchor
    );

    mitosis = new MitosisEngine(governance);

    // Initialize parent cell
    parentCell = new Cell(
      path.join(TEST_DIR, 'parent_auth_cell.json'),
      'dummy-key',
      undefined,
      undefined,
      undefined,
      {
        specialization: 'auth_parent'
      }
    );
    await parentCell.memory.initialize();
    await parentCell.start();
  });

  afterEach(async () => {
    try {
      await parentCell.stop();
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  function createValidProof(
    subject: string,
    eventId: string,
    keypair = trustedAuthorityKp,
    issuer = 'creator-root',
    exp = Date.now() + 60000,
    action = 'reproduce'
  ): AuthorizationProof {
    const payload = {
      action,
      subject,
      eventId,
      exp,
      issuer,
      timestamp: Date.now()
    };
    const signature = identityCrypto.signData(keypair.privateKey, JSON.stringify(payload));
    return {
      payload,
      signature,
      issuerPublicKey: keypair.publicKey
    };
  }

  it('AUTH-01: Missing proof -> DENY with MISSING state', async () => {
    const res = await mitosis.reproduce(parentCell, {
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key',
      reproductionSeed: 'event-auth-01'
    });

    expect(res.result.success).toBe(false);
    expect(res.result.errors?.[0]).toContain('creator authorization');

    const authCheck = governance.verifyAuthorizationProof(
      undefined,
      parentCell.nodeId,
      'event-auth-01'
    );
    expect(authCheck.valid).toBe(false);
    expect(authCheck.state).toBe(AuthorizationVerificationState.MISSING);
  });

  it('AUTH-02: Malformed proof -> DENY with INVALID_FORMAT state', async () => {
    const malformedCases: any[] = [
      {},
      { payload: {} },
      { payload: { action: 'reproduce' }, signature: 'sig' }, // missing issuerPublicKey
      { payload: { action: 'reproduce', subject: parentCell.nodeId, eventId: 'e', exp: 'not-a-number', issuer: 'creator' }, signature: 's', issuerPublicKey: 'k' },
      null
    ];

    for (const malformed of malformedCases) {
      const res = await mitosis.reproduce(parentCell, {
        authorizationProof: malformed,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key',
        reproductionSeed: 'event-auth-02'
      });

      expect(res.result.success).toBe(false);
      const authCheck = governance.verifyAuthorizationProof(
        malformed,
        parentCell.nodeId,
        'event-auth-02'
      );
      expect(authCheck.valid).toBe(false);
      expect(
        [AuthorizationVerificationState.MISSING, AuthorizationVerificationState.INVALID_FORMAT]
      ).toContain(authCheck.state);
    }
  });

  it('AUTH-03: Invalid signature -> DENY with INVALID_SIGNATURE state', async () => {
    const proof = createValidProof(parentCell.nodeId, 'event-auth-03');
    // Corrupt signature
    proof.signature = 'invalid_corrupted_signature_hex_deadbeef';

    const res = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key',
      reproductionSeed: 'event-auth-03'
    });

    expect(res.result.success).toBe(false);
    expect(res.result.errors?.[0]).toContain('signature verification failed');

    const authCheck = governance.verifyAuthorizationProof(
      proof,
      parentCell.nodeId,
      'event-auth-03'
    );
    expect(authCheck.valid).toBe(false);
    expect(authCheck.state).toBe(AuthorizationVerificationState.INVALID_SIGNATURE);
  });

  it('AUTH-04: Valid signature from untrusted issuer -> DENY with UNTRUSTED_ISSUER state', async () => {
    // untrustedKp signs a valid payload, but is not in trustAnchor
    const proof = createValidProof(
      parentCell.nodeId,
      'event-auth-04',
      untrustedKp,
      'untrusted-rogue-node'
    );

    const res = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key',
      reproductionSeed: 'event-auth-04'
    });

    expect(res.result.success).toBe(false);
    expect(res.result.errors?.[0]).toContain('not a trusted authority');

    const authCheck = governance.verifyAuthorizationProof(
      proof,
      parentCell.nodeId,
      'event-auth-04'
    );
    expect(authCheck.valid).toBe(false);
    expect(authCheck.state).toBe(AuthorizationVerificationState.UNTRUSTED_ISSUER);
  });

  it('AUTH-05: Expired proof -> DENY with EXPIRED state', async () => {
    // exp in the past
    const proof = createValidProof(
      parentCell.nodeId,
      'event-auth-05',
      trustedAuthorityKp,
      'creator-root',
      Date.now() - 5000
    );

    const res = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key',
      reproductionSeed: 'event-auth-05'
    });

    expect(res.result.success).toBe(false);
    expect(res.result.errors?.[0]).toContain('expired');

    const authCheck = governance.verifyAuthorizationProof(
      proof,
      parentCell.nodeId,
      'event-auth-05'
    );
    expect(authCheck.valid).toBe(false);
    expect(authCheck.state).toBe(AuthorizationVerificationState.EXPIRED);
  });

  it('AUTH-06: Wrong parent subject -> DENY with WRONG_SUBJECT state', async () => {
    const wrongSubject = 'foreign_cell_node_id_99999';
    const proof = createValidProof(wrongSubject, 'event-auth-06');

    const res = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key',
      reproductionSeed: 'event-auth-06'
    });

    expect(res.result.success).toBe(false);
    expect(res.result.errors?.[0]).toContain('subject mismatch');

    const authCheck = governance.verifyAuthorizationProof(
      proof,
      parentCell.nodeId,
      'event-auth-06'
    );
    expect(authCheck.valid).toBe(false);
    expect(authCheck.state).toBe(AuthorizationVerificationState.WRONG_SUBJECT);
  });

  it('AUTH-07: Wrong eventId -> DENY with WRONG_EVENT state', async () => {
    const proof = createValidProof(parentCell.nodeId, 'event-authorized-XYZ');

    const res = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key',
      reproductionSeed: 'event-actual-ABC'
    });

    expect(res.result.success).toBe(false);
    expect(res.result.errors?.[0]).toContain('eventId mismatch');

    const authCheck = governance.verifyAuthorizationProof(
      proof,
      parentCell.nodeId,
      'event-actual-ABC'
    );
    expect(authCheck.valid).toBe(false);
    expect(authCheck.state).toBe(AuthorizationVerificationState.WRONG_EVENT);
  });

  it('AUTH-08: Wrong action -> DENY with WRONG_ACTION state', async () => {
    const proof = createValidProof(
      parentCell.nodeId,
      'event-auth-08',
      trustedAuthorityKp,
      'creator-root',
      Date.now() + 60000,
      'mutate_without_reproduction' // wrong action
    );

    const res = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key',
      reproductionSeed: 'event-auth-08'
    });

    expect(res.result.success).toBe(false);
    expect(res.result.errors?.[0]).toContain('action mismatch');

    const authCheck = governance.verifyAuthorizationProof(
      proof,
      parentCell.nodeId,
      'event-auth-08'
    );
    expect(authCheck.valid).toBe(false);
    expect(authCheck.state).toBe(AuthorizationVerificationState.WRONG_ACTION);
  });

  it('AUTH-09: Correct trusted issuer + valid signature + correct binding -> ALLOW with VALID state', async () => {
    const proof = createValidProof(parentCell.nodeId, 'event-auth-09');

    const authCheck = governance.verifyAuthorizationProof(
      proof,
      parentCell.nodeId,
      'event-auth-09'
    );
    expect(authCheck.valid).toBe(true);
    expect(authCheck.state).toBe(AuthorizationVerificationState.VALID);

    const res = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key',
      reproductionSeed: 'event-auth-09'
    });

    expect(res.result.success).toBe(true);
    expect(res.child).toBeDefined();
    if (res.child) {
      await res.child.stop();
    }
  });

  it('AUTH-10: Attempt to modify payload after signing -> DENY with INVALID_SIGNATURE state', async () => {
    const proof = createValidProof(parentCell.nodeId, 'event-auth-10');

    // Tamper with payload after signing
    proof.payload.exp = proof.payload.exp + 100000;

    const res = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key',
      reproductionSeed: 'event-auth-10'
    });

    expect(res.result.success).toBe(false);
    expect(res.result.errors?.[0]).toContain('signature verification failed');

    const authCheck = governance.verifyAuthorizationProof(
      proof,
      parentCell.nodeId,
      'event-auth-10'
    );
    expect(authCheck.valid).toBe(false);
    expect(authCheck.state).toBe(AuthorizationVerificationState.INVALID_SIGNATURE);
  });
});
