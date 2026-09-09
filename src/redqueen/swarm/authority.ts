import { randomUUID } from 'crypto';
import { identityCrypto } from '../crypto/identity';
import { signingCrypto } from '../crypto/signing';
import { validatePeerIdentity } from '../validation/validators';
import { canonicalizeMembershipPayload } from './canonical';
import {
  MembershipCertificate,
  MembershipCertificateSchema,
  ALLOWED_CAPABILITIES,
  SwarmCapability,
  DEFAULT_CERT_TTL_MS,
  CURRENT_PROTOCOL_VERSION,
  CURRENT_MEMBERSHIP_VERSION
} from './types';

export interface IssueCertificateParams {
  swarmId: string;
  memberNodeId: string;
  memberPublicKey: string;
  capabilities: string[];
  ttlMs?: number;
  protocolVersion?: number;
  membershipVersion?: number;
  revocationEpoch?: number;
  customIssuedAt?: number;
  customExpiresAt?: number;
  customCertificateId?: string;
}

/**
 * Dedicated cryptographic signing authority for Red Queen swarm membership.
 * 
 * Strict separation: This authority maintains its own Ed25519 keypair, distinct
 * from any cell's transport keypair. The private key is strictly isolated and
 * never transmitted over network protocols.
 */
export class MembershipAuthority {
  public readonly issuerId: string;
  public readonly publicKey: string;
  private readonly privateKey: string;

  constructor(privateKeyPem?: string, publicKeyPem?: string) {
    if (privateKeyPem && publicKeyPem) {
      this.privateKey = privateKeyPem.trim();
      this.publicKey = publicKeyPem.trim();
    } else {
      const kp = identityCrypto.generateKeyPair();
      this.privateKey = kp.privateKey.trim();
      this.publicKey = kp.publicKey.trim();
    }
    this.issuerId = identityCrypto.deriveNodeId(this.publicKey);
  }

  /**
   * Issues a signed MembershipCertificate for an authorized member node.
   */
  issueCertificate(params: IssueCertificateParams): MembershipCertificate {
    // 1. Validate member identity
    const normalizedMemberPubKey = params.memberPublicKey.trim();
    const idCheck = validatePeerIdentity(params.memberNodeId, normalizedMemberPubKey);
    if (!idCheck.valid) {
      throw new Error(`Cannot issue certificate for invalid member: ${idCheck.reason}`);
    }

    // 2. Validate and filter capabilities
    const validCaps: SwarmCapability[] = [];
    for (const cap of params.capabilities) {
      if ((ALLOWED_CAPABILITIES as readonly string[]).includes(cap)) {
        if (!validCaps.includes(cap as SwarmCapability)) {
          validCaps.push(cap as SwarmCapability);
        }
      }
    }

    if (validCaps.length === 0) {
      throw new Error('Cannot issue certificate with empty or invalid capabilities');
    }

    const issuedAt = params.customIssuedAt ?? Date.now();
    const ttl = params.ttlMs ?? DEFAULT_CERT_TTL_MS;
    const expiresAt = params.customExpiresAt ?? (issuedAt + ttl);

    const certificateId = params.customCertificateId ?? randomUUID();
    const protocolVersion = params.protocolVersion ?? CURRENT_PROTOCOL_VERSION;
    const membershipVersion = params.membershipVersion ?? CURRENT_MEMBERSHIP_VERSION;
    const revocationEpoch = params.revocationEpoch ?? 0;

    const unsignedData = {
      certificateId,
      swarmId: params.swarmId,
      memberNodeId: params.memberNodeId,
      memberPublicKey: params.memberPublicKey.trim(),
      issuerId: this.issuerId,
      issuerPublicKey: this.publicKey.trim(),
      issuedAt,
      expiresAt,
      membershipVersion,
      protocolVersion,
      capabilities: validCaps,
      revocationEpoch
    };

    // 3. Canonicalize and sign
    const canonicalPayload = canonicalizeMembershipPayload(unsignedData);
    const signature = signingCrypto.sign(canonicalPayload, this.privateKey);

    const cert: MembershipCertificate = {
      ...unsignedData,
      signature
    };

    // 4. Validate output matches schema
    return MembershipCertificateSchema.parse(cert);
  }
}
