import { describe, it, expect } from 'vitest';
import {
  xorDistanceBuffer,
  compareXorDistanceBuffers,
  compareDistance,
  calculateBucketIndex,
  RoutingTable
} from '../src/redqueen/dht/routing';

describe('Byte-Level XOR Distance & Routing Calculations', () => {
  const zeroId = '00'.repeat(32);
  const maxId = 'ff'.repeat(32);
  const idA = '00'.repeat(31) + '01'; // 1
  const idB = '00'.repeat(31) + '02'; // 2
  const idC = '00'.repeat(31) + '04'; // 4

  it('calculates numerical XOR distance correctly', () => {
    const dist = xorDistanceBuffer(idA, idB);
    expect(dist).toBeInstanceOf(Buffer);
    expect(dist.length).toBe(32);
    // 0x01 ^ 0x02 = 0x03
    expect(dist[31]).toBe(3);
    for (let i = 0; i < 31; i++) {
      expect(dist[i]).toBe(0);
    }
  });

  it('proves identical Node IDs have zero distance', () => {
    const dist = xorDistanceBuffer(idA, idA);
    expect(dist.equals(Buffer.alloc(32, 0))).toBe(true);
    expect(compareDistance(idA, idA, idA)).toBe(0);
  });

  it('proves maximum possible distance (all 0xFF)', () => {
    const dist = xorDistanceBuffer(zeroId, maxId);
    expect(dist.equals(Buffer.alloc(32, 0xff))).toBe(true);
  });

  it('proves minimum non-zero distance (differing only in last bit)', () => {
    const dist = xorDistanceBuffer(zeroId, idA);
    const expected = Buffer.alloc(32, 0);
    expected[31] = 1;
    expect(dist.equals(expected)).toBe(true);
  });

  it('proves relative comparison A < B and B < C from target', () => {
    const target = zeroId;
    // dist(target, idA) = 1
    // dist(target, idB) = 2
    // dist(target, idC) = 4
    expect(compareDistance(target, idA, idB)).toBe(-1); // A closer than B
    expect(compareDistance(target, idB, idA)).toBe(1);  // B farther than A
    expect(compareDistance(target, idB, idC)).toBe(-1); // B closer than C
    expect(compareDistance(target, idC, idB)).toBe(1);  // C farther than B
  });

  it('sorts nodes mathematically by closest distance without localeCompare', () => {
    const target = '80' + '00'.repeat(31);
    const n1 = '80' + '00'.repeat(30) + '01'; // distance 1
    const n2 = '80' + '00'.repeat(30) + '0f'; // distance 15
    const n3 = '7f' + 'ff'.repeat(31);         // distance 0xff... (very far)
    const n4 = '80' + '00'.repeat(30) + '02'; // distance 2

    const unsorted = [n3, n2, n1, n4];
    const sorted = unsorted.sort((a, b) => compareDistance(target, a, b));

    expect(sorted).toEqual([n1, n4, n2, n3]);
  });

  it('rejects malformed Node IDs with invalid length or chars', () => {
    expect(() => xorDistanceBuffer('short', zeroId)).toThrow();
    expect(() => xorDistanceBuffer(zeroId, 'bad_hex_chars_'.repeat(4) + '0000000000000000')).toThrow();
    expect(() => xorDistanceBuffer('FF'.repeat(32), zeroId)).toThrow(); // must be lowercase
  });

  it('calculates bucket index properly across 256 buckets', () => {
    // Differ in MSB bit 7 of byte 0: leading zeros = 0 -> bucket 255
    const distMsb = Buffer.alloc(32, 0);
    distMsb[0] = 0x80;
    expect(calculateBucketIndex(distMsb)).toBe(255);

    // Differ in LSB bit 0 of byte 31: leading zeros = 255 -> bucket 0
    const distLsb = Buffer.alloc(32, 0);
    distLsb[31] = 0x01;
    expect(calculateBucketIndex(distLsb)).toBe(0);

    // Identical (0 distance): returns 0
    const distZero = Buffer.alloc(32, 0);
    expect(calculateBucketIndex(distZero)).toBe(0);
  });
});
