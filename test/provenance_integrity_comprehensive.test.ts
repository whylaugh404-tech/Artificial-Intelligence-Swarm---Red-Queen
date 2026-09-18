import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { MemoryCategory } from '../src/redqueen/memory/store';
import { MetabolismStatus, InformationCategory, NoveltyClassification } from '../src/redqueen/metabolism/types';
import { KnowledgeRecord } from '../src/redqueen/metabolism/types';
import { Evidence } from '../src/redqueen/cognition/evidence/types';

describe('RED QUEEN — P5/P5.1 -> P7 Comprehensive Provenance Integrity Tests', () => {
  let cell: Cell;

  beforeEach(async () => {
    cell = new Cell(
      ':memory:',
      'fake_api_key',
      undefined,
      undefined,
      undefined,
      { storageSecret: 'provenance_audit_secret' }
    );
    await cell.memory.initialize();
    Object.defineProperty(cell, 'cognition', { value: { executeCycle: vi.fn() }, writable: true });
  });

  // 1. Provenance Completeness
  it('1. Provenance Completeness: produces complete end-to-end provenance across Dataset -> Metabolism -> Representation -> Evidence -> Epistemic -> WorldModel -> Reasoning', async () => {
    const datasetRecord = {
      sourceId: 'seismic_sensor_network_01',
      metric: 'ground_acceleration',
      value: 0.42,
      confidence: 0.95
    };

    await cell.ingestDataset([datasetRecord]);

    // A. Observation in memory
    const episodicMemories = await cell.memory.search({ category: MemoryCategory.EPISODIC });
    const observation = episodicMemories.find(m => m.source === 'seismic_sensor_network_01');
    expect(observation).toBeDefined();
    expect(observation!.provenance).toContain(cell.nodeId);
    expect(observation!.provenance).toContain('seismic_sensor_network_01');

    // B. Knowledge Record
    const semanticMemories = await cell.memory.search({ category: MemoryCategory.SEMANTIC });
    const knowledgeMem = semanticMemories.find(m => m.type === 'KNOWLEDGE_RECORD');
    expect(knowledgeMem).toBeDefined();
    const knowledge: KnowledgeRecord = knowledgeMem!.content;
    expect(knowledge.sourceProvenance.length).toBeGreaterThan(0);
    expect(knowledge.sourceProvenance[0].sourceIdentifier).toBe('seismic_sensor_network_01');
    expect(knowledge.sourceProvenance[0].originatingCellId).toBe(cell.nodeId);

    // C. Experience Record
    const expMem = episodicMemories.find(m => m.type === 'EXPERIENCE_RECORD');
    expect(expMem).toBeDefined();
    expect(expMem!.provenance).toContain(cell.nodeId);
    expect(expMem!.provenance).toContain('seismic_sensor_network_01');
    expect(expMem!.provenance).toContain(knowledge.knowledgeId);

    // D. Cognitive Representation (Concept)
    const concepts = cell.cognitiveGraph.getAllConcepts();
    expect(concepts.length).toBeGreaterThan(0);
    const primaryConcept = concepts[0];
    expect(primaryConcept.sourceKnowledgeIds).toContain(knowledge.knowledgeId);
    expect(primaryConcept.sourceExperienceIds).toContain(expMem!.id);
    expect(primaryConcept.originatingCellId).toBe(cell.nodeId);
    expect(primaryConcept.provenance).toContain(cell.nodeId);
    expect(primaryConcept.provenance).toContain('seismic_sensor_network_01');

    // E. Evidence
    const evidences = cell.cognitiveGraph.getAllEvidences();
    expect(evidences.length).toBeGreaterThan(0);
    const evidence = evidences[0];
    expect(evidence.sourceId).toBe(cell.nodeId);
    expect(evidence.provenance.sourceId).toBe('seismic_sensor_network_01');
    expect(evidence.provenance.derivedFrom).toContain(knowledge.knowledgeId);
    expect(evidence.provenance.derivedFrom).toContain(expMem!.id);
    expect(evidence.provenance.supportingRepresentationIds).toContain(primaryConcept.conceptId);

    // F. Epistemic State & Bidirectional Linkage
    expect(primaryConcept.evidenceIds).toContain(evidence.evidenceId);
    if (primaryConcept.epistemicStateId) {
      const epistemicState = cell.cognitiveGraph.getEpistemicState(primaryConcept.epistemicStateId);
      expect(epistemicState).toBeDefined();
      expect(epistemicState!.evidenceIds).toContain(evidence.evidenceId);
    }

    // G. Understanding & World Model
    const understandings = cell.cognitiveGraph.getAllUnderstandings();
    expect(understandings.length).toBeGreaterThan(0);
    const understanding = understandings[0];
    expect(understanding.evidenceIds).toContain(evidence.evidenceId);
    expect(understanding.originatingCellId).toBe(cell.nodeId);
  });

  // 2. Provenance Persistence
  it('2. Provenance Persistence: ensures all cognitive and metabolism entries are persisted with accurate provenance tags in MemoryStore', async () => {
    const datasetRecord = {
      sourceId: 'weather_buoy_omega',
      temperature: 21.4,
      salinity: 35.1
    };

    await cell.ingestDataset([datasetRecord]);

    const semanticEntries = await cell.memory.search({ category: MemoryCategory.SEMANTIC });
    const episodicEntries = await cell.memory.search({ category: MemoryCategory.EPISODIC });

    // Knowledge memory entry provenance
    const knEntry = semanticEntries.find(e => e.type === 'KNOWLEDGE_RECORD');
    expect(knEntry).toBeDefined();
    expect(knEntry!.provenance).toEqual(
      expect.arrayContaining([cell.nodeId, 'weather_buoy_omega', knEntry!.content.sourceInformationIds[0]])
    );

    // Experience memory entry provenance
    const expEntry = episodicEntries.find(e => e.type === 'EXPERIENCE_RECORD');
    expect(expEntry).toBeDefined();
    expect(expEntry!.provenance).toEqual(
      expect.arrayContaining([cell.nodeId, 'weather_buoy_omega', knEntry!.id])
    );

    // Evidence memory entry provenance
    const evEntry = semanticEntries.find(e => e.type === 'COGNITIVE_EVIDENCE');
    expect(evEntry).toBeDefined();
    expect(evEntry!.provenance).toEqual(
      expect.arrayContaining([cell.nodeId, 'weather_buoy_omega', knEntry!.id])
    );

    // Epistemic State memory entry provenance
    const epEntry = semanticEntries.find(e => e.type === 'EPISTEMIC_STATE');
    expect(epEntry).toBeDefined();
    expect(epEntry!.provenance).toContain(cell.nodeId);
    expect(epEntry!.provenance).toContain(epEntry!.content.context.contextId);
    expect(epEntry!.provenance).toContain(evEntry!.id);

    // Understanding memory entry provenance
    const undEntry = semanticEntries.find(e => e.type === 'COGNITIVE_UNDERSTANDING');
    expect(undEntry).toBeDefined();
    expect(undEntry!.provenance).toContain(cell.nodeId);
  });

  // 3. Provenance Restoration
  it('3. Provenance Restoration: successfully reloads the complete graph preserving all provenance trails and bidirectional links', async () => {
    const datasetRecord = {
      sourceId: 'deep_space_telemetry',
      frequency: 1420.40575,
      unit: 'MHz'
    };

    await cell.ingestDataset([datasetRecord]);

    const originalConcepts = cell.cognitiveGraph.getAllConcepts();
    const originalEvidences = cell.cognitiveGraph.getAllEvidences();
    const originalConcept = originalConcepts[0];
    const originalEvidence = originalEvidences[0];

    expect(originalConcept.evidenceIds).toContain(originalEvidence.evidenceId);

    // Create a fresh CognitiveGraph restoring from the same memory store
    const restoredGraph = new CognitiveGraph(cell.nodeId, cell.memory);
    await restoredGraph.load();

    const restoredConcept = restoredGraph.getConcept(originalConcept.conceptId);
    expect(restoredConcept).toBeDefined();
    expect(restoredConcept!.provenance).toEqual(originalConcept.provenance);
    expect(restoredConcept!.sourceKnowledgeIds).toEqual(originalConcept.sourceKnowledgeIds);
    expect(restoredConcept!.sourceExperienceIds).toEqual(originalConcept.sourceExperienceIds);
    expect(restoredConcept!.evidenceIds).toContain(originalEvidence.evidenceId);

    const restoredEvidence = restoredGraph.getEvidence(originalEvidence.evidenceId);
    expect(restoredEvidence).toBeDefined();
    expect(restoredEvidence!.provenance.sourceId).toBe('deep_space_telemetry');
    expect(restoredEvidence!.provenance.supportingRepresentationIds).toContain(originalConcept.conceptId);
    expect(restoredEvidence!.provenance.derivedFrom).toEqual(
      expect.arrayContaining(originalEvidence.provenance.derivedFrom || [])
    );
  });

  // 4. Provenance Mismatch & Rejection
  it('4. Provenance Mismatch & Rejection: rejects knowledge with empty or spoofed provenance and preserves provenance on concept merge', async () => {
    // A. Rejection of knowledge with missing provenance
    const unverifiedKnowledge: KnowledgeRecord = {
      knowledgeId: 'know_spoofed_001',
      owningCellId: 'peer_node_999',
      title: 'Spoofed Knowledge',
      summary: 'Spoofed summary',
      facts: ['fact1'],
      relationships: [],
      contradictions: [],
      structuredContent: {},
      category: InformationCategory.GENERAL_TECHNOLOGY,
      sourceInformationIds: ['info_spoofed_001'],
      sourceContentHashes: ['a'.repeat(64)],
      sourceProvenance: [], // EMPTY PROVENANCE
      confidence: 0.9,
      relevance: 0.8,
      reinforcementCount: 1,
      knowledgeVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const emptyProvResult = await cell.metabolism.assimilateKnowledge(
      unverifiedKnowledge,
      undefined,
      'peer_node_999'
    );
    expect(emptyProvResult.status).toBe(MetabolismStatus.REJECTED);
    expect(emptyProvResult.reason).toContain('Provenance missing');

    // B. Rejection of knowledge claiming a sourcePeerId not in the provenance trail
    const mismatchedKnowledge: KnowledgeRecord = {
      ...unverifiedKnowledge,
      knowledgeId: 'know_mismatched_002',
      sourceProvenance: [{
        informationId: 'info_original',
        sourceIdentifier: 'peer_honest_node',
        originatingCellId: 'peer_honest_node',
        contentHash: 'b'.repeat(64),
        acquiredAt: new Date().toISOString(),
        metabolizedAt: new Date().toISOString()
      }]
    };

    const mismatchResult = await cell.metabolism.assimilateKnowledge(
      mismatchedKnowledge,
      undefined,
      'peer_impostor_node' // Impostor claims this knowledge
    );
    expect(mismatchResult.status).toBe(MetabolismStatus.REJECTED);
    expect(mismatchResult.reason).toContain('Provenance mismatch');

    // C. Validation rejection on corrupted evidence
    await expect(
      cell.cognitiveGraph.insertEvidence({
        evidenceId: 'ev_corrupted',
        sourceId: '', // Invalid empty sourceId
        timestamp: new Date().toISOString(),
        provenance: {
          sourceId: 'valid_source',
          timestamp: new Date().toISOString()
        },
        context: { contextId: 'ctx_corrupt', domain: 'test' }
      } as any)
    ).rejects.toThrow();

    // D. Non-destructive provenance merging on duplicate concept
    const concept1 = await cell.cognitiveGraph.insertConcept({
      conceptId: 'concept_merge_test',
      canonicalName: 'MergeInvariant',
      description: 'First definition',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      sourceKnowledgeIds: ['know_alpha'],
      sourceExperienceIds: ['exp_alpha'],
      originatingCellId: cell.nodeId,
      confidence: 0.8,
      verificationStatus: 'SUPPORTED' as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      provenance: [cell.nodeId, 'source_alpha'],
      metadata: {}
    });

    const concept2 = await cell.cognitiveGraph.insertConcept({
      conceptId: 'concept_merge_test_2',
      canonicalName: 'MergeInvariant',
      description: 'Second enhanced definition',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      sourceKnowledgeIds: ['know_beta'],
      sourceExperienceIds: ['exp_beta'],
      originatingCellId: cell.nodeId,
      confidence: 0.85,
      verificationStatus: 'SUPPORTED' as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      provenance: [cell.nodeId, 'source_beta'],
      metadata: {}
    });

    expect(concept2.conceptId).toBe(concept1.conceptId);
    expect(concept2.provenance).toContain('source_alpha');
    expect(concept2.provenance).toContain('source_beta');
    expect(concept2.sourceKnowledgeIds).toContain('know_alpha');
    expect(concept2.sourceKnowledgeIds).toContain('know_beta');
    expect(concept2.sourceExperienceIds).toContain('exp_alpha');
    expect(concept2.sourceExperienceIds).toContain('exp_beta');
  });

  // 5. Multi-Hop Traceability
  it('5. Multi-Hop Traceability: full causal backward trace through Reasoning -> WorldModel -> Epistemic -> Evidence -> Representation -> Metabolism -> Dataset Source', async () => {
    const datasetRecord = {
      sourceId: 'quantum_gravimeter_station',
      reading: 9.80665,
      stationCode: 'QGS-07'
    };

    await cell.ingestDataset([datasetRecord]);

    // Hop 1: Obtain the stored Evidence
    const evidences = cell.cognitiveGraph.getAllEvidences();
    expect(evidences.length).toBeGreaterThan(0);
    const evidence = evidences[0];

    // Hop 2: Trace Evidence to supporting CognitiveConcept
    const repIds = evidence.provenance.supportingRepresentationIds || [];
    expect(repIds.length).toBeGreaterThan(0);
    const concept = cell.cognitiveGraph.getConcept(repIds[0]);
    expect(concept).toBeDefined();

    // Hop 3: Trace Concept to source KnowledgeRecord
    const knowledgeIds = concept!.sourceKnowledgeIds;
    expect(knowledgeIds.length).toBeGreaterThan(0);
    const knEntry = await cell.memory.get(knowledgeIds[0]);
    expect(knEntry).toBeDefined();
    const knowledge: KnowledgeRecord = knEntry!.content;

    // Hop 4: Trace Concept to source ExperienceRecord
    const expIds = concept!.sourceExperienceIds;
    expect(expIds && expIds.length > 0).toBe(true);
    const expEntry = await cell.memory.get(expIds![0]);
    expect(expEntry).toBeDefined();
    expect(expEntry!.content.knowledgeIds).toContain(knowledge.knowledgeId);

    // Hop 5: Trace KnowledgeRecord back to Dataset Source
    expect(knowledge.sourceProvenance[0].sourceIdentifier).toBe('quantum_gravimeter_station');

    // Hop 6: Trace Epistemic State forward to Evidence
    expect(concept!.epistemicStateId).toBeDefined();
    const epistemicState = cell.cognitiveGraph.getEpistemicState(concept!.epistemicStateId!);
    expect(epistemicState).toBeDefined();
    expect(epistemicState!.evidenceIds).toContain(evidence.evidenceId);

    // Hop 7: Trace Understanding and WorldModel forward to Evidence
    const understandings = cell.cognitiveGraph.getAllUnderstandings();
    const und = understandings.find(u => u.evidenceIds.includes(evidence.evidenceId));
    expect(und).toBeDefined();
    expect(und!.originatingCellId).toBe(cell.nodeId);
  });
});
