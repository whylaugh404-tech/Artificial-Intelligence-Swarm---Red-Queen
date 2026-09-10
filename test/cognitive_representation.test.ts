import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import {
  CognitiveGraph,
  CognitiveRepresentationEngine,
  CognitiveRelationPredicate,
  RepresentationVerificationStatus,
  CognitiveConcept,
  CognitiveRelation,
  CognitiveAbstraction,
  CognitiveGeneralization,
  CognitiveAnalogy
} from '../src/redqueen/cognition/representation';
import {
  InformationSourceType,
  MetabolismStatus,
  InformationCategory
} from '../src/redqueen/metabolism';
import { JsonFileMemoryStore } from '../src/redqueen/memory/store';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('P5.1 Cognitive Representation Subsystem', () => {
  const testDir = path.join(process.cwd(), 'data', 'test_cognitive_rep');
  const memoryFile = path.join(testDir, 'memory.json');

  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('CognitiveRepresentationEngine & CognitiveGraph', () => {
    it('extracts concepts, relations, abstractions, and generalizations from structured knowledge', async () => {
      const memoryStore = new JsonFileMemoryStore(memoryFile);
      await memoryStore.initialize();

      const graph = new CognitiveGraph('cell-alpha', memoryStore, {
        maxRepresentationsPerCell: 50,
        maxRelationsPerTransaction: 10
      });

      const engine = new CognitiveRepresentationEngine('cell-alpha', {
        maxConceptsPerTransaction: 10
      });

      const mockKnowledge = {
        knowledgeId: 'know-001',
        title: 'Distributed Consensus and Byzantine Fault Tolerance',
        category: InformationCategory.COMPUTER_SCIENCE,
        confidence: 0.95,
        provenance: ['cell-alpha'],
        extractedData: {
          coreConcepts: ['Consensus', 'Fault Tolerance', 'Quorum'],
          keyPoints: [
            'Consensus requires quorum agreement among Byzantine nodes.',
            'Fault Tolerance enables resilience against network partitions.'
          ],
          lessonsLearned: [
            'Always bound network timeout durations.',
            'Asynchronous networks require randomized leader elections.'
          ]
        },
        implications: ['Increases network partition survivability']
      };

      const result = await engine.extractRepresentations(mockKnowledge as any, undefined, graph);

      expect(result.concepts.length).toBeGreaterThanOrEqual(3);
      expect(result.concepts.map(c => c.canonicalName)).toEqual(
        expect.arrayContaining(['Consensus', 'Fault Tolerance', 'Quorum'])
      );

      // Insert into graph
      for (const concept of result.concepts) {
        await graph.insertConcept(concept);
      }
      for (const relation of result.relations) {
        await graph.insertRelation(relation);
      }
      for (const abs of result.abstractions) {
        await graph.insertAbstraction(abs);
      }
      for (const gen of result.generalizations) {
        await graph.insertGeneralization(gen);
      }

      const allConcepts = graph.getAllConcepts();
      expect(allConcepts.length).toBeGreaterThanOrEqual(3);

      const stats = graph.getStats();
      expect(stats.concepts).toBeGreaterThanOrEqual(3);
      expect(stats.abstractions).toBeGreaterThanOrEqual(1);
    });

    it('enforces cycle-safe bounded graph traversal and non-destructive conflict preservation', async () => {
      const memoryStore = new JsonFileMemoryStore(memoryFile);
      await memoryStore.initialize();
      const graph = new CognitiveGraph('cell-cycle', memoryStore);
      const now = new Date().toISOString();

      const c1: CognitiveConcept = {
        conceptId: 'c1',
        canonicalName: 'Node Alpha',
        category: InformationCategory.NETWORKING,
        description: 'Primary coordinator',
        confidence: 0.9,
        sourceKnowledgeIds: ['k1'],
        sourceExperienceIds: [],
        originatingCellId: 'cell-cycle',
        provenance: ['cell-cycle'],
        verificationStatus: RepresentationVerificationStatus.VERIFIED,
        createdAt: now,
        updatedAt: now,
        version: 1,
        metadata: {}
      };

      const c2: CognitiveConcept = {
        conceptId: 'c2',
        canonicalName: 'Node Beta',
        category: InformationCategory.NETWORKING,
        description: 'Secondary follower',
        confidence: 0.9,
        sourceKnowledgeIds: ['k2'],
        sourceExperienceIds: [],
        originatingCellId: 'cell-cycle',
        provenance: ['cell-cycle'],
        verificationStatus: RepresentationVerificationStatus.VERIFIED,
        createdAt: now,
        updatedAt: now,
        version: 1,
        metadata: {}
      };

      await graph.insertConcept(c1);
      await graph.insertConcept(c2);

      // Create a cycle: c1 -> c2 -> c1
      await graph.insertRelation({
        relationId: 'r1',
        subjectConceptId: 'c1',
        objectConceptId: 'c2',
        predicate: CognitiveRelationPredicate.CAUSES,
        confidence: 0.9,
        provenance: ['cell-cycle'],
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        createdAt: now,
        originatingCellId: 'cell-cycle',
        metadata: {}
      });

      await graph.insertRelation({
        relationId: 'r2',
        subjectConceptId: 'c2',
        objectConceptId: 'c1',
        predicate: CognitiveRelationPredicate.DEPENDS_ON,
        confidence: 0.9,
        provenance: ['cell-cycle'],
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        createdAt: now,
        originatingCellId: 'cell-cycle',
        metadata: {}
      });

      // Traversal must terminate safely without stack overflow or infinite loop
      const traversed = graph.traverse('c1', { maxDepth: 5, timeoutMs: 1000 });
      expect(traversed.length).toBe(2);
      expect(traversed.map(c => c.conceptId)).toContain('c1');
      expect(traversed.map(c => c.conceptId)).toContain('c2');

      // Test non-destructive conflict preservation
      await graph.preserveConflict('c1', 'c2', 'Contradictory state topology detected');
      const conflicts = graph.getAllConflicts();
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].predicate).toBe(CognitiveRelationPredicate.CONTRADICTS);
      expect(conflicts[0].subjectConceptId).toBe('c1');
      expect(conflicts[0].objectConceptId).toBe('c2');
    });

    it('enforces finite budget bounds on representation growth', async () => {
      const memoryStore = new JsonFileMemoryStore(memoryFile);
      await memoryStore.initialize();
      const graph = new CognitiveGraph('cell-budget', memoryStore, {
        maxRepresentationsPerCell: 3
      });
      const now = new Date().toISOString();

      for (let i = 0; i < 3; i++) {
        await graph.insertConcept({
          conceptId: `concept-${i}`,
          canonicalName: `Concept ${i}`,
          category: InformationCategory.PROGRAMMING,
          description: `Description ${i}`,
          confidence: 0.9,
          sourceKnowledgeIds: [`k-${i}`],
          sourceExperienceIds: [],
          originatingCellId: 'cell-budget',
          provenance: ['cell-budget'],
          verificationStatus: RepresentationVerificationStatus.SUPPORTED,
          createdAt: now,
          updatedAt: now,
          version: 1,
          metadata: {}
        });
      }

      // 4th concept must be rejected with budget exceeded error
      await expect(
        graph.insertConcept({
          conceptId: 'concept-overflow',
          canonicalName: 'Concept Overflow',
          category: InformationCategory.PROGRAMMING,
          description: 'Should fail',
          confidence: 0.9,
          sourceKnowledgeIds: ['k-overflow'],
          sourceExperienceIds: [],
          originatingCellId: 'cell-budget',
          provenance: ['cell-budget'],
          verificationStatus: RepresentationVerificationStatus.PENDING,
          createdAt: now,
          updatedAt: now,
          version: 1,
          metadata: {}
        })
      ).rejects.toThrow(/representation budget exceeded/);
    });
  });

  describe('Metabolism Pipeline Stage 12.1 Integration', () => {
    it('automatically derives and indexes cognitive representations upon successful metabolism', async () => {
      const cellMemory = path.join(testDir, 'cell_metabolism_mem.json');
      const cell = new Cell(cellMemory, 'api-key');
      await cell.start();

      const input = {
        sourceType: InformationSourceType.DOCUMENT,
        sourceUri: 'https://redqueen.io/theory-of-computation',
        content: `
# Deterministic Finite Automata
Deterministic Finite Automata (DFA) are state machines with bounded memory.
- State transitions are strictly deterministic given an input symbol.
- Regular languages are recognized by finite automata.
- Minimization of DFA can be accomplished via Hopcroft algorithm.
        `,
        contentType: 'text/markdown'
      };

      const result = await cell.metabolize(input);
      expect(result.status).toBe(MetabolismStatus.ACCEPTED);

      // Verify that CognitiveGraph now contains extracted concepts
      const concepts = cell.cognitiveGraph.getAllConcepts();
      expect(concepts.length).toBeGreaterThan(0);

      // Verify CognitiveState contains concept references
      const state = cell.cognitiveState.getState();
      expect(state.conceptReferences.length).toBeGreaterThan(0);

      // Verify cell status includes cognitive graph metrics
      const status = cell.getStatus();
      expect(status.cognitiveGraph.conceptsCount).toBeGreaterThan(0);

      await cell.stop();
    });
  });

  describe('P2P Cognitive Representation Exchange', () => {
    it('handles safe representation assimilation between peers with provenance and verification bounds', async () => {
      const cell1Dir = path.join(testDir, 'cell1');
      const cell2Dir = path.join(testDir, 'cell2');
      await fs.mkdir(cell1Dir, { recursive: true });
      await fs.mkdir(cell2Dir, { recursive: true });

      const cell1 = new Cell(path.join(cell1Dir, 'mem.json'), 'api-key');
      const cell2 = new Cell(path.join(cell2Dir, 'mem.json'), 'api-key');
      await cell1.start();
      await cell2.start();

      const now = new Date().toISOString();

      // Seed cell1 with a concept
      const cAlpha: CognitiveConcept = {
        conceptId: 'conc-alpha',
        canonicalName: 'Quantum Cryptography',
        category: InformationCategory.CYBERSECURITY,
        description: 'Physics-based secure communication protocol',
        confidence: 0.95,
        sourceKnowledgeIds: ['k-qc'],
        sourceExperienceIds: [],
        originatingCellId: cell1.nodeId,
        provenance: [cell1.nodeId],
        verificationStatus: RepresentationVerificationStatus.VERIFIED,
        createdAt: now,
        updatedAt: now,
        version: 1,
        metadata: {}
      };

      await cell1.cognitiveGraph.insertConcept(cAlpha);

      // Simulate cell2 assimilating representation payload from cell1
      const assimilationResult = await cell2.exchange.assimilateRepresentation({
        concepts: [cAlpha],
        abstractions: [{
          abstractionId: 'abs-1',
          sourceConceptIds: ['conc-alpha'],
          generalizedPattern: 'Protocols preserving secrecy against computational adversaries',
          retainedStructure: { protocol: 'quantum_key_distribution' },
          discardedDetails: ['specific hardware implementation'],
          confidence: 0.92,
          provenance: [cell1.nodeId],
          originatingCellId: cell1.nodeId,
          verificationStatus: RepresentationVerificationStatus.VERIFIED,
          version: 1,
          createdAt: now
        }]
      }, cell1.nodeId);

      expect(assimilationResult.accepted).toBe(2);
      expect(assimilationResult.rejected).toBe(0);

      // Verify cell2 now has the concept with updated provenance and non-blindly-verified status
      const cell2Concept = cell2.cognitiveGraph.getConcept('conc-alpha');
      expect(cell2Concept).toBeDefined();
      expect(cell2Concept!.provenance).toContain(cell1.nodeId);
      expect(cell2Concept!.provenance).toContain(cell2.nodeId);
      // External representations are capped at SUPPORTED verification (never pre-verified blindly)
      expect(cell2Concept!.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);

      await cell1.stop();
      await cell2.stop();
    });
  });
});
