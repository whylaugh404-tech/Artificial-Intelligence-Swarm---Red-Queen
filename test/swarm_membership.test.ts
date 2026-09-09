import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { MembershipAuthority } from '../src/redqueen/swarm/authority';
import { AllowlistAuthorizationPolicy } from '../src/redqueen/swarm/policy';
import { MembershipState } from '../src/redqueen/swarm/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('P2 Authorized Swarm Membership: Multi-Cell Integration & Lifecycle', () => {
  const SWARM_ID = 'redqueen-swarm-e2e';
  const tmpDir = path.join(process.cwd(), 'tmp_swarm_test');
  let authority: MembershipAuthority;

  let cellA: Cell;
  let cellB: Cell; // Authority Cell
  let cellC: Cell;
  let cellD: Cell; // Independent Verifier Cell

  const portA = 39101;
  const portB = 39102;
  const portC = 39103;
  const portD = 39104;

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    authority = new MembershipAuthority();
  });

  afterEach(async () => {
    if (cellA) await cellA.stop();
    if (cellB) await cellB.stop();
    if (cellC) await cellC.stop();
    if (cellD) await cellD.stop();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('End-to-End: Discovery -> Authenticated -> Authorized -> Member -> Propagation to Cell D', async () => {
    // 1. Initialize Cell B as the Swarm Membership Authority node
    const policyB = new AllowlistAuthorizationPolicy({
      expectedSwarmId: SWARM_ID,
      allowAllForTesting: true // Allows all well-formed requests in this integration test
    });

    cellB = new Cell(
      path.join(tmpDir, 'store_b.json'),
      'dummy-key',
      undefined,
      undefined,
      {
        swarmId: SWARM_ID,
        issuerAuthority: authority,
        authorizationPolicy: policyB
      }
    );
    cellB.transport.setEndpoint(`ws://127.0.0.1:${portB}`);
    await cellB.start(portB);

    // Give Cell B its own member certificate since it is the authority
    const certB = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellB.nodeId,
      memberPublicKey: cellB.publicKey,
      capabilities: ['discovery', 'routing', 'computation', 'memory']
    });
    await cellB.swarm.setMyCertificate(certB);

    // 2. Initialize Cell A and Cell C knowing only the authority's public key
    cellA = new Cell(
      path.join(tmpDir, 'store_a.json'),
      'dummy-key',
      undefined,
      undefined,
      {
        swarmId: SWARM_ID,
        issuerPublicKey: authority.publicKey
      }
    );
    cellA.transport.setEndpoint(`ws://127.0.0.1:${portA}`);
    await cellA.start(portA);

    cellC = new Cell(
      path.join(tmpDir, 'store_c.json'),
      'dummy-key',
      undefined,
      undefined,
      {
        swarmId: SWARM_ID,
        issuerPublicKey: authority.publicKey
      }
    );
    cellC.transport.setEndpoint(`ws://127.0.0.1:${portC}`);
    await cellC.start(portC);

    // Cell B connects to Cell C (B knows C)
    await cellB.connectToPeer(`ws://127.0.0.1:${portC}`);

    // Cell A connects to Cell B (A knows B, but A does NOT know C yet)
    await cellA.connectToPeer(`ws://127.0.0.1:${portB}`);

    // Ensure initial state: A does not have C in routing table or transport
    expect(cellA.routing.getPeer(cellC.nodeId)).toBeUndefined();
    expect(cellA.transport.getPeer(cellC.nodeId)).toBeUndefined();
    expect(cellA.swarm.getMembershipState(cellC.nodeId)).toBe(MembershipState.DISCOVERED);

    // 3. A joins the swarm via B
    const certA = await cellA.swarm.requestJoin(cellB.nodeId);
    expect(certA.memberNodeId).toBe(cellA.nodeId);
    expect(cellA.swarm.getMembershipState(cellA.nodeId)).toBe(MembershipState.MEMBER);
    expect(cellB.swarm.getMembershipState(cellA.nodeId)).toBe(MembershipState.MEMBER);

    // 4. C joins the swarm via B
    const certC = await cellC.swarm.requestJoin(cellB.nodeId);
    expect(certC.memberNodeId).toBe(cellC.nodeId);
    expect(cellC.swarm.getMembershipState(cellC.nodeId)).toBe(MembershipState.MEMBER);

    // 5. A performs FIND_NODE looking for C's nodeId through B
    const discovered = await cellA.findNode(cellC.nodeId);
    expect(discovered.some(p => p.nodeId === cellC.nodeId)).toBe(true);

    // Cell A has discovered and connected to C!
    // A and C are AUTHENTICATED in transport layer
    const peerC = cellA.transport.getPeer(cellC.nodeId);
    expect(peerC).toBeDefined();

    // Prior to certificate announcement/exchange, A sees C as AUTHENTICATED (NOT MEMBER yet!)
    expect(cellA.swarm.getMembershipState(cellC.nodeId)).toBe(MembershipState.AUTHENTICATED);

    // 6. C announces its signed certificate to A
    cellC.swarm.announceMembership(cellA.nodeId);

    // Wait briefly for P2P message delivery and independent cryptographic verification
    await new Promise(r => setTimeout(r, 200));

    // A has independently verified C's certificate! C is now MEMBER in A's registry!
    expect(cellA.swarm.getMembershipState(cellC.nodeId)).toBe(MembershipState.MEMBER);
    const verifiedCertInA = cellA.swarm.getCertificate(cellC.nodeId);
    expect(verifiedCertInA?.signature).toBe(certC.signature);

    // 7. Cell D connects to C
    cellD = new Cell(
      path.join(tmpDir, 'store_d.json'),
      'dummy-key',
      undefined,
      undefined,
      {
        swarmId: SWARM_ID,
        issuerPublicKey: authority.publicKey
      }
    );
    cellD.transport.setEndpoint(`ws://127.0.0.1:${portD}`);
    await cellD.start(portD);

    await cellD.connectToPeer(`ws://127.0.0.1:${portC}`);
    expect(cellD.swarm.getMembershipState(cellC.nodeId)).toBe(MembershipState.AUTHENTICATED);

    // C announces its certificate to D
    cellC.swarm.announceMembership(cellD.nodeId);
    await new Promise(r => setTimeout(r, 200));

    // Cell D independently validates C's certificate without trusting any boolean claims!
    expect(cellD.swarm.getMembershipState(cellC.nodeId)).toBe(MembershipState.MEMBER);
  });

  it('Negative Multi-Cell Test: Unauthorized peer is denied membership certificate', async () => {
    // Policy on B only allows Cell A, NOT Cell C
    const strictPolicy = new AllowlistAuthorizationPolicy({
      allowedNodeIds: [], // Empty allowlist
      expectedSwarmId: SWARM_ID
    });

    cellB = new Cell(
      path.join(tmpDir, 'store_strict_b.json'),
      'dummy-key',
      undefined,
      undefined,
      {
        swarmId: SWARM_ID,
        issuerAuthority: authority,
        authorizationPolicy: strictPolicy
      }
    );
    cellB.transport.setEndpoint(`ws://127.0.0.1:${portB}`);
    await cellB.start(portB);

    cellC = new Cell(
      path.join(tmpDir, 'store_unauth_c.json'),
      'dummy-key',
      undefined,
      undefined,
      {
        swarmId: SWARM_ID,
        issuerPublicKey: authority.publicKey
      }
    );
    cellC.transport.setEndpoint(`ws://127.0.0.1:${portC}`);
    await cellC.start(portC);

    // C authenticates with B at transport level
    await cellC.connectToPeer(`ws://127.0.0.1:${portB}`);
    expect(cellC.transport.getPeer(cellB.nodeId)).toBeDefined();

    // C attempts to request join from B, should be DENIED
    await expect(cellC.swarm.requestJoin(cellB.nodeId)).rejects.toThrow('denied');

    // C is still AUTHENTICATED in transport, but membership state is DENIED
    expect(cellB.swarm.getMembershipState(cellC.nodeId)).toBe(MembershipState.DENIED);
    expect(cellC.swarm.getMembershipState(cellC.nodeId)).toBe(MembershipState.DENIED);
  });

  it('Persistence & Idempotency: Restores certificate from storage and reuses active certificate', async () => {
    const storePath = path.join(tmpDir, 'store_persist.json');

    // Create a cell, manually set certificate, and check persistence
    cellA = new Cell(
      storePath,
      'dummy-key',
      undefined,
      undefined,
      {
        swarmId: SWARM_ID,
        issuerPublicKey: authority.publicKey
      }
    );
    await cellA.start(0);

    const validCert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellA.nodeId,
      memberPublicKey: cellA.publicKey,
      capabilities: ['discovery', 'routing']
    });

    await cellA.swarm.setMyCertificate(validCert);
    expect(cellA.swarm.getMembershipState(cellA.nodeId)).toBe(MembershipState.MEMBER);

    // Stop cellA
    await cellA.stop();

    // Reopen Cell with identical key and storagePath
    const restartedCellA = new Cell(
      storePath,
      'dummy-key',
      cellA.privateKey,
      cellA.publicKey,
      {
        swarmId: SWARM_ID,
        issuerPublicKey: authority.publicKey
      }
    );
    await restartedCellA.start(0);

    // Certificate restored from storage!
    expect(restartedCellA.swarm.getMyCertificate()?.certificateId).toBe(validCert.certificateId);
    expect(restartedCellA.swarm.getMembershipState(restartedCellA.nodeId)).toBe(MembershipState.MEMBER);

    await restartedCellA.stop();
  });
});
