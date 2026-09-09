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
  // In a real distributed deployment, keys would be loaded from secure storage.
  const apiKey = process.env.OPENROUTER_API_KEY || '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';
  const cell = new Cell('./data/memory.json', apiKey);

  await cell.start();

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      cell: cell.getStatus()
    });
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
        model: model || 'google/gemini-2.5-flash',
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
