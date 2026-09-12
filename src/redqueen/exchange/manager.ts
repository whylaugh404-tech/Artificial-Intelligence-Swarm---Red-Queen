import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../core/logger';
import { P2PTransport } from '../network/transport';
import { MessageType, NetworkMessage } from '../network/protocol';
import { RoutingTable } from '../dht/routing';
import { MemoryStore, MemoryCategory } from '../memory/store';
import { MetabolismEngine } from '../metabolism/engine';
import { CognitiveGraph } from '../cognition/representation/graph';
import {
  CognitiveConcept,
  CognitiveRelation,
  CognitiveAbstraction,
  CognitiveGeneralization,
  CognitiveAnalogy,
  CognitiveConceptSchema,
  CognitiveRelationSchema,
  CognitiveAbstractionSchema,
  CognitiveGeneralizationSchema,
  CognitiveAnalogySchema,
  RepresentationVerificationStatus
} from '../cognition/representation/types';
import { 
  ExchangeQuery, 
  ExchangeQuerySchema,
  ExchangeResponse, 
  ExchangeResponseSchema,
  ExchangeType,
  ExchangeEventType
} from './types';

export interface ExchangeConfig {
  maxConcurrentExchanges: number;
  maxPeersQueried: number;
  maxResponsesPerQuery: number;
  exchangeTimeoutMs: number;
  maxKnowledgePayloadSize: number;
  maxExperiencePayloadSize: number;
  maxRepresentationPayloadSize: number;
  maxRetries: number;
}

const DEFAULT_EXCHANGE_CONFIG: ExchangeConfig = {
  maxConcurrentExchanges: 10,
  maxPeersQueried: 5,
  maxResponsesPerQuery: 10,
  exchangeTimeoutMs: 15000,
  maxKnowledgePayloadSize: 64 * 1024,
  maxExperiencePayloadSize: 64 * 1024,
  maxRepresentationPayloadSize: 64 * 1024,
  maxRetries: 2
};

export class ExchangeManager extends EventEmitter {
  private readonly config: ExchangeConfig;
  private activeExchanges: Map<string, {
    resolve: (value: ExchangeResponse[]) => void;
    reject: (reason?: any) => void;
    timer: NodeJS.Timeout;
    responses: ExchangeResponse[];
  }> = new Map();

  constructor(
    private readonly cellId: string,
    private readonly transport: P2PTransport,
    private readonly routing: RoutingTable,
    private readonly memory: MemoryStore,
    private readonly metabolism: MetabolismEngine,
    private readonly graph?: CognitiveGraph,
    config?: Partial<ExchangeConfig>
  ) {
    super();
    this.config = { ...DEFAULT_EXCHANGE_CONFIG, ...(config || {}) };
    this.setupTransportHandlers();
  }

  private setupTransportHandlers() {
    this.transport.onMessage(async (msg: NetworkMessage) => {
      try {
        switch (msg.type) {
          case MessageType.KNOWLEDGE_QUERY:
          case MessageType.EXPERIENCE_QUERY:
          case MessageType.REPRESENTATION_QUERY:
            await this.handleQuery(msg);
            break;
          case MessageType.KNOWLEDGE_RESPONSE:
          case MessageType.EXPERIENCE_RESPONSE:
          case MessageType.REPRESENTATION_RESPONSE:
            this.handleResponse(msg);
            break;
        }
      } catch (err) {
        logger.error('exchange_manager', 'error_handling_message', err, {
          messageId: msg.messageId,
          type: msg.type
        });
      }
    });
  }

  /**
   * Broadcasts a query to the most relevant peers found in the DHT
   */
  public async query(queryParam: Omit<ExchangeQuery, 'exchangeId'>): Promise<ExchangeResponse[]> {
    if (this.activeExchanges.size >= this.config.maxConcurrentExchanges) {
      throw new Error(`Max concurrent exchanges reached (${this.config.maxConcurrentExchanges})`);
    }

    const exchangeId = crypto.randomUUID();
    const query: ExchangeQuery = {
      ...queryParam,
      exchangeId
    };

    // Schema validation
    const parsedQuery = ExchangeQuerySchema.safeParse(query);
    if (!parsedQuery.success) {
      throw new Error(`Invalid exchange query: ${parsedQuery.error.message}`);
    }

    // Determine target concept (using topic, category, or default to self to find nearest)
    const targetHash = crypto.createHash('sha256').update(query.topic || query.category || this.cellId).digest('hex');
    
    // DHT Discovery
    const candidates = this.routing.getClosestPeers(targetHash, this.config.maxPeersQueried);
    if (candidates.length === 0) {
      logger.info('exchange_manager', 'no_peers_found', { exchangeId, queryType: query.queryType });
      return [];
    }

    logger.info('exchange_manager', 'querying_peers', { 
      exchangeId, 
      queryType: query.queryType,
      peerCount: candidates.length 
    });

    let msgType = MessageType.REPRESENTATION_QUERY;
    if (query.queryType === ExchangeType.enum.KNOWLEDGE) {
      msgType = MessageType.KNOWLEDGE_QUERY;
    } else if (query.queryType === ExchangeType.enum.EXPERIENCE) {
      msgType = MessageType.EXPERIENCE_QUERY;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const exchange = this.activeExchanges.get(exchangeId);
        if (exchange) {
          logger.warn('exchange_manager', 'exchange_timeout', { exchangeId });
          this.activeExchanges.delete(exchangeId);
          // Resolve with whatever we have so far instead of rejecting everything
          resolve(exchange.responses);
        }
      }, this.config.exchangeTimeoutMs);

      this.activeExchanges.set(exchangeId, {
        resolve,
        reject,
        timer,
        responses: []
      });

      // Send requests in parallel
      for (const peer of candidates) {
        try {
          this.transport.sendTo(peer.nodeId, msgType, query);
        } catch (err: any) {
          logger.debug('exchange_manager', 'failed_to_send_query', { peerId: peer.nodeId, error: err.message });
        }
      }
    });
  }

  private async handleQuery(msg: NetworkMessage) {
    const parseResult = ExchangeQuerySchema.safeParse(msg.payload);
    if (!parseResult.success) {
      logger.warn('exchange_manager', 'malformed_query', { error: parseResult.error });
      return;
    }

    const query = parseResult.data;
    logger.debug('exchange_manager', 'processing_query', { exchangeId: query.exchangeId, type: query.queryType });

    let response: ExchangeResponse = {
      exchangeId: query.exchangeId,
      queryType: query.queryType,
      status: 'NOT_FOUND'
    };

    try {
      if (query.queryType === ExchangeType.enum.KNOWLEDGE) {
        // Search knowledge
        const results = await this.memory.search({
          category: MemoryCategory.SEMANTIC,
          type: 'KNOWLEDGE_RECORD'
        });
        
        // Basic filtering
        let matched = results.map(r => r.content as any);
        if (query.topic) {
          matched = matched.filter(k => 
            k.title?.toLowerCase().includes(query.topic!.toLowerCase()) || 
            k.category === query.topic
          );
        }
        if (query.targetKnowledgeId) {
          matched = matched.filter(k => k.knowledgeId === query.targetKnowledgeId);
        }
        if (query.minConfidence !== undefined) {
          matched = matched.filter(k => k.confidence >= query.minConfidence!);
        }

        matched = matched.slice(0, query.maxResults);

        if (matched.length > 0) {
          const payloadSize = Buffer.byteLength(JSON.stringify(matched), 'utf8');
          if (payloadSize > this.config.maxKnowledgePayloadSize) {
            response.status = 'REJECTED';
            response.reason = 'Response payload exceeds budget size';
          } else {
            response.status = 'FOUND';
            response.knowledge = matched;
          }
        }
      } else if (query.queryType === ExchangeType.enum.EXPERIENCE) {
        // Search experiences
        const results = await this.memory.search({
          category: MemoryCategory.EPISODIC,
          type: 'EXPERIENCE_RECORD'
        });

        let matched = results.map(r => r.content as any);
        if (query.targetExperienceId) {
          matched = matched.filter(e => e.experienceId === query.targetExperienceId);
        }
        if (query.minConfidence !== undefined) {
          matched = matched.filter(e => e.confidence >= query.minConfidence!);
        }

        matched = matched.slice(0, query.maxResults);

        if (matched.length > 0) {
          const payloadSize = Buffer.byteLength(JSON.stringify(matched), 'utf8');
          if (payloadSize > this.config.maxExperiencePayloadSize) {
            response.status = 'REJECTED';
            response.reason = 'Response payload exceeds budget size';
          } else {
            response.status = 'FOUND';
            response.experiences = matched;
          }
        }
      } else if (query.queryType === ExchangeType.enum.CONCEPT) {
        // Query Cognitive Concepts
        const concepts = this.graph ? this.graph.getAllConcepts() : [];
        let matched = [...concepts];

        if (query.topic) {
          const t = query.topic.toLowerCase();
          matched = matched.filter(c => c.canonicalName.toLowerCase().includes(t) || c.description.toLowerCase().includes(t));
        }
        if (query.targetConceptId) {
          matched = matched.filter(c => c.conceptId === query.targetConceptId);
        }
        if (query.category) {
          matched = matched.filter(c => c.category === query.category);
        }
        if (query.minConfidence !== undefined) {
          matched = matched.filter(c => c.confidence >= query.minConfidence!);
        }

        matched = matched.slice(0, query.maxResults);
        if (matched.length > 0) {
          const payloadSize = Buffer.byteLength(JSON.stringify(matched), 'utf8');
          if (payloadSize > this.config.maxRepresentationPayloadSize) {
            response.status = 'REJECTED';
            response.reason = 'Response payload exceeds budget size';
          } else {
            response.status = 'FOUND';
            response.concepts = matched;
          }
        }
      } else if (query.queryType === ExchangeType.enum.ABSTRACTION) {
        const abstractions = this.graph ? this.graph.getAllAbstractions() : [];
        let matched = [...abstractions];

        if (query.targetAbstractionId) {
          matched = matched.filter(a => a.abstractionId === query.targetAbstractionId);
        }
        if (query.minConfidence !== undefined) {
          matched = matched.filter(a => a.confidence >= query.minConfidence!);
        }

        matched = matched.slice(0, query.maxResults);
        if (matched.length > 0) {
          const payloadSize = Buffer.byteLength(JSON.stringify(matched), 'utf8');
          if (payloadSize > this.config.maxRepresentationPayloadSize) {
            response.status = 'REJECTED';
            response.reason = 'Response payload exceeds budget size';
          } else {
            response.status = 'FOUND';
            response.abstractions = matched;
          }
        }
      } else if (query.queryType === ExchangeType.enum.GENERALIZATION) {
        const generalizations = this.graph ? this.graph.getAllGeneralizations() : [];
        let matched = [...generalizations];

        if (query.targetGeneralizationId) {
          matched = matched.filter(g => g.generalizationId === query.targetGeneralizationId);
        }
        if (query.minConfidence !== undefined) {
          matched = matched.filter(g => g.confidence >= query.minConfidence!);
        }

        matched = matched.slice(0, query.maxResults);
        if (matched.length > 0) {
          const payloadSize = Buffer.byteLength(JSON.stringify(matched), 'utf8');
          if (payloadSize > this.config.maxRepresentationPayloadSize) {
            response.status = 'REJECTED';
            response.reason = 'Response payload exceeds budget size';
          } else {
            response.status = 'FOUND';
            response.generalizations = matched;
          }
        }
      } else if (query.queryType === ExchangeType.enum.ANALOGY) {
        const analogies = this.graph ? this.graph.getAllAnalogies() : [];
        let matched = [...analogies];

        if (query.targetAnalogyId) {
          matched = matched.filter(a => a.analogyId === query.targetAnalogyId);
        }
        if (query.minConfidence !== undefined) {
          matched = matched.filter(a => a.confidence >= query.minConfidence!);
        }

        matched = matched.slice(0, query.maxResults);
        if (matched.length > 0) {
          const payloadSize = Buffer.byteLength(JSON.stringify(matched), 'utf8');
          if (payloadSize > this.config.maxRepresentationPayloadSize) {
            response.status = 'REJECTED';
            response.reason = 'Response payload exceeds budget size';
          } else {
            response.status = 'FOUND';
            response.analogies = matched;
          }
        }
      }
    } catch (err: any) {
      logger.error('exchange_manager', 'query_processing_error', err);
      response.status = 'REJECTED';
      response.reason = 'Internal processing error';
    }

    let respType = MessageType.REPRESENTATION_RESPONSE;
    if (query.queryType === ExchangeType.enum.KNOWLEDGE) {
      respType = MessageType.KNOWLEDGE_RESPONSE;
    } else if (query.queryType === ExchangeType.enum.EXPERIENCE) {
      respType = MessageType.EXPERIENCE_RESPONSE;
    }

    this.transport.sendTo(msg.senderId, respType, response, msg.messageId);
  }

  private handleResponse(msg: NetworkMessage) {
    const parseResult = ExchangeResponseSchema.safeParse(msg.payload);
    if (!parseResult.success) {
      logger.warn('exchange_manager', 'malformed_response', { error: parseResult.error });
      return;
    }

    const response = parseResult.data;
    const exchange = this.activeExchanges.get(response.exchangeId);
    if (!exchange) {
      return; // Unknown or expired exchange
    }

    exchange.responses.push(response);

    // If we have enough responses, resolve early
    if (exchange.responses.length >= this.config.maxResponsesPerQuery) {
      clearTimeout(exchange.timer);
      this.activeExchanges.delete(response.exchangeId);
      exchange.resolve(exchange.responses);
    }
  }

  public async assimilate(knowledge: any, experience?: any, sourcePeerId?: string) {
    return this.metabolism.assimilateKnowledge(knowledge, experience, sourcePeerId);
  }

  /**
   * P5.1: Assimilate external cognitive representations (concepts, relations, abstractions, generalizations, analogies).
   * Enforces schema validation, memory isolation (owned by local cellId), non-destructive conflict preservation, and verification bounds.
   */
  public async assimilateRepresentation(
    payload: {
      concepts?: CognitiveConcept[];
      relations?: CognitiveRelation[];
      abstractions?: CognitiveAbstraction[];
      generalizations?: CognitiveGeneralization[];
      analogies?: CognitiveAnalogy[];
    },
    sourcePeerId?: string
  ): Promise<{ accepted: number; rejected: number; reasons: string[] }> {
    if (!this.graph) {
      return { accepted: 0, rejected: 1, reasons: ['No CognitiveGraph attached to ExchangeManager'] };
    }

    let accepted = 0;
    let rejected = 0;
    const reasons: string[] = [];
    const provenanceOrigin = sourcePeerId || 'external_peer';

    // 1. Ingest Concepts
    if (payload.concepts) {
      for (const concept of payload.concepts) {
        const parse = CognitiveConceptSchema.safeParse(concept);
        if (!parse.success) {
          rejected++;
          reasons.push(`Invalid concept schema: ${parse.error.message}`);
          continue;
        }

        const validConcept = parse.data;
        // Check conflict with existing concept
        const existing = this.graph.getConcept(validConcept.conceptId) || this.graph.findConceptByName(validConcept.canonicalName);
        if (existing && existing.conceptId !== validConcept.conceptId) {
          // Preserve conflict non-destructively
          await this.graph.preserveConflict(
            existing.conceptId,
            validConcept.conceptId,
            `Assimilated concept '${validConcept.canonicalName}' conflicts with existing concept '${existing.canonicalName}'`
          );
        }

        // Clone with local cell provenance and bounded verification status
        const localConcept: CognitiveConcept = {
          ...validConcept,
          originatingCellId: validConcept.originatingCellId || provenanceOrigin,
          provenance: [...(validConcept.provenance || []), this.cellId],
          verificationStatus: validConcept.verificationStatus === RepresentationVerificationStatus.VERIFIED
            ? RepresentationVerificationStatus.SUPPORTED // Do not automatically accept external as fully VERIFIED
            : validConcept.verificationStatus,
          confidence: Math.min(validConcept.confidence, 0.90) // Cap untrusted external confidence
        };

        await this.graph.insertConcept(localConcept);
        accepted++;
      }
    }

    // 2. Ingest Relations
    if (payload.relations) {
      for (const relation of payload.relations) {
        const parse = CognitiveRelationSchema.safeParse(relation);
        if (!parse.success) {
          rejected++;
          reasons.push(`Invalid relation schema: ${parse.error.message}`);
          continue;
        }

        const validRel = parse.data;
        const localRel: CognitiveRelation = {
          ...validRel,
          originatingCellId: validRel.originatingCellId || provenanceOrigin,
          provenance: [...(validRel.provenance || []), this.cellId],
          confidence: Math.min(validRel.confidence, 0.90)
        };

        await this.graph.insertRelation(localRel);
        accepted++;
      }
    }

    // 3. Ingest Abstractions
    if (payload.abstractions) {
      for (const abs of payload.abstractions) {
        const parse = CognitiveAbstractionSchema.safeParse(abs);
        if (!parse.success) {
          rejected++;
          reasons.push(`Invalid abstraction schema: ${parse.error.message}`);
          continue;
        }

        const validAbs = parse.data;
        const localAbs: CognitiveAbstraction = {
          ...validAbs,
          originatingCellId: validAbs.originatingCellId || provenanceOrigin,
          provenance: [...(validAbs.provenance || []), this.cellId],
          confidence: Math.min(validAbs.confidence, 0.90)
        };

        await this.graph.insertAbstraction(localAbs);
        accepted++;
      }
    }

    // 4. Ingest Generalizations
    if (payload.generalizations) {
      for (const gen of payload.generalizations) {
        const parse = CognitiveGeneralizationSchema.safeParse(gen);
        if (!parse.success) {
          rejected++;
          reasons.push(`Invalid generalization schema: ${parse.error.message}`);
          continue;
        }

        const validGen = parse.data;
        const localGen: CognitiveGeneralization = {
          ...validGen,
          originatingCellId: validGen.originatingCellId || provenanceOrigin,
          provenance: [...(validGen.provenance || []), this.cellId],
          // External generalizations must have verification status marked as PENDING if not supported locally yet
          verificationStatus: RepresentationVerificationStatus.PENDING,
          confidence: Math.min(validGen.confidence, 0.85)
        };

        await this.graph.insertGeneralization(localGen);
        accepted++;
      }
    }

    // 5. Ingest Analogies
    if (payload.analogies) {
      for (const analogy of payload.analogies) {
        const parse = CognitiveAnalogySchema.safeParse(analogy);
        if (!parse.success) {
          rejected++;
          reasons.push(`Invalid analogy schema: ${parse.error.message}`);
          continue;
        }

        const validAna = parse.data;
        // Verify structural mappings: must have at least 1 mapped relation
        if (!validAna.mappedRelations || validAna.mappedRelations.length === 0) {
          rejected++;
          reasons.push('Analogy rejected: lacks structural relation mapping');
          continue;
        }

        const localAna: CognitiveAnalogy = {
          ...validAna,
          originatingCellId: validAna.originatingCellId || provenanceOrigin,
          provenance: [...(validAna.provenance || []), this.cellId],
          confidence: Math.min(validAna.confidence, 0.88)
        };

        await this.graph.insertAnalogy(localAna);
        accepted++;
      }
    }

    logger.info('exchange_manager', 'assimilate_representation_completed', {
      cellId: this.cellId,
      accepted,
      rejected,
      sourcePeerId
    });

    return { accepted, rejected, reasons };
  }

  public stop() {
    for (const [id, exchange] of this.activeExchanges.entries()) {
      clearTimeout(exchange.timer);
      exchange.reject(new Error('ExchangeManager stopped'));
    }
    this.activeExchanges.clear();
  }
}

