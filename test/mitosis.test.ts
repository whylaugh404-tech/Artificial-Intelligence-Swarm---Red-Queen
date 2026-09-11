import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Cell } from '../src/redqueen/core/cell';
import { CellState } from '../src/redqueen/core/lifecycle';
import { GovernanceEnforcer } from '../src/redqueen/reproduction/policy';
import { MitosisEngine } from '../src/redqueen/reproduction/mitosis';
import { MemoryCategory } from '../src/redqueen/memory/store';

const TEST_STORAGE_DIR = path.join(process.cwd(), 'data', 'test_mitosis');

describe('P6 Cell Mitosis & Cell Reproduction', () => {
  let parentCell: Cell;
  let childCell: Cell | undefined;
  let governance: GovernanceEnforcer;
  let mitosis: MitosisEngine;

  beforeEach(async () => {
    await fs.mkdir(TEST_STORAGE_DIR, { recursive: true });
    
    parentCell = new Cell(
      path.join(TEST_STORAGE_DIR, 'parent_memory.json'),
      'dummy-api-key',
      undefined,
      undefined,
      undefined,
      {
        capabilities: ['INFO_PROCESSING', 'KNOWLEDGE_QUERY'],
        specialization: 'generalist'
      }
    );

    // Initialize parent
    await parentCell.memory.initialize();
    
    // Add some memory
    await parentCell.memory.put({
      id: 'core-concept-1',
      cellId: parentCell.nodeId,
      category: MemoryCategory.SEMANTIC,
      content: 'A very important concept',
      confidence: 0.9,
      hash: 'hash1',
      provenance: ['source-1'], source: 'test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });

    await parentCell.memory.put({
      id: 'low-conf-concept',
      cellId: parentCell.nodeId,
      category: MemoryCategory.SEMANTIC,
      content: 'A less certain concept',
      confidence: 0.3,
      hash: 'hash2',
      provenance: ['source-2'], source: 'test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });

    await parentCell.start();

    governance = new GovernanceEnforcer({ populationCeiling: 3, cooldownMs: 0, requireAuthorization: true });
    mitosis = new MitosisEngine(governance);
  });

  afterEach(async () => {
    try {
      await parentCell.stop();
      if (childCell) {
        await childCell.stop();
      }
      await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
    } catch (e) {}
  });

  it('M1 & M2: Mitosis creates unique child identity and correct lineage', async () => {
    const { result, child } = await mitosis.reproduce(parentCell, {
      authorizationProof: 'test-auth',
      storageBasePath: TEST_STORAGE_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-api-key'
    });

    if(!result.success) console.log(result.errors); expect(result.success).toBe(true);
    expect(child).toBeDefined();
    if (!child) return;
    childCell = child;

    // Unique identity
    expect(child.nodeId).not.toBe(parentCell.nodeId);
    
    // Lineage
    expect(child.lineage.parentCellId).toBe(parentCell.nodeId);
    expect(child.lineage.generation).toBe(parentCell.genome.generation + 1);
  });

  it('M3 & M4 & M5: Genome inheritance, bounded mutation, and differentiation', async () => {
    const { result, child } = await mitosis.reproduce(parentCell, {
      authorizationProof: 'test-auth',
      storageBasePath: TEST_STORAGE_DIR,
      currentPopulation: 1,
      specializationBias: 'cybersecurity',
      openRouterApiKey: 'dummy-api-key'
    });

    if(!result.success) console.log(result.errors); expect(result.success).toBe(true);
    expect(child).toBeDefined();
    if (!child) return;
    childCell = child;

    // Genome inheritance
    expect(child.genome.capabilities).toEqual(parentCell.genome.capabilities);
    expect(child.genome.parentGenomeId).toBe(parentCell.genome.genomeId);

    // Mutation bounds
    expect(child.genome.traits.mutationRate).not.toBeUndefined();
    expect(child.genome.traits.mutationRate).toBeLessThanOrEqual(1.0);
    
    // Differentiation
    expect(child.genome.specialization).toBe('cybersecurity');
    expect(child.genome.specialization).not.toBe(parentCell.genome.specialization);
  });

  it('M6 & M7: Memory partition and isolation', async () => {
    const { result, child } = await mitosis.reproduce(parentCell, {
      authorizationProof: 'test-auth',
      storageBasePath: TEST_STORAGE_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-api-key'
    });

    if(!result.success) console.log(result.errors); expect(result.success).toBe(true);
    expect(child).toBeDefined();
    if (!child) return;
    childCell = child;

    // Child should inherit high-confidence semantic memory
    const childMemories = await child.memory.search({});
    expect(childMemories.length).toBeGreaterThan(0);
    
    const coreConcept = childMemories.find(m => m.id === 'core-concept-1');
    expect(coreConcept).toBeDefined();
    
    // Low confidence shouldn't be inherited
    const lowConfConcept = childMemories.find(m => m.id === 'low-conf-concept');
    expect(lowConfConcept).toBeUndefined();

    // Isolation: modify child memory, parent unaffected
    await child.memory.put({
      id: 'child-only-memory',
      cellId: child.nodeId,
      category: MemoryCategory.EPISODIC,
      content: 'I was born',
      confidence: 1.0,
      hash: 'hash3',
      provenance: ['self'], source: 'test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });

    const parentSearch = await parentCell.memory.search({ id: 'child-only-memory' });
    expect(parentSearch.length).toBe(0);
  });

  it('M9: Representation Inheritance preserves provenance', async () => {
    const { result, child } = await mitosis.reproduce(parentCell, {
      authorizationProof: 'test-auth',
      storageBasePath: TEST_STORAGE_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-api-key'
    });

    if(!result.success) console.log(result.errors); expect(result.success).toBe(true);
    if (!child) return;
    childCell = child;

    const childMemories = await child.memory.search({ id: 'core-concept-1' });
    const memory = childMemories[0];
    
    expect(memory.provenance).toBeDefined();
    expect(memory.provenance.some(p => p.includes('inherited_from_'))).toBe(true);
  });

  it('M11 & M12: Governance enforces authorization and population ceilings', async () => {
    // 1. Unauthorized
    const unauthResult = await mitosis.reproduce(parentCell, {
      storageBasePath: TEST_STORAGE_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-api-key'
    });
    
    expect(unauthResult.result.success).toBe(false);
    expect(unauthResult.result.errors![0]).toContain('authorization');

    // 2. Population ceiling
    const ceilingResult = await mitosis.reproduce(parentCell, {
      authorizationProof: 'test-auth',
      storageBasePath: TEST_STORAGE_DIR,
      currentPopulation: 3, // Matches ceiling of 3
      openRouterApiKey: 'dummy-api-key'
    });
    
    expect(ceilingResult.result.success).toBe(false);
    expect(ceilingResult.result.errors![0]).toContain('ceiling');
  });

  it('M19: Reproduction Cooldown', async () => {
    const strictGovernance = new GovernanceEnforcer({ populationCeiling: 10, cooldownMs: 5000, requireAuthorization: true });
    const strictMitosis = new MitosisEngine(strictGovernance);

    // First reproduction
    const res1 = await strictMitosis.reproduce(parentCell, {
      authorizationProof: 'test-auth',
      storageBasePath: TEST_STORAGE_DIR,
      currentPopulation: 1,
      openRouterApiKey: 'dummy-api-key'
    });
    expect(res1.result.success).toBe(true);
    if (res1.child) await res1.child.stop();

    // Immediate second reproduction should fail
    const res2 = await strictMitosis.reproduce(parentCell, {
      authorizationProof: 'test-auth',
      storageBasePath: TEST_STORAGE_DIR,
      currentPopulation: 2,
      openRouterApiKey: 'dummy-api-key'
    });
    
    expect(res2.result.success).toBe(false);
    expect(res2.result.errors![0]).toContain('cooldown');
  });
});
