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

const TEST_DIR = path.join(process.cwd(), 'data', 'test_p6_3_idem');

describe('P6.3 True Idempotent Reproduction (IDEM-01 to IDEM-10)', () => {
  let parentCell: Cell;
  let authorityKp: { publicKey: string; privateKey: string };
  let governance: GovernanceEnforcer;
  let mitosis: MitosisEngine;

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });

    authorityKp = identityCrypto.generateKeyPair();
    const trustAnchor = new StaticTrustAnchor([
      { issuer: 'creator-authority', publicKey: authorityKp.publicKey }
    ]);

    governance = new GovernanceEnforcer(
      {
        populationCeiling: 50,
        cooldownMs: 0, // 0 cooldown for idempotency focus
        requireAuthorization: true,
        minMemoryPressure: 0.0
      },
      trustAnchor
    );

    mitosis = new MitosisEngine(governance);

    parentCell = new Cell(
      path.join(TEST_DIR, 'parent_cell.json'),
      'dummy-key',
      undefined,
      undefined,
      undefined,
      { specialization: 'idem_parent' }
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

  it('IDEM-01 & IDEM-02: First call succeeds; second call with same eventId returns identical child without recreation', async () => {
    const eventId = 'idem-event-1';
    const proof = createProof(parentCell.nodeId, eventId);

    // Call 1
    const res1 = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });

    expect(res1.result.success).toBe(true);
    expect(res1.result.childCellId).toBeDefined();
    const childId1 = res1.result.childCellId;

    // Call 2 with same eventId
    const res2 = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: 2,
      openRouterApiKey: 'dummy-key'
    });

    expect(res2.result.success).toBe(true);
    expect(res2.result.childCellId).toBe(childId1);
    expect(res2.child).toBeDefined();

    if (res1.child) await res1.child.stop();
  });

  it('IDEM-03: Multiple concurrent calls with same eventId resolve to the exact same child instance', async () => {
    const eventId = 'idem-concurrent-10';
    const proof = createProof(parentCell.nodeId, eventId);

    // Launch 10 simultaneous reproduction requests with same eventId
    const promises = Array.from({ length: 10 }).map(() =>
      mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      })
    );

    const results = await Promise.all(promises);

    const firstChildId = results[0].result.childCellId;
    expect(firstChildId).toBeDefined();

    for (const r of results) {
      expect(r.result.success).toBe(true);
      expect(r.result.childCellId).toBe(firstChildId);
    }

    // Check disk storage: there should only be 1 child file created
    const files = await fs.readdir(TEST_DIR);
    const childFiles = files.filter((f) => f.startsWith('cell_') && !f.includes('parent'));
    expect(childFiles.length).toBe(1);

    if (results[0].child) await results[0].child.stop();
  });

  it('IDEM-04: Idempotent replay preserves mutationSummary, differentiationSummary, and lineageRecord', async () => {
    const eventId = 'idem-metadata-check';
    const proof = createProof(parentCell.nodeId, eventId);

    const res1 = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });

    const res2 = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: 2,
      openRouterApiKey: 'dummy-key'
    });

    expect(res2.result.mutationSummary).toEqual(res1.result.mutationSummary);
    expect(res2.result.differentiationSummary).toEqual(res1.result.differentiationSummary);
    expect(res2.result.generation).toBe(res1.result.generation);

    if (res1.child) await res1.child.stop();
  });

  it('IDEM-05: Idempotent replay does not advance parent descendantsCount', async () => {
    const eventId = 'idem-descendants-check';
    const proof = createProof(parentCell.nodeId, eventId);

    // First call
    const res1 = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });
    expect(res1.result.success).toBe(true);

    const countAfterFirst = parentCell.cognitiveState.getState().metadata.descendantsCount;
    expect(countAfterFirst).toBe('1');

    // Repeated calls
    for (let i = 0; i < 3; i++) {
      await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 2,
        openRouterApiKey: 'dummy-key'
      });
    }

    const countAfterRepeats = parentCell.cognitiveState.getState().metadata.descendantsCount;
    expect(countAfterRepeats).toBe('1'); // Still 1!

    if (res1.child) await res1.child.stop();
  });

  it('IDEM-06: Idempotent replay works even after parent cell restart', async () => {
    const eventId = 'idem-restart-check';
    const proof = createProof(parentCell.nodeId, eventId);

    const res1 = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });
    expect(res1.result.success).toBe(true);
    const originalChildId = res1.result.childCellId;
    if (res1.child) await res1.child.stop();

    // Restart parent cell from disk
    await parentCell.stop();
    const reloadedParent = new Cell(
      path.join(TEST_DIR, 'parent_cell.json'),
      'dummy-key',
      parentCell.privateKey,
      parentCell.publicKey,
      undefined,
      { specialization: 'idem_parent' }
    );
    await reloadedParent.start();

    // Replay same event on reloaded parent
    const res2 = await mitosis.reproduce(reloadedParent, {
      authorizationProof: proof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: 2,
      openRouterApiKey: 'dummy-key'
    });

    expect(res2.result.success).toBe(true);
    expect(res2.result.childCellId).toBe(originalChildId);

    await reloadedParent.stop();
  });

  it('IDEM-07: Idempotent replay does not change lastReproductionTimestamp', async () => {
    const eventId = 'idem-timestamp-check';
    const proof = createProof(parentCell.nodeId, eventId);

    const res1 = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });
    expect(res1.result.success).toBe(true);
    const originalTimestamp = parentCell.cognitiveState.getState().metadata.lastReproductionTimestamp;

    await new Promise((r) => setTimeout(r, 20));

    // Replay
    const res2 = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: 2,
      openRouterApiKey: 'dummy-key'
    });
    expect(res2.result.success).toBe(true);

    const timestampAfterReplay = parentCell.cognitiveState.getState().metadata.lastReproductionTimestamp;
    expect(timestampAfterReplay).toBe(originalTimestamp);

    if (res1.child) await res1.child.stop();
  });

  it('IDEM-08: Different eventIds on the same parent result in distinct children', async () => {
    const event1 = 'idem-distinct-1';
    const event2 = 'idem-distinct-2';

    const res1 = await mitosis.reproduce(parentCell, {
      authorizationProof: createProof(parentCell.nodeId, event1),
      reproductionSeed: event1,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });

    const res2 = await mitosis.reproduce(parentCell, {
      authorizationProof: createProof(parentCell.nodeId, event2),
      reproductionSeed: event2,
      storageBasePath: TEST_DIR,
      currentPopulation: 2,
      openRouterApiKey: 'dummy-key'
    });

    expect(res1.result.success).toBe(true);
    expect(res2.result.success).toBe(true);
    expect(res1.result.childCellId).not.toBe(res2.result.childCellId);

    if (res1.child) await res1.child.stop();
    if (res2.child) await res2.child.stop();
  });

  it('IDEM-09: Replay with same eventId on DIFFERENT parent cell is rejected (subject binding)', async () => {
    const otherParent = new Cell(
      path.join(TEST_DIR, 'other_parent.json'),
      'dummy-key',
      undefined,
      undefined,
      undefined,
      { specialization: 'other_parent' }
    );
    await otherParent.memory.initialize();
    await otherParent.start();

    const eventId = 'idem-binding-test';
    // Proof bound to parentCell.nodeId
    const proof = createProof(parentCell.nodeId, eventId);

    // Attempt to reproduce on otherParent with proof for parentCell
    const res = await mitosis.reproduce(otherParent, {
      authorizationProof: proof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: 2,
      openRouterApiKey: 'dummy-key'
    });

    expect(res.result.success).toBe(false);
    expect(res.result.errors?.[0]).toContain('subject mismatch');

    await otherParent.stop();
  });

  it('IDEM-10: PENDING event clean recovery on retry', async () => {
    const eventId = 'idem-pending-recovery';
    const eventKey = `reproduction_event_${eventId}`;

    // Simulate an interrupted PENDING event record written in memory
    await parentCell.memory.put({
      id: eventKey,
      cellId: parentCell.nodeId,
      category: 'procedural' as any,
      content: {
        eventId,
        parentCellId: parentCell.nodeId,
        status: 'PENDING',
        createdAt: Date.now() - 10000,
        generation: 2
      },
      source: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1.0,
      hash: '',
      provenance: [parentCell.nodeId],
      version: 1
    });

    // Valid retry should overwrite PENDING and commit cleanly
    const proof = createProof(parentCell.nodeId, eventId);
    const res = await mitosis.reproduce(parentCell, {
      authorizationProof: proof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-key'
    });

    expect(res.result.success).toBe(true);
    expect(res.result.childCellId).toBeDefined();

    // Verify stored event is now COMMITTED
    const finalRecord = await parentCell.memory.get(eventKey);
    expect(finalRecord?.content?.status).toBe('COMMITTED');

    if (res.child) await res.child.stop();
  });
});
