import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { Cell } from '../src/redqueen/core/cell';
import { CellCapability } from '../src/redqueen/genome';
import { CellState } from '../src/redqueen/core/lifecycle';

describe('P3: Cell End-to-End Genome & Cognitive State Integration', () => {
  const TEST_STORAGE_A = './data/test_integration_cell_a.json';
  const TEST_STORAGE_B = './data/test_integration_cell_b.json';
  const DUMMY_API_KEY = 'sk-or-v1-0000000000000000000000000000000000000000000000000000000000000000';

  beforeEach(async () => {
    try { await fs.unlink(TEST_STORAGE_A); } catch {}
    try { await fs.unlink(TEST_STORAGE_B); } catch {}
  });

  afterEach(async () => {
    try { await fs.unlink(TEST_STORAGE_A); } catch {}
    try { await fs.unlink(TEST_STORAGE_B); } catch {}
  });

  it('29. initializes Cell with valid Genesis genome, lineage, and active cognitive state', async () => {
    const cell = new Cell(
      TEST_STORAGE_A,
      DUMMY_API_KEY,
      undefined,
      undefined,
      undefined,
      {
        specialization: 'PERIMETER_AUDIT',
        capabilities: [CellCapability.OSINT_SCAN, CellCapability.KNOWLEDGE_QUERY]
      }
    );

    expect(cell.genome.generation).toBe(0);
    expect(cell.genome.specialization).toBe('PERIMETER_AUDIT');
    expect(cell.genome.capabilities).toContain(CellCapability.OSINT_SCAN);
    expect(cell.lineage.lineageId).toBe(cell.genome.lineageId);
    expect(cell.cognitiveState.getSpecialization()).toBe('PERIMETER_AUDIT');

    await cell.start();
    expect(cell.lifecycle.getState()).toBe(CellState.ACTIVE);
    expect(cell.cognitiveState.getState().lifecycleState).toBe(CellState.ACTIVE);

    await cell.stop();
  });

  it('30. guarantees getStatus() reports structured state without leaking cryptographic private keys', async () => {
    const cell = new Cell(
      TEST_STORAGE_A,
      DUMMY_API_KEY,
      undefined,
      undefined,
      undefined,
      { specialization: 'CRYPTO_ANALYSIS' }
    );
    await cell.start();

    const status = cell.getStatus();

    expect(status.nodeId).toBe(cell.nodeId);
    expect(status.state).toBe(CellState.ACTIVE);
    expect(status.genome).toBeDefined();
    expect(status.genome.specialization).toBe('CRYPTO_ANALYSIS');
    expect(status.lineage).toBeDefined();
    expect(status.cognitiveState).toBeDefined();

    // Critical security check: No private keys leaked in getStatus()!
    const jsonStr = JSON.stringify(status);
    expect(jsonStr).not.toContain(cell.privateKey);
    expect(jsonStr).not.toContain('BEGIN PRIVATE KEY');
    expect((status as any).privateKey).toBeUndefined();

    await cell.stop();
  });

  it('31. persists cell genome and cognitive state across full restart', async () => {
    // 1. First run
    const cell1 = new Cell(
      TEST_STORAGE_A,
      DUMMY_API_KEY,
      undefined,
      undefined,
      undefined,
      { specialization: 'INCIDENT_RESPONSE' }
    );
    await cell1.start();

    // Add a goal and knowledge reference to cell1
    cell1.cognitiveState.addGoal('quarantine_host_192.168.1.50');
    cell1.cognitiveState.addKnowledgeReference('ioc-hash-deadbeef');
    cell1.cognitiveState.updateConfidence(0.85);

    const genomeId = cell1.genome.genomeId;
    const lineageId = cell1.genome.lineageId;
    const pk = cell1.privateKey;
    const pub = cell1.publicKey;

    await cell1.stop();

    // 2. Simulated restart with the same keys and storage
    const cell2 = new Cell(
      TEST_STORAGE_A,
      DUMMY_API_KEY,
      pk,
      pub
    );
    await cell2.start();

    expect(cell2.nodeId).toBe(cell1.nodeId);
    expect(cell2.genome.genomeId).toBe(genomeId);
    expect(cell2.genome.lineageId).toBe(lineageId);

    const state = cell2.cognitiveState.getState();
    expect(state.specialization).toBe('INCIDENT_RESPONSE');
    expect(state.activeGoals).toContain('quarantine_host_192.168.1.50');
    expect(state.knowledgeReferences).toContain('ioc-hash-deadbeef');
    expect(state.operationalConfidence).toBe(0.85);

    await cell2.stop();
  });

  it('32. maintains complete individual divergence between multiple cells in a swarm', async () => {
    const cellA = new Cell(
      TEST_STORAGE_A,
      DUMMY_API_KEY,
      undefined,
      undefined,
      undefined,
      { specialization: 'RECON' }
    );
    const cellB = new Cell(
      TEST_STORAGE_B,
      DUMMY_API_KEY,
      undefined,
      undefined,
      undefined,
      { specialization: 'EXPLOITATION' }
    );

    await cellA.start();
    await cellB.start();

    // Node IDs are distinct
    expect(cellA.nodeId).not.toBe(cellB.nodeId);
    // Genomes are distinct
    expect(cellA.genome.genomeId).not.toBe(cellB.genome.genomeId);
    // Lineages are distinct
    expect(cellA.genome.lineageId).not.toBe(cellB.genome.lineageId);
    // Specializations are distinct
    expect(cellA.cognitiveState.getSpecialization()).toBe('RECON');
    expect(cellB.cognitiveState.getSpecialization()).toBe('EXPLOITATION');

    await cellA.stop();
    await cellB.stop();
  });
});
