import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../core/logger';
import { Peer, PeerState } from './peer';
import { NetworkMessage, MessageType, ReplayCache } from './protocol';
import { randomUUID } from 'crypto';

/**
 * REAL P2P WebSocket Transport managing Peer instances.
 */
export class P2PTransport {
  private wss: WebSocketServer | null = null;
  private readonly component = 'p2p_transport';
  private peers: Map<string, Peer> = new Map();
  private replayCache = new ReplayCache();
  public publicEndpoint?: string;
  
  private messageListeners: ((msg: NetworkMessage) => void)[] = [];
  private peerConnectedListeners: ((peer: Peer) => void)[] = [];
  private peerDisconnectedListeners: ((peer: Peer) => void)[] = [];

  constructor(
    private readonly localNodeId: string,
    private readonly privateKey: string,
    private readonly publicKey: string
  ) {}

  setEndpoint(url: string) {
    this.publicEndpoint = url;
  }

  async startServer(port: number): Promise<void> {
    return new Promise((resolve) => {
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
      });
    });
  }

  async connectToPeer(url: string): Promise<void> {
    logger.info(this.component, 'connecting_outbound', { url });
    
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('Connection timeout'));
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        logger.info(this.component, 'outbound_tcp_connected', { url });
        
        const peer = this.setupPeer(ws, true);
        
        // Wait for auth to complete
        const authCheck = setInterval(() => {
           if (peer.getState() === PeerState.AUTHENTICATED) {
              clearInterval(authCheck);
              resolve();
           } else if (peer.getState() === PeerState.DISCONNECTED) {
              clearInterval(authCheck);
              reject(new Error('Authentication failed / disconnected'));
           }
        }, 100);
        
        setTimeout(() => {
           clearInterval(authCheck);
           if (peer.getState() !== PeerState.AUTHENTICATED) {
             peer.disconnect();
             reject(new Error('Authentication timeout'));
           }
        }, 3000);
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        logger.error(this.component, 'outbound_error', err);
        reject(err);
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
      (p) => this.onPeerAuthenticated(p),
      (msg, p) => this.onMessageReceived(msg, p),
      (p) => this.onPeerDisconnected(p)
    );
    
    // We store the peer using a temporary UUID until it authenticates
    const tempId = randomUUID();
    this.peers.set(tempId, peer);
    return peer;
  }

  private onPeerAuthenticated(peer: Peer) {
    if (peer.remoteNodeId) {
       // Promote to actual node ID mapping
       this.peers.set(peer.remoteNodeId, peer);
       for (const [id, p] of this.peers.entries()) { if (p === peer && id !== peer.remoteNodeId) this.peers.delete(id); }
       logger.info(this.component, 'peer_registered', { nodeId: peer.remoteNodeId });
       
       for (const listener of this.peerConnectedListeners) {
           listener(peer);
       }
    }
  }
  
  private onPeerDisconnected(peer: Peer) {
    if (peer.remoteNodeId) {
      this.peers.delete(peer.remoteNodeId);
    }
    // Also sweep temp IDs
    for (const [id, p] of this.peers.entries()) {
      if (p === peer) {
         this.peers.delete(id);
      }
    }

    for (const listener of this.peerDisconnectedListeners) {
        listener(peer);
    }
  }

  private onMessageReceived(msg: NetworkMessage, peer: Peer) {
    if (this.replayCache.isDuplicateOrExpired(msg)) {
      logger.warn(this.component, 'replay_or_expired_message_dropped', { msgId: msg.messageId });
      return;
    }
    
    // Dispatch to registered listeners
    for (const listener of this.messageListeners) {
      listener(msg);
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
        peer.send(msgType, payload);
      }
    }
  }

  sendTo(targetNodeId: string, msgType: MessageType, payload: any, replyToId?: string): string | undefined {
    const peer = this.peers.get(targetNodeId);
    if (peer && peer.getState() === PeerState.AUTHENTICATED) {
       const msg = peer.send(msgType, payload, replyToId);
       return msg.messageId;
    }
    return undefined;
  }

  async requestFromPeer(targetNodeId: string, msgType: MessageType, payload: any, timeoutMs: number = 5000): Promise<NetworkMessage> {
    return new Promise((resolve, reject) => {
      const msgId = this.sendTo(targetNodeId, msgType, payload);
      if (!msgId) {
        return reject(new Error('Peer not authenticated or not found'));
      }

      const timeout = setTimeout(() => {
        this.messageListeners = this.messageListeners.filter(l => l !== listener);
        reject(new Error('Request timeout'));
      }, timeoutMs);

      const listener = (msg: NetworkMessage) => {
        if (msg.replyToId === msgId) {
          clearTimeout(timeout);
          this.messageListeners = this.messageListeners.filter(l => l !== listener);
          resolve(msg);
        }
      };

      this.messageListeners.push(listener);
    });
  }

  stop() {
    for (const peer of this.peers.values()) {
      peer.disconnect();
    }
    this.peers.clear();
    if (this.wss) {
      this.wss.close();
    }
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
}
