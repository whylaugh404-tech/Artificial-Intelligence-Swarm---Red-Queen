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

const TEST_DIR = path.join(process.cwd(), 'data', 'test_p6_3_stress');

describe('P6.3 100-Cell Concurrent Stress & Resilience Audit (Tests A - I)', () => {
  let authorityKp: { publicKey: string; privateKey: string };
  let trustAnchor: StaticTrustAnchor;

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    authorityKp = identityCrypto.generateKeyPair();
    trustAnchor = new StaticTrustAnchor([
      { issuer: 'creator-root', publicKey: authorityKp.publicKey }
    ]);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  function createProof(parentCellId: string, eventId: string): AuthorizationProof {
    const payload = {
      action: 'reproduce',
      subject: parentCellId,
      eventId,
      exp: Date.now() + 120000,
      issuer: 'creator-root',
      timestamp: Date.now()
    };
    const signature = identityCrypto.signData(authorityKp.privateKey, JSON.stringify(payload));
    return {
      payload,
      signature,
      issuerPublicKey: authorityKp.publicKey
    };
  }

  it('Stress Test A: 100 concurrent requests across 10 distinct parents with cooldown enforcement', async () => {
    const governance = new GovernanceEnforcer(
      {
        populationCeiling: 100,
        cooldownMs: 60000, // 60s cooldown ensures only 1 child per parent can be created in this burst
        requireAuthorization: true,
        minMemoryPressure: 0.0
      },
      trustAnchor
    );
    const mitosis = new MitosisEngine(governance);

    // Create 10 parent cells
    const parents: Cell[] = [];
    for (let i = 0; i < 10; i++) {
      const p = new Cell(
        path.join(TEST_DIR, `parent_stress_a_${i}.json`),
        'dummy-key',
        undefined,
        undefined,
        undefined,
        { specialization: `spec_a_${i}` }
      );
      await p.memory.initialize();
      await p.start();
      parents.push(p);
    }

    // Prepare 100 concurrent requests (10 per parent)
    const requests: Promise<any>[] = [];
    for (let pIdx = 0; pIdx < parents.length; pIdx++) {
      const parent = parents[pIdx];
      for (let reqIdx = 0; reqIdx < 10; reqIdx++) {
        const eventId = `stress_a_p${pIdx}_req${reqIdx}`;
        const proof = createProof(parent.nodeId, eventId);
        requests.push(
          mitosis.reproduce(parent, {
            authorizationProof: proof,
            reproductionSeed: eventId,
            storageBasePath: TEST_DIR,
            currentPopulation: 10,
            openRouterApiKey: 'dummy-key'
          })
        );
      }
    }

    // Execute all 100 requests concurrently
    const results = await Promise.all(requests);

    // Exactly 10 requests should succeed (1 per parent), 90 should be denied by active cooldown
    const succeeded = results.filter((r) => r.result.success);
    const denied = results.filter((r) => !r.result.success);

    expect(succeeded.length).toBe(10);
    expect(denied.length).toBe(90);

    for (const d of denied) {
      expect(d.result.errors?.[0]).toContain('cooldown active');
    }

    // Cleanup cells
    for (const r of succeeded) {
      if (r.child) await r.child.stop();
    }
    for (const p of parents) {
      await p.stop();
    }
  });

  it('Stress Test B: 100 concurrent requests with the SAME eventId targeting a single parent', async () => {
    const governance = new GovernanceEnforcer(
      {
        populationCeiling: 100,
        cooldownMs: 0,
        requireAuthorization: true,
        minMemoryPressure: 0.0
      },
      trustAnchor
    );
    const mitosis = new MitosisEngine(governance);

    const parent = new Cell(
      path.join(TEST_DIR, 'parent_stress_b.json'),
      'dummy-key',
      undefined,
      undefined,
      undefined,
      { specialization: 'spec_b' }
    );
    await parent.memory.initialize();
    await parent.start();

    const eventId = 'stress_b_idempotent_100';
    const proof = createProof(parent.nodeId, eventId);

    // 100 simultaneous requests with the identical eventId
    const requests = Array.from({ length: 100 }).map(() =>
      mitosis.reproduce(parent, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      })
    );

    const results = await Promise.all(requests);

    // All 100 must succeed
    expect(results.every((r) => r.result.success)).toBe(true);

    // All 100 must yield the EXACT same childCellId
    const firstChildId = results[0].result.childCellId;
    expect(firstChildId).toBeDefined();
    for (const r of results) {
      expect(r.result.childCellId).toBe(firstChildId);
    }

    // Only 1 child file on disk
    const files = await fs.readdir(TEST_DIR);
    const childFiles = files.filter((f) => f.startsWith('cell_') && f.endsWith('.json') && !f.includes('parent'));
    expect(childFiles.length).toBe(1);

    // Parent descendants count must be exactly 1
    expect(parent.cognitiveState.getState().metadata.descendantsCount).toBe('1');

    if (results[0].child) await results[0].child.stop();
    await parent.stop();
  });

  it('Stress Test C: 100 concurrent requests with untrusted/forged signatures', async () => {
    const governance = new GovernanceEnforcer(
      {
        populationCeiling: 100,
        cooldownMs: 0,
        requireAuthorization: true,
        minMemoryPressure: 0.0
      },
      trustAnchor
    );
    const mitosis = new MitosisEngine(governance);

    const parent = new Cell(
      path.join(TEST_DIR, 'parent_stress_c.json'),
      'dummy-key',
      undefined,
      undefined,
      undefined,
      { specialization: 'spec_c' }
    );
    await parent.memory.initialize();
    await parent.start();

    // Rogue keypair not in trust anchor
    const rogueKp = identityCrypto.generateKeyPair();

    const requests = Array.from({ length: 100 }).map((_, idx) => {
      const eventId = `stress_c_forged_${idx}`;
      const payload = {
        action: 'reproduce',
        subject: parent.nodeId,
        eventId,
        exp: Date.now() + 60000,
        issuer: 'rogue-authority',
        timestamp: Date.now()
      };
      const signature = identityCrypto.signData(rogueKp.privateKey, JSON.stringify(payload));
      const proof: AuthorizationProof = {
        payload,
        signature,
        issuerPublicKey: rogueKp.publicKey
      };

      return mitosis.reproduce(parent, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });
    });

    const results = await Promise.all(requests);

    // 100% of forged requests must be denied
    expect(results.every((r) => !r.result.success)).toBe(true);

    // 0 child files created
    const files = await fs.readdir(TEST_DIR);
    const childFiles = files.filter((f) => f.startsWith('cell_') && f.endsWith('.json') && !f.includes('parent'));
    expect(childFiles.length).toBe(0);

    // 0 cooldown consumed
    expect(parent.cognitiveState.getState().metadata.lastReproductionTimestamp).toBeUndefined();

    await parent.stop();
  });

  it('Stress Test D: Burst load cooldown enforcement and recovery', async () => {
    const governance = new GovernanceEnforcer(
      {
        populationCeiling: 100,
        cooldownMs: 400, // 400ms cooldown ensures all 50 serialized burst requests fall within window
        requireAuthorization: true,
        minMemoryPressure: 0.0
      },
      trustAnchor
    );
    const mitosis = new MitosisEngine(governance);

    const parent = new Cell(
      path.join(TEST_DIR, 'parent_stress_d.json'),
      'dummy-key',
      undefined,
      undefined,
      undefined,
      { specialization: 'spec_d' }
    );
    await parent.memory.initialize();
    await parent.start();

    // Wave 1: First request succeeds
    const res1 = await mitosis.reproduce(parent, {
      authorizationProof: createProof(parent.nodeId, 'event_d_wave1'),
      reproductionSeed: 'event_d_wave1',
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });
    expect(res1.result.success).toBe(true);
    if (res1.child) await res1.child.stop();

    // Wave 2: Burst of 50 requests immediately following -> all denied by active cooldown
    const burst = Array.from({ length: 50 }).map((_, idx) => {
      const eventId = `event_d_burst_${idx}`;
      return mitosis.reproduce(parent, {
        authorizationProof: createProof(parent.nodeId, eventId),
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 2,
        openRouterApiKey: 'dummy-key'
      });
    });

    const burstResults = await Promise.all(burst);
    expect(burstResults.every((r) => !r.result.success)).toBe(true);

    // Wave 3: Wait for cooldown to expire
    await new Promise((r) => setTimeout(r, 450));

    // Next request succeeds
    const res3 = await mitosis.reproduce(parent, {
      authorizationProof: createProof(parent.nodeId, 'event_d_wave3'),
      reproductionSeed: 'event_d_wave3',
      storageBasePath: TEST_DIR,
      currentPopulation: 2,
      openRouterApiKey: 'dummy-key'
    });
    expect(res3.result.success).toBe(true);
    if (res3.child) await res3.child.stop();

    await parent.stop();
  });

  it('Stress Test E: Population ceiling enforcement under concurrency', async () => {
    const CEILING = 5;
    const governance = new GovernanceEnforcer(
      {
        populationCeiling: CEILING,
        cooldownMs: 0,
        requireAuthorization: true,
        minMemoryPressure: 0.0
      },
      trustAnchor
    );
    const mitosis = new MitosisEngine(governance);

    // 10 distinct parents
    const parents: Cell[] = [];
    for (let i = 0; i < 10; i++) {
      const p = new Cell(
        path.join(TEST_DIR, `parent_stress_e_${i}.json`),
        'dummy-key',
        undefined,
        undefined,
        undefined,
        { specialization: `spec_e_${i}` }
      );
      await p.memory.initialize();
      await p.start();
      parents.push(p);
    }

    // 10 distinct parents try to reproduce with currentPopulation = 5
    const requests = parents.map((p, idx) => {
      const eventId = `stress_e_pop_${idx}`;
      return mitosis.reproduce(p, {
        authorizationProof: createProof(p.nodeId, eventId),
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: CEILING, // already at ceiling
        openRouterApiKey: 'dummy-key'
      });
    });

    const results = await Promise.all(requests);

    // All should be rejected with Population ceiling reached
    expect(results.every((r) => !r.result.success)).toBe(true);
    for (const r of results) {
      expect(r.result.errors?.[0]).toContain('Population ceiling reached');
    }

    for (const p of parents) {
      await p.stop();
    }
  });

  it('Stress Test F: Persistence integrity audit across 10 parent cells and reload from disk', async () => {
    const governance = new GovernanceEnforcer(
      {
        populationCeiling: 100,
        cooldownMs: 60000,
        requireAuthorization: true,
        minMemoryPressure: 0.0
      },
      trustAnchor
    );
    const mitosis = new MitosisEngine(governance);

    const parents: Cell[] = [];
    const children: Cell[] = [];

    for (let i = 0; i < 10; i++) {
      const parent = new Cell(
        path.join(TEST_DIR, `parent_f_${i}.json`),
        'dummy-key',
        undefined,
        undefined,
        undefined,
        { specialization: `spec_f_${i}` }
      );
      await parent.memory.initialize();
      await parent.start();

      const eventId = `event_f_${i}`;
      const res = await mitosis.reproduce(parent, {
        authorizationProof: createProof(parent.nodeId, eventId),
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 10 + i,
        openRouterApiKey: 'dummy-key'
      });

      expect(res.result.success).toBe(true);
      expect(res.child).toBeDefined();
      if (res.child) children.push(res.child);
      parents.push(parent);
    }

    // Stop all cells
    for (const c of children) await c.stop();
    for (const p of parents) await p.stop();

    // Reload all 10 parents from disk and verify their state & cooldown integrity
    for (let i = 0; i < 10; i++) {
      const reloadedParent = new Cell(
        path.join(TEST_DIR, `parent_f_${i}.json`),
        'dummy-key',
        parents[i].privateKey,
        parents[i].publicKey
      );
      await reloadedParent.start();

      const state = reloadedParent.cognitiveState.getState();
      expect(state.metadata.lastReproductionEvent).toBe(`event_f_${i}`);
      expect(state.metadata.lastReproductionTimestamp).toBeDefined();

      const cooldownRecord = await reloadedParent.memory.get(
        `reproduction_cooldown_${reloadedParent.nodeId}`
      );
      expect(cooldownRecord?.content?.parentCellId).toBe(reloadedParent.nodeId);

      const eventRecord = await reloadedParent.memory.get(`reproduction_event_event_f_${i}`);
      expect(eventRecord?.content?.status).toBe('COMMITTED');

      await reloadedParent.stop();
    }
  });

  it('Stress Test G, H, I: Cryptographic keypair uniqueness, clean teardown, and lineage invariant audit', async () => {
    const governance = new GovernanceEnforcer(
      {
        populationCeiling: 100,
        cooldownMs: 0,
        requireAuthorization: true,
        minMemoryPressure: 0.0
      },
      trustAnchor
    );
    const mitosis = new MitosisEngine(governance);

    const parent = new Cell(
      path.join(TEST_DIR, 'parent_ghi.json'),
      'dummy-key',
      undefined,
      undefined,
      undefined,
      { specialization: 'spec_ghi' }
    );
    await parent.memory.initialize();
    await parent.start();

    const generatedNodeIds = new Set<string>();
    generatedNodeIds.add(parent.nodeId);

    const children: Cell[] = [];

    // Create 15 sequential children to verify lineage and identity invariants
    for (let i = 0; i < 15; i++) {
      const eventId = `event_ghi_${i}`;
      const res = await mitosis.reproduce(parent, {
        authorizationProof: createProof(parent.nodeId, eventId),
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1 + i,
        openRouterApiKey: 'dummy-key'
      });

      expect(res.result.success).toBe(true);
      const childId = res.result.childCellId!;
      expect(childId).toBeDefined();

      // Invariant I: Identity uniqueness
      expect(generatedNodeIds.has(childId)).toBe(false);
      generatedNodeIds.add(childId);

      // Invariant H: Lineage correctness
      expect(res.result.parentCellId).toBe(parent.nodeId);
      expect(res.result.generation).toBe(parent.genome.generation + 1);
      expect(res.child).toBeDefined();

      if (res.child) children.push(res.child);
    }

    // Invariant G: Clean resource shutdown
    for (const c of children) {
      await c.stop();
    }
    await parent.stop();
  });
});
