import express from 'express';
import path from 'path';
import * as fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { Cell } from './src/redqueen/core/cell';
import { logger } from './src/redqueen/core/logger';
import { RepresentationVerificationStatus } from './src/redqueen/cognition/representation/types';
import { InformationCategory } from './src/redqueen/metabolism/types';
import dotenv from 'dotenv';

dotenv.config();

// Persistent cell identity storage requires a secret for key encryption.
// If REDQUEEN_STORAGE_SECRET is not provided via environment or .env, use a dev fallback so server starts reliably.
const storageSecret =
  process.env.REDQUEEN_STORAGE_SECRET?.trim() ||
  'redqueen-dev-secret-32-chars-key-2026!';

function parseCSV(text: string) {
  const lines: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (char === '\"') {
      if (inQuotes && nextChar === '\"') {
        current += '\"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(current);
      if (row.length > 0 && (row.length > 1 || row[0] !== '')) {
        lines.push(row);
      }
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  if (current || row.length > 0) {
    row.push(current);
    lines.push(row);
  }
  return lines;
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json());

  const apiToken = process.env.REDQUEEN_API_TOKEN?.trim();
  if (process.env.NODE_ENV === 'production' && !apiToken) {
    throw new Error('REDQUEEN_API_TOKEN is required in production');
  }
  app.use('/api', (req, res, next) => {
    if (req.path === '/health' || req.path === '/health/') return next();
    if (!apiToken) return next();
    const authorization = req.header('authorization');
    const supplied = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : req.header('x-api-key');
    if (!supplied || supplied !== apiToken) {
      return res.status(401).json({ error: 'authentication required' });
    }
    return next();
  });

  // Instantiate sovereign RedQueen Cell (100% Edge Local, Zero External Cloud/LLM Dependency)
  logger.info('server', 'sovereign_mode_active', {
    engine: 'Red Queen Neuro-Symbolic Cognitive Architecture',
    cloudDependency: 'NONE (100% Local Sovereign Edge)'
  });
  
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const cell = new Cell('./data/memory.json', '', undefined, undefined, undefined, { storageSecret });
  
  const p2pPort = parseInt(process.env.P2P_PORT || '3001', 10);
  if (p2pPort > 0) {
    try {
      cell.transport.setEndpoint(`ws://127.0.0.1:${p2pPort}`);
    } catch {
      // safe fallback if already set
    }
  }

  try {
    await cell.start(p2pPort);
    logger.info('server', 'p2p_active', { 
      port: cell.transport.getPort(), 
      endpoint: cell.transport.publicEndpoint 
    });
  } catch (err: any) {
    if (err?.code === 'EADDRINUSE') {
      logger.warn('server', 'p2p_port_collision_fallback', { requestedPort: p2pPort, error: err.message });
      await cell.start(0);
      logger.info('server', 'p2p_active_ephemeral', { 
        port: cell.transport.getPort(), 
        endpoint: cell.transport.publicEndpoint 
      });
    } else {
      throw err;
    }
  }

  logger.info('server', 'autonomous_lifelong_learning_daemon_active', { intervalMs: 15000 });

  // Optional multi-process swarm bootstrap. A node can advertise a comma-separated
  // list of ws:// or wss:// peer endpoints through P2P_PEERS. Connections are
  // attempted after the local listener is ready and one unavailable peer must not
  // prevent the cell or HTTP API from starting.
  const peerEndpoints = (process.env.P2P_PEERS || '')
    .split(',')
    .map(endpoint => endpoint.trim())
    .filter(Boolean);
  for (const endpoint of peerEndpoints) {
    try {
      await cell.connectToPeer(endpoint);
      logger.info('server', 'p2p_peer_connected', { endpoint });
    } catch (error) {
      logger.warn('server', 'p2p_peer_connection_failed', { endpoint, error: String(error) });
    }
  }

  // Bootstrap foundational cyber topology via canonical metabolism if empty
  if (cell.cognitiveGraph.getAllConcepts().length === 0) {
    try {
      const initInputs = [
        {
          sourceType: 'LOCAL_DATA',
          sourceIdentifier: 'SYSTEM_BOOT',
          contentType: 'text/plain',
          content: 'SecurityTelemetryMonitor active: Continuous edge-node security telemetry collection and invariant monitoring online.'
        },
        {
          sourceType: 'LOCAL_DATA',
          sourceIdentifier: 'NETWORK_INITIALIZER',
          contentType: 'text/plain',
          content: 'DistributedKademliaMesh operational: P2P overlay with cryptographic node verification and SHA-256 routing table.'
        },
        {
          sourceType: 'LOCAL_DATA',
          sourceIdentifier: 'THREAT_DAEMON',
          contentType: 'text/plain',
          content: 'AutonomousThreatIntelligence engine initialized: Automated anomaly detection, OSINT parsing, and intrusion signature correlation.'
        }
      ];

      for (const item of initInputs) {
        const metaRes = await cell.metabolize(item as any);
        if (metaRes.status === 'ACCEPTED' && metaRes.knowledgeId) {
          const conceptId = `con_${metaRes.knowledgeId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
          const evId = `ev_init_${metaRes.informationId}`;
          await cell.cognitiveGraph.insertEvidence({
            evidenceId: evId,
            sourceId: cell.nodeId,
            observationId: metaRes.informationId,
            timestamp: new Date().toISOString(),
            confidence: 0.9,
            context: { contextId: 'ctx_system_boot', domain: 'CYBER_SECURITY' },
            provenance: {
              sourceId: cell.nodeId,
              timestamp: new Date().toISOString(),
              supportingRepresentationIds: [conceptId],
              derivedFrom: [metaRes.informationId]
            }
          });

          await cell.cognitiveGraph.insertConcept({
            conceptId,
            canonicalName: item.content.split(':')[0].trim(),
            description: item.content,
            category: InformationCategory.CYBERSECURITY,
            sourceKnowledgeIds: [metaRes.knowledgeId],
            sourceExperienceIds: [],
            evidenceIds: [evId],
            confidence: 0.85,
            provenance: [cell.nodeId, metaRes.informationId],
            verificationStatus: RepresentationVerificationStatus.SUPPORTED,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
            originatingCellId: cell.nodeId,
            metadata: { autoBootstrapped: true }
          });
        }
      }
    } catch (err: any) {
      logger.warn('server', 'initial_metabolism_bootstrap_skipped', { message: err?.message });
    }
  }

  // Asynchronously populate foundational 100,000 knowledge mesh in background
  setTimeout(() => {
    cell.neuroSymbolic.knowledgeBase.populateMassiveCorpus(100000).catch(err => {
      logger.warn('server', 'background_knowledge_corpus_failed', { error: String(err) });
    });
  }, 1000);

  // Start Wikipedia Real-World Knowledge Ingestion Pipeline in background (target: 10,000 real facts)
  setTimeout(() => {
    cell.neuroSymbolic.wikiPipeline.start(10000);
  }, 2500);

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      cell: cell.getStatus()
    });
  });

  app.get('/api/integrity/status', (req, res) => {
    res.json(cell.integrity.getLockdownReport());
  });

  app.post('/api/integrity/audit', async (req, res) => {
    try {
      if (cell.cognitiveGraph?.pruneOrphanedRelations) {
        await cell.cognitiveGraph.pruneOrphanedRelations();
      }
      const report = await cell.integrity.runDeepSystemAudit(cell);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/integrity/reset', async (req, res) => {
    if (cell.cognitiveGraph?.pruneOrphanedRelations) {
      await cell.cognitiveGraph.pruneOrphanedRelations();
    }
    cell.integrity.resetLockdownAfterRepair();
    res.json({ success: true, message: 'Lockdown reset' });
  });

  app.get('/api/benchmark/dataset', async (req, res) => {
    try {
      const memBefore = process.memoryUsage().heapUsed;
      const startTime = Date.now();

      // Read real dataset
      const csvPath = path.join(process.cwd(), 'test', 'fixtures', 'input_dataset.csv');
      const csvData = fs.readFileSync(csvPath, 'utf-8');
      const rows = parseCSV(csvData);
      const records = rows.slice(1).map((parts, idx) => ({
        id: idx + 1,
        kalimat: parts[0],
        sentiment: parseInt(parts[1], 10) || 0
      }));

      // Setup cells
      const orch = new Cell(':memory:', 'bench_orch', undefined, undefined, undefined, { storageSecret: 'bench_secret', capabilities: ['SWARM_COORDINATION'] as any, specialization: 'ORCHESTRATOR' });
      const w1 = new Cell(':memory:', 'bench_w1', undefined, undefined, undefined, { storageSecret: 'bench_secret', capabilities: ['INFO_PROCESSING'] as any, specialization: 'WORKER_ALPHA' });
      const w2 = new Cell(':memory:', 'bench_w2', undefined, undefined, undefined, { storageSecret: 'bench_secret', capabilities: ['INFO_PROCESSING'] as any, specialization: 'WORKER_BETA' });
      const w3 = new Cell(':memory:', 'bench_w3', undefined, undefined, undefined, { storageSecret: 'bench_secret', capabilities: ['INFO_PROCESSING'] as any, specialization: 'WORKER_GAMMA' });

      await orch.start(41101);
      await w1.start(41102);
      await w2.start(41103);
      await w3.start(41104);

      await orch.connectToPeer('ws://localhost:41102');
      await orch.connectToPeer('ws://localhost:41103');
      await orch.connectToPeer('ws://localhost:41104');
      await new Promise(r => setTimeout(r, 1500)); // Handshake delay

      const numPartitions = 3;
      const chunkSize = Math.ceil(records.length / numPartitions);
      const subtasks = [];
      const specializations = ['WORKER_ALPHA', 'WORKER_BETA', 'WORKER_GAMMA'];
      
      for (let i = 0; i < numPartitions; i++) {
        const chunk = records.slice(i * chunkSize, (i + 1) * chunkSize);
        if (chunk.length > 0) {
          subtasks.push({
            type: 'DATA_TRANSFORMATION',
            payload: { items: chunk, transformation: 'SENTIMENT_FREQUENCY_AGGREGATION' },
            requiredCapabilities: ['INFO_PROCESSING'],
            requiredSpecialization: specializations[i]
          });
        }
      }

      const task = orch.collectiveComputation.createTask({
        goal: 'Distributed Dataset Processing Benchmark',
        computationType: 'DATA_TRANSFORMATION',
        payload: { subtasks }
      });

      const dispatchStart = Date.now();
      const executionResult = await orch.collectiveComputation.executeTask(task);
      const dispatchTime = Date.now() - dispatchStart;

      await orch.stop();
      await w1.stop();
      await w2.stop();
      await w3.stop();

      const memAfter = process.memoryUsage().heapUsed;
      const memOverhead = memAfter - memBefore;
      const totalTime = Date.now() - startTime;

      res.json({
        metrics: {
          datasetSize: records.length,
          partitions: numPartitions,
          nodesUsed: 4,
          dispatchAndExecutionTimeMs: dispatchTime,
          communicationCostMs: (executionResult.finalOutput as any).costs?.communicationCost || 0,
          synchronizationCostMs: (executionResult.finalOutput as any).costs?.synchronizationCost || 0,
          verificationCostMs: (executionResult.finalOutput as any).costs?.verificationCost || 0,
          totalRoundTripTimeMs: totalTime,
          memoryOverheadMb: parseFloat((memOverhead / 1024 / 1024).toFixed(2))
        },
        executionResult
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/cell/status', (req, res) => {
    res.json(cell.getStatus());
  });

  app.get('/api/cell/genome', (req, res) => {
    res.json(cell.genome);
  });

  app.get('/api/cell/lineage', (req, res) => {
    res.json(cell.lineage);
  });

  app.get('/api/cell/cognitive-state', (req, res) => {
    res.json(cell.cognitiveState.getState());
  });

  app.post('/api/cell/metabolize', async (req, res) => {
    try {
      if (!cell.integrity.isSystemOperable()) {
        return res.status(503).json({
          error: '[CRITICAL SYSTEM LOCKDOWN] Red Queen system is halted due to integrity anomaly.',
          lockdown: cell.integrity.getLockdownReport()
        });
      }
      const result = await cell.metabolize(req.body);
      const statusCode = result.status === 'ACCEPTED' ? 200 : (result.status === 'INVALID' ? 400 : 202);
      if (result.status === 'ACCEPTED' && req.body.content) {
        cell.neuroSymbolic.learnConcept(req.body.content, req.body.category || 'TRAINED_KNOWLEDGE');
      }
      res.status(statusCode).json(result);
    } catch (err: any) {
      if (err.name === 'SystemIntegrityLockdownError' || !cell.integrity.isSystemOperable()) {
        return res.status(503).json({
          error: err.message,
          lockdown: cell.integrity.getLockdownReport()
        });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/learning/train', async (req, res) => {
    try {
      const { samples, validationSamples, epochs, learningRate } = req.body;
      if (!Array.isArray(samples) || samples.length === 0) {
        return res.status(400).json({ error: 'samples must be a non-empty array' });
      }
      const validSamples = samples.filter((sample: any) =>
        sample && typeof sample.text === 'string' && (sample.target === 0 || sample.target === 1)
      );
      if (validSamples.length !== samples.length) {
        return res.status(400).json({ error: 'each sample requires text and binary target 0 or 1' });
      }
      const validValidationSamples = validationSamples === undefined ? validSamples : validationSamples;
      if (!Array.isArray(validValidationSamples) || validValidationSamples.some((sample: any) =>
        !sample || typeof sample.text !== 'string' || (sample.target !== 0 && sample.target !== 1)
      )) {
        return res.status(400).json({ error: 'validationSamples must contain text and binary target 0 or 1' });
      }
      const result = await cell.learning.train(validSamples, epochs, learningRate, validValidationSamples);
      res.json({ status: 'trained', result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/learning/train-dataset', async (req, res) => {
    try {
      const { records, epochs, learningRate } = req.body;
      if (!Array.isArray(records) || records.length < 2) {
        return res.status(400).json({ error: 'records must contain at least two text records' });
      }
      const result = await cell.learning.trainDataset(records, epochs, learningRate);
      res.json({ status: 'trained_dataset', result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/learning/infer', async (req, res) => {
    try {
      if (typeof req.body?.text !== 'string' || !req.body.text.trim()) {
        return res.status(400).json({ error: 'text is required' });
      }
      res.json({ result: cell.learning.infer(req.body.text) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/cell/metabolism/events', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string || '100', 10);
      res.json({ events: cell.metabolism.audit.getEvents(limit) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/cell/metabolism/vitality', (req, res) => {
    try {
      res.json({
        vitality: cell.metabolism.vitality.getSnapshot(),
        telemetry: cell.metabolism.vitality.getTelemetry(),
        recentSurvivalEvents: cell.metabolism.vitality.getSurvivalEvents(50)
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cell/metabolism/survival', (req, res) => {
    try {
      const { action, atpAmount, pruneLowConfidence } = req.body;
      if (action === 'CONSUME') {
        const spent = cell.metabolism.vitality.consumeAtp(atpAmount || 10, 'MANUAL_STRESS_TEST');
        return res.json({ success: true, action: 'CONSUME', spent, vitality: cell.metabolism.vitality.getSnapshot() });
      }
      if (action === 'FEED') {
        const generated = cell.metabolism.vitality.generateAtp(atpAmount || 20, 'MANUAL_NUTRIENT_INJECTION');
        return res.json({ success: true, action: 'FEED', generated, vitality: cell.metabolism.vitality.getSnapshot() });
      }
      if (action === 'CLEAR_WASTE') {
        const cleared = cell.metabolism.vitality.glymphaticClearance(0.9);
        return res.json({ success: true, action: 'CLEAR_WASTE', clearedWaste: cleared, vitality: cell.metabolism.vitality.getSnapshot() });
      }
      if (action === 'RESTRUCTURE') {
        const resRestruct = cell.metabolism.vitality.restructureReasoningPathways({
          hypothesisPruner: pruneLowConfidence ? () => cell.neuroSymbolic.lifelongLearning.hypothesis.pruneSpeculativeHypotheses() : undefined
        });
        return res.json({ success: true, action: 'RESTRUCTURE', result: resRestruct, vitality: cell.metabolism.vitality.getSnapshot() });
      }
      const pressure = cell.metabolism.vitality.evaluateVitality();
      res.json({ success: true, pressure, vitality: cell.metabolism.vitality.getSnapshot() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/cell/cognitive-graph', (req, res) => {
    try {
      res.json({
        concepts: cell.cognitiveGraph.getAllConcepts(),
        relations: cell.cognitiveGraph.getAllRelations(),
        abstractions: cell.cognitiveGraph.getAllAbstractions(),
        generalizations: cell.cognitiveGraph.getAllGeneralizations(),
        analogies: cell.cognitiveGraph.getAllAnalogies(),
        conflicts: cell.cognitiveGraph.getAllConflicts(),
        evidences: cell.cognitiveGraph.getAllEvidences(),
        budget: cell.cognitiveGraph.getBudget()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cell/cognitive-graph/concept', async (req, res) => {
    try {
      const { canonicalName, category, description, confidence } = req.body;
      if (!canonicalName) {
        return res.status(400).json({ error: 'canonicalName is required' });
      }
      const now = new Date().toISOString();
      const conceptId = 'con_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
      const concept = await cell.cognitiveGraph.insertConcept({
        conceptId,
        canonicalName,
        category: category || 'SYSTEM_OBSERVATION',
        description: description || 'User-defined operational concept',
        confidence: typeof confidence === 'number' ? confidence : 0.85,
        sourceKnowledgeIds: ['kn_user_entry_' + Date.now()],
        sourceExperienceIds: [],
        originatingCellId: cell.nodeId,
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        createdAt: now,
        updatedAt: now,
        version: 1,
        provenance: [cell.nodeId],
        metadata: { userDefined: true }
      });
      res.json({ concept });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cell/reason', (req, res) => {
    try {
      const { goal, context, premises, hypotheses, alternatives } = req.body;
      const chain = cell.reasoning.reason({
        goal: goal || 'Autonomous reasoning inquiry',
        context: context || { contextId: 'ctx_inquiry', domain: 'CYBER_SECURITY' },
        originatingCellId: cell.nodeId,
        premises: premises || [],
        hypotheses: hypotheses || [],
        alternatives: alternatives || []
      }, cell.cognitiveGraph);
      res.json({ chain });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/cell/reasoning', (req, res) => {
    try {
      res.json({ chains: cell.reasoning.getAllChains() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/cell/reasoning/:chainId', (req, res) => {
    try {
      const chain = cell.reasoning.getChain(req.params.chainId);
      if (!chain) {
        return res.status(404).json({ error: 'Chain not found' });
      }
      res.json({ chain });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/cell/knowledge', async (req, res) => {
    try {
      const entries = await cell.memory.search({ category: 'SEMANTIC' as any });
      const knowledge = entries.filter(e => e.type === 'KNOWLEDGE_RECORD' || e.content?.knowledgeId);
      res.json({ data: knowledge });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/observe', async (req, res) => {
    try {
      const { observation } = req.body;
      if (!observation || typeof observation !== 'string') {
        return res.status(400).json({ error: 'observation string required' });
      }

      // The legacy CognitionPipeline is deliberately blocked. Observations must enter
      // through the canonical CognitiveRuntime so the response reflects actual processing.
      const result = await cell.processCognitiveRequest({
        requestId: `api_observation_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        creatorInput: observation,
        context: {
          contextId: 'ctx_api_observation',
          domain: 'GENERAL'
        },
        timestamp: new Date().toISOString()
      });

      // Synchronize observation into sovereign Neuro-Symbolic HDC memory
      cell.neuroSymbolic.learnConcept(observation, 'OBSERVATION');

      const statusCode = result.status === 'SUCCESS' ? 200 : 422;
      res.status(statusCode).json({ status: result.status.toLowerCase(), result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      if (!cell.integrity.isSystemOperable()) {
        return res.status(503).json({
          error: '[CRITICAL SYSTEM LOCKDOWN] Red Queen system is halted due to integrity anomaly.',
          lockdown: cell.integrity.getLockdownReport()
        });
      }
      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message string required' });
      }

      logger.info('api', 'chat_request_sovereign_neuro_symbolic', { messageLength: message.length });
      const nativeResult = await cell.neuroSymbolic.processChat(message, { tonePreference: req.body?.tonePreference });

      // Continuously assimilate user interaction into local HDC associative memory
      cell.neuroSymbolic.learnConcept(message, 'USER_QUERY');

      return res.json({
        response: nativeResult.statement,
        telemetry: nativeResult.telemetry,
        confidence: nativeResult.confidence,
        reasoningSteps: nativeResult.reasoningSteps,
        fluidSynthesis: nativeResult.fluidSynthesis,
        model: 'red-queen-native-sovereign'
      });
    } catch (err: any) {
      if (err.name === 'SystemIntegrityLockdownError' || !cell.integrity.isSystemOperable()) {
        return res.status(503).json({
          error: err.message,
          lockdown: cell.integrity.getLockdownReport()
        });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/neuro-symbolic/status', (req, res) => {
    try {
      const experts = cell.neuroSymbolic.moeRouter.getExperts().map(e => ({
        id: (e as any).id || e.name,
        name: e.name,
        specialization: (e as any).specialization || e.domain
      }));
      res.json({
        hdcDimension: cell.neuroSymbolic.hdcDimension,
        associativeMemoryCount: cell.neuroSymbolic.associativeMemory.size,
        experts,
        ssmStateDim: cell.neuroSymbolic.ssmCell.stateDim,
        status: 'ONLINE'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/neuro-symbolic/learn', (req, res) => {
    try {
      const { text, category } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'text is required' });
      }
      const vector = cell.neuroSymbolic.learnConcept(text, category || 'EPISODIC');
      res.json({
        status: 'LEARNED',
        concept: text,
        activeBits: vector.countActiveBits(),
        sparsity: vector.sparsity(),
        memoryTotal: cell.neuroSymbolic.associativeMemory.size
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/neuro-symbolic/query', (req, res) => {
    try {
      const { query, topK } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query string required' });
      }
      const matches = cell.neuroSymbolic.queryAssociativeMemory(query, topK || 5);
      res.json({ query, matches });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/neuro-symbolic/chat', async (req, res) => {
    try {
      const { prompt, tonePreference } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'prompt is required' });
      }
      const result = await cell.neuroSymbolic.processChat(prompt, { tonePreference });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/benchmark/neuro-symbolic', (req, res) => {
    try {
      const iterations = parseInt(req.query.iterations as string || '2000', 10);
      const metrics = cell.neuroSymbolic.runHardwareBenchmark(iterations);
      res.json({
        timestamp: new Date().toISOString(),
        iterations,
        metrics
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/knowledge/stats', (req, res) => {
    try {
      res.json(cell.neuroSymbolic.knowledgeBase.getStats());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/knowledge/populate', async (req, res) => {
    try {
      const targetCount = Math.min(100000, parseInt(req.body?.targetCount || '100000', 10));
      const total = await cell.neuroSymbolic.knowledgeBase.populateMassiveCorpus(targetCount);
      res.json({
        status: 'POPULATED',
        totalFacts: total,
        stats: cell.neuroSymbolic.knowledgeBase.getStats()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/knowledge/search', (req, res) => {
    try {
      const { query, topK, domain } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query string required' });
      }
      const matches = cell.neuroSymbolic.knowledgeBase.search(query, topK || 5, domain);
      res.json({ query, matches, count: matches.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/wiki/status', (req, res) => {
    try {
      res.json(cell.neuroSymbolic.wikiPipeline.getStatus());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/wiki/start', (req, res) => {
    try {
      const target = parseInt(req.body?.target || '10000', 10);
      cell.neuroSymbolic.wikiPipeline.start(target);
      res.json({
        status: 'STARTED',
        pipeline: cell.neuroSymbolic.wikiPipeline.getStatus()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/wiki/pause', (req, res) => {
    try {
      cell.neuroSymbolic.wikiPipeline.pause();
      res.json({
        status: 'PAUSED',
        pipeline: cell.neuroSymbolic.wikiPipeline.getStatus()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/wiki/step', async (req, res) => {
    try {
      const added = await cell.neuroSymbolic.wikiPipeline.executeIngestionStep();
      res.json({
        status: 'STEP_EXECUTED',
        added,
        pipeline: cell.neuroSymbolic.wikiPipeline.getStatus()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/wiki/facts', (req, res) => {
    try {
      const page = parseInt(req.query.page as string || '1', 10);
      const pageSize = parseInt(req.query.pageSize as string || '20', 10);
      const domain = req.query.domain as string || undefined;
      const data = cell.neuroSymbolic.wikiPipeline.getFacts(page, pageSize, domain);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/wiki/search', (req, res) => {
    try {
      const { query, domain, limit } = req.body;
      const results = cell.neuroSymbolic.wikiPipeline.searchFacts(
        query || '',
        domain,
        limit ? parseInt(limit, 10) : 20
      );
      res.json({ query, domain, results, count: results.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Phase 8: Lifelong Learning & Epistemic Discovery Endpoints ---
  app.get('/api/lifelong/status', (req, res) => {
    try {
      res.json(cell.neuroSymbolic.lifelongLearning.getTelemetry());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/lifelong/curiosity/scan', (req, res) => {
    try {
      const maxGaps = parseInt(req.body?.maxGaps || '5', 10);
      const gaps = cell.neuroSymbolic.lifelongLearning.curiosity.scanForGaps(maxGaps);
      res.json({ gaps, count: gaps.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/lifelong/curiosity/investigate', (req, res) => {
    try {
      const { gapId } = req.body;
      const result = cell.neuroSymbolic.lifelongLearning.curiosity.investigateGap(gapId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/lifelong/analogy/synthesize', (req, res) => {
    try {
      const { sourceDomain, targetDomain } = req.body;
      const analogy = cell.neuroSymbolic.lifelongLearning.synthesizeAnalogy(sourceDomain, targetDomain);
      res.json(analogy);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/lifelong/hypothesis/generate', (req, res) => {
    try {
      const { topic, atpStake } = req.body;
      const result = cell.neuroSymbolic.lifelongLearning.generateAndVerifyHypothesis(topic, atpStake ? parseInt(atpStake, 10) : 10);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/lifelong/sleep/consolidate', (req, res) => {
    try {
      const report = cell.neuroSymbolic.lifelongLearning.triggerSleepConsolidation();
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/lifelong/discoveries', (req, res) => {
    try {
      const discoveries = cell.neuroSymbolic.lifelongLearning.hypothesis.getDiscoveries();
      res.json({ discoveries, count: discoveries.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/lifelong/gaps', (req, res) => {
    try {
      const gaps = cell.neuroSymbolic.lifelongLearning.curiosity.getActiveGaps();
      res.json({ gaps, count: gaps.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/lifelong/daemon/toggle', (req, res) => {
    try {
      const telemetry = cell.neuroSymbolic.lifelongLearning.getTelemetry();
      if (telemetry.isDaemonActive) {
        cell.neuroSymbolic.lifelongLearning.stopAutonomousDaemon();
      } else {
        cell.neuroSymbolic.lifelongLearning.startAutonomousDaemon(15000);
      }
      res.json(cell.neuroSymbolic.lifelongLearning.getTelemetry());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/lifelong/cycle/run', (req, res) => {
    try {
      const result = cell.neuroSymbolic.lifelongLearning.runLearningCycle();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/lifelong/telemetry', (req, res) => {
    try {
      res.json(cell.neuroSymbolic.lifelongLearning.getTelemetry());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/p2p/status', (req, res) => {
    try {
      const peers = cell.transport.getPeers();
      const authenticatedPeers = peers.filter(p => p.getState() === 'AUTHENTICATED');
      const actualPort = cell.transport.getPort();
      res.json({
        nodeId: cell.nodeId,
        p2pPort: actualPort,
        publicEndpoint: cell.transport.publicEndpoint || (actualPort > 0 ? `ws://127.0.0.1:${actualPort}` : null),
        isListening: actualPort > 0,
        totalPeers: peers.length,
        authenticatedPeersCount: authenticatedPeers.length,
        routingTableEntries: cell.routing.getTotalPeerCount()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/p2p/peers', (req, res) => {
    try {
      const peers = cell.transport.getPeers().map(p => ({
        remoteNodeId: p.remoteNodeId,
        remoteEndpoint: p.remoteEndpoint,
        state: p.getState(),
        isInitiator: p.isInitiator,
        lastSeen: p.lastSeen
      }));
      res.json({ peers, count: peers.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/p2p/connect', async (req, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint || typeof endpoint !== 'string') {
        return res.status(400).json({ error: 'endpoint ws:// or wss:// URL required' });
      }
      await cell.connectToPeer(endpoint);
      res.json({ success: true, connectedEndpoint: endpoint });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Macro-Neural Inter-Cell Synaptic Network Endpoints ---
  app.get('/api/p2p/synapses', (req, res) => {
    try {
      res.json(cell.synapticNetwork.exportTopology());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/p2p/synapses/pulse', (req, res) => {
    try {
      const { targetCellId, activationVector } = req.body;
      const results = cell.emitNeuralSynapticPulse(targetCellId, activationVector);
      res.json({ success: true, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/p2p/synapses/learn', (req, res) => {
    try {
      const { rule, targetCellId, preTime, postTime, preVector, postVector, reward, isSuccess } = req.body;
      if (!targetCellId) {
        return res.status(400).json({ error: 'targetCellId is required' });
      }

      if (rule === 'STDP') {
        const result = cell.synapticNetwork.applySTDP(targetCellId, preTime || (Date.now() - 15), postTime || Date.now());
        return res.json({ success: true, rule: 'STDP', result, synapse: cell.synapticNetwork.getSynapse(targetCellId) });
      }

      if (rule === 'HEBBIAN') {
        const result = cell.synapticNetwork.applyHebbianCoactivation(
          targetCellId, 
          preVector || cell.neuroSymbolic.ssmHiddenState, 
          postVector || cell.neuroSymbolic.ssmHiddenState
        );
        return res.json({ success: true, rule: 'HEBBIAN', result, synapse: cell.synapticNetwork.getSynapse(targetCellId) });
      }

      if (rule === 'REINFORCEMENT') {
        const result = cell.synapticNetwork.applyTaskReinforcement(targetCellId, reward || 0.8, isSuccess ?? true);
        return res.json({ success: true, rule: 'REINFORCEMENT', result, synapse: cell.synapticNetwork.getSynapse(targetCellId) });
      }

      res.status(400).json({ error: 'Invalid rule. Supported: STDP, HEBBIAN, REINFORCEMENT' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Linear SSM Recurrent Learning & Parameter Endpoints ---
  app.post('/api/ssm/train', (req, res) => {
    try {
      const { inputs, targets, learningRate, optimizer, epochs } = req.body;
      if (!Array.isArray(inputs) || !Array.isArray(targets) || inputs.length !== targets.length) {
        return res.status(400).json({ error: 'inputs and targets arrays of equal length are required' });
      }

      const ssm = cell.neuroSymbolic.ssmCell;
      let lastResult: any;
      const numEpochs = epochs || 1;

      for (let ep = 0; ep < numEpochs; ep++) {
        lastResult = ssm.trainSequence(inputs, targets, { learningRate, optimizer });
      }

      res.json({
        success: true,
        epochsTrained: numEpochs,
        loss: lastResult.loss,
        gradNorm: lastResult.gradNorm,
        decayMean: lastResult.decayMean,
        invariants: ssm.assertInvariants()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/ssm/parameters', (req, res) => {
    try {
      res.json(cell.neuroSymbolic.ssmCell.exportParameters());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/memory', async (req, res) => {
    try {
      const entries = await cell.memory.search({});
      res.json({ data: entries });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/download', (req, res) => {
    const file = path.join(process.cwd(), 'red-queen.tar.gz');
    if (fs.existsSync(file)) {
      res.download(file);
    } else {
      res.status(404).json({ error: 'Archive red-queen.tar.gz not found' });
    }
  });

  // Guarantee all /api/* routes return JSON, never HTML fallback
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info('server', 'http_server_started', { port: PORT });
  });

  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    logger.info('server', 'sigterm_received');
    await cell.stop();
    server.close();
    process.exit(0);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

