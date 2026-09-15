import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';

describe('P8.2 - Distributed Computation Fabric', () => {
  let alpha: Cell;
  let beta: Cell;
  let alphaPort = 31801;
  let betaPort = 31802;

  beforeEach(async () => {
    alpha = new Cell(':memory:', 'dummy_key', undefined, undefined, undefined, {
      capabilities: ['SWARM_COORDINATION'] as any,
      specialization: 'ORCHESTRATOR'
    });

    beta = new Cell(':memory:', 'dummy_key', undefined, undefined, undefined, {
      capabilities: ['INFO_PROCESSING'] as any,
      specialization: 'WORKER'
    });

    await alpha.start(alphaPort);
    await beta.start(betaPort);

    await alpha.connectToPeer(`ws://localhost:${betaPort}`);
    await new Promise(r => setTimeout(r, 2000));
  });

  afterEach(async () => {
    await alpha.lifecycle.shutdown();
    await beta.lifecycle.shutdown();
    await new Promise(r => setTimeout(r, 500));
  });

  it('1. should discover capability and execute remote task', async () => {
    const task = alpha.collectiveComputation.createTask({
      goal: 'Process Data Remotely',
      computationType: 'DATA_TRANSFORMATION',
      payload: {
        subtasks: [
          {
            type: 'DATA_TRANSFORMATION',
            payload: { items: [1, 2, 3], multiplier: 2 },
            requiredCapabilities: ['INFO_PROCESSING']
          }
        ]
      }
    });

    const res = await alpha.collectiveComputation.executeTask(task, {
      availableCells: [alpha, beta]
    });

    console.log("Alpha capabilities:", alpha.genome.capabilities);
    console.log("Beta capabilities:", beta.genome.capabilities);

    console.log(JSON.stringify(res, null, 2));
    expect(res.status).toBe('COMPLETED');
    
    const subtaskId = Object.keys(res.finalOutput.aggregatedOutputs)[0];
    const out = res.finalOutput.aggregatedOutputs[subtaskId] as any;
    expect(out.executingCell).toBe(beta.nodeId);
    expect(out.output.transformed).toEqual([2, 4, 6]);
  }, 15000);
});
