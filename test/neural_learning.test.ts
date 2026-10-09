import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileMemoryStore } from '../src/redqueen/memory/store';
import { NeuralLearningEngine } from '../src/redqueen/learning';
import { Cell } from '../src/redqueen/core/cell';

describe('neural learning runtime', () => {
  it('rejects non-finite labels instead of poisoning the model', async () => {
    const memory = new JsonFileMemoryStore(':memory:', 'cell-neural-validation-test');
    await memory.initialize();
    const engine = new NeuralLearningEngine(memory, 16, 8);

    await expect(engine.train([{ text: 'invalid label', target: Number.NaN }], 1)).rejects.toThrow(/finite/);
  });

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

  it('restores the neural checkpoint through the Cell lifecycle', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'redqueen-neural-'));
    const storagePath = join(directory, 'memory.json');
    const secret = 'cell-neural-lifecycle-secret';
    const first = new Cell(storagePath, '', undefined, undefined, undefined, { storageSecret: secret });
    try {
      await first.start();
      const trained = await first.learning.train([
        { text: 'safe compiler', target: 0 },
        { text: 'malicious exploit', target: 1 }
      ], 1, 0.05);
      await first.stop();

      const restored = await Cell.loadFromStorage(storagePath, '', undefined, { storageSecret: secret });
      try {
        const continued = await restored.learning.train([{ text: 'safe compiler', target: 0 }], 1, 0.05);
        expect(continued.step).toBe(trained.step + 1);
      } finally {
        await restored.stop();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 15000);
});


