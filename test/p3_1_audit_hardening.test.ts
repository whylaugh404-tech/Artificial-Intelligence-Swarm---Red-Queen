import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { JsonFileMemoryStore, MemoryCategory, validateMemoryId, validateCellId } from '../src/redqueen/memory/store';
import {
  createGenesisGenome,
  deriveProgenyGenome,
  validateGenome,
  constructLineage
} from '../src/redqueen/genome/genome';
import {
  CellCapability,
  ALLOWED_CELL_CAPABILITIES,
  MILESTONE_RESERVED_CAPABILITIES,
  isCapabilityExecutable,
  assertCapabilityExecutable
} from '../src/redqueen/genome/types';
import { CognitiveStateManager } from '../src/redqueen/cognition/state';
import { CellState } from '../src/redqueen/core/lifecycle';
import { Cell } from '../src/redqueen/core/cell';
import { MembershipAuthority } from '../src/redqueen/swarm/authority';
import { SwarmMembershipManager } from '../src/redqueen/swarm/membership';
import { identityCrypto } from '../src/redqueen/crypto/identity';

describe('Phase 3.1 Hardening & Security Invariant Audits', () => {
  const TEST_STORAGE_DIR = './data/test_audit_p3_1';

  beforeEach(async () => {
    await fs.mkdir(TEST_STORAGE_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  });

  describe('Storage Boundary & Memory Isolation', () => {
    it('should reject path traversal in memory IDs', () => {
      const maliciousIds = [
        '../secret',
        '../../etc/passwd',
        'subdir/key',
        'subdir\\key',
        'key\0null',
        '..%2f..%2fsecret',
        '.hidden'
      ];

      for (const badId of maliciousIds) {
        expect(() => validateMemoryId(badId)).toThrow(/Path traversal or invalid characters/);
      }
    });

    it('should reject path traversal and invalid characters in cell IDs', () => {
      const badCellIds = [
        '../cellB',
        'cell/sub',
        'cell\\sub',
        'cell\0null',
        '..%2fcell',
        '.cell'
      ];

      for (const badId of badCellIds) {
        expect(() => validateCellId(badId)).toThrow(/Path traversal or invalid characters/);
      }
    });

    it('should enforce case-normalized cell ownership', async () => {
      const store = new JsonFileMemoryStore(`${TEST_STORAGE_DIR}/case_store.json`, 'Cell_Alpha');
      await store.initialize();

      // Put with matching case (different casing should normalize)
      await store.put({
        id: 'entry1',
        cellId: 'CELL_ALPHA',
        content: { secret: 'alpha_data' },
        source: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1.0,
        hash: '',
        provenance: []
      });

      const retrieved = await store.get('entry1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.content.secret).toBe('alpha_data');

      // Attempting to put with a different cell ID must be strictly rejected
      await expect(
        store.put({
          id: 'entry2',
          cellId: 'cell_beta',
          content: { secret: 'beta_data' },
          source: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          confidence: 1.0,
          hash: '',
          provenance: []
        })
      ).rejects.toThrow(/Memory ownership violation/);
    });

    it('should strictly isolate memory across Cell A and Cell B at the storage API boundary', async () => {
      const storeA = new JsonFileMemoryStore(`${TEST_STORAGE_DIR}/cellA.json`, 'cell_a');
      const storeB = new JsonFileMemoryStore(`${TEST_STORAGE_DIR}/cellB.json`, 'cell_b');
      await storeA.initialize();
      await storeB.initialize();

      // Cell A stores private entry
      await storeA.put({
        id: 'intel_doc_1',
        cellId: 'cell_a',
        content: { intelligence: 'recon_data_for_cell_a' },
        source: 'osint',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 0.95,
        hash: 'hash_a',
        provenance: ['cell_a']
      });

      // Cell B cannot read Cell A's entry
      const bRead = await storeB.get('intel_doc_1');
      expect(bRead).toBeNull();

      // Cell B cannot delete Cell A's entry
      const bDelete = await storeB.delete('intel_doc_1');
      expect(bDelete).toBe(false);

      // Cell B cannot overwrite Cell A's ownership in store B
      await expect(
        storeB.put({
          id: 'intel_doc_1',
          cellId: 'cell_a',
          content: { intelligence: 'tampered' },
          source: 'malicious',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          confidence: 1.0,
          hash: '',
          provenance: []
        })
      ).rejects.toThrow(/Memory ownership violation/);

      // Cell B cannot enumerate Cell A's entries via search query
      await expect(
        storeB.search({ cellId: 'cell_a' })
      ).rejects.toThrow(/Memory ownership violation: Cannot enumerate or search memory/);
    });
  });

  describe('Genome Immutability & Lineage Invariants', () => {
    it('should guarantee runtime immutability via deep freezing', () => {
      const genesis = createGenesisGenome();
      expect(Object.isFrozen(genesis)).toBe(true);
      expect(Object.isFrozen(genesis.traits)).toBe(true);
      expect(Object.isFrozen(genesis.capabilities)).toBe(true);
      expect(Object.isFrozen(genesis.ancestorGenomeIds)).toBe(true);
      expect(Object.isFrozen(genesis.ancestorCellIds)).toBe(true);

      // Mutating frozen genome should throw in strict mode
      expect(() => {
        (genesis as any).generation = 99;
      }).toThrow();

      expect(() => {
        (genesis.traits as any).riskTolerance = 0.99;
      }).toThrow();

      expect(() => {
        (genesis.capabilities as any).push('OSINT_SCAN');
      }).toThrow();
    });

    it('should maintain multi-generational lineage chain Gen 0 -> Gen 1 -> Gen 2 -> Gen 3 -> Gen 4', () => {
      const g0 = createGenesisGenome({ specialization: 'INIT' });
      const g1 = deriveProgenyGenome(g0, 'cell_0', { specialization: 'ORCH' });
      const g2 = deriveProgenyGenome(g1, 'cell_1', { specialization: 'RECON' });
      const g3 = deriveProgenyGenome(g2, 'cell_2', { specialization: 'ANALYSIS' });
      const g4 = deriveProgenyGenome(g3, 'cell_3', { specialization: 'REPORT' });

      expect(g0.generation).toBe(0);
      expect(g1.generation).toBe(1);
      expect(g2.generation).toBe(2);
      expect(g3.generation).toBe(3);
      expect(g4.generation).toBe(4);

      // Lineage ID invariant
      expect(g1.lineageId).toBe(g0.lineageId);
      expect(g2.lineageId).toBe(g0.lineageId);
      expect(g3.lineageId).toBe(g0.lineageId);
      expect(g4.lineageId).toBe(g0.lineageId);

      // Ancestor accumulation
      expect(g4.ancestorGenomeIds).toEqual([g0.genomeId, g1.genomeId, g2.genomeId, g3.genomeId]);
      expect(g4.ancestorCellIds).toEqual(['cell_0', 'cell_1', 'cell_2', 'cell_3']);
      expect(g4.parentGenomeId).toBe(g3.genomeId);
      expect(g4.parentCellId).toBe('cell_3');
    });

    it('should prevent cyclic lineages during progeny derivation', () => {
      const parent = createGenesisGenome({ genomeId: 'parent_genome' });
      const parentCellId = 'cell_001';

      // Deriving with progenyId == parentId must fail
      expect(() => {
        deriveProgenyGenome(parent, parentCellId, { genomeId: 'parent_genome' });
      }).toThrow(/Cyclic lineage detected: progeny genomeId 'parent_genome' is already an ancestor/);

      // Derive Generation 1
      const gen1 = deriveProgenyGenome(parent, parentCellId, { genomeId: 'gen1_genome' });
      expect(gen1.generation).toBe(1);
      expect(gen1.ancestorGenomeIds).toContain('parent_genome');

      // Attempting to derive Generation 2 with an already used ancestor ID must fail
      expect(() => {
        deriveProgenyGenome(gen1, 'cell_002', { genomeId: 'parent_genome' });
      }).toThrow(/Cyclic lineage detected: progeny genomeId 'parent_genome' is already an ancestor/);

      // Attempting to re-use an existing ancestor cell ID in the lineage chain must fail
      expect(() => {
        deriveProgenyGenome(gen1, parentCellId);
      }).toThrow(/Cyclic lineage detected: parentCellId 'cell_001' is already in ancestor cell chain/);
    });

    it('should ensure independent sibling progeny without shared state mutation', () => {
      const parent = createGenesisGenome();
      const sibling1 = deriveProgenyGenome(parent, 'parent_cell', {
        genomeId: 'sibling_1',
        specialization: 'OSINT_RECON',
        traits: { riskTolerance: 0.1 }
      });

      const sibling2 = deriveProgenyGenome(parent, 'parent_cell', {
        genomeId: 'sibling_2',
        specialization: 'CODE_AUDIT',
        traits: { riskTolerance: 0.8 }
      });

      expect(sibling1.genomeId).toBe('sibling_1');
      expect(sibling2.genomeId).toBe('sibling_2');
      expect(sibling1.specialization).toBe('OSINT_RECON');
      expect(sibling2.specialization).toBe('CODE_AUDIT');
      expect(sibling1.traits.riskTolerance).toBe(0.1);
      expect(sibling2.traits.riskTolerance).toBe(0.8);
      expect(sibling1.generation).toBe(1);
      expect(sibling2.generation).toBe(1);
    });
  });

  describe('Capability Gating & Defensive Guardrails', () => {
    it('should reject offensive VULN_EXPLOIT capability', () => {
      expect(ALLOWED_CELL_CAPABILITIES).not.toContain('VULN_EXPLOIT');
      expect(isCapabilityExecutable('VULN_EXPLOIT')).toBe(false);
      expect(() => assertCapabilityExecutable('VULN_EXPLOIT')).toThrow(
        /Offensive exploitation capabilities \(VULN_EXPLOIT\) are strictly forbidden/
      );
    });

    it('should gate milestone capabilities (PEER_REPLICATION, MEMORY_MUTATION) from autonomous execution in P3', () => {
      expect(isCapabilityExecutable('PEER_REPLICATION')).toBe(false);
      expect(isCapabilityExecutable('MEMORY_MUTATION')).toBe(false);

      expect(() => assertCapabilityExecutable('PEER_REPLICATION')).toThrow(
        /PEER_REPLICATION is reserved for P6 Mitosis/
      );
      expect(() => assertCapabilityExecutable('MEMORY_MUTATION')).toThrow(
        /MEMORY_MUTATION is reserved for P4 Information Metabolism/
      );

      // Normal defensive capabilities are executable
      expect(isCapabilityExecutable('OSINT_SCAN')).toBe(true);
      expect(isCapabilityExecutable('COGNITIVE_REASONING')).toBe(true);
      expect(() => assertCapabilityExecutable('OSINT_SCAN')).not.toThrow();
    });
  });

  describe('Cognitive State Hardening & Integrity', () => {
    it('should clamp confidence between 0 and 1 and reject NaN, Infinity, and -Infinity', () => {
      const manager = new CognitiveStateManager('cell_cog_test', null, [], 0.5);

      manager.updateConfidence(1.5);
      expect(manager.getState().operationalConfidence).toBe(1.0);

      manager.updateConfidence(2.0);
      expect(manager.getState().operationalConfidence).toBe(1.0);

      manager.updateConfidence(-0.5);
      expect(manager.getState().operationalConfidence).toBe(0.0);

      manager.updateConfidence(-1.0);
      expect(manager.getState().operationalConfidence).toBe(0.0);

      manager.updateConfidence(0.5);
      expect(manager.getState().operationalConfidence).toBe(0.5);

      expect(() => manager.updateConfidence(NaN)).toThrow(/Invalid confidence value/);
      expect(() => manager.updateConfidence(Infinity)).toThrow(/Invalid confidence value/);
      expect(() => manager.updateConfidence(-Infinity)).toThrow(/Invalid confidence value/);
      expect(() => (manager as any).updateConfidence('0.8')).toThrow(/Invalid confidence value/);
    });

    it('should recover gracefully from corrupted stored cognitive state', async () => {
      const store = new JsonFileMemoryStore(`${TEST_STORAGE_DIR}/cog_corrupt.json`, 'cell_corrupt');
      await store.initialize();

      // Put corrupted entry missing required fields
      await store.put({
        id: 'cognitive_state_cell_corrupt',
        cellId: 'cell_corrupt',
        category: MemoryCategory.SEMANTIC,
        content: { malformed: true, activeGoals: 'not_an_array' },
        source: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1.0,
        hash: '',
        provenance: []
      });

      const manager = new CognitiveStateManager('cell_corrupt');
      const restored = await manager.restore(store);
      expect(restored).toBe(false);

      // Manager retains safe default state
      expect(manager.getState().cellId).toBe('cell_corrupt');
      expect(manager.getState().activeGoals).toEqual([]);
    });
  });

  describe('Cell Lifecycle & Operational Invariants', () => {
    it('should prohibit SUSPENDED and RETIRED cells from initiating network operations', async () => {
      const cell = new Cell(`${TEST_STORAGE_DIR}/cell_lifecycle.json`, 'test_api_key');
      await cell.start();

      // Transition to SUSPENDED
      cell.lifecycle.suspend('testing_suspension');
      expect(cell.lifecycle.getState()).toBe(CellState.SUSPENDED);

      await expect(cell.connectToPeer('ws://localhost:9999')).rejects.toThrow(
        /Cell is suspended and cannot initiate connections/
      );
      await expect(cell.findNode('00'.repeat(32))).rejects.toThrow(
        /Cell is suspended and cannot perform lookups/
      );

      // Transition to RETIRED
      cell.lifecycle.retire('testing_retirement');
      expect(cell.lifecycle.getState()).toBe(CellState.RETIRED);

      await expect(cell.connectToPeer('ws://localhost:9999')).rejects.toThrow(
        /Cell is retired and cannot initiate connections/
      );
      await expect(cell.findNode('00'.repeat(32))).rejects.toThrow(
        /Cell is retired and cannot perform lookups/
      );

      await cell.stop();
    });

    it('should never expose privateKey in Cell JSON serialization or getStatus', () => {
      const cell = new Cell(`${TEST_STORAGE_DIR}/cell_leak_test.json`, 'test_api_key');
      
      // JSON.stringify must not include privateKey
      const serialized = JSON.stringify(cell);
      expect(serialized).not.toContain(cell.privateKey);

      // Status must not include privateKey
      const status = cell.getStatus();
      expect(JSON.stringify(status)).not.toContain(cell.privateKey);
      expect((status as any).privateKey).toBeUndefined();
    });

    it('should validate and deeply freeze restored genome in Cell.restoreGenome()', () => {
      const cell = new Cell(`${TEST_STORAGE_DIR}/cell_restore_test.json`, 'test_api_key');
      const validGenome = createGenesisGenome({ specialization: 'RESTORE_TEST' });

      cell.restoreGenome(validGenome);
      expect(cell.genome.specialization).toBe('RESTORE_TEST');
      expect(Object.isFrozen(cell.genome)).toBe(true);
      expect(Object.isFrozen(cell.genome.traits)).toBe(true);

      // Attempting to restore an invalid candidate throws
      expect(() => {
        cell.restoreGenome({ invalid: true });
      }).toThrow(/Cannot restore invalid genome/);

      expect(() => {
        cell.restoreGenome(null);
      }).toThrow(/Cannot restore invalid genome/);
    });
  });
});
