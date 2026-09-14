import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { Cell } from '../src/redqueen/core/cell';
import { VerificationEngine } from '../src/redqueen/cognition/verification/engine';
import { ConflictType, ConflictResolutionDecision } from '../src/redqueen/cognition/verification/types';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { JsonFileMemoryStore } from '../src/redqueen/memory/store';
import { EpistemicStatus } from '../src/redqueen/cognition/epistemic/types';

describe('P7.4: Verification Engine', () => {
  const storePath = './data/test_verification';
  let memory: JsonFileMemoryStore;
  let graph: CognitiveGraph;
  let engine: VerificationEngine;

  beforeEach(async () => {
    memory = new JsonFileMemoryStore(storePath, 'node_test');
    graph = new CognitiveGraph('node_test', memory);
    engine = new VerificationEngine();
    engine.setGraph(graph);
    
    // Seed test data
    await graph.insertConcept({
      conceptId: 'con_claim_a',
      canonicalName: 'Earth is flat',
      description: 'The earth is a flat plane',
      category: 'UNKNOWN',
      sourceKnowledgeIds: ['k_1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell_1',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      evidenceIds: ['ev_a1'],
      confidence: 0.2,
      provenance: ['cell_1'],
      verificationStatus: 'PENDING',
      metadata: {}
    } as any);
    
    await graph.insertConcept({
      conceptId: 'con_claim_b',
      canonicalName: 'Earth is round',
      description: 'The earth is an oblate spheroid',
      category: 'UNKNOWN',
      sourceKnowledgeIds: ['k_2'],
      sourceExperienceIds: [],
      originatingCellId: 'cell_2',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      evidenceIds: ['ev_b1', 'ev_b2'],
      confidence: 0.95,
      provenance: ['cell_2'],
      verificationStatus: 'VERIFIED',
      metadata: {}
    } as any);

    await graph.insertEvidence({
      evidenceId: 'ev_a1',
      sourceId: 'src_1',
      timestamp: new Date().toISOString(),
      provenance: { sourceId: 'src_1', timestamp: new Date().toISOString() },
      context: { contextId: 'ctx_1', domain: 'test', cellId: 'node_test', sessionContext: 'test' },
      confidence: 0.1
    } as any);

    await graph.insertEvidence({
      evidenceId: 'ev_b1',
      sourceId: 'src_2',
      timestamp: new Date().toISOString(),
      provenance: { sourceId: 'src_2', timestamp: new Date().toISOString() },
      context: { contextId: 'ctx_1', domain: 'test', cellId: 'node_test', sessionContext: 'test' },
      confidence: 0.9
    } as any);
    
    await graph.insertEvidence({
      evidenceId: 'ev_b2',
      sourceId: 'src_3',
      timestamp: new Date().toISOString(),
      provenance: { sourceId: 'src_3', timestamp: new Date().toISOString() },
      context: { contextId: 'ctx_1', domain: 'test', cellId: 'node_test', sessionContext: 'test' },
      confidence: 0.95
    } as any);
  });

  afterEach(async () => {
    try {
      await fs.rm(storePath, { recursive: true, force: true });
    } catch (e) {}
  });

  test('1. Verification engine resolves conflict using evidence confidence', async () => {
    const conflict = engine.detectAndResolveConflict({
      type: ConflictType.DIRECT_CONTRADICTION,
      claimAId: 'con_claim_a',
      claimBId: 'con_claim_b',
      description: 'Shape of the earth'
    });

    expect(conflict).toBeDefined();
    expect(conflict.type).toBe(ConflictType.DIRECT_CONTRADICTION);
    expect(conflict.resolutionDecision).toBe(ConflictResolutionDecision.REJECT_CLAIM_A);
    expect(conflict.resolutionReason).toContain('Claim B has significantly stronger evidence support');
  });

  test('2. Verification engine leaves conflict unresolved if evidence is insufficient/balanced', async () => {
    // Add identical evidence support
    await graph.insertConcept({
      conceptId: 'con_claim_c',
      canonicalName: 'Red',
      description: 'Is red',
      category: 'UNKNOWN',
      sourceKnowledgeIds: ['k_1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell_1',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      evidenceIds: ['ev_c1'],
      confidence: 0.5,
      provenance: ['cell_1'],
      verificationStatus: 'PENDING',
      metadata: {}
    } as any);
    
    await graph.insertConcept({
      conceptId: 'con_claim_d',
      canonicalName: 'Blue',
      description: 'Is blue',
      category: 'UNKNOWN',
      sourceKnowledgeIds: ['k_2'],
      sourceExperienceIds: [],
      originatingCellId: 'cell_2',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      evidenceIds: ['ev_d1'],
      confidence: 0.5,
      provenance: ['cell_2'],
      verificationStatus: 'PENDING',
      metadata: {}
    } as any);

    await graph.insertEvidence({
      evidenceId: 'ev_c1',
      sourceId: 'src_1',
      timestamp: new Date().toISOString(),
      provenance: { sourceId: 'src_1', timestamp: new Date().toISOString() },
      context: { contextId: 'ctx_2', domain: 'test', cellId: 'node_test', sessionContext: 'test' },
      confidence: 0.8
    } as any);

    await graph.insertEvidence({
      evidenceId: 'ev_d1',
      sourceId: 'src_1',
      timestamp: new Date().toISOString(),
      provenance: { sourceId: 'src_1', timestamp: new Date().toISOString() },
      context: { contextId: 'ctx_2', domain: 'test', cellId: 'node_test', sessionContext: 'test' },
      confidence: 0.8
    } as any);

    const conflict = engine.detectAndResolveConflict({
      type: ConflictType.DIRECT_CONTRADICTION,
      claimAId: 'con_claim_c',
      claimBId: 'con_claim_d',
      description: 'Color conflict'
    });

    expect(conflict).toBeDefined();
    expect(conflict.resolutionDecision).toBe(ConflictResolutionDecision.UNRESOLVED);
  });
});
