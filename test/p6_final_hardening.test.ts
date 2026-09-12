import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { JsonFileMemoryStore, MemoryCategory } from '../src/redqueen/memory/store';
import {
  CognitiveConcept,
  CognitiveRelation,
  CognitiveAbstraction,
  CognitiveGeneralization,
  CognitiveAnalogy,
  CognitiveRelationPredicate,
  RepresentationVerificationStatus
} from '../src/redqueen/cognition/representation/types';
import { validateChildIntegrity } from '../src/redqueen/reproduction/consistency';
import { MitosisEngine } from '../src/redqueen/reproduction/mitosis';
import { GovernanceEnforcer } from '../src/redqueen/reproduction/policy';
import { StaticTrustAnchor } from '../src/redqueen/reproduction/types';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import { Cell } from '../src/redqueen/core/cell';
import { isPlaceholderSecret } from '../server';

describe('P6 FINAL HARDENING REGRESSION TESTS', () => {
  const TEST_DIR = path.resolve('./test/.tmp_p6_final_hardening');
  const cellId = 'test-parent-p6-cell';

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  // --------------------------------------------------------------------------
  // 1. GRAPH INTEGRITY: Dangling relations, abstractions, generalizations, analogies
  // --------------------------------------------------------------------------
  describe('Graph Integrity', () => {
    it('should reject dangling relation if subject or object concept does not exist', async () => {
      const memory = new JsonFileMemoryStore(path.join(TEST_DIR, 'mem1.json'), cellId);
      await memory.initialize();
      const graph = new CognitiveGraph(cellId, memory);
      await graph.load();

      // Only concept 1 exists
      const c1: CognitiveConcept = {
        conceptId: 'c1',
        canonicalName: 'Concept One',
        description: 'First test concept',
        category: 'UNKNOWN' as any,
        sourceKnowledgeIds: ['k1'],
        sourceExperienceIds: [],
        confidence: 0.9,
        provenance: [cellId],
        verificationStatus: RepresentationVerificationStatus.VERIFIED,
        originatingCellId: cellId,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };
      await graph.insertConcept(c1);

      const danglingRel: CognitiveRelation = {
        relationId: 'rel-dangling',
        subjectConceptId: 'c1',
        predicate: CognitiveRelationPredicate.CAUSES,
        objectConceptId: 'c-nonexistent',
        confidence: 0.8,
        provenance: [cellId],
        verificationStatus: RepresentationVerificationStatus.VERIFIED,
        originatingCellId: cellId,
        metadata: {},
        createdAt: new Date().toISOString()
      };

      await expect(graph.insertRelation(danglingRel)).rejects.toThrow(/dangling/i);
    });

    it('should reject dangling abstraction if referenced source concept does not exist', async () => {
      const memory = new JsonFileMemoryStore(path.join(TEST_DIR, 'mem2.json'), cellId);
      await memory.initialize();
      const graph = new CognitiveGraph(cellId, memory);
      await graph.load();

      const danglingAbs: CognitiveAbstraction = {
        abstractionId: 'abs-dangling',
        sourceConceptIds: ['c-missing-source'],
        generalizedPattern: 'Abstract concept pattern',
        retainedStructure: { key: 'val' },
        discardedDetails: [],
        confidence: 0.8,
        provenance: [cellId],
        originatingCellId: cellId,
        verificationStatus: RepresentationVerificationStatus.VERIFIED,
        version: 1,
        createdAt: new Date().toISOString()
      };

      await expect(graph.insertAbstraction(danglingAbs)).rejects.toThrow(/dangling/i);
    });

    it('should reject dangling generalization if instance concepts do not exist', async () => {
      const memory = new JsonFileMemoryStore(path.join(TEST_DIR, 'mem3.json'), cellId);
      await memory.initialize();
      const graph = new CognitiveGraph(cellId, memory);
      await graph.load();

      const danglingGen: CognitiveGeneralization = {
        generalizationId: 'gen-dangling',
        sourceConceptIds: ['c-missing-instance'],
        pattern: 'general pattern',
        supportingEvidence: ['evidence-1'],
        confidence: 0.8,
        verificationStatus: RepresentationVerificationStatus.VERIFIED,
        provenance: [cellId],
        createdAt: new Date().toISOString(),
        originatingCellId: cellId
      };

      await expect(graph.insertGeneralization(danglingGen)).rejects.toThrow(/dangling/i);
    });

    it('should reject dangling analogy if source or target concept does not exist', async () => {
      const memory = new JsonFileMemoryStore(path.join(TEST_DIR, 'mem4.json'), cellId);
      await memory.initialize();
      const graph = new CognitiveGraph(cellId, memory);
      await graph.load();

      const danglingAnalogy: CognitiveAnalogy = {
        analogyId: 'ana-dangling',
        sourceConceptIds: ['c-missing-src'],
        targetConceptIds: ['c-missing-tgt'],
        sourceStructure: { domain: 'd1', elements: ['e1'], relations: ['r1'] },
        targetStructure: { domain: 'd2', elements: ['e2'], relations: ['r2'] },
        mappedRelations: [{ sourceElement: 'e1', targetElement: 'e2', relationType: 'r' }],
        structuralSimilarity: 0.9,
        confidence: 0.8,
        provenance: [cellId],
        verificationStatus: RepresentationVerificationStatus.VERIFIED,
        originatingCellId: cellId,
        createdAt: new Date().toISOString()
      };

      await expect(graph.insertAnalogy(danglingAnalogy)).rejects.toThrow(/dangling/i);
    });

    it('should purge all dangling references during restore()', async () => {
      const memory = new JsonFileMemoryStore(path.join(TEST_DIR, 'mem5.json'), cellId);
      await memory.initialize();

      // Put 1 valid concept
      const validConcept: CognitiveConcept = {
        conceptId: 'valid-c1',
        canonicalName: 'Concept One',
        description: 'Existing concept',
        category: 'UNKNOWN' as any,
        sourceKnowledgeIds: ['k1'],
        sourceExperienceIds: [],
        confidence: 0.9,
        provenance: [cellId],
        verificationStatus: RepresentationVerificationStatus.VERIFIED,
        originatingCellId: cellId,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };
      await memory.put({
        id: 'valid-c1',
        cellId,
        category: MemoryCategory.SEMANTIC,
        type: 'COGNITIVE_CONCEPT',
        content: validConcept,
        source: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1.0,
        hash: '',
        provenance: [cellId],
        version: 1
      });

      // Put dangling relation
      await memory.put({
        id: 'dangling-rel',
        cellId,
        category: MemoryCategory.SEMANTIC,
        type: 'COGNITIVE_RELATION',
        content: {
          relationId: 'dangling-rel',
          subjectConceptId: 'valid-c1',
          predicate: CognitiveRelationPredicate.CAUSES,
          objectConceptId: 'missing-c2',
          confidence: 0.9,
          provenance: [cellId],
          verificationStatus: RepresentationVerificationStatus.VERIFIED,
          originatingCellId: cellId,
          metadata: {},
          createdAt: new Date().toISOString()
        },
        source: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1.0,
        hash: '',
        provenance: [cellId],
        version: 1
      });

      // Put dangling abstraction
      await memory.put({
        id: 'dangling-abs',
        cellId,
        category: MemoryCategory.SEMANTIC,
        type: 'COGNITIVE_ABSTRACTION',
        content: {
          abstractionId: 'dangling-abs',
          sourceConceptIds: ['missing-c3'],
          generalizedPattern: 'Pattern',
          retainedStructure: {},
          discardedDetails: [],
          confidence: 0.9,
          provenance: [cellId],
          originatingCellId: cellId,
          verificationStatus: RepresentationVerificationStatus.VERIFIED,
          version: 1,
          createdAt: new Date().toISOString()
        },
        source: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1.0,
        hash: '',
        provenance: [cellId],
        version: 1
      });

      const graph = new CognitiveGraph(cellId, memory);
      await graph.restore();

      // The valid concept should be loaded, but dangling items must be purged!
      expect(graph.getConcept('valid-c1')).toBeDefined();
      expect(graph.getRelation('dangling-rel')).toBeUndefined();
      expect(graph.getAllAbstractions()).toHaveLength(0);
      const stats = graph.getStats();
      expect(stats.concepts).toBe(1);
      expect(stats.relations).toBe(0);
      expect(stats.abstractions).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 2. CHILD INTEGRITY VALIDATION
  // --------------------------------------------------------------------------
  describe('Child Integrity Validation', () => {
    it('should reject child with invalid keypair or mismatched nodeId', async () => {
      const childStorage = path.join(TEST_DIR, 'child_invalid_keys.json');
      const identityPath = `${childStorage}.identity`;

      const kp1 = identityCrypto.generateKeyPair();
      const kp2 = identityCrypto.generateKeyPair();

      // Write identity with mismatched public & private key
      await fs.writeFile(
        identityPath,
        JSON.stringify({
          nodeId: identityCrypto.deriveNodeId(kp1.publicKey),
          publicKey: kp1.publicKey,
          privateKey: kp2.privateKey // Mismatched!
        })
      );

      // Write dummy memories
      await fs.writeFile(childStorage, JSON.stringify([]));

      const res = await validateChildIntegrity(childStorage, cellId, 1);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/keypair|mismatch/i);
    });

    it('should reject child with invalid genome schema', async () => {
      const childStorage = path.join(TEST_DIR, 'child_invalid_genome.json');
      const identityPath = `${childStorage}.identity`;
      const kp = identityCrypto.generateKeyPair();
      const nodeId = identityCrypto.deriveNodeId(kp.publicKey);

      await fs.writeFile(
        identityPath,
        JSON.stringify({
          nodeId,
          publicKey: kp.publicKey,
          privateKey: kp.privateKey
        })
      );

      // Write corrupted genome (missing essential schema fields like traits)
      const corruptedEntries = [
        {
          id: `cell_genome_${nodeId}`,
          cellId: nodeId,
          category: MemoryCategory.PROCEDURAL,
          content: {
            parentCellId: cellId,
            generation: 1,
            lineageId: 'lineage-1'
            // traits missing!
          }
        }
      ];
      await fs.writeFile(childStorage, JSON.stringify(corruptedEntries));

      const res = await validateChildIntegrity(childStorage, cellId, 1);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/genome schema validation failed/i);
    });

    it('should reject child with invalid lineage or parentCellId mismatch', async () => {
      const childStorage = path.join(TEST_DIR, 'child_invalid_lineage.json');
      const identityPath = `${childStorage}.identity`;
      const kp = identityCrypto.generateKeyPair();
      const nodeId = identityCrypto.deriveNodeId(kp.publicKey);

      await fs.writeFile(
        identityPath,
        JSON.stringify({
          nodeId,
          publicKey: kp.publicKey,
          privateKey: kp.privateKey
        })
      );

      const entries = [
        {
          id: `cell_genome_${nodeId}`,
          cellId: nodeId,
          category: MemoryCategory.PROCEDURAL,
          content: {
            genomeId: `genome_${nodeId}`,
            parentGenomeId: 'parent-genome-123',
            parentCellId: 'wrong-parent',
            generation: 1,
            lineageId: 'lineage-1',
            createdAt: new Date().toISOString(),
            logicVersion: '1.0.0',
            traits: {
              mutationRate: 0.05,
              riskTolerance: 0.2,
              explorationVsExploitation: 0.5,
              maxCognitiveCycleDepth: 5
            },
            capabilities: ['INFO_PROCESSING'],
            specialization: null,
            genomeVersion: 1,
            ancestorGenomeIds: ['ancestor-genome-1'],
            ancestorCellIds: ['ancestor-cell-1']
          }
        }
      ];
      await fs.writeFile(childStorage, JSON.stringify(entries));

      const res = await validateChildIntegrity(childStorage, cellId, 1);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/parentCellId mismatch/i);
    });
  });

  // --------------------------------------------------------------------------
  // 3. COMMITTED RECONSTRUCTION & DUPLICATE EVENT ID REJECTION
  // --------------------------------------------------------------------------
  describe('Mitosis Engine Hardening', () => {
    it('should fail reproduction and not commit if child cell cannot be reconstructed', async () => {
      const parentStorage = path.join(TEST_DIR, 'parent_reconstruct_fail.json');
      const parent = new Cell(parentStorage, 'test-key');
      await parent.start(0);

      const governance = new GovernanceEnforcer({ requireAuthorization: false, cooldownMs: 0, minMemoryPressure: 0.0 });
      const mitosis = new MitosisEngine(governance);

      // Deliberately cause reconstruct failure by corrupting child storage before commit
      const eventId = 'event-fail-reconstruct-1';
      const res = await mitosis.reproduce(parent, {
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'test-key',
        failureInjectionHook: async (stage) => {
          if (stage === 'AFTER_MEMORY_INHERITANCE') {
            const files = await fs.readdir(TEST_DIR);
            const childFile = files.find(f => f.startsWith('cell_') && f.endsWith('.json') && !f.includes('parent'));
            if (childFile) {
              await fs.writeFile(path.join(TEST_DIR, childFile), '{ malformed json: true');
            }
          }
        }
      });

      expect(res.result.success).toBe(false);
      expect(res.child).toBeUndefined();

      // Verify event is not marked COMMITTED
      const eventRecord = await parent.memory.get(`reproduction_event_${eventId}`);
      if (eventRecord && eventRecord.content) {
        expect((eventRecord.content as any).status).not.toBe('COMMITTED');
      }

      await parent.stop();
    });

    it('should reject duplicate reproduction event ID', async () => {
      const parentStorage = path.join(TEST_DIR, 'parent_dup_event.json');
      const parent = new Cell(
        parentStorage,
        'test-key',
        undefined,
        undefined,
        undefined,
        {
          capabilities: ['INFO_PROCESSING', 'KNOWLEDGE_QUERY'],
          specialization: 'generalist'
        }
      );
      await parent.memory.initialize();
      await parent.memory.put({
        id: 'dup-mem-1',
        cellId: parent.nodeId,
        category: MemoryCategory.SEMANTIC,
        content: 'Seed semantic content for mitosis test',
        confidence: 0.9,
        hash: 'hash-dup-1',
        provenance: [parent.nodeId],
        source: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await parent.start();

      const governance = new GovernanceEnforcer({ requireAuthorization: false, cooldownMs: 0, minMemoryPressure: 0.0 });
      const mitosis = new MitosisEngine(governance);
      const eventId = 'unique-event-id-123';

      const firstRun = await mitosis.reproduce(parent, {
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 1,
        openRouterApiKey: 'test-key'
      });
      expect(firstRun.result.success).toBe(true);

      // Re-running with same eventId returns idempotently with identical childCellId without recreating
      const secondRun = await mitosis.reproduce(parent, {
        reproductionSeed: eventId,
        storageBasePath: TEST_DIR,
        currentPopulation: 2,
        openRouterApiKey: 'test-key'
      });

      expect(secondRun.result.childCellId).toBe(firstRun.result.childCellId);

      await parent.stop();
    });
  });

  // --------------------------------------------------------------------------
  // 4. API FAIL-CLOSED & PLACEHOLDER DETECTION
  // --------------------------------------------------------------------------
  describe('API Fail-Closed & Secret Validation', () => {
    it('should identify missing, empty, or placeholder secrets', () => {
      expect(isPlaceholderSecret(undefined)).toBe(true);
      expect(isPlaceholderSecret('')).toBe(true);
      expect(isPlaceholderSecret('default')).toBe(true);
      expect(isPlaceholderSecret('placeholder')).toBe(true);
      expect(isPlaceholderSecret('changeme')).toBe(true);
      expect(isPlaceholderSecret('secret')).toBe(true);
      expect(isPlaceholderSecret('123456')).toBe(true);
      expect(isPlaceholderSecret('short-secret')).toBe(true); // < 16 chars

      // Valid strong secret of >= 16 characters
      expect(isPlaceholderSecret('super_secure_production_secret_998877')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 5. TRUST ANCHOR & AUTHORIZATION HARDENING
  // --------------------------------------------------------------------------
  describe('Trust Anchor Hardening', () => {
    it('should deny reproduction in production if trust anchor is missing', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const enforcer = new GovernanceEnforcer({ requireAuthorization: true });
        const kp = identityCrypto.generateKeyPair();
        const payload = {
          action: 'reproduce',
          subject: 'parent-1',
          eventId: 'event-1',
          exp: Date.now() + 60000,
          issuer: 'attacker'
        };
        const sig = identityCrypto.signData(kp.privateKey, JSON.stringify(payload));
        const proof = {
          payload,
          signature: sig,
          issuerPublicKey: kp.publicKey
        };

        const result = enforcer.verifyAuthorizationProof(proof, 'parent-1', 'event-1');
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/trust anchor/i);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('should deny reproduction if issuer signature is valid but issuer is not in trust anchor', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const trustedKp = identityCrypto.generateKeyPair();
        const untrustedKp = identityCrypto.generateKeyPair();

        const anchor = new StaticTrustAnchor([
          { issuer: 'root-creator', publicKey: trustedKp.publicKey }
        ]);

        const enforcer = new GovernanceEnforcer({ requireAuthorization: true }, anchor);

        // Sign with untrustedKp
        const payload = {
          action: 'reproduce',
          subject: 'parent-1',
          eventId: 'event-1',
          exp: Date.now() + 60000,
          issuer: 'root-creator' // Impersonating issuer name
        };
        const sig = identityCrypto.signData(untrustedKp.privateKey, JSON.stringify(payload));
        const proof = {
          payload,
          signature: sig,
          issuerPublicKey: untrustedKp.publicKey // untrusted public key
        };

        const result = enforcer.verifyAuthorizationProof(proof, 'parent-1', 'event-1');
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/trusted authority/i);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('should accept authorization when signed by verified trust anchor', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const rootKp = identityCrypto.generateKeyPair();
        const anchor = new StaticTrustAnchor([
          { issuer: 'root-authority', publicKey: rootKp.publicKey }
        ]);

        const enforcer = new GovernanceEnforcer({ requireAuthorization: true }, anchor);

        const payload = {
          action: 'reproduce',
          subject: 'parent-1',
          eventId: 'event-1',
          exp: Date.now() + 60000,
          issuer: 'root-authority'
        };
        const sig = identityCrypto.signData(rootKp.privateKey, JSON.stringify(payload));
        const proof = {
          payload,
          signature: sig,
          issuerPublicKey: rootKp.publicKey
        };

        const result = enforcer.verifyAuthorizationProof(proof, 'parent-1', 'event-1');
        expect(result.valid).toBe(true);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });
});
