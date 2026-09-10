import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { Cell } from './src/redqueen/core/cell';
import { logger } from './src/redqueen/core/logger';
import dotenv from 'dotenv';

dotenv.config();

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

  const cell = new Cell('./data/memory.json', apiKey);
  
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
