/**
 * Red Queen Hyperdimensional Computing (HDC) / Vector Symbolic Architecture (VSA)
 * 
 * Ultra-lightweight brain-inspired computing using high-dimensional binary vectors.
 * Provides instant one-shot associative learning, zero catastrophic forgetting,
 * and microsecond-level bitwise operations that execute natively on ARM/mobile CPUs.
 */

export interface HDCConfig {
  dimension: number; // Must be multiple of 32 (e.g. 2048, 4096)
  seed?: number;
}

export class Hypervector {
  readonly words: Uint32Array;
  readonly dimension: number;

  constructor(dimension: number = 4096, words?: Uint32Array) {
    if (dimension % 32 !== 0) {
      throw new Error(`HDC dimension must be a multiple of 32, got ${dimension}`);
    }
    this.dimension = dimension;
    const numWords = dimension / 32;
    if (words) {
      if (words.length !== numWords) {
        throw new Error(`Invalid words length ${words.length}, expected ${numWords}`);
      }
      this.words = words;
    } else {
      this.words = new Uint32Array(numWords);
    }
  }

  /**
   * Clone this hypervector
   */
  clone(): Hypervector {
    const copy = new Uint32Array(this.words.length);
    copy.set(this.words);
    return new Hypervector(this.dimension, copy);
  }

  /**
   * Deterministic random hypervector from string label or seed
   */
  static fromLabel(label: string, dimension: number = 4096): Hypervector {
    const numWords = dimension / 32;
    const words = new Uint32Array(numWords);

    // Murmur/FNV-style hash mixing to generate deterministic pseudo-random bits
    let hash = 2166136261;
    for (let i = 0; i < label.length; i++) {
      hash ^= label.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    // Xorshift32 PRNG seeded with string hash
    let state = (hash >>> 0) || 123456789;
    for (let i = 0; i < numWords; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      words[i] = state >>> 0;
    }

    return new Hypervector(dimension, words);
  }

  /**
   * Deterministic random hypervector from string or number seed (alias for fromLabel)
   */
  static fromSeed(seed: string | number, dimension: number = 4096): Hypervector {
    return Hypervector.fromLabel(String(seed), dimension);
  }

  /**
   * Generates a random binary hypervector
   */
  static random(dimension: number = 4096): Hypervector {
    const numWords = dimension / 32;
    const words = new Uint32Array(numWords);
    for (let i = 0; i < numWords; i++) {
      words[i] = (Math.random() * 0xFFFFFFFF) >>> 0;
    }
    return new Hypervector(dimension, words);
  }

  /**
   * BINDING operation (XOR)
   * A * B: Associates two concepts (e.g. Role * Filler).
   * Property: Invertible (A * B * B = A), orthogonal to inputs.
   */
  bind(other: Hypervector): Hypervector {
    if (this.dimension !== other.dimension) {
      throw new Error(`Dimension mismatch: ${this.dimension} vs ${other.dimension}`);
    }
    const result = new Uint32Array(this.words.length);
    for (let i = 0; i < this.words.length; i++) {
      result[i] = (this.words[i] ^ other.words[i]) >>> 0;
    }
    return new Hypervector(this.dimension, result);
  }

  /**
   * PERMUTATION operation (Cyclic bit-shift)
   * Encodes sequence order, structural syntax, or grammatical roles.
   * shift > 0 rotates right, shift < 0 rotates left.
   */
  permute(shift: number = 1): Hypervector {
    const totalBits = this.dimension;
    const effShift = ((shift % totalBits) + totalBits) % totalBits;
    if (effShift === 0) return this.clone();

    const result = new Uint32Array(this.words.length);

    for (let i = 0; i < totalBits; i++) {
      const srcWord = (i >>> 5);
      const srcBit = i & 31;
      const bitVal = (this.words[srcWord] >>> srcBit) & 1;

      if (bitVal === 1) {
        const dest = (i + effShift) % totalBits;
        const destWord = (dest >>> 5);
        const destBit = dest & 31;
        result[destWord] = (result[destWord] | (1 << destBit)) >>> 0;
      }
    }

    return new Hypervector(this.dimension, result);
  }

  /**
   * SIMILARITY measurement (Normalized Hamming distance)
   * Returns a value between 0.0 (completely dissimilar / orthogonal) and 1.0 (identical).
   * Expected similarity between random vectors is ~0.5.
   */
  similarity(other: Hypervector): number {
    if (this.dimension !== other.dimension) {
      throw new Error(`Dimension mismatch: ${this.dimension} vs ${other.dimension}`);
    }
    let diffBits = 0;
    for (let i = 0; i < this.words.length; i++) {
      const xor = (this.words[i] ^ other.words[i]) >>> 0;
      diffBits += popcount32(xor);
    }
    return 1.0 - (diffBits / this.dimension);
  }

  /**
   * Hamming distance (number of differing bits)
   */
  hammingDistance(other: Hypervector): number {
    if (this.dimension !== other.dimension) {
      throw new Error(`Dimension mismatch: ${this.dimension} vs ${other.dimension}`);
    }
    let diffBits = 0;
    for (let i = 0; i < this.words.length; i++) {
      const xor = (this.words[i] ^ other.words[i]) >>> 0;
      diffBits += popcount32(xor);
    }
    return diffBits;
  }

  /**
   * Count total active bits in this hypervector
   */
  countActiveBits(): number {
    let count = 0;
    for (let i = 0; i < this.words.length; i++) {
      count += popcount32(this.words[i]);
    }
    return count;
  }

  /**
   * Calculate sparsity (fraction of active bits, typically ~0.5)
   */
  sparsity(): number {
    return this.countActiveBits() / this.dimension;
  }

  /**
   * Invert all bits (Negation)
   */
  negate(): Hypervector {
    const result = new Uint32Array(this.words.length);
    for (let i = 0; i < this.words.length; i++) {
      result[i] = (~this.words[i]) >>> 0;
    }
    return new Hypervector(this.dimension, result);
  }
}

/**
 * Fast 32-bit bitwise population count (Hamming weight)
 */
function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  x = x + (x >>> 8);
  x = x + (x >>> 16);
  return x & 0x0000003f;
}

/**
 * BUNDLING operation (Majority Rule / Superposition)
 * Merges multiple hypervectors into a composite representation.
 * The result is similar to all constituent vectors.
 */
export function bundle(vectors: Hypervector[]): Hypervector {
  if (vectors.length === 0) {
    throw new Error('Cannot bundle empty array of hypervectors');
  }
  if (vectors.length === 1) {
    return vectors[0].clone();
  }

  const dim = vectors[0].dimension;
  const numWords = dim / 32;
  const threshold = vectors.length / 2.0;

  // Track bit counts for each of the `dim` bit positions
  const bitCounts = new Uint32Array(dim);

  for (const v of vectors) {
    if (v.dimension !== dim) {
      throw new Error(`Dimension mismatch during bundle: expected ${dim}, got ${v.dimension}`);
    }
    for (let bitIdx = 0; bitIdx < dim; bitIdx++) {
      const wordIdx = bitIdx >>> 5;
      const bitInWord = bitIdx & 31;
      if ((v.words[wordIdx] >>> bitInWord) & 1) {
        bitCounts[bitIdx]++;
      }
    }
  }

  // Create majority vector
  const resultWords = new Uint32Array(numWords);
  for (let bitIdx = 0; bitIdx < dim; bitIdx++) {
    const count = bitCounts[bitIdx];
    // Break exact ties with deterministic alternating bit
    const bitOn = count > threshold || (count === threshold && (bitIdx % 2 === 1));
    if (bitOn) {
      const wordIdx = bitIdx >>> 5;
      const bitInWord = bitIdx & 31;
      resultWords[wordIdx] = (resultWords[wordIdx] | (1 << bitInWord)) >>> 0;
    }
  }

  return new Hypervector(dim, resultWords);
}

/**
 * Associative Item Memory / Concept Vocabulary
 * Stores atomic concept hypervectors and supports nearest-neighbor associative recall.
 */
export class AssociativeItemMemory {
  readonly dimension: number;
  private readonly items: Map<string, Hypervector> = new Map();

  constructor(dimension: number = 4096) {
    this.dimension = dimension;
  }

  get size(): number {
    return this.items.size;
  }

  /**
   * Method alias for size getter
   */
  getSize(): number {
    return this.items.size;
  }

  /**
   * Alias for store/set
   */
  store(label: string, vector: Hypervector, metadata?: any): void {
    this.set(label, vector);
  }

  /**
   * Alias for findNearest/recallTopK
   */
  findNearest(query: Hypervector, k: number = 5): Array<{ label: string; similarity: number }> {
    return this.recallTopK(query, k);
  }

  /**
   * Get existing concept vector or generate deterministically
   */
  getOrCreate(label: string): Hypervector {
    const existing = this.items.get(label);
    if (existing) return existing;

    const created = Hypervector.fromLabel(label, this.dimension);
    this.items.set(label, created);
    return created;
  }

  /**
   * Explicitly set or learn a concept vector
   */
  set(label: string, vector: Hypervector): void {
    if (vector.dimension !== this.dimension) {
      throw new Error(`Dimension mismatch: expected ${this.dimension}, got ${vector.dimension}`);
    }
    this.items.set(label, vector);
  }

  /**
   * Query associative memory for the closest matching concept
   */
  recallClosest(query: Hypervector, minSimilarity: number = 0.55): { label: string; similarity: number } | null {
    let bestLabel: string | null = null;
    let bestSim = -1;

    for (const [label, vec] of this.items.entries()) {
      const sim = query.similarity(vec);
      if (sim > bestSim) {
        bestSim = sim;
        bestLabel = label;
      }
    }

    if (bestLabel && bestSim >= minSimilarity) {
      return { label: bestLabel, similarity: bestSim };
    }
    return null;
  }

  /**
   * Find top-k matching concepts
   */
  recallTopK(query: Hypervector, k: number = 5): Array<{ label: string; similarity: number }> {
    const results: Array<{ label: string; similarity: number }> = [];

    for (const [label, vec] of this.items.entries()) {
      const sim = query.similarity(vec);
      results.push({ label, similarity: sim });
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, k);
  }

  /**
   * Encode a Key-Value record into a single bound hypervector
   * E.g. { subject: "Queen", action: "protect", object: "Cell" }
   * => Bundle( bind(K_subj, V_Queen), bind(K_act, V_prot), bind(K_obj, V_Cell) )
   */
  encodeRecord(record: Record<string, string>): Hypervector {
    const pairs: Hypervector[] = [];
    for (const [k, v] of Object.entries(record)) {
      const keyVec = this.getOrCreate(`key:${k}`);
      const valVec = this.getOrCreate(`val:${v}`);
      pairs.push(keyVec.bind(valVec));
    }
    if (pairs.length === 0) {
      return new Hypervector(this.dimension);
    }
    return bundle(pairs);
  }

  /**
   * Encode an ordered sequence of tokens into a single hypervector
   * E.g. [T0, T1, T2] => Bundle( permute(T0, 0), permute(T1, 1), permute(T2, 2) )
   */
  encodeSequence(tokens: string[]): Hypervector {
    if (tokens.length === 0) {
      return new Hypervector(this.dimension);
    }
    const elements: Hypervector[] = [];
    for (let pos = 0; pos < tokens.length; pos++) {
      const tokenVec = this.getOrCreate(`tok:${tokens[pos]}`);
      elements.push(tokenVec.permute(pos));
    }
    return bundle(elements);
  }
}
