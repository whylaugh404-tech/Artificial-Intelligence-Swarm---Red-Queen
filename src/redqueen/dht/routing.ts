import { logger } from '../core/logger';
import {
  isValidNodeId,
  validateNodeId,
  validatePeerIdentity,
  validateEndpoint
} from '../validation/validators';

export interface PeerInfo {
  nodeId: string;
  publicKey: string;
  endpoint?: string;
  lastSeen: number;
}

/**
 * Computes the 32-byte numerical XOR distance between two canonical Node IDs.
 * Throws an error if either Node ID is invalid.
 */
export function xorDistanceBuffer(id1: string, id2: string): Buffer {
  if (!isValidNodeId(id1)) {
    throw new Error(`Invalid Node ID 1: ${id1}`);
  }
  if (!isValidNodeId(id2)) {
    throw new Error(`Invalid Node ID 2: ${id2}`);
  }

  const b1 = Buffer.from(id1, 'hex');
  const b2 = Buffer.from(id2, 'hex');
  const res = Buffer.alloc(32);

  for (let i = 0; i < 32; i++) {
    res[i] = b1[i] ^ b2[i];
  }
  return res;
}

/**
 * Byte-level numerical comparison of two 32-byte XOR distance Buffers.
 * Compares from MSB (byte 0) to LSB (byte 31).
 * Returns:
 *  -1 if distA < distB (A is closer)
 *   1 if distA > distB (B is closer)
 *   0 if distA === distB
 */
export function compareXorDistanceBuffers(distA: Buffer, distB: Buffer): number {
  if (distA.length !== 32 || distB.length !== 32) {
    throw new Error('Distance buffers must be exactly 32 bytes');
  }

  for (let i = 0; i < 32; i++) {
    if (distA[i] < distB[i]) return -1;
    if (distA[i] > distB[i]) return 1;
  }
  return 0;
}

/**
 * Compares the numerical XOR distance of two candidate Node IDs relative to a target Node ID.
 * Returns:
 *  -1 if aId is closer to targetId than bId
 *   1 if bId is closer to targetId than aId
 *   0 if equidistant
 */
export function compareDistance(targetId: string, aId: string, bId: string): number {
  if (aId === bId) return 0;
  const distA = xorDistanceBuffer(targetId, aId);
  const distB = xorDistanceBuffer(targetId, bId);
  return compareXorDistanceBuffers(distA, distB);
}

/**
 * Calculates the Kademlia bucket index (0..255) based on leading zero bits of the XOR distance.
 */
export function calculateBucketIndex(distanceBuf: Buffer): number {
  for (let i = 0; i < 32; i++) {
    const byte = distanceBuf[i];
    if (byte !== 0) {
      for (let bit = 7; bit >= 0; bit--) {
        if ((byte & (1 << bit)) !== 0) {
          const leadingZeros = i * 8 + (7 - bit);
          return 255 - leadingZeros;
        }
      }
    }
  }
  return 0; // Distance is 0 (identical node)
}

export class RoutingTable {
  private readonly component = 'routing_table';
  public readonly k = 20;
  public readonly staleThresholdMs = 60000; // 60 seconds
  private buckets: Map<number, PeerInfo[]> = new Map();

  constructor(public readonly localNodeId: string) {
    const idCheck = validateNodeId(localNodeId, 'localNodeId');
    if (!idCheck.valid) {
      throw new Error(`Cannot initialize RoutingTable: ${idCheck.reason}`);
    }
  }

  /**
   * Adds or updates a peer in the routing table.
   * Returns true if added or updated, false if rejected.
   */
  addPeer(peer: PeerInfo): boolean {
    // 1. Never store self
    if (peer.nodeId === this.localNodeId) {
      logger.debug(this.component, 'cannot_add_self_to_routing_table');
      return false;
    }

    // 2. Validate Peer Identity (Node ID format, public key, derivation)
    const identityCheck = validatePeerIdentity(peer.nodeId, peer.publicKey);
    if (!identityCheck.valid) {
      logger.warn(this.component, 'invalid_peer_identity_rejected', {
        nodeId: peer.nodeId,
        reason: identityCheck.reason
      });
      return false;
    }

    // 3. Validate Endpoint if present
    let validatedEndpoint: string | undefined = undefined;
    if (peer.endpoint !== undefined && peer.endpoint !== null && peer.endpoint !== '') {
      const epCheck = validateEndpoint(peer.endpoint);
      if (!epCheck.valid) {
        logger.warn(this.component, 'invalid_peer_endpoint_rejected', {
          nodeId: peer.nodeId,
          endpoint: peer.endpoint,
          reason: epCheck.reason
        });
        return false;
      }
      validatedEndpoint = epCheck.normalizedUrl;
    }

    const dist = xorDistanceBuffer(this.localNodeId, peer.nodeId);
    const bucketIndex = calculateBucketIndex(dist);

    if (!this.buckets.has(bucketIndex)) {
      this.buckets.set(bucketIndex, []);
    }

    const bucket = this.buckets.get(bucketIndex)!;
    const existingIndex = bucket.findIndex(p => p.nodeId === peer.nodeId);

    if (existingIndex !== -1) {
      // Peer already exists in bucket:
      // Update fields and move to tail (most recently seen position)
      const existing = bucket[existingIndex];
      const updated: PeerInfo = {
        nodeId: peer.nodeId,
        publicKey: peer.publicKey,
        endpoint: validatedEndpoint ?? existing.endpoint,
        lastSeen: peer.lastSeen > 0 ? peer.lastSeen : Date.now()
      };
      bucket.splice(existingIndex, 1);
      bucket.push(updated);
      return true;
    }

    // New peer for this bucket: Check capacity
    if (bucket.length < this.k) {
      bucket.push({
        nodeId: peer.nodeId,
        publicKey: peer.publicKey,
        endpoint: validatedEndpoint,
        lastSeen: peer.lastSeen > 0 ? peer.lastSeen : Date.now()
      });
      return true;
    }

    // Bucket is full: evaluate least recently seen peer (head of bucket)
    const leastRecent = bucket[0];
    const now = Date.now();
    if (now - leastRecent.lastSeen > this.staleThresholdMs) {
      // Oldest peer is stale: evict it and insert new peer at tail
      logger.info(this.component, 'evicting_stale_peer', {
        evicted: leastRecent.nodeId,
        replacement: peer.nodeId,
        staleForMs: now - leastRecent.lastSeen
      });
      bucket.shift();
      bucket.push({
        nodeId: peer.nodeId,
        publicKey: peer.publicKey,
        endpoint: validatedEndpoint,
        lastSeen: now
      });
      return true;
    }

    // Oldest peer is still active: drop the new candidate to protect routing table stability
    logger.debug(this.component, 'bucket_full_peer_dropped', {
      bucketIndex,
      candidate: peer.nodeId
    });
    return false;
  }

  getPeer(nodeId: string): PeerInfo | undefined {
    if (!isValidNodeId(nodeId)) return undefined;
    const dist = xorDistanceBuffer(this.localNodeId, nodeId);
    const bucketIndex = calculateBucketIndex(dist);
    const bucket = this.buckets.get(bucketIndex);
    return bucket?.find(p => p.nodeId === nodeId);
  }

  removePeer(nodeId: string): boolean {
    if (!isValidNodeId(nodeId)) return false;
    const dist = xorDistanceBuffer(this.localNodeId, nodeId);
    const bucketIndex = calculateBucketIndex(dist);
    const bucket = this.buckets.get(bucketIndex);
    if (!bucket) return false;

    const idx = bucket.findIndex(p => p.nodeId === nodeId);
    if (idx !== -1) {
      bucket.splice(idx, 1);
      if (bucket.length === 0) {
        this.buckets.delete(bucketIndex);
      }
      return true;
    }
    return false;
  }

  /**
   * Returns up to `limit` closest peers to `targetId`, sorted by numerical byte-level XOR distance.
   */
  getClosestPeers(targetId: string, limit = this.k): PeerInfo[] {
    if (!isValidNodeId(targetId)) {
      throw new Error(`Cannot get closest peers: targetId is not a valid canonical Node ID (${targetId})`);
    }

    const allPeers: PeerInfo[] = [];
    for (const bucket of this.buckets.values()) {
      for (const peer of bucket) {
        allPeers.push(peer);
      }
    }

    const boundedLimit = Math.max(1, Math.min(Number.isFinite(limit) && limit > 0 ? limit : this.k, 100));

    return allPeers
      .sort((a, b) => compareDistance(targetId, a.nodeId, b.nodeId))
      .slice(0, boundedLimit);
  }

  getAllPeers(): PeerInfo[] {
    const peers: PeerInfo[] = [];
    for (const bucket of this.buckets.values()) {
      peers.push(...bucket);
    }
    return peers;
  }

  getActiveBucketCount(): number {
    return this.buckets.size;
  }

  getTotalPeerCount(): number {
    let count = 0;
    for (const bucket of this.buckets.values()) {
      count += bucket.length;
    }
    return count;
  }

  /**
   * Returns hex string of XOR distance for diagnostics or compatibility.
   */
  xorDistance(id1: string, id2: string): string {
    return xorDistanceBuffer(id1, id2).toString('hex');
  }
}
