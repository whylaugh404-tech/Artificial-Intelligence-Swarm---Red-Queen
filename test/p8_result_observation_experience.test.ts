import { describe, it, expect } from 'vitest';
import {
  DomainKind,
  ObservationType,
  DomainComputationResult,
  DomainComputationResultSchema,
  DomainObservation,
  DomainObservationSchema,
  DomainExperience,
  DomainExperienceSchema,
  createInternalObservationFromComputation,
  createExternalObservation,
  correlateComputationWithObservation,
  assertComputationNotEquatedToWorldSuccess,
  transitionComputationAndObservationToExperience,
  serializeDomainContract,
  deserializeDomainContract,
  SemanticBoundaryViolationError,
  assertNotComputationResult,
  assertNotObservation,
  assertNotExperience
} from '../src/redqueen/feedback';
import { MemoryCategory, JsonFileMemoryStore } from '../src/redqueen/memory/store';
import { ComputationStatus } from '../src/redqueen/cognition/computation/types';
import { InformationCategory, InformationSourceType, MetabolismStatus, NoveltyClassification } from '../src/redqueen/metabolism/types';
import { computeCanonicalHash } from '../src/redqueen/core/canonical';

describe('RED QUEEN — REPAIR PROMPT 03: P8 RESULT → OBSERVATION → EXPERIENCE', () => {
  const cellAlpha = 'cell_alpha_node_001';
  const cellVerifier = 'cell_verifier_node_002';
  const now = new Date().toISOString();

  // Helper fixture: Computation Result strictly schema-compliant
  const createComputationFixture = (overrides?: {
    status?: ComputationStatus;
    finalOutput?: Record<string, unknown>;
    confidence?: number;
    verified?: boolean;
  }): DomainComputationResult => {
    const status = overrides?.status ?? ComputationStatus.COMPLETED;
    const finalOutput = overrides?.finalOutput ?? {
      targetQuantumFrequency: 432.1,
      gridStability: 'OPTIMAL',
      estimatedEntropy: 0.12
    };

    return DomainComputationResultSchema.parse({
      contractVersion: 1,
      domainKind: DomainKind.COMPUTATION_RESULT,
      deterministicId: `comp_${status.toLowerCase()}_fixture_001`,
      cellId: cellAlpha,
      cycleNumber: 1,
      timestamp: now,
      causalReferences: [],
      provenance: [cellAlpha, 'EXECUTION_FABRIC'],
      confidence: overrides?.confidence ?? 0.98,
      status,
      persistenceSemantics: {
        category: MemoryCategory.PROCEDURAL,
        storageKey: `comp_${status.toLowerCase()}_001`,
        immutable: true,
        retentionPolicy: 'RETAIN_INDEFINITELY'
      },
      payload: {
        taskId: 'task_quantum_grid_prediction_001',
        originatingCellId: cellAlpha,
        status,
        finalOutput,
        partialResults: {},
        dependencies: [],
        provenance: [cellAlpha],
        verificationStatus: {
          verified: overrides?.verified ?? (status === ComputationStatus.COMPLETED),
          verifierCellId: cellVerifier,
          verifiedAt: now,
          consistencyScore: 1.0,
          checksum: 'a'.repeat(64)
        },
        trace: {
          traceId: 'trace_quantum_001',
          taskId: 'task_quantum_grid_prediction_001',
          goal: 'Predict and regulate quantum flux',
          decomposedSubtaskIds: ['sub_quantum_1'],
          executionOrder: [['sub_quantum_1']],
          allocations: { sub_quantum_1: cellAlpha },
          dispatches: [],
          verificationTrace: [],
          compositionDetails: {
            compositionId: 'comp_detail_quantum_001',
            formula: 'C* = F(C1)',
            transformationRule: 'QUANTUM_SOLVER',
            computeModel: {
              formula: 'C* = F(C1)',
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
              transformationId: 'trans_001',
              operator: 'NON_ADDITIVE_FUNCTIONAL_SYNTHESIS',
              rule: 'DIRECT_EXECUTION',
              criticalPathDepth: 1,
              parallelWavesCount: 1,
              averageParallelism: 1,
              parallelFraction: 0.9,
              serialFraction: 0.1,
              concurrencySpeedup: 1.8,
              attenuationFactor: 1.0,
              specializationSynergy: 1.0,
              dependencyGraphReduction: {
                nodesCount: 1,
                edgesCount: 0,
                resolvedEdgesCount: 0
              }
            },
            compositeState: {
              stateId: 'state_comp_quantum_001',
              unifiedStateVector: {},
              synthesizedEntities: {},
              crossCellResolution: {},
              dependencyResolutions: [],
              provenanceChain: [cellAlpha],
              stateChecksum: 'c'.repeat(64)
            },
            inputSubtaskCount: 1,
            inputCellIds: [cellAlpha],
            effectiveCapacity: 0.9,
            costs: {
              communicationCost: 5,
              synchronizationCost: 2,
              verificationCost: 1,
              totalOverheadCost: 8
            },
            composedOutput: finalOutput,
            deterministicHash: 'd'.repeat(64)
          },
          completedAt: now
        },
        composition: {
          compositionId: 'comp_detail_quantum_001',
          formula: 'C* = F(C1)',
          transformationRule: 'QUANTUM_SOLVER',
          computeModel: {
            formula: 'C* = F(C1)',
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
            transformationId: 'trans_001',
            operator: 'NON_ADDITIVE_FUNCTIONAL_SYNTHESIS',
            rule: 'DIRECT_EXECUTION',
            criticalPathDepth: 1,
            parallelWavesCount: 1,
            averageParallelism: 1,
            parallelFraction: 0.9,
            serialFraction: 0.1,
            concurrencySpeedup: 1.8,
            attenuationFactor: 1.0,
            specializationSynergy: 1.0,
            dependencyGraphReduction: {
              nodesCount: 1,
              edgesCount: 0,
              resolvedEdgesCount: 0
            }
          },
          compositeState: {
            stateId: 'state_comp_quantum_001',
            unifiedStateVector: {},
            synthesizedEntities: {},
            crossCellResolution: {},
            dependencyResolutions: [],
            provenanceChain: [cellAlpha],
            stateChecksum: 'c'.repeat(64)
          },
          inputSubtaskCount: 1,
          inputCellIds: [cellAlpha],
          effectiveCapacity: 0.9,
          costs: {
            communicationCost: 5,
            synchronizationCost: 2,
            verificationCost: 1,
            totalOverheadCost: 8
          },
          composedOutput: finalOutput,
          deterministicHash: 'd'.repeat(64)
        },
        deterministicHash: 'e'.repeat(64),
        completedAt: now
      }
    });
  };

  // ==========================================================================
  // SCENARIO 1: P8 SUCCESS WITHOUT EXPERIENCE
  // ==========================================================================
  describe('1. P8 Success Without Experience (Execution ≠ World State)', () => {
    it('treats successful ComputationResult strictly as execution result when no Observation is present', () => {
      const computation = createComputationFixture();

      // Ensure boundary asserts reject passing ComputationResult where not allowed
      expect(() => assertNotComputationResult(computation, 'ObservationContextGuard')).toThrow(SemanticBoundaryViolationError);

      // Attempt transition without an Observation
      const transitionResult = transitionComputationAndObservationToExperience(
        computation,
        undefined,
        {
          cellId: cellAlpha,
          cycleNumber: 1,
          transactionId: 'tx_exec_only_001'
        }
      );

      // Crucial verification: Computation success DOES NOT create an Experience
      expect(transitionResult.canProduceExperience).toBe(false);
      expect(transitionResult.experience).toBeNull();
      expect(transitionResult.concordance).toBe('AWAITING_OBSERVATION');
      expect(transitionResult.reason).toContain('Computation success ≠ world success');
    });

    it('rejects asserting world success based solely on computation success', () => {
      const computation = createComputationFixture();

      // Guard explicitly throws when attempting to equate computation success to world success
      expect(() => {
        assertComputationNotEquatedToWorldSuccess(computation, undefined, 'UnitAuditTest');
      }).toThrow(SemanticBoundaryViolationError);

      try {
        assertComputationNotEquatedToWorldSuccess(computation, undefined, 'UnitAuditTest');
      } catch (err: any) {
        expect(err.message).toContain('Illegal claim of world success');
        expect(err.message).toContain('Computation success ≠ world success');
      }
    });
  });

  // ==========================================================================
  // SCENARIO 2: INTERNAL OBSERVATION VS EXTERNAL OBSERVATION
  // ==========================================================================
  describe('2. Internal Observation vs External Observation Separation', () => {
    it('creates an internal introspective Observation recording execution telemetries without making world claims', () => {
      const computation = createComputationFixture();

      const { observation: internalObs, envelope } = createInternalObservationFromComputation(
        computation,
        {
          cellId: cellAlpha,
          cycleNumber: 1,
          metadata: { engine: 'matrix_v2' }
        }
      );

      expect(internalObs.domainKind).toBe(DomainKind.OBSERVATION);
      expect(internalObs.observationType).toBe(ObservationType.INTERNAL);
      expect(internalObs.source).toBe('CELL_RUNTIME');
      expect(internalObs.observedSubject).toContain('internal:execution:');
      expect(internalObs.causalReferences).toHaveLength(1);
      expect(internalObs.causalReferences[0].antecedentDomain).toBe(DomainKind.COMPUTATION_RESULT);
      expect(internalObs.causalReferences[0].antecedentId).toBe(computation.deterministicId);

      // Observed state reflects execution telemetries
      const state = (internalObs.payload as any).observedState;
      expect(state.status).toBe(ComputationStatus.COMPLETED);
      expect(state.taskId).toBe('task_quantum_grid_prediction_001');

      // Envelope links transition
      expect(envelope.sourceDomain).toBe(DomainKind.COMPUTATION_RESULT);
      expect(envelope.targetDomain).toBe(DomainKind.OBSERVATION);
      expect(envelope.sourceId).toBe(computation.deterministicId);
      expect(envelope.targetId).toBe(internalObs.deterministicId);
    });

    it('creates a grounded external Observation with mandatory empirical attributes', () => {
      const externalState = {
        targetQuantumFrequency: 432.1,
        gridStability: 'OPTIMAL',
        estimatedEntropy: 0.12
      };

      const externalObs = createExternalObservation({
        cellId: cellAlpha,
        cycleNumber: 1,
        observedSubject: 'quantum_field:zone_42',
        source: 'ambient_quantum_spectrometer_07',
        sourceType: InformationSourceType.PUBLIC_WEB,
        observedState: externalState,
        content: JSON.stringify(externalState),
        confidence: 0.99
      });

      expect(externalObs.domainKind).toBe(DomainKind.OBSERVATION);
      expect(externalObs.observationType).toBe(ObservationType.EXTERNAL);
      expect(externalObs.observedSubject).toBe('quantum_field:zone_42');
      expect(externalObs.source).toBe('ambient_quantum_spectrometer_07');
      expect(externalObs.timestamp).toBeDefined();
      expect((externalObs.payload as any).contentHash).toHaveLength(64);
    });
  });

  // ==========================================================================
  // SCENARIO 3: P8 + VALID OBSERVATION → EXPERIENCE
  // ==========================================================================
  describe('3. P8 + Valid Observation → Grounded Experience', () => {
    it('produces confirmed Experience with positive reinforcement when empirical observation matches computation', () => {
      const sharedWorldState = {
        targetQuantumFrequency: 432.1,
        gridStability: 'OPTIMAL',
        estimatedEntropy: 0.12
      };

      const computation = createComputationFixture({
        finalOutput: sharedWorldState
      });

      const observation = createExternalObservation({
        cellId: cellAlpha,
        cycleNumber: 1,
        observedSubject: 'quantum_field:zone_42',
        source: 'external_sensor_grid',
        observedState: sharedWorldState,
        content: JSON.stringify(sharedWorldState),
        confidence: 0.97
      });

      // Assert correlation
      const correlation = correlateComputationWithObservation(computation, observation, {
        expectedSubject: 'quantum_field:zone_42'
      });
      expect(correlation.isRelevant).toBe(true);
      expect(correlation.concordance).toBe('CONCORDANT');
      expect(correlation.discrepancyScore).toBe(0.0);

      // World success assertion passes
      expect(() => {
        assertComputationNotEquatedToWorldSuccess(computation, observation);
      }).not.toThrow();

      // Transition to Experience
      const result = transitionComputationAndObservationToExperience(
        computation,
        observation,
        {
          cellId: cellAlpha,
          cycleNumber: 1,
          transactionId: 'tx_grounding_001',
          expectedSubject: 'quantum_field:zone_42',
          category: InformationCategory.GENERAL_TECHNOLOGY
        }
      );

      expect(result.canProduceExperience).toBe(true);
      expect(result.concordance).toBe('CONCORDANT');
      expect(result.experience).not.toBeNull();

      const exp = result.experience!;
      expect(exp.domainKind).toBe(DomainKind.EXPERIENCE);
      expect(exp.status).toBe(MetabolismStatus.ACCEPTED);
      expect(exp.payload.noveltyClassification).toBe(NoveltyClassification.REINFORCEMENT);
      expect(exp.payload.verificationStatus).toBe('CONFIRMED_BY_WORLD');

      // Crucial: Causal references must track BOTH the computational prediction AND empirical observation
      expect(exp.causalReferences).toHaveLength(2);
      const compRef = exp.causalReferences.find(r => r.antecedentDomain === DomainKind.COMPUTATION_RESULT);
      const obsRef = exp.causalReferences.find(r => r.antecedentDomain === DomainKind.OBSERVATION);
      expect(compRef).toBeDefined();
      expect(obsRef).toBeDefined();
      expect(compRef?.antecedentId).toBe(computation.deterministicId);
      expect(obsRef?.antecedentId).toBe(observation.deterministicId);

      // Provenance must merge computation and observation paths
      expect(exp.provenance).toContain(cellAlpha);
      expect(exp.provenance).toContain('EXECUTION_FABRIC');
      expect(exp.provenance).toContain('external_sensor_grid');
      expect(exp.provenance).toContain('METABOLISM_GROUNDING');
    });
  });

  // ==========================================================================
  // SCENARIO 4: CONFLICTING OBSERVATION (WORLD DISCREPANCY)
  // ==========================================================================
  describe('4. Conflicting Observation (Computation Success ≠ World Success)', () => {
    it('demonstrates world failure despite computation success when observation contradicts prediction', () => {
      // Computation predicted optimal frequency 432.1 Hz
      const computation = createComputationFixture({
        finalOutput: {
          targetQuantumFrequency: 432.1,
          gridStability: 'OPTIMAL'
        }
      });

      // Grounded observation reports that actual frequency dropped to 110.5 Hz with instability
      const conflictingObservation = createExternalObservation({
        cellId: cellAlpha,
        cycleNumber: 1,
        observedSubject: 'quantum_field:zone_42',
        source: 'empirical_probe_unit',
        observedState: {
          targetQuantumFrequency: 110.5,
          gridStability: 'CRITICAL_FAULT'
        },
        content: JSON.stringify({
          targetQuantumFrequency: 110.5,
          gridStability: 'CRITICAL_FAULT'
        }),
        confidence: 0.99
      });

      // Correlation must detect contradiction
      const correlation = correlateComputationWithObservation(computation, conflictingObservation, {
        expectedSubject: 'quantum_field:zone_42'
      });
      expect(correlation.isRelevant).toBe(true);
      expect(correlation.concordance).toBe('CONTRADICTORY');
      expect(correlation.discrepancyScore).toBeGreaterThan(0.5);

      // Equating computation success to world success MUST be rejected
      expect(() => {
        assertComputationNotEquatedToWorldSuccess(computation, conflictingObservation);
      }).toThrow(SemanticBoundaryViolationError);

      // Transition produces an Experience documenting computational model rupture
      const result = transitionComputationAndObservationToExperience(
        computation,
        conflictingObservation,
        {
          cellId: cellAlpha,
          cycleNumber: 1,
          transactionId: 'tx_contradiction_001',
          expectedSubject: 'quantum_field:zone_42'
        }
      );

      expect(result.canProduceExperience).toBe(true);
      expect(result.concordance).toBe('CONTRADICTORY');
      expect(result.experience).not.toBeNull();

      const exp = result.experience!;
      expect(exp.payload.noveltyClassification).toBe(NoveltyClassification.CONTRADICTION);
      expect(exp.payload.verificationStatus).toBe('CONTRADICTED_BY_WORLD');
      expect(exp.payload.lessonsDerived).toContain('world_state_diverged_from_computational_prediction');
      expect(exp.payload.lessonsDerived).toContain('computational_model_rupture_detected');

      // Both computation and observation are linked to establish epistemic history
      expect(exp.causalReferences).toHaveLength(2);
      expect(exp.causalReferences.find(r => r.relation === 'EMPIRICAL_CONTRADICTION')).toBeDefined();
    });
  });

  // ==========================================================================
  // SCENARIO 5: FAILED COMPUTATION
  // ==========================================================================
  describe('5. Failed Computation Handling', () => {
    it('prohibits failed computation from generating world success experience', () => {
      const failedComputation = createComputationFixture({
        status: ComputationStatus.FAILED,
        finalOutput: { error: 'Division by zero in flux tensor' },
        confidence: 0.0,
        verified: false
      });

      const observation = createExternalObservation({
        cellId: cellAlpha,
        cycleNumber: 1,
        observedSubject: 'quantum_field:zone_42',
        source: 'ambient_sensor',
        observedState: { status: 'NORMAL' },
        content: '{"status":"NORMAL"}'
      });

      const result = transitionComputationAndObservationToExperience(
        failedComputation,
        observation,
        {
          cellId: cellAlpha,
          cycleNumber: 1,
          transactionId: 'tx_failed_comp_001'
        }
      );

      expect(result.canProduceExperience).toBe(false);
      expect(result.experience).toBeNull();
      expect(result.concordance).toBe('COMPUTATION_FAILED');
      expect(result.reason).toContain('Failed computation cannot produce world experience');
    });

    it('creates internal observation of failed computation without world impact', () => {
      const failedComputation = createComputationFixture({
        status: ComputationStatus.FAILED,
        confidence: 0.0
      });

      const { observation: intObs } = createInternalObservationFromComputation(
        failedComputation,
        { cellId: cellAlpha, cycleNumber: 1 }
      );

      expect(intObs.confidence).toBe(0.0);
      expect((intObs.payload as any).observedState.status).toBe(ComputationStatus.FAILED);
      expect(intObs.observationType).toBe(ObservationType.INTERNAL);
    });
  });

  // ==========================================================================
  // SCENARIO 6: PERSISTENCE, RECOVERY, AND CANONICAL SERIALIZATION
  // ==========================================================================
  describe('6. Persistence, Recovery, and RFC 8785 Canonical Serialization', () => {
    it('persists computation, observation, and experience into JsonFileMemoryStore and verifies round-trip fidelity', async () => {
      const memoryStore = new JsonFileMemoryStore(':memory:', cellAlpha);
      await memoryStore.initialize();

      const sharedState = { targetQuantumFrequency: 432.1, gridStability: 'OPTIMAL' };
      const computation = createComputationFixture({ finalOutput: sharedState });
      const observation = createExternalObservation({
        cellId: cellAlpha,
        cycleNumber: 1,
        observedSubject: 'quantum_field:zone_42',
        source: 'grid_monitor_99',
        observedState: sharedState,
        content: JSON.stringify(sharedState)
      });

      const { experience, envelope } = transitionComputationAndObservationToExperience(
        computation,
        observation,
        {
          cellId: cellAlpha,
          cycleNumber: 1,
          transactionId: 'tx_persistence_001',
          expectedSubject: 'quantum_field:zone_42'
        }
      );

      expect(experience).not.toBeNull();
      expect(envelope).toBeDefined();

      // Put into MemoryStore
      await memoryStore.put({
        id: computation.deterministicId,
        cellId: cellAlpha,
        category: computation.persistenceSemantics.category,
        content: computation,
        source: 'COMPUTATION_EXECUTION',
        createdAt: computation.timestamp,
        updatedAt: computation.timestamp,
        confidence: computation.confidence ?? 1.0,
        hash: computeCanonicalHash(computation),
        provenance: computation.provenance
      });

      await memoryStore.put({
        id: observation.deterministicId,
        cellId: cellAlpha,
        category: observation.persistenceSemantics.category,
        content: observation,
        source: observation.source || 'OBSERVATION',
        createdAt: observation.timestamp,
        updatedAt: observation.timestamp,
        confidence: observation.confidence ?? 1.0,
        hash: computeCanonicalHash(observation),
        provenance: observation.provenance
      });

      await memoryStore.put({
        id: experience!.deterministicId,
        cellId: cellAlpha,
        category: experience!.persistenceSemantics.category,
        content: experience!,
        source: 'METABOLISM',
        createdAt: experience!.timestamp,
        updatedAt: experience!.timestamp,
        confidence: experience!.confidence,
        hash: computeCanonicalHash(experience!),
        provenance: experience!.provenance
      });

      // Verify retrieval
      const retrievedComp = await memoryStore.get(computation.deterministicId);
      const retrievedObs = await memoryStore.get(observation.deterministicId);
      const retrievedExp = await memoryStore.get(experience!.deterministicId);

      expect(retrievedComp).not.toBeNull();
      expect(retrievedObs).not.toBeNull();
      expect(retrievedExp).not.toBeNull();

      // Canonical serialization verification
      const serializedExp = serializeDomainContract(retrievedExp!.content);
      expect(typeof serializedExp).toBe('string');
      expect(serializedExp).toContain(experience!.deterministicId);

      // Deserialization with strict domain assertion
      const restoredExp = deserializeDomainContract<DomainExperience>(
        serializedExp,
        DomainKind.EXPERIENCE
      );

      expect(restoredExp.deterministicId).toBe(experience!.deterministicId);
      expect(restoredExp.payload.verificationStatus).toBe('CONFIRMED_BY_WORLD');
      expect(restoredExp.causalReferences).toHaveLength(2);
      expect(Object.isFrozen(restoredExp)).toBe(true);
    });
  });
});
