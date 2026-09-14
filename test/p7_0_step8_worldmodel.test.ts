import { describe, test, expect, beforeEach } from 'vitest';
import { WorldModelEngine } from '../src/redqueen/cognition/worldmodel/engine';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { MemoryStore, MemoryEntry } from '../src/redqueen/memory/store';
import {
  CognitiveConcept,
  CognitiveRelation,
  CognitiveRelationPredicate,
  RepresentationVerificationStatus
} from '../src/redqueen/cognition/representation/types';
import { Context, EpistemicStatus } from '../src/redqueen/cognition/epistemic/types';
import { UnderstandingEngine } from '../src/redqueen/cognition/understanding/engine';
import { CompositionConstraint } from '../src/redqueen/core/composition/types';
import { Evidence } from '../src/redqueen/cognition/evidence/types';
import { InformationCategory } from '../src/redqueen/metabolism/types';

class MockMemoryStore implements MemoryStore {
  public data = new Map<string, MemoryEntry>();
  async initialize() {}
  async put(entry: MemoryEntry) { this.data.set(entry.id, entry); }
  async get(id: string) { return this.data.get(id) || null; }
  async search(query: any) {
    return Array.from(this.data.values()).filter(e => (!query.category || e.category === query.category));
  }
  async delete(id: string) { this.data.delete(id); return true; }
  async remove(id: string) { this.data.delete(id); }
  async clear() { this.data.clear(); }
  getStats() { return { total: 0, episodic: 0, semantic: 0, procedural: 0 }; }
}

describe('P7.0 Step 8: Internal World Model', () => {
  let memory: MockMemoryStore;
  let graph: CognitiveGraph;
  let worldModelEngine: WorldModelEngine;
  let understandingEngine: UnderstandingEngine;

  const mockContext: Context = {
    contextId: 'ctx_compute_sys',
    domain: 'SYSTEMS_ARCHITECTURE',
    temporalBounds: {
      start: 1767225600000,
      end: 1798761599000
    }
  };

  const cpuEntity: CognitiveConcept = {
    conceptId: 'con_cpu',
    canonicalName: 'CentralProcessingUnit',
    description: 'Hardware processor executing machine instructions',
    category: InformationCategory.GENERAL_TECHNOLOGY,
    sourceKnowledgeIds: ['k_cpu'],
    sourceExperienceIds: [],
    originatingCellId: 'cell_hardware',
    confidence: 0.95,
    verificationStatus: RepresentationVerificationStatus.VERIFIED,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    provenance: ['cell_hardware'],
    evidenceIds: ['ev_bench_1'],
    metadata: {}
  };

  const ramEntity: CognitiveConcept = {
    conceptId: 'con_ram',
    canonicalName: 'RandomAccessMemory',
    description: 'Volatile high-speed working memory',
    category: InformationCategory.GENERAL_TECHNOLOGY,
    sourceKnowledgeIds: ['k_ram'],
    sourceExperienceIds: [],
    originatingCellId: 'cell_hardware',
    confidence: 0.95,
    verificationStatus: RepresentationVerificationStatus.VERIFIED,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    provenance: ['cell_hardware'],
    evidenceIds: ['ev_bench_2'],
    metadata: {}
  };

  const powerFailureEvent: CognitiveConcept = {
    conceptId: 'con_pwr_fail',
    canonicalName: 'PowerFailure',
    description: 'Abrupt loss of electrical power to the system',
    category: InformationCategory.GENERAL_TECHNOLOGY,
    sourceKnowledgeIds: ['k_pwr'],
    sourceExperienceIds: [],
    originatingCellId: 'cell_sensor',
    confidence: 0.9,
    verificationStatus: RepresentationVerificationStatus.SUPPORTED,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    provenance: ['cell_sensor'],
    evidenceIds: ['ev_log_pwr'],
    metadata: {}
  };

  const haltedState: CognitiveConcept = {
    conceptId: 'con_halted',
    canonicalName: 'SystemHalted',
    description: 'System state where instruction execution has ceased',
    category: InformationCategory.GENERAL_TECHNOLOGY,
    sourceKnowledgeIds: ['k_state'],
    sourceExperienceIds: [],
    originatingCellId: 'cell_kernel',
    confidence: 0.9,
    verificationStatus: RepresentationVerificationStatus.SUPPORTED,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    provenance: ['cell_kernel'],
    evidenceIds: ['ev_kernel_panic'],
    metadata: {}
  };

  const bootProcess: CognitiveConcept = {
    conceptId: 'con_boot_proc',
    canonicalName: 'BootSequence',
    description: 'Multi-stage initialization sequence from BIOS to Kernel',
    category: InformationCategory.GENERAL_TECHNOLOGY,
    sourceKnowledgeIds: ['k_boot'],
    sourceExperienceIds: [],
    originatingCellId: 'cell_kernel',
    confidence: 0.92,
    verificationStatus: RepresentationVerificationStatus.VERIFIED,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    provenance: ['cell_kernel'],
    evidenceIds: ['ev_boot_log'],
    metadata: {}
  };

  // Causal relation: PowerFailure CAUSES SystemHalted
  const causalRelation: CognitiveRelation = {
    relationId: 'rel_cause_halt',
    subjectConceptId: 'con_pwr_fail',
    predicate: CognitiveRelationPredicate.CAUSES,
    objectConceptId: 'con_halted',
    confidence: 0.95,
    provenance: ['cell_power'],
    verificationStatus: RepresentationVerificationStatus.SUPPORTED,
    createdAt: '2026-01-01T00:00:00.000Z',
    originatingCellId: 'cell_power',
    evidenceIds: ['ev_crash_dump'],
    metadata: {}
  };

  // Dependency relation: CPU DEPENDS_ON RAM
  const dependencyRelation: CognitiveRelation = {
    relationId: 'rel_dep_ram',
    subjectConceptId: 'con_cpu',
    predicate: CognitiveRelationPredicate.DEPENDS_ON,
    objectConceptId: 'con_ram',
    confidence: 0.99,
    provenance: ['cell_arch'],
    verificationStatus: RepresentationVerificationStatus.VERIFIED,
    createdAt: '2026-01-01T00:00:00.000Z',
    originatingCellId: 'cell_arch',
    evidenceIds: ['ev_spec_doc'],
    metadata: {}
  };

  const ev1: Evidence = {
    evidenceId: 'ev_bench_1',
    sourceId: 'cell_hardware',
    timestamp: '2026-01-01T00:00:00.000Z',
    provenance: { sourceId: 'cell_hardware', timestamp: '2026-01-01T00:00:00.000Z' },
    context: mockContext
  };

  const evCrash: Evidence = {
    evidenceId: 'ev_crash_dump',
    sourceId: 'cell_power',
    timestamp: '2026-01-01T00:00:00.000Z',
    provenance: { sourceId: 'cell_power', timestamp: '2026-01-01T00:00:00.000Z' },
    context: mockContext
  };

  const constraint: CompositionConstraint = {
    constraintId: 'const_temp_limit',
    type: 'CAPACITY',
    targetInputId: 'con_cpu',
    condition: { maxTempCelsius: 85 }
  };

  beforeEach(async () => {
    memory = new MockMemoryStore();
    graph = new CognitiveGraph('cell_main', memory);
    worldModelEngine = new WorldModelEngine(graph);
    understandingEngine = new UnderstandingEngine();

    // Populate graph with canonical representations and evidences
    await graph.insertConcept(cpuEntity);
    await graph.insertConcept(ramEntity);
    await graph.insertConcept(powerFailureEvent);
    await graph.insertConcept(haltedState);
    await graph.insertConcept(bootProcess);
    await graph.insertRelation(causalRelation);
    await graph.insertRelation(dependencyRelation);
    await graph.insertEvidence(ev1);
    await graph.insertEvidence(evCrash);
  });

  test('1. Reuse existing CognitiveGraph without duplication', async () => {
    const wm = worldModelEngine.compose({
      name: 'Computer Architecture World Model',
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      entities: ['con_cpu', 'con_ram'],
      events: ['con_pwr_fail'],
      states: ['con_halted'],
      relations: ['rel_cause_halt', 'rel_dep_ram']
    });

    expect(wm).toBeDefined();
    expect(wm.worldModelId.startsWith('wm_')).toBe(true);
    expect(wm.entities).toEqual(['con_cpu', 'con_ram']);
    expect(wm.events).toEqual(['con_pwr_fail']);
    expect(wm.states).toEqual(['con_halted']);
    expect(wm.causalRelations).toEqual(['rel_cause_halt']);
    expect(wm.dependencies).toEqual(['rel_dep_ram']);

    // CognitiveGraph remains canonical source
    expect(graph.getConcept('con_cpu')).toBeDefined();
    expect(graph.getRelation('rel_cause_halt')).toBeDefined();
  });

  test('2. Concept / Entity traceability: World Model -> Understanding -> Representation -> Evidence', async () => {
    // Build an understanding first
    const und = understandingEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_arch',
      concepts: [cpuEntity, ramEntity],
      relations: [dependencyRelation],
      evidences: [ev1]
    });

    const wm = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      understandings: [und],
      entities: ['con_cpu', 'con_ram'],
      relations: ['rel_dep_ram']
    });

    const trace = worldModelEngine.traceConcept(wm, 'con_cpu', graph, [und]);
    expect(trace.elementId).toBe('con_cpu');
    expect(trace.elementType).toBe('CONCEPT');
    expect(trace.representation).toBeDefined();
    expect((trace.representation as CognitiveConcept)?.canonicalName).toBe('CentralProcessingUnit');
    expect(trace.understandings.length).toBe(1);
    expect(trace.understandings[0].understandingId).toBe(und.understandingId);
    expect(trace.evidences.length).toBeGreaterThan(0);
    expect(trace.evidences.some(e => e.evidenceId === 'ev_bench_1')).toBe(true);

    // Also verify bound helper method on model
    const boundTrace = wm.trace!('con_cpu');
    expect(boundTrace.elementId).toBe('con_cpu');
    expect((boundTrace.representation as CognitiveConcept)?.canonicalName).toBe('CentralProcessingUnit');
  });

  test('3. Relation traceability: World Model -> Understanding -> Representation -> Evidence', async () => {
    const und = understandingEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_power',
      concepts: [powerFailureEvent, haltedState],
      relations: [causalRelation],
      evidences: [evCrash]
    });

    const wm = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      understandings: [und],
      events: ['con_pwr_fail'],
      states: ['con_halted'],
      relations: ['rel_cause_halt']
    });

    const trace = wm.trace!('rel_cause_halt');
    expect(trace.elementId).toBe('rel_cause_halt');
    expect(trace.elementType).toBe('RELATION');
    expect((trace.representation as CognitiveRelation)?.predicate).toBe(CognitiveRelationPredicate.CAUSES);
    expect(trace.understandings.length).toBe(1);
    expect(trace.evidences.some(e => e.evidenceId === 'ev_crash_dump')).toBe(true);
  });

  test('4. Understanding traceability: World Model -> Understanding -> Components & Evidence', async () => {
    const und = understandingEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_power',
      concepts: [powerFailureEvent, haltedState],
      relations: [causalRelation],
      evidences: [evCrash]
    });

    const wm = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      understandings: [und]
    });

    const trace = wm.trace!(und.understandingId);
    expect(trace.elementId).toBe(und.understandingId);
    expect(trace.elementType).toBe('UNDERSTANDING');
    expect(trace.understandings[0].understandingId).toBe(und.understandingId);
    expect(trace.evidences.some(e => e.evidenceId === 'ev_crash_dump')).toBe(true);
  });

  test('5. Evidence traceability: World Model -> Associated Understandings & Evidences', async () => {
    const und = understandingEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_power',
      concepts: [powerFailureEvent, haltedState],
      relations: [causalRelation],
      evidences: [evCrash]
    });

    const wm = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      understandings: [und]
    });

    const trace = wm.trace!('ev_crash_dump');
    expect(trace.elementId).toBe('ev_crash_dump');
    expect(trace.elementType).toBe('EVIDENCE');
    expect(trace.understandings.length).toBe(1);
    expect(trace.evidences[0].evidenceId).toBe('ev_crash_dump');
  });

  test('6. Epistemic-state preservation: Preserves verified, supported, and conflict states', async () => {
    // Normal supported/verified model
    const wmNormal = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      entities: ['con_cpu', 'con_ram'],
      relations: ['rel_dep_ram']
    });
    expect(wmNormal.verificationStatus).toBe(RepresentationVerificationStatus.VERIFIED);
    expect(wmNormal.epistemicStatus).toBe(EpistemicStatus.VERIFIED);
    expect(wmNormal.uncertainty.belief).toBeGreaterThan(0.9);

    // Contradicted model
    const contradictedConcept: CognitiveConcept = {
      ...haltedState,
      conceptId: 'con_halted_contradicted',
      canonicalName: 'SystemHaltedContradicted',
      verificationStatus: RepresentationVerificationStatus.CONTRADICTED
    };
    await graph.insertConcept(contradictedConcept);

    const wmContradicted = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      entities: ['con_cpu'],
      states: ['con_halted_contradicted']
    });
    expect(wmContradicted.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);
    expect(wmContradicted.epistemicStatus).toBe(EpistemicStatus.CONTRADICTED);
    expect(wmContradicted.uncertainty.disbelief).toBeGreaterThan(0.5);
  });

  test('7. Causal structure inspection', async () => {
    const wm = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      events: ['con_pwr_fail'],
      states: ['con_halted'],
      relations: ['rel_cause_halt']
    });

    expect(wm.causalRelations).toEqual(['rel_cause_halt']);
    const causalRelations = worldModelEngine.getCausalStructure(wm, graph);
    expect(causalRelations.length).toBe(1);
    expect(causalRelations[0].predicate).toBe(CognitiveRelationPredicate.CAUSES);
    expect(causalRelations[0].subjectConceptId).toBe('con_pwr_fail');
    expect(causalRelations[0].objectConceptId).toBe('con_halted');
  });

  test('8. Dependency structure inspection', async () => {
    const wm = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      entities: ['con_cpu', 'con_ram'],
      relations: ['rel_dep_ram'],
      constraints: [constraint]
    });

    expect(wm.dependencies).toEqual(['rel_dep_ram']);
    const depStructure = worldModelEngine.getDependencyStructure(wm, graph);
    expect(depStructure.relations.length).toBe(1);
    expect(depStructure.relations[0].predicate).toBe(CognitiveRelationPredicate.DEPENDS_ON);
    expect(depStructure.constraints.length).toBe(1);
    expect(depStructure.constraints[0].constraintId).toBe('const_temp_limit');
  });

  test('9. Constraint structure preservation', async () => {
    const wm = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      entities: ['con_cpu'],
      constraints: [constraint]
    });

    const constraints = worldModelEngine.getConstraintStructure(wm);
    expect(constraints.length).toBe(1);
    expect(constraints[0].constraintId).toBe('const_temp_limit');
    expect(constraints[0].type).toBe('CAPACITY');
  });

  test('10. Uncertainty and Context preservation', async () => {
    const customOpinion = {
      belief: 0.7,
      disbelief: 0.1,
      uncertainty: 0.2,
      baseRate: 0.5
    };

    const wm = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      entities: ['con_cpu'],
      uncertainty: customOpinion
    });

    expect(wm.context.contextId).toBe('ctx_compute_sys');
    expect(wm.context.domain).toBe('SYSTEMS_ARCHITECTURE');
    expect(wm.context.temporalBounds?.start).toBe(1767225600000);
    expect(wm.context.temporalBounds?.end).toBe(1798761599000);
    expect(wm.uncertainty).toEqual(customOpinion);
  });

  test('11. Deterministic semantic identity', async () => {
    const wm1 = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_A',
      graph,
      entities: ['con_cpu', 'con_ram'],
      relations: ['rel_dep_ram'],
      constraints: [constraint]
    });

    const wm2 = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_B',
      graph,
      entities: ['con_ram', 'con_cpu'], // reversed order
      relations: ['rel_dep_ram'],
      constraints: [constraint]
    });

    expect(wm1.worldModelId).toBe(wm2.worldModelId);
  });

  test('12. Semantic change changes identity', async () => {
    const baseInput = {
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      entities: ['con_cpu', 'con_ram'],
      relations: ['rel_dep_ram']
    };
    const wmBase = worldModelEngine.compose(baseInput);

    // 1. Concept description change
    const modifiedCpu: CognitiveConcept = {
      ...cpuEntity,
      description: 'Overclocked CPU variant'
    };
    const wmDescChange = worldModelEngine.compose({
      ...baseInput,
      entities: [modifiedCpu, 'con_ram']
    });
    expect(wmDescChange.worldModelId).not.toBe(wmBase.worldModelId);

    // 2. Relation change
    const modifiedRel: CognitiveRelation = {
      ...dependencyRelation,
      predicate: CognitiveRelationPredicate.IS_A
    };
    const wmRelChange = worldModelEngine.compose({
      ...baseInput,
      relations: [modifiedRel]
    });
    expect(wmRelChange.worldModelId).not.toBe(wmBase.worldModelId);

    // 3. Constraint change
    const wmConstraint = worldModelEngine.compose({
      ...baseInput,
      constraints: [constraint]
    });
    expect(wmConstraint.worldModelId).not.toBe(wmBase.worldModelId);

    // 4. Context change
    const wmContextChange = worldModelEngine.compose({
      ...baseInput,
      context: { ...mockContext, domain: 'EMBEDDED_SYSTEMS' }
    });
    expect(wmContextChange.worldModelId).not.toBe(wmBase.worldModelId);
  });

  test('13. Observational metadata does not change identity', async () => {
    const wm1 = worldModelEngine.compose({
      name: 'Model 1',
      description: 'First version label',
      context: mockContext,
      originatingCellId: 'cell_1',
      graph,
      entities: ['con_cpu'],
      metadata: { debugFlag: true }
    });

    const wm2 = worldModelEngine.compose({
      name: 'Model 2',
      description: 'Second version label',
      context: mockContext,
      originatingCellId: 'cell_2',
      graph,
      entities: ['con_cpu'],
      metadata: { debugFlag: false }
    });

    expect(wm1.worldModelId).toBe(wm2.worldModelId);
  });

  test('14. Input ordering does not change identity', async () => {
    const wm1 = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      entities: ['con_cpu', 'con_ram'],
      events: ['con_pwr_fail'],
      states: ['con_halted'],
      relations: ['rel_dep_ram', 'rel_cause_halt']
    });

    const wm2 = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      entities: ['con_ram', 'con_cpu'],
      events: ['con_pwr_fail'],
      states: ['con_halted'],
      relations: ['rel_cause_halt', 'rel_dep_ram']
    });

    expect(wm1.worldModelId).toBe(wm2.worldModelId);
  });

  test('15. Immutability: World Model is frozen', async () => {
    const wm = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      entities: ['con_cpu'],
      constraints: [constraint]
    });

    expect(Object.isFrozen(wm)).toBe(true);
    expect(Object.isFrozen(wm.entities)).toBe(true);
    expect(Object.isFrozen(wm.constraints)).toBe(true);

    expect(() => {
      (wm as any).name = 'Tampered';
    }).toThrow();

    expect(() => {
      (wm.entities as any).push('con_illegal');
    }).toThrow();
  });

  test('16. Invalid reference rejection', async () => {
    // Missing concept
    expect(() => {
      worldModelEngine.compose({
        context: mockContext,
        originatingCellId: 'cell_main',
        graph,
        entities: ['con_non_existent']
      });
    }).toThrow(/not found/i);

    // Missing relation
    expect(() => {
      worldModelEngine.compose({
        context: mockContext,
        originatingCellId: 'cell_main',
        graph,
        entities: ['con_cpu'],
        relations: ['rel_non_existent']
      });
    }).toThrow(/not found/i);

    // Relation referencing unknown endpoints
    const badRel: CognitiveRelation = {
      relationId: 'rel_broken',
      subjectConceptId: 'con_ghost_1',
      predicate: CognitiveRelationPredicate.CAUSES,
      objectConceptId: 'con_ghost_2',
      confidence: 0.5,
      provenance: ['cell_bad'],
      verificationStatus: RepresentationVerificationStatus.PENDING,
      createdAt: '2026-01-01T00:00:00.000Z',
      originatingCellId: 'cell_bad',
      metadata: {}
    };

    expect(() => {
      worldModelEngine.compose({
        context: mockContext,
        originatingCellId: 'cell_main',
        graph,
        relations: [badRel]
      });
    }).toThrow(/unknown endpoint/i);
  });

  test('17. Duplicate representation prevention and conflicting role rejection', async () => {
    // Duplicate concept IDs deduplicated smoothly
    const wm = worldModelEngine.compose({
      context: mockContext,
      originatingCellId: 'cell_main',
      graph,
      entities: ['con_cpu', 'con_cpu', 'con_ram']
    });
    expect(wm.entities).toEqual(['con_cpu', 'con_ram']);

    // Conflicting roles rejected
    expect(() => {
      worldModelEngine.compose({
        context: mockContext,
        originatingCellId: 'cell_main',
        graph,
        entities: ['con_cpu'],
        states: ['con_cpu']
      });
    }).toThrow(/conflicting roles/i);

    // Conflicting concept definitions rejected
    const conflictingCpu: CognitiveConcept = {
      ...cpuEntity,
      canonicalName: 'CompletelyDifferentName'
    };
    expect(() => {
      worldModelEngine.compose({
        context: mockContext,
        originatingCellId: 'cell_main',
        graph,
        concepts: [cpuEntity, conflictingCpu]
      });
    }).toThrow(/conflicting definition/i);
  });
});
