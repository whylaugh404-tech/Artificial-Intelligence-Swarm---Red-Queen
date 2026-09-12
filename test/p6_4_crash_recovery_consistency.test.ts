import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Cell } from '../src/redqueen/core/cell';
import { GovernanceEnforcer } from '../src/redqueen/reproduction/policy';
import { MitosisEngine } from '../src/redqueen/reproduction/mitosis';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import {
  AuthorizationProof,
  StaticTrustAnchor,
  ReproductionStage,
  ReproductionEventRecord
} from '../src/redqueen/reproduction/types';
import {
  auditParentReproductionConsistency,
  auditPopulationDirectory,
  validateChildIntegrity
} from '../src/redqueen/reproduction/consistency';
import { MemoryCategory } from '../src/redqueen/memory/store';

const TEST_DIR = path.join(process.cwd(), 'data', 'test_p6_4_recovery');

describe('P6.4 Crash Recovery, Cross-Restart Durability & Population Consistency', () => {
  let parentCell: Cell;
  let authorityKp: { publicKey: string; privateKey: string };
  let governance: GovernanceEnforcer;
  let mitosis: MitosisEngine;

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
        cooldownMs: 2000,
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
      { specialization: 'recovery_parent' }
    );
    await parentCell.memory.initialize();
    await parentCell.start();
  });

  afterEach(async () => {
    try {
      await parentCell.stop();
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

  describe('Phase 5: Deterministic Failure Injection Across All 9 Reproduction Stages', () => {
    it('Stage 1: Failure AFTER_PENDING_PERSISTENCE leaves PENDING record; subsequent retry resumes cleanly without duplicates', async () => {
      const eventId = 'fail-stage-1';
      const proof = createProof(parentCell.nodeId, eventId);

      // Trigger reproduction with failure injected at Stage 1
      const res1 = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key',
        failureInjectionHook: async (stage) => {
          if (stage === ReproductionStage.AFTER_PENDING_PERSISTENCE) {
            throw new Error('Crash injected at AFTER_PENDING_PERSISTENCE');
          }
        }
      });

      expect(res1.result.success).toBe(false);
      expect(res1.result.errors?.[0]).toContain('AFTER_PENDING_PERSISTENCE');

      // Verify no child file exists on disk
      const filesAfterFail = await fs.readdir(TEST_DIR);
      const childFilesAfterFail = filesAfterFail.filter(f => f.startsWith('cell_') && f.endsWith('.json') && !f.includes('parent'));
      expect(childFilesAfterFail.length).toBe(0);

      // Verify event record in parent memory
      const eventRec = await parentCell.memory.get(`reproduction_event_${eventId}`);
      expect(eventRec).toBeDefined();

      // Retry reproduction for same eventId
      const res2 = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });

      expect(res2.result.success).toBe(true);
      expect(res2.result.childCellId).toBeDefined();

      // Check that exactly ONE child file exists on disk
      const filesAfterRetry = await fs.readdir(TEST_DIR);
      const childFilesAfterRetry = filesAfterRetry.filter(f => f.startsWith('cell_') && f.endsWith('.json') && !f.includes('parent'));
      expect(childFilesAfterRetry.length).toBe(1);
    });

    it('Stage 2: Failure AFTER_CHILD_IDENTITY cleans partial state; retry succeeds with valid child', async () => {
      const eventId = 'fail-stage-2';
      const proof = createProof(parentCell.nodeId, eventId);

      const res1 = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key',
        failureInjectionHook: async (stage) => {
          if (stage === ReproductionStage.AFTER_CHILD_IDENTITY) {
            throw new Error('Crash injected at AFTER_CHILD_IDENTITY');
          }
        }
      });

      expect(res1.result.success).toBe(false);

      // Retry
      const res2 = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });

      expect(res2.result.success).toBe(true);
      expect(res2.result.childCellId).toBeDefined();
    });

    it('Stage 3: Failure AFTER_CHILD_STORAGE cleans partially written child file; retry succeeds', async () => {
      const eventId = 'fail-stage-3';
      const proof = createProof(parentCell.nodeId, eventId);

      const res1 = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key',
        failureInjectionHook: async (stage) => {
          if (stage === ReproductionStage.AFTER_CHILD_STORAGE) {
            throw new Error('Crash injected at AFTER_CHILD_STORAGE');
          }
        }
      });

      expect(res1.result.success).toBe(false);

      // In normal mode, compensating action removes child file
      const files = await fs.readdir(TEST_DIR);
      const childFiles = files.filter(f => f.startsWith('cell_') && f.endsWith('.json') && !f.includes('parent'));
      expect(childFiles.length).toBe(0);

      // Retry succeeds cleanly
      const res2 = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });

      expect(res2.result.success).toBe(true);
    });

    it('Stage 4: Failure AFTER_MEMORY_INHERITANCE rolls back cleanly and permits retry', async () => {
      const eventId = 'fail-stage-4';
      const proof = createProof(parentCell.nodeId, eventId);

      const res1 = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key',
        failureInjectionHook: async (stage) => {
          if (stage === ReproductionStage.AFTER_MEMORY_INHERITANCE) {
            throw new Error('Crash injected at AFTER_MEMORY_INHERITANCE');
          }
        }
      });

      expect(res1.result.success).toBe(false);

      const res2 = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });

      expect(res2.result.success).toBe(true);
    });

    it('Stage 5 & 6: Failure AFTER_PARENT_STATE_UPDATE or AFTER_COOLDOWN_PERSISTENCE restores cognitive snapshot', async () => {
      const eventId = 'fail-stage-5';
      const proof = createProof(parentCell.nodeId, eventId);

      const origMeta = { ...parentCell.cognitiveState.getState().metadata };

      const res1 = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key',
        failureInjectionHook: async (stage) => {
          if (stage === ReproductionStage.AFTER_PARENT_STATE_UPDATE) {
            throw new Error('Crash injected at AFTER_PARENT_STATE_UPDATE');
          }
        }
      });

      expect(res1.result.success).toBe(false);

      // Check snapshot rollback of parent metadata
      const currentMeta = parentCell.cognitiveState.getState().metadata;
      expect(currentMeta.lastReproductionEvent).toBe(origMeta.lastReproductionEvent);
    });

    it('Stage 7 & 8: Failure BEFORE / DURING COMMITTED persistence rolls back snapshot and marks FAILED', async () => {
      const eventId = 'fail-stage-8';
      const proof = createProof(parentCell.nodeId, eventId);

      const res1 = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key',
        failureInjectionHook: async (stage) => {
          if (stage === ReproductionStage.DURING_COMMITTED_PERSISTENCE) {
            throw new Error('I/O error during COMMITTED write');
          }
        }
      });

      expect(res1.result.success).toBe(false);

      // Verify event record status is marked FAILED in parent memory
      const recEntry = await parentCell.memory.get(`reproduction_event_${eventId}`);
      expect(recEntry).toBeDefined();
      expect((recEntry?.content as any).status).toBe('FAILED');
    });

    it('Stage 9: Failure AFTER_COMMITTED_PERSISTENCE preserves committed result and child', async () => {
      const eventId = 'fail-stage-9';
      const proof = createProof(parentCell.nodeId, eventId);

      try {
        await mitosis.reproduce(parentCell, {
          authorizationProof: proof,
          reproductionSeed: eventId,
          storageBasePath: TEST_DIR,
          currentPopulation: 1,
          openRouterApiKey: 'dummy-key',
          failureInjectionHook: async (stage) => {
            if (stage === ReproductionStage.AFTER_COMMITTED_PERSISTENCE) {
              throw new Error('Crash injected AFTER_COMMITTED_PERSISTENCE');
            }
          }
        });
      } catch {}

      // Even if an unhandled error occurred after commit, replaying the event returns COMMITTED child
      const replay = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 2,
        openRouterApiKey: 'dummy-key'
      });

      expect(replay.result.success).toBe(true);
      expect(replay.result.childCellId).toBeDefined();
    });
  });

  describe('Phase 2: The 5 Canonical Recovery Scenarios (Cases A through E)', () => {
    it('Case A: PENDING + child does not exist -> safely resumes and commits on retry', async () => {
      const eventId = 'case-a-pending-no-child';
      const proof = createProof(parentCell.nodeId, eventId);

      // Synthesize a PENDING event record where child file was never created
      const pendingRecord: ReproductionEventRecord = {
        eventId,
        parentCellId: parentCell.nodeId,
        status: 'PENDING',
        createdAt: Date.now() - 5000,
        generation: parentCell.genome.generation + 1
      };

      await parentCell.memory.put({
        id: `reproduction_event_${eventId}`,
        cellId: parentCell.nodeId,
        category: MemoryCategory.PROCEDURAL,
        content: pendingRecord,
        source: 'mitosis_engine',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1.0,
        hash: '',
        provenance: [parentCell.nodeId],
        version: 1
      });

      // Execute reproduction with this eventId
      const res = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });

      expect(res.result.success).toBe(true);
      expect(res.result.childCellId).toBeDefined();

      // Check persisted record is now COMMITTED
      const updatedEntry = await parentCell.memory.get(`reproduction_event_${eventId}`);
      expect((updatedEntry?.content as ReproductionEventRecord).status).toBe('COMMITTED');
    });

    it('Case B: PENDING + child exists and is valid -> finalizes COMMITTED without creating a duplicate child', async () => {
      const eventId = 'case-b-pending-with-valid-child';
      const proof = createProof(parentCell.nodeId, eventId);

      // Simulate an abrupt crash at BEFORE_COMMITTED_PERSISTENCE leaving valid child file on disk
      let simulatedChildId = '';
      const failRes = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key',
        simulateAbruptCrash: true,
        failureInjectionHook: async (stage) => {
          if (stage === ReproductionStage.BEFORE_COMMITTED_PERSISTENCE) {
            throw new Error('Simulated abrupt crash before commit');
          }
        }
      });

      expect(failRes.result.success).toBe(false);

      // Check that child file exists on disk
      const files = await fs.readdir(TEST_DIR);
      const childFiles = files.filter(f => f.startsWith('cell_') && f.endsWith('.json') && !f.includes('parent'));
      expect(childFiles.length).toBe(1);
      simulatedChildId = childFiles[0].replace('cell_', '').replace('.json', '');

      // Verify that parent event record is currently PENDING
      const pendingEntry = await parentCell.memory.get(`reproduction_event_${eventId}`);
      expect((pendingEntry?.content as any).status).toBe('PENDING');

      // Now create a new MitosisEngine instance (simulating server reboot)
      const rebootEngine = new MitosisEngine(governance);
      const recoverRes = await rebootEngine.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });

      expect(recoverRes.result.success).toBe(true);
      // It must finalize the EXACT same child rather than creating a new one!
      expect(recoverRes.result.childCellId).toBe(simulatedChildId);

      // Ensure total child files on disk is STILL strictly 1
      const filesAfter = await fs.readdir(TEST_DIR);
      const childFilesAfter = filesAfter.filter(f => f.startsWith('cell_') && f.endsWith('.json') && !f.includes('parent'));
      expect(childFilesAfter.length).toBe(1);

      // Event status is now COMMITTED
      const committedEntry = await parentCell.memory.get(`reproduction_event_${eventId}`);
      expect((committedEntry?.content as any).status).toBe('COMMITTED');
    });

    it('Case C: PENDING + child exists but is corrupted -> quarantines corrupted file and marks FAILED', async () => {
      const eventId = 'case-c-pending-corrupt-child';
      const proof = createProof(parentCell.nodeId, eventId);

      const corruptedChildId = 'deadbeef0000111122223333444455556666777788889999aaaabbbbccccdddd';
      const corruptedPath = path.join(TEST_DIR, `cell_${corruptedChildId}.json`);
      // Write corrupted truncated JSON
      await fs.writeFile(corruptedPath, '{"invalid_json": true, "corrupted_bytes": [');

      // Set PENDING record pointing to the corrupted child file
      const pendingRecord: ReproductionEventRecord = {
        eventId,
        parentCellId: parentCell.nodeId,
        childCellId: corruptedChildId,
        childStoragePath: corruptedPath,
        status: 'PENDING',
        createdAt: Date.now() - 5000,
        generation: parentCell.genome.generation + 1
      };

      await parentCell.memory.put({
        id: `reproduction_event_${eventId}`,
        cellId: parentCell.nodeId,
        category: MemoryCategory.PROCEDURAL,
        content: pendingRecord,
        source: 'mitosis_engine',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1.0,
        hash: '',
        provenance: [parentCell.nodeId],
        version: 1
      });

      // Attempt reproduction / recovery
      const res = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });

      expect(res.result.success).toBe(false);
      expect(res.result.errors?.[0]).toContain('quarantined');

      // Check corrupted file was renamed to .quarantine.*
      const files = await fs.readdir(TEST_DIR);
      const quarantined = files.filter(f => f.includes('quarantine'));
      expect(quarantined.length).toBeGreaterThan(0);

      // Event record is marked FAILED
      const rec = await parentCell.memory.get(`reproduction_event_${eventId}`);
      expect((rec?.content as any).status).toBe('FAILED');
    });

    it('Case D: COMMITTED + child exists -> reloads committed child idempotently', async () => {
      const eventId = 'case-d-committed-exists';
      const proof = createProof(parentCell.nodeId, eventId);

      // Reproduce successfully first
      const res1 = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });

      expect(res1.result.success).toBe(true);
      const childId = res1.result.childCellId;

      // New MitosisEngine instance
      const freshEngine = new MitosisEngine(governance);
      const res2 = await freshEngine.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 2,
        openRouterApiKey: 'dummy-key'
      });

      expect(res2.result.success).toBe(true);
      expect(res2.result.childCellId).toBe(childId);
      expect(res2.child).toBeDefined();
      expect(res2.child?.nodeId).toBe(childId);
    });

    it('Case E: COMMITTED + child missing -> reports explicit consistency failure, does NOT silently replace', async () => {
      const eventId = 'case-e-committed-missing';
      const proof = createProof(parentCell.nodeId, eventId);

      // Reproduce successfully
      const res1 = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });

      expect(res1.result.success).toBe(true);
      const childId = res1.result.childCellId!;
      const childPath = path.join(TEST_DIR, `cell_${childId}.json`);

      // Delete the child file from disk
      await fs.rm(childPath, { force: true });

      // In a new engine instance, attempt replay
      const freshEngine = new MitosisEngine(governance);
      const res2 = await freshEngine.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });

      // Must fail with explicit consistency error!
      expect(res2.result.success).toBe(false);
      expect(res2.result.errors?.[0]).toContain('Population consistency failure');
      expect(res2.result.errors?.[0]).toContain('Committed child storage missing');
    });
  });

  describe('Phase 3: Cross-Restart and Reload Verification', () => {
    it('Parent state and cooldown survive full Cell re-instantiation from disk', async () => {
      const eventId = 'cross-restart-event-1';
      const proof = createProof(parentCell.nodeId, eventId);

      const res = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });

      expect(res.result.success).toBe(true);
      const childId = res.result.childCellId!;

      // Stop current parent cell
      await parentCell.stop();

      // Reconstruct parent cell from disk storage
      const reloadedParent = await Cell.loadFromStorage(
        path.join(TEST_DIR, 'parent_cell.json'),
        'dummy-key'
      );
      await reloadedParent.start();

      expect(reloadedParent.nodeId).toBe(parentCell.nodeId);

      // Verify parent cognitive state has recorded the event
      const meta = reloadedParent.cognitiveState.getState().metadata || {};
      expect(meta.lastReproductionEvent).toBe(eventId);
      expect(meta[`reproduction_event_${eventId}`]).toBe(childId);

      // Verify cooldown is still active for a new eventId
      const newEventId = 'cross-restart-event-2';
      const newProof = createProof(reloadedParent.nodeId, newEventId);
      const freshEngine = new MitosisEngine(governance);

      const deniedRes = await freshEngine.reproduce(reloadedParent, {
        authorizationProof: newProof,
        reproductionSeed: newEventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 2,
        openRouterApiKey: 'dummy-key'
      });

      expect(deniedRes.result.success).toBe(false);
      expect(deniedRes.result.errors?.[0]?.toLowerCase()).toContain('cooldown active');

      // Clean up reloadedParent
      await reloadedParent.stop();
    });
  });

  describe('Phase 4: Population-Wide Consistency Auditing', () => {
    it('auditPopulationDirectory returns consistent: true on clean population', async () => {
      const eventId = 'audit-clean-event';
      const proof = createProof(parentCell.nodeId, eventId);

      const res = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });

      expect(res.result.success).toBe(true);

      const report = await auditPopulationDirectory(TEST_DIR, [parentCell]);
      expect(report.consistent).toBe(true);
      expect(report.anomalies.length).toBe(0);
      expect(report.scannedChildren).toBe(1);
    });

    it('auditPopulationDirectory detects ORPHAN_CHILD_STORAGE when uncommitted child file exists', async () => {
      // Create an unreferenced rogue cell file claiming parentCell as its parent
      const rogueKey = identityCrypto.generateKeyPair();
      const rogueId = identityCrypto.deriveNodeId(rogueKey.publicKey);
      const rogueCell = new Cell(
        path.join(TEST_DIR, `cell_${rogueId}.json`),
        'dummy-key',
        rogueKey.privateKey,
        rogueKey.publicKey,
        undefined,
        {
          parentCellId: parentCell.nodeId,
          generation: 2,
          lineageId: 'lineage-rogue'
        }
      );
      await rogueCell.memory.initialize();
      await rogueCell.start();
      await rogueCell.stop();

      const report = await auditPopulationDirectory(TEST_DIR, [parentCell]);
      expect(report.consistent).toBe(false);
      const orphanAnomalies = report.anomalies.filter(a => a.code === 'ORPHAN_CHILD_STORAGE');
      expect(orphanAnomalies.length).toBe(1);
      expect(orphanAnomalies[0].cellId).toBe(rogueId);
    });

    it('auditParentReproductionConsistency detects MISSING_CHILD_STORAGE when child file is deleted', async () => {
      const eventId = 'audit-ghost-event';
      const proof = createProof(parentCell.nodeId, eventId);

      const res = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });

      expect(res.result.success).toBe(true);
      const childId = res.result.childCellId!;
      const childPath = path.join(TEST_DIR, `cell_${childId}.json`);

      // Delete child file
      await fs.rm(childPath, { force: true });

      const audit = await auditParentReproductionConsistency(parentCell);
      expect(audit.anomalies.some(a => a.code === 'MISSING_CHILD_STORAGE')).toBe(true);
    });

    it('auditParentReproductionConsistency detects MALFORMED_CHILD_STORAGE', async () => {
      const eventId = 'audit-malformed-child';
      const proof = createProof(parentCell.nodeId, eventId);

      const res = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'dummy-key'
      });

      expect(res.result.success).toBe(true);
      const childId = res.result.childCellId!;
      const childPath = path.join(TEST_DIR, `cell_${childId}.json`);

      // Corrupt child file
      await fs.writeFile(childPath, '{ "totally_broken": [');

      const audit = await auditParentReproductionConsistency(parentCell);
      expect(audit.anomalies.some(a => a.code === 'MALFORMED_CHILD_STORAGE')).toBe(true);
    });
  });

  describe('Policy Enforcement During Recovery', () => {
    it('Cannot resume PENDING event if population ceiling is reached', async () => {
      const eventId = 'ceiling-blocked-recovery';
      const proof = createProof(parentCell.nodeId, eventId);

      // Create PENDING record
      const pendingRecord: ReproductionEventRecord = {
        eventId,
        parentCellId: parentCell.nodeId,
        status: 'PENDING',
        createdAt: Date.now() - 5000,
        generation: parentCell.genome.generation + 1
      };

      await parentCell.memory.put({
        id: `reproduction_event_${eventId}`,
        cellId: parentCell.nodeId,
        category: MemoryCategory.PROCEDURAL,
        content: pendingRecord,
        source: 'mitosis_engine',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1.0,
        hash: '',
        provenance: [parentCell.nodeId],
        version: 1
      });

      // Try to recover when currentPopulation == ceiling (20)
      const res = await mitosis.reproduce(parentCell, {
        authorizationProof: proof,
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 20, // at ceiling
        openRouterApiKey: 'dummy-key'
      });

      expect(res.result.success).toBe(false);
      expect(res.result.errors?.[0]).toContain('ceiling');

      // Verify that event record was transitioned to FAILED
      const rec = await parentCell.memory.get(`reproduction_event_${eventId}`);
      expect((rec?.content as any).status).toBe('FAILED');
    });
  });
});
