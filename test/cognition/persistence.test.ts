import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore, JsonFileMemoryStore } from '../../src/redqueen/memory/store';
import { MemoryCategory } from '../../src/redqueen/memory/store';
import { EpistemicState, EpistemicStatus } from '../../src/redqueen/cognition/epistemic/types';
import fs from 'fs/promises';
import path from 'path';

describe('Epistemic State Persistence', () => {
  const TEST_DIR = path.join(__dirname, 'test-storage');
  let memoryStore: MemoryStore;

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    memoryStore = new JsonFileMemoryStore(path.join(TEST_DIR, 'memory.json'));
    await memoryStore.initialize();
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('TEST 11: Epistemic state persists and reloads correctly', async () => {
    const epistemicState: EpistemicState = {
      subjectId: 'concept_123',
      contextId: 'ctx_abc',
      opinion: { belief: 0.8, disbelief: 0.1, uncertainty: 0.1, baseRate: 0.5 },
      status: EpistemicStatus.BELIEVED,
      evidenceRefs: ['ev1'],
      provenanceRefs: ['cell1']
    };

    await memoryStore.put({
      id: 'epi_123',
      cellId: 'cell1',
      category: MemoryCategory.SEMANTIC,
      type: 'EPISTEMIC_STATE',
      content: epistemicState,
      source: 'p7_adapter',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1.0,
      hash: '',
      provenance: ['cell1'],
      version: 1
    });

    const retrieved = await memoryStore.get('epi_123');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.content.status).toBe(EpistemicStatus.BELIEVED);
    expect(retrieved?.content.opinion.belief).toBe(0.8);
    expect(retrieved?.content.subjectId).toBe('concept_123');
  });
});
