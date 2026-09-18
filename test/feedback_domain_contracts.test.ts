import { describe, it, expect } from 'vitest';
import {
  DomainKind,
  DomainComputationResult,
  DomainComputationResultSchema,
  DomainObservation,
  DomainObservationSchema,
  DomainExperience,
  DomainExperienceSchema,
  DomainEvidence,
  DomainEvidenceSchema,
  DomainEpistemicTruth,
  DomainEpistemicTruthSchema,
  DomainLearningUpdate,
  DomainLearningUpdateSchema,
  DomainEvolutionTelemetry,
  DomainEvolutionTelemetrySchema,
  DomainMitosisDecision,
  DomainMitosisDecisionSchema,
  DomainPersistenceSemantics
} from '../src/redqueen/feedback/types';
import {
  SemanticBoundaryViolationError,
  InvalidDomainTransitionError,
  DomainSerializationError
} from '../src/redqueen/feedback/errors';
import {
  transitionObservationToExperience,
  transitionExperienceToEvidence,
  transitionEvidencesToEpistemicTruth,
  transitionToLearningUpdate,
  transitionToEvolutionTelemetry,
  transitionToMitosisDecision,
  assertNotObservation,
  assertNotComputationResult,
  assertNotExperience,
  assertNotEvidence,
  assertNotTruth,
  assertNotLearningUpdate,
  assertNotEvolutionTelemetry,
  assertNotMitosisDecision
} from '../src/redqueen/feedback/transitions';
import {
  serializeDomainContract,
  deserializeDomainContract,
  deepFreeze
} from '../src/redqueen/feedback/serialization';
import { MemoryCategory } from '../src/redqueen/memory/store';
import { ComputationStatus } from '../src/redqueen/cognition/computation/types';
import { InformationCategory, InformationSourceType, MetabolismStatus, NoveltyClassification } from '../src/redqueen/metabolism/types';
import { EpistemicStatus } from '../src/redqueen/cognition/epistemic/types';

describe('RED QUEEN — FEEDBACK DOMAIN CONTRACTS (REPAIR PROMPT 02)', () => {
  const cellAlpha = 'cell_alpha_node_001';
  const cellBeta = 'cell_beta_node_002';
  const now = new Date().toISOString();

  // Helper fixture: Raw Observation
  const createTestObservation = (): DomainObservation => {
    return DomainObservationSchema.parse({
      contractVersion: 1,
      domainKind: DomainKind.OBSERVATION,
      deterministicId: 'obs_fixture_001',
      cellId: cellAlpha,
      cycleNumber: 1,
      timestamp: now,
      causalReferences: [],
      provenance: [cellAlpha, 'SENSOR_FEED'],
      confidence: 0.95,
      status: 'RECEIVED',
      persistenceSemantics: {
        category: MemoryCategory.EPISODIC,
        storageKey: 'obs_fixture_001',
        immutable: true,
        retentionPolicy: 'RETAIN_INDEFINITELY'
      },
      payload: {
        informationId: 'info_fixture_001',
        sourceType: InformationSourceType.PUBLIC_WEB,
        sourceIdentifier: 'ambient_quantum_sensor',
        acquiredAt: now,
        content: 'Photon flux density measured at 432.1 Hz with zero parity anomalies.',
        contentType: 'text/plain',
        language: 'en',
        contentHash: 'a'.repeat(64),
        metadata: { sensorType: 'quantum' }
      }
    });
  };

  // Helper fixture: Computation Result
  const createTestComputationResult = (): DomainComputationResult => {
    return DomainComputationResultSchema.parse({
      contractVersion: 1,
      domainKind: DomainKind.COMPUTATION_RESULT,
      deterministicId: 'comp_fixture_001',
      cellId: cellAlpha,
      cycleNumber: 1,
      timestamp: now,
      causalReferences: [],
      provenance: [cellAlpha, 'EXECUTION_FABRIC'],
      confidence: 0.99,
      status: ComputationStatus.COMPLETED,
      persistenceSemantics: {
        category: MemoryCategory.PROCEDURAL,
        storageKey: 'comp_fixture_001',
        immutable: true,
        retentionPolicy: 'RETAIN_INDEFINITELY'
      },
      payload: {
        taskId: 'task_graph_reduce_001',
        originatingCellId: cellAlpha,
        status: ComputationStatus.COMPLETED,
        finalOutput: { reductionFactor: 0.42, clustersIdentified: 3 },
        partialResults: {},
        dependencies: [],
        provenance: [cellAlpha],
        verificationStatus: {
          verified: true,
          verifierCellId: cellBeta,
          verifiedAt: now,
          consistencyScore: 1.0,
          checksum: 'b'.repeat(64)
        },
        trace: {
          traceId: 'trace_001',
          taskId: 'task_graph_reduce_001',
          goal: 'Reduce sparse graph',
          decomposedSubtaskIds: ['sub_1'],
          executionOrder: [['sub_1']],
          allocations: { sub_1: cellAlpha },
          dispatches: [],
          verificationTrace: [],
          compositionDetails: {
            compositionId: 'comp_detail_001',
            formula: 'C* = F(C1, C2)',
            transformationRule: 'PARALLEL_REDUCE',
            computeModel: {
              formula: 'C* = F(C1, C2)',
              participantCapacities: { [cellAlpha]: 1.0 },
              naiveSumCapacity: 1.0,
              effectiveCapacity: 0.9,
              isNonAdditive: true,
              parameters: {
                serialFraction: 0.1,
                parallelFraction: 0.9,
                theoreticalSpeedup: 1.8,
                latencyDegradation: 0.1,
                specializationFactor: 1.0
              },
              overheadBreakdown: {
                communicationCost: 5,
                synchronizationCost: 2,
                verificationCost: 1,
                totalOverheadCost: 8
              }
            },
            inputs: [],
            transformation: {
              transformationId: 'tx_001',
              operator: 'NON_ADDITIVE_FUNCTIONAL_SYNTHESIS',
              rule: 'DIRECT',
              criticalPathDepth: 1,
              parallelWavesCount: 1,
              averageParallelism: 1,
              parallelFraction: 0.9,
              serialFraction: 0.1,
              concurrencySpeedup: 1.8,
              attenuationFactor: 1.0,
              specializationSynergy: 1.0,
              dependencyGraphReduction: { nodesCount: 1, edgesCount: 0, resolvedEdgesCount: 0 }
            },
            compositeState: {
              stateId: 'state_comp_001',
              synthesizedEntities: {},
              unifiedStateVector: {},
              crossCellResolution: {},
              dependencyResolutions: [],
              provenanceChain: [cellAlpha],
              stateChecksum: 'c'.repeat(64)
            },
            inputSubtaskCount: 1,
            inputCellIds: [cellAlpha],
            effectiveCapacity: 0.9,
            costs: { communicationCost: 5, synchronizationCost: 2, verificationCost: 1, totalOverheadCost: 8 },
            composedOutput: { clustersIdentified: 3 },
            deterministicHash: 'd'.repeat(64)
          },
          completedAt: now
        },
        composition: {
          compositionId: 'comp_detail_001',
          formula: 'C* = F(C1, C2)',
          transformationRule: 'PARALLEL_REDUCE',
          computeModel: {
            formula: 'C* = F(C1, C2)',
            participantCapacities: { [cellAlpha]: 1.0 },
            naiveSumCapacity: 1.0,
            effectiveCapacity: 0.9,
            isNonAdditive: true,
            parameters: {
              serialFraction: 0.1,
              parallelFraction: 0.9,
              theoreticalSpeedup: 1.8,
              latencyDegradation: 0.1,
              specializationFactor: 1.0
            },
            overheadBreakdown: {
              communicationCost: 5,
              synchronizationCost: 2,
              verificationCost: 1,
              totalOverheadCost: 8
            }
          },
          inputs: [],
          transformation: {
            transformationId: 'tx_001',
            operator: 'NON_ADDITIVE_FUNCTIONAL_SYNTHESIS',
            rule: 'DIRECT',
            criticalPathDepth: 1,
            parallelWavesCount: 1,
            averageParallelism: 1,
            parallelFraction: 0.9,
            serialFraction: 0.1,
            concurrencySpeedup: 1.8,
            attenuationFactor: 1.0,
            specializationSynergy: 1.0,
            dependencyGraphReduction: { nodesCount: 1, edgesCount: 0, resolvedEdgesCount: 0 }
          },
          compositeState: {
            stateId: 'state_comp_001',
            synthesizedEntities: {},
            unifiedStateVector: {},
            crossCellResolution: {},
            dependencyResolutions: [],
            provenanceChain: [cellAlpha],
            stateChecksum: 'c'.repeat(64)
          },
          inputSubtaskCount: 1,
          inputCellIds: [cellAlpha],
          effectiveCapacity: 0.9,
          costs: { communicationCost: 5, synchronizationCost: 2, verificationCost: 1, totalOverheadCost: 8 },
          composedOutput: { clustersIdentified: 3 },
          deterministicHash: 'd'.repeat(64)
        },
        deterministicHash: 'e'.repeat(64),
        completedAt: now
      }
    });
  };

  // ==========================================================================
  // 1. SEMANTIC DISTINCTION TESTS
  // ==========================================================================

  it('1.1 Semantic Distinction: ComputationResult ≠ Observation', () => {
    const compResult = createTestComputationResult();
    const obs = createTestObservation();

    // They have distinct domainKind discriminators
    expect(compResult.domainKind).toBe(DomainKind.COMPUTATION_RESULT);
    expect(obs.domainKind).toBe(DomainKind.OBSERVATION);
    expect(compResult.domainKind).not.toBe(obs.domainKind);

    // ComputationResult cannot parse as DomainObservation
    expect(() => DomainObservationSchema.parse(compResult)).toThrow();

    // Observation cannot parse as DomainComputationResult
    expect(() => DomainComputationResultSchema.parse(obs)).toThrow();

    // Runtime assertion rejects treating ComputationResult as Observation
    expect(() => assertNotComputationResult(compResult.payload, 'TestContext')).toThrow(SemanticBoundaryViolationError);
  });

  it('1.2 Semantic Distinction: Observation ≠ Experience', () => {
    const obs = createTestObservation();

    // Observation cannot be parsed as DomainExperience
    expect(() => DomainExperienceSchema.parse(obs)).toThrow();

    // Direct transition to Evidence from Observation is prohibited (must go through Experience)
    expect(() =>
      transitionExperienceToEvidence(obs as any, {
        cellId: cellAlpha,
        cycleNumber: 1,
        context: { contextId: 'ctx_001', domain: 'quantum' },
        polarity: 'SUPPORTING',
        confidence: 0.9
      })
    ).toThrow(SemanticBoundaryViolationError);

    // Transition from Observation to Experience works via governed morphism
    const { experience, envelope } = transitionObservationToExperience(obs, {
      cellId: cellAlpha,
      cycleNumber: 1,
      transactionId: 'tx_ingest_001',
      knowledgeIds: ['know_001'],
      category: InformationCategory.GENERAL_TECHNOLOGY,
      outcome: MetabolismStatus.ACCEPTED,
      noveltyClassification: NoveltyClassification.NOVEL,
      noveltyScore: 0.85,
      confidence: 0.95,
      lessonsDerived: ['Flux calibration verified']
    });

    expect(experience.domainKind).toBe(DomainKind.EXPERIENCE);
    expect(envelope.sourceDomain).toBe(DomainKind.OBSERVATION);
    expect(envelope.targetDomain).toBe(DomainKind.EXPERIENCE);
    expect(envelope.causalReferences[0].antecedentId).toBe(obs.deterministicId);
  });

  it('1.3 Semantic Distinction: Experience ≠ Evidence', () => {
    const obs = createTestObservation();
    const { experience } = transitionObservationToExperience(obs, {
      cellId: cellAlpha,
      cycleNumber: 1,
      transactionId: 'tx_ingest_002',
      knowledgeIds: ['know_002'],
      category: InformationCategory.GENERAL_TECHNOLOGY,
      outcome: MetabolismStatus.ACCEPTED,
      noveltyClassification: NoveltyClassification.REINFORCEMENT,
      noveltyScore: 0.2,
      confidence: 0.9
    });

    // Experience cannot parse as Evidence
    expect(() => DomainEvidenceSchema.parse(experience)).toThrow();

    // Experience cannot be passed directly into Epistemic Truth fusion
    expect(() =>
      transitionEvidencesToEpistemicTruth([experience as any], {
        cellId: cellAlpha,
        cycleNumber: 1,
        conceptOrPropositionId: 'concept_photon_flux',
        status: EpistemicStatus.BELIEVED,
        opinion: { belief: 0.8, disbelief: 0.1, uncertainty: 0.1, baseRate: 0.5 },
        context: { contextId: 'ctx_001', domain: 'quantum' },
        transitionReason: 'Attempting illegal direct experience fusion'
      })
    ).toThrow(SemanticBoundaryViolationError);

    // Transition from Experience to Evidence works via governed morphism
    const { evidence, envelope } = transitionExperienceToEvidence(experience, {
      cellId: cellAlpha,
      cycleNumber: 1,
      context: { contextId: 'ctx_001', domain: 'quantum' },
      targetHypothesisId: 'hyp_flux_stability',
      polarity: 'SUPPORTING',
      confidence: 0.92
    });

    expect(evidence.domainKind).toBe(DomainKind.EVIDENCE);
    expect(envelope.sourceDomain).toBe(DomainKind.EXPERIENCE);
    expect(envelope.targetDomain).toBe(DomainKind.EVIDENCE);
    expect(envelope.causalReferences[0].antecedentId).toBe(experience.deterministicId);
  });

  it('1.4 Semantic Distinction: Evidence ≠ Truth (Epistemic Truth)', () => {
    const obs = createTestObservation();
    const { experience } = transitionObservationToExperience(obs, {
      cellId: cellAlpha,
      cycleNumber: 1,
      transactionId: 'tx_ingest_003',
      knowledgeIds: ['know_003'],
      category: InformationCategory.GENERAL_TECHNOLOGY,
      outcome: MetabolismStatus.ACCEPTED,
      noveltyClassification: NoveltyClassification.NOVEL,
      noveltyScore: 0.7,
      confidence: 0.9
    });
    const { evidence } = transitionExperienceToEvidence(experience, {
      cellId: cellAlpha,
      cycleNumber: 1,
      context: { contextId: 'ctx_001', domain: 'quantum' },
      targetHypothesisId: 'hyp_flux_stability',
      polarity: 'SUPPORTING',
      confidence: 0.92
    });

    // Evidence cannot parse as DomainEpistemicTruth
    expect(() => DomainEpistemicTruthSchema.parse(evidence)).toThrow();

    // Epistemic Truth is formed through fusion of evidence
    const { epistemicTruth, envelope } = transitionEvidencesToEpistemicTruth([evidence], {
      cellId: cellAlpha,
      cycleNumber: 1,
      conceptOrPropositionId: 'concept_flux_stability',
      status: EpistemicStatus.BELIEVED,
      opinion: { belief: 0.85, disbelief: 0.05, uncertainty: 0.1, baseRate: 0.5 },
      context: { contextId: 'ctx_001', domain: 'quantum' },
      transitionReason: 'Corroborated by high-confidence quantum sensor evidence'
    });

    expect(epistemicTruth.domainKind).toBe(DomainKind.EPISTEMIC_TRUTH);
    expect(epistemicTruth.status).toBe(EpistemicStatus.BELIEVED);
    expect(epistemicTruth.opinion?.belief).toBe(0.85);
    expect(envelope.sourceDomain).toBe(DomainKind.EVIDENCE);
    expect(envelope.targetDomain).toBe(DomainKind.EPISTEMIC_TRUTH);

    // EpistemicTruth cannot parse as atomic Evidence
    expect(() => DomainEvidenceSchema.parse(epistemicTruth)).toThrow();
  });

  it('1.5 Semantic Distinction: LearningUpdate ≠ EvolutionTelemetry', () => {
    const obs = createTestObservation();
    const { experience } = transitionObservationToExperience(obs, {
      cellId: cellAlpha,
      cycleNumber: 1,
      transactionId: 'tx_ingest_004',
      knowledgeIds: ['know_004'],
      category: InformationCategory.GENERAL_TECHNOLOGY,
      outcome: MetabolismStatus.ACCEPTED,
      noveltyClassification: NoveltyClassification.NOVEL,
      noveltyScore: 0.6,
      confidence: 0.88
    });

    // Generate LearningUpdate (ontogenetic graph adaptation)
    const { learningUpdate } = transitionToLearningUpdate(experience, {
      cellId: cellAlpha,
      cycleNumber: 1,
      conceptsStrengthened: ['concept_photon_flux'],
      conceptsWeakened: [],
      relationsStrengthened: ['rel_flux_energy'],
      relationsWeakened: [],
      conflictsDetected: 0,
      deltaWeights: { concept_photon_flux: 0.05 },
      triggerReason: 'Reinforced by positive sensory assimilation'
    });

    expect(learningUpdate.domainKind).toBe(DomainKind.LEARNING_UPDATE);

    // LearningUpdate cannot parse as EvolutionTelemetry
    expect(() => DomainEvolutionTelemetrySchema.parse(learningUpdate)).toThrow();

    // Generate EvolutionTelemetry (phylogenetic lineage fitness)
    const compResult = createTestComputationResult();
    const { evolutionTelemetry } = transitionToEvolutionTelemetry(compResult, {
      cellId: cellAlpha,
      lineageId: 'lineage_alpha_root',
      generation: 3,
      cycleNumber: 1,
      fitnessComponents: {
        computationPerformance: 0.95,
        reliability: 0.99,
        cognitiveContribution: 0.9,
        knowledgeContribution: 0.85,
        specialization: 0.8,
        experience: 0.75,
        resourceEfficiency: 0.92
      },
      overallFitness: 0.91,
      computationPerformanceScore: 0.95,
      epistemicContributionScore: 0.9,
      measurementWindow: { startedAt: now, endedAt: now }
    });

    expect(evolutionTelemetry.domainKind).toBe(DomainKind.EVOLUTION_TELEMETRY);

    // EvolutionTelemetry cannot parse as LearningUpdate
    expect(() => DomainLearningUpdateSchema.parse(evolutionTelemetry)).toThrow();

    // Passing LearningUpdate into EvolutionTelemetry transition throws
    expect(() =>
      transitionToEvolutionTelemetry(learningUpdate as any, {
        cellId: cellAlpha,
        lineageId: 'lineage_alpha_root',
        generation: 3,
        cycleNumber: 1,
        fitnessComponents: {} as any,
        overallFitness: 0.5,
        measurementWindow: { startedAt: now, endedAt: now }
      })
    ).toThrow(SemanticBoundaryViolationError);
  });

  it('1.6 Semantic Distinction: EvolutionTelemetry ≠ MitosisDecision', () => {
    const compResult = createTestComputationResult();
    const { evolutionTelemetry } = transitionToEvolutionTelemetry(compResult, {
      cellId: cellAlpha,
      lineageId: 'lineage_alpha_root',
      generation: 3,
      cycleNumber: 1,
      fitnessComponents: {
        computationPerformance: 0.95,
        reliability: 0.99,
        cognitiveContribution: 0.9,
        knowledgeContribution: 0.85,
        specialization: 0.8,
        experience: 0.75,
        resourceEfficiency: 0.92
      },
      overallFitness: 0.91,
      measurementWindow: { startedAt: now, endedAt: now }
    });

    // EvolutionTelemetry cannot parse as MitosisDecision
    expect(() => DomainMitosisDecisionSchema.parse(evolutionTelemetry)).toThrow();

    // Mitosis decision requires governance evaluation
    const { mitosisDecision: permittedDecision } = transitionToMitosisDecision(evolutionTelemetry, {
      eventId: 'evt_mitosis_001',
      parentCellId: cellAlpha,
      parentActive: true,
      currentPopulation: 4,
      populationCeiling: 10,
      memoryPressure: 0.85,
      minMemoryPressure: 0.7,
      cooldownMs: 60000,
      requireAuthorization: true,
      authorizationProof: { signature: 'dummy_creator_sig_001' },
      isAuthorizedProofValid: true,
      authorizationState: 'VALID',
      cycleNumber: 1
    });

    expect(permittedDecision.domainKind).toBe(DomainKind.MITOSIS_DECISION);
    expect(permittedDecision.status).toBe('PERMITTED');
    expect(permittedDecision.payload.decision).toBe('PERMITTED');

    // Denied decision when population ceiling is exceeded
    const { mitosisDecision: deniedDecision } = transitionToMitosisDecision(evolutionTelemetry, {
      eventId: 'evt_mitosis_002',
      parentCellId: cellAlpha,
      parentActive: true,
      currentPopulation: 10,
      populationCeiling: 10, // Ceiling reached!
      memoryPressure: 0.85,
      minMemoryPressure: 0.7,
      cooldownMs: 60000,
      requireAuthorization: true,
      authorizationProof: { signature: 'dummy_creator_sig_001' },
      isAuthorizedProofValid: true,
      authorizationState: 'VALID',
      cycleNumber: 1
    });

    expect(deniedDecision.status).toBe('DENIED');
    expect(deniedDecision.payload.decision).toBe('DENIED');
    expect(deniedDecision.payload.reason).toContain('Population ceiling reached');

    // MitosisDecision cannot parse as EvolutionTelemetry
    expect(() => DomainEvolutionTelemetrySchema.parse(permittedDecision)).toThrow();
  });

  // ==========================================================================
  // 2. TRANSITION ATTRIBUTE COMPLETENESS TESTS (Requirement 4)
  // ==========================================================================

  it('2. Transition Attribute Completeness: validates all mandatory fields', () => {
    const obs = createTestObservation();
    const { experience, envelope } = transitionObservationToExperience(obs, {
      cellId: cellAlpha,
      cycleNumber: 42,
      transactionId: 'tx_completeness_001',
      knowledgeIds: ['know_comp'],
      category: InformationCategory.HARDWARE,
      outcome: MetabolismStatus.ACCEPTED,
      noveltyClassification: NoveltyClassification.NOVEL,
      noveltyScore: 0.9,
      confidence: 0.99
    });

    // 1. Source reference
    expect(envelope.sourceId).toBe(obs.deterministicId);
    expect(envelope.sourceDomain).toBe(DomainKind.OBSERVATION);

    // 2. Timestamp / cycle
    expect(experience.timestamp).toBeDefined();
    expect(experience.cycleNumber).toBe(42);
    expect(envelope.cycleNumber).toBe(42);

    // 3. Cell identity
    expect(experience.cellId).toBe(cellAlpha);
    expect(envelope.cellId).toBe(cellAlpha);

    // 4. Causal reference
    expect(experience.causalReferences).toHaveLength(1);
    expect(experience.causalReferences[0].antecedentDomain).toBe(DomainKind.OBSERVATION);
    expect(experience.causalReferences[0].antecedentId).toBe(obs.deterministicId);

    // 5. Provenance
    expect(experience.provenance).toContain(cellAlpha);
    expect(experience.provenance).toContain('METABOLISM');

    // 6. Confidence and status
    expect(experience.confidence).toBe(0.99);
    expect(experience.status).toBe(MetabolismStatus.ACCEPTED);

    // 7. Deterministic identifier
    expect(experience.deterministicId).toMatch(/^exp_[a-f0-9]{24}$/);
    expect(envelope.deterministicHash).toMatch(/^[a-f0-9]{64}$/);

    // 8. Persistence semantics
    expect(experience.persistenceSemantics.category).toBe(MemoryCategory.EPISODIC);
    expect(experience.persistenceSemantics.storageKey).toBe(`experience_${experience.deterministicId}`);
    expect(experience.persistenceSemantics.immutable).toBe(true);
    expect(experience.persistenceSemantics.retentionPolicy).toBe('RETAIN_INDEFINITELY');
  });

  // ==========================================================================
  // 3. RUNTIME & TYPE BOUNDARY VIOLATION REJECTION TESTS (Requirement 5)
  // ==========================================================================

  it('3. Runtime Boundary Violation Rejection: prevents prohibited conversions', () => {
    const obs = createTestObservation();

    // Trying to pass Observation into Evidence assertion
    expect(() => assertNotObservation(obs, 'EvidenceAssertion')).toThrow(SemanticBoundaryViolationError);

    // Trying to pass Experience into Epistemic assertion
    const dummyExp = { domainKind: DomainKind.EXPERIENCE, experienceId: 'exp_001', noveltyScore: 0.5 };
    expect(() => assertNotExperience(dummyExp, 'EpistemicAssertion')).toThrow(SemanticBoundaryViolationError);

    // Trying to pass Evidence into Truth assertion
    const dummyEv = { domainKind: DomainKind.EVIDENCE, evidenceId: 'ev_001', context: { contextId: 'ctx' } };
    expect(() => assertNotEvidence(dummyEv, 'TruthAssertion')).toThrow(SemanticBoundaryViolationError);

    // Trying to pass LearningUpdate into EvolutionTelemetry assertion
    const dummyLearn = { domainKind: DomainKind.LEARNING_UPDATE, learningId: 'learn_001', conceptsStrengthened: [] };
    expect(() => assertNotLearningUpdate(dummyLearn, 'EvolutionTelemetryAssertion')).toThrow(SemanticBoundaryViolationError);

    // Trying to pass EvolutionTelemetry into Mitosis assertion
    const dummyTelem = { domainKind: DomainKind.EVOLUTION_TELEMETRY, telemetryId: 'tel_001', fitnessComponents: {} };
    expect(() => assertNotEvolutionTelemetry(dummyTelem, 'MitosisAssertion')).toThrow(SemanticBoundaryViolationError);
  });

  // ==========================================================================
  // 4. SERIALIZATION & DESERIALIZATION AUDIT TESTS (Requirement 6)
  // ==========================================================================

  it('4.1 Serialization Audit: RFC 8785 determinism and key-ordering invariance', () => {
    const obs1 = createTestObservation();
    // Create equivalent observation with permuted key insertion order
    const obs2 = {
      payload: obs1.payload,
      status: obs1.status,
      confidence: obs1.confidence,
      provenance: [...obs1.provenance],
      causalReferences: [...obs1.causalReferences],
      timestamp: obs1.timestamp,
      cycleNumber: obs1.cycleNumber,
      cellId: obs1.cellId,
      deterministicId: obs1.deterministicId,
      domainKind: obs1.domainKind,
      contractVersion: obs1.contractVersion,
      persistenceSemantics: { ...obs1.persistenceSemantics }
    } as DomainObservation;

    const serialized1 = serializeDomainContract(obs1);
    const serialized2 = serializeDomainContract(obs2);

    // Must be byte-for-byte identical despite permuted key insertion order
    expect(serialized1).toBe(serialized2);
  });

  it('4.2 Serialization Audit: round-trip fidelity, deep immutability, and tampering rejection', () => {
    const obs = createTestObservation();
    const serialized = serializeDomainContract(obs);
    const deserialized = deserializeDomainContract<DomainObservation>(serialized, DomainKind.OBSERVATION);

    expect(deserialized.deterministicId).toBe(obs.deterministicId);
    expect(deserialized.domainKind).toBe(DomainKind.OBSERVATION);
    expect(deserialized.payload.content).toBe(obs.payload.content);

    // Verify deep freeze immutability
    expect(Object.isFrozen(deserialized)).toBe(true);
    expect(Object.isFrozen(deserialized.payload)).toBe(true);
    expect(Object.isFrozen(deserialized.persistenceSemantics)).toBe(true);

    // Attempting to mutate in strict mode must throw
    expect(() => {
      (deserialized as any).confidence = 0.1;
    }).toThrow();

    // Deserialization with expected domain mismatch throws SemanticBoundaryViolationError
    expect(() => deserializeDomainContract(serialized, DomainKind.EVIDENCE)).toThrow(SemanticBoundaryViolationError);

    // Tampered payload with corrupted domainKind throws DomainSerializationError
    const corruptedJson = serialized.replace('"domainKind":"OBSERVATION"', '"domainKind":"MALICIOUS_KIND"');
    expect(() => deserializeDomainContract(corruptedJson)).toThrow(DomainSerializationError);

    // Prototype pollution payload is rejected
    const protoPollutionJson = '{"__proto__":{"isAdmin":true},"domainKind":"OBSERVATION"}';
    expect(() => deserializeDomainContract(protoPollutionJson)).toThrow(DomainSerializationError);
  });

  // ==========================================================================
  // 5. NO "UNIVERSAL FEEDBACK" OBJECT CONFLATION PRINCIPLE
  // ==========================================================================

  it('5. Anti-Conflation Principle: rejects untyped universal feedback blobs', () => {
    // Attempting to construct a "UniversalFeedback" bag that mixes observation and telemetry fields
    const universalBag = {
      domainKind: 'UNIVERSAL_FEEDBACK',
      observationId: 'obs_001',
      computationResult: {},
      telemetry: {},
      evidence: {}
    };

    // None of the domain schemas accept the universal bag
    expect(() => DomainObservationSchema.parse(universalBag)).toThrow();
    expect(() => DomainComputationResultSchema.parse(universalBag)).toThrow();
    expect(() => DomainEvidenceSchema.parse(universalBag)).toThrow();
    expect(() => DomainEpistemicTruthSchema.parse(universalBag)).toThrow();
    expect(() => DomainLearningUpdateSchema.parse(universalBag)).toThrow();
    expect(() => DomainEvolutionTelemetrySchema.parse(universalBag)).toThrow();
    expect(() => DomainMitosisDecisionSchema.parse(universalBag)).toThrow();
  });
});
