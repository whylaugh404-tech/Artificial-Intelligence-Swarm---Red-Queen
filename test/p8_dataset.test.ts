import { describe, expect, test, vi } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { P2PTransport } from '../src/redqueen/network/transport';

describe('Dataset Ingestion', () => {
  test('ingestDataset processes records', async () => {
    const transport = new P2PTransport({ nodeId: 'test_node' } as any);
    const cell = new Cell({ nodeId: 'test_node', transport, traits: {} });
    
    // Mock cognition pipeline
    const cognitionMock = {
      executeCycle: vi.fn().mockResolvedValue({})
    };
    (cell as any).cognition = cognitionMock;

    const dataset = [
      { id: 1, text: "hello" },
      { id: 2, text: "world" }
    ];

    await cell.ingestDataset(dataset);
    
    expect(cognitionMock.executeCycle).toHaveBeenCalledTimes(2);
  });
});
