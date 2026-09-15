import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { Cell } from '../src/redqueen/core/cell';
import {
  CollectiveComputationEngine,
  computeDeterministicHash
} from '../src/redqueen/cognition/computation/engine';
import {
  ComputationStatus,
  ComputationSubtask,
  ComputationTask,
  ComputationDependency
} from '../src/redqueen/cognition/computation/types';
import { CellCapability } from '../src/redqueen/genome/types';

describe('P8.1: Collective Computation Foundation', () => {
  const activeCells: Cell[] = [];
  const createdPaths: string[] = [];

  const createTestCell = async (id: string, options?: { capabilities?: CellCapability[]; specialization?: string }) => {
    const storagePath = join(process.cwd(), `.tmp_test_p81_${id}_${Date.now()}`);
    if (existsSync(storagePath)) {
      rmSync(storagePath, { recursive: true, force: true });
    }
    const cell = new Cell(storagePath, 'dummy-key', undefined, undefined, undefined, {
      capabilities: options?.capabilities || ['COGNITIVE_REASONING', 'SWARM_COORDINATION', 'INFO_PROCESSING'],
      specialization: options?.specialization || null
    });
    activeCells.push(cell);
    createdPaths.push(storagePath);
    return cell;
  };

  afterEach(async () => {
    for (const c of activeCells) {
      try {
        await c.stop();
      } catch {
        // ignore shutdown noise in tests
      }
    }
    activeCells.length = 0;
    for (const p of createdPaths) {
      if (existsSync(p)) {
        rmSync(p, { recursive: true, force: true });
      }
    }
    createdPaths.length = 0;
  });

  it('1. should create a deterministic task identity using canonical semantic representation + SHA-256', async () => {
    const cell = await createTestCell('cell_identity');
    const engine = cell.collectiveComputation;

    const task1 = engine.createTask({
      goal: 'Analyze cluster anomalies',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [10, 20, 30], threshold: 15 },
      requiredCapabilities: ['INFO_PROCESSING']
    });

    const task2 = engine.createTask({
      goal: 'Analyze cluster anomalies',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [10, 20, 30], threshold: 15 },
      requiredCapabilities: ['INFO_PROCESSING']
    });

    expect(task1.deterministicIdentity).toBeDefined();
    expect(task1.deterministicIdentity.length).toBe(64); // 256-bit hex
    expect(task1.deterministicIdentity).toBe(task2.deterministicIdentity);

    // Verify change in payload changes identity deterministically
    const task3 = engine.createTask({
      goal: 'Analyze cluster anomalies',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [10, 20, 31], threshold: 15 },
      requiredCapabilities: ['INFO_PROCESSING']
    });
    expect(task3.deterministicIdentity).not.toBe(task1.deterministicIdentity);
  });

  it('2. should model Cell computational capacity and communication profile', async () => {
    const cellA = await createTestCell('cell_prof_a', {
      capabilities: ['COGNITIVE_REASONING', 'INFO_PROCESSING'],
      specialization: 'GRAPH_ANALYTICS'
    });
    const cellB = await createTestCell('cell_prof_b', {
      capabilities: ['SWARM_COORDINATION'],
      specialization: 'DISTRIBUTED_PIPELINE'
    });

    const engineA = cellA.collectiveComputation;
    const capacityA = engineA.getCellComputeCapacity(cellA);

    expect(capacityA.architecture).toBe('COGNITIVE_REASONER');
    expect(capacityA.capacity).toBeGreaterThan(100);
    expect(capacityA.specialization).toBe('GRAPH_ANALYTICS');
    expect(capacityA.availability).toBe(1.0);

    const commLocal = engineA.getCommunicationProfile(cellA);
    expect(commLocal.topology).toBe('LOCAL_CLUSTER');
    expect(commLocal.latency).toBeLessThan(1);
    expect(commLocal.reliability).toBe(1.0);

    const commRemote = engineA.getCommunicationProfile(cellB);
    expect(['DIRECT_P2P', 'DHT_ROUTED']).toContain(commRemote.topology);
    expect(commRemote.latency).toBeGreaterThan(0);
  });

  it('3. should decompose task, resolve dependencies, and execute in parallel waves', async () => {
    const cell = await createTestCell('cell_decomp');
    const engine = cell.collectiveComputation;

    const task = engine.createTask({
      goal: 'Transform and aggregate numbers',
      computationType: 'DATA_TRANSFORMATION',
      payload: {
        items: [1, 2, 3, 4, 5, 6],
        multiplier: 2
      }
    });

    const plan = engine.decomposeTask(task);
    expect(plan.subtasks.length).toBe(3); // 2 partitions + 1 aggregation
    expect(plan.dependencies.length).toBe(2);

    const waves = engine.buildExecutionWaves(plan.subtasks, plan.dependencies);
    expect(waves.length).toBe(2); // Wave 1: [part_1, part_2] in parallel; Wave 2: [aggregate]
    expect(waves[0].length).toBe(2);
    expect(waves[1].length).toBe(1);
    expect(waves[1][0].type).toBe('VECTOR_AGGREGATION');

    // Run full pipeline
    const result = await engine.executeTask(task);
    expect(result.status).toBe(ComputationStatus.COMPLETED);
    expect(result.verificationStatus.verified).toBe(true);
    expect(result.dependencies.length).toBe(2);

    // Verify aggregation result: ([1,2,3]*2 = [2,4,6] sum=12) + ([4,5,6]*2 = [8,10,12] sum=30) -> total 42
    const aggSubtaskId = `${task.taskId}_aggregate`;
    const aggResult = result.partialResults[aggSubtaskId];
    expect(aggResult).toBeDefined();
    expect(aggResult.status).toBe(ComputationStatus.COMPLETED);
    expect(aggResult.output.sum).toBe(42);

    // Verify trace is complete
    expect(result.trace.executionOrder.length).toBe(2);
    expect(result.trace.dispatches.length).toBe(3);
    expect(result.trace.compositionDetails.formula).toBe('C* = F(C1, C2, ..., Cn)');
  });

  it('4. should select optimal Cell based on specialization, capacity, and communication profile', async () => {
    const coordinatorCell = await createTestCell('coord_cell');
    const generalCell = await createTestCell('gen_cell', {
      capabilities: ['INFO_PROCESSING']
    });
    const specializedCell = await createTestCell('spec_cell', {
      capabilities: ['INFO_PROCESSING', 'COGNITIVE_REASONING'],
      specialization: 'MATRIX_MATH'
    });

    const subtask: ComputationSubtask = {
      subtaskId: 'sub_spec_1',
      parentTaskId: 'task_root',
      type: 'DATA_TRANSFORMATION',
      payload: {},
      requiredCapabilities: ['INFO_PROCESSING'],
      requiredSpecialization: 'MATRIX_MATH',
      timeoutMs: 3000,
      maxRetries: 1,
      priority: 1
    };

    const allocation = coordinatorCell.collectiveComputation.selectOptimalCellForSubtask(subtask, [
      coordinatorCell,
      generalCell,
      specializedCell
    ]);

    expect(allocation.cell.nodeId).toBe(specializedCell.nodeId);
    expect(allocation.profile.specialization).toBe('MATRIX_MATH');
  });

  it('5. should provide fault isolation for timeouts and individual Cell failures', async () => {
    const coordinatorCell = await createTestCell('coord_cell_fault');
    const workerCell = await createTestCell('worker_cell_fault');

    // Custom task with 2 independent subtasks and 1 dependent subtask
    const task = coordinatorCell.collectiveComputation.createTask({
      goal: 'Tolerant batch execution',
      computationType: 'FAULT_ISOLATION_TEST',
      payload: {
        subtasks: [
          {
            subtaskId: 'sub_ok',
            type: 'DATA_TRANSFORMATION',
            payload: { items: [10, 20] },
            timeoutMs: 3000,
            maxRetries: 1
          },
          {
            subtaskId: 'sub_failing',
            type: 'FAIL_TEST',
            payload: {},
            timeoutMs: 500,
            maxRetries: 1
          },
          {
            subtaskId: 'sub_dependent_on_fail',
            type: 'DATA_TRANSFORMATION',
            payload: {},
            dependsOn: ['sub_failing'],
            timeoutMs: 1000
          }
        ]
      }
    });

    // Custom executor that fails sub_failing
    const result = await coordinatorCell.collectiveComputation.executeTask(task, {
      availableCells: [coordinatorCell, workerCell],
      executorOverride: async (sub) => {
        if (sub.subtaskId === 'sub_failing') {
          throw new Error('Simulated hardware partition on worker');
        }
        return { status: 'ok', processed: true };
      }
    });

    // Subtask sub_ok succeeded
    expect(result.partialResults['sub_ok'].status).toBe(ComputationStatus.COMPLETED);
    // Subtask sub_failing isolated failure
    expect(result.partialResults['sub_failing'].status).toBe(ComputationStatus.FAILED);
    expect(result.partialResults['sub_failing'].error).toContain('Simulated hardware partition');
    // Subtask sub_dependent_on_fail tracked upstream dependency failure without crash
    expect(result.partialResults['sub_dependent_on_fail'].status).toBe(ComputationStatus.FAILED);
    expect(result.partialResults['sub_dependent_on_fail'].error).toContain('Upstream dependency failed');

    // Overall status is PARTIAL because some subtasks succeeded
    expect(result.status).toBe(ComputationStatus.PARTIAL);
  });

  it('6. should enforce deep immutability on ComputationResult and reject tampering', async () => {
    const cell = await createTestCell('cell_immutable');
    const task = cell.collectiveComputation.createTask({
      goal: 'Immutable result check',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [100] }
    });

    const result = await cell.collectiveComputation.executeTask(task);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.finalOutput)).toBe(true);
    expect(Object.isFrozen(result.trace)).toBe(true);
    expect(Object.isFrozen(result.partialResults)).toBe(true);

    // Attempting modification should throw in strict mode
    expect(() => {
      (result as any).status = ComputationStatus.FAILED;
    }).toThrow();

    expect(() => {
      (result.finalOutput as any).tampered = true;
    }).toThrow();
  });

  it('7. should record full provenance chain and verify deterministic hash', async () => {
    const cell = await createTestCell('cell_provenance');
    const task = cell.collectiveComputation.createTask({
      goal: 'Provenance check',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [5, 10, 15] }
    });

    const result = await cell.collectiveComputation.executeTask(task);
    expect(result.originatingCellId).toBe(cell.nodeId);
    expect(result.provenance).toContain(cell.nodeId);
    expect(result.deterministicHash).toBeDefined();
    expect(result.deterministicHash.length).toBe(64);

    // Each subtask has its individual resultHash verified
    for (const subResult of Object.values(result.partialResults)) {
      expect(subResult.resultHash).toBeDefined();
      expect(subResult.provenance).toContain(cell.nodeId);
    }
  });
});

// Trigger GitHub Sync
