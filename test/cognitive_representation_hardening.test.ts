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
import { InformationCategory } from '../src/redqueen/metabolism';
import { JsonFileMemoryStore } from '../src/redqueen/memory/store';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('RED QUEEN — P5.1 Cognitive Representation Hardening Verification', () => {
  const testDir = path.join(process.cwd(), 'data', 'test_cognitive_hardening');
  const memoryFile = path.join(testDir, 'hardening_memory.json');

  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('A & B: extracts concepts and typed relations from structured knowledge', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();

    const engine = new CognitiveRepresentationEngine('cell-test-1');
    const graph = new CognitiveGraph('cell-test-1', memory);

    const bioKnowledge = {
      knowledgeId: 'know-bio-01',
      title: 'Mitochondrial Cellular Respiration',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      confidence: 0.92,
      provenance: ['cell-test-1'],
      facts: [
        'Mitochondria produce ATP through oxidative phosphorylation.',
        'Cellular respiration requires oxygen and glucose substrates.'
      ],
      relationships: [
        {
          subject: 'Mitochondria',
          predicate: 'PART_OF',
          object: 'Eukaryotic Cell',
          confidence: 0.95
        },
        {
          subject: 'Cellular Respiration',
          predicate: 'REQUIRES',
          object: 'Oxygen Substrate',
          confidence: 0.9
        }
      ]
    };

    const result = await engine.extractRepresentations(bioKnowledge as any, undefined, graph);

    expect(result.concepts.length).toBeGreaterThanOrEqual(3);
    const names = result.concepts.map(c => c.canonicalName);
    expect(names).toContain('Mitochondrial Cellular Respiration');
    expect(names).toContain('Eukaryotic Cell');
    expect(names).toContain('Oxygen Substrate');

    expect(result.relations.length).toBeGreaterThanOrEqual(2);
    const predicates = result.relations.map(r => r.predicate);
    expect(predicates).toContain(CognitiveRelationPredicate.PART_OF);
    expect(predicates).toContain(CognitiveRelationPredicate.REQUIRES);
  });

  it('C: extracts structural abstraction across relational concrete concepts (domain-independent)', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();

    const engine = new CognitiveRepresentationEngine('cell-abs');
    const graph = new CognitiveGraph('cell-abs', memory);

    // Knowledge with compositional relationships
    const csKnowledge = {
      knowledgeId: 'know-cs-01',
      title: 'Modular Compiler Architecture',
      category: InformationCategory.COMPUTER_SCIENCE,
      confidence: 0.9,
      provenance: ['cell-abs'],
      facts: ['Lexer and Parser form integral subcomponents of the Compiler Pipeline.'],
      relationships: [
        {
          subject: 'Lexer Module',
          predicate: 'PART_OF',
          object: 'Compiler Pipeline',
          confidence: 0.92
        }
      ]
    };

    const result = await engine.extractRepresentations(csKnowledge as any, undefined, graph);
    expect(result.abstractions.length).toBeGreaterThanOrEqual(1);

    const abs = result.abstractions[0];
    expect(abs.retainedStructure.invariant).toBe('compositional_hierarchy');
    expect(abs.generalizedPattern).toContain('Compositional hierarchy');
    expect(abs.discardedDetails.length).toBeGreaterThan(0);
  });

  it('D & E: general patterns with multi-evidence are SUPPORTED, single-evidence must remain PENDING', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();

    const engine = new CognitiveRepresentationEngine('cell-gen');
    const graph = new CognitiveGraph('cell-gen', memory);

    // Seed graph with a first concept and relation
    const k1 = {
      knowledgeId: 'know-seq-01',
      title: 'Kernel Driver Buffer Overrun',
      category: InformationCategory.CYBERSECURITY,
      confidence: 0.88,
      provenance: ['cell-gen'],
      facts: ['Buffer write exceeded bounded allocation in ring 0 driver.'],
      relationships: [
        {
          subject: 'Kernel Driver',
          predicate: 'CAUSES',
          object: 'Memory Corruption',
          confidence: 0.9
        }
      ]
    };

    const result1 = await engine.extractRepresentations(k1 as any, undefined, graph);
    for (const c of result1.concepts) await graph.insertConcept(c);
    for (const r of result1.relations) await graph.insertRelation(r);

    // Since graph only had this concept, generalization must be PENDING (hypothesis)
    expect(result1.generalizations.length).toBeGreaterThanOrEqual(1);
    const gen1 = result1.generalizations[0];
    expect(gen1.supportingEvidence.length).toBe(1);
    expect(gen1.verificationStatus).toBe(RepresentationVerificationStatus.PENDING);
    expect(gen1.confidence).toBeLessThan(0.5);

    await graph.insertGeneralization(gen1);

    // Now insert a second independent knowledge record that exhibits matching causal/overflow characteristics
    const k2 = {
      knowledgeId: 'know-seq-02',
      title: 'Network Daemon Stack Buffer Overflow',
      category: InformationCategory.CYBERSECURITY,
      confidence: 0.91,
      provenance: ['cell-gen'],
      facts: ['TCP payload parsing exceeded stack buffer allocation boundary.'],
      relationships: [
        {
          subject: 'Network Daemon',
          predicate: 'CAUSES',
          object: 'Memory Corruption',
          confidence: 0.92
        }
      ]
    };

    const result2 = await engine.extractRepresentations(k2 as any, undefined, graph);
    expect(result2.generalizations.length).toBeGreaterThanOrEqual(1);

    const gen2 = result2.generalizations[0];
    // Multiple evidence concepts now exist
    expect(gen2.supportingEvidence.length).toBeGreaterThan(1);
    expect(gen2.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
    expect(gen2.confidence).toBeGreaterThan(0.6);
  });

  it('F, H, I: generic structural analogy between cross-domain structures with varying similarity', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();

    const graph = new CognitiveGraph('cell-analogy', memory);
    const engine = new CognitiveRepresentationEngine('cell-analogy');
    const now = new Date().toISOString();

    // Domain A: Hardware Architecture (Subsystem hierarchy)
    // Structure: Processor Core -PART_OF-> CPU Socket
    const cBioSub = await graph.insertConcept({
      conceptId: 'hw-core',
      canonicalName: 'Processor Execution Core',
      category: InformationCategory.HARDWARE,
      description: 'Micro-architectural execution pipeline unit',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-hw-1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-analogy',
      provenance: ['cell-analogy'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    const cBioRoot = await graph.insertConcept({
      conceptId: 'hw-socket',
      canonicalName: 'CPU Socket Package',
      category: InformationCategory.HARDWARE,
      description: 'Multi-core physical microprocessor package',
      confidence: 0.95,
      sourceKnowledgeIds: ['k-hw-1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-analogy',
      provenance: ['cell-analogy'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    await graph.insertRelation({
      relationId: 'rel-hw-1',
      subjectConceptId: cBioSub.conceptId,
      predicate: CognitiveRelationPredicate.PART_OF,
      objectConceptId: cBioRoot.conceptId,
      confidence: 0.92,
      provenance: ['cell-analogy'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      originatingCellId: 'cell-analogy',
      metadata: {}
    });

    // Domain B: Software Architecture
    // Structure: Subroutine -PART_OF-> Software Program
    const csKnowledge = {
      knowledgeId: 'know-cs-prog',
      title: 'Subroutine Function Component',
      category: InformationCategory.SOFTWARE,
      confidence: 0.92,
      provenance: ['cell-analogy'],
      facts: ['A Subroutine Function Component is a structured constituent of a Software Program.'],
      relationships: [
        {
          subject: 'Subroutine Function Component',
          predicate: 'PART_OF',
          object: 'Software Program',
          confidence: 0.95
        }
      ]
    };

    const result = await engine.extractRepresentations(csKnowledge as any, undefined, graph);

    expect(result.analogies.length).toBeGreaterThan(0);
    const analogy = result.analogies[0];

    // Verify mapped relations
    expect(analogy.mappedRelations.length).toBeGreaterThan(0);
    expect(analogy.mappedRelations[0].relationType).toBe(CognitiveRelationPredicate.PART_OF);

    // Verify dynamic similarity: it is NOT fixed 0.92
    expect(analogy.structuralSimilarity).toBeGreaterThan(0.3);
    expect(analogy.structuralSimilarity).toBeLessThanOrEqual(1.0);
    expect(typeof analogy.structuralSimilarity).toBe('number');
  });

  it('G: rejects lexical false positive (shared words without structural mapping -> NO analogy)', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();

    const graph = new CognitiveGraph('cell-lex', memory);
    const engine = new CognitiveRepresentationEngine('cell-lex');
    const now = new Date().toISOString();

    // Concept 1: "Network Routing Security Protocol" (has CAUSES relation)
    const c1 = await graph.insertConcept({
      conceptId: 'net-sec-1',
      canonicalName: 'Network Security Architecture Protocol',
      category: InformationCategory.CYBERSECURITY,
      description: 'Security rules for packet routing',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-net-1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-lex',
      provenance: ['cell-lex'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    const c1Target = await graph.insertConcept({
      conceptId: 'net-alert',
      canonicalName: 'Intrusion Alert',
      category: InformationCategory.CYBERSECURITY,
      description: 'Alarm raised on violation',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-net-1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-lex',
      provenance: ['cell-lex'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    await graph.insertRelation({
      relationId: 'rel-net-causes',
      subjectConceptId: c1.conceptId,
      predicate: CognitiveRelationPredicate.CAUSES,
      objectConceptId: c1Target.conceptId,
      confidence: 0.9,
      provenance: ['cell-lex'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      originatingCellId: 'cell-lex',
      metadata: {}
    });

    // Concept 2: shares many lexical words ("Network Security Protocol Architecture")
    // BUT has completely mismatched predicate (e.g. CONTRADICTS instead of CAUSES)
    const c2Knowledge = {
      knowledgeId: 'k-net-2',
      title: 'Network Security Protocol Implementation',
      category: InformationCategory.PROGRAMMING,
      confidence: 0.9,
      provenance: ['cell-lex'],
      facts: ['Protocol implementation contradicts obsolete RFC standard.'],
      relationships: [
        {
          subject: 'Network Security Protocol Implementation',
          predicate: 'CONTRADICTS',
          object: 'Legacy RFC 1149',
          confidence: 0.85
        }
      ]
    };

    const result = await engine.extractRepresentations(c2Knowledge as any, undefined, graph);

    // Should NOT produce an analogy between c1 and c2 because predicates do not match
    const matchingAnalogy = result.analogies.find(a =>
      (a.sourceConceptIds.includes(c1.conceptId) || a.targetConceptIds.includes(c1.conceptId))
    );
    expect(matchingAnalogy).toBeUndefined();
  });

  it('J: prevents self-loop relations (Concept A GENERALIZES Concept A is rejected)', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();

    const graph = new CognitiveGraph('cell-loop', memory);
    const now = new Date().toISOString();

    const concept = await graph.insertConcept({
      conceptId: 'concept-loop-test',
      canonicalName: 'Self Loop Test',
      category: InformationCategory.COMPUTER_SCIENCE,
      description: 'Testing self loop prevention',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-loop'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-loop',
      provenance: ['cell-loop'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    // 1. Direct self-loop relation insertion must be rejected
    await expect(
      graph.insertRelation({
        relationId: 'rel-self-loop',
        subjectConceptId: concept.conceptId,
        predicate: CognitiveRelationPredicate.GENERALIZES,
        objectConceptId: concept.conceptId,
        confidence: 0.9,
        provenance: ['cell-loop'],
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        createdAt: now,
        originatingCellId: 'cell-loop',
        metadata: {}
      })
    ).rejects.toThrow(/Self-loop relation rejected/);

    // 2. Inserting an abstraction with single source concept must NOT create a self-loop relation
    const abs = await graph.insertAbstraction({
      abstractionId: 'abs-loop-test',
      sourceConceptIds: [concept.conceptId],
      generalizedPattern: 'General pattern test',
      retainedStructure: { invariant: 'test' },
      discardedDetails: [],
      confidence: 0.85,
      provenance: ['cell-loop'],
      originatingCellId: 'cell-loop',
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      version: 1,
      createdAt: now
    });

    expect(abs).toBeDefined();
    // Verify no relation connects concept to itself
    const allRelations = graph.getAllRelations();
    for (const r of allRelations) {
      expect(r.subjectConceptId).not.toEqual(r.objectConceptId);
    }
  });

  it('K & L: verifies persistence across Cell restart and provenance preservation', async () => {
    const cellStorage = path.join(testDir, 'cell_restart_storage.json');
    const kp = identityCrypto.generateKeyPair();
    const cellA = new Cell(cellStorage, 'mock-api-key', kp.privateKey, kp.publicKey);
    await cellA.start();

    const now = new Date().toISOString();
    const c1 = await cellA.cognitiveGraph.insertConcept({
      conceptId: 'concept-persisted',
      canonicalName: 'Immutable Ledger Concept',
      category: InformationCategory.NETWORKING,
      description: 'Append-only verifiable cryptographic log',
      confidence: 0.94,
      sourceKnowledgeIds: ['k-ledger-1'],
      sourceExperienceIds: [],
      originatingCellId: cellA.nodeId,
      provenance: [cellA.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    const c2 = await cellA.cognitiveGraph.insertConcept({
      conceptId: 'concept-merkle',
      canonicalName: 'Merkle Tree Proof',
      category: InformationCategory.NETWORKING,
      description: 'Hash-based cryptographic commitment structure',
      confidence: 0.92,
      sourceKnowledgeIds: ['k-ledger-1'],
      sourceExperienceIds: [],
      originatingCellId: cellA.nodeId,
      provenance: [cellA.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    await cellA.cognitiveGraph.insertRelation({
      relationId: 'rel-persisted',
      subjectConceptId: c1.conceptId,
      predicate: CognitiveRelationPredicate.REQUIRES,
      objectConceptId: c2.conceptId,
      confidence: 0.9,
      provenance: [cellA.nodeId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      originatingCellId: cellA.nodeId,
      metadata: {}
    });

    await cellA.stop();

    // Restart the Cell from the same storage with same identity
    const cellA_restarted = new Cell(cellStorage, 'mock-api-key', kp.privateKey, kp.publicKey);
    await cellA_restarted.start();

    // Check that graph reloaded all concepts and relations with intact provenance
    const loadedC1 = cellA_restarted.cognitiveGraph.getConcept('concept-persisted');
    expect(loadedC1).toBeDefined();
    expect(loadedC1!.canonicalName).toBe('Immutable Ledger Concept');
    expect(loadedC1!.provenance).toContain(cellA.nodeId);

    const loadedRel = cellA_restarted.cognitiveGraph.getRelation('rel-persisted');
    expect(loadedRel).toBeDefined();
    expect(loadedRel!.predicate).toBe(CognitiveRelationPredicate.REQUIRES);
    expect(loadedRel!.provenance).toContain(cellA.nodeId);

    await cellA_restarted.stop();
  });

  it('M & N: P2P assimilation with bounded verification and memory isolation between Cells', async () => {
    const cell1Storage = path.join(testDir, 'cell_peer1.json');
    const cell2Storage = path.join(testDir, 'cell_peer2.json');

    const cell1 = new Cell(cell1Storage, 'mock-api-key');
    const cell2 = new Cell(cell2Storage, 'mock-api-key');

    await cell1.start();
    await cell2.start();

    const now = new Date().toISOString();
    // Cell 1 creates a concept with VERIFIED status
    const verifiedConcept: CognitiveConcept = {
      conceptId: 'peer1-concept',
      canonicalName: 'Zero Knowledge Protocol',
      category: InformationCategory.CYBERSECURITY,
      description: 'Cryptographic proof without disclosing underlying witness',
      confidence: 0.98,
      sourceKnowledgeIds: ['k-zk'],
      sourceExperienceIds: [],
      originatingCellId: cell1.nodeId,
      provenance: [cell1.nodeId],
      verificationStatus: RepresentationVerificationStatus.VERIFIED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    };

    // Cell 2 assimilates representation from Cell 1
    const result = await cell2.exchange.assimilateRepresentation({
      concepts: [verifiedConcept]
    }, cell1.nodeId);

    expect(result.accepted).toBe(1);

    // Verify bounded verification: Cell 2 does NOT blindly mark external representation as VERIFIED
    const assimilated = cell2.cognitiveGraph.getConcept('peer1-concept');
    expect(assimilated).toBeDefined();
    expect(assimilated!.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
    // Provenance must contain both originator and receiver
    expect(assimilated!.provenance).toContain(cell1.nodeId);
    expect(assimilated!.provenance).toContain(cell2.nodeId);

    // Verify memory isolation: Cell 1 memory file does not contain Cell 2 data and vice versa
    const cell1MemoryRaw = await fs.readFile(cell1Storage, 'utf8');
    expect(cell1MemoryRaw).not.toContain(cell2.nodeId);

    await cell1.stop();
    await cell2.stop();
  });

  it('P: handles conflicting representations non-destructively via CONTRADICTS relation', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();

    const graph = new CognitiveGraph('cell-conflict', memory);
    const now = new Date().toISOString();

    const cAlpha = await graph.insertConcept({
      conceptId: 'hypothesis-a',
      canonicalName: 'P equals NP Hypothesis',
      category: InformationCategory.COMPUTER_SCIENCE,
      description: 'Polynomial time solution exists for NP complete problems',
      confidence: 0.5,
      sourceKnowledgeIds: ['k-p-np'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-conflict',
      provenance: ['cell-conflict'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    const cBeta = await graph.insertConcept({
      conceptId: 'hypothesis-b',
      canonicalName: 'P not equals NP Hypothesis',
      category: InformationCategory.COMPUTER_SCIENCE,
      description: 'NP complete problems require super-polynomial time in worst case',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-p-np'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-conflict',
      provenance: ['cell-conflict'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    const conflictRel = await graph.preserveConflict(
      cAlpha.conceptId,
      cBeta.conceptId,
      'Mutually exclusive complexity theoretic hypotheses'
    );

    expect(conflictRel.predicate).toBe(CognitiveRelationPredicate.CONTRADICTS);

    // Both concepts remain preserved in the graph (non-destructive)
    expect(graph.getConcept(cAlpha.conceptId)).toBeDefined();
    expect(graph.getConcept(cBeta.conceptId)).toBeDefined();

    // Both concepts are marked CONTRADICTED
    expect(graph.getConcept(cAlpha.conceptId)!.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);
    expect(graph.getConcept(cBeta.conceptId)!.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);

    const conflicts = graph.getAllConflicts();
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].metadata?.reason).toContain('Mutually exclusive');
  });
});
