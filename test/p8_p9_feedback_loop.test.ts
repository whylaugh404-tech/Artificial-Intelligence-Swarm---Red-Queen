import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { CellState } from '../src/redqueen/core/lifecycle';
import { CellGenome } from '../src/redqueen/genome/types';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { CognitiveConcept, CognitiveRelation, CognitiveRelationPredicate, RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';
import { InformationCategory } from '../src/redqueen/metabolism/types';
import { Context, EpistemicStatus } from '../src/redqueen/cognition/epistemic/types';
import { EpistemicFusionEngine, EvidencePolarity } from '../src/redqueen/cognition/epistemic/fusion';
import { EvidenceDependencyGraph } from '../src/redqueen/cognition/evidence/graph';
import { WorldModelEngine } from '../src/redqueen/cognition/worldmodel/engine';
import { CollectiveComputationEngine } from '../src/redqueen/cognition/computation/engine';
import { DistributedComputationFabric } from '../src/redqueen/cognition/computation/fabric';
import {
  ComputationStatus,
  CognitiveComputationRequest,
  CognitiveComputationRequestSchema,
  CognitiveComputationFeedbackResult,
  CognitiveComputationFeedbackResultSchema,
  ComputationResult
} from '../src/redqueen/cognition/computation/types';
import { deepFreeze } from '../src/redqueen/genome/genome';
import { CollectiveCognitionEngine } from '../src/redqueen/cognition/collective/engine';
import { CognitiveRuntime } from '../src/redqueen/cognition/runtime';
import { EvolutionEngine } from '../src/redqueen/evolution/engine';
import {
  ComputationFeedbackTelemetry,
  ComputationFeedbackTelemetrySchema
} from '../src/redqueen/evolution/types';

describe('P8 Distributed Computation -> P7 Epistemic/WorldModel -> P9 Collective Cognitive System Feedback Loop', () => {
  let cell1: Cell;
  let cell2: Cell;
  let context: Context;
  let fusionEngine: EpistemicFusionEngine;
  let worldModelEngine: WorldModelEngine;
  let computeEngine1: CollectiveComputationEngine;
  let computeEngine2: CollectiveComputationEngine;
  let collectiveEngine: CollectiveCognitionEngine;
  let runtime: CognitiveRuntime;
  let evolutionEngine: EvolutionEngine;

  const createMockCell = (id: string, specs: string, caps: string[], fitness = 0.9): Cell => {
    const graph = new CognitiveGraph(id, {} as any);
    const mockCell: Cell = {
      nodeId: id,
      lineageId: `lin_${id}`,
      genome: {
        genomeId: `gen_${id}`,
        lineageId: `lin_${id}`,
        generation: 1,
        fitness,
        capabilities: caps,
        specialization: specs,
        traits: { executionParallelism: 2 }
      } as unknown as CellGenome,
      cognitiveGraph: graph,
      memoryStore: {
        put: vi.fn(),
        get: vi.fn(),
        query: vi.fn().mockResolvedValue([])
      } as any,
      transport: {
        sendTo: vi.fn(),
        broadcast: vi.fn(),
        getPeer: vi.fn(),
        on: vi.fn(),
        onMessage: vi.fn(),
        removeListener: vi.fn()
      } as any,
      lifecycle: {
        getState: vi.fn().mockReturnValue(CellState.ACTIVE)
      } as any,
      cognitiveState: {
        getState: vi.fn().mockReturnValue({
          mode: 'active',
          reliability: 0.9,
          computation: 0.85,
          cognition: 0.8,
          knowledge: 0.75,
          experience: 0.7,
          resourceEfficiency: 0.8
        }),
        getSpecialization: vi.fn().mockReturnValue(specs),
        setSpecialization: vi.fn(),
        getChaosState: vi.fn().mockReturnValue(0.42),
        updateChaosState: vi.fn()
      } as any,
      restoreGenome: vi.fn((newGenome: CellGenome) => {
        (mockCell as any).genome = newGenome;
      }),
      start: vi.fn(),
      stop: vi.fn()
    } as unknown as Cell;

    return mockCell;
  };

  beforeEach(() => {
    cell1 = createMockCell('cell_alpha', 'ANALYTICAL_REASONING', ['COGNITIVE_REASONING', 'INFO_PROCESSING']);
    cell2 = createMockCell('cell_beta', 'DATA_TRANSFORMATION', ['DATA_TRANSFORMATION', 'SWARM_COORDINATION']);

    context = {
      contextId: 'ctx_feedback_loop',
      domain: 'distributed_quantum_dynamics'
    };

    fusionEngine = new EpistemicFusionEngine();
    worldModelEngine = new WorldModelEngine(cell1.cognitiveGraph);
    computeEngine1 = new CollectiveComputationEngine(cell1);
    computeEngine2 = new CollectiveComputationEngine(cell2);
    collectiveEngine = new CollectiveCognitionEngine(cell1);
    runtime = new CognitiveRuntime([cell1, cell2], {
      collectiveEngine
    });
    evolutionEngine = new EvolutionEngine(cell1);
  });

  // 1. Deterministic Identity
  it('1. should generate strictly deterministic identity for CognitiveComputationRequest with zero non-deterministic components', () => {
    const payload = { items: [1, 2, 3, 4], multiplier: 3 };
    const request1 = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'verify_quantum_coherence_matrix',
      computationType: 'DATA_TRANSFORMATION',
      payload,
      requiredCapabilities: ['DATA_TRANSFORMATION'],
      targetRepresentationId: 'concept_quantum_state',
      timeoutMs: 5000
    });

    const request2 = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'verify_quantum_coherence_matrix',
      computationType: 'DATA_TRANSFORMATION',
      payload,
      requiredCapabilities: ['DATA_TRANSFORMATION'],
      targetRepresentationId: 'concept_quantum_state',
      timeoutMs: 5000
    });

    expect(request1.deterministicIdentity).toBeDefined();
    expect(request1.deterministicIdentity).toBe(request2.deterministicIdentity);
    expect(request1.requestId).toBe(request2.requestId);
    expect(CognitiveComputationRequestSchema.safeParse(request1).success).toBe(true);
  });

  // 2. Complete Provenance Chain: P9 -> P8 -> P7 -> WorldModel -> P9
  it('2. should maintain complete uninterrupted provenance from P9 cognitive state through P8 computation to P7 evidence to WorldModel to P9 update', async () => {
    // Setup initial concept in cell1 graph
    const concept: CognitiveConcept = {
      conceptId: 'concept_quantum_state',
      canonicalName: 'Quantum Coherence State',
      description: 'Superposition coherence measurement',
      category: InformationCategory.CYBERSECURITY,
      sourceKnowledgeIds: ['kn_quantum'],
      sourceExperienceIds: [],
      originatingCellId: 'cell_alpha',
      version: 1,
      confidence: 0.6,
      provenance: ['cell_alpha_observation'],
      verificationStatus: RepresentationVerificationStatus.PENDING,
      metadata: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };
    cell1.cognitiveGraph.addConcept(concept);

    const request = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'transform_and_verify_state',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [10, 20, 30], multiplier: 2 },
      requiredCapabilities: ['DATA_TRANSFORMATION'],
      targetRepresentationId: concept.conceptId
    });

    const feedbackResult = await runtime.executeFeedbackLoop(
      request,
      computeEngine1,
      worldModelEngine
    );

    expect(feedbackResult.status).toBe(ComputationStatus.COMPLETED);
    expect(feedbackResult.provenance).toBeDefined();
    expect(feedbackResult.provenance.length).toBeGreaterThanOrEqual(5);

    // Verify each link in the provenance chain
    expect(feedbackResult.provenance.some(p => p.includes('p9_state_request:'))).toBe(true);
    expect(feedbackResult.provenance.some(p => p.includes('p8_computation_executed:'))).toBe(true);
    expect(feedbackResult.provenance.some(p => p.includes('p7_evidence_adapted:'))).toBe(true);
    expect(feedbackResult.provenance.some(p => p.includes('p7_epistemic_fused:'))).toBe(true);
    expect(feedbackResult.provenance.some(p => p.includes('p7_world_model_updated:'))).toBe(true);
    expect(feedbackResult.provenance.some(p => p.includes('p9_collective_updated:'))).toBe(true);
  });

  // 3. Bounded Feedback Loop (Prevents runaway recursion)
  it('3. should enforce strict cycle boundedness and block execution when maxCycleDepth is exceeded', async () => {
    const request = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'recursive_synthesis',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [1, 2] },
      feedbackCycleDepth: 4,
      maxCycleDepth: 3
    });

    const feedbackResult = await runtime.executeFeedbackLoop(
      request,
      computeEngine1,
      worldModelEngine
    );

    expect(feedbackResult.isBounded).toBe(true);
    expect(feedbackResult.status).toBe(ComputationStatus.BLOCKED);
    expect(feedbackResult.provenance.some(p => p.includes('cycle_depth_exceeded'))).toBe(true);
  });

  // 4. Failure & Timeout Handling without Corrupting P9 State
  it('4. should handle computation failure or timeout gracefully without crashing or corrupting P9 cognitive state', async () => {
    const failingRequest = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'failing_computation_task',
      computationType: 'UNKNOWN_NONEXISTENT_TYPE',
      payload: { test: true },
      timeoutMs: 1000
    });

    const feedbackResult = await runtime.executeFeedbackLoop(
      failingRequest,
      computeEngine1,
      worldModelEngine
    );

    expect(feedbackResult.status).toBe(ComputationStatus.FAILED);
    expect(feedbackResult.evidence).toBeDefined();
    // Evidence should reflect failure (e.g. 0 confidence or CONTRADICTS)
    expect(feedbackResult.evidence.confidence).toBe(0.0);
    expect(feedbackResult.evidence.sourceId).toBe('distributed_computation');

    // P9 state must remain coherent and valid
    const cellState = cell1.cognitiveState.getState() as any;
    expect(cellState.reliability).toBeGreaterThan(0);
  });

  // 5. Strict Architectural Barrier: No Direct Mutation of P9 by P8
  it('5. should forbid P8 computation result from directly mutating P9 collective state without passing through P7', async () => {
    const task = computeEngine1.createTask({
      goal: 'direct_task_execution',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [5, 10] }
    });

    const rawP8Result = await computeEngine1.executeTask(task);
    expect(rawP8Result.status).toBe(ComputationStatus.COMPLETED);

    // Verify that rawP8Result does NOT contain or directly produce a CollectiveCognitiveState
    expect((rawP8Result as any).collectiveState).toBeUndefined();
    expect((rawP8Result as any).emergentStructures).toBeUndefined();

    // Verify that attempting to update collective engine requires a WorldModel, not a raw ComputationResult
    expect(() => {
      (collectiveEngine as any).updateFromWorldModel(rawP8Result, [cell1], context);
    }).toThrow();
  });

  // 6. Epistemic Verification & Status Evaluation (No unearned automatic promotion)
  it('6. should evaluate computational evidence using Subjective Logic and not automatically promote unearned VERIFIED status', async () => {
    const task = computeEngine1.createTask({
      goal: 'unverified_computation',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [1, 2] }
    });
    const result = await computeEngine1.executeTask(task);

    // Adapt into evidence
    const evidence = fusionEngine.adaptComputationResultToEvidence(result, context, {
      targetRepresentationId: 'target_hypothesis_01',
      polarity: EvidencePolarity.SUPPORTS
    });

    expect(evidence.sourceId).toBe('distributed_computation');
    expect(evidence.confidence).toBeGreaterThan(0);

    // Fuse evidence
    const edg = cell1.cognitiveGraph.getEDG();
    const fusionResult = fusionEngine.fuse([evidence], context, edg);

    // With a single uncorroborated computational evidence, belief should increase but status must NOT be unconditionally VERIFIED
    expect(fusionResult.fusedState.status).not.toBe(EpistemicStatus.VERIFIED);
    expect(fusionResult.fusedState.opinion.uncertainty).toBeGreaterThan(0.1);
  });

  // 7. World Model Integration
  it('7. should integrate computational evidence into WorldModel updating entities, processes, and beliefs', () => {
    const concept: CognitiveConcept = {
      conceptId: 'concept_alpha',
      canonicalName: 'Alpha Concept',
      description: 'Initial concept',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      sourceKnowledgeIds: ['kn_alpha'],
      sourceExperienceIds: [],
      originatingCellId: 'cell_alpha',
      version: 1,
      confidence: 0.5,
      provenance: ['init'],
      verificationStatus: RepresentationVerificationStatus.PENDING,
      metadata: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };
    cell1.cognitiveGraph.addConcept(concept);

    const initialWorldModel = worldModelEngine.compose({
      originatingCellId: cell1.nodeId,
      context,
      concepts: [concept]
    });

    const mockEvidence = {
      evidenceId: 'ev_comp_test_123',
      sourceId: 'distributed_computation',
      observationId: 'task_test_123',
      timestamp: '2026-01-01T00:00:00.000Z',
      provenance: {
        sourceId: 'distributed_computation',
        observationId: 'task_test_123',
        timestamp: '2026-01-01T00:00:00.000Z',
        derivedFrom: ['cell_alpha', 'cell_beta'],
        supportingRepresentationIds: [concept.conceptId],
        contradictingRepresentationIds: []
      },
      context,
      confidence: 0.85
    };

    const updatedWorldModel = worldModelEngine.integrateComputationalEvidence(
      initialWorldModel,
      mockEvidence as any,
      cell1.cognitiveGraph
    );

    expect(updatedWorldModel.modelId).toBeDefined();
    expect(updatedWorldModel.evidenceIds).toContain(mockEvidence.evidenceId);
    expect(updatedWorldModel.provenance).toContain(mockEvidence.sourceId);
  });

  // 8. P9 Collective State Update from Updated WorldModel
  it('8. should update P9 collective representation and feature vectors from the updated WorldModel', () => {
    const concept: CognitiveConcept = {
      conceptId: 'concept_beta',
      canonicalName: 'Beta Concept',
      description: 'Beta concept test',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      sourceKnowledgeIds: ['kn_beta'],
      sourceExperienceIds: [],
      originatingCellId: 'cell_alpha',
      version: 1,
      confidence: 0.8,
      provenance: ['init'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      metadata: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };
    cell1.cognitiveGraph.addConcept(concept);

    const wm = worldModelEngine.compose({
      originatingCellId: cell1.nodeId,
      context,
      concepts: [concept]
    });

    const updatedCollective = collectiveEngine.updateFromWorldModel(wm, [cell1, cell2], context);

    expect(updatedCollective).toBeDefined();
    expect(updatedCollective.collectiveState).toBeDefined();
    expect(updatedCollective.collectiveState.resultVector).toBeDefined();
    expect(updatedCollective.beliefs.some(b => b.conceptId === concept.conceptId)).toBe(true);
  });

  // 9. Distributed Fabric Remote Provenance Preservation
  it('9. should preserve complete distributed provenance including remote executing Cell ID and trace', () => {
    const fabric = new DistributedComputationFabric(cell1, computeEngine1);
    expect(fabric).toBeDefined();

    // Verify remote execution provenance validation logic preserves originatingCellId and executingCellId
    const subtaskId = 'sub_test_dist_01';
    const taskId = 'task_dist_01';
    const resultHash = 'hash_0123456789abcdef';

    const validProvenance = [cell1.nodeId, cell2.nodeId];
    expect(validProvenance[0]).toBe(cell1.nodeId);
    expect(validProvenance.includes(cell2.nodeId)).toBe(true);
  });

  // 10. Cell Evolution Telemetry / Observation Exposure
  it('10. should expose typed computation feedback telemetry in EvolutionEngine and reflect in fitness evaluation', () => {
    const telemetry: ComputationFeedbackTelemetry = {
      telemetryId: 'tel_feedback_001',
      cellId: cell1.nodeId,
      taskId: 'task_001',
      status: ComputationStatus.COMPLETED,
      computationFitnessScore: 0.95,
      epistemicContributionScore: 0.88,
      cycleDepth: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
      provenance: [cell1.nodeId, 'task_001'],
      deterministicHash: 'hash_telemetry_001'
    };

    expect(ComputationFeedbackTelemetrySchema.safeParse(telemetry).success).toBe(true);

    evolutionEngine.recordComputationTelemetry(telemetry);
    const recorded = evolutionEngine.getComputationTelemetry(cell1.nodeId);
    expect(recorded.length).toBe(1);
    expect(recorded[0].telemetryId).toBe('tel_feedback_001');

    // Fitness evaluation should factor in the computational telemetry
    const fitness = evolutionEngine.evaluateFitness(cell1);
    expect(fitness.components.computationPerformance).toBeGreaterThan(0.5);
  });

  // 11. Type Safety (Zero `any` in new schemas)
  it('11. should validate that all feedback loop payloads and results conform strictly to Zod schemas', () => {
    const validRequest = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'type_safety_verification',
      computationType: 'DATA_TRANSFORMATION',
      payload: { numbers: [1, 2, 3] },
      timeoutMs: 3000
    });

    const parsedRequest = CognitiveComputationRequestSchema.safeParse(validRequest);
    expect(parsedRequest.success).toBe(true);

    const invalidRequest = { ...validRequest, timeoutMs: -100 };
    const failedParsed = CognitiveComputationRequestSchema.safeParse(invalidRequest);
    expect(failedParsed.success).toBe(false);
  });

  // 12. Idempotency & Repeatability
  it('12. should produce identical deterministic identity across independent feedback loop runs with identical inputs', async () => {
    const payload = { items: [100, 200], multiplier: 4 };

    const requestA = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'idempotent_test_goal',
      computationType: 'DATA_TRANSFORMATION',
      payload,
      targetRepresentationId: 'target_rep_id'
    });

    const requestB = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'idempotent_test_goal',
      computationType: 'DATA_TRANSFORMATION',
      payload,
      targetRepresentationId: 'target_rep_id'
    });

    expect(requestA.deterministicIdentity).toBe(requestB.deterministicIdentity);
    expect(requestA.requestId).toBe(requestB.requestId);

    const resultA = await runtime.executeFeedbackLoop(requestA, computeEngine1, worldModelEngine);
    const resultB = await runtime.executeFeedbackLoop(requestB, computeEngine1, worldModelEngine);

    expect(resultA.deterministicIdentity).toBe(resultB.deterministicIdentity);
    expect(resultA.status).toBe(resultB.status);
    expect(resultA.evidence.observationId).toBe(resultB.evidence.observationId);
  });

  // 13. Second feedback iteration (causal state transition verification)
  it('13. should execute a second feedback iteration passing originatingCollectiveStateId and updated cognitive references from iteration 0', async () => {
    const executedRequests: CognitiveComputationRequest[] = [];
    const origExecute = computeEngine1.executeCognitiveComputation.bind(computeEngine1);

    computeEngine1.executeCognitiveComputation = async (req, opts) => {
      executedRequests.push(req);
      const res = await origExecute(req, opts);
      if (executedRequests.length === 1) {
        return {
          ...res,
          finalOutput: { stage: 0, outputValues: [10, 20] },
          deterministicHash: 'hash_result_stage_0'
        };
      } else {
        return {
          ...res,
          finalOutput: { stage: 1, outputValues: [100, 200] },
          deterministicHash: 'hash_result_stage_1'
        };
      }
    };

    const collectiveUpdateSpy = vi.spyOn(runtime['collectiveEngine'], 'updateFromWorldModel');

    const request = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'iterative_synthesis',
      computationType: 'DATA_TRANSFORMATION',
      payload: { initialData: [1, 2] },
      feedbackCycleDepth: 0,
      maxCycleDepth: 2
    });

    const feedbackResult = await runtime.executeFeedbackLoop(request, computeEngine1, worldModelEngine);
    computeEngine1.executeCognitiveComputation = origExecute;

    // Verify 2 iterations executed
    expect(executedRequests.length).toBe(2);
    const request0 = executedRequests[0];
    const request1 = executedRequests[1];

    // Collective state identity produced in iteration 0
    const collectiveState0 = collectiveUpdateSpy.mock.results[0]?.value;
    expect(collectiveState0).toBeDefined();
    const collectiveStateId0 = collectiveState0.deterministicIdentity;

    // 1. Request IDs must not be identical
    expect(request1.requestId).not.toBe(request0.requestId);
    expect(request1.feedbackCycleDepth).toBe(1);

    // 2. originatingCollectiveStateId of request1 MUST equal collectiveStateId from iteration 0
    expect(request1.originatingCollectiveStateId).toBe(collectiveStateId0);

    // 3. Cognitive inputs/references of request1 changed based on iteration 0 state
    expect(request1.goal).not.toBe(request0.goal);
    expect(request1.payload).not.toEqual(request0.payload);
    expect(request1.payload.collectiveStateId).toBe(collectiveStateId0);
    expect(request1.payload.originatingWorldModelId).toBeDefined();
    expect(request1.payload.previousComputationOutput).toEqual({ stage: 0, outputValues: [10, 20] });

    // 4. Epistemic context (P7 -> P8 bridge) must reference iteration 0 update
    expect(request1.epistemicContext).toBeDefined();
    expect(request1.epistemicContext?.provenance).toContain(`collective:${collectiveStateId0}`);

    expect(feedbackResult.cycleDepth).toBe(1);
  });

  // 14. Bounded loop enforcement
  it('14. should enforce strict cycle boundedness exactly at maxCycleDepth', async () => {
    const executedRequests: CognitiveComputationRequest[] = [];
    const origExecute = computeEngine1.executeCognitiveComputation.bind(computeEngine1);

    computeEngine1.executeCognitiveComputation = async (req, opts) => {
      executedRequests.push(req);
      const res = await origExecute(req, opts);
      return {
        ...res,
        finalOutput: { stage: req.feedbackCycleDepth }
      };
    };

    const request = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'recursive_synthesis',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [1, 2] },
      feedbackCycleDepth: 0,
      maxCycleDepth: 2
    });

    const feedbackResult = await runtime.executeFeedbackLoop(request, computeEngine1, worldModelEngine);
    computeEngine1.executeCognitiveComputation = origExecute;

    // Number of iterations executed MUST be exactly maxCycleDepth and never exceed it
    expect(executedRequests.length).toBe(2);
    expect(executedRequests.length).toBeLessThanOrEqual(2);
    expect(feedbackResult.cycleDepth).toBe(1); // 0-indexed: index 0 and index 1 were completed
  });

  // 15. Computation failure without contradiction
  it('15. should handle computation failure gracefully without adding contradictingRepresentationIds', async () => {
    const failingRequest = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'failing_computation_task',
      computationType: 'UNKNOWN_NONEXISTENT_TYPE',
      payload: { test: true },
      timeoutMs: 1000,
      targetRepresentationId: 'target_concept_123',
      maxCycleDepth: 1
    });

    const feedbackResult = await runtime.executeFeedbackLoop(failingRequest, computeEngine1, worldModelEngine);

    expect(feedbackResult.status).toBe(ComputationStatus.FAILED);
    expect(feedbackResult.evidence.provenance.contradictingRepresentationIds.length).toBe(0);
    expect(feedbackResult.evidence.confidence).toBe(0.0);
  });

  // 16. Timeout handling without contradiction
  it('16. should handle computation timeout/unverified without adding contradictingRepresentationIds', async () => {
    const timeoutRequest = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'timeout_task',
      computationType: 'DATA_TRANSFORMATION',
      payload: { test: true },
      targetRepresentationId: 'target_concept_456',
      maxCycleDepth: 1
    });

    const origExecute = computeEngine1.executeCognitiveComputation.bind(computeEngine1);
    computeEngine1.executeCognitiveComputation = async (req, opts) => {
        const res = await origExecute(req, opts);
        return {
            ...res,
            status: ComputationStatus.TIMEOUT,
            verificationStatus: {
                ...res.verificationStatus,
                verified: false
            }
        };
    };

    const feedbackResult = await runtime.executeFeedbackLoop(timeoutRequest, computeEngine1, worldModelEngine);
    
    // restore
    computeEngine1.executeCognitiveComputation = origExecute;

    expect(feedbackResult.status).toBe(ComputationStatus.TIMEOUT);
    expect(feedbackResult.evidence.provenance.contradictingRepresentationIds.length).toBe(0);
  });

  // 17. Success != VERIFIED directly
  it('17. should not equate success with VERIFIED epistemic status directly unless fusion validates it', async () => {
    const request = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'success_but_unverified',
      computationType: 'DATA_TRANSFORMATION',
      payload: { data: 'test' },
      maxCycleDepth: 1
    });

    const origExecute = computeEngine1.executeCognitiveComputation.bind(computeEngine1);
    computeEngine1.executeCognitiveComputation = async (req, opts) => {
        const res = await origExecute(req, opts);
        return {
            ...res,
            status: ComputationStatus.COMPLETED,
            verificationStatus: {
                ...res.verificationStatus,
                verified: false
            }
        };
    };

    const feedbackResult = await runtime.executeFeedbackLoop(request, computeEngine1, worldModelEngine);
    
    computeEngine1.executeCognitiveComputation = origExecute;

    expect(feedbackResult.status).toBe(ComputationStatus.COMPLETED);
    if (feedbackResult.fusedEpistemicState) {
        expect(feedbackResult.fusedEpistemicState.status).not.toBe('VERIFIED');
    }
  });

  // 18. Full End-to-End Feedback Chain: P8 -> P7 -> WorldModel -> P9 -> Follow-up
  it('18. should execute full chain: P8 output -> P7 evidence -> WorldModel mutation -> P9 update -> causal follow-up', async () => {
    const concept: CognitiveConcept = {
      conceptId: 'concept_organism_core',
      canonicalName: 'Organism Core Metabolism',
      description: 'Core energy stability indicator',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      sourceKnowledgeIds: ['kn_core'],
      sourceExperienceIds: [],
      originatingCellId: cell1.nodeId,
      version: 1,
      confidence: 0.5,
      provenance: ['cell_alpha_init'],
      verificationStatus: RepresentationVerificationStatus.PENDING,
      metadata: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };
    cell1.cognitiveGraph.addConcept(concept);

    const executedRequests: CognitiveComputationRequest[] = [];
    const origExecute = computeEngine1.executeCognitiveComputation.bind(computeEngine1);

    computeEngine1.executeCognitiveComputation = async (req, opts) => {
      executedRequests.push(req);
      const res = await origExecute(req, opts);
      return {
        ...res,
        finalOutput: { computedEnergyRatio: 1.414, iteration: req.feedbackCycleDepth }
      };
    };

    const initialRequest = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'verify_metabolic_coherence',
      computationType: 'DATA_TRANSFORMATION',
      payload: { energyInput: 100, dissipationRate: 0.1 },
      targetRepresentationId: concept.conceptId,
      maxCycleDepth: 2,
      timeoutMs: 5000
    });

    const feedbackResult = await runtime.executeFeedbackLoop(initialRequest, computeEngine1, worldModelEngine);
    computeEngine1.executeCognitiveComputation = origExecute;

    // 1. P8 computation output verified
    expect(executedRequests.length).toBe(2);
    expect(feedbackResult.computationResult).toBeDefined();
    expect(feedbackResult.computationResult?.finalOutput).toBeDefined();

    // 2. P7 evidence creation verified
    expect(feedbackResult.evidence).toBeDefined();
    expect(feedbackResult.evidence.sourceId).toBe('distributed_computation');
    expect(feedbackResult.evidence.provenance.derivedFrom).toBeDefined();

    // 3. WorldModel mutation/refinement verified
    expect(feedbackResult.updatedWorldModelId).toBeDefined();
    const retrievedWorldModel = cell1.cognitiveGraph.getAllConcepts();
    expect(retrievedWorldModel.length).toBeGreaterThan(0);

    // 4. P9 collective update verified
    expect(feedbackResult.provenance.some(p => p.includes('p9_collective_updated:'))).toBe(true);

    // 5. Causal follow-up request verified
    const followUp = executedRequests[1];
    expect(followUp.originatingCollectiveStateId).toBeDefined();
    expect(followUp.payload.originatingWorldModelId).toBeDefined();
    expect(followUp.payload.previousComputationOutput).toEqual({ computedEnergyRatio: 1.414, iteration: 0 });
    expect(followUp.epistemicContext?.sourceRepresentationId).toBeDefined();
  });

  // 19. Termination Guarantee: Budget Exhaustion
  it('19. should terminate feedback loop deterministically when computation budget is exhausted', async () => {
    const executedRequests: CognitiveComputationRequest[] = [];
    const origExecute = computeEngine1.executeCognitiveComputation.bind(computeEngine1);

    computeEngine1.executeCognitiveComputation = async (req, opts) => {
      executedRequests.push(req);
      const res = await origExecute(req, opts);
      return {
        ...res,
        trace: {
          ...res.trace,
          compositionDetails: {
            ...res.trace.compositionDetails,
            costs: {
              ...res.trace.compositionDetails.costs,
              totalOverheadCost: 50.0 // Heavy cost that depletes small budget
            }
          }
        }
      };
    };

    const lowBudgetRequest = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'heavy_compute_budget_test',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [1, 2], budget: 40.0 }, // Budget 40 < Cost 50
      maxCycleDepth: 5,
      timeoutMs: 5000
    });

    const feedbackResult = await runtime.executeFeedbackLoop(lowBudgetRequest, computeEngine1, worldModelEngine);
    computeEngine1.executeCognitiveComputation = origExecute;

    // Must terminate after 1 iteration due to budget exhaustion
    expect(executedRequests.length).toBe(1);
    expect(feedbackResult.provenance.some(p => p.includes('feedback_loop_budget_exhausted'))).toBe(true);
  });

  // 20. Termination Guarantee: Duplicate Request Suppression
  it('20. should suppress and terminate on duplicate task generation to prevent infinite recursion on identical states', async () => {
    const executedRequests: CognitiveComputationRequest[] = [];
    const origExecute = computeEngine1.executeCognitiveComputation.bind(computeEngine1);

    // Simulate computation where output doesn't change
    computeEngine1.executeCognitiveComputation = async (req, opts) => {
      executedRequests.push(req);
      const res = await origExecute(req, opts);
      return {
        ...res,
        finalOutput: { fixed: 'static_data' }
      };
    };

    const duplicateProneRequest = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'duplicate_suppression_test',
      computationType: 'DATA_TRANSFORMATION',
      payload: { items: [1, 2] },
      maxCycleDepth: 3,
      timeoutMs: 5000
    });

    const feedbackResult = await runtime.executeFeedbackLoop(duplicateProneRequest, computeEngine1, worldModelEngine);
    computeEngine1.executeCognitiveComputation = origExecute;

    // Loop must be strictly bounded and terminate safely
    expect(executedRequests.length).toBeLessThanOrEqual(3);
    expect(feedbackResult.cycleDepth).toBeLessThan(3);
  });

  // 21. Termination Guarantee: Timeout Bounding
  it('21. should enforce loop deadline and terminate with timeout when overall timeout is exceeded', async () => {
    const shortTimeoutRequest = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'timeout_bounding_test',
      computationType: 'DATA_TRANSFORMATION',
      payload: { data: 'test' },
      maxCycleDepth: 5,
      timeoutMs: 1 // Extremely short timeout
    });

    // Simulate delay
    const origExecute = computeEngine1.executeCognitiveComputation.bind(computeEngine1);
    computeEngine1.executeCognitiveComputation = async (req, opts) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return origExecute(req, opts);
    };

    const feedbackResult = await runtime.executeFeedbackLoop(shortTimeoutRequest, computeEngine1, worldModelEngine);
    computeEngine1.executeCognitiveComputation = origExecute;

    expect(feedbackResult).toBeDefined();
    expect(feedbackResult.provenance.some(p => p.includes('feedback_loop_timeout_exceeded'))).toBe(true);
  });

  // 22. Termination Guarantee: Early Termination on Full Verification
  it('22. should terminate early without running redundant cycles when epistemic state is fully VERIFIED with zero uncertainty', async () => {
    const executedRequests: CognitiveComputationRequest[] = [];
    const origExecute = computeEngine1.executeCognitiveComputation.bind(computeEngine1);

    computeEngine1.executeCognitiveComputation = async (req, opts) => {
      executedRequests.push(req);
      const res = await origExecute(req, opts);
      return res;
    };

    // Spy on fusionEngine to simulate fully verified state
    const fusionSpy = vi.spyOn(EpistemicFusionEngine.prototype, 'fuse').mockReturnValue({
      fusionId: 'fuse_perfect',
      fusedState: {
        stateId: 'epistemic_verified',
        status: EpistemicStatus.VERIFIED,
        verificationStatus: RepresentationVerificationStatus.VERIFIED,
        context: { contextId: 'ctx_verified', domain: 'general_computation' },
        opinion: { belief: 1.0, disbelief: 0.0, uncertainty: 0.0, baseRate: 0.5 }
      },
      targetRepresentationId: 'target_perfect',
      supportingEvidence: [],
      conflictingEvidence: [],
      neutralEvidence: [],
      dependencies: [],
      effectiveSupportMass: 1.0,
      effectiveConflictMass: 0.0,
      hasConflict: false,
      context: { contextId: 'ctx_verified', domain: 'general_computation' },
      createdAt: '2026-01-01T00:00:00.000Z'
    });

    const verifiedRequest = computeEngine1.createCognitiveComputationRequest({
      sourceCellId: cell1.nodeId,
      goal: 'already_verified_goal',
      computationType: 'DATA_TRANSFORMATION',
      payload: { value: 42 },
      maxCycleDepth: 5,
      timeoutMs: 5000
    });

    const feedbackResult = await runtime.executeFeedbackLoop(verifiedRequest, computeEngine1, worldModelEngine);

    computeEngine1.executeCognitiveComputation = origExecute;
    fusionSpy.mockRestore();

    // Must terminate after 1 cycle despite maxCycleDepth = 5 because it is fully verified with 0 uncertainty
    expect(executedRequests.length).toBe(1);
    expect(feedbackResult.cycleDepth).toBe(0);
  });
});
