import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import {
  InformationSourceType,
  MetabolismStatus,
  InformationCategory,
  MetabolismEventType
} from '../src/redqueen/metabolism';
import { MemoryCategory } from '../src/redqueen/memory/store';
import { CellState } from '../src/redqueen/core/lifecycle';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('P4 Metabolism: Full Engine & Cell Integration', () => {
  const testStorageDir = path.join(process.cwd(), 'data', 'test_metabolism_cell');
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
      {
        specialization: 'NETWORKING',
        customTraits: {
          riskTolerance: 0.2,
          explorationVsExploitation: 0.7
        }
      }
    );

    await cell.start();
  });

  afterEach(async () => {
    await cell.stop();
    await fs.rm(testStorageDir, { recursive: true, force: true });
  });

  it('successfully metabolizes valid information and persists into Cell memory and cognitive state', async () => {
    const rawContent = `
# Kademlia Routing Optimization
Analysis of peer packet routing across Kademlia DHT k-buckets.
- UDP socket timeouts should be bounded to 3000ms.
- 160-bit XOR distance metrics allow logarithmic search complexity.
- Validated with active nodes in peer-to-peer network.
`;

    const result = await cell.metabolize({
      sourceType: InformationSourceType.DOCUMENT,
      sourceUri: 'https://docs.redqueen.internal/kademlia-opt',
      content: rawContent,
      contentType: 'text/markdown'
    });

    expect(result.status).toBe(MetabolismStatus.ACCEPTED);
    expect(result.knowledgeId).toBeDefined();
    expect(result.cellId).toBe(cell.nodeId);
    expect(result.classification).toBe(InformationCategory.NETWORKING);
    expect(result.relevance?.relevanceScore).toBeGreaterThanOrEqual(0.7);
    expect(result.quality?.confidence).toBeGreaterThan(0.5);

    // 1. Verify Memory Store persistence and isolation
    const stored = await cell.memory.get(result.knowledgeId!);
    expect(stored).not.toBeNull();
    expect(stored?.cellId).toBe(cell.nodeId);
    expect(stored?.category).toBe(MemoryCategory.SEMANTIC);
    expect(stored?.type).toBe('KNOWLEDGE_RECORD');
    expect(stored?.content.title).toBe('Kademlia Routing Optimization');
    expect(stored?.content.facts.length).toBeGreaterThan(0);

    // 2. Verify Cognitive State update
    const cogState = cell.cognitiveState.getState();
    expect(cogState.knowledgeReferences).toContain(result.knowledgeId);
    expect(cogState.memoryStats.semantic).toBeGreaterThan(0);

    // 3. Verify Cell Status includes metabolism events
    const status = cell.getStatus();
    expect(status.metabolismAuditEventsCount).toBeGreaterThan(0);
  });

  it('detects and rejects duplicate information payloads', async () => {
    const content = '# Duplicate Check\nDeterministic network payload for testing duplicates.';

    const result1 = await cell.metabolize({
      sourceType: InformationSourceType.DOCUMENT,
      content
    });
    expect(result1.status).toBe(MetabolismStatus.ACCEPTED);

    const result2 = await cell.metabolize({
      sourceType: InformationSourceType.DOCUMENT,
      content
    });
    expect(result2.status).toBe(MetabolismStatus.DUPLICATE);
    expect(result2.knowledgeId).toBe(result1.knowledgeId);
  });

  it('rejects malformed information input with INVALID status', async () => {
    const result = await cell.metabolize({
      sourceType: 'INVALID_TYPE' as any,
      content: ''
    });

    expect(result.status).toBe(MetabolismStatus.INVALID);
    expect(result.reason).toContain('Validation failed');
  });

  it('records comprehensive audit trail and redacts sensitive credentials', async () => {
    cell.metabolism.audit.recordEvent(
      MetabolismEventType.INFORMATION_RECEIVED,
      'test_info_1',
      {
        sourceIdentifier: 'trusted_feed',
        secretApiKey: 'super-secret-12345',
        passwordToken: 'hunter2',
        safeMetadata: 'ok'
      }
    );

    const events = cell.metabolism.audit.getEvents();
    const event = events.find(e => e.informationId === 'test_info_1');

    expect(event).toBeDefined();
    expect(event?.details.secretApiKey).toBe('[REDACTED]');
    expect(event?.details.passwordToken).toBe('[REDACTED]');
    expect(event?.details.safeMetadata).toBe('ok');
  });

  it('blocks metabolism when Cell is retired or suspended', async () => {
    cell.lifecycle.suspend('test suspension');

    await expect(cell.metabolize({
      sourceType: InformationSourceType.DOCUMENT,
      content: 'Some info'
    })).rejects.toThrow(/Cell is suspended/);

    cell.lifecycle.retire('test retirement');

    await expect(cell.metabolize({
      sourceType: InformationSourceType.DOCUMENT,
      content: 'Some info'
    })).rejects.toThrow(/Cell is retired/);
  });
});
