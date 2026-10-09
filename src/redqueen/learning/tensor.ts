import { computeDeterministicHash } from '../cognition/computation/canonical';

export type Vector = number[];

export function zeros(size: number): Vector {
  if (!Number.isInteger(size) || size <= 0) throw new Error('Tensor size must be a positive integer');
  return Array.from({ length: size }, () => 0);
}

export function dot(a: Vector, b: Vector): number {
  if (a.length !== b.length) throw new Error(`Tensor shape mismatch: ${a.length} != ${b.length}`);
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

/** Deterministic hashed text embedding. This is an embedding model, not a claim of semantic pretraining. */
export class HashEmbeddingModel {
  constructor(public readonly dimensions = 32) {
    if (!Number.isInteger(dimensions) || dimensions < 4) throw new Error('Embedding dimensions must be >= 4');
  }

  embed(text: string): Vector {
    const vector = zeros(this.dimensions);
    const tokens = text.toLowerCase().match(/[a-z0-9_]+/g) || [];
    for (const token of tokens) {
      const hash = computeDeterministicHash(token);
      for (let i = 0; i < 4; i++) {
        const offset = i * 8;
        const bucket = parseInt(hash.slice(offset, offset + 8), 16) % this.dimensions;
        vector[bucket] += i % 2 === 0 ? 1 : -1;
      }
    }
    const norm = Math.sqrt(dot(vector, vector)) || 1;
    return vector.map(value => value / norm);
  }
}

