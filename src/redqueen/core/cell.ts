import { identityCrypto } from '../crypto/identity';
import { Lifecycle, CellState } from './lifecycle';
import { JsonFileMemoryStore, MemoryStore } from '../memory/store';
import { OpenRouterAIProvider, AIProvider } from '../cognition/ai-provider';
import { CognitionPipeline } from '../cognition/pipeline';
import { logger } from './logger';
import { ElectionManager } from '../swarm/election';
import { RoutingTable } from '../dht/routing';
import { P2PTransport } from '../network/transport';
import { MessageType } from '../network/protocol';
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
      logger.info(this.component, 'app_message_received', { type: msg.type, sender: msg.senderId });
      // Event logic
    });
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

  async stop() {
    await this.lifecycle.shutdown();
  }

  getStatus() {
    return {
      nodeId: this.nodeId,
      state: this.lifecycle.getState(),
      peers: this.transport.getActivePeerCount(),
      dhtBucketsActive: 0
    };
  }
}
