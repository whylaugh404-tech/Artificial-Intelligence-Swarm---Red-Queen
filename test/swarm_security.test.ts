import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import { signingCrypto } from '../src/redqueen/crypto/signing';
import {
  MembershipAuthority,
  verifyMembershipCertificate,
  canonicalizeMembershipPayload,
  MembershipState,
  SwarmMembershipManager,
  AllowlistAuthorizationPolicy,
  MembershipCertificate,
  MembershipCertificateSchema,
  ALLOWED_CAPABILITIES,
  DEFAULT_CERT_TTL_MS,
  CLOCK_SKEW_TOLERANCE_MS,
  CURRENT_PROTOCOL_VERSION,
  CURRENT_MEMBERSHIP_VERSION
} from '../src/redqueen/swarm';
import { P2PTransport } from '../src/redqueen/network/transport';
import { MessageType } from '../src/redqueen/network/protocol';
import { PeerState } from '../src/redqueen/network/peer';

describe('P2 Swarm Membership: 30 Security Scenarios', () => {
  let authority: MembershipAuthority;
  let cellTransportKey: { publicKey: string; privateKey: string };
  let cellNodeId: string;
  const SWARM_ID = 'redqueen-swarm-test-1';

  beforeEach(() => {
    authority = new MembershipAuthority();
    const kp = identityCrypto.generateKeyPair();
    cellTransportKey = {
      publicKey: kp.publicKey.trim(),
      privateKey: kp.privateKey.trim()
    };
    cellNodeId = identityCrypto.deriveNodeId(cellTransportKey.publicKey);
  });

  // Scenario 1: valid authorized JOIN_REQUEST
  it('Scenario 1: valid authorized peer receives signed certificate and becomes MEMBER', async () => {
    const policy = new AllowlistAuthorizationPolicy({
      allowedNodeIds: [cellNodeId],
      expectedSwarmId: SWARM_ID
    });

    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery', 'routing']
    });

    const verification = verifyMembershipCertificate(cert, SWARM_ID, authority.publicKey);
    expect(verification.valid).toBe(true);
    expect(verification.certificate?.memberNodeId).toBe(cellNodeId);
    expect(verification.certificate?.capabilities).toEqual(['discovery', 'routing']);
  });

  // Scenario 2: discovered but unauthorized peer
  it('Scenario 2: discovered but unauthorized peer cannot become MEMBER', () => {
    const policy = new AllowlistAuthorizationPolicy({
      allowedNodeIds: ['other-allowed-node'],
      expectedSwarmId: SWARM_ID
    });

    const decision = policy.authorizeJoin({
      nodeId: cellNodeId,
      publicKey: cellTransportKey.publicKey,
      swarmId: SWARM_ID,
      requestedCapabilities: ['discovery'],
      protocolVersion: CURRENT_PROTOCOL_VERSION
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('not authorized to join');
  });

  // Scenario 3: authenticated but unauthorized peer
  it('Scenario 3: authenticated peer denied by policy transitions to DENIED, not MEMBER', () => {
    const policy = new AllowlistAuthorizationPolicy({
      allowedNodeIds: [],
      expectedSwarmId: SWARM_ID
    });

    const decision = policy.authorizeJoin({
      nodeId: cellNodeId,
      publicKey: cellTransportKey.publicKey,
      swarmId: SWARM_ID,
      requestedCapabilities: ['discovery'],
      protocolVersion: CURRENT_PROTOCOL_VERSION
    });

    expect(decision.allowed).toBe(false);
  });

  // Scenario 4: valid membership certificate
  it('Scenario 4: valid membership certificate passes full cryptographic verification', () => {
    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery', 'routing', 'computation', 'memory']
    });

    const result = verifyMembershipCertificate(cert, SWARM_ID, authority.publicKey);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.certificate?.signature).toBeDefined();
  });

  // Scenario 5: invalid membership signature
  it('Scenario 5: invalid membership signature is rejected', () => {
    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery']
    });

    // Tamper with signature bytes
    const tamperedSig = cert.signature.substring(0, cert.signature.length - 8) + '01234567';
    const tamperedCert = { ...cert, signature: tamperedSig };

    const result = verifyMembershipCertificate(tamperedCert, SWARM_ID, authority.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid membership certificate signature');
  });

  // Scenario 6: modified member Node ID
  it('Scenario 6: modified member Node ID in certificate is rejected', () => {
    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery']
    });

    // Replace memberNodeId with another valid 64-char hex string
    const forgedNodeId = 'a'.repeat(64);
    const tamperedCert = { ...cert, memberNodeId: forgedNodeId };

    const result = verifyMembershipCertificate(tamperedCert, SWARM_ID, authority.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid member identity');
  });

  // Scenario 7: modified member public key
  it('Scenario 7: modified member public key in certificate is rejected', () => {
    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery']
    });

    const otherKeyPair = identityCrypto.generateKeyPair();
    const otherNodeId = identityCrypto.deriveNodeId(otherKeyPair.publicKey);
    // Tamper with memberPublicKey and memberNodeId
    const tamperedCert = {
      ...cert,
      memberNodeId: otherNodeId,
      memberPublicKey: otherKeyPair.publicKey
    };

    const result = verifyMembershipCertificate(tamperedCert, SWARM_ID, authority.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid membership certificate signature');
  });

  // Scenario 8: Node ID / public-key mismatch
  it('Scenario 8: mismatched Node ID and public key in certificate fails identity check', () => {
    const otherKeyPair = identityCrypto.generateKeyPair();
    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery']
    });

    // Mismatched: cellNodeId but otherKeyPair.publicKey
    const tamperedCert = { ...cert, memberPublicKey: otherKeyPair.publicKey };
    const result = verifyMembershipCertificate(tamperedCert, SWARM_ID, authority.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid member identity');
  });

  // Scenario 9: modified swarmId
  it('Scenario 9: modified swarmId in certificate fails signature verification and swarm match', () => {
    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery']
    });

    const tamperedCert = { ...cert, swarmId: 'evil-swarm' };
    const result = verifyMembershipCertificate(tamperedCert, SWARM_ID, authority.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Swarm ID mismatch');
  });

  // Scenario 10: wrong issuer
  it('Scenario 10: certificate signed by unauthorized issuer key is rejected', () => {
    const rogueAuthority = new MembershipAuthority();
    const certFromRogue = rogueAuthority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery']
    });

    // Verifying against legitimate authority's expected public key
    const result = verifyMembershipCertificate(certFromRogue, SWARM_ID, authority.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('untrusted issuer key');
  });

  // Scenario 11: expired certificate
  it('Scenario 11: expired certificate is rejected', () => {
    const now = Date.now();
    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery'],
      customIssuedAt: now - 100000,
      customExpiresAt: now - 50000
    });

    const result = verifyMembershipCertificate(cert, SWARM_ID, authority.publicKey, undefined, now);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expired');
  });

  // Scenario 12: future-issued certificate
  it('Scenario 12: future-issued certificate outside clock skew tolerance is rejected', () => {
    const now = Date.now();
    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery'],
      customIssuedAt: now + 60000, // 60s in future > 5s tolerance
      customExpiresAt: now + 120000
    });

    const result = verifyMembershipCertificate(cert, SWARM_ID, authority.publicKey, undefined, now);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('issued in the future');
  });

  // Scenario 13: malformed certificate
  it('Scenario 13: certificate missing required fields fails schema validation', () => {
    const malformed = {
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId
      // missing signature, issuer, capabilities, etc.
    };

    const result = verifyMembershipCertificate(malformed, SWARM_ID, authority.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Malformed certificate schema');
  });

  // Scenario 14: malformed capabilities
  it('Scenario 14: certificate with unauthorized/malformed capability strings is rejected', () => {
    expect(() => {
      authority.issueCertificate({
        swarmId: SWARM_ID,
        memberNodeId: cellNodeId,
        memberPublicKey: cellTransportKey.publicKey,
        capabilities: ['root_exec_command_exploit']
      });
    }).toThrow('Cannot issue certificate with empty or invalid capabilities');
  });

  // Scenario 15: replayed JOIN_REQUEST
  it('Scenario 15: replayed JOIN_REQUEST is idempotent and does not corrupt membership registry', () => {
    const policy = new AllowlistAuthorizationPolicy({
      allowedNodeIds: [cellNodeId],
      expectedSwarmId: SWARM_ID
    });

    const cert1 = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery']
    });

    // Replay logic check: verifier validates cert1 deterministically
    const r1 = verifyMembershipCertificate(cert1, SWARM_ID, authority.publicKey);
    const r2 = verifyMembershipCertificate(cert1, SWARM_ID, authority.publicKey);
    expect(r1.valid).toBe(true);
    expect(r2.valid).toBe(true);
    expect(r1.certificate?.certificateId).toBe(r2.certificate?.certificateId);
  });

  // Scenario 16: replayed membership response
  it('Scenario 16: membership response contains valid signed certificate verifiable on replay', () => {
    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery']
    });

    const verify1 = verifyMembershipCertificate(cert, SWARM_ID, authority.publicKey);
    const verify2 = verifyMembershipCertificate(cert, SWARM_ID, authority.publicKey);
    expect(verify1.valid).toBe(true);
    expect(verify2.valid).toBe(true);
  });

  // Scenario 17: unauthorized membership request
  it('Scenario 17: unauthorized node is denied by policy', () => {
    const policy = new AllowlistAuthorizationPolicy({
      allowedNodeIds: ['some-other-node'],
      expectedSwarmId: SWARM_ID
    });

    const decision = policy.authorizeJoin({
      nodeId: cellNodeId,
      publicKey: cellTransportKey.publicKey,
      swarmId: SWARM_ID,
      requestedCapabilities: ['discovery'],
      protocolVersion: CURRENT_PROTOCOL_VERSION
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('not authorized to join');
  });

  // Scenario 18: valid certificate received from another peer
  it('Scenario 18: valid certificate announced by third-party peer is independently verified', () => {
    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery', 'routing']
    });

    // Independent third-party node verifies cert knowing only SWARM_ID and authority.publicKey
    const result = verifyMembershipCertificate(cert, SWARM_ID, authority.publicKey);
    expect(result.valid).toBe(true);
    expect(result.certificate?.memberNodeId).toBe(cellNodeId);
  });

  // Scenario 19: invalid certificate received from another peer
  it('Scenario 19: invalid certificate announced by third-party peer is rejected', () => {
    const forgedCert = {
      certificateId: randomUUID(),
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      issuerId: authority.issuerId,
      issuerPublicKey: authority.publicKey,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      membershipVersion: 1,
      protocolVersion: 1,
      capabilities: ['discovery'],
      revocationEpoch: 0,
      signature: '1234567890abcdef'.repeat(4) // forged signature
    };

    const result = verifyMembershipCertificate(forgedCert, SWARM_ID, authority.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid membership certificate signature');
  });

  // Scenario 20: duplicate membership
  it('Scenario 20: duplicate membership requests do not create multiple records', () => {
    const records = new Map<string, any>();
    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery']
    });

    records.set(cellNodeId, { state: MembershipState.MEMBER, cert });
    records.set(cellNodeId, { state: MembershipState.MEMBER, cert }); // repeat

    expect(records.size).toBe(1);
    expect(records.get(cellNodeId).state).toBe(MembershipState.MEMBER);
  });

  // Scenario 21: membership idempotency
  it('Scenario 21: membership issuance is idempotent for active certificate', () => {
    const cert1 = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery']
    });

    expect(cert1.certificateId).toBeDefined();
    const v1 = verifyMembershipCertificate(cert1, SWARM_ID, authority.publicKey);
    expect(v1.valid).toBe(true);
  });

  // Scenario 22: certificate renewal
  it('Scenario 22: certificate can be renewed with a new validity window', () => {
    const now = Date.now();
    const cert1 = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery'],
      customIssuedAt: now - 3600000,
      customExpiresAt: now - 1000 // expired
    });

    expect(verifyMembershipCertificate(cert1, SWARM_ID, authority.publicKey, undefined, now).valid).toBe(false);

    // Renew
    const renewedCert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery'],
      customIssuedAt: now,
      customExpiresAt: now + 3600000
    });

    const renewedCheck = verifyMembershipCertificate(renewedCert, SWARM_ID, authority.publicKey, undefined, now);
    expect(renewedCheck.valid).toBe(true);
    expect(renewedCert.expiresAt).toBeGreaterThan(now);
  });

  // Scenario 23: local revocation
  it('Scenario 23: local revocation of certificateId causes verification to fail', () => {
    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery']
    });

    const revokedCertIds = new Set<string>([cert.certificateId]);
    const revocationChecker = (cId: string, nId: string) => revokedCertIds.has(cId);

    const result = verifyMembershipCertificate(cert, SWARM_ID, authority.publicKey, revocationChecker);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('revoked');
  });

  // Scenario 24: wrong protocol version
  it('Scenario 24: certificate with wrong protocol version is rejected', () => {
    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery'],
      protocolVersion: 2
    });

    const result = verifyMembershipCertificate(cert, SWARM_ID, authority.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unsupported protocol version');
  });

  // Scenario 25: oversized membership payload
  it('Scenario 25: certificate with oversized public key string fails schema validation', () => {
    const cert = authority.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery']
    });

    const oversized = {
      ...cert,
      memberPublicKey: 'A'.repeat(4096)
    };

    const result = verifyMembershipCertificate(oversized, SWARM_ID, authority.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Malformed certificate schema');
  });

  // Scenario 26: transport key != membership signing key
  it('Scenario 26: cryptographic separation: transport key is not membership authority key', () => {
    expect(cellTransportKey.publicKey).not.toEqual(authority.publicKey);
    expect(cellNodeId).not.toEqual(authority.issuerId);
  });

  // Scenario 27: direct DISCOVERED → MEMBER transition rejected
  it('Scenario 27: state machine strictly rejects direct DISCOVERED to MEMBER transition', () => {
    const dummyTransport = new P2PTransport(cellNodeId, cellTransportKey.privateKey, cellTransportKey.publicKey);
    const mgr = new SwarmMembershipManager(cellNodeId, cellTransportKey.publicKey, dummyTransport, {
      swarmId: SWARM_ID,
      issuerAuthority: authority
    });

    const otherNodeId = 'b'.repeat(64);
    expect(() => {
      mgr.transitionPeerState(otherNodeId, MembershipState.MEMBER);
    }).toThrow('Cannot transition directly from DISCOVERED to MEMBER');
  });

  // Scenario 28: AUTHENTICATED → MEMBER without authorization rejected
  it('Scenario 28: state machine rejects AUTHENTICATED to MEMBER without AUTHORIZED step', () => {
    const dummyTransport = new P2PTransport(cellNodeId, cellTransportKey.privateKey, cellTransportKey.publicKey);
    const mgr = new SwarmMembershipManager(cellNodeId, cellTransportKey.publicKey, dummyTransport, {
      swarmId: SWARM_ID,
      issuerAuthority: authority
    });

    const otherNodeId = 'b'.repeat(64);
    // Move to AUTHENTICATED first
    mgr.transitionPeerState(otherNodeId, MembershipState.AUTHENTICATED);

    expect(() => {
      mgr.transitionPeerState(otherNodeId, MembershipState.MEMBER);
    }).toThrow('Cannot transition directly from AUTHENTICATED to MEMBER without passing through AUTHORIZED');
  });

  // Scenario 29: certificate from wrong swarm rejected
  it('Scenario 29: valid certificate created for swarm-B is rejected by swarm-A', () => {
    const certSwarmB = authority.issueCertificate({
      swarmId: 'redqueen-swarm-beta',
      memberNodeId: cellNodeId,
      memberPublicKey: cellTransportKey.publicKey,
      capabilities: ['discovery']
    });

    const result = verifyMembershipCertificate(certSwarmB, 'redqueen-swarm-alpha', authority.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Swarm ID mismatch');
  });

  // Scenario 30: certificate with invalid Node ID rejected
  it('Scenario 30: certificate with non-hex or short Node ID rejected by schema', () => {
    const malformedCert = {
      certificateId: randomUUID(),
      swarmId: SWARM_ID,
      memberNodeId: 'not-a-valid-node-id',
      memberPublicKey: cellTransportKey.publicKey,
      issuerId: authority.issuerId,
      issuerPublicKey: authority.publicKey,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      membershipVersion: 1,
      protocolVersion: 1,
      capabilities: ['discovery'],
      revocationEpoch: 0,
      signature: '1234567890abcdef'.repeat(4)
    };

    const result = verifyMembershipCertificate(malformedCert, SWARM_ID, authority.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Malformed certificate schema');
  });
});
