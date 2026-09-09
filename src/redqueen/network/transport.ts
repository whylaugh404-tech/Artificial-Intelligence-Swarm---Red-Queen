import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../core/logger';
import { randomUUID } from 'crypto';

export interface NetworkMessage {
  id: string;
  senderId: string;
  type: string;
  payload: any;
  timestamp: number;
  signature?: string;
}

/**
 * REAL P2P WebSocket Transport.
 * No local event buses. No fake console logs.
 * This binds to an actual port and establishes raw TCP WebSockets.
 */
export class P2PTransport {
  private wss: WebSocketServer | null = null;
  private readonly component = 'p2p_transport';
  private peers: Map<string, WebSocket> = new Map();

  constructor(private readonly localNodeId: string) {}

  async startServer(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port });
      
      this.wss.on('connection', (ws: WebSocket, req) => {
        const ip = req.socket.remoteAddress;
        logger.info(this.component, 'inbound_connection', { ip });
        this.setupSocket(ws, `inbound-${randomUUID().substring(0,8)}`);
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
        logger.info(this.component, 'outbound_connected', { url });
        this.setupSocket(ws, `outbound-${randomUUID().substring(0,8)}`);
        
        // Send initial handshake
        this.sendToSocket(ws, {
          type: 'HANDSHAKE',
          payload: { version: '1.0' }
        });
        
        resolve();
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        logger.error(this.component, 'outbound_error', err);
        reject(err);
      });
    });
  }

  private setupSocket(ws: WebSocket, connectionId: string) {
    this.peers.set(connectionId, ws);

    ws.on('message', (data) => {
      try {
        const msg: NetworkMessage = JSON.parse(data.toString());
        logger.debug(this.component, 'message_received', { type: msg.type, sender: msg.senderId });
        // Event emitter or router would go here in a full implementation
      } catch (err) {
        logger.warn(this.component, 'malformed_message_dropped');
      }
    });

    ws.on('close', () => {
      logger.info(this.component, 'peer_disconnected', { connectionId });
      this.peers.delete(connectionId);
    });
  }

  private sendToSocket(ws: WebSocket, msg: Partial<NetworkMessage>) {
    if (ws.readyState === WebSocket.OPEN) {
      const fullMsg: NetworkMessage = {
        id: randomUUID(),
        senderId: this.localNodeId,
        type: msg.type || 'UNKNOWN',
        payload: msg.payload || {},
        timestamp: Date.now(),
        ...msg
      };
      ws.send(JSON.stringify(fullMsg));
    }
  }

  broadcast(msg: Partial<NetworkMessage>) {
    if (this.peers.size === 0) {
      logger.debug(this.component, 'broadcast_skipped_no_peers');
      return;
    }
    
    const fullMsg = JSON.stringify({
      id: randomUUID(),
      senderId: this.localNodeId,
      type: msg.type || 'UNKNOWN',
      payload: msg.payload || {},
      timestamp: Date.now()
    });

    let sent = 0;
    for (const [id, ws] of this.peers.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(fullMsg);
        sent++;
      }
    }
    logger.debug(this.component, 'broadcast_sent', { type: msg.type, peerCount: sent });
  }

  stop() {
    for (const ws of this.peers.values()) {
      ws.close();
    }
    if (this.wss) {
      this.wss.close();
    }
    logger.info(this.component, 'transport_stopped');
  }

  getActivePeerCount(): number {
    let count = 0;
    for (const ws of this.peers.values()) {
      if (ws.readyState === WebSocket.OPEN) count++;
    }
    return count;
  }
}
