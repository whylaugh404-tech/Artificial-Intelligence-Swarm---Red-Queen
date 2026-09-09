import { logger } from '../core/logger';

export class RoutingTable {
  // A simplistic K-bucket implementation placeholder. 
  // For a real implementation, we would maintain 256 buckets (for SHA-256) 
  // based on XOR distance.
  private buckets: Map<number, string[]> = new Map();
  private readonly k = 20;

  constructor(private readonly localNodeId: string) {}

  addPeer(nodeId: string) {
    if (nodeId === this.localNodeId) return;
    const distance = this.xorDistance(this.localNodeId, nodeId);
    const bucketIndex = this.getBucketIndex(distance);

    if (!this.buckets.has(bucketIndex)) {
      this.buckets.set(bucketIndex, []);
    }

    const bucket = this.buckets.get(bucketIndex)!;
    if (!bucket.includes(nodeId)) {
      if (bucket.length < this.k) {
        bucket.push(nodeId);
      } else {
        // Ping oldest, if alive drop new, else replace.
        // For now, just simplistic drop.
      }
    }
  }

  getClosestPeers(targetId: string, limit = this.k): string[] {
    const allPeers = Array.from(this.buckets.values()).flat();
    return allPeers
      .sort((a, b) => this.xorDistance(a, targetId).localeCompare(this.xorDistance(b, targetId)))
      .slice(0, limit);
  }

  private xorDistance(id1: string, id2: string): string {
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
