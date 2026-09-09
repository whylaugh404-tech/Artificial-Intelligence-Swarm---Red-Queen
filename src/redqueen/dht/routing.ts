import { logger } from '../core/logger';

export interface PeerInfo {
  nodeId: string;
  publicKey: string;
  endpoint?: string;
  lastSeen: number;
}

export class RoutingTable {
  private buckets: Map<number, PeerInfo[]> = new Map();
  private readonly k = 20;

  constructor(private readonly localNodeId: string) {}

  addPeer(peer: PeerInfo) {
    if (peer.nodeId === this.localNodeId) return;
    const distance = this.xorDistance(this.localNodeId, peer.nodeId);
    const bucketIndex = this.getBucketIndex(distance);

    if (!this.buckets.has(bucketIndex)) {
      this.buckets.set(bucketIndex, []);
    }

    const bucket = this.buckets.get(bucketIndex)!;
    const existingIndex = bucket.findIndex(p => p.nodeId === peer.nodeId);
    
    if (existingIndex !== -1) {
      // Update existing
      bucket[existingIndex] = { ...bucket[existingIndex], ...peer, lastSeen: Date.now() };
    } else {
      if (bucket.length < this.k) {
        bucket.push({ ...peer, lastSeen: Date.now() });
      } else {
        // Evict oldest if we had a real ping check, for now just drop or replace oldest
        // Simplistic: replace the oldest seen if it's older than 1 hour, else drop new.
        let oldestIndex = 0;
        for (let i = 1; i < bucket.length; i++) {
          if (bucket[i].lastSeen < bucket[oldestIndex].lastSeen) {
            oldestIndex = i;
          }
        }
        if (Date.now() - bucket[oldestIndex].lastSeen > 3600000) {
           bucket[oldestIndex] = { ...peer, lastSeen: Date.now() };
        }
      }
    }
  }

  getPeer(nodeId: string): PeerInfo | undefined {
    for (const bucket of this.buckets.values()) {
      const p = bucket.find(peer => peer.nodeId === nodeId);
      if (p) return p;
    }
    return undefined;
  }

  removePeer(nodeId: string) {
    for (const bucket of this.buckets.values()) {
      const idx = bucket.findIndex(p => p.nodeId === nodeId);
      if (idx !== -1) {
        bucket.splice(idx, 1);
        return;
      }
    }
  }

  getClosestPeers(targetId: string, limit = this.k): PeerInfo[] {
    const allPeers = Array.from(this.buckets.values()).flat();
    return allPeers
      .sort((a, b) => this.xorDistance(a.nodeId, targetId).localeCompare(this.xorDistance(b.nodeId, targetId)))
      .slice(0, limit);
  }

  getActiveBucketCount(): number {
    return this.buckets.size;
  }

  public xorDistance(id1: string, id2: string): string {
    // Hex XOR implementation
    const b1 = Buffer.from(id1, 'hex');
    const b2 = Buffer.from(id2, 'hex');
    const res = Buffer.alloc(Math.max(b1.length, b2.length));
    for (let i = 0; i < res.length; i++) {
      res[i] = (b1[i] || 0) ^ (b2[i] || 0);
    }
    return res.toString('hex');
  }

  private getBucketIndex(distanceHex: string): number {
    const buf = Buffer.from(distanceHex, 'hex');
    for (let i = 0; i < buf.length; i++) {
      for (let bit = 7; bit >= 0; bit--) {
        if ((buf[i] & (1 << bit)) !== 0) {
          return (buf.length - 1 - i) * 8 + bit;
        }
      }
    }
    return 0;
  }
}
