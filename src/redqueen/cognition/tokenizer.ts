/**
 * Red Queen Micro-Tokenizer
 * 
 * Ultra-compact, dependency-free subword & character tokenizer designed for
 * resource-constrained edge devices (mobile phones & IoT).
 * Provides fast bidirectional mapping between natural language strings and token sequences.
 */

export interface TokenizerConfig {
  maxVocabSize?: number;
  specialTokens?: string[];
}

export class MicroTokenizer {
  readonly specialTokens: string[] = ['<pad>', '<unk>', '<bos>', '<eos>', '<sep>'];
  private vocabToId: Map<string, number> = new Map();
  private idToVocab: Map<number, string> = new Map();

  constructor(initialVocab: string[] = []) {
    // Register special tokens first
    this.specialTokens.forEach((token, idx) => {
      this.vocabToId.set(token, idx);
      this.idToVocab.set(idx, token);
    });

    // Populate standard base vocabulary (ASCII printable characters)
    let nextId = this.specialTokens.length;
    for (let i = 32; i <= 126; i++) {
      const char = String.fromCharCode(i);
      if (!this.vocabToId.has(char)) {
        this.vocabToId.set(char, nextId);
        this.idToVocab.set(nextId, char);
        nextId++;
      }
    }

    // Add common Indonesian & English word stems / subwords
    const defaultSubwords = [
      'the', 'is', 'in', 'at', 'which', 'on', 'and', 'a', 'to', 'for', 'with', 'as', 'by',
      'yang', 'di', 'dan', 'ini', 'itu', 'ke', 'dari', 'untuk', 'pada', 'adalah', 'dengan',
      'tidak', 'akan', 'bisa', 'ada', 'juga', 'oleh', 'sudah', 'lebih', 'mereka', 'kami', 'kita',
      'cell', 'node', 'queen', 'red', 'state', 'agent', 'graph', 'rule', 'learn', 'memory',
      'data', 'input', 'output', 'query', 'true', 'false', 'error', 'ok', 'sync', 'status'
    ];

    for (const word of [...defaultSubwords, ...initialVocab]) {
      const lower = word.toLowerCase().trim();
      if (lower && !this.vocabToId.has(lower)) {
        this.vocabToId.set(lower, nextId);
        this.idToVocab.set(nextId, lower);
        nextId++;
      }
    }
  }

  get vocabSize(): number {
    return this.vocabToId.size;
  }

  get padId(): number { return 0; }
  get unkId(): number { return 1; }
  get bosId(): number { return 2; }
  get eosId(): number { return 3; }
  get sepId(): number { return 4; }

  /**
   * Register a new subword / token into vocabulary dynamically
   */
  registerToken(token: string): number {
    const trimmed = token.toLowerCase();
    const existing = this.vocabToId.get(trimmed);
    if (existing !== undefined) return existing;

    const newId = this.vocabToId.size;
    this.vocabToId.set(trimmed, newId);
    this.idToVocab.set(newId, trimmed);
    return newId;
  }

  /**
   * Train/add a collection of tokens or words into the vocabulary
   */
  train(words: string[]): void {
    for (const word of words) {
      this.registerToken(word);
    }
  }

  /**
   * Tokenize text into sequence of token IDs
   */
  encode(text: string, addBosEos: boolean = false): number[] {
    if (!text || text.trim().length === 0) {
      return addBosEos ? [this.bosId, this.eosId] : [];
    }

    const tokens: number[] = [];
    if (addBosEos) tokens.push(this.bosId);

    // Split text into word chunks while preserving punctuation
    const words = text.toLowerCase().match(/\w+|[^\s\w]/g) || [];

    for (const word of words) {
      if (this.vocabToId.has(word)) {
        tokens.push(this.vocabToId.get(word)!);
      } else {
        // Greedy longest match or fallback to character tokens
        let cursor = 0;
        while (cursor < word.length) {
          let matched = false;
          for (let len = Math.min(10, word.length - cursor); len > 1; len--) {
            const sub = word.slice(cursor, cursor + len);
            if (this.vocabToId.has(sub)) {
              tokens.push(this.vocabToId.get(sub)!);
              cursor += len;
              matched = true;
              break;
            }
          }
          if (!matched) {
            const char = word[cursor];
            const charId = this.vocabToId.get(char) ?? this.unkId;
            tokens.push(charId);
            cursor++;
          }
        }
      }
    }

    if (addBosEos) tokens.push(this.eosId);
    return tokens;
  }

  /**
   * Decode sequence of token IDs back into string
   */
  decode(tokenIds: number[], skipSpecialTokens: boolean = true): string {
    const parts: string[] = [];

    for (const id of tokenIds) {
      if (skipSpecialTokens && id <= this.sepId) {
        continue;
      }
      const token = this.idToVocab.get(id);
      if (token) {
        parts.push(token);
      }
    }

    // Join with spaces between words, connect punctuation neatly
    return parts.join(' ').replace(/\s+([.,!?;:])/g, '$1');
  }
}
