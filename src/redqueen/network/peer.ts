import { WebSocket } from 'ws';
import { logger } from '../core/logger';
import { NetworkMessage, MessageType, createMessage, verifyMessageSignature, MessageSchema } from './protocol';
import { identityCrypto } from '../crypto/identity';
import { isValidNodeId, validateEndpoint, MAX_MESSAGE_BYTES } from '../validation/validators';
import { randomUUID } from 'crypto';

export enum PeerState {
  NEW = 'NEW',
  CHALLENGING = 'CHALLENGING',
  AUTHENTICATED = 'AUTHENTICATED',
  DISCONNECTED = 'DISCONNECTED'
}

export class Peer {
  private readonly component = 'peer';
  private state: PeerState = PeerState.NEW;
  public remoteNodeId?: string;
  public remotePublicKey?: string;
  public remoteEndpoint?: string;
  private pendingChallenge?: string;
  
  public lastSeen: number = Date.now();

  constructor(
    public readonly socket: WebSocket,
    private readonly localNodeId: string,
    private readonly localPrivateKey: string,
    public readonly localPublicKey: string,
    public readonly isInitiator: boolean,
    private readonly localEndpoint: string | undefined,
    private readonly onAuthenticated: (peer: Peer) => void,
    private readonly onMessage: (msg: NetworkMessage, peer: Peer) => void,
    private readonly onDisconnected: (peer: Peer) => void
  ) {
    this.setupListeners();
    
    if (this.isInitiator) {
      this.initiateHandshake();
    }
  }

  private setupListeners() {
    this.socket.on('message', (data: any) => {
      // 1. Message size check to prevent memory exhaustion / DoS
      const byteLength = Buffer.isBuffer(data) ? data.length : typeof data === 'string' ? Buffer.byteLength(data) : 0;
      if (byteLength > MAX_MESSAGE_BYTES) {
        logger.warn(this.component, 'oversized_message_dropped', { byteLength, max: MAX_MESSAGE_BYTES });
        this.disconnect();
        return;
      }

      try {
        const raw = JSON.parse(data.toString());
        const msg = MessageSchema.parse(raw);
        
        // 2. Validate senderId format
        if (!isValidNodeId(msg.senderId)) {
          logger.warn(this.component, 'malformed_sender_id_dropped', { senderId: msg.senderId });
          this.disconnect();
          return;
        }

        // 3. Reject self connection
        if (msg.senderId === this.localNodeId) {
          logger.warn(this.component, 'self_connection_rejected', { senderId: msg.senderId });
          this.disconnect();
          return;
        }

        this.handleMessage(msg);
      } catch (err: any) {
        logger.warn(this.component, 'invalid_message_dropped', { error: err.message });
        this.disconnect();
      }
    });

    this.socket.on('close', () => {
      this.state = PeerState.DISCONNECTED;
      logger.info(this.component, 'peer_disconnected', { remoteId: this.remoteNodeId });
      this.onDisconnected(this);
    });
    
    this.socket.on('error', (err) => {
      logger.error(this.component, 'peer_socket_error', err, { remoteId: this.remoteNodeId });
      this.disconnect();
    });
  }

  public send(msgType: MessageType, payload: any, replyToId?: string): NetworkMessage {
    if (this.state !== PeerState.AUTHENTICATED && 
        msgType !== MessageType.HELLO && 
        msgType !== MessageType.CHALLENGE && 
        msgType !== MessageType.AUTH) {
      throw new Error('Cannot send application messages before authentication');
    }
    
    if (this.socket.readyState === WebSocket.OPEN) {
      const msg = createMessage(msgType, this.localNodeId, payload, this.localPrivateKey, replyToId);
      this.socket.send(JSON.stringify(msg));
      return msg;
    }
    throw new Error('Socket not open');
  }

  public disconnect() {
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      try {
        this.socket.terminate();
      } catch (err) {
        // ignore error during terminate
      }
    }
    this.state = PeerState.DISCONNECTED;
  }

  private initiateHandshake() {
    this.send(MessageType.HELLO, { publicKey: this.localPublicKey, endpoint: this.localEndpoint });
    this.state = PeerState.CHALLENGING;
  }

  private handleMessage(msg: NetworkMessage) {
    logger.debug(this.component, 'message_received', { type: msg.type, senderId: msg.senderId });

    switch (this.state) {
      case PeerState.NEW:
        if (msg.type === MessageType.HELLO) {
          const pubKey = msg.payload?.publicKey;
          if (!pubKey || !identityCrypto.isValidPublicKey(pubKey)) {
            logger.warn(this.component, 'invalid_public_key_on_hello');
            this.disconnect();
            return;
          }

          const expectedNodeId = identityCrypto.deriveNodeId(pubKey);
          if (expectedNodeId !== msg.senderId) {
            logger.warn(this.component, 'nodeid_mismatch_on_hello', { expected: expectedNodeId, actual: msg.senderId });
            this.disconnect();
            return;
          }

          if (!verifyMessageSignature(msg, pubKey)) {
            logger.warn(this.component, 'signature_invalid_on_hello', { senderId: msg.senderId });
            this.disconnect();
            return;
          }

          // Validate endpoint if provided
          if (msg.payload?.endpoint) {
            const epCheck = validateEndpoint(msg.payload.endpoint);
            if (epCheck.valid) {
              this.remoteEndpoint = epCheck.normalizedUrl;
            } else {
              logger.warn(this.component, 'invalid_endpoint_in_hello_ignored', { reason: epCheck.reason });
            }
          }

          this.remotePublicKey = pubKey;
          this.remoteNodeId = msg.senderId;
          this.lastSeen = Date.now();
          this.pendingChallenge = randomUUID();
          this.state = PeerState.CHALLENGING;
          
          this.send(MessageType.CHALLENGE, { 
            challenge: this.pendingChallenge,
            publicKey: this.localPublicKey,
            endpoint: this.localEndpoint
          });
        } else {
          logger.warn(this.component, 'unexpected_message_in_new_state', { type: msg.type });
          this.disconnect();
        }
        break;

      case PeerState.CHALLENGING:
        if (msg.type === MessageType.CHALLENGE && this.isInitiator) {
          const pubKey = msg.payload?.publicKey;
          if (!pubKey || !identityCrypto.isValidPublicKey(pubKey)) { 
            logger.warn(this.component, 'invalid_public_key_on_challenge');
            this.disconnect(); 
            return; 
          }

          const expectedNodeId = identityCrypto.deriveNodeId(pubKey);
          if (expectedNodeId !== msg.senderId) {
            logger.warn(this.component, 'nodeid_mismatch_on_challenge', { expected: expectedNodeId, actual: msg.senderId });
            this.disconnect();
            return;
          }

          if (!verifyMessageSignature(msg, pubKey)) { 
            logger.warn(this.component, 'signature_invalid_on_challenge');
            this.disconnect(); 
            return; 
          }

          if (!msg.payload?.challenge || typeof msg.payload.challenge !== 'string') {
            logger.warn(this.component, 'missing_challenge_token');
            this.disconnect();
            return;
          }

          if (msg.payload?.endpoint) {
            const epCheck = validateEndpoint(msg.payload.endpoint);
            if (epCheck.valid) {
              this.remoteEndpoint = epCheck.normalizedUrl;
            }
          }

          this.remotePublicKey = pubKey;
          this.remoteNodeId = msg.senderId;
          this.lastSeen = Date.now();
          
          this.send(MessageType.AUTH, { response: msg.payload.challenge });
          
          this.state = PeerState.AUTHENTICATED;
          this.onAuthenticated(this);
          logger.info(this.component, 'peer_authenticated_initiator', { remoteId: this.remoteNodeId });
        }
        else if (msg.type === MessageType.AUTH && !this.isInitiator) {
          if (!this.remotePublicKey || !verifyMessageSignature(msg, this.remotePublicKey)) {
            logger.warn(this.component, 'signature_invalid_on_auth');
            this.disconnect();
            return;
          }
          
          if (!msg.payload?.response || msg.payload.response !== this.pendingChallenge) {
            logger.warn(this.component, 'challenge_failed');
            this.disconnect();
            return;
          }
          
          this.lastSeen = Date.now();
          this.state = PeerState.AUTHENTICATED;
          logger.info(this.component, 'peer_authenticated_receiver', { remoteId: this.remoteNodeId });
          this.onAuthenticated(this);
        } else {
          logger.warn(this.component, 'unexpected_message_in_challenging_state', { type: msg.type });
          this.disconnect();
        }
        break;

      case PeerState.AUTHENTICATED:
        if (!this.remotePublicKey || !verifyMessageSignature(msg, this.remotePublicKey)) {
          logger.warn(this.component, 'signature_invalid_authenticated_state', { senderId: msg.senderId });
          return;
        }

        if (msg.senderId !== this.remoteNodeId) {
          logger.warn(this.component, 'spoofed_sender_id', { expected: this.remoteNodeId, actual: msg.senderId });
          return;
        }

        // Message is genuine and from the authenticated remote node
        this.lastSeen = Date.now();

        if (msg.type === MessageType.PING) {
          this.send(MessageType.PONG, {});
        } else if (msg.type === MessageType.PONG) {
          // Handled, lastSeen already updated above
        } else {
          this.onMessage(msg, this);
        }
        break;
    }
  }
  
  public getState() {
    return this.state;
  }
}
