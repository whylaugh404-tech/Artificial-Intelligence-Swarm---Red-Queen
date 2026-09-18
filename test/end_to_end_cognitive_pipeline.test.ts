import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { MemoryCategory } from '../src/redqueen/memory/store';
import { EpistemicStatus } from '../src/redqueen/cognition/epistemic/types';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';
import { InformationCategory } from '../src/redqueen/metabolism/types';
import { Context } from '../src/redqueen/cognition/epistemic/types';
import { CellContribution } from '../src/redqueen/cognition/collective/engine';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

describe('Red Queen: End-to-End Cognitive Pipeline (Dataset -> Collective State)', () => {
  let cellA: Cell;
  let cellB: Cell;

  const storagePathA = join(process.cwd(), '.tmp_test_e2e_cell_a.json');
  const storagePathB = join(process.cwd(), '.tmp_test_e2e_cell_b.json');

  const cleanTempFiles = () => {
    if (existsSync(storagePathA)) {
      try { unlinkSync(storagePathA); } catch {}
    }
    if (existsSync(storagePathB)) {
      try { unlinkSync(storagePathB); } catch {}
    }
  };

  beforeEach(async () => {
    cleanTempFiles();

    // Instantiate two independent production Cells
    cellA = new Cell(storagePathA, 'dummy-key', undefined, undefined, undefined, {
      storageSecret: 'e2e_secret_cell_a'
    });
    cellB = new Cell(storagePathB, 'dummy-key', undefined, undefined, undefined, {
      storageSecret: 'e2e_secret_cell_b'
    });

    // Initialize underlying stores
    await cellA.memory.initialize();
    await cellB.memory.initialize();

    // Prevent external network calls for legacy cycle while keeping native pipeline untouched
    Object.defineProperty(cellA, 'cognition', { value: { executeCycle: vi.fn().mockResolvedValue(undefined) }, writable: true });
    Object.defineProperty(cellB, 'cognition', { value: { executeCycle: vi.fn().mockResolvedValue(undefined) }, writable: true });
  });

  afterEach(async () => {
    await cellA.stop();
    await cellB.stop();
    cleanTempFiles();
  });

  it('executes full pipeline from dataset ingestion to collective state and emergence', async () => {
    // =========================================================================
    // STAGE 1: DATASET DEFINITION & INGESTION INTO CELLS
    // =========================================================================
    const datasetAlpha = [
      {
        sourceId: 'sensor_telemetry_alpha',
        parameter: 'core_temperature',
        value: 312.4,
        unit: 'kelvin',
        status: 'NOMINAL'
      },
      {
        sourceId: 'sensor_telemetry_alpha',
        parameter: 'coolant_pressure',
        value: 4.85,
        unit: 'bar',
        status: 'NOMINAL'
      }
    ];

    const datasetBeta = [
      {
        sourceId: 'sensor_telemetry_beta',
        parameter: 'grid_frequency',
        value: 50.02,
        unit: 'hertz',
        status: 'STABLE'
      }
    ];

    // Cell A ingests datasetAlpha; Cell B ingests datasetBeta
    await cellA.ingestDataset(datasetAlpha);
    await cellB.ingestDataset(datasetBeta);

    // Verify canonical path only: legacy executeCycle was not called
    expect(cellA.cognition.executeCycle).not.toHaveBeenCalled();
    expect(cellB.cognition.executeCycle).not.toHaveBeenCalled();

    // Assert Stage 1: Observations recorded in episodic memory
    const memoriesA = await cellA.memory.search({ category: MemoryCategory.EPISODIC });
    expect(memoriesA.length).toBeGreaterThanOrEqual(2);
    const paramsA = memoriesA.map(m => (m.content as any).parameter);
    expect(paramsA).toContain('core_temperature');
    expect(paramsA).toContain('coolant_pressure');

    const memoriesB = await cellB.memory.search({ category: MemoryCategory.EPISODIC });
    expect(memoriesB.length).toBeGreaterThanOrEqual(1);
    expect((memoriesB[0].content as any).parameter).toBe('grid_frequency');

    // =========================================================================
    // STAGE 2: COGNITIVE REPRESENTATION & EVIDENCE GENERATION
    // =========================================================================
    const evidencesA = cellA.cognitiveGraph.getAllEvidences();
    expect(evidencesA.length).toBe(2);

    const tempEvidence = evidencesA.find(e => e.provenance.sourceId === 'sensor_telemetry_alpha');
    expect(tempEvidence).toBeDefined();
    expect(tempEvidence?.sourceId).toBe(cellA.nodeId);
    expect(tempEvidence?.confidence).toBeGreaterThan(0);
    expect(tempEvidence?.context?.domain).toBe('dataset_ingestion');

    const evidencesB = cellB.cognitiveGraph.getAllEvidences();
    expect(evidencesB.length).toBe(1);
    expect(evidencesB[0].sourceId).toBe(cellB.nodeId);
    expect(evidencesB[0].provenance.sourceId).toBe('sensor_telemetry_beta');

    // =========================================================================
    // STAGE 3 & 4: EPISTEMIC FUSION & NATIVE REASONING ENGINE EXECUTION
    // =========================================================================
    const chainsA = cellA.reasoning.getAllChains();
    expect(chainsA.length).toBe(2);

    const firstChain = chainsA[0];
    expect(firstChain.reasoningId).toMatch(/^rsn_[a-f0-9]{16}$/);
    expect(firstChain.originatingCellId).toBe(cellA.nodeId);

    // 1. Premise verification
    expect(firstChain.premises.length).toBeGreaterThanOrEqual(1);
    expect(firstChain.premises[0].evidenceIds).toContain(evidencesA[0].evidenceId);
    expect(firstChain.premises[0].statement).toBe('Dataset record observed.');

    // 2. Epistemic Verification object derived from fusion
    expect(firstChain.verification).toBeDefined();
    expect(firstChain.verification.supportingEvidenceIds).toContain(evidencesA[0].evidenceId);
    expect(firstChain.verification.hasContradiction).toBe(false);

    // 3. Conclusion and Epistemic Uncertainty (Subjective Opinion)
    const conclusion = firstChain.conclusion;
    expect(conclusion).toBeDefined();
    expect(conclusion.statement).toContain('Dataset record observed.');
    expect(conclusion.evidence).toContain(evidencesA[0].evidenceId);
    expect(conclusion.provenance).toContain(cellA.nodeId);

    // Fused Subjective Opinion: belief + disbelief + uncertainty = 1.0
    const uncertainty = conclusion.uncertainty;
    expect(uncertainty).toBeDefined();
    expect(typeof uncertainty.belief).toBe('number');
    expect(typeof uncertainty.disbelief).toBe('number');
    expect(typeof uncertainty.uncertainty).toBe('number');
    expect(uncertainty.belief + uncertainty.disbelief + uncertainty.uncertainty).toBeCloseTo(1.0, 4);

    // Immutability: ReasoningChain is deeply frozen
    expect(Object.isFrozen(firstChain)).toBe(true);
    expect(() => { (firstChain as any).goal = 'tampered'; }).toThrow();

    // =========================================================================
    // STAGE 5: WORLD MODEL INGESTION & TRACEABILITY
    // =========================================================================
    expect(firstChain.worldModelId).toBeDefined();
    const wmTrace = firstChain.trace!(firstChain.worldModelId!);
    expect(wmTrace.elementType).toBe('WORLD_MODEL');
    expect(wmTrace.worldModel).toBeDefined();

    const worldModel = wmTrace.worldModel!;
    expect(worldModel.originatingCellId).toBe(cellA.nodeId);
    expect(worldModel.context.domain).toBe('dataset_ingestion');
    expect(worldModel.understandingIds.length).toBeGreaterThanOrEqual(1);
    expect(worldModel.evidenceIds).toContain(evidencesA[0].evidenceId);
    expect(worldModel.uncertainty).toBeDefined();
    expect(typeof worldModel.uncertainty.belief).toBe('number');
    expect(typeof worldModel.uncertainty.uncertainty).toBe('number');

    // =========================================================================
    // STAGE 6: MULTI-CELL COLLECTIVE COGNITION SYNTHESIS
    // =========================================================================
    // Cell A initiates collective peer synthesis with Cell B
    // Before synthesis: Cell A does not have Cell B's evidence
    expect(cellA.cognitiveGraph.getEvidence(evidencesB[0].evidenceId)).toBeUndefined();

    const synthesisResult = await cellA.collectiveCognition.synthesizeWithPeers([cellB]);

    // Assert: Cell B contributed its dataset evidence to the collective
    expect(synthesisResult.syncedEvidences).toBe(1);
    expect(synthesisResult.contributions[cellB.nodeId]).toBeDefined();
    expect(synthesisResult.contributions[cellB.nodeId].evidences).toContain(evidencesB[0].evidenceId);
    expect(synthesisResult.provenanceCells).toContain(cellB.nodeId);

    // Assert: Cell A's cognitive graph acquired Cell B's evidence through collective synthesis
    const acquiredEvidenceInA = cellA.cognitiveGraph.getEvidence(evidencesB[0].evidenceId);
    expect(acquiredEvidenceInA).toBeDefined();
    expect(acquiredEvidenceInA?.evidenceId).toBe(evidencesB[0].evidenceId);
    expect(acquiredEvidenceInA?.provenance.sourceId).toBe('sensor_telemetry_beta');

    // =========================================================================
    // STAGE 7: COLLECTIVE STATE & NONLINEAR / LINEAR MATHEMATICAL COMPOSITION
    // =========================================================================
    const collectiveState = synthesisResult.collectiveState;
    expect(collectiveState).toBeDefined();
    expect(collectiveState.collectiveId).toMatch(/^coll_[a-f0-9]{16}$/);

    // Both Cell A and Cell B are verified participants
    expect(collectiveState.sourceCellIds).toEqual([cellA.nodeId, cellB.nodeId].sort());

    // Composition weights are normalized and sum to 1.0
    const weightA = collectiveState.weights[cellA.nodeId];
    const weightB = collectiveState.weights[cellB.nodeId];
    expect(weightA).toBeGreaterThan(0);
    expect(weightB).toBeGreaterThan(0);
    expect(weightA + weightB).toBeCloseTo(1.0, 5);

    // Result vector represents collective cognitive state
    expect(collectiveState.resultVector).toBeDefined();
    expect(typeof collectiveState.resultVector.cognition).toBe('number');
    expect(collectiveState.resultVector.cognition).toBeGreaterThanOrEqual(0);
    expect(collectiveState.resultVector.cognition).toBeLessThanOrEqual(1);

    // Deterministic identity generated
    expect(collectiveState.deterministicIdentity).toMatch(/^[a-f0-9]{64}$/);

    // =========================================================================
    // STAGE 8: EMERGENT STATE GENERATION FROM MULTI-CELL CONTRIBUTIONS
    // =========================================================================
    // Create concept representations based on dataset observations in each cell
    const conceptA = await cellA.cognitiveGraph.insertConcept({
      conceptId: 'concept_telemetry_cooling',
      canonicalName: 'ThermalRegulation',
      description: 'Cooling parameters verified nominal from sensor alpha',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      sourceKnowledgeIds: ['k_alpha'],
      sourceExperienceIds: [],
      evidenceIds: [evidencesA[0].evidenceId],
      confidence: 0.95,
      provenance: [cellA.nodeId, 'sensor_telemetry_alpha'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cellA.nodeId,
      metadata: {}
    });

    const conceptB = await cellB.cognitiveGraph.insertConcept({
      conceptId: 'concept_grid_stability',
      canonicalName: 'ElectricalGridStability',
      description: 'Grid frequency verified stable from sensor beta',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      sourceKnowledgeIds: ['k_beta'],
      sourceExperienceIds: [],
      evidenceIds: [evidencesB[0].evidenceId],
      confidence: 0.92,
      provenance: [cellB.nodeId, 'sensor_telemetry_beta'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      originatingCellId: cellB.nodeId,
      metadata: {}
    });

    const collectiveContext: Context = {
      contextId: 'ctx_plant_telemetry',
      domain: 'PLANT_OPERATIONS'
    };

    const multiCellContributions: CellContribution[] = [
      {
        cellId: cellA.nodeId,
        contributionType: 'CONCEPT',
        content: conceptA,
        confidence: 0.95
      },
      {
        cellId: cellB.nodeId,
        contributionType: 'CONCEPT',
        content: conceptB,
        confidence: 0.92
      },
      {
        cellId: cellA.nodeId,
        contributionType: 'EVIDENCE',
        content: { evidenceId: evidencesA[0].evidenceId, supports: 'concept_telemetry_cooling' },
        confidence: 1.0
      },
      {
        cellId: cellB.nodeId,
        contributionType: 'EVIDENCE',
        content: { evidenceId: evidencesB[0].evidenceId, supports: 'concept_grid_stability' },
        confidence: 1.0
      }
    ];

    const understandingInput = cellA.understanding.compose({
      context: collectiveContext,
      originatingCellId: cellA.nodeId,
      concepts: [conceptA],
      evidences: [evidencesA[0]],
      summary: 'Local plant cooling state'
    });

    // Execute collective representation composition across cells A and B
    const collectiveRep = cellA.collectiveCognition.compose(
      understandingInput,
      multiCellContributions,
      collectiveContext,
      [cellA, cellB]
    );

    // Emergence assertions:
    expect(collectiveRep.emergentStructures.length).toBeGreaterThan(0);
    const emergentStructure = collectiveRep.emergentStructures[0];
    expect(emergentStructure.transformation).toBe('CONCEPTUAL_SYNTHESIS');
    expect(emergentStructure.sourceCells).toEqual([cellA.nodeId, cellB.nodeId].sort());

    // Emergence metrics reflect evidence grounding from dataset
    expect(collectiveRep.emergenceMetrics).toBeDefined();
    expect(collectiveRep.emergenceMetrics.gates.hasEvidence).toBe(true);
    expect(typeof collectiveRep.emergenceMetrics.synergy).toBe('number');
    expect(typeof collectiveRep.emergenceMetrics.coherence).toBe('number');
    expect(typeof collectiveRep.emergenceMetrics.stability).toBe('number');
    expect(['HYPOTHESIS', 'EVIDENCED', 'VERIFIED']).toContain(collectiveRep.emergenceMetrics.status);

    // Provenance consistency:
    expect(collectiveRep.provenance.some(p => p.includes('emergent_structures_generated'))).toBe(true);
    expect(collectiveRep.sourceCellIds).toEqual([cellA.nodeId, cellB.nodeId].sort());
  });

  it('guarantees deterministic identity for identical dataset ingestion and collective state composition', async () => {
    // Deterministic dataset
    const fixedRecord = {
      sourceId: 'deterministic_stream_x',
      field: 'entropy_ratio',
      value: 0.42
    };

    // First run with Cell A
    await cellA.ingestDataset([fixedRecord]);
    expect(cellA.cognition.executeCycle).not.toHaveBeenCalled();
    const evidenceA = cellA.cognitiveGraph.getAllEvidences()[0];
    const chainA = cellA.reasoning.getAllChains()[0];

    // Second Cell B ingesting identical content with its own identity
    await cellB.ingestDataset([fixedRecord]);
    expect(cellB.cognition.executeCycle).not.toHaveBeenCalled();
    const evidenceB = cellB.cognitiveGraph.getAllEvidences()[0];
    const chainB = cellB.reasoning.getAllChains()[0];

    // Both chains generated identical premise statements and conclusion statements
    expect(chainA.conclusion.statement).toBe(chainB.conclusion.statement);
    expect(chainA.premises[0].statement).toBe(chainB.premises[0].statement);
    expect(chainA.verification.epistemicStatus).toBe(chainB.verification.epistemicStatus);

    // Synthesizing peers produces deterministic composition weights and result structure
    const synth1 = await cellA.collectiveCognition.synthesizeWithPeers([cellB]);
    const synth2 = await cellA.collectiveCognition.synthesizeWithPeers([cellB]);

    expect(synth1.collectiveId).toBe(synth2.collectiveId);
    expect(synth1.collectiveState.deterministicIdentity).toBe(synth2.collectiveState.deterministicIdentity);
  });
});
