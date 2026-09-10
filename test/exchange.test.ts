import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { ExchangeType } from '../src/redqueen/exchange/types';
import { MemoryCategory } from '../src/redqueen/memory/store';
import { MetabolismStatus } from '../src/redqueen/metabolism/types';
import * as fs from 'fs';
import * as path from 'path';

describe('P5 Distributed Knowledge & Experience Exchange', () => {
  let cellA: Cell;
  let cellB: Cell;
  let storeDir: string;

  beforeEach(async () => {
    storeDir = path.join(__dirname, `.test_exchange_store_${Date.now()}.json`);
    cellA = new Cell(storeDir, 'dummy-key', undefined, undefined, undefined, {
      capabilities: ['KNOWLEDGE_QUERY', 'AUTHORIZED_MEMORY_OPS', 'SWARM_COORDINATION'],
      exchangeConfig: { exchangeTimeoutMs: 500, maxResponsesPerQuery: 1 }
    });
    cellB = new Cell(storeDir + '2', 'dummy-key', undefined, undefined, undefined, {
      capabilities: ['KNOWLEDGE_QUERY', 'AUTHORIZED_MEMORY_OPS', 'SWARM_COORDINATION'],
      exchangeConfig: { exchangeTimeoutMs: 500, maxResponsesPerQuery: 1 }
    });

    await cellA.start(4021);
    await cellB.start(4022);

    await cellA.connectToPeer('ws://localhost:4022');
    
    // Wait for discovery/connection fully
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterEach(async () => {
    await cellA.lifecycle.shutdown();
    await cellB.lifecycle.shutdown();
    if (fs.existsSync(storeDir)) {
      fs.rmSync(storeDir, { force: true });
    }
    if (fs.existsSync(storeDir + '2')) {
      fs.rmSync(storeDir + '2', { force: true });
    }
  });

  it('queries knowledge from a peer and returns NOT_FOUND if none exists', async () => {
    const results = await cellA.exchange.query({
      queryType: ExchangeType.enum.KNOWLEDGE,
      topic: 'NonExistentTopic',
      maxResults: 1
    });

    expect(results).toBeDefined();
    // cellB will respond with NOT_FOUND because it has no knowledge
    const bResponse = results.find(r => r.status === 'NOT_FOUND');
    expect(bResponse).toBeDefined();
  });

  it('queries knowledge from a peer and returns FOUND if it exists', async () => {
    // Inject knowledge into cellB directly
    const dummyKnowledge = {
      knowledgeId: 'k123',
      owningCellId: cellB.nodeId,
      title: 'Distributed Systems',
      summary: 'A summary about distributed systems.',
      category: 'COMPUTER_SCIENCE',
      facts: ['Nodes can fail', 'Network is unreliable'],
      relationships: [],
      contradictions: [],
      structuredContent: {},
      sourceInformationIds: ['info123'],
      sourceContentHashes: ['a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4'],
      sourceProvenance: [{
        informationId: 'info123',
        sourceIdentifier: cellB.nodeId,
        contentHash: 'a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4',
        acquiredAt: new Date().toISOString(),
        metabolizedAt: new Date().toISOString()
      }],
      reinforcementCount: 0,
      confidence: 0.9,
      relevance: 0.8,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      knowledgeVersion: 1
    };

    await cellB.memory.put({
      id: dummyKnowledge.knowledgeId,
      cellId: cellB.nodeId,
      category: MemoryCategory.SEMANTIC,
      type: 'KNOWLEDGE_RECORD',
      content: dummyKnowledge,
      source: 'metabolism',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: dummyKnowledge.confidence,
      hash: dummyKnowledge.sourceContentHashes[0],
      provenance: [cellB.nodeId],
      version: 1
    });

    const results = await cellA.exchange.query({
      queryType: ExchangeType.enum.KNOWLEDGE,
      topic: 'Distributed Systems',
      maxResults: 1
    });

    expect(results).toBeDefined();
    const bResponse = results.find(r => r.status === 'FOUND');
    expect(bResponse).toBeDefined();
    expect(bResponse?.knowledge).toBeDefined();
    expect(bResponse?.knowledge![0].knowledgeId).toBe('k123');
  });

  it('assimilates external knowledge and enforces provenance', async () => {
    const incomingKnowledge = {
      knowledgeId: 'k999',
      owningCellId: cellB.nodeId,
      title: 'P5 Architecture',
      summary: 'Summary of P5',
      category: 'SOFTWARE_ENGINEERING',
      facts: ['P5 requires provenance'],
      relationships: [],
      contradictions: [],
      structuredContent: {},
      sourceInformationIds: ['info999'],
      sourceContentHashes: ['b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5'],
      sourceProvenance: [{
        informationId: 'info999',
        sourceIdentifier: cellB.nodeId,
        contentHash: 'b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5',
        acquiredAt: new Date().toISOString(),
        metabolizedAt: new Date().toISOString()
      }],
      reinforcementCount: 0,
      confidence: 0.95,
      relevance: 0.9,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      knowledgeVersion: 1
    };

    const result = await cellA.exchange.assimilate(incomingKnowledge, undefined, cellB.nodeId);
    
    expect(result.status).toBe(MetabolismStatus.ACCEPTED);
    
    // Check cellA's memory for assimilation
    const assimilated = await cellA.memory.get('k999');
    expect(assimilated).toBeDefined();
    
    // Provenance must have cellA's ID appended
    const content = assimilated!.content as any;
    expect(content.sourceProvenance.some((p: any) => p.sourceIdentifier === cellB.nodeId)).toBe(true);
    expect(content.sourceProvenance.some((p: any) => p.sourceIdentifier === cellA.nodeId)).toBe(true);
    
    // Original identity hash remains
    expect(assimilated!.hash).toBe(incomingKnowledge.sourceContentHashes[0]);
  });

  it('rejects duplicate external knowledge assimilation', async () => {
    const incomingKnowledge = {
      knowledgeId: 'k_dup',
      owningCellId: cellB.nodeId,
      title: 'P5 Architecture',
      summary: 'Summary of P5 dup',
      category: 'SOFTWARE_ENGINEERING',
      facts: ['P5 requires provenance'],
      relationships: [],
      contradictions: [],
      structuredContent: {},
      sourceInformationIds: ['info_dup'],
      sourceContentHashes: ['c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'],
      sourceProvenance: [{
        informationId: 'info_dup',
        sourceIdentifier: cellB.nodeId,
        contentHash: 'c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
        acquiredAt: new Date().toISOString(),
        metabolizedAt: new Date().toISOString()
      }],
      reinforcementCount: 0,
      confidence: 0.95,
      relevance: 0.9,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      knowledgeVersion: 1
    };

    const res1 = await cellA.exchange.assimilate(incomingKnowledge, undefined, cellB.nodeId);
    expect(res1.status).toBe(MetabolismStatus.ACCEPTED);

    // Second assimilation of the same knowledgeId should fail with DUPLICATE
    const res2 = await cellA.exchange.assimilate(incomingKnowledge, undefined, cellB.nodeId);
    expect(res2.status).toBe(MetabolismStatus.DUPLICATE);
  });
});
