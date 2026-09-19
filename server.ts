import express from 'express';
import path from 'path';
import * as fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { Cell } from './src/redqueen/core/cell';
import { logger } from './src/redqueen/core/logger';
import dotenv from 'dotenv';

dotenv.config();

// Ensure REDQUEEN_STORAGE_SECRET exists for server Cell initialization
if (!process.env.REDQUEEN_STORAGE_SECRET) {
  process.env.REDQUEEN_STORAGE_SECRET = 'redqueen_local_development_storage_secret_key_32bytes';
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

  const cell = new Cell('./data/memory.json', apiKey, undefined, undefined, undefined, { storageSecret: process.env.REDQUEEN_STORAGE_SECRET || 'dev_secret_key_override_12345678' });
  
  const p2pPort = parseInt(process.env.P2P_PORT || '0', 10);
  if (p2pPort > 0) {
    logger.info('server', 'p2p_enabled', { port: p2pPort });
  } else {
    logger.info('server', 'P2P: DISABLED');
  }

  await cell.start(p2pPort);

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
        evidences: cell.cognitiveGraph.getAllEvidences(),
        budget: cell.cognitiveGraph.getBudget()
      });
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
      
      // We run cognition in the background so as not to block HTTP response
      cell.cognition.executeCycle(observation).catch(err => {
        logger.error('api', 'cognition_error', err);
      });
      res.json({ status: 'accepted', message: 'Observation injected into cognition pipeline' });
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
    res.download(file);
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
