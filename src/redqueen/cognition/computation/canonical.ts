/**
 * JSON Canonicalization Scheme (JCS) - RFC 8785 Implementation
 * Canonical serialization and hashing module for Red Queen Cognition.
 */
export {
  type CanonicalJsonPrimitive,
  canonicalizeString,
  canonicalizeNumber,
  canonicalizeJson,
  canonicalSerialize,
  computeCanonicalHash,
  computeDeterministicHash
} from '../../core/canonical';

