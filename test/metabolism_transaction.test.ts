import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import {
  InformationSourceType,
  MetabolismStatus,
  InformationCategory,
  MetabolismEventType
} from '../src/redqueen/metabolism/types';
import { MemoryCategory, MemoryEntry } from '../src/redqueen/memory/store';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('P4 Metabolism: Transaction & Budget Enforcement', () => {
  const testStorageDir = path.join(process.cwd(), 'data', 'test_tx_metabolism_cell');
  const memoryPath = path.join(testStorageDir, 'cell_memory.json');
  let cell: Cell;

  beforeEach(async () => {
    await fs.rm(testStorageDir, { recursive: true, force: true });
    await fs.mkdir(testStorageDir, { recursive: true });

    cell = new Cell(
      memoryPath,
      'test-api-key',
      undefined,
      undefined,
      undefined,
      undefined
    );

    await cell.start();
  });

  afterEach(async () => {
    await cell.stop();
    await fs.rm(testStorageDir, { recursive: true, force: true });
  });

  it('rolls back Knowledge if Experience persistence fails', async () => {
    // We can simulate a failure in experience put by patching the memory store temporarily
    const originalPut = cell.memory.put.bind(cell.memory);
    let putCount = 0;
    
    cell.memory.put = async (entry: MemoryEntry) => {
      if (entry.type === 'EXPERIENCE_RECORD') {
        throw new Error('Simulated I/O failure during Experience write');
      }
      return originalPut(entry);
    };

    const rawContent = `
# New Idea
This is a very specific new idea that should be rolled back if it fails.
`;
    const result = await cell.metabolize({
      sourceType: InformationSourceType.DOCUMENT,
      content: rawContent,
      contentType: 'text/markdown'
    });

    expect(result.status).toBe(MetabolismStatus.FAILED);
    expect(result.reason).toContain('Transaction rolled back');

    // Ensure knowledge was compensated
    const allMemory = await cell.memory.search({});
    const knowledgeRecords = allMemory.filter(m => m.type === 'KNOWLEDGE_RECORD');
    expect(knowledgeRecords.length).toBe(0);

    // Ensure deduplicator is compensated (we can test by metabolizing again with same content and success)
    cell.memory.put = originalPut; // restore
    const result2 = await cell.metabolize({
      sourceType: InformationSourceType.DOCUMENT,
      content: rawContent,
      contentType: 'text/markdown'
    });

    // If dedup wasn't compensated, this would be a DUPLICATE
    expect(result2.status).toBe(MetabolismStatus.ACCEPTED);
  });

  it('enforces maximum knowledge record size before persistence', async () => {
    // Mock budget for this cell's engine
    (cell.metabolism as any).budget = {
      ...(cell.metabolism as any).budget,
      maxKnowledgeRecordSize: 100 // Very small limit
    };

    const result = await cell.metabolize({
      sourceType: InformationSourceType.DOCUMENT,
      content: 'Short content that will exceed 100 bytes when converted to a full JSON KnowledgeRecord'
    });

    expect(result.status).toBe(MetabolismStatus.FAILED);
    expect(result.reason).toContain('exceeds budget limit');
  });

  it('aborts transaction if maxProcessingTimeMs is exceeded', async () => {
    // Mock budget for timeout
    (cell.metabolism as any).budget = {
      ...(cell.metabolism as any).budget,
      maxProcessingTimeMs: 1 // 1 ms will definitely timeout during normal operations
    };

    const result = await cell.metabolize({
      sourceType: InformationSourceType.DOCUMENT,
      content: 'Some random content'
    });

    expect(result.status).toBe(MetabolismStatus.FAILED);
    expect(result.reason).toContain('Metabolism processing deadline exceeded');
  });

  it('rolls back if Cognitive State persistence fails', async () => {
    // We can simulate a failure in cognitive state put by patching the memory store temporarily
    const originalPut = cell.memory.put.bind(cell.memory);
    
    cell.memory.put = async (entry: MemoryEntry) => {
      // The cognitive state uses the ID pattern cognitive_state_<cellId>
      if (entry.id.startsWith('cognitive_state_')) {
        throw new Error('Simulated I/O failure during Cognitive State write');
      }
      return originalPut(entry);
    };

    const rawContent = `
# Cognitive Idea
This should be rolled back because cognitive state fails.
`;
    const result = await cell.metabolize({
      sourceType: InformationSourceType.DOCUMENT,
      content: rawContent,
      contentType: 'text/markdown'
    });

    expect(result.status).toBe(MetabolismStatus.FAILED);
    expect(result.reason).toContain('Transaction rolled back');

    // Ensure knowledge was compensated
    const allMemory = await cell.memory.search({});
    const knowledgeRecords = allMemory.filter(m => m.type === 'KNOWLEDGE_RECORD');
    expect(knowledgeRecords.length).toBe(0);

    const experienceRecords = allMemory.filter(m => m.type === 'EXPERIENCE_RECORD');
    expect(experienceRecords.length).toBe(0);

    // Ensure deduplicator is compensated (we can test by metabolizing again with same content and success)
    cell.memory.put = originalPut; // restore
    const result2 = await cell.metabolize({
      sourceType: InformationSourceType.DOCUMENT,
      content: rawContent,
      contentType: 'text/markdown'
    });

    // If dedup wasn't compensated, this would be a DUPLICATE
    expect(result2.status).toBe(MetabolismStatus.ACCEPTED);
  });
});
