import { createHash } from 'crypto';

/**
 * RFC 8785 (JSON Canonicalization Scheme - JCS) compliant JSON canonicalizer.
 * Enforces:
 * 1. Consistent Unicode string escaping (control characters, quotes, backslashes).
 * 2. UTF-16 code unit lexicographical sorting of object keys.
 * 3. Exact IEEE 754 number formatting, canonicalizing -0 to 0 and rejecting NaN/Infinity.
 * 4. Cycle detection preventing circular reference infinite loops.
 * 5. Deterministic whitespace stripping (no formatting spaces outside string literals).
 */
export function canonicalizeJson(value: unknown, seen: Set<unknown> = new Set()): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return 'undefined';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('RFC 8785 error: non-finite numbers (NaN, Infinity) cannot be canonicalized.');
    }
    if (Object.is(value, -0)) {
      return '0';
    }
    return String(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'string') {
    return canonicalizeString(value);
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new Error('RFC 8785 error: circular reference detected during canonical serialization.');
    }
    seen.add(value);

    try {
      // Check for custom toJSON()
      const maybeToJson = value as { toJSON?: () => unknown };
      if (typeof maybeToJson.toJSON === 'function') {
        const jsonVal = maybeToJson.toJSON();
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

      // Ordinary Object
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort((a, b) => {
        return a < b ? -1 : a > b ? 1 : 0;
      });

      const serializedEntries: string[] = [];
      for (const key of keys) {
        const val = record[key];
        if (val === undefined || typeof val === 'function' || typeof val === 'symbol') {
          // Omit undefined / functions in JSON object serialization
          continue;
        }
        serializedEntries.push(`${canonicalizeString(key)}:${canonicalizeJson(val, seen)}`);
      }

      return `{${serializedEntries.join(',')}}`;
    } finally {
      seen.delete(value);
    }
  }

  throw new Error(`RFC 8785 error: unsupported data type: ${typeof value}`);
}

/**
 * Canonical string serialization complying with JSON string escaping rules.
 */
function canonicalizeString(str: string): string {
  let result = '"';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);

    // Escape backslash and double quote
    if (code === 0x5c) { // \
      result += '\\\\';
    } else if (code === 0x22) { // "
      result += '\\"';
    } else if (code === 0x08) { // \b
      result += '\\b';
    } else if (code === 0x0c) { // \f
      result += '\\f';
    } else if (code === 0x0a) { // \n
      result += '\\n';
    } else if (code === 0x0d) { // \r
      result += '\\r';
    } else if (code === 0x09) { // \t
      result += '\\t';
    } else if (code < 0x20) {
      // Control characters < 0x20 -> \u00xx
      result += `\\u${code.toString(16).padStart(4, '0')}`;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: verify valid pair
      if (i + 1 < str.length) {
        const nextCode = str.charCodeAt(i + 1);
        if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
          result += str[i] + str[i + 1];
          i++; // Skip low surrogate
          continue;
        }
      }
      throw new Error('RFC 8785 error: lone surrogate character found in string.');
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Unpaired low surrogate
      throw new Error('RFC 8785 error: lone surrogate character found in string.');
    } else {
      result += str[i];
    }
  }
  result += '"';
  return result;
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
  const serialized = typeof value === 'string' ? value : canonicalSerialize(value);
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

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
