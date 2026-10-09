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

// Persistent cell identity storage must never silently fall back to a source-controlled secret.
// A missing secret is a configuration error in every environment; otherwise a restart could
// make encrypted private keys recoverable by anyone who can read this repository.
const storageSecret = process.env.REDQUEEN_STORAGE_SECRET?.trim();
if (!storageSecret) {
  throw new Error(
    'REDQUEEN_STORAGE_SECRET is required. Set it in .env or the process environment before starting the server.'
  );
}

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

  // Instantiate the RedQueen Cell
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    logger.warn('server', 'no_api_key_set', {
      message: 'Neither OPENROUTER_API_KEY nor GEMINI_API_KEY is configured. AI chat will return helpful configuration notices.'
    });
  } else {
    logger.info('server', 'api_key_configured', {
      provider: process.env.GEMINI_API_KEY ? 'gemini' : 'openrouter'
    });
  }
  
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const cell = new Cell('./data/memory.json', apiKey, undefined, undefined, undefined, { storageSecret });
  
  const p2pPort = parseInt(process.env.P2P_PORT || '0', 10);
  if (p2pPort > 0) {
    logger.info('server', 'p2p_enabled', { port: p2pPort });
  } else {
    logger.info('server', 'P2P: DISABLED');
  }

  await cell.start(p2pPort);

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

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      cell: cell.getStatus()
    });
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
      const result = await cell.metabolize(req.body);
      const statusCode = result.status === 'ACCEPTED' ? 200 : (result.status === 'INVALID' ? 400 : 202);
      res.status(statusCode).json(result);
    } catch (err: any) {
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

      const statusCode = result.status === 'SUCCESS' ? 200 : 422;
      res.status(statusCode).json({ status: result.status.toLowerCase(), result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { message, model } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'message required' });
      }
      
      logger.info('api', 'chat_request', { model });
      const aiResult = await cell.aiProvider.generate({
        systemPrompt: 'You are Red Queen, an advanced, autonomous cyber-research AI. You analyze threats, manage distributed nodes, and speak with a precise, analytical, and slightly cold professional tone. Be concise and highly technical. Do not break character.',
        userPrompt: message,
        model: model || 'gemini-3.8-flash',
      });
      if (!aiResult.success) {
        return res.status(500).json({ error: aiResult.error });
      }
      res.json({ response: aiResult.rawText });
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

