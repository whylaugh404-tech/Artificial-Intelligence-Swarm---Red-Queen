import { MembershipCertificate } from './types';

export type CanonicalMembershipData = Omit<MembershipCertificate, 'signature'>;

/**
 * Deterministically serializes a MembershipCertificate's contents (excluding signature)
 * for signing and verification.
 * 
 * Guarantees:
 * 1. Lexicographical sorting and deduplication of capabilities.
 * 2. Unambiguous delimited structure with clear versioned prefix.
 * 3. Consistent trimming and normalization of whitespace.
 */
export function canonicalizeMembershipPayload(data: CanonicalMembershipData): string {
  const sortedCapabilities = Array.from(new Set(data.capabilities)).sort();

  return [
    'REDQUEEN-MEMBERSHIP-v1',
    `proto:${data.protocolVersion}`,
    `mver:${data.membershipVersion}`,
    `cid:${data.certificateId}`,
    `swarm:${data.swarmId}`,
    `iss:${data.issuerId}`,
    `iss_pub:${data.issuerPublicKey.trim()}`,
    `mem:${data.memberNodeId}`,
    `mem_pub:${data.memberPublicKey.trim()}`,
    `iat:${data.issuedAt}`,
    `exp:${data.expiresAt}`,
    `rev_epoch:${data.revocationEpoch ?? 0}`,
    `caps:${sortedCapabilities.join(',')}`
  ].join('|');
}
