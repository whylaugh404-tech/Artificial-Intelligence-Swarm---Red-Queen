import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { P2PTransport } from '../src/redqueen/network/transport';
import * as fs from 'fs/promises';

describe('Dataset Ingestion Pipeline', () => {
  let cell: Cell;

  beforeEach(async () => {
    // Setup temporary storage for memory
    const storagePath = `:memory:`;
    const transport = new P2PTransport(
      { nodeId: 'test_node' } as any,
      undefined as any,
      undefined as any
    );
    
    cell = new Cell(
      storagePath,
      'fake_api_key',
      undefined,
      undefined,
      undefined,
      {
        storageSecret: 'secret'
      }
    );
    
    // Initialize components
    await cell.memory.initialize();
    
    // Mock the cognition executeCycle so it doesn't fail
    Object.defineProperty(cell, 'cognition', { value: { executeCycle: vi.fn() }, writable: true });
  });

  it('memastikan dataset ingestion memicu full pipeline (observation -> evidence -> reasoning)', async () => {
    // 1. Dataset record
    const datasetRecord = { id: 1, sourceId: 'my_dataset_001', text: "important observation" };
    
    // Spy on reasoning
    const reasonSpy = vi.spyOn(cell.reasoning, 'reason');
    const insertEvidenceSpy = vi.spyOn(cell.cognitiveGraph, 'insertEvidence');

    await cell.ingestDataset([datasetRecord]);

    // 2. Observation tersimpan di memory
    // IngestDataset creates an observation. Let's find it.
    const memories = await cell.memory.search({ source: 'my_dataset_001' });
    expect(memories.length).toBeGreaterThan(0);
    const savedObservation = memories[0];
    expect(savedObservation.content).toMatchObject(datasetRecord);

    // 3. Evidence tersimpan
    expect(insertEvidenceSpy).toHaveBeenCalled();
    const evidenceId = insertEvidenceSpy.mock.calls[0][0].evidenceId;
    
    // 4. Evidence dapat diretrieve
    const retrievedEvidence = cell.cognitiveGraph.getEvidence(evidenceId);
    expect(retrievedEvidence).toBeDefined();
    expect(retrievedEvidence?.provenance.sourceId).toBe('my_dataset_001');

    // 5. Reasoning dapat menggunakan evidence tersebut
    expect(reasonSpy).toHaveBeenCalled();
    const reasoningArgs = reasonSpy.mock.calls[0][0];
    expect(reasoningArgs.premises[0].evidenceIds).toContain(evidenceId);

    // 6. Memastikan legacy executeCycle TIDAK dipanggil (canonical single path)
    expect(cell.cognition.executeCycle).not.toHaveBeenCalled();
  });

  it('memastikan dataset menghasilkan representation (concept) yang dihubungkan ke evidence', async () => {
    // 1. Dataset record dengan reliability
    const datasetRecord = { id: 2, sourceId: 'my_dataset_002', text: "some technical fact", confidence: 0.85 };
    
    await cell.ingestDataset([datasetRecord]);
    
    // Check evidence
    const evidences = cell.cognitiveGraph.getAllEvidences();
    const evidence = evidences.find(e => e.provenance.sourceId === 'my_dataset_002');
    expect(evidence).toBeDefined();
    
    // Confidence is applied
    expect(evidence?.confidence).toBe(0.85);

    // Concept terhubung
    expect(evidence?.provenance.supportingRepresentationIds).toBeDefined();
    expect(evidence!.provenance.supportingRepresentationIds!.length).toBeGreaterThan(0);
    
    const representationId = evidence!.provenance.supportingRepresentationIds![0];
    const concept = cell.cognitiveGraph.getConcept(representationId);
    expect(concept).toBeDefined();
    expect(concept?.canonicalName).toBeDefined();

    // Memastikan legacy executeCycle TIDAK dipanggil
    expect(cell.cognition.executeCycle).not.toHaveBeenCalled();
  });

  it('memastikan ingestDataset hanya mengeksekusi canonical cognitive path tanpa legacy executeCycle', async () => {
    const records = [
      { id: 10, sourceId: 'ds_iso_1', val: 'test1' },
      { id: 11, sourceId: 'ds_iso_2', val: 'test2' }
    ];

    await cell.ingestDataset(records);

    expect(cell.cognition.executeCycle).not.toHaveBeenCalled();
  });
});
