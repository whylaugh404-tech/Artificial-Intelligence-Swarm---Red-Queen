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
  private remoteNodeId?: string;
  private remotePublicKey?: string;
  private pendingChallenge?: string;

  constructor(
    private readonly socket: WebSocket,
    private readonly localNodeId: string,
    private readonly localPrivateKey: string,
    private readonly localPublicKey: string
  ) {
    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on('message', (data) => {
      try {
        const raw = JSON.parse(data.toString());
        const msg = MessageSchema.parse(raw);
        this.handleMessage(msg);
      } catch (err: any) {
        logger.warn(this.component, 'invalid_message', { error: err.message });
      }
    });

    this.socket.on('close', () => {
      this.state = PeerState.DISCONNECTED;
      logger.info(this.component, 'peer_disconnected', { remoteId: this.remoteNodeId });
    });
  }

  private send(msg: NetworkMessage) {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  initiateHandshake() {
    const msg = createMessage(MessageType.HELLO, this.localNodeId, { publicKey: this.localPublicKey }, this.localPrivateKey);
    this.send(msg);
  }

  private handleMessage(msg: NetworkMessage) {
    logger.debug(this.component, 'message_received', { type: msg.type, senderId: msg.senderId });

    switch (this.state) {
      case PeerState.NEW:
        if (msg.type === MessageType.HELLO) {
          this.remotePublicKey = msg.payload.publicKey;
          const expectedNodeId = identityCrypto.deriveNodeId(this.remotePublicKey!);
          
          if (expectedNodeId !== msg.senderId) {
            logger.warn(this.component, 'nodeid_mismatch', { expected: expectedNodeId, actual: msg.senderId });
            this.socket.close();
            return;
          }

          if (!verifyMessageSignature(msg, this.remotePublicKey!)) {
            logger.warn(this.component, 'signature_invalid', { senderId: msg.senderId });
            this.socket.close();
            return;
          }

          this.remoteNodeId = msg.senderId;
          this.pendingChallenge = randomUUID();
          this.state = PeerState.CHALLENGING;

          const challengeMsg = createMessage(MessageType.CHALLENGE, this.localNodeId, { challenge: this.pendingChallenge }, this.localPrivateKey);
          this.send(challengeMsg);
        }
        break;

      case PeerState.CHALLENGING:
        if (msg.type === MessageType.AUTH) {
          if (!verifyMessageSignature(msg, this.remotePublicKey!)) {
            this.socket.close();
            return;
          }
          if (msg.payload.response !== this.pendingChallenge) {
            logger.warn(this.component, 'challenge_failed');
            this.socket.close();
            return;
          }

          this.state = PeerState.AUTHENTICATED;
          logger.info(this.component, 'peer_authenticated', { remoteId: this.remoteNodeId });
        }
        break;

      case PeerState.AUTHENTICATED:
        if (!verifyMessageSignature(msg, this.remotePublicKey!)) {
          logger.warn(this.component, 'signature_invalid', { senderId: msg.senderId });
          return;
        }
        // Handle normal messages (PING, PONG, DHT queries, etc.)
        if (msg.type === MessageType.PING) {
          const pong = createMessage(MessageType.PONG, this.localNodeId, {}, this.localPrivateKey);
          this.send(pong);
        }
        break;
    }
  }
}
