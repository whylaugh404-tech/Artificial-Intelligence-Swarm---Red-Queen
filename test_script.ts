import { OpenRouterAIProvider } from './src/redqueen/cognition/ai-provider';
import { CognitionPipeline } from './src/redqueen/cognition/pipeline';
import { JsonFileMemoryStore } from './src/redqueen/memory/store';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const apiKey = process.env.OPENROUTER_API_KEY || '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';
  const ai = new OpenRouterAIProvider(apiKey);
  const memory = new JsonFileMemoryStore('./data/memory.json');
  await memory.initialize();
  const pipeline = new CognitionPipeline(ai, memory, 'test-node');
  
  await pipeline.executeCycle('The AI is functioning again!');
}
run().catch(console.error);
