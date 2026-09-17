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
  });
});
