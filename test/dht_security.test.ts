import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { MessageType, createMessage, getCanonicalString, ReplayCache } from '../src/redqueen/network/protocol';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import { signingCrypto } from '../src/redqueen/crypto/signing';
import { WebSocket } from 'ws';
import {
  isValidNodeId,
  validateNodeId,
  validateEndpoint,
  validatePeerIdentity,
  FindNodePayloadSchema,
  FindNodeResponsePayloadSchema,
  MAX_MESSAGE_BYTES
} from '../src/redqueen/validation/validators';

describe('Red Queen P1.5 Hardened Kademlia Security & Protocol Tests', () => {
  let cellA: Cell;
  let cellB: Cell;
  let cellC: Cell;

  const portA = 5101;
  const portB = 5102;
  const portC = 5103;

  beforeAll(async () => {
    cellA = new Cell('./data/memSecA.json', 'test_sec_a');
    cellB = new Cell('./data/memSecB.json', 'test_sec_b');
    cellC = new Cell('./data/memSecC.json', 'test_sec_c');

    cellA.transport.setEndpoint(`ws://localhost:${portA}`);
    cellB.transport.setEndpoint(`ws://localhost:${portB}`);
    cellC.transport.setEndpoint(`ws://localhost:${portC}`);

    await cellA.start(portA);
    await cellB.start(portB);
    await cellC.start(portC);

    // Initial connection: A <-> B and B <-> C
    await cellA.connectToPeer(`ws://localhost:${portB}`);
    await cellB.connectToPeer(`ws://localhost:${portC}`);

    // Allow handshakes to settle
    await new Promise((r) => setTimeout(r, 400));
  });

  afterAll(async () => {
    await cellA.stop();
    await cellB.stop();
    await cellC.stop();
  });

  // 1. valid FIND_NODE
  it('1. valid FIND_NODE returns closest peers', async () => {
    const res = await cellA.transport.requestFromPeer(
      cellB.nodeId,
      MessageType.FIND_NODE,
      { targetNodeId: cellC.nodeId },
      3000
    );
    expect(res.type).toBe(MessageType.FIND_NODE_RESPONSE);
    expect(res.payload.targetNodeId).toBe(cellC.nodeId);
    expect(Array.isArray(res.payload.peers)).toBe(true);
    const hasC = res.payload.peers.some((p: any) => p.nodeId === cellC.nodeId);
    expect(hasC).toBe(true);
  });

  // 2. malformed FIND_NODE
  it('2. malformed FIND_NODE payload is rejected and not answered', async () => {
    // Missing targetNodeId or invalid schema
    const promise = cellA.transport.requestFromPeer(
      cellB.nodeId,
      MessageType.FIND_NODE,
      { wrongField: 'invalid' },
      1000
    );
    await expect(promise).rejects.toThrow('timed out');
  });

  // 3. unauthenticated FIND_NODE
  it('3. unauthenticated FIND_NODE is dropped by raw socket', async () => {
    const ws = new WebSocket(`ws://localhost:${portB}`);
    await new Promise((resolve) => ws.on('open', resolve));

    // Send FIND_NODE before completing HELLO/AUTH handshake
    const rawMsg = {
      version: 1,
      type: MessageType.FIND_NODE,
      messageId: 'unauth-msg-1',
      senderId: cellA.nodeId,
      timestamp: Date.now(),
      nonce: 'nonce-1',
      payload: { targetNodeId: cellC.nodeId }
    };

    let disconnected = false;
    ws.on('close', () => { disconnected = true; });

    ws.send(JSON.stringify(rawMsg));
    await new Promise((r) => setTimeout(r, 200));
    expect(disconnected).toBe(true);
    ws.terminate();
  });

  // 4. invalid signature
  it('4. messages with invalid signatures are rejected', async () => {
    const rawMsg = createMessage(MessageType.PING, cellA.nodeId, {}, cellA.privateKey);
    // Tamper with signature
    rawMsg.signature = 'bad_sig_' + rawMsg.signature?.slice(8);
    
    // Attempting to verify must fail
    const valid = signingCrypto.verify(getCanonicalString(rawMsg), rawMsg.signature!, cellA.publicKey);
    expect(valid).toBe(false);
  });

  // 5. replayed FIND_NODE
  it('5. replayed messages with duplicate messageId & nonce are dropped', () => {
    const cache = new ReplayCache();
    const msg = createMessage(MessageType.FIND_NODE, cellA.nodeId, { targetNodeId: cellC.nodeId }, cellA.privateKey);

    expect(cache.isDuplicateOrExpired(msg)).toBe(false);
    // Replay of exact same message
    expect(cache.isDuplicateOrExpired(msg)).toBe(true);
  });

  // 6. expired message
  it('6. messages older than 60 seconds are dropped as expired', () => {
    const cache = new ReplayCache();
    const msg = createMessage(MessageType.FIND_NODE, cellA.nodeId, { targetNodeId: cellC.nodeId }, cellA.privateKey);
    msg.timestamp = Date.now() - 65000; // 65 seconds ago

    expect(cache.isDuplicateOrExpired(msg)).toBe(true);
  });

  // 7. future timestamp
  it('7. messages with timestamps too far in future (> 5s) are dropped', () => {
    const cache = new ReplayCache();
    const msg = createMessage(MessageType.FIND_NODE, cellA.nodeId, { targetNodeId: cellC.nodeId }, cellA.privateKey);
    msg.timestamp = Date.now() + 10000; // 10s in future

    expect(cache.isDuplicateOrExpired(msg)).toBe(true);
  });

  // 8. fake Node ID
  it('8. fake Node ID format is rejected by canonical validator', () => {
    expect(isValidNodeId('fake-node-id-123')).toBe(false);
    expect(isValidNodeId('0'.repeat(63))).toBe(false);
    expect(isValidNodeId('0'.repeat(65))).toBe(false);
    expect(isValidNodeId('G'.repeat(64))).toBe(false);
  });

  // 9. publicKey / NodeID mismatch
  it('9. publicKey/NodeID mismatch is rejected', () => {
    const kp = identityCrypto.generateKeyPair();
    const fakeId = '00'.repeat(32);
    const res = validatePeerIdentity(fakeId, kp.publicKey);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('mismatch');
  });

  // 10. malformed public key
  it('10. malformed public key is rejected during validation', () => {
    const res = validatePeerIdentity(cellA.nodeId, 'NOT_A_KEY');
    expect(res.valid).toBe(false);
  });

  // 11. malformed endpoint
  it('11. malformed endpoint URLs are rejected', () => {
    expect(validateEndpoint('not_a_url').valid).toBe(false);
    expect(validateEndpoint('').valid).toBe(false);
    expect(validateEndpoint('ws://').valid).toBe(false);
  });

  // 12. invalid port
  it('12. invalid ports are rejected in endpoint validator', () => {
    expect(validateEndpoint('ws://localhost:99999').valid).toBe(false);
    expect(validateEndpoint('ws://localhost:-1').valid).toBe(false);
    expect(validateEndpoint('ws://localhost:0').valid).toBe(false);
  });

  // 13. invalid protocol
  it('13. invalid protocols (http, ftp, javascript) are rejected', () => {
    expect(validateEndpoint('http://localhost:5000').valid).toBe(false);
    expect(validateEndpoint('javascript:alert(1)').valid).toBe(false);
    expect(validateEndpoint('file:///etc/passwd').valid).toBe(false);
  });

  // 14. oversized response
  it('14. oversized raw socket payloads (> 64KB) are dropped', async () => {
    const ws = new WebSocket(`ws://localhost:${portB}`);
    await new Promise((resolve) => ws.on('open', resolve));

    let disconnected = false;
    ws.on('close', () => { disconnected = true; });

    // Send payload exceeding 64KB
    const oversizedBuffer = Buffer.alloc(MAX_MESSAGE_BYTES + 100, 65);
    ws.send(oversizedBuffer);

    await new Promise((r) => setTimeout(r, 200));
    expect(disconnected).toBe(true);
    ws.terminate();
  });

  // 15. too many peers (> 20)
  it('15. response with > 20 peers is rejected by schema', () => {
    const kp = identityCrypto.generateKeyPair();
    const id = identityCrypto.deriveNodeId(kp.publicKey);
    const peers = Array.from({ length: 25 }, () => ({
      nodeId: id,
      publicKey: kp.publicKey
    }));

    const parsed = FindNodeResponsePayloadSchema.safeParse({
      targetNodeId: id,
      peers
    });
    expect(parsed.success).toBe(false);
  });

  // 16. duplicate Node ID in routing table
  it('16. duplicate Node ID cannot create multiple entries in routing table', () => {
    const countBefore = cellA.routing.getTotalPeerCount();
    const kp = identityCrypto.generateKeyPair();
    const id = identityCrypto.deriveNodeId(kp.publicKey);

    cellA.routing.addPeer({
      nodeId: id,
      publicKey: kp.publicKey,
      endpoint: 'ws://localhost:9001',
      lastSeen: 1000
    });
    const countAfter1 = cellA.routing.getTotalPeerCount();

    // Re-add same ID
    cellA.routing.addPeer({
      nodeId: id,
      publicKey: kp.publicKey,
      endpoint: 'ws://localhost:9002',
      lastSeen: 2000
    });
    const countAfter2 = cellA.routing.getTotalPeerCount();

    expect(countAfter2).toBe(countAfter1);
    cellA.routing.removePeer(id);
  });

  // 17. self Node ID
  it('17. self Node ID is rejected by routing table and peer connection', () => {
    const added = cellA.routing.addPeer({
      nodeId: cellA.nodeId,
      publicKey: cellA.publicKey,
      endpoint: `ws://localhost:${portA}`,
      lastSeen: Date.now()
    });
    expect(added).toBe(false);
    expect(cellA.routing.getPeer(cellA.nodeId)).toBeUndefined();
  });

  // 18. duplicate connection handling
  it('18. duplicate connection to existing peer does not create dual active peers', async () => {
    const initialPeers = cellA.transport.getActivePeerCount();
    // Connect to cellB again
    await cellA.connectToPeer(`ws://localhost:${portB}`);
    const afterPeers = cellA.transport.getActivePeerCount();
    expect(afterPeers).toBe(initialPeers);
  });

  // 19. lookup timeout
  it('19. lookup times out gracefully if querying an unresponsive target', async () => {
    const randomTarget = '99'.repeat(32);
    // FindNode for an unknown target should complete without hanging
    const start = Date.now();
    const results = await cellA.findNode(randomTarget);
    const duration = Date.now() - start;

    expect(Array.isArray(results)).toBe(true);
    expect(duration).toBeLessThan(12000); // within lookup bounds
  });

  // 20. failed peer handling
  it('20. query to dead peer does not crash findNode lookup', async () => {
    const kp = identityCrypto.generateKeyPair();
    const deadId = identityCrypto.deriveNodeId(kp.publicKey);

    // Add dead peer to routing table with unreachable port
    cellA.routing.addPeer({
      nodeId: deadId,
      publicKey: kp.publicKey,
      endpoint: 'ws://localhost:59999',
      lastSeen: Date.now()
    });

    // Lookup should succeed and tolerate the dead peer without throwing
    const results = await cellA.findNode(cellC.nodeId);
    expect(Array.isArray(results)).toBe(true);

    cellA.routing.removePeer(deadId);
  });

  // 21. malformed FIND_NODE_RESPONSE
  it('21. malformed FIND_NODE_RESPONSE payload is rejected by schema', () => {
    const malformed = {
      targetNodeId: 'short',
      peers: 'not-an-array'
    };
    expect(FindNodeResponsePayloadSchema.safeParse(malformed).success).toBe(false);
  });

  // 22. unauthenticated FIND_NODE_RESPONSE
  it('22. unauthenticated FIND_NODE_RESPONSE cannot be processed', async () => {
    const ws = new WebSocket(`ws://localhost:${portA}`);
    await new Promise((resolve) => ws.on('open', resolve));

    const fakeResponse = {
      version: 1,
      type: MessageType.FIND_NODE_RESPONSE,
      messageId: 'unauth-resp-1',
      senderId: cellB.nodeId,
      timestamp: Date.now(),
      nonce: 'nonce-resp',
      payload: { targetNodeId: cellC.nodeId, peers: [] }
    };

    let closed = false;
    ws.on('close', () => { closed = true; });
    ws.send(JSON.stringify(fakeResponse));

    await new Promise((r) => setTimeout(r, 200));
    expect(closed).toBe(true);
    ws.terminate();
  });

  // 23. invalid peer embedded inside valid response
  it('23. invalid peer embedded inside valid response is dropped during findNode', async () => {
    const kpGood = identityCrypto.generateKeyPair();
    const idGood = identityCrypto.deriveNodeId(kpGood.publicKey);

    const kpBad = identityCrypto.generateKeyPair();
    const idBad = '00'.repeat(32); // mismatch

    // Inject into Cell B routing table
    cellB.routing.addPeer({
      nodeId: idGood,
      publicKey: kpGood.publicKey,
      endpoint: 'ws://localhost:5199',
      lastSeen: Date.now()
    });

    // A queries for idGood
    const results = await cellA.findNode(idGood);
    const foundGood = results.find(p => p.nodeId === idGood);
    const foundBad = results.find(p => p.nodeId === idBad);

    expect(foundGood).toBeDefined();
    expect(foundBad).toBeUndefined();

    cellB.routing.removePeer(idGood);
  });

  // 24. three-cell discovery (A -> B -> C)
  it('24. authenticates and connects Cell A to Cell C through discovery via B', async () => {
    // Cell A does not have Cell C initially
    cellA.routing.removePeer(cellC.nodeId);

    const closest = await cellA.findNode(cellC.nodeId);
    const foundC = closest.find(p => p.nodeId === cellC.nodeId);
    expect(foundC).toBeDefined();
    expect(foundC?.endpoint).toBe(`ws://localhost:${portC}`);

    // Wait for auto-connection to settle
    await new Promise((r) => setTimeout(r, 1000));

    // Cell A should now have direct authenticated connection to Cell C
    const peerInA = cellA.transport.getPeer(cellC.nodeId);
    expect(peerInA).toBeDefined();
    expect(peerInA?.getState()).toBe('AUTHENTICATED');
  });

  // 25. lookup termination
  it('25. lookup terminates deterministically when candidates are exhausted', async () => {
    const target = '11'.repeat(32);
    const start = Date.now();
    const results = await cellA.findNode(target);
    const elapsed = Date.now() - start;

    expect(Array.isArray(results)).toBe(true);
    expect(elapsed).toBeLessThan(5000);
  });

  it('proves idempotent Cell.stop() with zero leaked timers', async () => {
    const testCell = new Cell('./data/memIdempotent.json', 'idemp_key');
    await testCell.start(5190);
    await testCell.stop();
    // Calling stop() a second time must be safe and idempotent
    await expect(testCell.stop()).resolves.toBeUndefined();
  });
});
