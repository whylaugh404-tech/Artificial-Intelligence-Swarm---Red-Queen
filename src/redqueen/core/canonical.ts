import { createHash } from 'crypto';

/**
 * Deterministic JSON canonicalization used by Red Queen.
 * Compatible with RFC 8785/JCS semantics for supported JSON values.
 */

export type CanonicalJsonPrimitive =
  | null
  | boolean
  | number
  | string;

/**
 * Checks whether a string contains unpaired surrogate code points.
 * According to RFC 8785 Section 3.2.2.2, JSON strings MUST NOT contain unpaired surrogate code points.
 */
function hasUnpairedSurrogates(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: must be followed by a low surrogate (0xdc00..0xdfff)
      if (i + 1 >= str.length) {
        return true;
      }
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++; // valid surrogate pair
      } else {
        return true;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Unpaired low surrogate
      return true;
    }
  }
  return false;
}

/**
 * Canonical string serialization strictly adhering to RFC 8785 Section 3.2.2.2.
 */
export function canonicalizeString(str: string): string {
  if (hasUnpairedSurrogates(str)) {
    throw new TypeError('RFC 8785 error: lone surrogate character found in string.');
  }
  return JSON.stringify(str);
}

/**
 * Canonical number serialization adhering to RFC 8785 Section 3.2.2.3.
 * - Non-finite numbers (NaN, Infinity, -Infinity) are rejected.
 * - Negative zero (-0) MUST be serialized as '0'.
 * - Uses ECMAScript number formatting via JSON.stringify.
 */
export function canonicalizeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError('Cannot canonicalize non-finite number');
  }

  if (Object.is(value, -0) || value === 0) {
    return '0';
  }

  return JSON.stringify(value);
}

/**
 * Deterministic JSON canonicalization conforming to RFC 8785 / JCS semantics.
 */
export function canonicalizeJson(value: unknown, seen: Set<unknown> = new Set()): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return canonicalizeNumber(value);
  }

  if (typeof value === 'string') {
    return canonicalizeString(value);
  }

  if (typeof value === 'bigint') {
    throw new TypeError('BigInt is not a JSON/JCS value');
  }

  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError('Cannot canonicalize non-JSON value');
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new TypeError('RFC 8785 error: circular reference detected during canonical serialization.');
    }
    seen.add(value);

    try {
      // Check for custom toJSON()
      const maybeToJson = value as { toJSON?: unknown };
      if (typeof maybeToJson.toJSON === 'function') {
        const jsonVal = (maybeToJson.toJSON as () => unknown)();
        return canonicalizeJson(jsonVal, seen);
      }

      if (Array.isArray(value)) {
        const serializedElements: string[] = [];
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
            serializedElements.push('null');
          } else {
            serializedElements.push(canonicalizeJson(item, seen));
          }
        }
        return `[${serializedElements.join(',')}]`;
      }

      // Ordinary Object: sort keys deterministically by UTF-16 code units
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0
      );

      const serializedEntries: string[] = [];
      for (const key of keys) {
        const val = record[key];
        if (val === undefined || typeof val === 'function' || typeof val === 'symbol') {
          // Omit undefined / functions / symbols in JSON object serialization
          continue;
        }
        serializedEntries.push(`${canonicalizeString(key)}:${canonicalizeJson(val, seen)}`);
      }

      return `{${serializedEntries.join(',')}}`;
    } finally {
      seen.delete(value);
    }
  }

  throw new TypeError('Cannot canonicalize non-JSON value');
}

/**
 * Universal canonical serialization alias conforming to RFC 8785.
 */
export const canonicalSerialize = canonicalizeJson;

/**
 * Computes a full 256-bit SHA-256 hex digest (64 hex characters) from any semantic value.
 * Guarantee: same semantic input + same schema/version -> same deterministic identity.
 */
export function computeCanonicalHash(value: unknown): string {
  const canonicalRepresentation = canonicalSerialize(value);
  return createHash('sha256')
    .update(canonicalRepresentation, 'utf8')
    .digest('hex');
}

/**
 * Alias for canonical hash computation conforming to RFC 8785.
 */
export const computeDeterministicHash = computeCanonicalHash;

/**
 * Consistent hash utility across Red Queen Core.
 * By default returns full 256-bit (64 hex characters).
 * Optional truncate64 for explicit legacy compatibility where required.
 */
export function computeHash(contentOrObj: unknown, options?: { truncate64?: boolean }): string {
  const fullHash = computeCanonicalHash(contentOrObj);
  if (options?.truncate64) {
    return fullHash.substring(0, 16);
  }
  return fullHash;
}

/**
 * Canonicalizes an array of provenance strings:
 * - Deduplicates identifiers.
 * - Filters empty/falsy strings.
 * - Sorts lexicographically using UTF-16 code units.
 */
export function canonicalizeProvenance(provenance: readonly string[] | string[]): string[] {
  const unique = Array.from(new Set(provenance.filter(Boolean)));
  return unique.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Generates a standard deterministic identity prefixed with type:
 * e.g., generateDeterministicId('state', payload) -> 'state_64hexchars'
 */
export function generateDeterministicId(prefix: string, semanticPayload: unknown): string {
  const hash = computeCanonicalHash(semanticPayload);
  return `${prefix}_${hash}`;
}

/**
 * Recursive deep freeze to guarantee strict immutability across state, partitions, and compositions.
 */
export function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.keys(obj as Record<string, unknown>).forEach(prop => {
      deepFreeze((obj as Record<string, unknown>)[prop]);
    });
    Object.freeze(obj);
  }
  return obj;
}
