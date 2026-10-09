import { describe, expect, it } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';

describe('neural vector index and collective inference', () => {
  it('gives a genesis cell the capabilities required by its neural distributed APIs', () => {
    const cell = new Cell(':memory:', '', undefined, undefined, undefined, { storageSecret: 'genesis-neural-capabilities' });
    expect(cell.genome.capabilities).toContain('NEURAL_INFERENCE');
    expect(cell.genome.capabilities).toContain('NEURAL_TRAINING');
  });

  it('persists vectors and returns deterministic nearest neighbours', async () => {
    const cell = new Cell(':memory:', '', undefined, undefined, undefined, { storageSecret: 'vector-test-secret' });
    await cell.memory.initialize();
    await cell.learning.index('gradient', 'gradient descent optimizes loss', { topic: 'optimization' });
    await cell.learning.index('attention', 'transformer self attention mixes token context', { topic: 'transformer' });
    const first = await cell.learning.search('gradient descent loss', 2);
    const second = await cell.learning.search('gradient descent loss', 2);
    expect(first).toHaveLength(2);
    expect(first[0].id).toBe('gradient');
    expect(first.map(result => result.id)).toEqual(second.map(result => result.id));
    expect(first[0].score).toBeGreaterThan(first[1].score);
  });

  it('routes neural inference through the collective computation contract', async () => {
    const cell = new Cell(':memory:', '', undefined, undefined, undefined, { storageSecret: 'distributed-inference-secret', capabilities: ['NEURAL_INFERENCE'] });
    await cell.memory.initialize();
    const result = await cell.inferNeuralDistributed('gradient descent optimizes loss');
    const subtask = Object.values(result.partialResults)[0];
    expect(result.status).toBe('COMPLETED');
    expect(result.verificationStatus.verified).toBe(true);
    expect(subtask.output.checkpointId).toBe('neural_checkpoint_default');
    expect(subtask.provenance).toContain(cell.nodeId);
  });

  it('executes neural inference on an authenticated remote cell', async () => {
    const cellA = new Cell(':memory:', '', undefined, undefined, undefined, {
      storageSecret: 'remote-inference-a',
      capabilities: ['OSINT_SCAN', 'INFO_PROCESSING', 'KNOWLEDGE_QUERY', 'COGNITIVE_REASONING', 'SWARM_COORDINATION']
    });
    const cellB = new Cell(':memory:', '', undefined, undefined, undefined, { storageSecret: 'remote-inference-b', capabilities: ['NEURAL_INFERENCE', 'NEURAL_TRAINING'] });
    try {
      await cellA.start(4111);
      await cellB.start(4112);
      await cellA.connectToPeer('ws://127.0.0.1:4112');
      await new Promise(resolve => setTimeout(resolve, 150));
      const result = await cellA.inferNeuralDistributed('remote neural inference', [cellA, cellB]);
      const subtask = Object.values(result.partialResults)[0];
      expect(result.verificationStatus.verified).toBe(true);
      expect(subtask.executingCellId).toBe(cellB.nodeId);
      expect(subtask.actualExecutorCellId).toBeUndefined();
      expect(subtask.provenance).toEqual([cellA.nodeId, cellB.nodeId]);
      const training = await cellA.trainNeuralDistributed(
        [{ text: 'safe compiler', target: 0 }, { text: 'malicious exploit', target: 1 }],
        { epochs: 2, learningRate: 0.05 },
        [cellA, cellB]
      );
      const trainingSubtask = Object.values(training.partialResults)[0];
      expect(training.status).toBe('COMPLETED');
      expect(trainingSubtask.executingCellId).toBe(cellB.nodeId);
      expect((await cellB.memory.get('neural_checkpoint_default'))?.type).toBe('NEURAL_CHECKPOINT');
    } finally {
      await cellA.stop();
      await cellB.stop();
    }
  }, 15000);
});

