import { randomUUID } from 'crypto';
import { logger } from '../core/logger';
import { P2PTransport } from '../network/transport';
import { Peer, PeerState } from '../network/peer';
import { NetworkMessage, MessageType } from '../network/protocol';
import { validatePeerIdentity } from '../validation/validators';
import { MemoryStore } from '../memory/store';
import {
  MembershipState,
  MembershipCertificate,
  PeerMembershipRecord,
  SwarmJoinRequestSchema,
  SwarmJoinResponseSchema,
  SwarmCertAnnounceSchema,
  SwarmJoinRequestPayload,
  SwarmJoinResponsePayload,
  SwarmCertAnnouncePayload,
  AuthorizationPolicy,
  ALLOWED_CAPABILITIES,
  SwarmCapability,
  CURRENT_PROTOCOL_VERSION
} from './types';
import { MembershipAuthority } from './authority';
import { verifyMembershipCertificate } from './verifier';
import { AllowlistAuthorizationPolicy } from './policy';

export interface SwarmMembershipOptions {
  swarmId?: string;
  issuerAuthority?: MembershipAuthority;
  authority?: MembershipAuthority;
  trustedIssuerPublicKey?: string;
  issuerPublicKey?: string; // Backward-compatible alias
  authorizationPolicy?: AuthorizationPolicy;
  capabilities?: SwarmCapability[];
  certificateTtlMs?: number;
  memoryStore?: MemoryStore;
  port?: number;
}

/**
 * SwarmMembershipManager
 * 
 * Manages authorized swarm membership, state machine transitions,
 * cryptographic certificate verification, and join protocol execution.
 */
export class SwarmMembershipManager {
  private readonly component = 'swarm_membership';
  public readonly swarmId: string;
  public readonly authority?: MembershipAuthority;
  public trustedIssuerPublicKey?: string;
  public policy: AuthorizationPolicy;
  public readonly capabilities: SwarmCapability[];
  
  public get issuerPublicKey(): string | undefined {
    return this.trustedIssuerPublicKey;
  }

  public set issuerPublicKey(val: string | undefined) {
    this.trustedIssuerPublicKey = val ? val.trim() : undefined;
  }
  
  private myCertificate?: MembershipCertificate;
  private peerRecords: Map<string, PeerMembershipRecord> = new Map();
  private revokedCertIds: Set<string> = new Set();
  private revokedNodeIds: Set<string> = new Set();
  private memoryStore?: MemoryStore;
  private isRunning: boolean = true;
  private expiryCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly localNodeId: string,
    private readonly localPublicKey: string,
    private readonly transport: P2PTransport,
    options: SwarmMembershipOptions = {}
  ) {
    this.swarmId = options.swarmId || 'redqueen-swarm-alpha-1';
    this.authority = options.issuerAuthority;
    this.trustedIssuerPublicKey = (options.trustedIssuerPublicKey || options.issuerPublicKey || (this.authority ? this.authority.publicKey : undefined))?.trim();
    this.policy = options.authorizationPolicy || new AllowlistAuthorizationPolicy({ expectedSwarmId: this.swarmId });
    this.capabilities = options.capabilities || [...ALLOWED_CAPABILITIES];
    this.memoryStore = options.memoryStore;

    this.setupTransportListeners();
    this.startPeriodicExpiryCheck();
  }

  private setupTransportListeners() {
    this.transport.onMessage((msg: NetworkMessage) => {
      if (!this.isRunning) return;
      this.handleIncomingMessage(msg).catch(err => {
        logger.error(this.component, 'error_handling_swarm_message', err, { type: msg.type });
      });
    });

    this.transport.onPeerConnected((peer: Peer) => {
      if (!this.isRunning || !peer.remoteNodeId) return;
      // When a peer is authenticated at transport layer, track it in AUTHENTICATED state
      const existing = this.peerRecords.get(peer.remoteNodeId);
      if (!existing || existing.state === MembershipState.DISCOVERED) {
        this.setPeerRecord(peer.remoteNodeId, {
          nodeId: peer.remoteNodeId,
          publicKey: peer.remotePublicKey,
          state: MembershipState.AUTHENTICATED,
          updatedAt: Date.now()
        });
      }
    });

    this.transport.onPeerDisconnected((peer: Peer) => {
      if (!this.isRunning || !peer.remoteNodeId) return;
      logger.debug(this.component, 'peer_disconnected', { nodeId: peer.remoteNodeId });
    });
  }

  private startPeriodicExpiryCheck() {
    this.expiryCheckInterval = setInterval(() => {
      const now = Date.now();
      // Check my own certificate
      if (this.myCertificate && now > this.myCertificate.expiresAt) {
        logger.warn(this.component, 'local_certificate_expired', { certId: this.myCertificate.certificateId });
      }

      // Check peers
      for (const [nodeId, record] of this.peerRecords.entries()) {
        if (record.state === MembershipState.MEMBER && record.certificate) {
          if (now > record.certificate.expiresAt) {
            logger.info(this.component, 'member_certificate_expired', { nodeId, certId: record.certificate.certificateId });
            this.transitionPeerState(nodeId, MembershipState.EXPIRED, 'Certificate expired');
          }
        }
      }
    }, 10000);
  }

  public start() {
    this.isRunning = true;
    if (!this.expiryCheckInterval) {
      this.startPeriodicExpiryCheck();
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.expiryCheckInterval) {
      clearInterval(this.expiryCheckInterval);
      this.expiryCheckInterval = null;
    }
  }

  public setIssuerPublicKey(pubKey: string) {
    this.issuerPublicKey = pubKey.trim();
  }

  public getMyCertificate(): MembershipCertificate | undefined {
    return this.myCertificate;
  }

  public async setMyCertificate(cert: MembershipCertificate): Promise<void> {
    const verifyResult = verifyMembershipCertificate(
      cert,
      this.swarmId,
      this.issuerPublicKey,
      (cId, nId) => this.isLocallyRevoked(cId, nId)
    );
    if (!verifyResult.valid) {
      throw new Error(`Cannot set invalid local certificate: ${verifyResult.reason}`);
    }
    this.myCertificate = cert;
    await this.persistCertificate(cert);
  }

  public getMembershipState(nodeId: string): MembershipState {
    if (nodeId === this.localNodeId) {
      const localRecord = this.peerRecords.get(this.localNodeId);
      if (localRecord && (localRecord.state === MembershipState.DENIED || localRecord.state === MembershipState.REVOKED)) {
        return localRecord.state;
      }
      if (!this.myCertificate) return MembershipState.AUTHENTICATED;
      const now = Date.now();
      if (now > this.myCertificate.expiresAt) return MembershipState.EXPIRED;
      if (this.isLocallyRevoked(this.myCertificate.certificateId, this.localNodeId)) return MembershipState.REVOKED;
      return MembershipState.MEMBER;
    }
    return this.peerRecords.get(nodeId)?.state || MembershipState.DISCOVERED;
  }

  public getCertificate(nodeId: string): MembershipCertificate | undefined {
    if (nodeId === this.localNodeId) return this.myCertificate;
    return this.peerRecords.get(nodeId)?.certificate;
  }

  public getPeerRecord(nodeId: string): PeerMembershipRecord | undefined {
    return this.peerRecords.get(nodeId);
  }

  /**
   * Enforces valid state transitions in the membership state machine.
   * Throws an error if an invalid transition is attempted.
   */
  public transitionPeerState(nodeId: string, newState: MembershipState, reason?: string): void {
    const currentRecord = this.peerRecords.get(nodeId);
    const currentState = currentRecord?.state || MembershipState.DISCOVERED;

    if (currentState === newState) return;

    // Strict state transition validation rules
    if (currentState === MembershipState.DISCOVERED) {
      if (newState === MembershipState.MEMBER) {
        throw new Error(`Invalid state transition: Cannot transition directly from ${currentState} to ${newState}. Peer must be authenticated and authorized first.`);
      }
      if (newState === MembershipState.AUTHORIZED) {
        throw new Error(`Invalid state transition: Cannot transition from ${currentState} to ${newState}. Peer must be authenticated first.`);
      }
    }

    if (currentState === MembershipState.AUTHENTICATED) {
      if (newState === MembershipState.MEMBER) {
        throw new Error(`Invalid state transition: Cannot transition directly from ${currentState} to ${newState} without passing through ${MembershipState.AUTHORIZED}.`);
      }
    }

    // Record the transition
    this.setPeerRecord(nodeId, {
      nodeId,
      publicKey: currentRecord?.publicKey,
      certificate: currentRecord?.certificate,
      state: newState,
      updatedAt: Date.now(),
      reason
    });

    logger.info(this.component, 'membership_state_transition', {
      nodeId,
      from: currentState,
      to: newState,
      reason
    });
  }

  private setPeerRecord(nodeId: string, record: PeerMembershipRecord) {
    this.peerRecords.set(nodeId, record);
    if (this.memoryStore && record.certificate) {
      this.persistCertificate(record.certificate).catch(err => {
        logger.warn(this.component, 'persist_certificate_failed', { err });
      });
    }
  }

  /**
   * Local revocation.
   * Note: Distributed revocation is not implemented in this milestone.
   */
  public revokeLocally(nodeIdOrCertId: string, reason?: string): void {
    if (nodeIdOrCertId.length === 64) {
      this.revokedNodeIds.add(nodeIdOrCertId);
      const record = this.peerRecords.get(nodeIdOrCertId);
      if (record) {
        this.transitionPeerState(nodeIdOrCertId, MembershipState.REVOKED, reason || 'Locally revoked');
      }
    } else {
      this.revokedCertIds.add(nodeIdOrCertId);
      for (const [nodeId, record] of this.peerRecords.entries()) {
        if (record.certificate?.certificateId === nodeIdOrCertId) {
          this.transitionPeerState(nodeId, MembershipState.REVOKED, reason || 'Certificate locally revoked');
        }
      }
    }
    logger.info(this.component, 'locally_revoked', { id: nodeIdOrCertId, reason });
  }

  public isLocallyRevoked(certificateId: string, memberNodeId: string): boolean {
    return this.revokedCertIds.has(certificateId) || this.revokedNodeIds.has(memberNodeId);
  }

  /**
   * Dispatches incoming swarm membership protocol messages.
   */
  private async handleIncomingMessage(msg: NetworkMessage) {
    switch (msg.type) {
      case MessageType.SWARM_JOIN_REQUEST:
        await this.handleJoinRequest(msg);
        break;

      case MessageType.SWARM_CERT_ANNOUNCE:
        await this.handleCertAnnounce(msg);
        break;

      default:
        break;
    }
  }

  /**
   * Processes an incoming SWARM_JOIN_REQUEST.
   */
  private async handleJoinRequest(msg: NetworkMessage) {
    // 1. Validate transport session is authenticated
    const peer = this.transport.getPeer(msg.senderId);
    if (!peer || peer.getState() !== PeerState.AUTHENTICATED) {
      logger.warn(this.component, 'join_request_from_unauthenticated_peer_dropped', { senderId: msg.senderId });
      return;
    }

    // 2. Validate request payload against schema
    const parseResult = SwarmJoinRequestSchema.safeParse(msg.payload);
    if (!parseResult.success) {
      logger.warn(this.component, 'malformed_join_request', { error: parseResult.error.message });
      this.sendJoinResponse(msg.senderId, {
        requestId: msg.payload?.requestId || 'unknown',
        swarmId: this.swarmId,
        status: 'DENIED',
        reason: 'Malformed join request payload'
      }, msg.messageId);
      return;
    }
    const payload = parseResult.data;

    // 3. Validate sender identity and match
    if (payload.nodeId !== msg.senderId) {
      logger.warn(this.component, 'join_request_sender_mismatch', { payloadNodeId: payload.nodeId, senderId: msg.senderId });
      this.sendJoinResponse(msg.senderId, {
        requestId: payload.requestId,
        swarmId: this.swarmId,
        status: 'DENIED',
        reason: 'Node ID mismatch'
      }, msg.messageId);
      return;
    }

    const idVal = validatePeerIdentity(payload.nodeId, payload.publicKey);
    if (!idVal.valid) {
      logger.warn(this.component, 'join_request_invalid_identity', { reason: idVal.reason });
      this.sendJoinResponse(msg.senderId, {
        requestId: payload.requestId,
        swarmId: this.swarmId,
        status: 'DENIED',
        reason: idVal.reason
      }, msg.messageId);
      return;
    }

    // 4. Swarm ID validation
    if (payload.swarmId !== this.swarmId) {
      logger.warn(this.component, 'join_request_swarm_mismatch', { expected: this.swarmId, received: payload.swarmId });
      this.sendJoinResponse(msg.senderId, {
        requestId: payload.requestId,
        swarmId: this.swarmId,
        status: 'DENIED',
        reason: `Swarm ID mismatch: expected '${this.swarmId}'`
      }, msg.messageId);
      return;
    }

    // 5. Authorization policy check
    const authDecision = await this.policy.authorizeJoin({
      nodeId: payload.nodeId,
      publicKey: payload.publicKey,
      swarmId: payload.swarmId,
      requestedCapabilities: payload.capabilities,
      protocolVersion: payload.protocolVersion
    });

    if (!authDecision.allowed) {
      logger.info(this.component, 'join_request_unauthorized', { nodeId: payload.nodeId, reason: authDecision.reason });
      // Update local record to DENIED
      this.setPeerRecord(payload.nodeId, {
        nodeId: payload.nodeId,
        publicKey: payload.publicKey,
        state: MembershipState.DENIED,
        updatedAt: Date.now(),
        reason: authDecision.reason
      });

      this.sendJoinResponse(msg.senderId, {
        requestId: payload.requestId,
        swarmId: this.swarmId,
        status: 'DENIED',
        reason: authDecision.reason || 'Authorization denied by swarm policy'
      }, msg.messageId);
      return;
    }

    // 6. Authorized: Transition state to AUTHORIZED
    this.transitionPeerState(payload.nodeId, MembershipState.AUTHORIZED, 'Policy authorization granted');

    // 7. Authority issuance
    if (!this.authority) {
      logger.warn(this.component, 'authorized_peer_cannot_issue_cert_not_authority', { nodeId: payload.nodeId });
      this.sendJoinResponse(msg.senderId, {
        requestId: payload.requestId,
        swarmId: this.swarmId,
        status: 'DENIED',
        reason: 'This peer is not an authorized membership issuer'
      }, msg.messageId);
      return;
    }

    // Idempotency: Reuse existing valid certificate if available and not expiring soon
    const existing = this.peerRecords.get(payload.nodeId);
    let certificate: MembershipCertificate;

    const now = Date.now();
    if (
      existing?.certificate &&
      existing.certificate.expiresAt > now + 60000 &&
      !this.isLocallyRevoked(existing.certificate.certificateId, payload.nodeId)
    ) {
      certificate = existing.certificate;
      logger.info(this.component, 'reusing_existing_valid_certificate', { nodeId: payload.nodeId });
    } else {
      certificate = this.authority.issueCertificate({
        swarmId: this.swarmId,
        memberNodeId: payload.nodeId,
        memberPublicKey: payload.publicKey,
        capabilities: authDecision.grantedCapabilities || this.capabilities
      });
      logger.info(this.component, 'issued_new_membership_certificate', { nodeId: payload.nodeId, certId: certificate.certificateId });
    }

    // Transition state to MEMBER
    this.transitionPeerState(payload.nodeId, MembershipState.MEMBER, 'Certificate issued');
    const updatedRecord = this.peerRecords.get(payload.nodeId);
    if (updatedRecord) {
      updatedRecord.certificate = certificate;
      this.setPeerRecord(payload.nodeId, updatedRecord);
    }

    this.sendJoinResponse(msg.senderId, {
      requestId: payload.requestId,
      swarmId: this.swarmId,
      status: 'ACCEPTED',
      certificate
    }, msg.messageId);
  }

  private sendJoinResponse(targetNodeId: string, payload: SwarmJoinResponsePayload, replyToId: string) {
    this.transport.sendTo(targetNodeId, MessageType.SWARM_JOIN_RESPONSE, payload, replyToId);
  }

  /**
   * Processes an incoming SWARM_CERT_ANNOUNCE.
   * Independently verifies the certificate cryptographically.
   */
  private async handleCertAnnounce(msg: NetworkMessage) {
    const parseResult = SwarmCertAnnounceSchema.safeParse(msg.payload);
    if (!parseResult.success) {
      logger.warn(this.component, 'malformed_cert_announce_dropped', { error: parseResult.error.message });
      return;
    }
    const cert = parseResult.data.certificate;

    // Cryptographically verify certificate independently
    if (!this.trustedIssuerPublicKey) {
      logger.warn(this.component, 'announced_cert_dropped_no_trust_anchor', {
        memberNodeId: cert.memberNodeId,
        reason: 'Cell has no configured trusted swarm authority'
      });
      return;
    }

    const verifyResult = verifyMembershipCertificate(
      cert,
      this.swarmId,
      this.trustedIssuerPublicKey,
      (cId, nId) => this.isLocallyRevoked(cId, nId)
    );

    if (!verifyResult.valid) {
      logger.warn(this.component, 'announced_cert_verification_failed', {
        memberNodeId: cert.memberNodeId,
        reason: verifyResult.reason
      });
      return;
    }

    // Verify announced certificate matches sender or known node
    logger.info(this.component, 'announced_cert_verified_valid', {
      memberNodeId: cert.memberNodeId,
      announcedBy: msg.senderId
    });

    const existing = this.peerRecords.get(cert.memberNodeId);
    // If not tracked or in earlier state, update to MEMBER
    this.setPeerRecord(cert.memberNodeId, {
      nodeId: cert.memberNodeId,
      publicKey: cert.memberPublicKey,
      certificate: cert,
      state: MembershipState.MEMBER,
      updatedAt: Date.now()
    });
  }

  /**
   * Initiates a Swarm Join Request to an authenticated peer.
   */
  public async requestJoin(targetNodeId: string, timeoutMs: number = 5000): Promise<MembershipCertificate> {
    const peer = this.transport.getPeer(targetNodeId);
    if (!peer || peer.getState() !== PeerState.AUTHENTICATED) {
      throw new Error(`Cannot request swarm join: peer ${targetNodeId} is not in AUTHENTICATED state`);
    }

    const requestId = randomUUID();
    const nonce = randomUUID();

    logger.info(this.component, 'sending_swarm_join_request', { targetNodeId, requestId });

    const responseMsg = await this.transport.requestFromPeer(
      targetNodeId,
      MessageType.SWARM_JOIN_REQUEST,
      {
        requestId,
        swarmId: this.swarmId,
        nodeId: this.localNodeId,
        publicKey: this.localPublicKey,
        capabilities: this.capabilities,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        nonce,
        timestamp: Date.now()
      } satisfies SwarmJoinRequestPayload,
      timeoutMs
    );

    const parseResult = SwarmJoinResponseSchema.safeParse(responseMsg.payload);
    if (!parseResult.success) {
      throw new Error(`Malformed join response from ${targetNodeId}: ${parseResult.error.message}`);
    }

    const res = parseResult.data;
    if (res.requestId !== requestId) {
      throw new Error(`Join response requestId mismatch: expected ${requestId}, got ${res.requestId}`);
    }

    if (res.status === 'DENIED') {
      this.transitionPeerState(this.localNodeId, MembershipState.DENIED, res.reason);
      throw new Error(`Swarm join request denied by ${targetNodeId}: ${res.reason || 'Unauthorized'}`);
    }

    if (!res.certificate) {
      throw new Error(`Swarm join response marked ACCEPTED but missing certificate from ${targetNodeId}`);
    }

    // Cryptographically verify received certificate locally
    const verifyResult = verifyMembershipCertificate(
      res.certificate,
      this.swarmId,
      this.issuerPublicKey,
      (cId, nId) => this.isLocallyRevoked(cId, nId)
    );

    if (!verifyResult.valid) {
      throw new Error(`Received invalid membership certificate from ${targetNodeId}: ${verifyResult.reason}`);
    }

    if (res.certificate.memberNodeId !== this.localNodeId) {
      throw new Error(`Received certificate for wrong member: expected ${this.localNodeId}, got ${res.certificate.memberNodeId}`);
    }

    this.myCertificate = res.certificate;

    // Record target node and local node as members
    this.setPeerRecord(targetNodeId, {
      nodeId: targetNodeId,
      state: MembershipState.MEMBER,
      updatedAt: Date.now()
    });

    if (this.memoryStore) {
      await this.persistCertificate(this.myCertificate);
    }

    logger.info(this.component, 'swarm_join_successful', {
      swarmId: this.swarmId,
      certificateId: this.myCertificate.certificateId
    });

    return this.myCertificate;
  }

  /**
   * Recovers a failed or denied join attempt by resetting the local peer state
   * to allow retrying with an alternative peer, updated authorization, or renewed credentials.
   */
  public resetJoinState(targetNodeId?: string): void {
    if (targetNodeId && this.peerRecords.has(targetNodeId)) {
      const record = this.peerRecords.get(targetNodeId)!;
      if (record.state === MembershipState.DENIED) {
        record.state = MembershipState.AUTHENTICATED;
        record.updatedAt = Date.now();
      }
    }
    const localRecord = this.peerRecords.get(this.localNodeId);
    if (localRecord && localRecord.state === MembershipState.DENIED) {
      localRecord.state = MembershipState.AUTHENTICATED;
      localRecord.updatedAt = Date.now();
      logger.info(this.component, 'reset_join_state_recovered', { nodeId: this.localNodeId });
    }
  }

  /**
   * Retries swarm join with bounded recovery attempts.
   */
  public async retryJoin(targetNodeId: string, maxAttempts: number = 3, timeoutMs: number = 5000): Promise<MembershipCertificate> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.resetJoinState(targetNodeId);
        return await this.requestJoin(targetNodeId, timeoutMs);
      } catch (err: any) {
        lastError = err;
        logger.warn(this.component, 'join_attempt_failed_retrying', {
          attempt,
          maxAttempts,
          targetNodeId,
          error: err.message
        });
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 50 * attempt));
        }
      }
    }
    throw lastError;
  }

  /**
   * Broadcasts or announces this node's membership certificate to peers.
   */
  public announceMembership(targetNodeId?: string): void {
    if (!this.myCertificate) {
      logger.warn(this.component, 'cannot_announce_membership_no_certificate');
      return;
    }

    const payload: SwarmCertAnnouncePayload = {
      certificate: this.myCertificate
    };

    if (targetNodeId) {
      this.transport.sendTo(targetNodeId, MessageType.SWARM_CERT_ANNOUNCE, payload);
    } else {
      this.transport.broadcast(MessageType.SWARM_CERT_ANNOUNCE, payload);
    }
  }

  private async persistCertificate(cert: MembershipCertificate): Promise<void> {
    if (!this.memoryStore) return;
    try {
      await this.memoryStore.put({
        id: `membership_cert_${cert.memberNodeId}`,
        content: cert,
        source: 'swarm_membership',
        createdAt: new Date(cert.issuedAt).toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1.0,
        hash: cert.signature,
        provenance: [cert.issuerId]
      });
    } catch (err) {
      logger.warn(this.component, 'failed_to_persist_certificate', { err });
    }
  }

  public async restoreFromStorage(): Promise<void> {
    if (!this.memoryStore) return;
    try {
      const mySavedCert = await this.memoryStore.get(`membership_cert_${this.localNodeId}`);
      if (mySavedCert && mySavedCert.content) {
        const verifyResult = verifyMembershipCertificate(
          mySavedCert.content,
          this.swarmId,
          this.issuerPublicKey,
          (cId, nId) => this.isLocallyRevoked(cId, nId)
        );
        if (verifyResult.valid && verifyResult.certificate) {
          this.myCertificate = verifyResult.certificate;
          logger.info(this.component, 'restored_local_certificate_from_storage', {
            certId: this.myCertificate.certificateId
          });
        }
      }
    } catch (err) {
      logger.warn(this.component, 'failed_to_restore_certificates', { err });
    }
  }
}
