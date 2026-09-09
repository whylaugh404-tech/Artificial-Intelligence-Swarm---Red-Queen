import { WebSocket } from 'ws';
import { logger } from '../core/logger';
import { NetworkMessage, MessageType, createMessage, verifyMessageSignature, MessageSchema } from './protocol';
import { identityCrypto } from '../crypto/identity';
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
  private pendingChallenge?: string;
  
  public lastSeen: number = Date.now();

  constructor(
    public readonly socket: WebSocket,
    private readonly localNodeId: string,
    private readonly localPrivateKey: string,
    public readonly localPublicKey: string,
    private readonly isInitiator: boolean,
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
    this.socket.on('message', (data) => {
      try {
        const raw = JSON.parse(data.toString());
        const msg = MessageSchema.parse(raw);
        this.lastSeen = Date.now();
        this.handleMessage(msg);
      } catch (err: any) {
        logger.warn(this.component, 'invalid_message_dropped', { error: err.message }); this.disconnect();
      }
    });

    this.socket.on('close', () => {
      this.state = PeerState.DISCONNECTED;
      logger.info(this.component, 'peer_disconnected', { remoteId: this.remoteNodeId });
      this.onDisconnected(this);
    });
    
    this.socket.on('error', (err) => {
      logger.error(this.component, 'peer_socket_error', err, { remoteId: this.remoteNodeId });
      logger.warn(this.component, "disconnecting", { reason: new Error().stack }); this.disconnect();
    });
  }

  public send(msgType: MessageType, payload: any) {
    if (this.state !== PeerState.AUTHENTICATED && 
        msgType !== MessageType.HELLO && 
        msgType !== MessageType.CHALLENGE && 
        msgType !== MessageType.AUTH) {
      throw new Error('Cannot send application messages before authentication');
    }
    
    if (this.socket.readyState === WebSocket.OPEN) {
      const msg = createMessage(msgType, this.localNodeId, payload, this.localPrivateKey);
      this.socket.send(JSON.stringify(msg));
    }
  }

  public disconnect() {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.terminate();
    }
    this.state = PeerState.DISCONNECTED;
  }

  private initiateHandshake() {
    this.send(MessageType.HELLO, { publicKey: this.localPublicKey }); this.state = PeerState.CHALLENGING;
  }

  private handleMessage(msg: NetworkMessage) {
    logger.debug(this.component, 'message_received', { type: msg.type, senderId: msg.senderId });

    switch (this.state) {
      case PeerState.NEW:
        if (msg.type === MessageType.HELLO) {
          this.remotePublicKey = msg.payload.publicKey;
          if (!this.remotePublicKey) {
            logger.warn(this.component, "disconnecting", { reason: new Error().stack }); this.disconnect();
            return;
          }
          const expectedNodeId = identityCrypto.deriveNodeId(this.remotePublicKey);
          
          if (expectedNodeId !== msg.senderId) {
            logger.warn(this.component, 'nodeid_mismatch', { expected: expectedNodeId, actual: msg.senderId });
            logger.warn(this.component, "disconnecting", { reason: new Error().stack }); this.disconnect();
            return;
          }

          if (!verifyMessageSignature(msg, this.remotePublicKey)) {
            logger.warn(this.component, 'signature_invalid_on_hello', { senderId: msg.senderId });
            logger.warn(this.component, "disconnecting", { reason: new Error().stack }); this.disconnect();
            return;
          }

          this.remoteNodeId = msg.senderId;
          this.pendingChallenge = randomUUID();
          this.state = PeerState.CHALLENGING;
          
          this.send(MessageType.CHALLENGE, { 
            challenge: this.pendingChallenge,
            publicKey: this.localPublicKey 
          });
        } else {
           // Not a hello, drop
           logger.warn(this.component, "disconnecting", { reason: new Error().stack }); this.disconnect();
        }
        break;

      case PeerState.CHALLENGING:
        if (msg.type === MessageType.CHALLENGE && this.isInitiator) {
           this.remotePublicKey = msg.payload.publicKey;
           if (!this.remotePublicKey) { 
               logger.warn(this.component, "disconnecting", { reason: new Error().stack }); this.disconnect(); 
               return; 
           }
           this.remoteNodeId = msg.senderId;
           
           if (!verifyMessageSignature(msg, this.remotePublicKey)) { 
               logger.warn(this.component, "disconnecting", { reason: new Error().stack }); this.disconnect(); 
               return; 
           }
           
           this.send(MessageType.AUTH, { response: msg.payload.challenge });
           
           // Initiator considers itself authenticated after sending AUTH
           this.state = PeerState.AUTHENTICATED;
           this.onAuthenticated(this);
           logger.info(this.component, 'peer_authenticated_initiator', { remoteId: this.remoteNodeId });
        }
        else if (msg.type === MessageType.AUTH && !this.isInitiator) {
          if (!this.remotePublicKey || !verifyMessageSignature(msg, this.remotePublicKey)) {
            logger.warn(this.component, "disconnecting", { reason: new Error().stack }); this.disconnect();
            return;
          }
          
           const expectedNodeId = identityCrypto.deriveNodeId(this.remotePublicKey);
           if (expectedNodeId !== msg.senderId) {
             logger.warn(this.component, "nodeid_mismatch", { expected: expectedNodeId, actual: msg.senderId });
             logger.warn(this.component, "disconnecting", { reason: new Error().stack }); this.disconnect();
             return;
           }
          if (msg.payload.response !== this.pendingChallenge) {
            logger.warn(this.component, 'challenge_failed');
            logger.warn(this.component, "disconnecting", { reason: new Error().stack }); this.disconnect();
            return;
          }
          
          this.state = PeerState.AUTHENTICATED;
          logger.info(this.component, 'peer_authenticated_receiver', { remoteId: this.remoteNodeId });
          this.onAuthenticated(this);
        } else {
            logger.warn(this.component, "disconnecting", { reason: new Error().stack }); this.disconnect();
        }
        break;

      case PeerState.AUTHENTICATED:
        if (!this.remotePublicKey || !verifyMessageSignature(msg, this.remotePublicKey)) {
          logger.warn(this.component, 'signature_invalid', { senderId: msg.senderId });
          return;
        }

        if (msg.senderId !== this.remoteNodeId) {
          logger.warn(this.component, 'spoofed_sender_id', { expected: this.remoteNodeId, actual: msg.senderId });
          return;
        }

        if (msg.type === MessageType.PING) {
          this.send(MessageType.PONG, {});
        } else if (msg.type === MessageType.PONG) {
          // Handled, lastSeen updated
        } else {
          // Deliver to transport layer
          this.onMessage(msg, this);
        }
        break;
    }
  }
  
  public getState() {
    return this.state;
  }
}
