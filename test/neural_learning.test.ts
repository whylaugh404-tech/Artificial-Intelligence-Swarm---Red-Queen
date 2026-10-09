import { describe, expect, it } from 'vitest';
import { JsonFileMemoryStore } from '../src/redqueen/memory/store';
import { NeuralLearningEngine } from '../src/redqueen/learning';

describe('neural learning runtime', () => {
  it('trains, checkpoints, reloads, and infers from text embeddings', async () => {
    const memory = new JsonFileMemoryStore(':memory:', 'cell-neural-test');
    await memory.initialize();
    const engine = new NeuralLearningEngine(memory, 16, 8);
    const result = await engine.train([
      { text: 'safe benign request', target: 0 },
      { text: 'malicious exploit attack', target: 1 },
      { text: 'safe normal operation', target: 0 },
      { text: 'malicious intrusion payload', target: 1 }
    ], 5, 0.05);

    expect(result.step).toBe(20);
    expect(Number.isFinite(result.loss)).toBe(true);
    expect((await memory.get('neural_checkpoint_default'))?.type).toBe('NEURAL_CHECKPOINT');
    expect(engine.infer('malicious exploit attack').checkpointId).toBe('neural_checkpoint_default');
    expect(await engine.loadCheckpoint()).toBe(true);
  });
});

