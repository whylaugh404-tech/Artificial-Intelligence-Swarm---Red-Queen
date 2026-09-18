import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { P2PTransport } from '../src/redqueen/network/transport';
import { MemoryCategory } from '../src/redqueen/memory/store';

describe('Provenance Consistency Seam: Dataset -> Metabolism -> Representation -> Evidence', () => {
  let cell: Cell;

  beforeEach(async () => {
    cell = new Cell(
      ':memory:',
      'fake_api_key',
      undefined,
      undefined,
      undefined,
      { storageSecret: 'provenance_test_secret' }
    );
    await cell.memory.initialize();
    Object.defineProperty(cell, 'cognition', { value: { executeCycle: vi.fn() }, writable: true });
  });

  it('membuktikan Dataset -> Metabolism -> Representation -> Evidence memakai ID dan provenance yang konsisten', async () => {
    const datasetRecord = {
      sourceId: 'sensor_station_alpha',
      metric: 'atmospheric_pressure',
      value: 1013.25,
      confidence: 0.92
    };

    await cell.ingestDataset([datasetRecord]);

    // 1. Memory Observation
    const episodicMemories = await cell.memory.search({ category: MemoryCategory.EPISODIC });
    const obsMemory = episodicMemories.find(m => m.source === 'sensor_station_alpha');
    expect(obsMemory).toBeDefined();
    expect(obsMemory!.provenance).toContain(cell.nodeId);
    expect(obsMemory!.provenance).toContain('sensor_station_alpha');

    // 2. Knowledge (Metabolism result)
    const semanticMemories = await cell.memory.search({ category: MemoryCategory.SEMANTIC });
    const knowledgeMem = semanticMemories.find(m => m.type === 'KNOWLEDGE_RECORD');
    expect(knowledgeMem).toBeDefined();
    const knowledge = knowledgeMem!.content;
    expect(knowledge.sourceProvenance[0].sourceIdentifier).toBe('sensor_station_alpha');

    // 3. Cognitive Representations
    const concepts = cell.cognitiveGraph.getAllConcepts();
    expect(concepts.length).toBeGreaterThan(0);
    const concept = concepts[0];
    expect(concept.provenance).toContain(cell.nodeId);
    expect(concept.provenance).toContain('sensor_station_alpha');
    expect(concept.sourceKnowledgeIds).toContain(knowledge.knowledgeId);

    // 4. Evidence (P7)
    const evidences = cell.cognitiveGraph.getAllEvidences();
    expect(evidences.length).toBeGreaterThan(0);
    const evidence = evidences.find(e => e.provenance.sourceId === 'sensor_station_alpha');
    expect(evidence).toBeDefined();

    // Verifikasi ID dan Provenance Seam yang sama persis
    expect(evidence!.provenance.sourceId).toBe('sensor_station_alpha');
    expect(evidence!.observationId).toBe(obsMemory!.id);
    expect(evidence!.provenance.observationId).toBe(obsMemory!.id);
    expect(evidence!.provenance.derivedFrom).toContain(obsMemory!.id);
    expect(evidence!.provenance.derivedFrom).toContain(knowledge.knowledgeId);
    expect(evidence!.confidence).toBe(0.92);

    // Supporting representation ID harus mengarah ke concept yang benar-benar tersimpan di Graph
    expect(evidence!.provenance.supportingRepresentationIds).toContain(concept.conceptId);
    const resolvedConcept = cell.cognitiveGraph.getConcept(evidence!.provenance.supportingRepresentationIds![0]);
    expect(resolvedConcept).toBeDefined();
    expect(resolvedConcept!.conceptId).toBe(concept.conceptId);
    expect(resolvedConcept!.sourceKnowledgeIds).toContain(knowledge.knowledgeId);
  });

  it('memastikan re-ingest duplicate tetap memetakan representationIds yang valid ke Evidence', async () => {
    const duplicateRecord = {
      sourceId: 'sensor_station_beta',
      metric: 'radiation_level',
      value: 0.12,
      confidence: 0.88
    };

    // First ingestion
    await cell.ingestDataset([duplicateRecord]);
    const initialConcepts = cell.cognitiveGraph.getAllConcepts();
    expect(initialConcepts.length).toBeGreaterThan(0);
    const initialConceptId = initialConcepts[0].conceptId;

    // Second ingestion of identical dataset record (triggers duplicate branch)
    const insertEvidenceSpy = vi.spyOn(cell.cognitiveGraph, 'insertEvidence');
    await cell.ingestDataset([duplicateRecord]);

    expect(insertEvidenceSpy).toHaveBeenCalled();
    const passedEvidence = insertEvidenceSpy.mock.calls[0][0];
    expect(passedEvidence.provenance.sourceId).toBe('sensor_station_beta');
    expect(passedEvidence.provenance.supportingRepresentationIds).toContain(initialConceptId);

    const resolved = cell.cognitiveGraph.getConcept(passedEvidence.provenance.supportingRepresentationIds![0]);
    expect(resolved).toBeDefined();
    expect(resolved!.conceptId).toBe(initialConceptId);
  });
});
