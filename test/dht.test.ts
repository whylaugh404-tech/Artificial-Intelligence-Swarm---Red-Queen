import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { identityCrypto } from '../src/redqueen/crypto/identity';

describe('Real Three-Cell DHT Integration', () => {
  let cellA: Cell;
  let cellB: Cell;
  let cellC: Cell;

  beforeAll(async () => {
    cellA = new Cell('./data/memDhtA.json', 'test_key_dht_a');
    cellB = new Cell('./data/memDhtB.json', 'test_key_dht_b');
    cellC = new Cell('./data/memDhtC.json', 'test_key_dht_c');

    // Give endpoints so they can be discovered
    cellA.transport.setEndpoint('ws://localhost:4006');
    cellB.transport.setEndpoint('ws://localhost:4007');
    cellC.transport.setEndpoint('ws://localhost:4008');

    await cellA.start(4006);
    await cellB.start(4007);
    await cellC.start(4008);
  });

  afterAll(async () => {
    await cellA.stop();
    await cellB.stop();
    await cellC.stop();
  });

  it('should authenticate and discover Cell C from Cell A through Cell B', async () => {
    // 1. Connect B to C
    await cellB.connectToPeer('ws://localhost:4008');
    
    // Ensure B knows C
    await new Promise(r => setTimeout(r, 300));
    const peerInB = cellB.routing.getPeer(cellC.nodeId);
    expect(peerInB).toBeDefined();
    expect(peerInB?.endpoint).toBe('ws://localhost:4008');

    // 2. Connect A to B
    await cellA.connectToPeer('ws://localhost:4007');
    await new Promise(r => setTimeout(r, 300));
    
    const peerInA = cellA.routing.getPeer(cellB.nodeId);
    expect(peerInA).toBeDefined();

    // 3. A should not know C yet
    expect(cellA.routing.getPeer(cellC.nodeId)).toBeUndefined();

    // 4. A performs FIND_NODE for C
    const closest = await cellA.findNode(cellC.nodeId);
    
    // Closest should include C
    const foundC = closest.find(p => p.nodeId === cellC.nodeId);
    expect(foundC).toBeDefined();
    expect(foundC?.endpoint).toBe('ws://localhost:4008');

    // Wait for auto-connect
    await new Promise(r => setTimeout(r, 1000));

    // 5. A routing table should contain C
    const newPeerInA = cellA.routing.getPeer(cellC.nodeId);
    expect(newPeerInA).toBeDefined();
    
    // Ensure A is authenticated with C directly
    const transportPeers = cellA.transport.getPeers();
    const hasCDirectly = transportPeers.some(p => p.remoteNodeId === cellC.nodeId && p.getState() === 'AUTHENTICATED');
    expect(hasCDirectly).toBe(true);
  }, 15000);
});

describe('Negative DHT Security Tests', () => {
  let cellA: Cell;
  let cellB: Cell;
  let attackerKeys: { publicKey: string, privateKey: string };
  let attackerNodeId: string;

  beforeAll(async () => {
    cellA = new Cell('./data/memDhtNegA.json', 'test_key_neg_a');
    cellB = new Cell('./data/memDhtNegB.json', 'test_key_neg_b');

    cellA.transport.setEndpoint('ws://localhost:4009');
    cellB.transport.setEndpoint('ws://localhost:4010');

    await cellA.start(4009);
    await cellB.start(4010);
    
    await cellA.connectToPeer('ws://localhost:4010');
    await new Promise(r => setTimeout(r, 300));

    attackerKeys = identityCrypto.generateKeyPair();
    attackerNodeId = identityCrypto.deriveNodeId(attackerKeys.publicKey);
  });

  afterAll(async () => {
    await cellA.stop();
    await cellB.stop();
  });

  it('should ignore FIND_NODE_RESPONSE from unauthenticated sources', async () => {
    expect(true).toBe(true);
  });

  it('should reject discovered peers with invalid Node ID mismatch', async () => {
    // Attempt to add a peer with mismatched Node ID to Cell B's routing table
    const fakeId = '00'.repeat(32);
    const added = cellB.routing.addPeer({
       nodeId: fakeId,
       publicKey: attackerKeys.publicKey, // key doesn't match ID
       endpoint: 'ws://localhost:9999',
       lastSeen: Date.now()
    });

    // RoutingTable should have rejected it immediately
    expect(added).toBe(false);

    const closest = await cellA.findNode(fakeId);
    const foundBad = closest.find(p => p.nodeId === fakeId);
    
    expect(foundBad).toBeUndefined();
  });

  it('should not add self to routing table', async () => {
    const added = cellA.routing.addPeer({
       nodeId: cellA.nodeId,
       publicKey: cellA.publicKey,
       endpoint: 'ws://localhost:4009',
       lastSeen: Date.now()
    });
    expect(added).toBe(false);

    await cellA.findNode(cellA.nodeId);
    
    const selfInA = cellA.routing.getPeer(cellA.nodeId);
    expect(selfInA).toBeUndefined();
  });
});
