import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../core/logger';
import { P2PTransport } from '../network/transport';
import { MessageType, NetworkMessage } from '../network/protocol';
import { RoutingTable } from '../dht/routing';
import { MemoryStore, MemoryCategory } from '../memory/store';
import { MetabolismEngine } from '../metabolism/engine';
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
  maxRetries: number;
}

const DEFAULT_EXCHANGE_CONFIG: ExchangeConfig = {
  maxConcurrentExchanges: 10,
  maxPeersQueried: 5,
  maxResponsesPerQuery: 10,
  exchangeTimeoutMs: 15000,
  maxKnowledgePayloadSize: 64 * 1024,
  maxExperiencePayloadSize: 64 * 1024,
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
            await this.handleQuery(msg);
            break;
          case MessageType.KNOWLEDGE_RESPONSE:
          case MessageType.EXPERIENCE_RESPONSE:
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

    const msgType = query.queryType === ExchangeType.enum.KNOWLEDGE 
      ? MessageType.KNOWLEDGE_QUERY 
      : MessageType.EXPERIENCE_QUERY;

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
        
        // Basic filtering (in real impl this would be index-backed)
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
          // Check payload size
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
      }
    } catch (err: any) {
      logger.error('exchange_manager', 'query_processing_error', err);
      response.status = 'REJECTED';
      response.reason = 'Internal processing error';
    }

    const respType = query.queryType === ExchangeType.enum.KNOWLEDGE 
      ? MessageType.KNOWLEDGE_RESPONSE 
      : MessageType.EXPERIENCE_RESPONSE;

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

  public stop() {
    for (const [id, exchange] of this.activeExchanges.entries()) {
      clearTimeout(exchange.timer);
      exchange.reject(new Error('ExchangeManager stopped'));
    }
    this.activeExchanges.clear();
  }
}
