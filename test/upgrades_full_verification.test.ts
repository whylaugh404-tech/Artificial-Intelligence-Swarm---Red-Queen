import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GenerativeLanguageSynthesizer, LatentEnergyTokenProjector } from '../src/redqueen/cognition/generative_synthesizer';
import { WikipediaIngestionPipeline } from '../src/redqueen/cognition/wiki_pipeline';
import { CompactHdcIndex } from '../src/redqueen/cognition/knowledge_distillation';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { JsonFileMemoryStore } from '../src/redqueen/memory/store';
import { InformationCategory, CellVitalityState } from '../src/redqueen/metabolism/types';
import { CrossDomainAnalogyEngine } from '../src/redqueen/cognition/lifelong_learning/cross_domain_analogy';
import { CellMetabolismController } from '../src/redqueen/metabolism/cellular_vitality';
import { Cell } from '../src/redqueen/core/cell';

describe('Red Queen Advanced Cognitive Upgrades & Fixes Verification', () => {
  const tmpDir = path.join(process.cwd(), '.tmp_test_upgrades_full');

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

  it('Upgrade 1: Latent Energy Token Projector generates continuous energy-minimized token paths', () => {
    const projector = new LatentEnergyTokenProjector(64);
    const stateVec = new Float32Array(64).fill(0.25);

    const emb1 = projector.getEmbedding('quantum');
    const emb2 = projector.getEmbedding('quantum');
    const emb3 = projector.getEmbedding('gravity');

    expect(emb1.length).toBe(64);
    expect(emb1[0]).toBe(emb2[0]); // Deterministic projection
    expect(emb1[0]).not.toBe(emb3[0]); // Orthogonal projection

    const energy = projector.computeEnergy(stateVec, 'entanglement');
    expect(typeof energy).toBe('number');

    const projectedSentence = projector.projectPropositionalPath(
      'Mitochondria',
      'generates',
      'cellular ATP chemical energy',
      stateVec
    );
    expect(projectedSentence).toContain('Mitochondria');
    expect(projectedSentence).toContain('cellular ATP chemical energy');

    const synth = new GenerativeLanguageSynthesizer();
    expect(synth.energyProjector).toBeDefined();
  });

  it('Upgrade 2: Dynamic Incremental Ingestion updates both HDC Slab and CognitiveGraph in real time', async () => {
    const memStore = new JsonFileMemoryStore(path.join(tmpDir, 'mem_ingest.json'));
    await memStore.initialize();
    const graph = new CognitiveGraph('cell_ingest_test', memStore);

    const slab = new CompactHdcIndex(1000, 1024);
    const pipeline = new WikipediaIngestionPipeline(slab, path.join(tmpDir, 'wiki_data'), graph);

    expect(pipeline.getStatus().factsCollected).toBe(0);

    const obs = pipeline.ingestObservation({
      subject: 'Epigenetic Regulation',
      predicate: 'modulates',
      object: 'gene expression without altering nucleotide sequence',
      domain: 'GENETICS',
      confidence: 0.96
    });

    expect(obs.id).toBe(1);
    expect(slab.size).toBe(1);

    // Wait a tick for async concept insert
    await new Promise(r => setTimeout(r, 60));

    const allConcepts = graph.getAllConcepts();
    expect(allConcepts.length).toBeGreaterThanOrEqual(1);
    const matching = allConcepts.find(c => c.canonicalName === 'Epigenetic Regulation');
    expect(matching).toBeDefined();
    expect(matching?.description).toContain('gene expression');
  });

  it('Upgrade 3: Cross-Domain Analogy automatically crystallizes into CognitiveGraph nodes', async () => {
    const memStore = new JsonFileMemoryStore(path.join(tmpDir, 'mem_analogy.json'));
    await memStore.initialize();
    const graph = new CognitiveGraph('cell_analogy_test', memStore);

    const analogyEngine = new CrossDomainAnalogyEngine(graph);
    const result = analogyEngine.synthesizeAnalogy('CELLULAR_IMMUNOLOGY', 'CYBERSECURITY_ZERO_TRUST');

    expect(result.isomorphismScore).toBeGreaterThanOrEqual(0.70);
    expect(result.roleMappings.length).toBeGreaterThan(0);

    // Explicit concept crystallization
    const conceptId = await analogyEngine.crystallizeConcept(result);
    expect(conceptId).toContain('con_cryst_');

    const crystallizedNode = graph.getConcept(conceptId);
    expect(crystallizedNode).toBeDefined();
    expect(crystallizedNode?.canonicalName).toBe('Isomorphism_CELLULAR_IMMUNOLOGY_CYBERSECURITY_ZERO_TRUST');
    expect(crystallizedNode?.category).toBe(InformationCategory.GENERAL_TECHNOLOGY);
    expect(crystallizedNode?.confidence).toBeGreaterThanOrEqual(0.70);
  });

  it('Upgrade 4: Synaptic Energy Degradation prunes atrophied/contradicted concepts to conserve ATP', async () => {
    const memStore = new JsonFileMemoryStore(path.join(tmpDir, 'mem_synapse.json'));
    await memStore.initialize();
    const graph = new CognitiveGraph('cell_synapse_test', memStore);

    // Seed 1 high-confidence concept and 2 low-confidence/stale concepts
    await graph.insertConcept({
      conceptId: 'con_strong',
      canonicalName: 'Thermodynamic Conservation',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      description: 'Energy cannot be created or destroyed',
      confidence: 0.98,
      sourceKnowledgeIds: ['kn_1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell_synapse_test',
      verificationStatus: 'SUPPORTED' as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      provenance: ['physics'],
      metadata: {}
    });

    await graph.insertConcept({
      conceptId: 'con_weak_1',
      canonicalName: 'Phlogiston Fluid Theory',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      description: 'Disproven combustion element hypothesis',
      confidence: 0.15,
      sourceKnowledgeIds: ['kn_2'],
      sourceExperienceIds: [],
      originatingCellId: 'cell_synapse_test',
      verificationStatus: 'CONTRADICTED' as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      provenance: ['ancient_alchemy'],
      metadata: {}
    });

    await graph.insertConcept({
      conceptId: 'con_weak_2',
      canonicalName: 'Luminiferous Aether',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      description: 'Nullified medium for light wave propagation',
      confidence: 0.20,
      sourceKnowledgeIds: ['kn_3'],
      sourceExperienceIds: [],
      originatingCellId: 'cell_synapse_test',
      verificationStatus: 'REJECTED' as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      provenance: ['disproven_physics'],
      metadata: {}
    });

    expect(graph.getAllConcepts().length).toBe(3);

    // Initialize metabolism controller under starvation pressure
    const cellMetabolism = new CellMetabolismController('cell_synapse_test', {
      initialAtp: 20.0, // Low initial ATP triggers starvation response
      maxAtpPool: 100.0,
      basalMetabolicRate: 0.5
    });

    expect(cellMetabolism.getVitalityState()).toBe(CellVitalityState.STARVATION);

    const degResult = await cellMetabolism.degradeSynapticEnergy(graph, {
      perConceptRetentionCost: 0.1,
      atrophyThreshold: 0.35
    });

    expect(degResult.conceptsCount).toBe(3);
    expect(degResult.prunedConceptsCount).toBe(2);
    expect(degResult.energySaved).toBeGreaterThan(0);

    // Strong concept survives, weak disproven concepts atrophied
    expect(graph.getConcept('con_strong')).toBeDefined();
    expect(graph.getConcept('con_weak_1')).toBeUndefined();
    expect(graph.getConcept('con_weak_2')).toBeUndefined();
  });

  it('Upgrade 5: Two-Cell Epistemic Swarm Sync executes Proof-of-Epistemic-Yield consensus over P2P', async () => {
    const cellA = new Cell(path.join(tmpDir, 'cellA.json'), 'secret_a');
    const cellB = new Cell(path.join(tmpDir, 'cellB.json'), 'secret_b');

    await cellA.start(4111);
    await cellB.start(4112);

    try {
      await cellA.connectToPeer('ws://localhost:4112');
      await new Promise(r => setTimeout(r, 600));

      expect(cellA.transport.getActivePeerCount()).toBe(1);
      expect(cellB.transport.getActivePeerCount()).toBe(1);

      // Cell A broadcasts an epistemic hypothesis proposal
      const proposal = {
        hypothesisId: 'hyp_quantum_macrophage_99',
        sourceDomain: 'CELLULAR_IMMUNOLOGY',
        targetDomain: 'CYBERSECURITY_ZERO_TRUST',
        statement: 'Metabolic Phagocytosis yields zero-trust containment with topological invariant rho = 0.89',
        proofChain: ['Dendritic anomaly trigger', 'Isomorphic eBPF kernel isolation', 'HDC hamming projection'],
        hdcSignature: '0xaabbccdd11223344',
        yieldEstimate: 0.88
      };

      await cellA.broadcastEpistemicHypothesis(proposal);

      // Wait for P2P network delivery, proof validation, and verdict response
      await new Promise(r => setTimeout(r, 1200));

      // 1. Cell B verified and committed the swarm theorem to its Cognitive Graph
      const bConcepts = cellB.cognitiveGraph.getAllConcepts();
      const committed = bConcepts.find(c => c.conceptId.includes('hyp_quantum_macrophage_99'));
      expect(committed).toBeDefined();
      expect(committed?.description).toContain('Metabolic Phagocytosis');

      // 2. Cell A received Proof Verdict from Cell B
      const verdictsA = cellA.epistemicSwarmVerdicts.get('hyp_quantum_macrophage_99');
      expect(verdictsA).toBeDefined();
      expect(verdictsA!.length).toBeGreaterThan(0);
      expect(verdictsA![0].accepted).toBe(true);
      expect(verdictsA![0].yieldScore).toBeGreaterThanOrEqual(0.70);
    } finally {
      await cellA.stop();
      await cellB.stop();
    }
  });
});
