import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Cell } from '../src/redqueen/core/cell';
import { CellState } from '../src/redqueen/core/lifecycle';
import { MemoryCategory } from '../src/redqueen/memory/store';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import { AuthorizationProof, StaticTrustAnchor } from '../src/redqueen/reproduction/types';

const TEST_DIR = path.join(process.cwd(), 'data', 'test_cell_mitosis_lifecycle');

function createAuthProof(parentCellId: string, eventId: string, issuerKp: { privateKey: string; publicKey: string }): AuthorizationProof {
  const payload = {
    action: 'reproduce',
    subject: parentCellId,
    eventId,
    exp: Date.now() + 60000,
    issuer: 'redqueen-root'
  };
  const signature = identityCrypto.signData(issuerKp.privateKey, JSON.stringify(payload));
  return {
    payload,
    signature,
    issuerPublicKey: issuerKp.publicKey
  };
}

describe('Cell Lifecycle Mitosis Organ Integration (Repair Prompt 08)', () => {
  let rootAuthorityKp: { privateKey: string; publicKey: string };
  let trustAnchor: StaticTrustAnchor;
  let parentCell: Cell;
  let childCell: Cell | undefined;
  let grandChildCell: Cell | undefined;

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });

    rootAuthorityKp = identityCrypto.generateKeyPair();
    trustAnchor = new StaticTrustAnchor([
      { issuer: 'redqueen-root', publicKey: rootAuthorityKp.publicKey }
    ]);

    parentCell = new Cell(
      path.join(TEST_DIR, 'parent_cell.json'),
      'test-api-key',
      undefined,
      undefined,
      undefined,
      {
        specialization: 'cyber_intelligence',
        capabilities: ['INFO_PROCESSING', 'KNOWLEDGE_QUERY'],
        reproductionPolicy: {
          populationCeiling: 10,
          cooldownMs: 0,
          requireAuthorization: true,
          minMemoryPressure: 0.0
        },
        trustAnchor
      }
    );

    await parentCell.memory.initialize();

    // Seed parent memory: core semantic memory, low-confidence semantic, procedural, episodic
    await parentCell.memory.put({
      id: 'core_knowledge_neural_arch',
      cellId: parentCell.nodeId,
      category: MemoryCategory.SEMANTIC,
      type: 'COGNITIVE_CONCEPT',
      content: {
        conceptId: 'concept_neural_arch',
        name: 'Neural Architecture Core',
        originatingCellId: parentCell.nodeId,
        currentHolderCellId: parentCell.nodeId,
        confidence: 0.95
      },
      confidence: 0.95,
      hash: 'hash_core_arch',
      provenance: [parentCell.nodeId],
      source: 'training',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await parentCell.memory.put({
      id: 'cyber_threat_profile',
      cellId: parentCell.nodeId,
      category: MemoryCategory.SEMANTIC,
      content: 'Cyber threat actor signatures and intelligence',
      confidence: 0.85,
      hash: 'hash_cyber_profile',
      provenance: [parentCell.nodeId],
      source: 'intel',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await parentCell.memory.put({
      id: 'ephemeral_low_confidence',
      cellId: parentCell.nodeId,
      category: MemoryCategory.EPISODIC,
      content: 'Transient unverified observation',
      confidence: 0.2,
      hash: 'hash_ephemeral',
      provenance: [parentCell.nodeId],
      source: 'raw_feed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await parentCell.start();
  });

  afterEach(async () => {
    try {
      if (grandChildCell) await grandChildCell.stop();
      if (childCell) await childCell.stop();
      if (parentCell) await parentCell.stop();
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  it('Requirement 1 & 2: Cell constructs MitosisEngine and GovernanceEnforcer as native lifecycle organs', () => {
    expect(parentCell.mitosis).toBeDefined();
    expect(parentCell.governance).toBeDefined();
    expect(typeof parentCell.reproduce).toBe('function');
    expect(parentCell.governance.requireAuthorization).toBe(true);
    expect(parentCell.governance.populationCeiling).toBe(10);
  });

  it('Requirement 3, 4, 5, 6: Cell triggers reproduction directly, isolating parent identity while propagating lineage and creating new child identity', async () => {
    const parentNodeIdBefore = parentCell.nodeId;
    const parentPrivateKeyBefore = (parentCell as any).privateKey;
    const parentPublicKeyBefore = parentCell.publicKey;
    const eventId = 'mitosis_event_01';

    const authProof = createAuthProof(parentCell.nodeId, eventId, rootAuthorityKp);

    const { result, child } = await parentCell.reproduce({
      authorizationProof: authProof,
      reproductionSeed: eventId,
      specializationBias: 'cyber_countermeasures'
    });

    expect(result.success).toBe(true);
    expect(child).toBeDefined();
    childCell = child!;

    // 4. Parent identity is preserved and NOT transferred
    expect(parentCell.nodeId).toBe(parentNodeIdBefore);
    expect((parentCell as any).privateKey).toBe(parentPrivateKeyBefore);
    expect(parentCell.publicKey).toBe(parentPublicKeyBefore);

    // 5. Child has brand new distinct identity
    expect(childCell.nodeId).not.toBe(parentCell.nodeId);
    expect((childCell as any).privateKey).not.toBe(parentPrivateKeyBefore);
    expect(childCell.publicKey).not.toBe(parentPublicKeyBefore);
    expect(childCell.nodeId).toBe(result.childCellId);

    // 6. Lineage is linked
    expect(childCell.lineage.parentCellId).toBe(parentCell.nodeId);
    expect(childCell.genome.parentCellId).toBe(parentCell.nodeId);
    expect(childCell.genome.generation).toBe(parentCell.genome.generation + 1);
    expect(childCell.lineage.lineageId).toBe(parentCell.lineage.lineageId);

    // 7. Memory inheritance follows partition rules
    const childMemories = await childCell.memory.search({});
    expect(childMemories.length).toBeGreaterThan(0);

    // High confidence / core semantic memory is inherited
    const inheritedCore = childMemories.find(m => m.id === 'core_knowledge_neural_arch');
    expect(inheritedCore).toBeDefined();
    expect(inheritedCore?.cellId).toBe(childCell.nodeId);
    expect(inheritedCore?.content.currentHolderCellId).toBe(childCell.nodeId);
    expect(inheritedCore?.content.originatingCellId).toBe(parentCell.nodeId);

    // Low confidence ephemeral observation is NOT inherited
    const uninheritedLowConf = childMemories.find(m => m.id === 'ephemeral_low_confidence');
    expect(uninheritedLowConf).toBeUndefined();

    // Parent telemetry and descendants count updated
    const status = parentCell.getStatus();
    expect(status.mitosis.descendantsCount).toBe(1);
    expect(status.mitosis.lastReproductionEvent).toBe(eventId);
  });

  it('Multi-generational reproduction: Child can independently trigger mitosis to produce Grandchild', async () => {
    // 1. First generation mitosis
    const event1 = 'mitosis_gen_1';
    const proof1 = createAuthProof(parentCell.nodeId, event1, rootAuthorityKp);
    const { result: res1, child: gen1Child } = await parentCell.reproduce({
      authorizationProof: proof1,
      reproductionSeed: event1,
      specializationBias: 'cyber_tactical'
    });
    expect(res1.success).toBe(true);
    expect(gen1Child).toBeDefined();
    childCell = gen1Child!;

    await childCell.start();

    // 2. Second generation mitosis (triggered by Child directly)
    const event2 = 'mitosis_gen_2';
    const proof2 = createAuthProof(childCell.nodeId, event2, rootAuthorityKp);
    const { result: res2, child: gen2Child } = await childCell.reproduce({
      authorizationProof: proof2,
      reproductionSeed: event2,
      specializationBias: 'cyber_autonomous'
    });
    expect(res2.success).toBe(true);
    expect(gen2Child).toBeDefined();
    grandChildCell = gen2Child!;

    // Grandchild identity and lineage
    expect(grandChildCell.nodeId).not.toBe(childCell.nodeId);
    expect(grandChildCell.nodeId).not.toBe(parentCell.nodeId);
    expect(grandChildCell.genome.parentCellId).toBe(childCell.nodeId);
    expect(grandChildCell.genome.generation).toBe(parentCell.genome.generation + 2);
    expect(grandChildCell.lineage.lineageId).toBe(parentCell.lineage.lineageId);
  });

  it('Governance enforcement: Inactive Cell or unauthorized trigger is rejected', async () => {
    // 1. Rejected if Cell is not active
    await parentCell.stop();
    const event = 'mitosis_stopped_cell';
    const proof = createAuthProof(parentCell.nodeId, event, rootAuthorityKp);
    const { result: resStopped } = await parentCell.reproduce({
      authorizationProof: proof,
      reproductionSeed: event
    });
    expect(resStopped.success).toBe(false);
    expect(resStopped.errors?.[0]).toContain('Parent cell is not ACTIVE');

    // 2. Restart and test unauthorized proof rejection
    await parentCell.start();
    const untrustedKp = identityCrypto.generateKeyPair();
    const fakeProof = createAuthProof(parentCell.nodeId, 'mitosis_fake', untrustedKp);
    const { result: resUntrusted } = await parentCell.reproduce({
      authorizationProof: fakeProof,
      reproductionSeed: 'mitosis_fake'
    });
    expect(resUntrusted.success).toBe(false);
    expect(resUntrusted.errors?.[0]).toContain('Authorization proof issuer is not a trusted authority');
  });
});
