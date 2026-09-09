import { identityCrypto } from '../crypto/identity';
import { CellState, Lifecycle } from './lifecycle';
import { JsonFileMemoryStore, MemoryStore, MemoryCategory } from '../memory/store';
import { OpenRouterAIProvider, AIProvider } from '../cognition/ai-provider';
import { CognitionPipeline } from '../cognition/pipeline';
import { logger } from './logger';
import { ElectionManager } from '../swarm/election';
import { RoutingTable, PeerInfo, compareDistance } from '../dht/routing';
import { P2PTransport } from '../network/transport';
import { MessageType } from '../network/protocol';
import { PeerState } from '../network/peer';
import { OsintScanner } from '../osint/scanner';
import { SwarmMembershipManager, SwarmMembershipOptions } from '../swarm/membership';
import {
  isValidNodeId,
  validateEndpoint,
  validatePeerIdentity,
  FindNodePayloadSchema,
  FindNodeResponsePayloadSchema
} from '../validation/validators';
import {
  CellGenome,
  CellLineage,
  CellCapability,
  CellTraits,
  CellGenomeSchema,
  createGenesisGenome,
  constructLineage,
  validateGenome
} from '../genome';
import { CognitiveStateManager } from '../cognition/state';

export interface CellOptions {
  genome?: Partial<CellGenome>;
  specialization?: string | null;
  customTraits?: Partial<CellTraits>;
  capabilities?: CellCapability[];
  parentCellId?: string | null;
  generation?: number;
  lineageId?: string;
}

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
  public readonly swarm: SwarmMembershipManager;

  public readonly genome: CellGenome;
  public readonly lineage: CellLineage;
  public readonly cognitiveState: CognitiveStateManager;

  private syncIntervalTimer: NodeJS.Timeout | null = null;

  constructor(
    storagePath: string, 
    openRouterApiKey: string, 
    existingPrivateKey?: string, 
    existingPublicKey?: string,
    swarmOptions?: SwarmMembershipOptions,
    cellOptions?: CellOptions
  ) {
    if (existingPrivateKey && existingPublicKey) {
      this.privateKey = existingPrivateKey.trim();
      this.publicKey = existingPublicKey.trim();
    } else {
      const kp = identityCrypto.generateKeyPair();
      this.privateKey = kp.privateKey.trim();
      this.publicKey = kp.publicKey.trim();
    }
    
    this.nodeId = identityCrypto.deriveNodeId(this.publicKey);
    this.lifecycle = new Lifecycle(this.nodeId);
    
    // Scoped storage: ensure individual memory store enforces ownership by this.nodeId
    this.memory = new JsonFileMemoryStore(storagePath, this.nodeId);
    this.aiProvider = new OpenRouterAIProvider(openRouterApiKey);
    this.cognition = new CognitionPipeline(this.aiProvider, this.memory, this.nodeId);
    
    // Initialize Genome
    if (cellOptions?.genome && validateGenome(cellOptions.genome).valid) {
      this.genome = CellGenomeSchema.parse(cellOptions.genome);
    } else {
      this.genome = createGenesisGenome({
        parentCellId: cellOptions?.parentCellId,
        generation: cellOptions?.generation,
        lineageId: cellOptions?.lineageId,
        traits: cellOptions?.customTraits,
        capabilities: cellOptions?.capabilities,
        specialization: cellOptions?.specialization
      });
    }

    // Initialize Lineage
    this.lineage = constructLineage(this.genome);

    // Initialize Individual Cognitive State
    this.cognitiveState = new CognitiveStateManager(
      this.nodeId,
      this.genome.specialization,
      [],
      1.0
    );

    this.routing = new RoutingTable(this.nodeId);
    this.transport = new P2PTransport(this.nodeId, this.privateKey, this.publicKey);
    this.osint = new OsintScanner();

    this.swarm = new SwarmMembershipManager(
      this.nodeId,
      this.publicKey,
      this.transport,
      {
        ...swarmOptions,
        memoryStore: this.memory
      }
    );
    
    this.election = new ElectionManager(
      this.nodeId,
      () => this.transport.getActivePeerCount(),
      (term) => this.transport.broadcast(MessageType.HEARTBEAT, { term }),
      (term) => this.transport.broadcast(MessageType.HEARTBEAT, { term, leaderId: this.nodeId })
    );

    this.setupHooks();
  }

  private setupHooks() {
    this.lifecycle.registerShutdownHook(async () => {
      logger.info(this.component, 'shutting_down_cell', { nodeId: this.nodeId });
      if (this.syncIntervalTimer) {
        clearInterval(this.syncIntervalTimer);
        this.syncIntervalTimer = null;
      }
      this.cognitiveState.syncLifecycleState(CellState.STOPPED);
      await this.cognitiveState.persist(this.memory);
      this.swarm.stop();
      this.election.stop();
      this.transport.stop();
    });
    
    this.transport.onMessage((msg) => {
      // DHT Protocol handling
      if (msg.type === MessageType.FIND_NODE) {
        const parseResult = FindNodePayloadSchema.safeParse(msg.payload);
        if (!parseResult.success) {
          logger.warn(this.component, 'malformed_find_node_payload', { error: parseResult.error });
          return;
        }

        const targetId = parseResult.data.targetNodeId;
        const closest = this.routing.getClosestPeers(targetId, 20);
        
        // Bounded payload: up to 20 peers, strictly formatted
        this.transport.sendTo(msg.senderId, MessageType.FIND_NODE_RESPONSE, {
          targetNodeId: targetId,
          peers: closest.map(p => ({
            nodeId: p.nodeId,
            publicKey: p.publicKey,
            endpoint: p.endpoint
          }))
        }, msg.messageId);
        return;
      }
      
      if (msg.type === MessageType.FIND_NODE_RESPONSE) {
        // Handled through requestFromPeer promise resolution
        return;
      }

      logger.info(this.component, 'app_message_received', { type: msg.type, sender: msg.senderId });
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

    this.transport.onPeerDisconnected((_peer) => {
      // Handled by DHT liveness policies
    });
  }

  private async restoreOrPersistGenome(): Promise<void> {
    const key = `cell_genome_${this.nodeId}`;
    const existing = await this.memory.get(key);
    if (existing && existing.content) {
      const check = validateGenome(existing.content);
      if (check.valid && check.genome) {
        (this as any).genome = check.genome;
        (this as any).lineage = constructLineage(check.genome);
        logger.info(this.component, 'cell_genome_restored_from_storage', {
          genomeId: this.genome.genomeId,
          generation: this.genome.generation,
          lineageId: this.lineage.lineageId
        });
        return;
      }
    }

    await this.memory.put({
      id: key,
      cellId: this.nodeId,
      category: MemoryCategory.SEMANTIC,
      content: this.genome,
      source: 'cell_initialization',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1.0,
      hash: '',
      provenance: [this.nodeId],
      version: 1
    });
  }

  async start(p2pPort: number = 0) {
    await this.lifecycle.initialize(async () => {
      logger.info(this.component, 'starting_cell', { nodeId: this.nodeId });
      await this.memory.initialize();
      await this.restoreOrPersistGenome();
      await this.cognitiveState.restore(this.memory);
      this.cognitiveState.syncLifecycleState(CellState.ACTIVE);
      if (this.memory.getStats) {
        this.cognitiveState.updateMemoryStats(this.memory.getStats());
      }
      await this.cognitiveState.persist(this.memory);
      await this.swarm.restoreFromStorage();
      
      if (p2pPort > 0) {
        await this.transport.startServer(p2pPort);
      }

      // Periodically sync active transport peers into the routing table with proper cleanup
      this.syncIntervalTimer = setInterval(() => {
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

      logger.info(this.component, 'cell_active');
    });
  }
  
  async connectToPeer(url: string) {
    return this.transport.connectToPeer(url);
  }

  /**
   * Hardened Kademlia iterative FIND_NODE lookup.
   * Concurrency bound: ALPHA = 3
   * Connection concurrency bound: MAX_CONCURRENT_PEER_CONNECTIONS = 3
   */
  async findNode(targetNodeId: string): Promise<PeerInfo[]> {
    if (!isValidNodeId(targetNodeId)) {
      throw new Error(`Invalid targetNodeId: ${targetNodeId}`);
    }

    const ALPHA = 3;
    const MAX_QUERIED = 20;
    const K = 20;
    const QUERY_TIMEOUT_MS = 3000;
    const LOOKUP_TIMEOUT_MS = 10000;
    const MAX_CONCURRENT_PEER_CONNECTIONS = 3;
    const startTime = Date.now();

    const queried = new Set<string>();
    const failed = new Set<string>();
    const candidates = new Map<string, PeerInfo>();
    
    // Seed with local closest peers
    const initialClosest = this.routing.getClosestPeers(targetNodeId, K);
    for (const p of initialClosest) {
      if (p.nodeId !== this.nodeId) {
        candidates.set(p.nodeId, p);
      }
    }

    let isFinished = false;

    while (!isFinished && (Date.now() - startTime < LOOKUP_TIMEOUT_MS)) {
      if (queried.size >= MAX_QUERIED) break;

      // Numerical byte-level XOR distance sorting
      const sortedCandidates = Array.from(candidates.values())
        .sort((a, b) => compareDistance(targetNodeId, a.nodeId, b.nodeId));
      
      // Pick up to ALPHA unqueried peers
      const toQuery: PeerInfo[] = [];
      for (const p of sortedCandidates) {
        if (!queried.has(p.nodeId) && !failed.has(p.nodeId) && p.nodeId !== this.nodeId) {
          toQuery.push(p);
          if (toQuery.length >= ALPHA) break;
        }
      }

      if (toQuery.length === 0) {
        isFinished = true;
        break;
      }

      // Query chosen peers in parallel
      const promises = toQuery.map(async (peer) => {
        queried.add(peer.nodeId);
        try {
          const res = await this.transport.requestFromPeer(
            peer.nodeId, 
            MessageType.FIND_NODE, 
            { targetNodeId }, 
            QUERY_TIMEOUT_MS
          );

          // Validate message payload schema
          const parseResult = FindNodeResponsePayloadSchema.safeParse(res.payload);
          if (!parseResult.success) {
            logger.warn(this.component, 'malformed_find_node_response_dropped', { 
              peer: peer.nodeId, 
              error: parseResult.error 
            });
            return;
          }

          const returnedPeers = parseResult.data.peers;
          for (const p of returnedPeers) {
            // Drop self
            if (p.nodeId === this.nodeId) continue;

            // Validate peer identity
            const idCheck = validatePeerIdentity(p.nodeId, p.publicKey);
            if (!idCheck.valid) {
              logger.warn(this.component, 'untrusted_peer_identity_rejected', {
                nodeId: p.nodeId,
                reason: idCheck.reason
              });
              continue;
            }

            // Validate endpoint if present
            let validatedEndpoint: string | undefined = undefined;
            if (p.endpoint) {
              const epCheck = validateEndpoint(p.endpoint);
              if (!epCheck.valid) {
                logger.warn(this.component, 'untrusted_peer_endpoint_rejected', {
                  nodeId: p.nodeId,
                  endpoint: p.endpoint,
                  reason: epCheck.reason
                });
                continue;
              }
              validatedEndpoint = epCheck.normalizedUrl;
            }

            // Peer passed all checks, add to lookup candidates
            if (!candidates.has(p.nodeId)) {
              candidates.set(p.nodeId, {
                nodeId: p.nodeId,
                publicKey: p.publicKey,
                endpoint: validatedEndpoint,
                lastSeen: Date.now()
              });
            }
          }
        } catch (e: any) {
          failed.add(peer.nodeId);
          logger.warn(this.component, 'find_node_query_failed', { peer: peer.nodeId, error: e.message });
        }
      });

      await Promise.all(promises);
    }

    // Sort final candidate set by numerical XOR distance
    const closest = Array.from(candidates.values())
      .sort((a, b) => compareDistance(targetNodeId, a.nodeId, b.nodeId))
      .slice(0, K);
    
    // Connect to newly discovered closest peers with bounded concurrency
    const toConnect: PeerInfo[] = [];
    for (const peer of closest) {
      if (
        peer.nodeId !== this.nodeId &&
        peer.endpoint &&
        !this.routing.getPeer(peer.nodeId) &&
        !this.transport.getPeer(peer.nodeId)
      ) {
        toConnect.push(peer);
      }
    }

    // Process connection attempts in batches of MAX_CONCURRENT_PEER_CONNECTIONS
    for (let i = 0; i < toConnect.length; i += MAX_CONCURRENT_PEER_CONNECTIONS) {
      const batch = toConnect.slice(i, i + MAX_CONCURRENT_PEER_CONNECTIONS);
      await Promise.all(batch.map(async (peer) => {
        try {
          await this.connectToPeer(peer.endpoint!);
        } catch (e: any) {
          logger.debug(this.component, 'connect_discovered_peer_failed', {
            nodeId: peer.nodeId,
            endpoint: peer.endpoint,
            error: e.message
          });
        }
      }));
    }
    
    return closest;
  }

  async stop() {
    if (this.syncIntervalTimer) {
      clearInterval(this.syncIntervalTimer);
      this.syncIntervalTimer = null;
    }
    this.cognitiveState.syncLifecycleState(CellState.STOPPED);
    await this.cognitiveState.persist(this.memory);
    await this.lifecycle.shutdown();
  }

  getStatus() {
    return {
      nodeId: this.nodeId,
      state: this.lifecycle.getState(),
      peers: this.transport.getActivePeerCount(),
      dhtBucketsActive: this.routing.getActiveBucketCount(),
      swarmState: this.swarm.getMembershipState(this.nodeId),
      swarmId: this.swarm.swarmId,
      genome: {
        genomeId: this.genome.genomeId,
        generation: this.genome.generation,
        logicVersion: this.genome.logicVersion,
        capabilities: this.genome.capabilities,
        specialization: this.cognitiveState.getSpecialization(),
        genomeVersion: this.genome.genomeVersion
      },
      lineage: {
        lineageId: this.lineage.lineageId,
        generation: this.lineage.generation,
        parentCellId: this.lineage.parentCellId
      },
      cognitiveState: this.cognitiveState.getState()
    };
  }
}
