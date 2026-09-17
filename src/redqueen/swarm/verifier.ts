import { validatePeerIdentity } from '../validation/validators';
import { signingCrypto } from '../crypto/signing';
import { canonicalizeMembershipPayload } from './canonical';
import {
  MembershipCertificate,
  MembershipCertificateSchema,
  CLOCK_SKEW_TOLERANCE_MS,
  CURRENT_PROTOCOL_VERSION,
  CURRENT_MEMBERSHIP_VERSION
} from './types';

export interface CertificateVerificationResult {
  valid: boolean;
  reason?: string;
  certificate?: MembershipCertificate;
}

export type RevocationChecker = (certificateId: string, memberNodeId: string) => boolean;

/**
 * Independently and cryptographically verifies a Red Queen MembershipCertificate.
 * 
 * Never trusts remote boolean claims; verification is 100% computed locally
 * using cryptographic signature verification over the canonical payload.
 */
export function verifyMembershipCertificate(
  cert: unknown,
  expectedSwarmId?: string,
  expectedIssuerPublicKey?: string,
  revocationChecker?: RevocationChecker,
  now: number = Date.now()
): CertificateVerificationResult {
  // 1. Zod schema validation
  const parsed = MembershipCertificateSchema.safeParse(cert);
  if (!parsed.success) {
    const errorIssues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    return { valid: false, reason: `Malformed certificate schema: ${errorIssues}` };
  }
  const c = parsed.data;

  // 2. Swarm ID validation
  if (expectedSwarmId && c.swarmId !== expectedSwarmId) {
    return {
      valid: false,
      reason: `Swarm ID mismatch: expected '${expectedSwarmId}', received '${c.swarmId}'`
    };
  }

  // 3. Protocol & membership version compatibility
  if (c.protocolVersion !== CURRENT_PROTOCOL_VERSION) {
    return {
      valid: false,
      reason: `Unsupported protocol version: ${c.protocolVersion} (current: ${CURRENT_PROTOCOL_VERSION})`
    };
  }
  if (c.membershipVersion !== CURRENT_MEMBERSHIP_VERSION) {
    return {
      valid: false,
      reason: `Unsupported membership version: ${c.membershipVersion} (current: ${CURRENT_MEMBERSHIP_VERSION})`
    };
  }

  // 4. Issuer Identity validation
  const issuerIdCheck = validatePeerIdentity(c.issuerId, c.issuerPublicKey);
  if (!issuerIdCheck.valid) {
    return { valid: false, reason: `Invalid issuer identity: ${issuerIdCheck.reason}` };
  }

  // 5. Trusted Issuer Public Key check (MUST be configured)
  if (!expectedIssuerPublicKey) {
    return { valid: false, reason: 'No trusted issuer public key configured for verification (TOFU rejected)' };
  }
  if (c.issuerPublicKey.trim() !== expectedIssuerPublicKey.trim()) {
    return { valid: false, reason: 'Certificate was signed by an untrusted issuer key' };
  }

  // 6. Member Identity validation
  const memberIdCheck = validatePeerIdentity(c.memberNodeId, c.memberPublicKey);
  if (!memberIdCheck.valid) {
    return { valid: false, reason: `Invalid member identity: ${memberIdCheck.reason}` };
  }

  // 7. Timing & Expiration checks (with clock skew tolerance)
  if (c.issuedAt > now + CLOCK_SKEW_TOLERANCE_MS) {
    return {
      valid: false,
      reason: `Certificate issued in the future (issuedAt: ${c.issuedAt}, currentTime: ${now})`
    };
  }

  if (c.expiresAt <= c.issuedAt) {
    return {
      valid: false,
      reason: `Certificate expiresAt (${c.expiresAt}) must be strictly greater than issuedAt (${c.issuedAt})`
    };
  }

  if (now > c.expiresAt) {
    return {
      valid: false,
      reason: `Certificate expired at ${c.expiresAt} (currentTime: ${now})`
    };
  }

  // 8. Revocation check
  if (revocationChecker && revocationChecker(c.certificateId, c.memberNodeId)) {
    return {
      valid: false,
      reason: `Certificate ${c.certificateId} or member ${c.memberNodeId} has been revoked`
    };
  }

  // 9. Cryptographic signature check against canonical payload
  const canonicalPayload = canonicalizeMembershipPayload(c);
  const isSignatureValid = signingCrypto.verify(canonicalPayload, c.signature, c.issuerPublicKey);
  if (!isSignatureValid) {
    return { valid: false, reason: 'Invalid membership certificate signature' };
  }

  return { valid: true, certificate: c };
}
