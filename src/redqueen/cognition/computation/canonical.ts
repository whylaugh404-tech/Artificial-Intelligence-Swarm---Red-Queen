import { createHash } from 'crypto';

/**
 * JSON Canonicalization Scheme (JCS) - RFC 8785 Implementation
 * 
 * Complies strictly with RFC 8785:
 * - Section 3.2.1: Whitespace - No whitespace outside strings.
 * - Section 3.2.2.1: Primitive values - 'null', 'true', 'false'.
 * - Section 3.2.2.2: Strings - Delimited by double quotes. Only \", \\, \b, \f, \n, \r, \t
 *   and control characters U+0000..U+001F (as lowercase \u00xx) are escaped. Unpaired surrogates rejected.
 * - Section 3.2.2.3: Numbers - ECMA-262 ToString, negative zero (-0) MUST be serialized as '0'.
 *   Non-finite numbers (NaN, Infinity) are rejected with TypeError.
 * - Section 3.2.3: Objects - Keys sorted lexicographically by UTF-16 code units. Undefined/functions omitted.
 * - Section 3.2.4: Arrays - Exact order preserved. Undefined/functions serialized as null.
 */

/**
 * Checks whether a string contains unpaired surrogate code points.
 * According to RFC 8785 Section 3.2.2.2, JSON strings MUST NOT contain unpaired surrogate code points.
 */
function hasUnpairedSurrogates(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: must be followed by low surrogate
      if (i + 1 >= str.length) return true;
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
 * Serializes a string strictly adhering to RFC 8785 Section 3.2.2.2.
 */
export function canonicalizeString(str: string): string {
  if (hasUnpairedSurrogates(str)) {
    throw new TypeError('RFC 8785: Unpaired surrogate code points are not allowed in JSON strings');
  }
  return JSON.stringify(str);
}

/**
 * Serializes a number strictly adhering to RFC 8785 Section 3.2.2.3.
 */
export function canonicalizeNumber(num: number): string {
  if (!Number.isFinite(num)) {
    throw new TypeError('RFC 8785: Non-finite numbers (NaN, Infinity) are not permitted in canonical JSON');
  }
  // RFC 8785 mandate: Negative zero (-0) MUST be serialized as '0'
  if (Object.is(num, -0) || num === 0) {
    return '0';
  }
  return JSON.stringify(num);
}

/**
 * Canonical JSON serialization conforming to RFC 8785 (JSON Canonicalization Scheme - JCS).
 */
export function canonicalizeJson(value: unknown, seen = new Set<unknown>()): string {
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
    throw new TypeError('RFC 8785: BigInt serialization is not supported in standard JSON');
  }

  // Handle custom toJSON serialization if present (e.g. Date objects)
  if (typeof value === 'object' && value !== null && typeof (value as any).toJSON === 'function') {
    return canonicalizeJson((value as any).toJSON(), seen);
  }

  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) {
      throw new TypeError('RFC 8785: Circular reference detected');
    }
    seen.add(value);

    try {
      if (Array.isArray(value)) {
        const elements = value.map(element => {
          if (element === undefined || typeof element === 'symbol' || typeof element === 'function') {
            return 'null';
          }
          return canonicalizeJson(element, seen);
        });
        return `[${elements.join(',')}]`;
      }

      // Plain or structured object
      const obj = value as Record<string, unknown>;
      // Sort keys strictly by UTF-16 code units (lexicographical comparison)
      const keys = Object.keys(obj).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const parts: string[] = [];

      for (const key of keys) {
        const val = obj[key];
        // In objects, omit undefined, symbols, and functions (per RFC 8785 & JSON specification)
        if (val === undefined || typeof val === 'symbol' || typeof val === 'function') {
          continue;
        }
        const serializedKey = canonicalizeString(key);
        const serializedVal = canonicalizeJson(val, seen);
        parts.push(`${serializedKey}:${serializedVal}`);
      }

      return `{${parts.join(',')}}`;
    } finally {
      seen.delete(value);
    }
  }

  // Root undefined / functions / symbols serialize as 'null' for safe deterministic hashing
  return 'null';
}

/**
 * Standard alias for RFC 8785 canonical serialization.
 */
export const canonicalSerialize = canonicalizeJson;

/**
 * Computes deterministic SHA-256 hash for any arbitrary structured object
 * after strict RFC 8785 / JCS canonicalization.
 */
export function computeDeterministicHash(obj: unknown): string {
  const canonicalStr = canonicalizeJson(obj);
  return createHash('sha256').update(canonicalStr, 'utf8').digest('hex');
}
