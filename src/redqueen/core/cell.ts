import { identityCrypto } from '../crypto/identity';
import { Lifecycle, CellState } from './lifecycle';
import { JsonFileMemoryStore, MemoryStore } from '../memory/store';
import { OpenRouterAIProvider, AIProvider } from '../cognition/ai-provider';
import { CognitionPipeline } from '../cognition/pipeline';
import { logger } from './logger';
import { ElectionManager } from '../swarm/election';
import { RoutingTable } from '../dht/routing';

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

  private peers: Map<string, any> = new Map();

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
    
    this.election = new ElectionManager(
      this.nodeId,
      () => this.peers.size,
      (term) => this.broadcast({ type: 'VOTE_REQUEST', term }),
      (term) => this.broadcast({ type: 'HEARTBEAT', term, leaderId: this.nodeId })
    );

    this.setupHooks();
  }

  private setupHooks() {
    this.lifecycle.registerShutdownHook(async () => {
      logger.info(this.component, 'shutting_down_cell', { nodeId: this.nodeId });
      // Clean up connections, flush memory, etc.
    });
  }

  async start() {
    await this.lifecycle.initialize(async () => {
      logger.info(this.component, 'starting_cell', { nodeId: this.nodeId });
      await this.memory.initialize();
      logger.info(this.component, 'cell_active');
    });
  }

  async stop() {
    await this.lifecycle.shutdown();
  }

  private broadcast(msg: any) {
    // In a real network, this sends to all connected peers
    logger.debug(this.component, 'mock_broadcast', { msg });
  }

  // Diagnostics and API bindings
  getStatus() {
    return {
      nodeId: this.nodeId,
      state: this.lifecycle.getState(),
      peers: this.peers.size,
      dhtBucketsActive: 0 // real metric calculation would go here
    };
  }
}
