import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GenerativeLanguageSynthesizer } from '../src/redqueen/cognition/generative_synthesizer';
import { WikipediaIngestionPipeline } from '../src/redqueen/cognition/wiki_pipeline';
import { CompactHdcIndex } from '../src/redqueen/cognition/knowledge_distillation';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { JsonFileMemoryStore } from '../src/redqueen/memory/store';
import { InformationCategory } from '../src/redqueen/metabolism/types';
import { NeuroSymbolicEngine } from '../src/redqueen/cognition/neuro_symbolic_engine';
import * as fs from 'fs';
import * as path from 'path';

describe('Empirical Verification: Fix 1, Fix 2, Fix 3 (Eliminasi Jalan Pintas)', () => {
  const tmpDir = path.join(process.cwd(), '.tmp_test_fix_shortcuts');

  beforeEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await new Promise(r => setTimeout(r, 60));
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Safe
      }
    }
  });

  it('Fix 1: Zero-Template Generative Synthesis operates without canned developer scripts', () => {
    const synthesizer = new GenerativeLanguageSynthesizer();

    // 1. Identity & Telemetry query
    const statusRes = synthesizer.synthesize({
      prompt: 'siapa kamu dan bagaimana statusmu?',
      systemStatus: {
        associativeCount: 42,
        lifelongCyclesRun: 5,
        atpPool: 98.5,
        vitalityState: 'OPTIMAL',
        epistemicDiscoveriesCount: 2
      },
      ssmHiddenState: new Float32Array([0.1, 0.4, 0.2, 0.8])
    });

    // Zero boilerplate marketing script
    expect(statusRes.text).not.toContain('Halo bro! Gua adalah');
    expect(statusRes.text).not.toContain('Ada yang mau kita telusuri');
    expect(statusRes.text).toContain('Red Queen');
    expect(statusRes.text).toContain('98.5');
    expect(statusRes.text).toContain('OPTIMAL');

    // 2. Exact Arithmetic ALU
    const mathRes = synthesizer.synthesize({
      prompt: '15 * 12'
    });
    expect(mathRes.text).toBe('15 * 12 = 180');
    expect(mathRes.intent).toBe('MATH_CALCULATION');

    // 3. Epistemic boundary without canned defense
    const ungroundedRes = synthesizer.synthesize({
      prompt: 'siapa raja atlantis saat ini?'
    });
    expect(ungroundedRes.text).toContain('[Status Epistemik: Belum Terpetakan]');
    expect(ungroundedRes.text).not.toContain('Gua gak bakal mengarang');
    expect(ungroundedRes.intent).toBe('EPISTEMIC_UNKNOWN');
  });

  it('Fix 2: Dynamic Incremental Ingestion operates without static JSON dependency', () => {
    const emptyStorage = path.join(tmpDir, 'empty_knowledge');
    fs.mkdirSync(emptyStorage, { recursive: true });

    // Initialize with zero pre-existing JSON files
    const slab = new CompactHdcIndex(1000, 1024);
    const pipeline = new WikipediaIngestionPipeline(slab, emptyStorage);

    expect(pipeline.getStatus().factsCollected).toBe(0);

    // Ingest dynamic observation #1
    const obs1 = pipeline.ingestObservation({
      subject: 'Rust Language',
      predicate: 'provides',
      object: 'memory safety without garbage collection',
      domain: 'PROGRAMMING',
      confidence: 0.98
    });
    expect(obs1.id).toBe(1);
    expect(slab.size).toBe(1);

    // Ingest dynamic observation #2 from natural text
    const textTriplets = pipeline.ingestFromText(
      'Superconductivity is a set of physical properties observed in certain materials where electrical resistance vanishes.',
      'PHYSICS'
    );
    expect(textTriplets.length).toBeGreaterThan(0);
    expect(slab.size).toBeGreaterThan(1);

    // Search matches dynamically ingested observation
    const searchRes = pipeline.searchFacts('Rust Language');
    expect(searchRes.length).toBeGreaterThan(0);
    expect(searchRes[0].object).toContain('memory safety');
  });

  it('Fix 3: SSM Hidden State drives Spreading Activation in Cognitive Graph', async () => {
    const memStore = new JsonFileMemoryStore(path.join(tmpDir, 'mem_store.json'));
    await memStore.initialize();
    const graph = new CognitiveGraph('cell_ssm_test', memStore);

    // Seed 3 interrelated concepts
    await graph.insertConcept({
      conceptId: 'con_optics',
      canonicalName: 'Optics and Photons',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      description: 'Study of light and electromagnetic radiation behavior',
      confidence: 0.95,
      sourceKnowledgeIds: ['kn_optics_1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell_ssm_test',
      verificationStatus: 'SUPPORTED' as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      provenance: ['cell_seed'],
      metadata: {}
    });

    await graph.insertConcept({
      conceptId: 'con_laser',
      canonicalName: 'Laser Amplification',
      category: InformationCategory.HARDWARE,
      description: 'Light amplification by stimulated emission of radiation',
      confidence: 0.93,
      sourceKnowledgeIds: ['kn_laser_1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell_ssm_test',
      verificationStatus: 'SUPPORTED' as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      provenance: ['cell_seed'],
      metadata: {}
    });

    await graph.insertRelation({
      relationId: 'rel_optics_laser',
      subjectConceptId: 'con_optics',
      objectConceptId: 'con_laser',
      predicate: 'RELATED_TO' as any,
      confidence: 0.9,
      originatingCellId: 'cell_ssm_test',
      verificationStatus: 'SUPPORTED' as any,
      createdAt: new Date().toISOString(),
      provenance: ['cell_seed'],
      metadata: {}
    });

    // Provide a state vector simulating SSM temporal excitation
    const ssmState = new Float32Array(32);
    for (let i = 0; i < 32; i++) {
      ssmState[i] = Math.sin(i * 0.5) * 0.8;
    }

    // Trigger spreading activation directly from SSM continuous state vector
    const activatedNodes = graph.spreadActivationFromStateVector(ssmState, {
      activationThreshold: 0.01,
      decay: 0.75,
      maxHops: 2
    });

    expect(activatedNodes.length).toBeGreaterThan(0);
    expect(activatedNodes[0].activationEnergy).toBeGreaterThan(0);

    // End-to-end integration via NeuroSymbolicEngine
    const engine = new NeuroSymbolicEngine({
      cognitiveGraph: graph
    });

    const response = await engine.processChat('Bagaimana prinsip Optics and Photons?');
    expect(response.statement).toBeDefined();
    expect(response.reasoningSteps.some(step => step.includes('SSM-Coupled Graph Activation'))).toBe(true);
  });
});
