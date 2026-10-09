import { describe, expect, it } from 'vitest';
import { JsonFileMemoryStore } from '../src/redqueen/memory/store';
import { NeuralLearningEngine, TextTrainingSample } from '../src/redqueen/learning';

describe('hybrid system benchmark', () => {
  it('processes a deterministic 100-record neural dataset and emits measurable metrics', async () => {
    const memory = new JsonFileMemoryStore(':memory:', 'benchmark-cell');
    await memory.initialize();
    const engine = new NeuralLearningEngine(memory, 32, 16);
    const samples: TextTrainingSample[] = Array.from({ length: 100 }, (_, index) => ({
      text: index % 2 === 0
        ? `safe benign compiler pipeline record ${index}`
        : `malicious exploit intrusion payload record ${index}`,
      target: index % 2
    }));
    const training = samples.slice(0, 80);
    const validation = samples.slice(80);
    const started = performance.now();
    const result = await engine.train(training, 10, 0.05, validation);
    const durationMs = performance.now() - started;
    const metrics = engine.evaluate(validation);

    expect(result.validationMetrics.samples).toBe(20);
    expect(metrics.samples).toBe(20);
    expect([result.metrics, result.validationMetrics, metrics].every(value =>
      Object.values(value).every(metric => typeof metric === 'number' && Number.isFinite(metric))
    )).toBe(true);
    expect((await memory.get('neural_checkpoint_default'))?.type).toBe('NEURAL_CHECKPOINT');
    console.log(JSON.stringify({ datasetSize: samples.length, trainingSize: training.length, validationSize: validation.length, durationMs, result }));
  });
});

