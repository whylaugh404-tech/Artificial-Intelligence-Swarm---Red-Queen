import { createHash } from 'crypto';
import { Cell } from '../../core/cell';
import { CellState } from '../../core/lifecycle';
import { deepFreeze } from '../../genome/genome';
import { logger } from '../../core/logger';
import {
  CellComputeCapacity,
  CommunicationProfile,
  ComputationDependency,
  ComputationResult,
  ComputationStatus,
  ComputationSubtask,
  ComputationTask,
  ComputationTrace,
  ComputePartition,
  SubtaskResult
} from './types';

/**
 * Deterministic canonical serialization (RFC-8785 compliant style).
 * Sorts object keys recursively and formats primitives consistently.
 */
export function canonicalSerialize(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalSerialize).join(',')}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const parts = keys.map(k => `${JSON.stringify(k)}:${canonicalSerialize((obj as Record<string, unknown>)[k])}`);
  return `{${parts.join(',')}}`;
}

/**
 * Computes deterministic SHA-256 hash for any arbitrary structured object.
 */
export function computeDeterministicHash(obj: unknown): string {
  return createHash('sha256').update(canonicalSerialize(obj)).digest('hex');
}

export interface DecompositionPlan {
  subtasks: ComputationSubtask[];
  dependencies: ComputationDependency[];
}

export type SubtaskExecutor = (
  subtask: ComputationSubtask,
  resolvedInputs: Record<string, unknown>,
  cell: Cell
) => Promise<Record<string, unknown>>;

export type ResultComposer = (
  task: ComputationTask,
  subtaskResults: Record<string, SubtaskResult>,
  dependencies: ComputationDependency[]
) => Record<string, unknown>;

export interface CollectiveComputationOptions {
  availableCells?: Cell[];
  executorOverride?: SubtaskExecutor;
  composerOverride?: ResultComposer;
  decomposerOverride?: (task: ComputationTask) => DecompositionPlan;
}

/**
 * P8.1 — Collective Computation Engine
 * 
 * Manages distributed, composition-based computation across Red Queen Cells:
 * C* = F(C1, C2, ..., Cn)
 * 
 * Incorporates:
 * - Deterministic Task Identity (Canonical Semantic Representation + SHA-256)
 * - Topological decomposition & dependency graph resolution
 * - Candidate Cell selection based on specialization, capacity, and communication profiles
 * - Parallel execution for independent subtasks
 * - Fault isolation with timeout, retry, and dependency failure tracking
 * - Strict verification & provenance tracking
 * - Complete, auditable, immutable ComputationTrace
 */
export class CollectiveComputationEngine {
  private readonly component = 'collective_computation';
  private defaultExecutors: Map<string, SubtaskExecutor> = new Map();
  private defaultComposers: Map<string, ResultComposer> = new Map();

  constructor(private readonly localCell: Cell) {
    this.registerBuiltInHandlers();
  }

  /**
   * Registers default built-in native execution handlers.
   * Completely native - strictly no LLM/SLM.
   */
  private registerBuiltInHandlers(): void {
    // 1. Graph / Concept Map Processing
    this.defaultExecutors.set('GRAPH_INFERENCE', async (subtask, resolvedInputs, cell) => {
      const concepts = cell.cognitiveGraph.getAllConcepts();
      const relations = cell.cognitiveGraph.getAllRelations();
      const focusCategory = subtask.payload.category as string | undefined;
      
      const matched = concepts.filter(c => !focusCategory || c.category === focusCategory);
      return {
        matchedCount: matched.length,
        conceptIds: matched.map(c => c.conceptId),
        relationsCount: relations.length,
        propagated: resolvedInputs.seedValue || null
      };
    });

    // 2. Data Transformation / Map-Reduce Partition
    this.defaultExecutors.set('DATA_TRANSFORMATION', async (subtask, resolvedInputs) => {
      const items = (subtask.payload.items as any[]) || [];
      const multiplier = (subtask.payload.multiplier as number) || 1;
      const transformed = items.map((val: any) => {
        if (typeof val === 'number') return val * multiplier;
        if (typeof val === 'string') return val.trim().toUpperCase();
        return val;
      });
      return {
        transformed,
        count: transformed.length,
        upstream: resolvedInputs
      };
    });

    // 3. Vector / Numerical Aggregation
    this.defaultExecutors.set('VECTOR_AGGREGATION', async (subtask, resolvedInputs) => {
      const vectors = (subtask.payload.vectors as number[][]) || [];
      const upstreamLists = Object.values(resolvedInputs).flatMap(val => {
        if (Array.isArray(val)) return val;
        if (val && typeof val === 'object' && Array.isArray((val as any).transformed)) return (val as any).transformed;
        return [];
      });

      const allNums = [...vectors.flat(), ...upstreamLists.filter(x => typeof x === 'number')];
      const sum = allNums.reduce((acc, curr) => acc + curr, 0);
      const avg = allNums.length > 0 ? sum / allNums.length : 0;

      return {
        sum,
        average: avg,
        totalElements: allNums.length
      };
    });

    // 4. Default Composer
    this.defaultComposers.set('DEFAULT', (task, subtaskResults, dependencies) => {
      const aggregatedOutputs: Record<string, unknown> = {};
      for (const [subId, res] of Object.entries(subtaskResults)) {
        aggregatedOutputs[subId] = {
          status: res.status,
          executingCell: res.executingCellId,
          output: res.output
        };
      }

      return {
        goal: task.goal,
        taskId: task.taskId,
        subtasksCompleted: Object.values(subtaskResults).filter(r => r.status === ComputationStatus.COMPLETED).length,
        subtasksTotal: Object.keys(subtaskResults).length,
        aggregatedOutputs,
        formula: 'C* = F(C1, C2, ..., Cn)',
        dependencyCount: dependencies.length
      };
    });
  }

  /**
   * Creates a deterministic computation task with canonical identity.
   */
  public createTask(params: {
    goal: string;
    computationType: string;
    payload: Record<string, unknown>;
    requiredCapabilities?: string[];
    timeoutMs?: number;
    taskId?: string;
  }): ComputationTask {
    const taskId = params.taskId || `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const requiredCapabilities = params.requiredCapabilities || [];
    const timeoutMs = params.timeoutMs || 10000;

    // Canonical representation for deterministic identity (excluding nondeterministic timing)
    const canonicalSpecification = {
      goal: params.goal,
      computationType: params.computationType,
      payload: params.payload,
      requiredCapabilities,
      originatingCellId: this.localCell.nodeId
    };

    const deterministicIdentity = computeDeterministicHash(canonicalSpecification);

    return deepFreeze({
      taskId,
      goal: params.goal,
      computationType: params.computationType,
      payload: params.payload,
      requiredCapabilities,
      originatingCellId: this.localCell.nodeId,
      timeoutMs,
      deterministicIdentity,
      createdAt: new Date().toISOString()
    });
  }

  /**
   * Models the local computational capacity of a Cell based on its genome, state, and traits.
   */
  public getCellComputeCapacity(cell: Cell): CellComputeCapacity {
    const capabilities = cell.genome?.capabilities || [];
    const specialization = cell.cognitiveState?.getSpecialization() || cell.genome?.specialization || null;
    const traits = cell.genome?.traits;

    // Architectural determination
    let architecture: 'NATIVE_TS' | 'WASM_SANDBOX' | 'COGNITIVE_REASONER' | 'DISTRIBUTED_PIPELINE' = 'NATIVE_TS';
    if (capabilities.includes('COGNITIVE_REASONING')) {
      architecture = 'COGNITIVE_REASONER';
    } else if (capabilities.includes('SWARM_COORDINATION')) {
      architecture = 'DISTRIBUTED_PIPELINE';
    }

    // Parallelism derived from maxCognitiveCycleDepth and traits
    const parallelism = Math.max(1, traits?.maxCognitiveCycleDepth || 4);
    
    // Capacity scoring based on capability count and risk tolerance
    const baseCapacity = 100.0;
    const capabilityMultiplier = 1.0 + (capabilities.length * 0.15);
    const capacity = baseCapacity * capabilityMultiplier;

    // Working memory based on concepts count and buffer
    const conceptsCount = cell.cognitiveGraph.getAllConcepts().length;
    const memory = 512.0 + (conceptsCount * 0.5); // MB capacity

    // Availability checking from cell lifecycle
    const state = cell.lifecycle.getState();
    const availability = (state === CellState.ACTIVE || state === CellState.CREATED || state === CellState.INITIALIZING) ? 1.0 : 0.0;

    return {
      capacity,
      architecture,
      parallelism,
      memory,
      specialization,
      availability
    };
  }

  /**
   * Models the communication profile between the local Cell and a target Cell.
   */
  public getCommunicationProfile(targetCell: Cell): CommunicationProfile {
    const isLocal = targetCell.nodeId === this.localCell.nodeId;
    if (isLocal) {
      return {
        bandwidth: 10000.0, // Local loopback MB/s
        latency: 0.1, // Near zero latency
        topology: 'LOCAL_CLUSTER',
        reliability: 1.0
      };
    }

    // Assess routing table distance and peer connection
    const isPeerConnected = this.localCell.transport.getPeer(targetCell.nodeId) !== undefined;
    const topology = isPeerConnected ? 'DIRECT_P2P' : 'DHT_ROUTED';
    const latency = isPeerConnected ? 15.0 : 65.0; // ms
    const bandwidth = isPeerConnected ? 500.0 : 100.0; // MB/s
    const reliability = isPeerConnected ? 0.99 : 0.92;

    return {
      bandwidth,
      latency,
      topology,
      reliability
    };
  }

  /**
   * Default structural decomposition into subtasks and dependencies.
   */
  public decomposeTask(task: ComputationTask): DecompositionPlan {
    const subtasks: ComputationSubtask[] = [];
    const dependencies: ComputationDependency[] = [];

    // If task payload already contains explicit subtask partitioning:
    if (Array.isArray(task.payload.subtasks) && task.payload.subtasks.length > 0) {
      task.payload.subtasks.forEach((sub: any, index: number) => {
        const subtaskId = sub.subtaskId || `${task.taskId}_sub_${index + 1}`;
        subtasks.push({
          subtaskId,
          parentTaskId: task.taskId,
          type: sub.type || task.computationType,
          payload: sub.payload || {},
          requiredCapabilities: sub.requiredCapabilities || task.requiredCapabilities,
          requiredSpecialization: sub.requiredSpecialization || null,
          timeoutMs: sub.timeoutMs || 4000,
          maxRetries: sub.maxRetries ?? 2,
          priority: sub.priority || 0
        });

        if (Array.isArray(sub.dependsOn)) {
          sub.dependsOn.forEach((depId: string) => {
            dependencies.push({
              dependencyId: `dep_${depId}_to_${subtaskId}`,
              sourceSubtaskId: depId,
              targetSubtaskId: subtaskId,
              requiredOutputKey: sub.requiredOutputKey,
              isOptional: false
            });
          });
        }
      });
      return { subtasks, dependencies };
    }

    // If payload contains partitionable items:
    if (Array.isArray(task.payload.items) && task.payload.items.length > 1) {
      const items = task.payload.items;
      const chunkSize = Math.max(1, Math.ceil(items.length / 2));
      const chunk1 = items.slice(0, chunkSize);
      const chunk2 = items.slice(chunkSize);

      const sub1Id = `${task.taskId}_part_1`;
      const sub2Id = `${task.taskId}_part_2`;
      const aggId = `${task.taskId}_aggregate`;

      subtasks.push({
        subtaskId: sub1Id,
        parentTaskId: task.taskId,
        type: 'DATA_TRANSFORMATION',
        payload: { items: chunk1, multiplier: task.payload.multiplier ?? 1 },
        requiredCapabilities: task.requiredCapabilities,
        requiredSpecialization: null,
        timeoutMs: 4000,
        maxRetries: 2,
        priority: 1
      });

      subtasks.push({
        subtaskId: sub2Id,
        parentTaskId: task.taskId,
        type: 'DATA_TRANSFORMATION',
        payload: { items: chunk2, multiplier: task.payload.multiplier ?? 1 },
        requiredCapabilities: task.requiredCapabilities,
        requiredSpecialization: null,
        timeoutMs: 4000,
        maxRetries: 2,
        priority: 1
      });

      subtasks.push({
        subtaskId: aggId,
        parentTaskId: task.taskId,
        type: 'VECTOR_AGGREGATION',
        payload: { vectors: [] },
        requiredCapabilities: task.requiredCapabilities,
        requiredSpecialization: null,
        timeoutMs: 4000,
        maxRetries: 1,
        priority: 0
      });

      dependencies.push({
        dependencyId: `dep_${sub1Id}_to_${aggId}`,
        sourceSubtaskId: sub1Id,
        targetSubtaskId: aggId,
        isOptional: false
      });

      dependencies.push({
        dependencyId: `dep_${sub2Id}_to_${aggId}`,
        sourceSubtaskId: sub2Id,
        targetSubtaskId: aggId,
        isOptional: false
      });

      return { subtasks, dependencies };
    }

    // Default single atomic subtask
    const defaultSubId = `${task.taskId}_atomic`;
    subtasks.push({
      subtaskId: defaultSubId,
      parentTaskId: task.taskId,
      type: task.computationType,
      payload: task.payload,
      requiredCapabilities: task.requiredCapabilities,
      requiredSpecialization: null,
      timeoutMs: task.timeoutMs,
      maxRetries: 2,
      priority: 0
    });

    return { subtasks, dependencies };
  }

  /**
   * Selects the most optimal Cell for a subtask based on capabilities, specialization,
   * capacity, and communication profile.
   * Uses composition law C* = F(C1, C2... Cn) rather than simple scalar summation.
   */
  public selectOptimalCellForSubtask(
    subtask: ComputationSubtask,
    candidateCells: Cell[]
  ): { cell: Cell; score: number; profile: CellComputeCapacity; comm: CommunicationProfile } {
    if (!candidateCells || candidateCells.length === 0) {
      throw new Error('No candidate cells available for computation');
    }

    let bestCell: Cell | null = null;
    let highestScore = -Infinity;
    let bestProfile: CellComputeCapacity | null = null;
    let bestComm: CommunicationProfile | null = null;

    for (const cell of candidateCells) {
      const cap = this.getCellComputeCapacity(cell);
      const comm = this.getCommunicationProfile(cell);

      // Check hard capability requirement
      const cellCaps = cell.genome?.capabilities || [];
      const meetsCapabilities = subtask.requiredCapabilities.every(req => cellCaps.includes(req as any));
      if (!meetsCapabilities) {
        continue;
      }

      // Check specialization match
      let specializationBonus = 0;
      if (subtask.requiredSpecialization) {
        if (cap.specialization === subtask.requiredSpecialization) {
          specializationBonus = 50;
        } else {
          continue; // Specialization required but not matched
        }
      }

      // Compositional suitability scoring:
      // Score = (Capacity * Parallelism * Availability) / (1 + Latency / 100) * Reliability + SpecializationBonus
      const latencyPenalty = 1.0 + (comm.latency / 100.0);
      const effectiveThroughput = (cap.capacity * cap.parallelism * cap.availability) / latencyPenalty;
      const score = (effectiveThroughput * comm.reliability) + specializationBonus;

      if (score > highestScore) {
        highestScore = score;
        bestCell = cell;
        bestProfile = cap;
        bestComm = comm;
      }
    }

    if (!bestCell || !bestProfile || !bestComm) {
      // Fallback to localCell if it satisfies or if no candidates matched strictly
      bestCell = this.localCell;
      bestProfile = this.getCellComputeCapacity(this.localCell);
      bestComm = this.getCommunicationProfile(this.localCell);
      highestScore = 1.0;
    }

    return {
      cell: bestCell,
      score: highestScore,
      profile: bestProfile,
      comm: bestComm
    };
  }

  /**
   * Builds the execution batches/waves according to the topological sort of dependencies.
   * Enables parallel execution of independent subtasks.
   */
  public buildExecutionWaves(
    subtasks: ComputationSubtask[],
    dependencies: ComputationDependency[]
  ): ComputationSubtask[][] {
    const subtaskMap = new Map<string, ComputationSubtask>();
    subtasks.forEach(s => subtaskMap.set(s.subtaskId, s));

    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>(); // source -> targets

    subtasks.forEach(s => {
      inDegree.set(s.subtaskId, 0);
      dependents.set(s.subtaskId, []);
    });

    dependencies.forEach(d => {
      if (inDegree.has(d.targetSubtaskId) && inDegree.has(d.sourceSubtaskId)) {
        inDegree.set(d.targetSubtaskId, (inDegree.get(d.targetSubtaskId) || 0) + 1);
        dependents.get(d.sourceSubtaskId)!.push(d.targetSubtaskId);
      }
    });

    const waves: ComputationSubtask[][] = [];
    const completed = new Set<string>();

    while (completed.size < subtasks.length) {
      const currentWave: ComputationSubtask[] = [];

      for (const [subId, deg] of inDegree.entries()) {
        if (deg === 0 && !completed.has(subId)) {
          currentWave.push(subtaskMap.get(subId)!);
        }
      }

      if (currentWave.length === 0) {
        // Cyclic or unresolvable dependency detected - break remaining into fallback wave
        logger.warn(this.component, 'cycle_or_unresolved_dependencies_detected', {
          remaining: subtasks.filter(s => !completed.has(s.subtaskId)).map(s => s.subtaskId)
        });
        const remaining = subtasks.filter(s => !completed.has(s.subtaskId));
        waves.push(remaining);
        break;
      }

      // Sort by priority within the wave
      currentWave.sort((a, b) => b.priority - a.priority);
      waves.push(currentWave);

      // Decrement in-degree for downstream nodes
      currentWave.forEach(sub => {
        completed.add(sub.subtaskId);
        const nextNodes = dependents.get(sub.subtaskId) || [];
        nextNodes.forEach(nxt => {
          inDegree.set(nxt, Math.max(0, (inDegree.get(nxt) || 0) - 1));
        });
      });
    }

    return waves;
  }

  /**
   * Executes a single subtask on a designated Cell with timeout and retry handling.
   * Ensures complete fault isolation.
   */
  private async executeSubtaskWithFaultIsolation(
    subtask: ComputationSubtask,
    resolvedInputs: Record<string, unknown>,
    targetCell: Cell,
    executor: SubtaskExecutor
  ): Promise<SubtaskResult> {
    const startTime = Date.now();
    let attempts = 0;
    const maxRetries = subtask.maxRetries;
    let lastError: string | undefined;

    while (attempts <= maxRetries) {
      attempts++;
      try {
        // Enforce timeout using Promise.race
        const executionPromise = executor(subtask, resolvedInputs, targetCell);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Subtask ${subtask.subtaskId} execution timed out after ${subtask.timeoutMs}ms`));
          }, subtask.timeoutMs);
        });

        const rawOutput = await Promise.race([executionPromise, timeoutPromise]);
        const duration = Date.now() - startTime;

        const resultPayload = {
          subtaskId: subtask.subtaskId,
          output: rawOutput,
          executingCellId: targetCell.nodeId
        };
        const resultHash = computeDeterministicHash(resultPayload);

        return {
          subtaskId: subtask.subtaskId,
          taskId: subtask.parentTaskId,
          executingCellId: targetCell.nodeId,
          status: ComputationStatus.COMPLETED,
          output: rawOutput,
          attempts,
          executionDurationMs: duration,
          provenance: [this.localCell.nodeId, targetCell.nodeId],
          resultHash
        };
      } catch (err: any) {
        lastError = err?.message || String(err);
        logger.warn(this.component, 'subtask_execution_attempt_failed', {
          subtaskId: subtask.subtaskId,
          attempt: attempts,
          cellId: targetCell.nodeId,
          error: lastError
        });
      }
    }

    // All retries exhausted -> Return isolated failure without terminating the fabric
    const duration = Date.now() - startTime;
    return {
      subtaskId: subtask.subtaskId,
      taskId: subtask.parentTaskId,
      executingCellId: targetCell.nodeId,
      status: ComputationStatus.FAILED,
      output: {},
      error: lastError,
      attempts,
      executionDurationMs: duration,
      provenance: [this.localCell.nodeId, targetCell.nodeId],
      resultHash: computeDeterministicHash({ error: lastError, subtaskId: subtask.subtaskId })
    };
  }

  /**
   * Verifies an executed subtask result against provenance and consistency rules.
   */
  public verifySubtaskResult(
    subtask: ComputationSubtask,
    result: SubtaskResult
  ): { verified: boolean; reason: string } {
    if (result.status !== ComputationStatus.COMPLETED) {
      return {
        verified: false,
        reason: `Subtask status is ${result.status}: ${result.error || 'Execution failed'}`
      };
    }

    if (!result.executingCellId) {
      return {
        verified: false,
        reason: 'Missing executingCellId in result'
      };
    }

    if (!result.provenance || result.provenance.length === 0) {
      return {
        verified: false,
        reason: 'Missing provenance chain in result'
      };
    }

    const expectedHash = computeDeterministicHash({
      subtaskId: subtask.subtaskId,
      output: result.output,
      executingCellId: result.executingCellId
    });

    if (result.resultHash !== expectedHash) {
      return {
        verified: false,
        reason: 'Deterministic resultHash mismatch with payload content'
      };
    }

    return {
      verified: true,
      reason: 'Output signature, provenance, and hash verified'
    };
  }

  /**
   * Coordinates the full lifecycle of a computation task:
   * Decomposition → Parallel Wave Execution → Verification → Composition → Immutable Deep-Frozen Result.
   */
  public async executeTask(
    task: ComputationTask,
    options?: CollectiveComputationOptions
  ): Promise<ComputationResult> {
    const traceId = `trace_${task.taskId}_${Date.now()}`;
    const candidateCells = options?.availableCells && options.availableCells.length > 0 
      ? options.availableCells 
      : [this.localCell];

    // 1. Decomposition
    const decomposer = options?.decomposerOverride || this.decomposeTask.bind(this);
    const { subtasks, dependencies } = decomposer(task);

    // 2. Topology & Wave Construction
    const waves = this.buildExecutionWaves(subtasks, dependencies);
    const executionOrder = waves.map(wave => wave.map(s => s.subtaskId));

    const allocations: Record<string, string> = {};
    const dispatches: ComputationTrace['dispatches'] = [];
    const verificationTrace: ComputationTrace['verificationTrace'] = [];
    const subtaskResults: Record<string, SubtaskResult> = {};

    const executor = options?.executorOverride || ((sub, inputs, cell) => {
      const handler = this.defaultExecutors.get(sub.type);
      if (!handler) {
        // Fallback generic executor
        return Promise.resolve({ result: `Executed ${sub.type}`, ...sub.payload, ...inputs });
      }
      return handler(sub, inputs, cell);
    });

    // 3. Execution Wave by Wave (Parallel execution within wave)
    for (const wave of waves) {
      const wavePromises = wave.map(async subtask => {
        // Resolve upstream dependencies
        const upstreamDeps = dependencies.filter(d => d.targetSubtaskId === subtask.subtaskId);
        const resolvedInputs: Record<string, unknown> = {};

        let hasDependencyFailure = false;
        for (const dep of upstreamDeps) {
          const upstreamRes = subtaskResults[dep.sourceSubtaskId];
          if (!upstreamRes || upstreamRes.status !== ComputationStatus.COMPLETED) {
            if (!dep.isOptional) {
              hasDependencyFailure = true;
              break;
            }
          } else {
            if (dep.requiredOutputKey) {
              resolvedInputs[dep.requiredOutputKey] = upstreamRes.output[dep.requiredOutputKey];
            } else {
              resolvedInputs[dep.sourceSubtaskId] = upstreamRes.output;
            }
          }
        }

        // Cell Selection
        const allocation = this.selectOptimalCellForSubtask(subtask, candidateCells);
        allocations[subtask.subtaskId] = allocation.cell.nodeId;

        const dispatchRecord: ComputationTrace['dispatches'][number] = {
          subtaskId: subtask.subtaskId,
          cellId: allocation.cell.nodeId,
          attempt: 1,
          startedAt: new Date().toISOString(),
          status: 'RUNNING'
        };
        dispatches.push(dispatchRecord);

        if (hasDependencyFailure) {
          // Fault isolation: track dependency failure gracefully
          const failedRes: SubtaskResult = {
            subtaskId: subtask.subtaskId,
            taskId: task.taskId,
            executingCellId: allocation.cell.nodeId,
            status: ComputationStatus.FAILED,
            output: {},
            error: `Upstream dependency failed for subtask ${subtask.subtaskId}`,
            attempts: 0,
            executionDurationMs: 0,
            provenance: [this.localCell.nodeId, allocation.cell.nodeId],
            resultHash: computeDeterministicHash({ dependencyFailure: true, subtaskId: subtask.subtaskId })
          };
          subtaskResults[subtask.subtaskId] = failedRes;
          dispatchRecord.completedAt = new Date().toISOString();
          dispatchRecord.status = 'DEPENDENCY_FAILED';
          verificationTrace.push({
            subtaskId: subtask.subtaskId,
            verified: false,
            reason: 'Dependency failure prevented execution'
          });
          return;
        }

        // Execute subtask with timeout and retry
        const res = await this.executeSubtaskWithFaultIsolation(
          subtask,
          resolvedInputs,
          allocation.cell,
          executor
        );
        subtaskResults[subtask.subtaskId] = res;

        dispatchRecord.completedAt = new Date().toISOString();
        dispatchRecord.durationMs = res.executionDurationMs;
        dispatchRecord.status = res.status;
        dispatchRecord.attempt = res.attempts;

        // 4. Verification
        const verification = this.verifySubtaskResult(subtask, res);
        verificationTrace.push({
          subtaskId: subtask.subtaskId,
          verified: verification.verified,
          reason: verification.reason
        });
      });

      // Parallel execution of all subtasks in this wave
      await Promise.all(wavePromises);
    }

    // 5. Composition of final results
    const composer = options?.composerOverride || this.defaultComposers.get('DEFAULT')!;
    const finalOutput = composer(task, subtaskResults, dependencies);

    // Compute overall status
    const allResults = Object.values(subtaskResults);
    const completedCount = allResults.filter(r => r.status === ComputationStatus.COMPLETED).length;
    let overallStatus: ComputationStatus = ComputationStatus.COMPLETED;
    if (completedCount === 0 && allResults.length > 0) {
      overallStatus = ComputationStatus.FAILED;
    } else if (completedCount < allResults.length) {
      overallStatus = ComputationStatus.PARTIAL;
    }

    // Compile Complete Trace
    const trace: ComputationTrace = {
      traceId,
      taskId: task.taskId,
      goal: task.goal,
      decomposedSubtaskIds: subtasks.map(s => s.subtaskId),
      executionOrder,
      allocations,
      dispatches,
      verificationTrace,
      compositionDetails: {
        transformationRule: 'COLLECTIVE_COMPOSITION',
        inputSubtaskCount: subtasks.length,
        compositionTraceId: `comp_trace_${computeDeterministicHash(finalOutput)}`,
        formula: 'C* = F(C1, C2, ..., Cn)'
      },
      completedAt: new Date().toISOString()
    };

    // Overall verification status
    const allVerified = verificationTrace.length > 0 && verificationTrace.every(v => v.verified);
    const verifiedCount = verificationTrace.filter(v => v.verified).length;
    const consistencyScore = verificationTrace.length > 0 ? verifiedCount / verificationTrace.length : 0.0;

    const provenanceSet = new Set<string>([this.localCell.nodeId]);
    Object.values(subtaskResults).forEach(res => {
      res.provenance.forEach(p => provenanceSet.add(p));
    });

    const deterministicHash = computeDeterministicHash({
      taskId: task.taskId,
      finalOutput,
      traceHash: computeDeterministicHash(trace.executionOrder),
      originatingCellId: this.localCell.nodeId
    });

    const computationResult: ComputationResult = {
      taskId: task.taskId,
      originatingCellId: this.localCell.nodeId,
      status: overallStatus,
      finalOutput,
      partialResults: subtaskResults,
      dependencies,
      provenance: Array.from(provenanceSet).sort(),
      verificationStatus: {
        verified: allVerified,
        verifierCellId: this.localCell.nodeId,
        verifiedAt: new Date().toISOString(),
        consistencyScore,
        checksum: deterministicHash,
        notes: `Verified ${verifiedCount}/${verificationTrace.length} subtasks.`
      },
      trace,
      deterministicHash,
      completedAt: new Date().toISOString()
    };

    // Deep freeze guarantees immutability
    return deepFreeze(computationResult);
  }
}

// Trigger GitHub Sync
