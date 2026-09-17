import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { EpistemicAdapter } from '../src/redqueen/cognition/epistemic/adapter';
import { EpistemicFusionEngine } from '../src/redqueen/cognition/epistemic/fusion';
import { EvidenceDependencyGraph } from '../src/redqueen/cognition/evidence/graph';
import { CollectiveComputationEngine } from '../src/redqueen/cognition/computation/engine';
import { ComputationTask, ComputationStatus, EpistemicComputationContext } from '../src/redqueen/cognition/computation/types';
import { Context, EpistemicStatus } from '../src/redqueen/cognition/epistemic/types';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';

describe('P7 -> P8 -> P7 Epistemic Computation Bridge', () => {
  let cell: Cell;
  let graph: CognitiveGraph;
  let fusionEngine: EpistemicFusionEngine;
  let edg: EvidenceDependencyGraph;
  let computeEngine: CollectiveComputationEngine;

  const createMockCell = (id: string, caps: string[]): Cell => {
    return {
      nodeId: id,
      lineageId: `lin_${id}`,
      genome: {
        genomeId: `gen_${id}`,
        capabilities: caps,
        traits: {}
      } as any,
      cognitiveGraph: new CognitiveGraph(id, {} as any),
      memoryStore: {} as any,
      transport: {} as any,
      start: vi.fn(),
      stop: vi.fn(),
      lifecycle: {
        getState: vi.fn().mockReturnValue('ACTIVE')
      } as any,
      cognitiveState: {
        getSpecialization: vi.fn().mockReturnValue(null)
      } as any
    } as any;
  };

  beforeEach(() => {
    cell = createMockCell('test_cell', ['COGNITIVE_REASONING', 'SWARM_COORDINATION']);
    fusionEngine = new EpistemicFusionEngine();
    edg = cell.cognitiveGraph.getEDG();
    computeEngine = new CollectiveComputationEngine(cell);
  });

  it('should successfully thread epistemic context into computation and adapt result to evidence', async () => {
    // 1. Initial Knowledge in P7 (Epistemic State)
    const context: Context = { contextId: 'ctx_001', domain: 'distributed_physics' };
    
    // We observe something and form an initial EpistemicState
    const initialState = EpistemicAdapter.fromP5(0.7, RepresentationVerificationStatus.PENDING, context);
    
    // 2. Convert P7 EpistemicState -> P8 EpistemicComputationContext
    const epistemicContext: EpistemicComputationContext = EpistemicAdapter.toEpistemicComputationContext(initialState, 'rep_001');
    expect(epistemicContext.epistemicStatus).to.equal(EpistemicStatus.HYPOTHESIS);
    expect(epistemicContext.confidence).to.equal(0.7);

    // 3. Create P8 Computation Task bearing the Epistemic Context
    const payload = {
      items: [10, 20, 30],
      multiplier: 2
    };

    const task: ComputationTask = {
      ...computeEngine.createTask({
        goal: 'process_dataset_with_epistemic_awareness',
        computationType: 'DATA_TRANSFORMATION',
        payload,
        requiredCapabilities: ['COGNITIVE_REASONING'],
        timeoutMs: 5000
      }),
      epistemicContext
    };

    // 4. Execute P8 Computation
    const result = await computeEngine.executeTask(task);
    
    expect(result.status).to.equal(ComputationStatus.COMPLETED);
    
    // Check that we have valid deterministic computational facts
    expect(result.finalOutput).to.have.property('subtasksCompleted');
    const completedSubtasks = result.finalOutput.subtasksCompleted as number;
    expect(completedSubtasks).to.be.greaterThan(0);

    // 5. Convert P8 ComputationResult -> P7 EvidenceCandidate (Evidence)
    const newEvidence = EpistemicAdapter.fromComputationResult(result, context);

    // Verify explicit provenance mapping as required by architectural rules
    expect(newEvidence.sourceId).to.equal('distributed_computation');
    expect(newEvidence.provenance.sourceId).to.equal('distributed_computation');
    expect(newEvidence.observationId).to.equal(task.taskId);
    expect(newEvidence.provenance.derivedFrom).to.deep.equal(result.provenance);

    // 6. Fuse the newly generated evidence back into P7 Epistemic State
    const fusionResult = fusionEngine.fuse([newEvidence], context, edg, { previousState: initialState });

    // The fusion should produce a new state incorporating the computation evidence
    expect(fusionResult.fusedState.status).to.be.oneOf([EpistemicStatus.BELIEVED, EpistemicStatus.VERIFIED, EpistemicStatus.HYPOTHESIS]);
    expect(fusionResult.supportingEvidence).to.have.lengthOf(1);
    expect(fusionResult.supportingEvidence[0].evidenceId).to.equal(newEvidence.evidenceId);
  });
});
