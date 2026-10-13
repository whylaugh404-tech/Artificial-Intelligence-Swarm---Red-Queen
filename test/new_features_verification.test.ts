import { describe, it, expect, beforeEach } from 'vitest';
import { LatentEnergyTokenProjector } from '../src/redqueen/cognition/generative_synthesizer';
import { ContradictionFeedbackLoop } from '../src/redqueen/cognition/reasoning/contradiction_loop';
import { PerceptualStreamIngestor } from '../src/redqueen/cognition/perceptual_stream';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { CellMetabolismController } from '../src/redqueen/metabolism/cellular_vitality';
import { LinearSSMCell } from '../src/redqueen/learning/linear_ssm';
import { CompactHdcIndex } from '../src/redqueen/cognition/knowledge_distillation';
import { NeuroSymbolicEngine } from '../src/redqueen/cognition/neuro_symbolic_engine';

describe('Verification of Newly Implemented Autonomous Features', () => {
  let graph: CognitiveGraph;
  let vitality: CellMetabolismController;
  let ssmCell: LinearSSMCell;
  let hdcIndex: CompactHdcIndex;

  beforeEach(() => {
    graph = new CognitiveGraph();
    vitality = new CellMetabolismController();
    ssmCell = new LinearSSMCell({ inputDim: 64, stateDim: 64, outputDim: 64 });
    hdcIndex = new CompactHdcIndex();
  });

  it('1. Zero-Template Generative Decoder: Micro-Vocabulary Energy Projector', () => {
    const projector = new LatentEnergyTokenProjector();
    const stateVector = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      stateVector[i] = Math.sin(i * 0.5);
    }

    const trajectory = projector.decodeSequence(stateVector, {
      maxTokens: 10,
      temperature: 0.1,
      minEnergyThreshold: -5.0
    });

    expect(trajectory).toBeDefined();
    expect(trajectory.tokens.length).toBeGreaterThan(0);
    expect(trajectory.text).toBeTypeOf('string');
    expect(trajectory.text.length).toBeGreaterThan(0);
    expect(trajectory.energyTrajectory.length).toBeGreaterThan(0);
  });

  it('2. Contradiction Feedback Loop: Autonomous Contradiction Detection, Synaptic Weight Penalization & ATP Drainage', () => {
    const contradictionLoop = new ContradictionFeedbackLoop(graph, vitality);

    // Seed a concept in graph
    graph.addConcept({
      conceptId: 'concept_hyp_1',
      canonicalName: 'Matahari Mengelilingi Bumi',
      description: 'Hipotesis awal pengujian kontradiksi',
      category: 'GENERAL_KNOWLEDGE',
      confidence: 0.9,
      originatingCellId: 'cell_test_01',
      source: 'UNVERIFIED_HYPOTHESIS'
    });

    // Record reasoning episode
    contradictionLoop.recordEpisode({
      query: 'Apakah matahari mengelilingi bumi?',
      response: 'Matahari mengelilingi bumi secara periodik.',
      activatedConceptIds: ['concept_hyp_1'],
      synapticPathwayIds: ['concept_hyp_1'],
      atpAllocated: 50
    });

    // User provides negative feedback
    const detection = contradictionLoop.detectContradiction('Bukan, jawabanmu salah! Bumi yang mengelilingi matahari.');
    expect(detection.isContradiction).toBe(true);

    const initialAtp = vitality.getState().atp;
    const initialConfidence = graph.getConcept('concept_hyp_1')?.confidence ?? 0;

    // Apply correction
    const audit = contradictionLoop.applyContradictionCorrection('Bukan, jawabanmu salah! Bumi yang mengelilingi matahari.');

    expect(audit).not.toBeNull();
    expect(audit?.penalizedConceptIds).toContain('concept_hyp_1');
    expect(audit?.atpDrained).toBeGreaterThan(0);

    const updatedNode = graph.getConcept('concept_hyp_1');
    const newAtp = vitality.getState().atp;

    expect(updatedNode?.confidence).toBeLessThan(initialConfidence);
    expect(newAtp).toBeLessThan(initialAtp);

    const history = contradictionLoop.getAuditHistory();
    expect(history.length).toBeGreaterThan(0);
  });

  it('3. Perceptual Stream Ingestion: Continuous Ingestion Without Manual Triplets', async () => {
    const ingestor = new PerceptualStreamIngestor({ hdcIndex, cognitiveGraph: graph, ssmCell });

    const rawStream = 'Photons carry electromagnetic energy across space. Sunlight reaches Earth in eight minutes.';
    
    const result = await ingestor.ingestRawStream(rawStream, {
      streamId: 'stream_test_01',
      domain: 'PHYSICS'
    });

    expect(result.propositionsExtracted.length).toBeGreaterThan(0);
    expect(result.conceptsCreatedCount).toBeGreaterThan(0);

    const telemetry = ingestor.getTelemetry();
    expect(telemetry.totalBytesProcessed).toBeGreaterThan(0);
    expect(telemetry.totalPropositionsExtracted).toBeGreaterThan(0);
  });

  it('4. End-to-End NeuroSymbolicEngine Integration', async () => {
    const engine = new NeuroSymbolicEngine({
      graph,
      vitality
    });

    // Test processChat with negative feedback trigger
    const initialResponse = await engine.processChat('Apakah air mendidih pada 100 derajat Celsius?');
    expect(initialResponse.statement).toBeTypeOf('string');

    // Give contradiction input
    const contradictionResponse = await engine.processChat('Bukan, jawabanmu salah!');
    expect(contradictionResponse.statement).toContain('Kontradiksi');

    // Test perceptual stream ingestion via engine
    const streamResult = await engine.ingestPerceptualStream('Suhu air meningkat saat dipanaskan di atas kompor.');
    expect(streamResult.propositionsExtracted.length).toBeGreaterThan(0);
  });
});
