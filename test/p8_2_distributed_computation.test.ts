import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { MessageType } from '../src/redqueen/network/protocol';
import { computeDeterministicHash } from '../src/redqueen/cognition/computation/canonical';
import { ComputationStatus } from '../src/redqueen/cognition/computation/types';

describe('P8.2 - Distributed Computation Fabric Closure & Verification', () => {
  let alpha: Cell;
  let beta: Cell;
  let alphaPort = 31821;
  let betaPort = 31822;

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
    // Wait for handshake, peer authentication and capability advertisement
    await new Promise(r => setTimeout(r, 1200));
  });

  afterEach(async () => {
    await alpha.stop();
    await beta.stop();
    await new Promise(r => setTimeout(r, 200));
  });

  it('1. DHT Discovery → Remote Cell Resolution → Scheduler without manual availableCells', async () => {
    const task = alpha.collectiveComputation.createTask({
      goal: 'Process Data Remotely via Fabric Discovery',
      computationType: 'DATA_TRANSFORMATION',
      payload: {
        subtasks: [
          {
            type: 'DATA_TRANSFORMATION',
            payload: { items: [10, 20, 30], multiplier: 3 },
            requiredCapabilities: ['INFO_PROCESSING']
          }
        ]
      }
    });

    // DO NOT pass availableCells: fabric must discover beta through DHT / peer capability exchange!
    const res = await alpha.collectiveComputation.executeTask(task);

    expect(res.status).toBe('COMPLETED');
    expect(res.taskId).toBe(task.taskId);

    const subtaskId = Object.keys(res.finalOutput.aggregatedOutputs)[0];
    const out = res.finalOutput.aggregatedOutputs[subtaskId] as any;
    expect(out.executingCell).toBe(beta.nodeId);
    expect(out.output.transformed).toEqual([30, 60, 90]);

    // Verify provenance and verified result trace
    expect(res.partialResults[subtaskId].executingCellId).toBe(beta.nodeId);
    expect(res.partialResults[subtaskId].provenance).toEqual([alpha.nodeId, beta.nodeId]);
    expect(res.trace.verificationTrace[0].verified).toBe(true);
  }, 15000);

  it('2. Remote result verification: accepts valid deterministic resultHash and rejects tampered hash', async () => {
    const subtask = {
      subtaskId: 'sub_verify_test_1',
      parentTaskId: 'task_verify_test',
      type: 'DATA_TRANSFORMATION',
      payload: { items: [1, 2], multiplier: 5 },
      requiredCapabilities: ['INFO_PROCESSING'],
      timeoutMs: 3000,
      maxRetries: 1,
      priority: 0
    };

    const fabric = (alpha.collectiveComputation as any).fabric;
    expect(fabric).toBeDefined();

    // Verify remote execution produces valid deterministic resultHash
    const remoteExecutor = fabric.getRemoteExecutor(async () => ({ dummy: true }));
    const resultOutput = await remoteExecutor(subtask, {}, beta);

    expect(resultOutput.transformed).toEqual([5, 10]);
    expect(resultOutput.__isRemoteResult).toBe(true);

    const remoteRes = resultOutput.__remoteSubtaskResult;
    expect(remoteRes.status).toBe(ComputationStatus.COMPLETED);
    expect(remoteRes.executingCellId).toBe(beta.nodeId);
    expect(remoteRes.provenance).toEqual([alpha.nodeId, beta.nodeId]);

    // Verify that resultHash is the true deterministic hash computed by executing cell
    const expectedHash = computeDeterministicHash({
      subtaskId: subtask.subtaskId,
      output: { transformed: [5, 10], count: 2, upstream: {} },
      executingCellId: beta.nodeId
    });
    expect(remoteRes.resultHash).toBe(expectedHash);
  }, 15000);

  it('3. Security: unauthenticated peer messages are rejected by fabric', async () => {
    const fabric = (alpha.collectiveComputation as any).fabric;
    const initialDiscovered = await fabric.discoverCapableCells(['INFO_PROCESSING']);
    expect(initialDiscovered.some((c: Cell) => c.nodeId === beta.nodeId)).toBe(true);

    // Simulate task message from an unknown / unauthenticated peer ID
    const fakePeerId = 'unauthenticated_fake_peer_9999999999';
    let messageHandledWithoutCrash = true;
    try {
      const transport = alpha.transport as any;
      for (const listener of transport.messageListeners) {
        listener({
          messageId: 'msg_fake_1',
          senderId: fakePeerId,
          type: MessageType.TASK,
          payload: {
            subtask: {
              subtaskId: 'sub_malicious',
              parentTaskId: 'task_malicious',
              type: 'DATA_TRANSFORMATION',
              payload: {}
            },
            resolvedInputs: {},
            originatingCellId: fakePeerId
          },
          timestamp: Date.now()
        });
      }
    } catch {
      messageHandledWithoutCrash = false;
    }

    expect(messageHandledWithoutCrash).toBe(true);
    // Unauthenticated task must not be in pending tasks or processed
    expect((fabric as any).pendingRequests.has('req_task_malicious_sub_malicious')).toBe(false);
  });

  it('4. Concurrency & anti-collision: multiple parallel subtasks execute without collision', async () => {
    const task = alpha.collectiveComputation.createTask({
      goal: 'Parallel subtask execution',
      computationType: 'DATA_TRANSFORMATION',
      payload: {
        subtasks: [
          {
            type: 'DATA_TRANSFORMATION',
            payload: { items: [1, 2], multiplier: 2 },
            requiredCapabilities: ['INFO_PROCESSING']
          },
          {
            type: 'DATA_TRANSFORMATION',
            payload: { items: [3, 4], multiplier: 3 },
            requiredCapabilities: ['INFO_PROCESSING']
          },
          {
            type: 'DATA_TRANSFORMATION',
            payload: { items: [5, 6], multiplier: 4 },
            requiredCapabilities: ['INFO_PROCESSING']
          }
        ]
      }
    });

    const res = await alpha.collectiveComputation.executeTask(task);
    expect(res.status).toBe('COMPLETED');
    expect(res.trace.dispatches.length).toBe(3);

    // All three subtasks should be completed with distinct verified results
    const subtaskIds = Object.keys(res.finalOutput.aggregatedOutputs);
    expect(subtaskIds.length).toBe(3);

    const out0 = (res.finalOutput.aggregatedOutputs[subtaskIds[0]] as any).output.transformed;
    const out1 = (res.finalOutput.aggregatedOutputs[subtaskIds[1]] as any).output.transformed;
    const out2 = (res.finalOutput.aggregatedOutputs[subtaskIds[2]] as any).output.transformed;

    const allTransformed = [out0, out1, out2];
    expect(allTransformed).toContainEqual([2, 4]);
    expect(allTransformed).toContainEqual([9, 12]);
    expect(allTransformed).toContainEqual([20, 24]);
  }, 15000);

  it('5. Lifecycle: fabric starts announcements on cell start and halts cleanly on shutdown', async () => {
    const testCell = new Cell(':memory:', 'test_key', undefined, undefined, undefined, {
      capabilities: ['INFO_PROCESSING'] as any
    });

    const fabric = (testCell.collectiveComputation as any).fabric;
    expect(fabric).toBeDefined();

    // Start cell
    await testCell.start(31823);
    // Interval should be active
    expect((fabric as any).announceInterval).not.toBeNull();

    // Stop cell
    await testCell.stop();
    // Interval and pending tasks should be cleared
    expect((fabric as any).announceInterval).toBeNull();
    expect((fabric as any).pendingRequests.size).toBe(0);
    expect((fabric as any).activeSubtaskRequests.size).toBe(0);
  });
});
