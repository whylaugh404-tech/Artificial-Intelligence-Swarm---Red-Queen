import { describe, it, expect } from 'vitest';
import {
  createGenesisGenome,
  deriveProgenyGenome,
  validateGenome,
  constructLineage,
  ALLOWED_CELL_CAPABILITIES,
  CellGenomeSchema,
  CellCapability
} from '../src/redqueen/genome';

describe('P3: Cell Genome & Lineage System', () => {
  it('1. creates genesis genome with generation 0, valid traits, and null parent', () => {
    const genome = createGenesisGenome({ specialization: 'RECON' });

    expect(genome.generation).toBe(0);
    expect(genome.parentGenomeId).toBeNull();
    expect(genome.parentCellId).toBeNull();
    expect(genome.specialization).toBe('RECON');
    expect(genome.genomeId).toMatch(/^[a-f0-9]{32}$/);
    expect(genome.lineageId).toMatch(/^[a-f0-9]{32}$/);
    expect(genome.traits.mutationRate).toBeGreaterThanOrEqual(0);
    expect(genome.traits.mutationRate).toBeLessThanOrEqual(1);
    expect(genome.capabilities.length).toBeGreaterThan(0);
  });

  it('2. generates correct lineage representation for genesis cell', () => {
    const genome = createGenesisGenome({ specialization: 'EXPLOIT' });
    const lineage = constructLineage(genome);

    expect(lineage.lineageId).toBe(genome.lineageId);
    expect(lineage.generation).toBe(0);
    expect(lineage.parentGenomeId).toBeNull();
    expect(lineage.parentCellId).toBeNull();
    expect(lineage.ancestorGenomeIds).toEqual([]);
    expect(lineage.ancestorCellIds).toEqual([]);
  });

  it('3. derives progeny genome with strictly incremented generation', () => {
    const parent = createGenesisGenome({ specialization: 'CORE_ORCHESTRATION' });
    const parentCellId = 'a1b2c3d4e5f60000111122223333444455556666777788889999aaaabbbbcccc';

    const progeny = deriveProgenyGenome(parent, parentCellId, { specialization: 'FUZZING' });

    expect(progeny.generation).toBe(parent.generation + 1);
    expect(progeny.generation).toBe(1);
    expect(progeny.parentGenomeId).toBe(parent.genomeId);
    expect(progeny.parentCellId).toBe(parentCellId);
    expect(progeny.lineageId).toBe(parent.lineageId); // Preserves lineage identity
    expect(progeny.specialization).toBe('FUZZING');
    expect(progeny.genomeId).not.toBe(parent.genomeId);
  });

  it('4. derives progeny genome inheriting parent capabilities by default', () => {
    const parent = createGenesisGenome({
      capabilities: [CellCapability.OSINT_SCAN, CellCapability.KNOWLEDGE_QUERY]
    });
    const parentCellId = 'parent_cell_123';

    const progeny = deriveProgenyGenome(parent, parentCellId);

    expect(progeny.capabilities).toEqual(parent.capabilities);
  });

  it('5. derives progeny with modified capabilities restricted to allowed capabilities', () => {
    const parent = createGenesisGenome();
    const parentCellId = 'parent_cell_123';

    const progeny = deriveProgenyGenome(parent, parentCellId, {
      capabilities: [CellCapability.PEER_REPLICATION, CellCapability.CODE_ANALYSIS]
    });

    expect(progeny.capabilities).toContain(CellCapability.PEER_REPLICATION);
    expect(progeny.capabilities).toContain(CellCapability.CODE_ANALYSIS);
  });

  it('6. validates genome schema passes for valid genome', () => {
    const genome = createGenesisGenome();
    const check = validateGenome(genome);

    expect(check.valid).toBe(true);
    expect(check.genome).toBeDefined();
    expect(check.errors).toBeUndefined();
  });

  it('7. rejects invalid genome schema missing required fields', () => {
    const invalidGenome: any = {
      genomeId: '123',
      // missing logicVersion, generation, lineageId, etc.
    };

    const check = validateGenome(invalidGenome);
    expect(check.valid).toBe(false);
    expect(check.errors).toBeDefined();
    expect(check.errors!.length).toBeGreaterThan(0);
  });

  it('8. enforces trait bounds: mutationRate must be between 0.0 and 1.0', () => {
    const parent = createGenesisGenome();
    
    // Attempt out-of-bounds mutationRate (< 0 or > 1)
    const invalidLow: any = {
      ...parent,
      traits: { ...parent.traits, mutationRate: -0.1 }
    };
    expect(validateGenome(invalidLow).valid).toBe(false);

    const invalidHigh: any = {
      ...parent,
      traits: { ...parent.traits, mutationRate: 1.5 }
    };
    expect(validateGenome(invalidHigh).valid).toBe(false);
  });

  it('9. enforces trait bounds: riskTolerance must be between 0.0 and 1.0', () => {
    const parent = createGenesisGenome();
    
    const invalidTrait: any = {
      ...parent,
      traits: { ...parent.traits, riskTolerance: 2.0 }
    };
    expect(validateGenome(invalidTrait).valid).toBe(false);
  });

  it('10. enforces trait bounds: maxCognitiveCycleDepth must be a positive integer', () => {
    const parent = createGenesisGenome();
    
    const invalidDepth: any = {
      ...parent,
      traits: { ...parent.traits, maxCognitiveCycleDepth: 0 }
    };
    expect(validateGenome(invalidDepth).valid).toBe(false);

    const negativeDepth: any = {
      ...parent,
      traits: { ...parent.traits, maxCognitiveCycleDepth: -5 }
    };
    expect(validateGenome(negativeDepth).valid).toBe(false);
  });

  it('11. rejects invalid capability string outside of ALLOWED_CELL_CAPABILITIES', () => {
    const parent = createGenesisGenome();
    
    const invalidCap: any = {
      ...parent,
      capabilities: ['UNAUTHORIZED_MAGIC_POWER']
    };
    expect(validateGenome(invalidCap).valid).toBe(false);
  });

  it('12. ensures distinct genomeIds for multiple progeny of the same parent', () => {
    const parent = createGenesisGenome();
    const cellId = 'parent_cell_alpha';

    const childA = deriveProgenyGenome(parent, cellId, { specialization: 'RECON' });
    const childB = deriveProgenyGenome(parent, cellId, { specialization: 'DEFENSE' });

    expect(childA.genomeId).not.toBe(childB.genomeId);
    expect(childA.lineageId).toBe(childB.lineageId);
    expect(childA.generation).toBe(1);
    expect(childB.generation).toBe(1);
  });

  it('13. prevents generation decrement or corruption in lineage chains', () => {
    const gen0 = createGenesisGenome();
    const gen1 = deriveProgenyGenome(gen0, 'cell_0', { specialization: 'RECON' });
    const gen2 = deriveProgenyGenome(gen1, 'cell_1', { specialization: 'EXPLOIT' });
    const gen3 = deriveProgenyGenome(gen2, 'cell_2', { specialization: 'REPORT' });

    expect(gen0.generation).toBe(0);
    expect(gen1.generation).toBe(1);
    expect(gen2.generation).toBe(2);
    expect(gen3.generation).toBe(3);

    const lineage3 = constructLineage(gen3);
    expect(lineage3.generation).toBe(3);
    expect(lineage3.parentGenomeId).toBe(gen2.genomeId);
    expect(lineage3.parentCellId).toBe('cell_2');
    expect(lineage3.ancestorGenomeIds).toContain(gen2.genomeId);
    expect(lineage3.ancestorGenomeIds).toContain(gen1.genomeId);
    expect(lineage3.ancestorGenomeIds).toContain(gen0.genomeId);
  });

  it('14. maintains immutable lineageId across multi-generational descent', () => {
    const gen0 = createGenesisGenome();
    const gen1 = deriveProgenyGenome(gen0, 'cell_0');
    const gen2 = deriveProgenyGenome(gen1, 'cell_1');

    expect(gen0.lineageId).toBe(gen1.lineageId);
    expect(gen1.lineageId).toBe(gen2.lineageId);
  });
});
