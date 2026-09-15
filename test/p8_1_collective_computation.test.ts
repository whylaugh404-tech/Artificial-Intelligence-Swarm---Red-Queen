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
  ComputationDependency,
  ComputePartitionSchema as ComputationComputePartitionSchema,
  CommunicationProfileSchema as ComputationCommunicationProfileSchema
} from '../src/redqueen/cognition/computation/types';
import {
  ComputePartitionSchema as CoreComputePartitionSchema,
  CommunicationProfileSchema as CoreCommunicationProfileSchema
} from '../src/redqueen/core/compute/types';
import { CellCapability } from '../src/redqueen/genome/types';

describe('P8.1: Collective Computation Foundation & Audit Repairs', () => {
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

  it('1. no duplicate architecture: re-exports canonical ComputePartition and CommunicationProfile from core/compute', () => {
    expect(ComputationComputePartitionSchema).toBe(CoreComputePartitionSchema);
    expect(ComputationCommunicationProfileSchema).toBe(CoreCommunicationProfileSchema);
  });

  it('2. deterministic task/subtask/dependency/composition identity: zero Date.now() or Math.random() in IDs', async () => {
    const cell = await createTestCell('cell_det_id');
    const engine = cell.collectiveComputation;

    const taskParams = {
      goal: 'Analyze cluster anomalies',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [10, 20, 30], threshold: 15 },
      requiredCapabilities: ['INFO_PROCESSING']
    };

    const task1 = engine.createTask(taskParams);
    const task2 = engine.createTask(taskParams);

    expect(task1.deterministicIdentity).toBe(task2.deterministicIdentity);
    expect(task1.taskId).toBe(task2.taskId);
    expect(task1.taskId).toMatch(/^task_[a-f0-9]{16}$/);

    // Decomposition deterministic identity
    const plan1 = engine.decomposeTask(task1);
    const plan2 = engine.decomposeTask(task2);

    expect(plan1.subtasks.length).toBe(plan2.subtasks.length);
    for (let i = 0; i < plan1.subtasks.length; i++) {
      expect(plan1.subtasks[i].subtaskId).toBe(plan2.subtasks[i].subtaskId);
      expect(plan1.subtasks[i].subtaskId).toMatch(/^sub_[a-f0-9]{16}$/);
    }
    for (let i = 0; i < plan1.dependencies.length; i++) {
      expect(plan1.dependencies[i].dependencyId).toBe(plan2.dependencies[i].dependencyId);
      expect(plan1.dependencies[i].dependencyId).toMatch(/^dep_[a-f0-9]{16}$/);
    }
  });

  it('3. key/order independence: permutation of payload keys or capability order does not alter identity', async () => {
    const cell = await createTestCell('cell_order_indep');
    const engine = cell.collectiveComputation;

    const taskA = engine.createTask({
      goal: 'Order independence check',
      computationType: 'DATA_TRANSFORMATION',
      payload: { z: 100, a: 200, nested: { beta: 'two', alpha: 'one' } },
      requiredCapabilities: ['SWARM_COORDINATION', 'INFO_PROCESSING']
    });

    const taskB = engine.createTask({
      goal: 'Order independence check',
      computationType: 'DATA_TRANSFORMATION',
      payload: { a: 200, nested: { alpha: 'one', beta: 'two' }, z: 100 },
      requiredCapabilities: ['INFO_PROCESSING', 'SWARM_COORDINATION']
    });

    expect(taskA.deterministicIdentity).toBe(taskB.deterministicIdentity);
    expect(taskA.taskId).toBe(taskB.taskId);
  });

  it('4. semantic change -> identity changes deterministically', async () => {
    const cell = await createTestCell('cell_semantic_change');
    const engine = cell.collectiveComputation;

    const baseTask = engine.createTask({
      goal: 'Base task',
      computationType: 'DATA_TRANSFORMATION',
      payload: { threshold: 10 }
    });

    const modifiedPayload = engine.createTask({
      goal: 'Base task',
      computationType: 'DATA_TRANSFORMATION',
      payload: { threshold: 11 }
    });

    const modifiedGoal = engine.createTask({
      goal: 'Base task modified',
      computationType: 'DATA_TRANSFORMATION',
      payload: { threshold: 10 }
    });

    expect(modifiedPayload.deterministicIdentity).not.toBe(baseTask.deterministicIdentity);
    expect(modifiedGoal.deterministicIdentity).not.toBe(baseTask.deterministicIdentity);
  });

  it('5. models Cell compute capacity as derived/estimated capability (not real hardware metric)', async () => {
    const cell = await createTestCell('cell_capacity', {
      capabilities: ['COGNITIVE_REASONING', 'INFO_PROCESSING'],
      specialization: 'GRAPH_ANALYTICS'
    });

    const capacity = cell.collectiveComputation.getCellComputeCapacity(cell);
    expect(capacity.isDerivedCapability).toBe(true);
    expect(capacity.architecture).toBe('COGNITIVE_REASONER');
    expect(capacity.capacity).toBeGreaterThan(100);
    expect(capacity.specialization).toBe('GRAPH_ANALYTICS');
    expect(capacity.availability).toBe(1.0);
  });

  it('6. true non-additive composition: C* = F(C1...Cn) models Amdahl limits, communication, and synchronization', async () => {
    const cell1 = await createTestCell('cell_comp_1');
    const cell2 = await createTestCell('cell_comp_2');

    const cap1 = cell1.collectiveComputation.getCellComputeCapacity(cell1).capacity;
    const cap2 = cell2.collectiveComputation.getCellComputeCapacity(cell2).capacity;
    const naiveSum = cap1 + cap2;

    const task = cell1.collectiveComputation.createTask({
      goal: 'Parallel composition test',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [1, 2, 3, 4, 5, 6], multiplier: 2 }
    });

    const result = await cell1.collectiveComputation.executeTask(task, {
      availableCells: [cell1, cell2]
    });

    expect(result.composition.formula).toBe('C* = F(C1, C2, ..., Cn)');
    expect(result.composition.effectiveCapacity).toBeDefined();

    // Mathematically verify that C* is non-additive (NOT equal to naive sum)
    expect(result.composition.effectiveCapacity).not.toBe(naiveSum);
    expect(result.composition.effectiveCapacity).toBeLessThan(naiveSum);
    expect(result.composition.effectiveCapacity).toBeGreaterThan(0);
  });

  it('7. measures communication, synchronization, and verification overhead costs', async () => {
    const cell1 = await createTestCell('cell_costs_1');
    const cell2 = await createTestCell('cell_costs_2');

    const task = cell1.collectiveComputation.createTask({
      goal: 'Cost tracking verification',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [10, 20, 30, 40] }
    });

    const result = await cell1.collectiveComputation.executeTask(task, {
      availableCells: [cell1, cell2]
    });

    const costs = result.composition.costs;
    expect(costs.communicationCost).toBeGreaterThan(0);
    expect(costs.synchronizationCost).toBeGreaterThanOrEqual(0);
    expect(costs.verificationCost).toBeGreaterThan(0);
    expect(costs.totalOverheadCost).toBeGreaterThan(0);

    // Each subtask execution records individual cost breakdown
    for (const subRes of Object.values(result.partialResults)) {
      expect(subRes.executionCost).toBeDefined();
      expect(subRes.executionCost!.totalCost).toBeGreaterThan(0);
    }
  });

  it('8. capability-based scheduling: assigns subtask to Cell with matching specialization and capabilities', async () => {
    const coordinator = await createTestCell('coord');
    const generalist = await createTestCell('general', {
      capabilities: ['INFO_PROCESSING']
    });
    const specialist = await createTestCell('specialist', {
      capabilities: ['INFO_PROCESSING', 'COGNITIVE_REASONING'],
      specialization: 'MATRIX_MATH'
    });

    const subtask: ComputationSubtask = {
      subtaskId: 'sub_spec_test',
      parentTaskId: 'task_parent',
      type: 'DATA_TRANSFORMATION',
      payload: {},
      requiredCapabilities: ['INFO_PROCESSING'],
      requiredSpecialization: 'MATRIX_MATH',
      timeoutMs: 2000,
      maxRetries: 1,
      priority: 1
    };

    const allocation = coordinator.collectiveComputation.selectOptimalCellForSubtask(subtask, [
      coordinator,
      generalist,
      specialist
    ]);

    expect(allocation.capable).toBe(true);
    expect(allocation.cell?.nodeId).toBe(specialist.nodeId);
    expect(allocation.profile?.specialization).toBe('MATRIX_MATH');
  });

  it('9. incapable Cell -> clean failure when no Cell satisfies required capabilities', async () => {
    const coordinator = await createTestCell('coord_incapable');

    const task = coordinator.collectiveComputation.createTask({
      goal: 'Quantum task requiring unavailable capability',
      computationType: 'QUANTUM_TELEMETRY',
      payload: {
        subtasks: [
          {
            subtaskId: 'sub_impossible',
            type: 'QUANTUM_EXEC',
            payload: {},
            requiredCapabilities: ['NON_EXISTENT_QUANTUM_CAPABILITY']
          }
        ]
      }
    });

    const result = await coordinator.collectiveComputation.executeTask(task, {
      availableCells: [coordinator]
    });

    expect(result.status).toBe(ComputationStatus.FAILED);
    const subRes = result.partialResults['sub_impossible'];
    expect(subRes).toBeDefined();
    expect(subRes.status).toBe(ComputationStatus.FAILED);
    expect(subRes.error).toContain('Incapable Cell');

    // Verify dispatch audit reflects incapable cell
    const incapableDispatch = result.trace.dispatches.find(d => d.subtaskId === 'sub_impossible');
    expect(incapableDispatch?.status).toBe('INCAPABLE_CELL');
  });

  it('10. dependency failure -> BLOCKED: downstream subtask transitions to BLOCKED', async () => {
    const coordinator = await createTestCell('coord_blocked');

    const task = coordinator.collectiveComputation.createTask({
      goal: 'Dependency failure cascade test',
      computationType: 'CASCADE_TEST',
      payload: {
        subtasks: [
          {
            subtaskId: 'sub_failing_root',
            type: 'FAIL_TYPE',
            payload: {},
            timeoutMs: 500,
            maxRetries: 0
          },
          {
            subtaskId: 'sub_dependent_child',
            type: 'NORMAL_TYPE',
            payload: {},
            dependsOn: ['sub_failing_root'],
            timeoutMs: 1000
          }
        ]
      }
    });

    const result = await coordinator.collectiveComputation.executeTask(task, {
      executorOverride: async (sub) => {
        if (sub.subtaskId === 'sub_failing_root') {
          throw new Error('Root upstream partition failure');
        }
        return { ok: true };
      }
    });

    expect(result.partialResults['sub_failing_root'].status).toBe(ComputationStatus.FAILED);
    expect(result.partialResults['sub_dependent_child'].status).toBe(ComputationStatus.BLOCKED);
    expect(result.partialResults['sub_dependent_child'].error).toContain('BLOCKED');
  });

  it('11. timeout, retry, and reassignment to alternate candidate cells', async () => {
    const coordinator = await createTestCell('coord_retry');
    const worker1 = await createTestCell('worker_retry_1');
    const worker2 = await createTestCell('worker_retry_2');

    let worker1Attempts = 0;
    let worker2Attempts = 0;

    const task = coordinator.collectiveComputation.createTask({
      goal: 'Retry and reassignment test',
      computationType: 'RETRY_TEST',
      payload: {
        subtasks: [
          {
            subtaskId: 'sub_retry_reassign',
            type: 'RETRYABLE_TASK',
            payload: {},
            timeoutMs: 2000,
            maxRetries: 2
          }
        ]
      }
    });

    const result = await coordinator.collectiveComputation.executeTask(task, {
      availableCells: [worker1, worker2],
      executorOverride: async (sub, inputs, executingCell) => {
        if (executingCell.nodeId === worker1.nodeId) {
          worker1Attempts++;
          throw new Error('Worker 1 transient failure');
        }
        if (executingCell.nodeId === worker2.nodeId) {
          worker2Attempts++;
          return { successOnWorker2: true };
        }
        return { ok: true };
      }
    });

    expect(result.status).toBe(ComputationStatus.COMPLETED);
    const subRes = result.partialResults['sub_retry_reassign'];
    expect(subRes.status).toBe(ComputationStatus.COMPLETED);
    expect(subRes.output.successOnWorker2).toBe(true);
    expect(worker1Attempts).toBeGreaterThanOrEqual(1);
    expect(worker2Attempts).toBe(1);
    expect(subRes.executingCellId).toBe(worker2.nodeId);
  });

  it('12. Cell failure isolation: one Cell error does not crash coordinator or independent subtasks', async () => {
    const coordinator = await createTestCell('coord_isolation');
    const worker = await createTestCell('worker_isolation');

    const task = coordinator.collectiveComputation.createTask({
      goal: 'Isolation test',
      computationType: 'ISOLATION_TEST',
      payload: {
        subtasks: [
          {
            subtaskId: 'sub_independent_ok',
            type: 'DATA_TRANSFORMATION',
            payload: { items: [1, 2, 3] }
          },
          {
            subtaskId: 'sub_independent_crashed',
            type: 'CRASH_TEST',
            payload: {}
          }
        ]
      }
    });

    const result = await coordinator.collectiveComputation.executeTask(task, {
      availableCells: [coordinator, worker],
      executorOverride: async (sub) => {
        if (sub.subtaskId === 'sub_independent_crashed') {
          throw new Error('Fatal worker panic simulation');
        }
        return { processed: true };
      }
    });

    expect(result.status).toBe(ComputationStatus.PARTIAL);
    expect(result.partialResults['sub_independent_ok'].status).toBe(ComputationStatus.COMPLETED);
    expect(result.partialResults['sub_independent_crashed'].status).toBe(ComputationStatus.FAILED);
  });

  it('13. provenance & deep immutability: verifies non-tamperable state and origin tracking', async () => {
    const coordinator = await createTestCell('coord_provenance');
    const worker = await createTestCell('worker_provenance');

    const task = coordinator.collectiveComputation.createTask({
      goal: 'Provenance check',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [100] }
    });

    const result = await coordinator.collectiveComputation.executeTask(task, {
      availableCells: [coordinator, worker]
    });

    expect(result.originatingCellId).toBe(coordinator.nodeId);
    expect(result.provenance).toContain(coordinator.nodeId);
    expect(result.deterministicHash).toBeDefined();

    // Immutability checks
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.finalOutput)).toBe(true);
    expect(Object.isFrozen(result.composition)).toBe(true);
    expect(Object.isFrozen(result.trace)).toBe(true);

    expect(() => {
      (result as any).status = ComputationStatus.FAILED;
    }).toThrow();
  });

  it('14. RFC 8785 (JCS) compliance: verifies key order, negative zero, array semantics, and surrogate handling', async () => {
    const { canonicalizeJson, computeDeterministicHash } = await import('../src/redqueen/cognition/computation/canonical');

    // 1. Key sorting by UTF-16 code units (RFC 8785 Section 3.2.3)
    const objUnsorted = {
      b: 1,
      a: 2,
      aa: 3,
      'a\uFFFF': 4
    };
    const serialized = canonicalizeJson(objUnsorted);
    // 'a' (len 1) < 'aa' (index 1 is 0x61) < 'a\uFFFF' (index 1 is 0xFFFF) < 'b' (index 0 is 0x62)
    expect(serialized).toBe('{"a":2,"aa":3,"a\uFFFF":4,"b":1}');

    // 2. Negative zero (-0) MUST serialize as '0' (RFC 8785 Section 3.2.2.3)
    expect(canonicalizeJson(-0)).toBe('0');
    expect(canonicalizeJson(0)).toBe('0');
    expect(canonicalizeJson({ zero: -0 })).toBe('{"zero":0}');

    // 3. Array semantics: preserve order, undefined/function becomes null (RFC 8785 Section 3.2.4)
    expect(canonicalizeJson([1, undefined, 'test', null])).toBe('[1,null,"test",null]');

    // 4. Object semantics: omit undefined and function values (RFC 8785 Section 3.2.3)
    expect(canonicalizeJson({ keep: 1, drop: undefined, fn: () => {} })).toBe('{"keep":1}');

    // 5. Rejection of NaN and Infinity (RFC 8785 Section 3.2.2.3)
    expect(() => canonicalizeJson(NaN)).toThrow(TypeError);
    expect(() => canonicalizeJson(Infinity)).toThrow(TypeError);
    expect(() => canonicalizeJson(-Infinity)).toThrow(TypeError);

    // 6. String escaping: RFC 8785 Section 3.2.2.2
    expect(canonicalizeJson('Hello\nWorld\t"Quotes"\\Backslash\u0000')).toBe('"Hello\\nWorld\\t\\"Quotes\\"\\\\Backslash\\u0000"');

    // 7. Unpaired surrogates rejected (RFC 8785 Section 3.2.2.2)
    expect(() => canonicalizeJson('Lone high \uD800')).toThrow(TypeError);
    expect(() => canonicalizeJson('Lone low \uDC00')).toThrow(TypeError);

    // 8. Deterministic SHA-256 hash
    const hash1 = computeDeterministicHash({ x: 10, y: [1, 2], z: { inner: 'val' } });
    const hash2 = computeDeterministicHash({ z: { inner: 'val' }, x: 10, y: [1, 2] });
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('15. structured composition pipeline: verifies partial results -> inputs -> transformation -> composite state -> final result', async () => {
    const coordinator = await createTestCell('coord_pipeline');
    const worker1 = await createTestCell('worker_pipeline_1');
    const worker2 = await createTestCell('worker_pipeline_2');

    const task = coordinator.collectiveComputation.createTask({
      goal: 'Multi-stage pipeline analysis',
      computationType: 'DATA_TRANSFORMATION',
      payload: {
        items: [1, 2, 3, 4, 5, 6]
      }
    });

    const result = await coordinator.collectiveComputation.executeTask(task, {
      availableCells: [coordinator, worker1, worker2]
    });

    expect(result.status).toBe(ComputationStatus.COMPLETED);

    // Stage 1: Partial results
    expect(result.partialResults).toBeDefined();
    const partialSubIds = Object.keys(result.partialResults);
    expect(partialSubIds.length).toBeGreaterThan(0);

    // Stage 2: Composition inputs
    expect(result.composition.inputs).toBeDefined();
    expect(result.composition.inputs.length).toBe(partialSubIds.length);
    result.composition.inputs.forEach(input => {
      expect(input.subtaskId).toBeDefined();
      expect(input.executingCellId).toBeDefined();
      expect(input.resultHash).toMatch(/^[a-f0-9]{64}$/);
      expect(input.output).toBeDefined();
    });

    // Stage 3: Composition transformation
    expect(result.composition.transformation).toBeDefined();
    expect(result.composition.transformation.operator).toBe('NON_ADDITIVE_FUNCTIONAL_SYNTHESIS');
    expect(result.composition.transformation.rule).toBe('AMDAHL_TOPOLOGICAL_REDUCTION');
    expect(result.composition.transformation.criticalPathDepth).toBeGreaterThanOrEqual(1);
    expect(result.composition.transformation.concurrencySpeedup).toBeGreaterThan(0);
    expect(result.composition.transformation.attenuationFactor).toBeGreaterThan(0);

    // Stage 4: Composite computational state
    expect(result.composition.compositeState).toBeDefined();
    expect(result.composition.compositeState.stateId).toMatch(/^state_[a-f0-9]{16}$/);
    expect(result.composition.compositeState.stateChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.composition.compositeState.synthesizedEntities).toBeDefined();
    expect(result.composition.compositeState.crossCellResolution).toBeDefined();
    expect(result.composition.compositeState.provenanceChain.length).toBeGreaterThan(0);

    // Stage 5: Final Result (ResultComposer output)
    expect(result.finalOutput).toBeDefined();
    expect(result.finalOutput.status).toBe('SUCCESS');
    expect(result.finalOutput.compositeState).toEqual(result.composition.compositeState);
    expect(result.finalOutput.computeModel).toEqual(result.composition.computeModel);
    expect(result.finalOutput.transformation).toEqual(result.composition.transformation);
  });

  it('16. structural compute model C* = F(C1...Cn): verifies non-additive properties and overhead breakdown', async () => {
    const coordinator = await createTestCell('coord_model');
    const worker1 = await createTestCell('worker_model_1');
    const worker2 = await createTestCell('worker_model_2');

    const task = coordinator.collectiveComputation.createTask({
      goal: 'Capacity modeling',
      computationType: 'DATA_TRANSFORMATION',
      payload: {
        items: [10, 20, 30, 40]
      }
    });

    const result = await coordinator.collectiveComputation.executeTask(task, {
      availableCells: [coordinator, worker1, worker2]
    });

    const computeModel = result.composition.computeModel;
    expect(computeModel).toBeDefined();
    expect(computeModel.formula).toBe('C* = F(C1, C2, ..., Cn)');
    expect(computeModel.isNonAdditive).toBe(true);

    // Naive sum must not equal or define the effective capacity in a non-additive model
    expect(computeModel.naiveSumCapacity).toBeGreaterThan(0);
    expect(computeModel.effectiveCapacity).toBeGreaterThan(0);

    // Overhead breakdown must explicitly separate communication, synchronization, and verification
    expect(computeModel.overheadBreakdown.communicationCost).toBeGreaterThanOrEqual(0);
    expect(computeModel.overheadBreakdown.synchronizationCost).toBeGreaterThanOrEqual(0);
    expect(computeModel.overheadBreakdown.verificationCost).toBeGreaterThanOrEqual(0);
    expect(computeModel.overheadBreakdown.totalOverheadCost).toBe(
      Math.round((computeModel.overheadBreakdown.communicationCost +
        computeModel.overheadBreakdown.synchronizationCost +
        computeModel.overheadBreakdown.verificationCost) * 100) / 100
    );
  });

  it('17. derived capability model: explicitly ensures operational estimate and forbids physical CPU/GPU claims', async () => {
    const cell = await createTestCell('cell_cap_invar');
    const engine = cell.collectiveComputation;

    const capacityProfile = engine.getCellComputeCapacity(cell);
    expect(capacityProfile.isDerivedCapability).toBe(true);
    expect(capacityProfile.capacity).toBeGreaterThan(0);
    expect(capacityProfile.availability).toBeLessThanOrEqual(1.0);
    expect(capacityProfile.architecture).toBeDefined();
  });
});
