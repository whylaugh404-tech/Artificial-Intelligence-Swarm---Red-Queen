import { identityCrypto } from '../crypto/identity';
import { Lifecycle, CellState } from './lifecycle';
import { JsonFileMemoryStore, MemoryStore } from '../memory/store';
import { OpenRouterAIProvider, AIProvider } from '../cognition/ai-provider';
import { CognitionPipeline } from '../cognition/pipeline';
import { logger } from './logger';
import { ElectionManager } from '../swarm/election';
import { RoutingTable, PeerInfo } from '../dht/routing';
import { P2PTransport } from '../network/transport';
import { MessageType } from '../network/protocol';
import { PeerState } from '../network/peer';
import { OsintScanner } from '../osint/scanner';

export class Cell {
  private readonly component = 'cell';
  
  public readonly privateKey: string;
  public readonly publicKey: string;
  public readonly nodeId: string;
  
  public readonly lifecycle: Lifecycle;
  public readonly memory: MemoryStore;
  public readonly aiProvider: AIProvider;
  public readonly cognition: CognitionPipeline;
  public readonly routing: RoutingTable;
  public readonly election: ElectionManager;
  public readonly transport: P2PTransport;
  public readonly osint: OsintScanner;

  constructor(
    storagePath: string, 
    openRouterApiKey: string, 
    existingPrivateKey?: string, 
    existingPublicKey?: string
  ) {
    if (existingPrivateKey && existingPublicKey) {
      this.privateKey = existingPrivateKey;
      this.publicKey = existingPublicKey;
    } else {
      const kp = identityCrypto.generateKeyPair();
      this.privateKey = kp.privateKey;
      this.publicKey = kp.publicKey;
    }
    
    this.nodeId = identityCrypto.deriveNodeId(this.publicKey);
    this.lifecycle = new Lifecycle(this.nodeId);
    
    this.memory = new JsonFileMemoryStore(storagePath);
    this.aiProvider = new OpenRouterAIProvider(openRouterApiKey);
    this.cognition = new CognitionPipeline(this.aiProvider, this.memory, this.nodeId);
    
    this.routing = new RoutingTable(this.nodeId);
    this.transport = new P2PTransport(this.nodeId, this.privateKey, this.publicKey);
    this.osint = new OsintScanner();
    
    this.election = new ElectionManager(
      this.nodeId,
      () => this.transport.getActivePeerCount(),
      (term) => this.transport.broadcast(MessageType.HEARTBEAT /* Should be VOTE_REQUEST, using Heartbeat for now */, { term }),
      (term) => this.transport.broadcast(MessageType.HEARTBEAT, { term, leaderId: this.nodeId })
    );

    this.setupHooks();
  }

  private setupHooks() {
    this.lifecycle.registerShutdownHook(async () => {
      logger.info(this.component, 'shutting_down_cell', { nodeId: this.nodeId });
      this.election.stop();
      this.transport.stop();
    });
    
    this.transport.onMessage((msg) => {
      // DHT Protocol interception
      if (msg.type === MessageType.FIND_NODE) {
         const targetId = msg.payload.targetNodeId;
         if (typeof targetId === 'string') {
             const closest = this.routing.getClosestPeers(targetId, 20);
             this.transport.sendTo(msg.senderId, MessageType.FIND_NODE_RESPONSE, {
                targetNodeId: targetId,
                peers: closest.map(p => ({
                   nodeId: p.nodeId,
                   publicKey: p.publicKey,
                   endpoint: p.endpoint
                }))
             }, msg.messageId);
         }
         return;
      }
      
      if (msg.type === MessageType.FIND_NODE_RESPONSE) {
         // Should be handled by requestFromPeer promise resolution
      }

      logger.info(this.component, 'app_message_received', { type: msg.type, sender: msg.senderId });
      // Event logic
    });
    
    this.transport.onPeerConnected((peer) => {
       if (peer.remoteNodeId && peer.remotePublicKey) {
          this.routing.addPeer({
             nodeId: peer.remoteNodeId,
             publicKey: peer.remotePublicKey,
             endpoint: peer.remoteEndpoint,
             lastSeen: peer.lastSeen
          });
       }
    });

    this.transport.onPeerDisconnected((peer) => {
       // We don't remove from routing table immediately on disconnect, 
       // but we could mark them or just let liveness checks handle it.
       // For now, DHT handles eviction separately.
    });

    // Periodically sync active transport peers into the routing table
    setInterval(() => {
      for (const peer of this.transport.getPeers()) {
         if (peer.getState() === PeerState.AUTHENTICATED && peer.remoteNodeId && peer.remotePublicKey) {
            this.routing.addPeer({
               nodeId: peer.remoteNodeId,
               publicKey: peer.remotePublicKey,
               endpoint: peer.remoteEndpoint,
               lastSeen: peer.lastSeen
            });
         }
      }
    }, 5000);
  }

  async start(p2pPort: number = 0) {
    await this.lifecycle.initialize(async () => {
      logger.info(this.component, 'starting_cell', { nodeId: this.nodeId });
      await this.memory.initialize();
      
      if (p2pPort > 0) {
        await this.transport.startServer(p2pPort);
      }
      logger.info(this.component, 'cell_active');
    });
  }
  
  async connectToPeer(url: string) {
    return this.transport.connectToPeer(url);
  }

  async findNode(targetNodeId: string): Promise<PeerInfo[]> {
    const ALPHA = 3;
    const MAX_QUERIED = 20;
    const K = 20;
    const TIMEOUT_MS = 10000;
    const startTime = Date.now();

    const queried = new Set<string>();
    const candidates = new Map<string, PeerInfo>();
    
    // Seed with our current closest peers
    const initialClosest = this.routing.getClosestPeers(targetNodeId, K);
    for (const p of initialClosest) {
       candidates.set(p.nodeId, p);
    }

    let isFinished = false;

    while (!isFinished && Date.now() - startTime < TIMEOUT_MS) {
       if (queried.size >= MAX_QUERIED) break;

       // Sort current candidates
       const sortedCandidates = Array.from(candidates.values())
           .sort((a, b) => this.routing.xorDistance(a.nodeId, targetNodeId).localeCompare(this.routing.xorDistance(b.nodeId, targetNodeId)));
       
       // Pick up to ALPHA unqueried peers
       const toQuery: PeerInfo[] = [];
       for (const p of sortedCandidates) {
           if (!queried.has(p.nodeId) && p.nodeId !== this.nodeId) {
               toQuery.push(p);
               if (toQuery.length >= ALPHA) break;
           }
       }

       if (toQuery.length === 0) {
           isFinished = true;
           break;
       }

       // Perform requests in parallel
       const promises = toQuery.map(async (peer) => {
           queried.add(peer.nodeId);
           try {
               const res = await this.transport.requestFromPeer(peer.nodeId, MessageType.FIND_NODE, { targetNodeId }, 3000);
               const returnedPeers = res.payload.peers;
               if (Array.isArray(returnedPeers)) {
                   for (const p of returnedPeers) {
                       // Validate identity
                       if (p.nodeId && p.publicKey && identityCrypto.isValidPublicKey(p.publicKey)) {
                           const expectedNodeId = identityCrypto.deriveNodeId(p.publicKey);
                           if (expectedNodeId === p.nodeId) {
                               candidates.set(p.nodeId, {
                                   nodeId: p.nodeId,
                                   publicKey: p.publicKey,
                                   endpoint: p.endpoint,
                                   lastSeen: Date.now()
                               });
                           }
                       }
                   }
               }
           } catch (e) {
               // Timeout or fail, just ignore
               logger.warn(this.component, 'find_node_failed', { peer: peer.nodeId, error: e.message });
           }
       });

       await Promise.all(promises);
    }

    // Connect to newly discovered closest peers if they have endpoints
    const closest = Array.from(candidates.values())
           .sort((a, b) => this.routing.xorDistance(a.nodeId, targetNodeId).localeCompare(this.routing.xorDistance(b.nodeId, targetNodeId)))
           .slice(0, K);
    
    for (const peer of closest) {
       if (peer.nodeId !== this.nodeId && peer.endpoint && !this.routing.getPeer(peer.nodeId)) {
           // We don't have it in active routing table yet, attempt connect
           try {
               await this.connectToPeer(peer.endpoint);
           } catch (e) {
               // ignore connect failures
           }
       }
    }
    
    return closest;
  }

  async stop() {
    await this.lifecycle.shutdown();
  }

  getStatus() {
    return {
      nodeId: this.nodeId,
      state: this.lifecycle.getState(),
      peers: this.transport.getActivePeerCount(),
      dhtBucketsActive: this.routing.getActiveBucketCount()
    };
  }
}
