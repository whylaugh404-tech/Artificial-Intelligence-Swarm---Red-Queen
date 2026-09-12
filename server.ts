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

  // In-memory simple Rate Limiter
  const rateLimitMap = new Map<string, { count: number, resetAt: number }>();
  const RATE_LIMIT_WINDOW = 60000; // 1 min
  const MAX_REQUESTS = 100;
  
  app.use('/api', (req, res, next) => {
     const ip = req.ip || req.socket.remoteAddress || 'unknown';
     const now = Date.now();
     let record = rateLimitMap.get(ip);
     
     if (!record || now > record.resetAt) {
       record = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
     }
     
     record.count++;
     rateLimitMap.set(ip, record);
     
     if (record.count > MAX_REQUESTS) {
       return res.status(429).json({ error: 'Too many requests, please try again later.' });
     }
     
     next();
  });

  // Authentication Middleware for sensitive endpoints
  const API_SECRET = process.env.API_SECRET || process.env.VITE_API_SECRET;
  const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
     // If no API_SECRET is configured, we warn but allow in development (or we block strictly).
     // Wait, P8 rule: "Belum ada API key... Siapa saja bisa panggil POST... menyebabkan memory DOS."
     // We MUST block if not authenticated!
     if (!API_SECRET) {
        logger.warn('server', 'missing_api_secret', { ip: req.ip });
        // Fail closed if no secret is configured in the environment
        return res.status(500).json({ error: 'Server is missing API_SECRET configuration. Authentication enforced.' });
     }
     
     const authHeader = req.headers.authorization;
     if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
     }
     
     const token = authHeader.split(' ')[1];
     if (token !== API_SECRET) {
        return res.status(403).json({ error: 'Forbidden: Invalid token' });
     }
     
     next();
  };

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

  const storagePath = './data/memory.json';
  let cell: Cell;
  try {
    const fs = require('fs/promises');
    await fs.stat(storagePath);
    cell = await Cell.loadFromStorage(storagePath, apiKey);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      cell = new Cell(storagePath, apiKey);
    } else {
      throw err;
    }
  }
  
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

  app.post('/api/cell/metabolize', authenticate, async (req, res) => {
    try {
      const result = await cell.metabolize(req.body);
      const statusCode = result.status === 'ACCEPTED' ? 200 : (result.status === 'INVALID' ? 400 : 202);
      res.status(statusCode).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/cell/metabolism/events', authenticate, (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string || '100', 10);
      res.json({ events: cell.metabolism.audit.getEvents(limit) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/cell/knowledge', authenticate, async (req, res) => {
    try {
      const entries = await cell.memory.search({ category: 'SEMANTIC' as any });
      const knowledge = entries.filter(e => e.type === 'KNOWLEDGE_RECORD' || e.content?.knowledgeId);
      res.json({ data: knowledge });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/observe', authenticate, async (req, res) => {
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

  app.post('/api/chat', authenticate, async (req, res) => {
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

  app.get('/api/memory', authenticate, async (req, res) => {
    try {
      const entries = await cell.memory.search({});
      // SEC-01: Redact private cryptographic material if it somehow exists in memory
      const safeEntries = entries.map(entry => {
        if (entry.id.startsWith('cell_identity_') || (entry.content && entry.content.privateKey)) {
          const safeEntry = { ...entry, content: { ...entry.content } };
          delete safeEntry.content.privateKey;
          return safeEntry;
        }
        return entry;
      });
      res.json({ data: safeEntries });
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
