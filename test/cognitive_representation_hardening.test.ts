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

  it('Negative Test 1: same category alone does NOT create multi-evidence generalization', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();

    const graph = new CognitiveGraph('cell-cat-neg', memory);
    const engine = new CognitiveRepresentationEngine('cell-cat-neg');
    const now = new Date().toISOString();

    // Insert Concept A in CYBERSECURITY, with no overlapping structural pattern or relations
    await graph.insertConcept({
      conceptId: 'sec-concept-1',
      canonicalName: 'Firewall Packet Filter',
      category: InformationCategory.CYBERSECURITY,
      description: 'Network packet filtering ruleset',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-sec-1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-cat-neg',
      provenance: ['cell-cat-neg'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    // Extract representations for a second CYBERSECURITY concept that has NO structural overlap
    const k2 = {
      knowledgeId: 'k-sec-2',
      title: 'Password Hash Salting Scheme',
      category: InformationCategory.CYBERSECURITY,
      confidence: 0.85,
      provenance: ['cell-cat-neg'],
      facts: ['Salting prevents rainbow table attacks on stored password hashes.'],
      relationships: []
    };

    const result = await engine.extractRepresentations(k2 as any, undefined, graph);

    // If a generalization is formed, it must ONLY be supported by itself (single evidence -> PENDING),
    // NOT reinforced by sec-concept-1 merely because both are in CYBERSECURITY category!
    for (const gen of result.generalizations) {
      expect(gen.supportingEvidence).not.toContain('sec-concept-1');
      expect(gen.verificationStatus).toBe(RepresentationVerificationStatus.PENDING);
    }
  });

  it('Negative Test 5: isolated concepts with no relation structure produce NO analogy', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();

    const graph = new CognitiveGraph('cell-no-rel', memory);
    const engine = new CognitiveRepresentationEngine('cell-no-rel');
    const now = new Date().toISOString();

    // Isolated concept in Domain A without relations
    await graph.insertConcept({
      conceptId: 'isolated-a',
      canonicalName: 'Quantum Entangled Particle',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      description: 'Isolated physical particle with no recorded graph relations',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-q-1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-no-rel',
      provenance: ['cell-no-rel'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    // Isolated concept in Domain B without relations
    const kIsoB = {
      knowledgeId: 'k-iso-b',
      title: 'Monolithic Mainframe System',
      category: InformationCategory.HARDWARE,
      confidence: 0.9,
      provenance: ['cell-no-rel'],
      facts: ['Isolated hardware entity with no relational dependencies.'],
      relationships: []
    };

    const result = await engine.extractRepresentations(kIsoB as any, undefined, graph);

    // Without relational structure, no analogy must be formed
    expect(result.analogies.length).toBe(0);
  });

  it('Positive Test 6: enforces representation budget limits and resource safety', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();

    // Graph with strict budget cap of 3 concepts
    const boundedGraph = new CognitiveGraph('cell-budget', memory, {
      maxRepresentationsPerCell: 3
    });
    const now = new Date().toISOString();

    for (let i = 1; i <= 3; i++) {
      await boundedGraph.insertConcept({
        conceptId: `budget-concept-${i}`,
        canonicalName: `Bounded Concept ${i}`,
        category: InformationCategory.SOFTWARE,
        description: `Concept item ${i}`,
        confidence: 0.8,
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

    // 4th insertion must fail with budget exceeded error
    await expect(
      boundedGraph.insertConcept({
        conceptId: 'budget-concept-4',
        canonicalName: 'Bounded Concept 4',
        category: InformationCategory.SOFTWARE,
        description: 'Concept item 4',
        confidence: 0.8,
        sourceKnowledgeIds: ['k-4'],
        sourceExperienceIds: [],
        originatingCellId: 'cell-budget',
        provenance: ['cell-budget'],
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        createdAt: now,
        updatedAt: now,
        version: 1,
        metadata: {}
      })
    ).rejects.toThrow(/budget exceeded/);
  });

  /* =========================================================================
   * ENFORCED HARDENING SUITE: A1-A4, G1-G5, N1-N5, C1-C2
   * ========================================================================= */

  it('Test A1: Abstraction derivation from multiple concrete structures produces SUPPORTED', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-a1', memory);
    const engine = new CognitiveRepresentationEngine('cell-a1');
    const now = new Date().toISOString();

    // 1. Concrete structure 1: ALU PART_OF Processor Unit
    await graph.insertConcept({
      conceptId: 'c-proc-unit',
      canonicalName: 'Processor Unit',
      category: InformationCategory.HARDWARE,
      description: 'Computing unit architecture',
      confidence: 0.9,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-a1',
      provenance: ['cell-a1'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    await graph.insertConcept({
      conceptId: 'c-alu-core',
      canonicalName: 'Arithmetic Logic Unit',
      category: InformationCategory.HARDWARE,
      description: 'Arithmetic calculation sub-unit',
      confidence: 0.9,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-a1',
      provenance: ['cell-a1'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    await graph.insertRelation({
      relationId: 'rel-alu-part',
      subjectConceptId: 'c-alu-core',
      predicate: CognitiveRelationPredicate.PART_OF,
      objectConceptId: 'c-proc-unit',
      confidence: 0.9,
      provenance: ['cell-a1'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      originatingCellId: 'cell-a1',
      metadata: {}
    });

    // 2. Concrete structure 2: Cache L1 PART_OF Memory Hierarchy
    const kComp = {
      knowledgeId: 'k-comp-core',
      category: InformationCategory.HARDWARE,
      title: 'Processor Microarchitecture',
      summary: 'L1 Cache is part of Memory Hierarchy',
      facts: ['L1 Cache is part of Memory Hierarchy'],
      relationships: [
        {
          subject: 'L1 Cache',
          predicate: 'PART_OF',
          object: 'Memory Hierarchy',
          confidence: 0.88
        }
      ],
      confidence: 0.88,
      source: 'hardware_docs',
      timestamp: now,
      hash: 'h_comp_part',
      originatingCellId: 'cell-a1'
    };

    const res = await engine.extractRepresentations(kComp as any, undefined, graph);
    expect(res.abstractions.length).toBeGreaterThan(0);
    const abs = res.abstractions[0];
    // Both structures should be recognized as source evidence
    expect(abs.sourceConceptIds.length).toBeGreaterThanOrEqual(2);
    expect(abs.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
    expect(abs.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('Test A2: Single isolated fact produces NO strong abstraction (empty or PENDING)', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-a2', memory);
    const engine = new CognitiveRepresentationEngine('cell-a2');
    const now = new Date().toISOString();

    const isolatedFact = {
      knowledgeId: 'k-iso-fact',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      title: 'Ambient Temperature Measurement',
      summary: 'The ambient temperature was measured at 24 degrees Celsius',
      facts: ['The ambient temperature was measured at 24 degrees Celsius'],
      confidence: 0.9,
      source: 'sensor',
      timestamp: now,
      hash: 'h_temp',
      originatingCellId: 'cell-a2'
    };

    const res = await engine.extractRepresentations(isolatedFact as any, undefined, graph);
    // Without structural relations, no strong abstraction is produced
    expect(res.abstractions.length).toBe(0);
  });

  it('Test A3: Keyword similarity alone produces NO abstraction', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-a3', memory);
    const engine = new CognitiveRepresentationEngine('cell-a3');
    const now = new Date().toISOString();

    // Text containing keywords ('consensus', 'byzantine', 'injection', 'overflow') but NO relational structure
    const keywordFact = {
      knowledgeId: 'k-keyword-fact',
      category: InformationCategory.CYBERSECURITY,
      title: 'Buzzword Discussion',
      summary: 'Discussion mentioning distributed consensus and buffer overflow and untrusted input boundary',
      facts: ['Mentions consensus and injection without defining relational entities'],
      confidence: 0.8,
      source: 'chat_log',
      timestamp: now,
      hash: 'h_buzz',
      originatingCellId: 'cell-a3'
    };

    const res = await engine.extractRepresentations(keywordFact as any, undefined, graph);
    // Crucial requirement: keyword matches alone NEVER produce abstractions!
    expect(res.abstractions.length).toBe(0);
  });

  it('Test A4: Self-abstraction is rejected (self-referential or pattern matching concept)', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-a4', memory);
    const now = new Date().toISOString();

    await graph.insertConcept({
      conceptId: 'concept-auth',
      canonicalName: 'User Authentication',
      category: InformationCategory.CYBERSECURITY,
      description: 'Principal identification mechanism',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-auth'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-a4',
      provenance: ['cell-a4'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    // 1. Rejection: abstractionId equals sourceConceptId
    await expect(
      graph.insertAbstraction({
        abstractionId: 'concept-auth',
        sourceConceptIds: ['concept-auth'],
        generalizedPattern: 'General Access Control',
        retainedStructure: {},
        discardedDetails: [],
        confidence: 0.8,
        provenance: ['cell-a4'],
        originatingCellId: 'cell-a4',
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        version: 1,
        createdAt: now
      })
    ).rejects.toThrow(/Self-abstraction rejected/);

    // 2. Rejection: pattern matches concept canonicalName verbatim
    await expect(
      graph.insertAbstraction({
        abstractionId: 'abs-trivial-self',
        sourceConceptIds: ['concept-auth'],
        generalizedPattern: 'User Authentication',
        retainedStructure: {},
        discardedDetails: [],
        confidence: 0.8,
        provenance: ['cell-a4'],
        originatingCellId: 'cell-a4',
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        version: 1,
        createdAt: now
      })
    ).rejects.toThrow(/Self-abstraction rejected/);
  });

  it('Test G1: Generalization with multiple supporting structures produces SUPPORTED', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-g1', memory);
    const engine = new CognitiveRepresentationEngine('cell-g1');
    const now = new Date().toISOString();

    // Concept 1 with CAUSES relation
    await graph.insertConcept({
      conceptId: 'c-toxin',
      canonicalName: 'Power Surge',
      category: InformationCategory.HARDWARE,
      description: 'Voltage irregularity',
      confidence: 0.9,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-g1',
      provenance: ['cell-g1'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    await graph.insertConcept({
      conceptId: 'c-cell-lysis',
      canonicalName: 'Hardware Failure',
      category: InformationCategory.HARDWARE,
      description: 'Systemic degradation and shutdown',
      confidence: 0.9,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-g1',
      provenance: ['cell-g1'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    await graph.insertRelation({
      relationId: 'rel-toxin-lysis',
      subjectConceptId: 'c-toxin',
      predicate: CognitiveRelationPredicate.CAUSES,
      objectConceptId: 'c-cell-lysis',
      confidence: 0.9,
      provenance: ['cell-g1'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      originatingCellId: 'cell-g1',
      metadata: {}
    });

    // Knowledge with second CAUSES relation
    const kExploit = {
      knowledgeId: 'k-exp-causes',
      category: InformationCategory.CYBERSECURITY,
      title: 'Exploit Causal Mechanism',
      summary: 'Buffer Overflow causes System Crash',
      facts: ['Buffer Overflow causes System Crash'],
      relationships: [
        {
          subject: 'Buffer Overflow',
          predicate: 'CAUSES',
          object: 'System Crash',
          confidence: 0.9
        }
      ],
      confidence: 0.9,
      source: 'vuln_report',
      timestamp: now,
      hash: 'h_exp_causes',
      originatingCellId: 'cell-g1'
    };

    const res = await engine.extractRepresentations(kExploit as any, undefined, graph);
    expect(res.generalizations.length).toBeGreaterThan(0);
    const gen = res.generalizations[0];
    expect(gen.supportingEvidence.length).toBeGreaterThanOrEqual(2);
    expect(gen.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
    expect(gen.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('Test G2: Same category alone does NOT produce multi-evidence generalization', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-g2', memory);
    const engine = new CognitiveRepresentationEngine('cell-g2');
    const now = new Date().toISOString();

    // Concept A in CYBERSECURITY with no relations
    await graph.insertConcept({
      conceptId: 'sec-static-1',
      canonicalName: 'Security Header CSP',
      category: InformationCategory.CYBERSECURITY,
      description: 'Content Security Policy definition',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-csp'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-g2',
      provenance: ['cell-g2'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    // Knowledge in same category CYBERSECURITY without structural topological overlap
    const kSec2 = {
      knowledgeId: 'k-sec-plain',
      category: InformationCategory.CYBERSECURITY,
      title: 'Penetration Testing Scope',
      summary: 'Penetration test scope definition document',
      facts: ['Penetration test scope definition document'],
      confidence: 0.85,
      source: 'audit',
      timestamp: now,
      hash: 'h_audit',
      originatingCellId: 'cell-g2'
    };

    const res = await engine.extractRepresentations(kSec2 as any, undefined, graph);
    // Should NOT produce any multi-evidence generalization simply due to category matching
    const multiEv = res.generalizations.filter(g => g.supportingEvidence.length > 1);
    expect(multiEv.length).toBe(0);
  });

  it('Test G3: Single shared predicate alone with incompatible topology does NOT produce generalization', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-g3', memory);
    const engine = new CognitiveRepresentationEngine('cell-g3');
    const now = new Date().toISOString();

    // High degree node with many complex relations
    await graph.insertConcept({
      conceptId: 'c-complex-hub',
      canonicalName: 'Distributed Consensus Coordinator',
      category: InformationCategory.NETWORKING,
      description: 'Multi-role hub coordinator',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-hub'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-g3',
      provenance: ['cell-g3'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    // 4 different relations on c-complex-hub
    for (let i = 1; i <= 4; i++) {
      const targetId = `c-target-${i}`;
      await graph.insertConcept({
        conceptId: targetId,
        canonicalName: `Target Entity ${i}`,
        category: InformationCategory.SOFTWARE,
        description: `Target ${i}`,
        confidence: 0.8,
        sourceKnowledgeIds: ['k-hub'],
        sourceExperienceIds: [],
        originatingCellId: 'cell-g3',
        provenance: ['cell-g3'],
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        createdAt: now,
        updatedAt: now,
        version: 1,
        metadata: {}
      });
      await graph.insertRelation({
        relationId: `rel-hub-${i}`,
        subjectConceptId: 'c-complex-hub',
        predicate: i === 1 ? CognitiveRelationPredicate.CAUSES : CognitiveRelationPredicate.DEPENDS_ON,
        objectConceptId: targetId,
        confidence: 0.9,
        provenance: ['cell-g3'],
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        createdAt: now,
        originatingCellId: 'cell-g3',
        metadata: {}
      });
    }

    // Now present a simple linear 1-relation concept with CAUSES
    // Due to topological difference (1 relation vs 4 relations of mixed predicates),
    // structural signature similarity is low (< 0.5)
    const kLinear = {
      knowledgeId: 'k-linear',
      category: InformationCategory.HARDWARE,
      title: 'Linear Impact',
      summary: 'Friction causes Heat',
      facts: ['Friction causes Heat'],
      relationships: [
        {
          subject: 'Friction',
          predicate: 'CAUSES',
          object: 'Heat',
          confidence: 0.9
        }
      ],
      confidence: 0.9,
      source: 'physics_lab',
      timestamp: now,
      hash: 'h_fric',
      originatingCellId: 'cell-g3'
    };

    const res = await engine.extractRepresentations(kLinear as any, undefined, graph);
    // Should NOT falsely adopt c-complex-hub as supporting evidence
    for (const gen of res.generalizations) {
      expect(gen.supportingEvidence).not.toContain('c-complex-hub');
    }
  });

  it('Test G4: Structural compatibility required for generalization', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-g4', memory);
    const engine = new CognitiveRepresentationEngine('cell-g4');
    const now = new Date().toISOString();

    // S1: A REQUIRES B
    await graph.insertConcept({
      conceptId: 'sys-a',
      canonicalName: 'Service Authentication',
      category: InformationCategory.CYBERSECURITY,
      description: 'Auth service',
      confidence: 0.9,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-g4',
      provenance: ['cell-g4'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });
    await graph.insertConcept({
      conceptId: 'sys-b',
      canonicalName: 'Token Validator',
      category: InformationCategory.CYBERSECURITY,
      description: 'Validator',
      confidence: 0.9,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-g4',
      provenance: ['cell-g4'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });
    await graph.insertRelation({
      relationId: 'rel-req-1',
      subjectConceptId: 'sys-a',
      predicate: CognitiveRelationPredicate.REQUIRES,
      objectConceptId: 'sys-b',
      confidence: 0.9,
      provenance: ['cell-g4'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      originatingCellId: 'cell-g4',
      metadata: {}
    });

    // S2: Structurally compatible: X REQUIRES Y
    const kS2 = {
      knowledgeId: 'k-s2',
      category: InformationCategory.AI,
      title: 'Model Training Invariant',
      summary: 'Backpropagation requires Gradient Computation',
      facts: ['Backpropagation requires Gradient Computation'],
      relationships: [
        {
          subject: 'Backpropagation',
          predicate: 'REQUIRES',
          object: 'Gradient Computation',
          confidence: 0.9
        }
      ],
      confidence: 0.9,
      source: 'ml_spec',
      timestamp: now,
      hash: 'h_ml_req',
      originatingCellId: 'cell-g4'
    };

    const res = await engine.extractRepresentations(kS2 as any, undefined, graph);
    expect(res.generalizations.length).toBeGreaterThan(0);
    const gen = res.generalizations[0];
    expect(gen.supportingEvidence).toContain('sys-a');
    expect(gen.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
  });

  it('Test G5: Generalization with single evidence remains PENDING', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-g5', memory);
    const engine = new CognitiveRepresentationEngine('cell-g5');
    const now = new Date().toISOString();

    // Isolated relational knowledge with no prior graph context
    const kSingle = {
      knowledgeId: 'k-solitary',
      category: InformationCategory.NETWORKING,
      title: 'Router Interface',
      summary: 'Router Interface requires IP Configuration',
      facts: ['Router Interface requires IP Configuration'],
      relationships: [
        {
          subject: 'Router Interface',
          predicate: 'REQUIRES',
          object: 'IP Configuration',
          confidence: 0.9
        }
      ],
      confidence: 0.9,
      source: 'net_guide',
      timestamp: now,
      hash: 'h_router',
      originatingCellId: 'cell-g5'
    };

    const res = await engine.extractRepresentations(kSingle as any, undefined, graph);
    expect(res.generalizations.length).toBeGreaterThan(0);
    const gen = res.generalizations[0];
    // Solitary evidence must NOT be marked SUPPORTED
    expect(gen.supportingEvidence.length).toBe(1);
    expect(gen.verificationStatus).toBe(RepresentationVerificationStatus.PENDING);
    expect(gen.confidence).toBeLessThanOrEqual(0.5);
  });

  it('Test N1: Cross-domain analogy requires structural relational mapping', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-n1', memory);
    const engine = new CognitiveRepresentationEngine('cell-n1');
    const now = new Date().toISOString();

    // Domain 1: AI / Computer Science
    await graph.insertConcept({
      conceptId: 'bio-antibody',
      canonicalName: 'Adversarial Filter',
      category: InformationCategory.AI,
      description: 'Perturbation inhibitor',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-imm'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-n1',
      provenance: ['cell-n1'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    await graph.insertConcept({
      conceptId: 'bio-antigen',
      canonicalName: 'Gradient Perturbation',
      category: InformationCategory.AI,
      description: 'Adversarial perturbation',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-imm'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-n1',
      provenance: ['cell-n1'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    await graph.insertRelation({
      relationId: 'rel-imm-inhibit',
      subjectConceptId: 'bio-antibody',
      predicate: CognitiveRelationPredicate.CAUSES,
      objectConceptId: 'bio-antigen',
      confidence: 0.9,
      provenance: ['cell-n1'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      originatingCellId: 'cell-n1',
      metadata: {}
    });

    // Domain 2: Cybersecurity (EDR Endpoint Agent CAUSES Malware Neutralization)
    const kSec = {
      knowledgeId: 'k-edr-sec',
      category: InformationCategory.CYBERSECURITY,
      title: 'Endpoint Protection Behavior',
      summary: 'EDR Endpoint Agent causes Malware Neutralization',
      facts: ['EDR Endpoint Agent causes Malware Neutralization'],
      relationships: [
        {
          subject: 'EDR Endpoint Agent',
          predicate: 'CAUSES',
          object: 'Malware Neutralization',
          confidence: 0.92
        }
      ],
      confidence: 0.92,
      source: 'edr_whitepaper',
      timestamp: now,
      hash: 'h_edr_sec',
      originatingCellId: 'cell-n1'
    };

    const res = await engine.extractRepresentations(kSec as any, undefined, graph);
    expect(res.analogies.length).toBeGreaterThan(0);
    const analogy = res.analogies[0];
    expect(analogy.mappedRelations.length).toBeGreaterThan(0);
    expect(analogy.mappedRelations[0].relationType).toBe(CognitiveRelationPredicate.CAUSES);
    expect(analogy.confidence).toBeGreaterThanOrEqual(0.1);
  });

  it('Test N2: Lexical overlap without structural isomorphism produces NO analogy', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-n2', memory);
    const engine = new CognitiveRepresentationEngine('cell-n2');
    const now = new Date().toISOString();

    // Stored concept with many shared words ('neural', 'network', 'packet') but NO relations
    await graph.insertConcept({
      conceptId: 'c-wordy-bio',
      canonicalName: 'Neural Topology Network',
      category: InformationCategory.AI,
      description: 'Neural graph topology network transmitting packet signals',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-w1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-n2',
      provenance: ['cell-n2'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    // Input sharing exact keywords ('neural', 'network', 'packet') but with unrelated or no relations
    const kWordyTech = {
      knowledgeId: 'k-wordy-tech',
      category: InformationCategory.SOFTWARE,
      title: 'Neural Network Packet Accelerator',
      summary: 'Deep neural network packet accelerator runtime',
      facts: ['Deep neural network packet accelerator runtime without relation mapping'],
      confidence: 0.9,
      source: 'tech_spec',
      timestamp: now,
      hash: 'h_wordy',
      originatingCellId: 'cell-n2'
    };

    const res = await engine.extractRepresentations(kWordyTech as any, undefined, graph);
    // Crucial: pure lexical overlap without topological structural mapping produces ZERO analogies!
    expect(res.analogies.length).toBe(0);
  });

  it('Test N3: Analogy confidence reflects structural alignment score', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-n3', memory);
    const now = new Date().toISOString();

    // Source concept A with 1 outgoing relation
    await graph.insertConcept({
      conceptId: 'node-a',
      canonicalName: 'Source Concept A',
      category: InformationCategory.SOFTWARE,
      description: 'Software module',
      confidence: 0.9,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-n3',
      provenance: ['cell-n3'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });
    await graph.insertConcept({
      conceptId: 'node-b',
      canonicalName: 'Target B',
      category: InformationCategory.SOFTWARE,
      description: 'Sub-module',
      confidence: 0.9,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-n3',
      provenance: ['cell-n3'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });
    await graph.insertRelation({
      relationId: 'rel-a-b',
      subjectConceptId: 'node-a',
      predicate: CognitiveRelationPredicate.CAUSES,
      objectConceptId: 'node-b',
      confidence: 0.9,
      provenance: ['cell-n3'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      originatingCellId: 'cell-n3',
      metadata: {}
    });

    // Identical structural topology candidate
    await graph.insertConcept({
      conceptId: 'node-c',
      canonicalName: 'Candidate C',
      category: InformationCategory.AI,
      description: 'AI model component',
      confidence: 0.9,
      sourceKnowledgeIds: ['k2'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-n3',
      provenance: ['cell-n3'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });
    await graph.insertConcept({
      conceptId: 'node-d',
      canonicalName: 'Candidate D',
      category: InformationCategory.AI,
      description: 'AI output component',
      confidence: 0.9,
      sourceKnowledgeIds: ['k2'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-n3',
      provenance: ['cell-n3'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });
    await graph.insertRelation({
      relationId: 'rel-c-d',
      subjectConceptId: 'node-c',
      predicate: CognitiveRelationPredicate.CAUSES,
      objectConceptId: 'node-d',
      confidence: 0.9,
      provenance: ['cell-n3'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      originatingCellId: 'cell-n3',
      metadata: {}
    });

    const candidates = graph.findAnalogyCandidates('node-a');
    expect(candidates.length).toBeGreaterThan(0);
    const top = candidates[0];
    expect(top.targetConceptId).toBe('node-c');
    expect(top.signatureSimilarity).toBeGreaterThan(0.5);
  });

  it('Test N4: Analogy mapping is directional and non-trivial', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-n4', memory);
    const engine = new CognitiveRepresentationEngine('cell-n4');
    const now = new Date().toISOString();

    // Source domain structure
    await graph.insertConcept({
      conceptId: 'src-nucleus',
      canonicalName: 'Central Master Controller',
      category: InformationCategory.COMPUTER_SCIENCE,
      description: 'Primary coordinating node',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-cs'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-n4',
      provenance: ['cell-n4'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });
    await graph.insertConcept({
      conceptId: 'src-ribosome',
      canonicalName: 'Compute Engine',
      category: InformationCategory.COMPUTER_SCIENCE,
      description: 'Execution sub-unit',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-cs'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-n4',
      provenance: ['cell-n4'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });
    await graph.insertRelation({
      relationId: 'rel-bio-controls',
      subjectConceptId: 'src-nucleus',
      predicate: CognitiveRelationPredicate.CAUSES,
      objectConceptId: 'src-ribosome',
      confidence: 0.9,
      provenance: ['cell-n4'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      originatingCellId: 'cell-n4',
      metadata: {}
    });

    // Target domain knowledge
    const kOs = {
      knowledgeId: 'k-os-controls',
      category: InformationCategory.OPERATING_SYSTEM,
      title: 'Kernel Architecture',
      summary: 'OS Kernel causes Worker Process execution',
      facts: ['OS Kernel causes Worker Process execution'],
      relationships: [
        {
          subject: 'OS Kernel',
          predicate: 'CAUSES',
          object: 'Worker Process',
          confidence: 0.9
        }
      ],
      confidence: 0.9,
      source: 'os_manual',
      timestamp: now,
      hash: 'h_os_ctrl',
      originatingCellId: 'cell-n4'
    };

    const res = await engine.extractRepresentations(kOs as any, undefined, graph);
    expect(res.analogies.length).toBeGreaterThan(0);
    const an = res.analogies[0];
    // Directional and non-trivial
    expect(an.sourceConceptIds[0]).not.toBe(an.targetConceptIds[0]);
    expect(an.mappedRelations.length).toBeGreaterThan(0);
    expect(an.mappedRelations[0].sourceElement).toBeDefined();
    expect(an.mappedRelations[0].targetElement).toBeDefined();
  });

  it('Test N5: Analogy generation bounded by budget limits', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    // Strict analogy budget: max 2 candidates
    const graph = new CognitiveGraph('cell-n5', memory, {
      maxAnalogyCandidates: 2
    });
    const now = new Date().toISOString();

    // Insert 5 candidate concepts with similar relations
    for (let i = 1; i <= 5; i++) {
      await graph.insertConcept({
        conceptId: `cand-${i}`,
        canonicalName: `Candidate Concept ${i}`,
        category: InformationCategory.SOFTWARE,
        description: `Candidate ${i}`,
        confidence: 0.85,
        sourceKnowledgeIds: [`k-${i}`],
        sourceExperienceIds: [],
        originatingCellId: 'cell-n5',
        provenance: ['cell-n5'],
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        createdAt: now,
        updatedAt: now,
        version: 1,
        metadata: {}
      });
    }

    const candidates = graph.findAnalogyCandidates('cand-1', { maxCandidates: 2 });
    expect(candidates.length).toBeLessThanOrEqual(2);
  });

  it('Test C1: Explicit CONTRADICTS relation preserved non-destructively', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-c1', memory);
    const now = new Date().toISOString();

    await graph.insertConcept({
      conceptId: 'hypo-1',
      canonicalName: 'Synchronous Network Model',
      category: InformationCategory.NETWORKING,
      description: 'All message delays are strictly bounded by Delta',
      confidence: 0.9,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-c1',
      provenance: ['cell-c1'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    await graph.insertConcept({
      conceptId: 'hypo-2',
      canonicalName: 'Asynchronous Network Model',
      category: InformationCategory.NETWORKING,
      description: 'No upper bound on transmission delay',
      confidence: 0.9,
      sourceKnowledgeIds: ['k2'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-c1',
      provenance: ['cell-c1'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    const conflictRel = await graph.preserveConflict(
      'hypo-1',
      'hypo-2',
      'Asynchrony assumption directly contradicts synchronous upper bound assumption'
    );

    // Non-destructive: both concepts still exist
    expect(graph.getConcept('hypo-1')).toBeDefined();
    expect(graph.getConcept('hypo-2')).toBeDefined();

    // Conflict relation is explicit, typed CONTRADICTS, and carries provenance
    expect(conflictRel.predicate).toBe(CognitiveRelationPredicate.CONTRADICTS);
    expect(conflictRel.provenance).toContain('cell-c1');
    expect(conflictRel.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
    expect(conflictRel.metadata?.reason).toContain('synchronous upper bound');
  });

  it('Test C2: Conflicting concepts remain queryable and retain non-destructive metadata', async () => {
    const memory = new JsonFileMemoryStore(memoryFile);
    await memory.initialize();
    const graph = new CognitiveGraph('cell-c2', memory);
    const now = new Date().toISOString();

    await graph.insertConcept({
      conceptId: 'fact-a',
      canonicalName: 'Deterministic Finality',
      category: InformationCategory.COMPUTER_SCIENCE,
      description: 'Instant state finality',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-a'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-c2',
      provenance: ['cell-c2'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    await graph.insertConcept({
      conceptId: 'fact-b',
      canonicalName: 'Probabilistic Finality',
      category: InformationCategory.COMPUTER_SCIENCE,
      description: 'Nakamoto consensus probabilistic convergence',
      confidence: 0.9,
      sourceKnowledgeIds: ['k-b'],
      sourceExperienceIds: [],
      originatingCellId: 'cell-c2',
      provenance: ['cell-c2'],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      metadata: {}
    });

    await graph.preserveConflict('fact-a', 'fact-b', 'Consensus finality guarantees are opposing paradigms');

    // Both can still be queried by their concept ID
    const retrievedA = graph.getConcept('fact-a');
    const retrievedB = graph.getConcept('fact-b');
    expect(retrievedA).toBeDefined();
    expect(retrievedB).toBeDefined();

    // Metadata tracks conflicting counterparts non-destructively
    expect(retrievedA!.metadata?.conflictingConceptIds).toContain('fact-b');
    expect(retrievedB!.metadata?.conflictingConceptIds).toContain('fact-a');

    // All conflicts queryable
    const allConflicts = graph.getAllConflicts();
    expect(allConflicts.length).toBe(1);
    expect(allConflicts[0].subjectConceptId).toBe('fact-a');
    expect(allConflicts[0].objectConceptId).toBe('fact-b');
  });
});
