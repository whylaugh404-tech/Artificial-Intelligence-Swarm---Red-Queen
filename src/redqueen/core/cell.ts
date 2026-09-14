import * as fs from 'fs/promises';
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
  validateGenome,
  deepFreeze
} from '../genome';
import { CognitiveStateManager } from '../cognition/state';
import {
  MetabolismEngine,
  MetabolismResult,
  InformationRecordInput,
  MetabolismBudget
} from '../metabolism';
import { ExchangeManager, ExchangeConfig } from '../exchange/manager';
import {
  CognitiveGraph,
  CognitiveRepresentationEngine,
  CognitiveRepresentationBudget
} from '../cognition/representation';
import { UnderstandingEngine } from '../cognition/understanding';
import { WorldModelEngine } from '../cognition/worldmodel';
import { ReasoningEngine } from '../cognition/reasoning';

export interface CellOptions {
  genome?: Partial<CellGenome>;
  specialization?: string | null;
  customTraits?: Partial<CellTraits>;
  capabilities?: CellCapability[];
  parentCellId?: string | null;
  generation?: number;
  lineageId?: string;
  metabolismBudget?: Partial<MetabolismBudget>;
  exchangeConfig?: Partial<ExchangeConfig>;
  representationBudget?: Partial<CognitiveRepresentationBudget>;
}

export class Cell {
  private readonly component = 'cell';
  
  public readonly privateKey!: string;
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
  public readonly metabolism: MetabolismEngine;
  public readonly exchange: ExchangeManager;
  public readonly cognitiveGraph: CognitiveGraph;
  public readonly representation: CognitiveRepresentationEngine;
  public readonly understanding: UnderstandingEngine;
  public readonly worldModel: WorldModelEngine;
  public readonly reasoning: ReasoningEngine;

  private _genome: CellGenome;
  private _lineage: CellLineage;
  public readonly cognitiveState: CognitiveStateManager;

  public get genome(): Readonly<CellGenome> {
    return this._genome;
  }

  public get lineage(): Readonly<CellLineage> {
    return this._lineage;
  }

  private syncIntervalTimer: NodeJS.Timeout | null = null;

  constructor(
    storagePath: string, 
    openRouterApiKey: string, 
    existingPrivateKey?: string, 
    existingPublicKey?: string,
    swarmOptions?: SwarmMembershipOptions,
    cellOptions?: CellOptions
  ) {
    let rawPrivateKey: string;
    if (existingPrivateKey && existingPublicKey) {
      rawPrivateKey = existingPrivateKey.trim();
      this.publicKey = existingPublicKey.trim();
    } else {
      const kp = identityCrypto.generateKeyPair();
      rawPrivateKey = kp.privateKey.trim();
      this.publicKey = kp.publicKey.trim();
    }

    // Mark privateKey non-enumerable to prevent accidental serialization leakage
    Object.defineProperty(this, 'privateKey', {
      value: rawPrivateKey,
      writable: false,
      enumerable: false,
      configurable: false
    });
    
    this.nodeId = identityCrypto.deriveNodeId(this.publicKey);
    this.lifecycle = new Lifecycle(this.nodeId);
    
    // Scoped storage: ensure individual memory store enforces ownership by this.nodeId
    this.memory = new JsonFileMemoryStore(storagePath, this.nodeId);
    this.aiProvider = new OpenRouterAIProvider(openRouterApiKey);
    this.cognition = new CognitionPipeline(this.aiProvider, this.memory, this.nodeId);
    
    // Initialize Genome
    if (cellOptions?.genome && validateGenome(cellOptions.genome).valid) {
      this._genome = deepFreeze(CellGenomeSchema.parse(cellOptions.genome));
    } else {
      this._genome = createGenesisGenome({
        parentCellId: cellOptions?.parentCellId,
        generation: cellOptions?.generation,
        lineageId: cellOptions?.lineageId,
        traits: cellOptions?.customTraits,
        capabilities: cellOptions?.capabilities,
        specialization: cellOptions?.specialization
      });
    }

    // Initialize Lineage
    this._lineage = constructLineage(this._genome);

    // Initialize Individual Cognitive State
    this.cognitiveState = new CognitiveStateManager(
      this.nodeId,
      this._genome.specialization,
      [],
      1.0
    );

    // Initialize Cognitive Graph & Representation Subsystems
    this.cognitiveGraph = new CognitiveGraph(
      this.nodeId,
      this.memory,
      cellOptions?.representationBudget
    );

    this.representation = new CognitiveRepresentationEngine(
      this.nodeId,
      cellOptions?.representationBudget
    );

    // Initialize Understanding and World Model Subsystems
    this.understanding = new UnderstandingEngine();
    this.worldModel = new WorldModelEngine(this.cognitiveGraph);
    this.reasoning = new ReasoningEngine(this.cognitiveGraph, this.worldModel, this.understanding);

    // Initialize Information Metabolism Subsystem
    this.metabolism = new MetabolismEngine(
      this.nodeId,
      this.memory,
      this.cognitiveState,
      {
        budget: cellOptions?.metabolismBudget,
        graph: this.cognitiveGraph,
        representationEngine: this.representation
      }
    );

    this.routing = new RoutingTable(this.nodeId);
    this.transport = new P2PTransport(this.nodeId, rawPrivateKey, this.publicKey);
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

    this.exchange = new ExchangeManager(
      this.nodeId,
      this.transport,
      this.routing,
      this.memory,
      this.metabolism,
      this.cognitiveGraph,
      cellOptions?.exchangeConfig
    );

    this.setupHooks();
  }

  public restoreGenome(candidate: unknown): void {
    const check = validateGenome(candidate);
    if (!check.valid || !check.genome) {
      throw new Error(`Cannot restore invalid genome: ${check.errors?.join(', ') || 'Validation failed'}`);
    }
    const validated = check.genome;
    this._genome = deepFreeze(validated);
    this._lineage = constructLineage(validated);
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
      this.exchange.stop();
      this.transport.stop();
    });
    
    this.transport.onMessage((msg) => {
      const state = this.lifecycle.getState();
      if (state === CellState.RETIRED || state === CellState.SUSPENDED) {
        logger.debug(this.component, 'message_ignored_inactive_cell', { state, type: msg.type });
        return;
      }

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

  public async restoreOrPersistIdentity(): Promise<void> {
    const key = `cell_identity_${this.nodeId}`;
    const existing = await this.memory.get(key);
    if (!existing) {
      await this.memory.put({
        id: key,
        cellId: this.nodeId,
        category: MemoryCategory.PROCEDURAL,
        content: {
          nodeId: this.nodeId,
          publicKey: this.publicKey,
          privateKey: this.privateKey
        },
        source: 'cell_initialization',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1.0,
        hash: '',
        provenance: [this.nodeId],
        version: 1
      });
    }
  }

  public static async loadFromStorage(
    storagePath: string,
    openRouterApiKey: string,
    swarmOptions?: SwarmMembershipOptions,
    cellOptions?: CellOptions
  ): Promise<Cell> {
    const rawData = await fs.readFile(storagePath, 'utf8');
    const entries = JSON.parse(rawData);
    if (!Array.isArray(entries)) {
      throw new Error(`Malformed cell storage: expected array of memory entries at '${storagePath}'`);
    }

    let privateKey: string | undefined;
    let publicKey: string | undefined;
    let genome: any;

    const identityEntry = entries.find((e: any) => e.id && typeof e.id === 'string' && e.id.startsWith('cell_identity_'));
    if (identityEntry && identityEntry.content) {
      privateKey = identityEntry.content.privateKey;
      publicKey = identityEntry.content.publicKey;
    }

    const genomeEntry = entries.find((e: any) => e.id && typeof e.id === 'string' && e.id.startsWith('cell_genome_'));
    if (genomeEntry && genomeEntry.content) {
      genome = genomeEntry.content;
    }

    const mergedOptions: CellOptions = {
      ...cellOptions,
      genome: genome || cellOptions?.genome
    };

    const cell = new Cell(
      storagePath,
      openRouterApiKey,
      privateKey,
      publicKey,
      swarmOptions,
      mergedOptions
    );

    await cell.memory.initialize();
    await cell.restoreOrPersistGenome();
    return cell;
  }

  public async restoreOrPersistGenome(): Promise<void> {
    const key = `cell_genome_${this.nodeId}`;
    const existing = await this.memory.get(key);
    if (existing && existing.content) {
      try {
        this.restoreGenome(existing.content);
        logger.info(this.component, 'cell_genome_restored_from_storage', {
          genomeId: this._genome.genomeId,
          generation: this._genome.generation,
          lineageId: this._lineage.lineageId
        });
        return;
      } catch (err: any) {
        logger.warn(this.component, 'persisted_genome_invalid_falling_back', { error: err.message });
      }
    }

    await this.memory.put({
      id: key,
      cellId: this.nodeId,
      category: MemoryCategory.SEMANTIC,
      content: this._genome,
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
      await this.restoreOrPersistIdentity();
      await this.restoreOrPersistGenome();
      await this.cognitiveState.restore(this.memory);
      await this.cognitiveGraph.load();
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
    const state = this.lifecycle.getState();
    if (state === CellState.RETIRED) {
      throw new Error('Cell is retired and cannot initiate connections');
    }
    if (state === CellState.SUSPENDED) {
      throw new Error('Cell is suspended and cannot initiate connections');
    }
    return this.transport.connectToPeer(url);
  }

  /**
   * Hardened Kademlia iterative FIND_NODE lookup.
   * Concurrency bound: ALPHA = 3
   * Connection concurrency bound: MAX_CONCURRENT_PEER_CONNECTIONS = 3
   */
  async findNode(targetNodeId: string): Promise<PeerInfo[]> {
    const state = this.lifecycle.getState();
    if (state === CellState.RETIRED) {
      throw new Error('Cell is retired and cannot perform lookups');
    }
    if (state === CellState.SUSPENDED) {
      throw new Error('Cell is suspended and cannot perform lookups');
    }

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

  /**
   * Metabolizes an incoming InformationRecord through the Cell's metabolism engine.
   */
  async metabolize(input: InformationRecordInput): Promise<MetabolismResult> {
    const state = this.lifecycle.getState();
    if (state === CellState.RETIRED) {
      throw new Error('Cell is retired and cannot metabolize information');
    }
    if (state === CellState.SUSPENDED) {
      throw new Error('Cell is suspended and cannot metabolize information');
    }
    return this.metabolism.metabolize(input);
  }

  async stop() {
    if (this.syncIntervalTimer) {
      clearInterval(this.syncIntervalTimer);
      this.syncIntervalTimer = null;
    }
    this.exchange.stop();
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
      metabolismAuditEventsCount: this.metabolism.audit.getEvents().length,
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
      cognitiveState: this.cognitiveState.getState(),
      cognitiveGraph: {
        conceptsCount: this.cognitiveGraph.getAllConcepts().length,
        relationsCount: this.cognitiveGraph.getAllRelations().length,
        abstractionsCount: this.cognitiveGraph.getAllAbstractions().length,
        generalizationsCount: this.cognitiveGraph.getAllGeneralizations().length,
        analogiesCount: this.cognitiveGraph.getAllAnalogies().length,
        conflictsCount: this.cognitiveGraph.getAllConflicts().length
      }
    };
  }

  toJSON() {
    return this.getStatus();
  }
}
