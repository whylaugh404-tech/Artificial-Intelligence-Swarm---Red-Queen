import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Cell } from '../src/redqueen/core/cell';
import { CellState } from '../src/redqueen/core/lifecycle';
import { MemoryCategory } from '../src/redqueen/memory/store';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import { AuthorizationProof, StaticTrustAnchor } from '../src/redqueen/reproduction/types';
import { MembershipAuthority } from '../src/redqueen/swarm/authority';
import { MembershipState } from '../src/redqueen/swarm/types';
import { verifyMembershipCertificate } from '../src/redqueen/swarm/verifier';
import { DistributedPopulationRegistry } from '../src/redqueen/evolution/population';
import { CognitiveRuntime } from '../src/redqueen/cognition/runtime';

const TEST_DIR = path.join(process.cwd(), 'data', 'test_child_population_dht_swarm');

function createAuthProof(
  parentCellId: string,
  eventId: string,
  issuerKp: { privateKey: string; publicKey: string }
): AuthorizationProof {
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

describe('Child Cell → Population / DHT / Swarm Integration (Repair Prompt 10)', () => {
  let rootAuthorityKp: { privateKey: string; publicKey: string };
  let trustAnchor: StaticTrustAnchor;
  let membershipAuthority: MembershipAuthority;
  let parentCell: Cell;
  let childCell: Cell | undefined;
  let populationRegistry: DistributedPopulationRegistry;

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });

    rootAuthorityKp = identityCrypto.generateKeyPair();
    trustAnchor = new StaticTrustAnchor([
      { issuer: 'redqueen-root', publicKey: rootAuthorityKp.publicKey }
    ]);

    // Dedicated Ed25519 membership signing authority for Swarm
    membershipAuthority = new MembershipAuthority();

    // Create distributed population registry (No central singleton)
    populationRegistry = new DistributedPopulationRegistry();

    // Instantiate parent cell configured with Swarm trust anchor and authority
    parentCell = new Cell(
      path.join(TEST_DIR, 'parent_cell.json'),
      'test-api-key',
      undefined,
      undefined,
      {
        swarmId: 'redqueen-swarm-alpha-1',
        trustedIssuerPublicKey: membershipAuthority.publicKey,
        issuerAuthority: membershipAuthority,
        capabilities: ['discovery', 'routing', 'computation', 'memory']
      },
      {
        specialization: 'cyber_intelligence',
        governance: undefined,
        trustAnchor,
        reproductionPolicy: {
          cooldownMs: 0,
          populationCeiling: 10,
          requireAuthorization: true,
          minMemoryPressure: 0.0
        }
      }
    );

    await parentCell.start();

    // Issue and assign parent's own certificate
    const parentCert = membershipAuthority.issueCertificate({
      swarmId: parentCell.swarm.swarmId,
      memberNodeId: parentCell.nodeId,
      memberPublicKey: parentCell.publicKey,
      capabilities: ['discovery', 'routing', 'computation', 'memory']
    });
    await parentCell.swarm.setMyCertificate(parentCert);

    // Register parent into local distributed population registry
    populationRegistry.registerCell(parentCell);
  });

  afterEach(async () => {
    if (childCell) {
      try {
        await childCell.stop();
      } catch {}
      childCell = undefined;
    }
    if (parentCell) {
      try {
        await parentCell.stop();
      } catch {}
    }
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  it('1-4. Mitosis produces a usable child cell with unique identity, lineage, and inherited state', async () => {
    // Populate parent memory
    await parentCell.memory.put({
      id: 'knowledge_cyber_threats',
      cellId: parentCell.nodeId,
      category: MemoryCategory.SEMANTIC,
      content: 'APT29 uses advanced spearfishing and supply-chain vectors [core]',
      source: 'intel_feed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 0.95,
      hash: '',
      provenance: ['osint_source_alpha'],
      version: 1
    });

    const eventId = 'event_mitosis_full_pipeline';
    const authProof = createAuthProof(parentCell.nodeId, eventId, rootAuthorityKp);

    const { result, child } = await parentCell.reproduce({
      authorizationProof: authProof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: populationRegistry.size(),
      memoryPressure: 0.8,
      specializationBias: 'threat_intelligence',
      openRouterApiKey: 'test-key',
      authority: membershipAuthority,
      populationRegistry
    });

    expect(result.success).toBe(true);
    expect(child).toBeDefined();
    childCell = child!;

    // 1. Trace child creation: child object is immediately usable
    expect(childCell).toBeInstanceOf(Cell);
    expect(childCell.nodeId).toBeDefined();
    expect(childCell.nodeId.length).toBe(64);

    // 2. Child identity is distinct and cryptographically valid
    expect(childCell.nodeId).not.toBe(parentCell.nodeId);
    expect(childCell.publicKey).not.toBe(parentCell.publicKey);
    expect(identityCrypto.deriveNodeId(childCell.publicKey)).toBe(childCell.nodeId);

    // 3. Lineage parent-child preservation
    expect(childCell.lineage.parentCellId).toBe(parentCell.nodeId);
    expect(childCell.lineage.ancestorCellIds).toContain(parentCell.nodeId);
    expect(childCell.lineage.generation).toBe(parentCell.genome.generation + 1);
    expect(childCell.genome.parentCellId).toBe(parentCell.nodeId);

    // 4. Inherited state & memory ownership
    const inheritedMem = await childCell.memory.get('knowledge_cyber_threats');
    expect(inheritedMem).toBeDefined();
    expect(inheritedMem?.cellId).toBe(childCell.nodeId); // Ownership transferred
    expect(inheritedMem?.provenance?.some(p => p.includes(`inherited_from_${parentCell.nodeId}`))).toBe(true);
  });

  it('5-8. Integrates child into DHT routing, Swarm membership, and population registry', async () => {
    const eventId = 'event_mitosis_overlay_integration';
    const authProof = createAuthProof(parentCell.nodeId, eventId, rootAuthorityKp);

    const { result, child } = await parentCell.reproduce({
      authorizationProof: authProof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: populationRegistry.size(),
      openRouterApiKey: 'test-key',
      authority: membershipAuthority,
      populationRegistry
    });

    expect(result.success).toBe(true);
    expect(child).toBeDefined();
    childCell = child!;

    // 6. DHT Integration: child and parent routing tables are interconnected
    const parentPeerInChild = childCell.routing.getPeer(parentCell.nodeId);
    expect(parentPeerInChild).toBeDefined();
    expect(parentPeerInChild?.publicKey).toBe(parentCell.publicKey);

    const childPeerInParent = parentCell.routing.getPeer(childCell.nodeId);
    expect(childPeerInParent).toBeDefined();
    expect(childPeerInParent?.publicKey).toBe(childCell.publicKey);

    // 7 & 8. Swarm Membership & Cryptographic Certificate
    const childCert = childCell.swarm.getMyCertificate();
    expect(childCert).toBeDefined();
    expect(childCert?.memberNodeId).toBe(childCell.nodeId);
    expect(childCert?.memberPublicKey).toBe(childCell.publicKey);

    // Verify cryptographic validity of child's certificate locally
    const verification = verifyMembershipCertificate(
      childCert,
      parentCell.swarm.swarmId,
      membershipAuthority.publicKey
    );
    expect(verification.valid).toBe(true);

    // Child is recognized as a full MEMBER in its own swarm
    expect(childCell.swarm.getMembershipState(childCell.nodeId)).toBe(MembershipState.MEMBER);

    // Parent also recognizes child as a valid MEMBER
    expect(parentCell.swarm.getMembershipState(childCell.nodeId)).toBe(MembershipState.MEMBER);

    // 5. Population Registry Integration
    expect(populationRegistry.hasMember(childCell.nodeId)).toBe(true);
    expect(populationRegistry.size()).toBe(2); // Parent + Child
    const childMember = populationRegistry.getMember(childCell.nodeId);
    expect(childMember?.parentCellId).toBe(parentCell.nodeId);
    expect(childMember?.generation).toBe(1);
    expect(childMember?.certificate?.certificateId).toBe(childCert?.certificateId);
  });

  it('9. Avoids duplicate population entries across multiple registration triggers', async () => {
    const eventId = 'event_mitosis_dedup_test';
    const authProof = createAuthProof(parentCell.nodeId, eventId, rootAuthorityKp);

    const { result, child } = await parentCell.reproduce({
      authorizationProof: authProof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: populationRegistry.size(),
      openRouterApiKey: 'test-key',
      authority: membershipAuthority,
      populationRegistry
    });

    expect(result.success).toBe(true);
    childCell = child!;
    expect(populationRegistry.size()).toBe(2);

    // Attempt to register child again explicitly
    const secondReg = populationRegistry.registerCell(childCell);
    expect(secondReg.success).toBe(true);
    expect(secondReg.isDuplicate).toBe(true);
    expect(populationRegistry.size()).toBe(2); // Still exactly 2

    // Attempt third registration
    const thirdReg = populationRegistry.registerCell(childCell);
    expect(thirdReg.isDuplicate).toBe(true);
    expect(populationRegistry.size()).toBe(2);
  });

  it('10. Failed join can recover gracefully via recovery methods', async () => {
    const eventId = 'event_mitosis_recovery_test';
    const authProof = createAuthProof(parentCell.nodeId, eventId, rootAuthorityKp);

    const { result, child } = await parentCell.reproduce({
      authorizationProof: authProof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: populationRegistry.size(),
      openRouterApiKey: 'test-key',
      authority: membershipAuthority,
      populationRegistry
    });

    expect(result.success).toBe(true);
    childCell = child!;

    // Simulate join denial or failure
    childCell.swarm.resetJoinState();
    expect(childCell.swarm.getMembershipState(childCell.nodeId)).toBe(MembershipState.MEMBER);

    // Test registry recovery
    const recoveryResult = await populationRegistry.recoverFailedJoin(childCell, { clearPartialState: true });
    expect(recoveryResult.success).toBe(true);
    expect(populationRegistry.hasMember(childCell.nodeId)).toBe(true);
  });

  it('11. Parent membership, routing, and lifecycle remain 100% unaffected by child creation', async () => {
    expect(parentCell.lifecycle.getState()).toBe(CellState.ACTIVE);
    expect(parentCell.swarm.getMembershipState(parentCell.nodeId)).toBe(MembershipState.MEMBER);
    const initialParentCertId = parentCell.swarm.getMyCertificate()?.certificateId;
    expect(initialParentCertId).toBeDefined();

    const eventId = 'event_mitosis_parent_invariance';
    const authProof = createAuthProof(parentCell.nodeId, eventId, rootAuthorityKp);

    const { result, child } = await parentCell.reproduce({
      authorizationProof: authProof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: populationRegistry.size(),
      openRouterApiKey: 'test-key',
      authority: membershipAuthority,
      populationRegistry
    });

    expect(result.success).toBe(true);
    childCell = child!;

    // Parent guarantees
    expect(parentCell.lifecycle.getState()).toBe(CellState.ACTIVE);
    expect(parentCell.swarm.getMembershipState(parentCell.nodeId)).toBe(MembershipState.MEMBER);
    expect(parentCell.swarm.getMyCertificate()?.certificateId).toBe(initialParentCertId);
    expect(populationRegistry.hasMember(parentCell.nodeId)).toBe(true);
    expect(parentCell.routing.getPeer(childCell.nodeId)).toBeDefined();
  });

  it('12. End-to-end integration: parent → mitosis → child → identity verification → DHT → population → cognitive operation', async () => {
    // 1. Parent seeded with empirical observation
    await parentCell.processObservation({
      observationId: 'parent_obs_01',
      observedSubject: 'critical_subsystem',
      source: 'sensor_grid_alpha',
      timestamp: new Date().toISOString(),
      content: { target: 'critical_subsystem', metric: 'anomalous_latency', value: 420 }
    });

    // 2. Mitosis trigger
    const eventId = 'e2e_full_chain_mitosis';
    const authProof = createAuthProof(parentCell.nodeId, eventId, rootAuthorityKp);

    const { result, child } = await parentCell.reproduce({
      authorizationProof: authProof,
      reproductionSeed: eventId,
      storageBasePath: TEST_DIR,
      currentPopulation: populationRegistry.size(),
      memoryPressure: 0.5,
      specializationBias: 'anomaly_detection',
      openRouterApiKey: 'test-key',
      authority: membershipAuthority,
      populationRegistry
    });

    expect(result.success).toBe(true);
    childCell = child!;

    // 3. Child identity verification
    expect(childCell.nodeId).toBeDefined();
    expect(childCell.nodeId).not.toBe(parentCell.nodeId);
    expect(childCell.lineage.parentCellId).toBe(parentCell.nodeId);

    // 4. Start child cell subsystem
    await childCell.start();
    expect(childCell.lifecycle.getState()).toBe(CellState.ACTIVE);

    // 5. DHT verification
    expect(childCell.routing.getPeer(parentCell.nodeId)?.publicKey).toBe(parentCell.publicKey);
    expect(parentCell.routing.getPeer(childCell.nodeId)?.publicKey).toBe(childCell.publicKey);

    // 6. Population verification
    expect(populationRegistry.size()).toBe(2);
    expect(populationRegistry.getAllCells().length).toBe(2);

    // 7. Cognitive operation on child cell
    const childObservationResult = await childCell.processObservation({
      observationId: 'child_obs_01',
      observedSubject: 'packet_inspector',
      source: 'packet_inspector_omega',
      timestamp: new Date().toISOString(),
      content: { signature: 'trojan_payload_detected', severity: 'HIGH', host: 'node_17' }
    });

    expect(childObservationResult).toBeDefined();
    expect(childObservationResult.experience?.experienceId).toBeDefined();

    // 8. Collective Cognitive Operation across the distributed population
    const runtime = new CognitiveRuntime([parentCell, childCell]);
    expect(runtime.getPopulation().length).toBe(2);

    // Cognitive runtime observation processing
    const runtimeObsResults = await runtime.processObservation(
      {
        observationId: 'runtime_collective_obs',
        observedSubject: 'collective_network',
        source: 'collective_sensor',
        timestamp: new Date().toISOString(),
        content: { event: 'network_wide_alert', level: 'ELEVATED' }
      }
    );

    expect(runtimeObsResults.length).toBe(2);
    expect(runtimeObsResults[0].experience?.experienceId).toBeDefined();
    expect(runtimeObsResults[1].experience?.experienceId).toBeDefined();

    // Deduplication check on CognitiveRuntime
    const addedAgain = runtime.addCell(childCell);
    expect(addedAgain).toBe(false); // Rejected duplicate
    expect(runtime.getPopulation().length).toBe(2);
  });
});
