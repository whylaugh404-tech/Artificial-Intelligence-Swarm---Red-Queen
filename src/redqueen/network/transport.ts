import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../core/logger';
import { Peer, PeerState } from './peer';
import { NetworkMessage, MessageType, ReplayCache } from './protocol';
import { validateEndpoint } from '../validation/validators';
import { randomUUID } from 'crypto';

/**
 * Hardened P2P WebSocket Transport managing authenticated Peer instances.
 */
export class P2PTransport {
  private wss: WebSocketServer | null = null;
  private readonly component = 'p2p_transport';
  private peers: Map<string, Peer> = new Map();
  private replayCache = new ReplayCache();
  public publicEndpoint?: string;
  private connectingEndpoints = new Set<string>();
  private activePendingTimers = new Set<NodeJS.Timeout>();

  private messageListeners: ((msg: NetworkMessage) => void)[] = [];
  private peerConnectedListeners: ((peer: Peer) => void)[] = [];
  private peerDisconnectedListeners: ((peer: Peer) => void)[] = [];
  private pendingRequestListeners = new Set<(msg: NetworkMessage) => void>();

  constructor(
    private readonly localNodeId: string,
    private readonly privateKey: string,
    private readonly publicKey: string
  ) {}

  setEndpoint(url: string) {
    const val = validateEndpoint(url);
    if (!val.valid) {
      throw new Error(`Invalid endpoint provided to setEndpoint: ${val.reason}`);
    }
    this.publicEndpoint = val.normalizedUrl;
  }

  async startServer(port: number): Promise<void> {
    if (this.wss) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port });
        
        this.wss.on('connection', (ws: WebSocket, req) => {
          const ip = req.socket.remoteAddress;
          logger.info(this.component, 'inbound_connection', { ip });
          this.setupPeer(ws, false);
        });

        this.wss.on('listening', () => {
          logger.info(this.component, 'server_listening', { port });
          resolve();
        });

        this.wss.on('error', (err) => {
          logger.error(this.component, 'server_error', err);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async connectToPeer(url: string): Promise<void> {
    // 1. Validate endpoint
    const val = validateEndpoint(url);
    if (!val.valid) {
      logger.warn(this.component, 'connect_rejected_invalid_endpoint', { url, reason: val.reason });
      throw new Error(`Invalid endpoint: ${val.reason}`);
    }
    const targetUrl = val.normalizedUrl!;

    // 2. Prevent connecting to self
    if (this.publicEndpoint && this.publicEndpoint === targetUrl) {
      logger.warn(this.component, 'cannot_connect_to_own_endpoint', { targetUrl });
      throw new Error('Cannot connect to self endpoint');
    }

    // 3. Check if already connected to a peer with this endpoint
    for (const peer of this.peers.values()) {
      if (peer.getState() === PeerState.AUTHENTICATED && peer.remoteEndpoint === targetUrl) {
        logger.debug(this.component, 'already_connected_to_endpoint', { targetUrl });
        return;
      }
    }

    // 4. Prevent duplicate concurrent connection attempts to the same endpoint
    if (this.connectingEndpoints.has(targetUrl)) {
      logger.debug(this.component, 'connection_already_in_progress', { targetUrl });
      return;
    }
    this.connectingEndpoints.add(targetUrl);

    logger.info(this.component, 'connecting_outbound', { url: targetUrl });
    
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(targetUrl);
      } catch (err) {
        this.connectingEndpoints.delete(targetUrl);
        return reject(err);
      }
      
      let resolvedOrRejected = false;
      let authCheckInterval: NodeJS.Timeout | null = null;
      let authTimeout: NodeJS.Timeout | null = null;

      const cleanup = () => {
        this.connectingEndpoints.delete(targetUrl);
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          this.activePendingTimers.delete(connectTimeout);
        }
        if (authCheckInterval) {
          clearInterval(authCheckInterval);
          this.activePendingTimers.delete(authCheckInterval);
        }
        if (authTimeout) {
          clearTimeout(authTimeout);
          this.activePendingTimers.delete(authTimeout);
        }
      };

      const connectTimeout = setTimeout(() => {
        if (!resolvedOrRejected) {
          resolvedOrRejected = true;
          cleanup();
          ws.terminate();
          reject(new Error(`Connection timeout connecting to ${targetUrl}`));
        }
      }, 5000);
      this.activePendingTimers.add(connectTimeout);

      ws.on('open', () => {
        if (resolvedOrRejected) return;
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          this.activePendingTimers.delete(connectTimeout);
        }
        logger.info(this.component, 'outbound_tcp_connected', { url: targetUrl });
        
        const peer = this.setupPeer(ws, true);
        
        // Poll for authentication completion
        authCheckInterval = setInterval(() => {
          if (resolvedOrRejected) {
            cleanup();
            return;
          }
          if (peer.getState() === PeerState.AUTHENTICATED) {
            resolvedOrRejected = true;
            cleanup();
            resolve();
          } else if (peer.getState() === PeerState.DISCONNECTED) {
            resolvedOrRejected = true;
            cleanup();
            reject(new Error(`Authentication failed or disconnected from ${targetUrl}`));
          }
        }, 50);
        this.activePendingTimers.add(authCheckInterval);
        
        authTimeout = setTimeout(() => {
          if (!resolvedOrRejected) {
            resolvedOrRejected = true;
            cleanup();
            if (peer.getState() !== PeerState.AUTHENTICATED) {
              peer.disconnect();
              reject(new Error(`Authentication timeout connecting to ${targetUrl}`));
            }
          }
        }, 3000);
        this.activePendingTimers.add(authTimeout);
      });

      ws.on('error', (err) => {
        if (!resolvedOrRejected) {
          resolvedOrRejected = true;
          cleanup();
          logger.error(this.component, 'outbound_error', err, { url: targetUrl });
          reject(err);
        }
      });
    });
  }

  private setupPeer(ws: WebSocket, isInitiator: boolean): Peer {
    const peer = new Peer(
      ws, 
      this.localNodeId,
      this.privateKey,
      this.publicKey,
      isInitiator,
      this.publicEndpoint,
      (p) => this.handlePeerAuthenticated(p),
      (msg, p) => this.handleMessageReceived(msg, p),
      (p) => this.handlePeerDisconnected(p)
    );
    
    // Store using temporary UUID until authenticated
    const tempId = `temp_${randomUUID()}`;
    this.peers.set(tempId, peer);
    return peer;
  }

  private cleanupTempPeerMappings(peer: Peer) {
    for (const [id, p] of this.peers.entries()) {
      if (p === peer && id !== peer.remoteNodeId) {
        this.peers.delete(id);
      }
    }
  }

  private handlePeerAuthenticated(peer: Peer) {
    const remoteId = peer.remoteNodeId;
    if (!remoteId) return;

    const existingPeer = this.peers.get(remoteId);
    if (existingPeer && existingPeer !== peer && existingPeer.getState() === PeerState.AUTHENTICATED) {
      // Deterministic duplicate connection resolution:
      // If localNodeId < remoteId: keep the connection where local was initiator
      // If localNodeId > remoteId: keep the connection where remote was initiator
      const shouldKeepNew = this.localNodeId < remoteId ? peer.isInitiator : !peer.isInitiator;
      
      if (shouldKeepNew) {
        logger.info(this.component, 'duplicate_connection_resolved_keeping_new', {
          remoteId,
          isInitiator: peer.isInitiator
        });
        existingPeer.disconnect();
        this.peers.set(remoteId, peer);
        this.cleanupTempPeerMappings(peer);
        for (const listener of this.peerConnectedListeners) {
          listener(peer);
        }
      } else {
        logger.info(this.component, 'duplicate_connection_resolved_keeping_existing', {
          remoteId,
          existingInitiator: existingPeer.isInitiator
        });
        peer.disconnect();
        this.cleanupTempPeerMappings(peer);
      }
      return;
    }

    // Normal promotion from temp ID
    this.peers.set(remoteId, peer);
    this.cleanupTempPeerMappings(peer);
    logger.info(this.component, 'peer_registered', { nodeId: remoteId });
    
    for (const listener of this.peerConnectedListeners) {
      listener(peer);
    }
  }
  
  private handlePeerDisconnected(peer: Peer) {
    if (peer.remoteNodeId) {
      this.peers.delete(peer.remoteNodeId);
    }
    this.cleanupTempPeerMappings(peer);

    for (const listener of this.peerDisconnectedListeners) {
      listener(peer);
    }
  }

  private handleMessageReceived(msg: NetworkMessage, peer: Peer) {
    if (this.replayCache.isDuplicateOrExpired(msg)) {
      logger.warn(this.component, 'replay_or_expired_message_dropped', { msgId: msg.messageId });
      return;
    }
    
    // Dispatch to registered listeners
    for (const listener of this.messageListeners) {
      try {
        listener(msg);
      } catch (err) {
        logger.error(this.component, 'error_in_message_listener', err);
      }
    }
  }
  
  public onMessage(listener: (msg: NetworkMessage) => void) {
    this.messageListeners.push(listener);
  }

  public onPeerConnected(listener: (peer: Peer) => void) {
    this.peerConnectedListeners.push(listener);
  }

  public onPeerDisconnected(listener: (peer: Peer) => void) {
    this.peerDisconnectedListeners.push(listener);
  }

  broadcast(msgType: MessageType, payload: any) {
    if (this.peers.size === 0) return;
    
    for (const peer of this.peers.values()) {
      if (peer.getState() === PeerState.AUTHENTICATED) {
        try {
          peer.send(msgType, payload);
        } catch (err) {
          logger.warn(this.component, 'broadcast_to_peer_failed', { peerId: peer.remoteNodeId });
        }
      }
    }
  }

  sendTo(targetNodeId: string, msgType: MessageType, payload: any, replyToId?: string): string | undefined {
    const peer = this.peers.get(targetNodeId);
    if (peer && peer.getState() === PeerState.AUTHENTICATED) {
      try {
        const msg = peer.send(msgType, payload, replyToId);
        return msg.messageId;
      } catch (err) {
        logger.warn(this.component, 'send_to_peer_failed', { targetNodeId, error: err });
        return undefined;
      }
    }
    return undefined;
  }

  async requestFromPeer(targetNodeId: string, msgType: MessageType, payload: any, timeoutMs: number = 5000): Promise<NetworkMessage> {
    return new Promise((resolve, reject) => {
      const msgId = this.sendTo(targetNodeId, msgType, payload);
      if (!msgId) {
        return reject(new Error(`Peer ${targetNodeId} not authenticated or not found`));
      }

      let timeout: NodeJS.Timeout | null = null;

      const listener = (msg: NetworkMessage) => {
        if (msg.replyToId === msgId) {
          if (timeout) {
            clearTimeout(timeout);
            this.activePendingTimers.delete(timeout);
          }
          this.pendingRequestListeners.delete(listener);
          this.messageListeners = this.messageListeners.filter(l => l !== listener);
          resolve(msg);
        }
      };

      timeout = setTimeout(() => {
        this.pendingRequestListeners.delete(listener);
        this.messageListeners = this.messageListeners.filter(l => l !== listener);
        if (timeout) this.activePendingTimers.delete(timeout);
        reject(new Error(`Request ${msgId} to peer ${targetNodeId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.activePendingTimers.add(timeout);

      this.pendingRequestListeners.add(listener);
      this.messageListeners.push(listener);
    });
  }

  stop() {
    // Clear all pending timers
    for (const timer of this.activePendingTimers) {
      clearTimeout(timer);
    }
    this.activePendingTimers.clear();
    this.connectingEndpoints.clear();

    // Disconnect all peers
    for (const peer of this.peers.values()) {
      peer.disconnect();
    }
    this.peers.clear();

    // Close server
    if (this.wss) {
      try {
        this.wss.close();
      } catch (err) {
        // ignore close error
      }
      this.wss = null;
    }

    // Clean up temporary request listeners without wiping permanent subsystem listeners
    for (const listener of this.pendingRequestListeners) {
      this.messageListeners = this.messageListeners.filter(l => l !== listener);
    }
    this.pendingRequestListeners.clear();

    logger.info(this.component, 'transport_stopped');
  }

  getActivePeerCount(): number {
    let count = 0;
    for (const peer of this.peers.values()) {
      if (peer.getState() === PeerState.AUTHENTICATED) count++;
    }
    return count;
  }

  getPeers(): Peer[] {
    return Array.from(this.peers.values());
  }

  getPeer(nodeId: string): Peer | undefined {
    return this.peers.get(nodeId);
  }
}
