import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { MembershipAuthority } from '../src/redqueen/swarm/authority';
import { verifyMembershipCertificate } from '../src/redqueen/swarm/verifier';
import { SwarmMembershipManager } from '../src/redqueen/swarm/membership';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import { P2PTransport } from '../src/redqueen/network/transport';
import { CURRENT_PROTOCOL_VERSION, CURRENT_MEMBERSHIP_VERSION } from '../src/redqueen/swarm/types';

describe('P2.1: Swarm Membership Hardening & Trust Anchor Invariants', () => {
  const TEST_PRIV_PATH = './data/test_auth_priv.pem';
  const TEST_PUB_PATH = './data/test_auth_pub.pem';

  const SWARM_ID = 'redqueen-swarm-hardened-1';

  beforeEach(async () => {
    try { await fs.unlink(TEST_PRIV_PATH); } catch {}
    try { await fs.unlink(TEST_PUB_PATH); } catch {}
  });

  afterEach(async () => {
    try { await fs.unlink(TEST_PRIV_PATH); } catch {}
    try { await fs.unlink(TEST_PUB_PATH); } catch {}
  });

  it('33. persists MembershipAuthority keypair to files and reloads with identical identity', async () => {
    const originalAuth = new MembershipAuthority();
    await originalAuth.saveToFiles(TEST_PRIV_PATH, TEST_PUB_PATH);

    // Verify files were written
    const privContent = await fs.readFile(TEST_PRIV_PATH, 'utf8');
    const pubContent = await fs.readFile(TEST_PUB_PATH, 'utf8');
    expect(privContent).toContain('BEGIN PRIVATE KEY');
    expect(pubContent).toContain('BEGIN PUBLIC KEY');

    // Reload authority from files
    const reloadedAuth = await MembershipAuthority.fromFiles(TEST_PRIV_PATH, TEST_PUB_PATH);
    expect(reloadedAuth.issuerId).toBe(originalAuth.issuerId);
    expect(reloadedAuth.publicKey).toBe(originalAuth.publicKey);

    // Issue certificate with reloaded authority and verify signature validity
    const member = identityCrypto.generateKeyPair();
    const memberNodeId = identityCrypto.deriveNodeId(member.publicKey);

    const cert = reloadedAuth.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId,
      memberPublicKey: member.publicKey,
      capabilities: ['discovery', 'memory']
    });

    const verifyResult = verifyMembershipCertificate(cert, SWARM_ID, originalAuth.publicKey);
    expect(verifyResult.valid).toBe(true);
  });

  it('34. MembershipAuthority strictly conceals private key during serialization', () => {
    const auth = new MembershipAuthority();
    const serialized = JSON.stringify(auth);

    expect(serialized).toContain(auth.issuerId);
    expect(JSON.parse(serialized).publicKey).toBe(auth.publicKey);
    expect(serialized).not.toContain('PRIVATE KEY');
    expect((auth as any).privateKey).toBeDefined(); // internal property
    expect(Object.keys(auth)).not.toContain('privateKey'); // non-enumerable
  });

  it('35. rejects certificate issued by an untrusted issuer when trustedIssuerPublicKey is configured', () => {
    const trustedAuth = new MembershipAuthority();
    const untrustedRogueAuth = new MembershipAuthority();

    const member = identityCrypto.generateKeyPair();
    const memberNodeId = identityCrypto.deriveNodeId(member.publicKey);

    // Rogue authority issues a certificate
    const rogueCert = untrustedRogueAuth.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId,
      memberPublicKey: member.publicKey,
      capabilities: ['discovery']
    });

    // Verification against configured trusted anchor MUST fail
    const verifyResult = verifyMembershipCertificate(rogueCert, SWARM_ID, trustedAuth.publicKey);
    expect(verifyResult.valid).toBe(false);
    expect(verifyResult.reason).toContain('Certificate was signed by an untrusted issuer key');
  });

  it('36. prevents replacement or overwriting of configured trust anchor in SwarmMembershipManager', async () => {
    const trustedAuth = new MembershipAuthority();
    const rogueAuth = new MembershipAuthority();

    const localKp = identityCrypto.generateKeyPair();
    const localNodeId = identityCrypto.deriveNodeId(localKp.publicKey);
    const transport = new P2PTransport(localNodeId, localKp.privateKey, localKp.publicKey);

    const manager = new SwarmMembershipManager(localNodeId, localKp.publicKey, transport, {
      swarmId: SWARM_ID,
      trustedIssuerPublicKey: trustedAuth.publicKey
    });

    expect(manager.trustedIssuerPublicKey).toBe(trustedAuth.publicKey);

    // Try to set local certificate signed by rogue authority
    const rogueCert = rogueAuth.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: localNodeId,
      memberPublicKey: localKp.publicKey,
      capabilities: ['discovery']
    });

    await expect(manager.setMyCertificate(rogueCert)).rejects.toThrow(
      /Certificate was signed by an untrusted issuer key/
    );

    // Ensure configured trust anchor remained intact
    expect(manager.trustedIssuerPublicKey).toBe(trustedAuth.publicKey);
  });

  it('37. binds and verifies cryptographic binding between memberNodeId and memberPublicKey', () => {
    const auth = new MembershipAuthority();
    const legitMember = identityCrypto.generateKeyPair();
    const legitNodeId = identityCrypto.deriveNodeId(legitMember.publicKey);

    const cert = auth.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId: legitNodeId,
      memberPublicKey: legitMember.publicKey,
      capabilities: ['discovery']
    });

    // Forge memberNodeId to another value
    const forgedCert = {
      ...cert,
      memberNodeId: '0000000000000000000000000000000000000000000000000000000000000000'
    };

    const result = verifyMembershipCertificate(forgedCert, SWARM_ID, auth.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Node ID mismatch');
  });

  it('38. binds and verifies cryptographic binding between issuerId and issuerPublicKey', () => {
    const auth = new MembershipAuthority();
    const member = identityCrypto.generateKeyPair();
    const memberNodeId = identityCrypto.deriveNodeId(member.publicKey);

    const cert = auth.issueCertificate({
      swarmId: SWARM_ID,
      memberNodeId,
      memberPublicKey: member.publicKey,
      capabilities: ['discovery']
    });

    // Forge issuerId
    const forgedCert = {
      ...cert,
      issuerId: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    };

    const result = verifyMembershipCertificate(forgedCert, SWARM_ID, auth.publicKey);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Node ID mismatch');
  });
});
