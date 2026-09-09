import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
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
 * from any cell's transport keypair. The private key is strictly isolated in memory,
 * never logged, never returned over API endpoints, and never transmitted over network protocols.
 */
export class MembershipAuthority {
  public readonly issuerId: string;
  public readonly publicKey: string;
  private readonly privateKey: string;

  constructor(privateKeyPem?: string, publicKeyPem?: string) {
    let priv: string;
    let pub: string;
    if (privateKeyPem && publicKeyPem) {
      priv = privateKeyPem.trim();
      pub = publicKeyPem.trim();
    } else {
      const kp = identityCrypto.generateKeyPair();
      priv = kp.privateKey.trim();
      pub = kp.publicKey.trim();
    }
    this.publicKey = pub;
    this.issuerId = identityCrypto.deriveNodeId(this.publicKey);

    // Keep privateKey non-enumerable to prevent accidental leaks via JSON.stringify or enumeration
    Object.defineProperty(this, 'privateKey', {
      value: priv,
      writable: false,
      enumerable: false,
      configurable: false
    });
  }

  /**
   * Loads an existing persistent authority from keypair strings.
   */
  public static fromKeyPair(privateKeyPem: string, publicKeyPem: string): MembershipAuthority {
    return new MembershipAuthority(privateKeyPem, publicKeyPem);
  }

  /**
   * Loads an existing persistent authority from key files on disk.
   */
  public static async fromFiles(privateKeyPath: string, publicKeyPath: string): Promise<MembershipAuthority> {
    const [privateKeyPem, publicKeyPem] = await Promise.all([
      fs.readFile(privateKeyPath, 'utf8'),
      fs.readFile(publicKeyPath, 'utf8')
    ]);
    return new MembershipAuthority(privateKeyPem, publicKeyPem);
  }

  /**
   * Persists the authority keypair securely to disk.
   */
  public async saveToFiles(privateKeyPath: string, publicKeyPath: string): Promise<void> {
    await fs.mkdir(path.dirname(privateKeyPath), { recursive: true });
    await fs.mkdir(path.dirname(publicKeyPath), { recursive: true });
    await Promise.all([
      fs.writeFile(privateKeyPath, this.privateKey, { encoding: 'utf8', mode: 0o600 }), // Restrict private key permissions
      fs.writeFile(publicKeyPath, this.publicKey, { encoding: 'utf8', mode: 0o644 })
    ]);
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

  /**
   * Safe serialization: NEVER exports or logs the private signing key.
   */
  public toJSON() {
    return {
      issuerId: this.issuerId,
      publicKey: this.publicKey
    };
  }

  public toString() {
    return `MembershipAuthority(issuerId: ${this.issuerId})`;
  }
}
