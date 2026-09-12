import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Cell } from '../src/redqueen/core/cell';
import { GovernanceEnforcer } from '../src/redqueen/reproduction/policy';
import { MitosisEngine } from '../src/redqueen/reproduction/mitosis';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import {
  AuthorizationProof,
  StaticTrustAnchor
} from '../src/redqueen/reproduction/types';

const TEST_DIR = path.join(process.cwd(), 'data', 'test_p6_3_cooldown');

describe('P6.3 Persistent Parent-Specific Cooldown (CD-01 to CD-07)', () => {
  let parentA: Cell;
  let parentB: Cell;
  let authorityKp: { publicKey: string; privateKey: string };
  let governance: GovernanceEnforcer;
  let mitosis: MitosisEngine;
  const COOLDOWN_MS = 5000;

  beforeEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
    await fs.mkdir(TEST_DIR, { recursive: true });

    authorityKp = identityCrypto.generateKeyPair();
    const trustAnchor = new StaticTrustAnchor([
      { issuer: 'creator-authority', publicKey: authorityKp.publicKey }
    ]);

    governance = new GovernanceEnforcer(
      {
        populationCeiling: 20,
        cooldownMs: COOLDOWN_MS,
        requireAuthorization: true,
        minMemoryPressure: 0.0
      },
      trustAnchor
    );

    mitosis = new MitosisEngine(governance);

    // Parent A
    parentA = new Cell(
      path.join(TEST_DIR, 'parent_a.json'),
      'dummy-key',
      undefined,
      undefined,
      undefined,
      { specialization: 'generalist_a' }
    );
    await parentA.memory.initialize();
    await parentA.start();

    // Parent B
    parentB = new Cell(
      path.join(TEST_DIR, 'parent_b.json'),
      'dummy-key',
      undefined,
      undefined,
      undefined,
      { specialization: 'generalist_b' }
    );
    await parentB.memory.initialize();
    await parentB.start();
  });

  afterEach(async () => {
    try {
      await parentA.stop();
    } catch {}
    try {
      await parentB.stop();
    } catch {}
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  function createProof(parentCellId: string, eventId: string): AuthorizationProof {
    const payload = {
      action: 'reproduce',
      subject: parentCellId,
      eventId,
      exp: Date.now() + 60000,
      issuer: 'creator-authority',
      timestamp: Date.now()
    };
    const signature = identityCrypto.signData(authorityKp.privateKey, JSON.stringify(payload));
    return {
      payload,
      signature,
      issuerPublicKey: authorityKp.publicKey
    };
  }

  it('CD-01: First reproduction succeeds when not in cooldown', async () => {
    const res = await mitosis.reproduce(parentA, {
      authorizationProof: createProof(parentA.nodeId, 'event-cd-01'),
      reproductionSeed: 'event-cd-01',
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });

    expect(res.result.success).toBe(true);
    expect(res.child).toBeDefined();
    if (res.child) await res.child.stop();

    // Verify cooldown is recorded
    const metadata = parentA.cognitiveState.getState().metadata;
    expect(metadata.lastReproductionTimestamp).toBeDefined();
    const lastTimestamp = parseInt(metadata.lastReproductionTimestamp, 10);
    expect(lastTimestamp).toBeGreaterThan(0);

    // Verify cooldown record in memory store
    const cooldownEntry = await parentA.memory.get(`reproduction_cooldown_${parentA.nodeId}`);
    expect(cooldownEntry).toBeDefined();
    expect(cooldownEntry?.content?.lastSuccessfulReproductionAt).toBe(lastTimestamp);
  });

  it('CD-02: Immediate second reproduction by same parent fails due to active cooldown', async () => {
    // First reproduction
    const res1 = await mitosis.reproduce(parentA, {
      authorizationProof: createProof(parentA.nodeId, 'event-cd-02-a'),
      reproductionSeed: 'event-cd-02-a',
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });
    expect(res1.result.success).toBe(true);
    if (res1.child) await res1.child.stop();

    // Immediate second reproduction attempt with new event
    const res2 = await mitosis.reproduce(parentA, {
      authorizationProof: createProof(parentA.nodeId, 'event-cd-02-b'),
      reproductionSeed: 'event-cd-02-b',
      storageBasePath: TEST_DIR,
      currentPopulation: 2,
      openRouterApiKey: 'dummy-key'
    });

    expect(res2.result.success).toBe(false);
    expect(res2.result.errors?.[0]).toContain('cooldown active');
  });

  it('CD-03: Second reproduction succeeds after cooldown expires', async () => {
    // Short cooldown for this test
    const shortGov = new GovernanceEnforcer(
      {
        populationCeiling: 10,
        cooldownMs: 50,
        requireAuthorization: true,
        minMemoryPressure: 0.0
      },
      governance.getTrustAnchor()
    );
    const shortMitosis = new MitosisEngine(shortGov);

    // First reproduction
    const res1 = await shortMitosis.reproduce(parentA, {
      authorizationProof: createProof(parentA.nodeId, 'event-cd-03-a'),
      reproductionSeed: 'event-cd-03-a',
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });
    expect(res1.result.success).toBe(true);
    if (res1.child) await res1.child.stop();

    // Wait for cooldown to expire (50ms cooldown)
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Second reproduction should now succeed
    const res2 = await shortMitosis.reproduce(parentA, {
      authorizationProof: createProof(parentA.nodeId, 'event-cd-03-b'),
      reproductionSeed: 'event-cd-03-b',
      storageBasePath: TEST_DIR,
      currentPopulation: 2,
      openRouterApiKey: 'dummy-key'
    });

    expect(res2.result.success).toBe(true);
    expect(res2.child).toBeDefined();
    if (res2.child) await res2.child.stop();
  });

  it('CD-04: Failed reproduction does NOT consume or start cooldown', async () => {
    // Attempt reproduction with invalid authorization (will fail)
    const invalidProof = createProof(parentA.nodeId, 'event-cd-04-fail');
    invalidProof.signature = 'bad_sig';

    const failRes = await mitosis.reproduce(parentA, {
      authorizationProof: invalidProof,
      reproductionSeed: 'event-cd-04-fail',
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });

    expect(failRes.result.success).toBe(false);

    // Cooldown must not be started
    const metadata = parentA.cognitiveState.getState().metadata;
    expect(metadata.lastReproductionTimestamp).toBeUndefined();

    // Valid reproduction should immediately succeed
    const validRes = await mitosis.reproduce(parentA, {
      authorizationProof: createProof(parentA.nodeId, 'event-cd-04-valid'),
      reproductionSeed: 'event-cd-04-valid',
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });

    expect(validRes.result.success).toBe(true);
    if (validRes.child) await validRes.child.stop();
  });

  it('CD-05: Cooldown survives Cell reload / process restart', async () => {
    const storagePath = path.join(TEST_DIR, 'parent_a.json');

    // First reproduction
    const res1 = await mitosis.reproduce(parentA, {
      authorizationProof: createProof(parentA.nodeId, 'event-cd-05-a'),
      reproductionSeed: 'event-cd-05-a',
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });
    expect(res1.result.success).toBe(true);
    if (res1.child) await res1.child.stop();

    // Simulate process restart / reload by stopping parentA and instantiating a new Cell instance
    await parentA.stop();

    const reloadedParent = new Cell(
      storagePath,
      'dummy-key',
      parentA.privateKey,
      parentA.publicKey,
      undefined,
      { specialization: 'generalist_a' }
    );
    await reloadedParent.start();

    // Verify metadata was restored from disk
    const reloadedMetadata = reloadedParent.cognitiveState.getState().metadata;
    expect(reloadedMetadata.lastReproductionTimestamp).toBeDefined();

    // Attempt reproduction on reloaded parent -> must be denied by persistent cooldown
    const res2 = await mitosis.reproduce(reloadedParent, {
      authorizationProof: createProof(reloadedParent.nodeId, 'event-cd-05-b'),
      reproductionSeed: 'event-cd-05-b',
      storageBasePath: TEST_DIR,
      currentPopulation: 2,
      openRouterApiKey: 'dummy-key'
    });

    expect(res2.result.success).toBe(false);
    expect(res2.result.errors?.[0]).toContain('cooldown active');

    await reloadedParent.stop();
  });

  it('CD-06: Parent isolation - Parent A in cooldown does NOT block Parent B', async () => {
    // Put Parent A into cooldown
    const resA = await mitosis.reproduce(parentA, {
      authorizationProof: createProof(parentA.nodeId, 'event-cd-06-a'),
      reproductionSeed: 'event-cd-06-a',
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });
    expect(resA.result.success).toBe(true);
    if (resA.child) await resA.child.stop();

    // Parent A is now in cooldown
    const resA2 = await mitosis.reproduce(parentA, {
      authorizationProof: createProof(parentA.nodeId, 'event-cd-06-a2'),
      reproductionSeed: 'event-cd-06-a2',
      storageBasePath: TEST_DIR,
      currentPopulation: 2,
      openRouterApiKey: 'dummy-key'
    });
    expect(resA2.result.success).toBe(false);
    expect(resA2.result.errors?.[0]).toContain('cooldown active');

    // Parent B is NOT in cooldown and reproduces successfully
    const resB = await mitosis.reproduce(parentB, {
      authorizationProof: createProof(parentB.nodeId, 'event-cd-06-b'),
      reproductionSeed: 'event-cd-06-b',
      storageBasePath: TEST_DIR,
      currentPopulation: 2,
      openRouterApiKey: 'dummy-key'
    });

    expect(resB.result.success).toBe(true);
    expect(resB.child).toBeDefined();
    if (resB.child) await resB.child.stop();
  });

  it('CD-07: Rollback / failure when cooldown persistence fails', async () => {
    // Create a scenario where parent memory put fails when persisting cooldown
    const originalPut = parentA.memory.put.bind(parentA.memory);
    let failOnCooldownPut = true;

    parentA.memory.put = async (entry) => {
      if (failOnCooldownPut && entry.id.startsWith('reproduction_cooldown_')) {
        throw new Error('Simulated disk I/O failure on cooldown persistence');
      }
      return originalPut(entry);
    };

    const res = await mitosis.reproduce(parentA, {
      authorizationProof: createProof(parentA.nodeId, 'event-cd-07'),
      reproductionSeed: 'event-cd-07',
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });

    // Must report failure
    expect(res.result.success).toBe(false);
    expect(res.result.errors?.[0]).toContain('Simulated disk I/O failure');

    // Parent state should be rolled back to pre-reproduction state
    const metadata = parentA.cognitiveState.getState().metadata;
    expect(metadata.lastReproductionTimestamp).toBeUndefined();

    // Restore original put
    failOnCooldownPut = false;
    parentA.memory.put = originalPut;
  });
});
