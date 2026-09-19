import { computeCanonicalHash } from '../core/canonical';
import { MemoryCategory } from '../memory/store';
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
  DomainTransitionEnvelope,
  DomainTransitionEnvelopeSchema,
  CausalReference,
  ObservationType,
  StructuredObservation,
  StructuredObservationSchema
} from './types';
import {
  SemanticBoundaryViolationError,
  InvalidDomainTransitionError
} from './errors';
import { EpistemicStatus, SubjectiveOpinion } from '../cognition/epistemic/types';
import { InformationCategory, InformationSourceType, MetabolismStatus, NoveltyClassification } from '../metabolism/types';
import { FitnessComponents, ExperienceEvolutionMetrics } from '../evolution/types';
import { ComputationStatus } from '../cognition/computation/types';

/**
 * RED QUEEN FEEDBACK DOMAIN TRANSITION ENGINE
 * 
 * Enforces explicit mathematical & semantic boundaries:
 * 1. ComputationResult ≠ Observation
 * 2. Observation ≠ Experience
 * 3. Experience ≠ Evidence
 * 4. Evidence ≠ Truth
 * 5. LearningUpdate ≠ EvolutionTelemetry
 * 6. EvolutionTelemetry ≠ MitosisDecision
 */

// ============================================================================
// RUNTIME BOUNDARY ASSERTIONS
// ============================================================================

export function assertNotObservation(obj: any, contextDescription: string): void {
  if (!obj) return;
  if (
    obj.domainKind === DomainKind.OBSERVATION ||
    (obj.sourceType !== undefined && obj.contentHash !== undefined && obj.experienceId === undefined)
  ) {
    throw new SemanticBoundaryViolationError(
      contextDescription,
      DomainKind.OBSERVATION,
      'Direct conversion or usage of raw Observation in this context is strictly forbidden. Raw observations must be metabolized into Experience before epistemic processing.'
    );
  }
}

export function assertNotComputationResult(obj: any, contextDescription: string): void {
  if (obj && (obj.domainKind === DomainKind.COMPUTATION_RESULT || obj.taskId !== undefined || obj.finalOutput !== undefined)) {
    throw new SemanticBoundaryViolationError(
      contextDescription,
      DomainKind.COMPUTATION_RESULT,
      'ComputationResult cannot be treated as Observation or direct Epistemic Truth. Computation is an algorithmic derivation, not empirical sensation or fused belief.'
    );
  }
}

export function assertNotExperience(obj: any, contextDescription: string): void {
  if (obj && (obj.domainKind === DomainKind.EXPERIENCE || obj.experienceId !== undefined || obj.noveltyScore !== undefined)) {
    throw new SemanticBoundaryViolationError(
      contextDescription,
      DomainKind.EXPERIENCE,
      'Experience cannot be treated directly as Evidence or Epistemic Truth. Experiences are episodic event memories; Evidence requires explicit propositional grounding and context.'
    );
  }
}

export function assertNotEvidence(obj: any, contextDescription: string): void {
  if (obj && (obj.domainKind === DomainKind.EVIDENCE || (obj.evidenceId !== undefined && obj.context !== undefined && obj.opinion === undefined))) {
    throw new SemanticBoundaryViolationError(
      contextDescription,
      DomainKind.EVIDENCE,
      'Evidence cannot be treated as Epistemic Truth. Evidence is an atomic justification claim; Epistemic Truth requires multi-source epistemic fusion.'
    );
  }
}

export function assertNotTruth(obj: any, contextDescription: string): void {
  if (obj && (obj.domainKind === DomainKind.EPISTEMIC_TRUTH || (obj.stateId !== undefined && obj.opinion !== undefined))) {
    throw new SemanticBoundaryViolationError(
      contextDescription,
      DomainKind.EPISTEMIC_TRUTH,
      'Epistemic Truth cannot be treated as raw Evidence or Observation. Fused truth cannot masquerade as atomic empirical observation.'
    );
  }
}

export function assertNotLearningUpdate(obj: any, contextDescription: string): void {
  if (obj && (obj.domainKind === DomainKind.LEARNING_UPDATE || obj.learningId !== undefined || obj.conceptsStrengthened !== undefined)) {
    throw new SemanticBoundaryViolationError(
      contextDescription,
      DomainKind.LEARNING_UPDATE,
      'LearningUpdate (ontogenetic graph adaptation) cannot be treated as EvolutionTelemetry (phylogenetic lineage fitness).'
    );
  }
}

export function assertNotEvolutionTelemetry(obj: any, contextDescription: string): void {
  if (obj && (obj.domainKind === DomainKind.EVOLUTION_TELEMETRY || obj.telemetryId !== undefined || obj.fitnessComponents !== undefined)) {
    throw new SemanticBoundaryViolationError(
      contextDescription,
      DomainKind.EVOLUTION_TELEMETRY,
      'EvolutionTelemetry cannot be treated as MitosisDecision. Evolutionary metrics do not constitute reproduction gate permission.'
    );
  }
}

export function assertNotMitosisDecision(obj: any, contextDescription: string): void {
  if (obj && (obj.domainKind === DomainKind.MITOSIS_DECISION || obj.decisionId !== undefined || obj.evaluatedConditions !== undefined)) {
    throw new SemanticBoundaryViolationError(
      contextDescription,
      DomainKind.MITOSIS_DECISION,
      'MitosisDecision cannot be treated as EvolutionTelemetry or LearningUpdate.'
    );
  }
}

// ============================================================================
// GOVERNED TRANSITIONS
// ============================================================================

/**
 * Transition 1: Observation -> Experience
 * Transforms a raw observation into a cell-scoped episodic Experience.
 * Enforces: ComputationResult ≠ Observation, Observation ≠ Experience.
 */
export function transitionObservationToExperience(
  observation: DomainObservation,
  params: {
    cellId: string;
    cycleNumber: number;
    transactionId: string;
    knowledgeIds: string[];
    category: any;
    outcome: MetabolismStatus;
    noveltyClassification: any;
    noveltyScore: number;
    confidence: number;
    lessonsDerived?: string[];
    priorStateId?: string;
    resultingStateId?: string;
    actionComputationId?: string;
    evidenceIds?: string[];
  }
): { experience: DomainExperience; envelope: DomainTransitionEnvelope } {
  // Validate boundary
  if (observation.domainKind !== DomainKind.OBSERVATION) {
    throw new SemanticBoundaryViolationError(
      DomainKind.OBSERVATION,
      (observation as any).domainKind || 'UNKNOWN',
      'Input must be a valid DomainObservation'
    );
  }

  // Explicit check: reject ComputationResult passed as Observation
  assertNotComputationResult(observation.payload, 'ObservationToExperienceTransition');

  const timestamp = new Date().toISOString();
  const experienceSeed = {
    cellId: params.cellId,
    observationId: observation.deterministicId,
    transactionId: params.transactionId,
    cycleNumber: params.cycleNumber,
    priorStateId: params.priorStateId,
    timestamp
  };
  const deterministicId = `exp_${computeCanonicalHash(experienceSeed).substring(0, 24)}`;

  const causalReferences: CausalReference[] = [
    {
      antecedentDomain: DomainKind.OBSERVATION,
      antecedentId: observation.deterministicId,
      relation: 'METABOLIZED_INTO_EXPERIENCE'
    }
  ];

  if (params.actionComputationId) {
    causalReferences.push({
      antecedentDomain: DomainKind.COMPUTATION_RESULT,
      antecedentId: params.actionComputationId,
      relation: 'ACTION_COMPUTATION_CONTEXT'
    });
  }

  const causalLinks = {
    triggeringObservationId: observation.deterministicId,
    priorStateId: params.priorStateId,
    resultingStateId: params.resultingStateId,
    actionComputationId: params.actionComputationId,
    evidenceIds: params.evidenceIds,
    cycleNumber: params.cycleNumber
  };

  const experience: DomainExperience = DomainExperienceSchema.parse({
    contractVersion: 1,
    domainKind: DomainKind.EXPERIENCE,
    deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: [...observation.provenance, params.cellId, 'METABOLISM'],
    confidence: params.confidence,
    status: params.outcome,
    persistenceSemantics: {
      category: MemoryCategory.EPISODIC,
      storageKey: `experience_${deterministicId}`,
      immutable: true,
      retentionPolicy: 'RETAIN_INDEFINITELY'
    },
    payload: {
      experienceId: deterministicId,
      transactionId: params.transactionId,
      cellId: params.cellId,
      timestamp,
      informationId: (observation.payload as any).informationId || (observation.payload as any).observationId || observation.deterministicId,
      knowledgeIds: params.knowledgeIds,
      category: params.category,
      outcome: params.outcome,
      noveltyClassification: params.noveltyClassification,
      noveltyScore: params.noveltyScore,
      source: (observation.payload as any).sourceIdentifier || (observation.payload as any).source || observation.source || 'observation_source',
      confidence: params.confidence,
      lessonsDerived: params.lessonsDerived,
      observationId: observation.deterministicId,
      priorStateId: params.priorStateId,
      resultingStateId: params.resultingStateId,
      actionComputationId: params.actionComputationId,
      evidenceIds: params.evidenceIds,
      cycleNumber: params.cycleNumber,
      causalLinks
    }
  });

  const transitionSeed = {
    sourceId: observation.deterministicId,
    targetId: experience.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp
  };

  const envelope: DomainTransitionEnvelope = DomainTransitionEnvelopeSchema.parse({
    transitionId: `tx_obs_to_exp_${computeCanonicalHash(transitionSeed).substring(0, 20)}`,
    sourceDomain: DomainKind.OBSERVATION,
    targetDomain: DomainKind.EXPERIENCE,
    sourceId: observation.deterministicId,
    targetId: experience.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: experience.provenance,
    confidence: params.confidence,
    status: 'COMMITTED',
    persistenceSemantics: experience.persistenceSemantics,
    deterministicHash: computeCanonicalHash(experience)
  });

  return { experience, envelope };
}

/**
 * Transition 2: Experience -> Evidence
 * Grounds an episodic Experience into a normative, proposition-targeting Evidence.
 * Enforces: Observation ≠ Experience, Experience ≠ Evidence.
 */
export function transitionExperienceToEvidence(
  experience: DomainExperience,
  params: {
    cellId: string;
    cycleNumber: number;
    context: { contextId: string; domain: string; temporalBounds?: { start?: number; end?: number } };
    targetHypothesisId?: string;
    polarity: 'SUPPORTING' | 'CONTRADICTING' | 'NEUTRAL';
    confidence: number;
    supportingRepresentationIds?: string[];
    contradictingRepresentationIds?: string[];
  }
): { evidence: DomainEvidence; envelope: DomainTransitionEnvelope } {
  // Validate boundary
  if (experience.domainKind !== DomainKind.EXPERIENCE) {
    throw new SemanticBoundaryViolationError(
      DomainKind.EXPERIENCE,
      (experience as any).domainKind || 'UNKNOWN',
      'Input must be a valid DomainExperience'
    );
  }

  // Reject raw observation
  assertNotObservation(experience.payload, 'ExperienceToEvidenceTransition');

  const timestamp = new Date().toISOString();
  const evidenceSeed = {
    cellId: params.cellId,
    experienceId: experience.deterministicId,
    contextId: params.context.contextId,
    targetHypothesisId: params.targetHypothesisId || 'general_grounding',
    cycleNumber: params.cycleNumber,
    timestamp
  };
  const deterministicId = `ev_${computeCanonicalHash(evidenceSeed).substring(0, 24)}`;

  const causalReferences: CausalReference[] = [
    {
      antecedentDomain: DomainKind.EXPERIENCE,
      antecedentId: experience.deterministicId,
      relation: 'EVALUATED_AS_EVIDENCE'
    }
  ];

  const evidence: DomainEvidence = DomainEvidenceSchema.parse({
    contractVersion: 1,
    domainKind: DomainKind.EVIDENCE,
    deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: [...experience.provenance, params.cellId, 'EPISTEMIC_GROUNDING'],
    confidence: params.confidence,
    status: params.polarity,
    targetHypothesisId: params.targetHypothesisId,
    persistenceSemantics: {
      category: MemoryCategory.SEMANTIC,
      storageKey: `evidence_${deterministicId}`,
      immutable: true,
      retentionPolicy: 'RETAIN_INDEFINITELY'
    },
    payload: {
      evidenceId: deterministicId,
      sourceId: experience.deterministicId,
      observationId: experience.payload.informationId,
      timestamp,
      provenance: {
        sourceId: params.cellId,
        timestamp,
        derivedFrom: [experience.deterministicId],
        supportingRepresentationIds: params.supportingRepresentationIds,
        contradictingRepresentationIds: params.contradictingRepresentationIds
      },
      context: params.context,
      confidence: params.confidence
    }
  });

  const transitionSeed = {
    sourceId: experience.deterministicId,
    targetId: evidence.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp
  };

  const envelope: DomainTransitionEnvelope = DomainTransitionEnvelopeSchema.parse({
    transitionId: `tx_exp_to_ev_${computeCanonicalHash(transitionSeed).substring(0, 20)}`,
    sourceDomain: DomainKind.EXPERIENCE,
    targetDomain: DomainKind.EVIDENCE,
    sourceId: experience.deterministicId,
    targetId: evidence.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: evidence.provenance,
    confidence: params.confidence,
    status: 'COMMITTED',
    persistenceSemantics: evidence.persistenceSemantics,
    deterministicHash: computeCanonicalHash(evidence)
  });

  return { evidence, envelope };
}

/**
 * Transition 3: Evidence[] -> Epistemic Truth
 * Fuses one or more Evidences into an Epistemic Truth (EpistemicState).
 * Enforces: Experience ≠ Evidence, Evidence ≠ Truth.
 */
export function transitionEvidencesToEpistemicTruth(
  evidences: DomainEvidence[],
  params: {
    cellId: string;
    cycleNumber: number;
    conceptOrPropositionId: string;
    status: EpistemicStatus;
    opinion: SubjectiveOpinion;
    context: { contextId: string; domain: string; temporalBounds?: { start?: number; end?: number } };
    previousStateId?: string;
    transitionReason: string;
  }
): { epistemicTruth: DomainEpistemicTruth; envelope: DomainTransitionEnvelope } {
  if (!evidences || evidences.length === 0) {
    throw new InvalidDomainTransitionError(
      DomainKind.EVIDENCE,
      DomainKind.EPISTEMIC_TRUTH,
      'Epistemic truth requires at least one supporting/contradicting DomainEvidence'
    );
  }

  for (const ev of evidences) {
    if (ev.domainKind !== DomainKind.EVIDENCE) {
      throw new SemanticBoundaryViolationError(
        DomainKind.EVIDENCE,
        (ev as any).domainKind || 'UNKNOWN',
        'All fusion inputs must be valid DomainEvidence'
      );
    }
    // Reject Experience masquerading as Evidence
    assertNotExperience(ev.payload, 'EvidencesToTruthTransition');
    // Reject Truth masquerading as atomic Evidence
    assertNotTruth(ev.payload, 'EvidencesToTruthTransition');
  }

  const timestamp = new Date().toISOString();
  const truthSeed = {
    cellId: params.cellId,
    conceptId: params.conceptOrPropositionId,
    evidenceIds: evidences.map(e => e.deterministicId).sort(),
    cycleNumber: params.cycleNumber,
    timestamp
  };
  const deterministicId = `truth_${computeCanonicalHash(truthSeed).substring(0, 24)}`;

  const causalReferences: CausalReference[] = evidences.map(e => ({
    antecedentDomain: DomainKind.EVIDENCE,
    antecedentId: e.deterministicId,
    relation: 'EPISTEMIC_FUSION_CONSTITUENT'
  }));

  const allProvenance = Array.from(
    new Set([...evidences.flatMap(e => e.provenance), params.cellId, 'EPISTEMIC_FUSION'])
  );

  const confidence = params.opinion.belief / (params.opinion.belief + params.opinion.disbelief + params.opinion.uncertainty || 1.0);

  const epistemicTruth: DomainEpistemicTruth = DomainEpistemicTruthSchema.parse({
    contractVersion: 1,
    domainKind: DomainKind.EPISTEMIC_TRUTH,
    deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: allProvenance,
    confidence,
    status: params.status,
    opinion: params.opinion,
    persistenceSemantics: {
      category: MemoryCategory.SEMANTIC,
      storageKey: `epistemic_truth_${deterministicId}`,
      immutable: true,
      retentionPolicy: 'RETAIN_INDEFINITELY'
    },
    payload: {
      stateId: deterministicId,
      status: params.status,
      opinion: params.opinion,
      verificationStatus: params.status === EpistemicStatus.VERIFIED ? 'VERIFIED' : 'SUPPORTED',
      context: params.context,
      rawConfidence: confidence,
      previousStateId: params.previousStateId,
      transitionReason: params.transitionReason,
      evidenceIds: evidences.map(e => e.deterministicId),
      createdAt: timestamp
    }
  });

  const transitionSeed = {
    sourceId: evidences.map(e => e.deterministicId).join(','),
    targetId: epistemicTruth.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp
  };

  const envelope: DomainTransitionEnvelope = DomainTransitionEnvelopeSchema.parse({
    transitionId: `tx_ev_to_truth_${computeCanonicalHash(transitionSeed).substring(0, 20)}`,
    sourceDomain: DomainKind.EVIDENCE,
    targetDomain: DomainKind.EPISTEMIC_TRUTH,
    sourceId: evidences[0].deterministicId,
    targetId: epistemicTruth.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: epistemicTruth.provenance,
    confidence,
    status: 'COMMITTED',
    persistenceSemantics: epistemicTruth.persistenceSemantics,
    deterministicHash: computeCanonicalHash(epistemicTruth)
  });

  return { epistemicTruth, envelope };
}

/**
 * Transition 4: Epistemic Grounding / Experience -> Learning Update (Ontogenetic Plasticity)
 * Updates internal conceptual graph weights within a cell's lifetime.
 * Enforces: LearningUpdate ≠ EvolutionTelemetry.
 */
export function transitionToLearningUpdate(
  sourceObj: DomainExperience | DomainEvidence,
  params: {
    cellId: string;
    cycleNumber: number;
    conceptsStrengthened: string[];
    conceptsWeakened: string[];
    relationsStrengthened: string[];
    relationsWeakened: string[];
    conflictsDetected: number;
    deltaWeights?: Record<string, number>;
    triggerReason: string;
  }
): { learningUpdate: DomainLearningUpdate; envelope: DomainTransitionEnvelope } {
  if (sourceObj.domainKind !== DomainKind.EXPERIENCE && sourceObj.domainKind !== DomainKind.EVIDENCE) {
    throw new SemanticBoundaryViolationError(
      'EXPERIENCE | EVIDENCE',
      (sourceObj as any).domainKind || 'UNKNOWN',
      'Learning update must be grounded in an Experience or Evidence'
    );
  }

  // Reject EvolutionTelemetry passed as LearningUpdate source
  assertNotEvolutionTelemetry(sourceObj.payload, 'LearningUpdateTransition');

  const timestamp = new Date().toISOString();
  const learningSeed = {
    cellId: params.cellId,
    sourceId: sourceObj.deterministicId,
    cycleNumber: params.cycleNumber,
    timestamp
  };
  const deterministicId = `learn_${computeCanonicalHash(learningSeed).substring(0, 24)}`;

  const causalReferences: CausalReference[] = [
    {
      antecedentDomain: sourceObj.domainKind,
      antecedentId: sourceObj.deterministicId,
      relation: 'ONTOGENETIC_WEIGHT_ADAPTATION'
    }
  ];

  const status = params.conflictsDetected > 0 ? 'CONFLICT_DETECTED' : 'APPLIED';

  const learningUpdate: DomainLearningUpdate = DomainLearningUpdateSchema.parse({
    contractVersion: 1,
    domainKind: DomainKind.LEARNING_UPDATE,
    deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: [...sourceObj.provenance, params.cellId, 'COGNITIVE_DEVELOPMENT'],
    confidence: sourceObj.confidence || 0.8,
    status,
    persistenceSemantics: {
      category: MemoryCategory.PROCEDURAL,
      storageKey: `learning_${deterministicId}`,
      immutable: true,
      retentionPolicy: 'RETAIN_INDEFINITELY'
    },
    payload: {
      learningId: deterministicId,
      conceptsStrengthened: params.conceptsStrengthened,
      conceptsWeakened: params.conceptsWeakened,
      relationsStrengthened: params.relationsStrengthened,
      relationsWeakened: params.relationsWeakened,
      conflictsDetected: params.conflictsDetected,
      deltaWeights: params.deltaWeights || {},
      triggerReason: params.triggerReason
    }
  });

  const transitionSeed = {
    sourceId: sourceObj.deterministicId,
    targetId: learningUpdate.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp
  };

  const envelope: DomainTransitionEnvelope = DomainTransitionEnvelopeSchema.parse({
    transitionId: `tx_to_learn_${computeCanonicalHash(transitionSeed).substring(0, 20)}`,
    sourceDomain: sourceObj.domainKind,
    targetDomain: DomainKind.LEARNING_UPDATE,
    sourceId: sourceObj.deterministicId,
    targetId: learningUpdate.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: learningUpdate.provenance,
    confidence: learningUpdate.confidence,
    status: 'COMMITTED',
    persistenceSemantics: learningUpdate.persistenceSemantics,
    deterministicHash: computeCanonicalHash(learningUpdate)
  });

  return { learningUpdate, envelope };
}

/**
 * Transition 5: Computation / Evaluation -> Evolution Telemetry
 * Computes macroscopic population-level and lineage-level fitness metrics.
 * Enforces: LearningUpdate ≠ EvolutionTelemetry, EvolutionTelemetry ≠ MitosisDecision.
 */
export function transitionToEvolutionTelemetry(
  computationResult: DomainComputationResult,
  params: {
    cellId: string;
    lineageId: string;
    generation: number;
    cycleNumber: number;
    fitnessComponents: FitnessComponents;
    overallFitness: number;
    computationPerformanceScore?: number;
    epistemicContributionScore?: number;
    measurementWindow: { startedAt: string; endedAt: string };
  }
): { evolutionTelemetry: DomainEvolutionTelemetry; envelope: DomainTransitionEnvelope } {
  if (computationResult.domainKind !== DomainKind.COMPUTATION_RESULT) {
    throw new SemanticBoundaryViolationError(
      DomainKind.COMPUTATION_RESULT,
      (computationResult as any).domainKind || 'UNKNOWN',
      'Evolution telemetry must originate from computational evaluation'
    );
  }

  // Reject LearningUpdate passed as EvolutionTelemetry
  assertNotLearningUpdate(computationResult.payload, 'EvolutionTelemetryTransition');

  const timestamp = new Date().toISOString();
  const telemetrySeed = {
    cellId: params.cellId,
    lineageId: params.lineageId,
    generation: params.generation,
    computationId: computationResult.deterministicId,
    cycleNumber: params.cycleNumber,
    timestamp
  };
  const deterministicId = `telem_${computeCanonicalHash(telemetrySeed).substring(0, 24)}`;

  const causalReferences: CausalReference[] = [
    {
      antecedentDomain: DomainKind.COMPUTATION_RESULT,
      antecedentId: computationResult.deterministicId,
      relation: 'PHYLOGENETIC_FITNESS_MEASUREMENT'
    }
  ];

  const evolutionTelemetry: DomainEvolutionTelemetry = DomainEvolutionTelemetrySchema.parse({
    contractVersion: 1,
    domainKind: DomainKind.EVOLUTION_TELEMETRY,
    deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: [...computationResult.provenance, params.cellId, 'EVOLUTION_TELEMETRY'],
    confidence: params.overallFitness,
    status: 'RECORDED',
    persistenceSemantics: {
      category: MemoryCategory.PROCEDURAL,
      storageKey: `telemetry_${deterministicId}`,
      immutable: true,
      retentionPolicy: 'RETAIN_GENERATIONAL'
    },
    payload: {
      telemetryId: deterministicId,
      lineageId: params.lineageId,
      generation: params.generation,
      fitnessComponents: params.fitnessComponents,
      overallFitness: params.overallFitness,
      computationPerformanceScore: params.computationPerformanceScore,
      epistemicContributionScore: params.epistemicContributionScore,
      measurementWindow: params.measurementWindow
    }
  });

  const transitionSeed = {
    sourceId: computationResult.deterministicId,
    targetId: evolutionTelemetry.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp
  };

  const envelope: DomainTransitionEnvelope = DomainTransitionEnvelopeSchema.parse({
    transitionId: `tx_comp_to_telem_${computeCanonicalHash(transitionSeed).substring(0, 20)}`,
    sourceDomain: DomainKind.COMPUTATION_RESULT,
    targetDomain: DomainKind.EVOLUTION_TELEMETRY,
    sourceId: computationResult.deterministicId,
    targetId: evolutionTelemetry.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: evolutionTelemetry.provenance,
    confidence: params.overallFitness,
    status: 'COMMITTED',
    persistenceSemantics: evolutionTelemetry.persistenceSemantics,
    deterministicHash: computeCanonicalHash(evolutionTelemetry)
  });

  return { evolutionTelemetry, envelope };
}

/**
 * Transition 5b: Experience / Learning Update -> Evolution Telemetry
 * Bridges cell-level episodic experience and ontogenetic learning into phylogenetic evolution telemetry.
 * Enforces: Experience ≠ EvolutionTelemetry, LearningUpdate ≠ EvolutionTelemetry, EvolutionTelemetry ≠ MitosisDecision.
 */
export function transitionExperienceToEvolutionTelemetry(
  experience: DomainExperience,
  params: {
    cellId: string;
    lineageId: string;
    generation: number;
    cycleNumber: number;
    learningUpdate?: DomainLearningUpdate;
    fitnessComponents: FitnessComponents;
    overallFitness: number;
    metrics: ExperienceEvolutionMetrics;
    measurementWindow: { startedAt: string; endedAt: string };
  }
): { evolutionTelemetry: DomainEvolutionTelemetry; envelope: DomainTransitionEnvelope } {
  if (experience.domainKind !== DomainKind.EXPERIENCE) {
    throw new SemanticBoundaryViolationError(
      DomainKind.EXPERIENCE,
      (experience as any).domainKind || 'UNKNOWN',
      'Evolution telemetry must originate from a valid DomainExperience'
    );
  }

  if (params?.learningUpdate && params.learningUpdate.domainKind !== DomainKind.LEARNING_UPDATE) {
    throw new SemanticBoundaryViolationError(
      DomainKind.LEARNING_UPDATE,
      (params.learningUpdate as any).domainKind || 'UNKNOWN',
      'Optional learning update must be a valid DomainLearningUpdate'
    );
  }

  // Reject raw observation masquerading as Experience
  assertNotObservation(experience.payload, 'ExperienceToEvolutionTelemetryTransition');
  // Reject MitosisDecision masquerading as input
  assertNotMitosisDecision(experience.payload, 'ExperienceToEvolutionTelemetryTransition');

  const timestamp = new Date().toISOString();
  const telemetrySeed = {
    cellId: params.cellId,
    lineageId: params.lineageId,
    generation: params.generation,
    experienceId: experience.deterministicId,
    learningId: params.learningUpdate?.deterministicId,
    cycleNumber: params.cycleNumber,
    timestamp
  };
  const deterministicId = `telem_exp_${computeCanonicalHash(telemetrySeed).substring(0, 24)}`;

  const causalReferences: CausalReference[] = [
    {
      antecedentDomain: DomainKind.EXPERIENCE,
      antecedentId: experience.deterministicId,
      relation: 'EPISODIC_EXPERIENCE_FITNESS_MEASUREMENT'
    }
  ];

  if (params.learningUpdate) {
    causalReferences.push({
      antecedentDomain: DomainKind.LEARNING_UPDATE,
      antecedentId: params.learningUpdate.deterministicId,
      relation: 'ONTOGENETIC_LEARNING_ADAPTATION_MEASUREMENT'
    });
  }

  const mergedProvenance = Array.from(
    new Set([
      ...experience.provenance,
      ...(params.learningUpdate ? params.learningUpdate.provenance : []),
      params.cellId,
      'EXPERIENCE_EVOLUTION_TELEMETRY'
    ])
  );

  const evolutionTelemetry: DomainEvolutionTelemetry = DomainEvolutionTelemetrySchema.parse({
    contractVersion: 1,
    domainKind: DomainKind.EVOLUTION_TELEMETRY,
    deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: mergedProvenance,
    confidence: params.overallFitness,
    status: 'RECORDED',
    persistenceSemantics: {
      category: MemoryCategory.PROCEDURAL,
      storageKey: `telemetry_${deterministicId}`,
      immutable: true,
      retentionPolicy: 'RETAIN_GENERATIONAL'
    },
    payload: {
      telemetryId: deterministicId,
      lineageId: params.lineageId,
      generation: params.generation,
      fitnessComponents: params.fitnessComponents,
      overallFitness: params.overallFitness,
      sourceExperienceId: experience.deterministicId,
      sourceLearningId: params.learningUpdate?.deterministicId,
      taskOutcome: params.metrics.taskOutcome,
      predictionAccuracy: params.metrics.predictionAccuracy,
      verificationResult: params.metrics.verificationResult,
      confidenceChange: params.metrics.confidenceChange,
      repeatedFailure: params.metrics.repeatedFailure,
      adaptationScore: params.metrics.adaptation.adaptationMagnitude,
      resourceEfficiency: params.metrics.resourceEfficiency,
      robustnessScore: params.metrics.robustness,
      knowledgeOutcomeScore: Math.min(1.0, params.metrics.knowledgeOutcome.conceptsCount / 20.0),
      metrics: { ...params.metrics },
      measurementWindow: params.measurementWindow
    }
  });

  const transitionSeed = {
    sourceId: params.learningUpdate
      ? `${experience.deterministicId},${params.learningUpdate.deterministicId}`
      : experience.deterministicId,
    targetId: evolutionTelemetry.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp
  };

  const envelope: DomainTransitionEnvelope = DomainTransitionEnvelopeSchema.parse({
    transitionId: `tx_exp_to_telem_${computeCanonicalHash(transitionSeed).substring(0, 20)}`,
    sourceDomain: DomainKind.EXPERIENCE,
    targetDomain: DomainKind.EVOLUTION_TELEMETRY,
    sourceId: experience.deterministicId,
    targetId: evolutionTelemetry.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: evolutionTelemetry.provenance,
    confidence: params.overallFitness,
    status: 'COMMITTED',
    persistenceSemantics: evolutionTelemetry.persistenceSemantics,
    deterministicHash: computeCanonicalHash(evolutionTelemetry)
  });

  return { evolutionTelemetry, envelope };
}

/**
 * Transition 6: Governance Evaluation -> Mitosis Decision
 * Evaluates whether a cell is permitted to undergo mitosis.
 * Enforces: EvolutionTelemetry ≠ MitosisDecision, Evidence ≠ MitosisDecision.
 */
export function transitionToMitosisDecision(
  telemetry: DomainEvolutionTelemetry,
  governanceInputs: {
    eventId: string;
    parentCellId: string;
    parentActive: boolean;
    currentPopulation: number;
    populationCeiling: number;
    memoryPressure: number;
    minMemoryPressure: number;
    lastReproductionTimestamp?: number;
    cooldownMs: number;
    authorizationProof?: any;
    requireAuthorization: boolean;
    isAuthorizedProofValid: boolean;
    authorizationState?: string;
    cycleNumber: number;
  }
): { mitosisDecision: DomainMitosisDecision; envelope: DomainTransitionEnvelope } {
  if (telemetry.domainKind !== DomainKind.EVOLUTION_TELEMETRY) {
    throw new SemanticBoundaryViolationError(
      DomainKind.EVOLUTION_TELEMETRY,
      (telemetry as any).domainKind || 'UNKNOWN',
      'Mitosis decision requires valid EvolutionTelemetry context'
    );
  }

  // Reject Evidence passed into Mitosis Decision
  assertNotEvidence(telemetry.payload, 'MitosisDecisionTransition');

  const now = Date.now();
  const timestamp = new Date(now).toISOString();

  // Evaluate governance conditions
  let allowed = true;
  let denialReason = '';

  const parentActive = governanceInputs.parentActive;
  if (!parentActive) {
    allowed = false;
    denialReason = 'Parent cell is not in ACTIVE state';
  }

  const populationCeilingChecked = true;
  if (allowed && governanceInputs.currentPopulation >= governanceInputs.populationCeiling) {
    allowed = false;
    denialReason = `Population ceiling reached (${governanceInputs.currentPopulation}/${governanceInputs.populationCeiling})`;
  }

  const cooldownRemainingMs = governanceInputs.lastReproductionTimestamp
    ? Math.max(0, governanceInputs.cooldownMs - (now - governanceInputs.lastReproductionTimestamp))
    : 0;
  const cooldownChecked = true;
  if (allowed && cooldownRemainingMs > 0) {
    allowed = false;
    denialReason = `Reproduction cooldown active (${cooldownRemainingMs}ms remaining)`;
  }

  const memoryPressureChecked = true;
  if (allowed && governanceInputs.memoryPressure < governanceInputs.minMemoryPressure) {
    allowed = false;
    denialReason = `Insufficient memory pressure (${governanceInputs.memoryPressure.toFixed(2)} < ${governanceInputs.minMemoryPressure.toFixed(2)})`;
  }

  let authorizationVerified = true;
  if (allowed && governanceInputs.requireAuthorization) {
    if (!governanceInputs.authorizationProof || !governanceInputs.isAuthorizedProofValid) {
      allowed = false;
      authorizationVerified = false;
      denialReason = 'Creator authorization verification failed or missing';
    }
  }

  const decisionStatus = allowed ? 'PERMITTED' : 'DENIED';
  const reason = allowed ? 'All governance, cooldown, memory, and authorization constraints met' : denialReason;

  const decisionSeed = {
    parentCellId: governanceInputs.parentCellId,
    eventId: governanceInputs.eventId,
    telemetryId: telemetry.deterministicId,
    cycleNumber: governanceInputs.cycleNumber,
    decision: decisionStatus,
    timestamp
  };
  const deterministicId = `mit_dec_${computeCanonicalHash(decisionSeed).substring(0, 24)}`;

  const causalReferences: CausalReference[] = [
    {
      antecedentDomain: DomainKind.EVOLUTION_TELEMETRY,
      antecedentId: telemetry.deterministicId,
      relation: 'EVALUATED_AGAINST_GOVERNANCE_POLICY'
    }
  ];

  const mitosisDecision: DomainMitosisDecision = DomainMitosisDecisionSchema.parse({
    contractVersion: 1,
    domainKind: DomainKind.MITOSIS_DECISION,
    deterministicId,
    cellId: governanceInputs.parentCellId,
    cycleNumber: governanceInputs.cycleNumber,
    timestamp,
    causalReferences,
    provenance: [...telemetry.provenance, governanceInputs.parentCellId, 'MITOSIS_GOVERNANCE'],
    confidence: 1.0,
    status: decisionStatus,
    persistenceSemantics: {
      category: MemoryCategory.PROCEDURAL,
      storageKey: `mitosis_decision_${deterministicId}`,
      immutable: true,
      retentionPolicy: 'RETAIN_INDEFINITELY'
    },
    payload: {
      decisionId: deterministicId,
      decision: decisionStatus,
      eventId: governanceInputs.eventId,
      parentCellId: governanceInputs.parentCellId,
      reason,
      evaluatedConditions: {
        parentActive,
        populationCeilingChecked,
        currentPopulation: governanceInputs.currentPopulation,
        populationCeiling: governanceInputs.populationCeiling,
        memoryPressureChecked,
        memoryPressure: governanceInputs.memoryPressure,
        minMemoryPressure: governanceInputs.minMemoryPressure,
        cooldownChecked,
        cooldownRemainingMs,
        authorizationVerified
      },
      authorizationState: governanceInputs.authorizationState
    }
  });

  const transitionSeed = {
    sourceId: telemetry.deterministicId,
    targetId: mitosisDecision.deterministicId,
    cellId: governanceInputs.parentCellId,
    cycleNumber: governanceInputs.cycleNumber,
    timestamp
  };

  const envelope: DomainTransitionEnvelope = DomainTransitionEnvelopeSchema.parse({
    transitionId: `tx_telem_to_mit_${computeCanonicalHash(transitionSeed).substring(0, 20)}`,
    sourceDomain: DomainKind.EVOLUTION_TELEMETRY,
    targetDomain: DomainKind.MITOSIS_DECISION,
    sourceId: telemetry.deterministicId,
    targetId: mitosisDecision.deterministicId,
    cellId: governanceInputs.parentCellId,
    cycleNumber: governanceInputs.cycleNumber,
    timestamp,
    causalReferences,
    provenance: mitosisDecision.provenance,
    confidence: 1.0,
    status: decisionStatus,
    persistenceSemantics: mitosisDecision.persistenceSemantics,
    deterministicHash: computeCanonicalHash(mitosisDecision)
  });

  return { mitosisDecision, envelope };
}

// ============================================================================
// P8 RESULT → OBSERVATION → EXPERIENCE SEMANTIC GOVERNORS
// ============================================================================

/**
 * Creates an internal introspective Observation recording the algorithmic execution of a ComputationResult.
 * 
 * Strict Architectural Guarantee:
 * This records ONLY internal execution telemetries (status, latency, verification score).
 * It CANNOT and DOES NOT make any claim or observation regarding the external world state.
 */
export function createInternalObservationFromComputation(
  computation: DomainComputationResult,
  params: {
    cellId: string;
    cycleNumber: number;
    observedSubject?: string;
    metadata?: Record<string, any>;
  }
): { observation: DomainObservation; envelope: DomainTransitionEnvelope } {
  if (computation.domainKind !== DomainKind.COMPUTATION_RESULT) {
    throw new SemanticBoundaryViolationError(
      DomainKind.COMPUTATION_RESULT,
      (computation as any).domainKind || 'UNKNOWN',
      'Input must be a valid DomainComputationResult'
    );
  }

  const timestamp = new Date().toISOString();
  const subject = params.observedSubject || `internal:execution:${computation.deterministicId}`;
  const seed = {
    cellId: params.cellId,
    computationId: computation.deterministicId,
    subject,
    cycleNumber: params.cycleNumber,
    timestamp
  };
  const deterministicId = `obs_int_${computeCanonicalHash(seed).substring(0, 24)}`;

  const causalReferences: CausalReference[] = [
    {
      antecedentDomain: DomainKind.COMPUTATION_RESULT,
      antecedentId: computation.deterministicId,
      relation: 'OBSERVED_INTERNAL_EXECUTION'
    }
  ];

  const observedState = {
    taskId: computation.payload.taskId,
    status: computation.payload.status,
    completedAt: computation.payload.completedAt,
    executionDurationMs: (computation.payload as any).executionDurationMs ?? computation.payload.trace?.dispatches?.reduce((acc, d) => acc + (d.durationMs || 0), 0) ?? 0,
    verificationStatus: computation.payload.verificationStatus,
    deterministicHash: computation.payload.deterministicHash
  };

  const content = JSON.stringify(observedState);
  const contentHash = computeCanonicalHash(observedState);

  const observation: DomainObservation = DomainObservationSchema.parse({
    contractVersion: 1,
    domainKind: DomainKind.OBSERVATION,
    deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    observationType: ObservationType.INTERNAL,
    observedSubject: subject,
    source: 'CELL_RUNTIME',
    causalReferences,
    provenance: [...computation.provenance, params.cellId, 'INTERNAL_INTROSPECTION'],
    confidence: computation.payload.status === ComputationStatus.COMPLETED ? (computation.confidence ?? 1.0) : 0.0,
    status: 'STORED',
    persistenceSemantics: {
      category: MemoryCategory.EPISODIC,
      storageKey: `obs_${deterministicId}`,
      immutable: true,
      retentionPolicy: 'RETAIN_INDEFINITELY'
    },
    payload: {
      observationId: deterministicId,
      informationId: deterministicId,
      observationType: ObservationType.INTERNAL,
      observedSubject: subject,
      source: 'CELL_RUNTIME',
      sourceType: InformationSourceType.CELL_KNOWLEDGE,
      sourceIdentifier: `cell_runtime_${params.cellId}`,
      timestamp,
      acquiredAt: timestamp,
      observedState,
      content,
      contentType: 'application/json',
      language: 'en',
      contentHash,
      observerCellId: params.cellId,
      originatingCellId: params.cellId,
      metadata: params.metadata || {}
    }
  });

  const transitionSeed = {
    sourceId: computation.deterministicId,
    targetId: observation.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp
  };

  const envelope: DomainTransitionEnvelope = DomainTransitionEnvelopeSchema.parse({
    transitionId: `tx_comp_to_int_obs_${computeCanonicalHash(transitionSeed).substring(0, 20)}`,
    sourceDomain: DomainKind.COMPUTATION_RESULT,
    targetDomain: DomainKind.OBSERVATION,
    sourceId: computation.deterministicId,
    targetId: observation.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: observation.provenance,
    confidence: observation.confidence,
    status: 'COMMITTED',
    persistenceSemantics: observation.persistenceSemantics,
    deterministicHash: computeCanonicalHash(observation)
  });

  return { observation, envelope };
}

/**
 * Creates a grounded external Observation representing empirical sensory data,
 * environment probing, or external world verification.
 * 
 * Must have: observed subject, source, timestamp, observation type (EXTERNAL).
 */
export function createExternalObservation(params: {
  cellId: string;
  cycleNumber: number;
  observedSubject: string;
  source: string;
  sourceType?: InformationSourceType;
  timestamp?: string;
  observedState: any;
  content: string;
  contentType?: string;
  confidence?: number;
  causalReferences?: CausalReference[];
  provenance?: string[];
  metadata?: Record<string, any>;
}): DomainObservation {
  const timestamp = params.timestamp || new Date().toISOString();
  const seed = {
    cellId: params.cellId,
    observedSubject: params.observedSubject,
    source: params.source,
    cycleNumber: params.cycleNumber,
    timestamp,
    content: params.content
  };
  const deterministicId = `obs_ext_${computeCanonicalHash(seed).substring(0, 24)}`;
  const contentHash = computeCanonicalHash(params.observedState !== undefined ? params.observedState : params.content);

  const observation: DomainObservation = DomainObservationSchema.parse({
    contractVersion: 1,
    domainKind: DomainKind.OBSERVATION,
    deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    observationType: ObservationType.EXTERNAL,
    observedSubject: params.observedSubject,
    source: params.source,
    confidence: params.confidence ?? 1.0,
    status: 'RECEIVED',
    causalReferences: params.causalReferences || [],
    provenance: params.provenance || [params.cellId, params.source, 'EMPIRICAL_SENSOR'],
    persistenceSemantics: {
      category: MemoryCategory.EPISODIC,
      storageKey: `obs_${deterministicId}`,
      immutable: true,
      retentionPolicy: 'RETAIN_INDEFINITELY'
    },
    payload: {
      observationId: deterministicId,
      informationId: deterministicId,
      observationType: ObservationType.EXTERNAL,
      observedSubject: params.observedSubject,
      source: params.source,
      sourceType: params.sourceType || InformationSourceType.PUBLIC_WEB,
      sourceIdentifier: params.source,
      timestamp,
      acquiredAt: timestamp,
      observedState: params.observedState,
      content: params.content,
      contentType: params.contentType || 'application/json',
      language: 'en',
      contentHash,
      observerCellId: params.cellId,
      metadata: params.metadata || {}
    }
  });

  return observation;
}

/**
 * Evaluates the correlation and concordance between a ComputationResult and an empirical Observation.
 * 
 * Enforces the core Red Queen principle:
 * Computation says: "Cell produced output X."
 * Observation says: "Empirical world shows Y."
 */
export function correlateComputationWithObservation(
  computation: DomainComputationResult,
  observation: DomainObservation,
  options?: {
    expectedSubject?: string;
    comparator?: (computedOutput: any, observedState: any) => boolean;
  }
): {
  isRelevant: boolean;
  concordance: 'CONCORDANT' | 'CONTRADICTORY' | 'IRRELEVANT';
  discrepancyScore: number;
  reason: string;
} {
  // Reject non-conforming domains
  if (computation.domainKind !== DomainKind.COMPUTATION_RESULT) {
    throw new SemanticBoundaryViolationError(
      DomainKind.COMPUTATION_RESULT,
      (computation as any).domainKind || 'UNKNOWN',
      'First argument must be a DomainComputationResult'
    );
  }
  if (observation.domainKind !== DomainKind.OBSERVATION) {
    throw new SemanticBoundaryViolationError(
      DomainKind.OBSERVATION,
      (observation as any).domainKind || 'UNKNOWN',
      'Second argument must be a DomainObservation'
    );
  }

  // Check subject relevance
  const expectedSubject = options?.expectedSubject;
  const observationSubject = observation.observedSubject || (observation.payload as any).observedSubject;

  if (expectedSubject && observationSubject && expectedSubject !== observationSubject) {
    return {
      isRelevant: false,
      concordance: 'IRRELEVANT',
      discrepancyScore: 1.0,
      reason: `Observation subject '${observationSubject}' does not match expected subject '${expectedSubject}'`
    };
  }

  const computedOutput = computation.payload.finalOutput;
  const observedState = (observation.payload as any).observedState !== undefined
    ? (observation.payload as any).observedState
    : observation.payload.content;

  // Custom comparator support
  if (options?.comparator) {
    const isMatch = options.comparator(computedOutput, observedState);
    return {
      isRelevant: true,
      concordance: isMatch ? 'CONCORDANT' : 'CONTRADICTORY',
      discrepancyScore: isMatch ? 0.0 : 1.0,
      reason: isMatch
        ? 'Custom comparator verified concordance between computation output and observation'
        : 'Custom comparator revealed contradiction between computation output and observation'
    };
  }

  // Deep canonical equality comparison
  const hashComputed = computeCanonicalHash(computedOutput);
  const hashObserved = computeCanonicalHash(observedState);

  if (hashComputed === hashObserved) {
    return {
      isRelevant: true,
      concordance: 'CONCORDANT',
      discrepancyScore: 0.0,
      reason: 'Canonical hash of computation output matches empirical observation state'
    };
  }

  // Semantic/Partial check if both are objects
  if (
    typeof computedOutput === 'object' && computedOutput !== null &&
    typeof observedState === 'object' && observedState !== null
  ) {
    const keys = Object.keys(computedOutput);
    let matchedKeys = 0;
    let totalCompared = 0;

    for (const key of keys) {
      if (key in observedState) {
        totalCompared++;
        if (JSON.stringify((computedOutput as any)[key]) === JSON.stringify((observedState as any)[key])) {
          matchedKeys++;
        }
      }
    }

    if (totalCompared > 0) {
      const matchRatio = matchedKeys / totalCompared;
      const discrepancyScore = 1.0 - matchRatio;
      const isConcordant = discrepancyScore <= 0.2; // 80%+ match
      return {
        isRelevant: true,
        concordance: isConcordant ? 'CONCORDANT' : 'CONTRADICTORY',
        discrepancyScore,
        reason: isConcordant
          ? `High concordance (${(matchRatio * 100).toFixed(1)}% agreement) between computed prediction and observation`
          : `Significant discrepancy (${(discrepancyScore * 100).toFixed(1)}% disagreement) between computed prediction and observation`
      };
    }
  }

  return {
    isRelevant: true,
    concordance: 'CONTRADICTORY',
    discrepancyScore: 1.0,
    reason: `Computation output differs from empirical observation: computed '${hashComputed.substring(0, 12)}' vs observed '${hashObserved.substring(0, 12)}'`
  };
}

/**
 * Runtime Boundary Assertion:
 * Enforces: "Jangan menyebut computation success sebagai world success."
 * 
 * Rejects any assertion of world success based solely on computation success
 * without a validating empirical observation.
 */
export function assertComputationNotEquatedToWorldSuccess(
  computation: DomainComputationResult,
  observation?: DomainObservation,
  contextDescription: string = 'WorldSuccessEvaluation'
): void {
  if (computation.payload.status === ComputationStatus.COMPLETED && !observation) {
    throw new SemanticBoundaryViolationError(
      'EMPIRICAL_WORLD_EVIDENCE',
      DomainKind.COMPUTATION_RESULT,
      `[${contextDescription}] Illegal claim of world success: P8 computation executed successfully, but no empirical observation confirms world change. Computation success ≠ world success.`
    );
  }

  if (observation) {
    const correlation = correlateComputationWithObservation(computation, observation);
    if (correlation.concordance === 'CONTRADICTORY') {
      throw new SemanticBoundaryViolationError(
        'CONFIRMED_WORLD_STATE',
        DomainKind.OBSERVATION,
        `[${contextDescription}] World discrepancy: Computation succeeded internally, but empirical observation contradicts computed expectations (${correlation.reason}). Computation success ≠ world success.`
      );
    }
  }
}

/**
 * Transition: ComputationResult + Observation -> Experience
 * 
 * Evaluates whether a computation and an empirical observation combine into an episodic Experience:
 * 
 * Case 1: Computation failed -> Cannot produce world success experience.
 * Case 2: P8 Success WITHOUT Observation -> Returns null experience / execution recorded only.
 *         "ComputationResult tetap diperlakukan sebagai hasil eksekusi sampai ada observation yang relevan."
 * Case 3: P8 + Valid Concordant Observation -> Produces Experience with CONFIRMED_BY_WORLD / REINFORCEMENT.
 * Case 4: P8 + Conflicting Observation -> Produces Experience with CONTRADICTED_BY_WORLD / CONTRADICTION.
 *         Demonstrates clearly that computation success ≠ world success.
 */
export function transitionComputationAndObservationToExperience(
  computation: DomainComputationResult,
  observation: DomainObservation | undefined,
  params: {
    cellId: string;
    cycleNumber: number;
    transactionId: string;
    knowledgeIds?: string[];
    category?: InformationCategory;
    expectedSubject?: string;
    comparator?: (computedOutput: any, observedState: any) => boolean;
    priorStateId?: string;
    resultingStateId?: string;
  }
): {
  experience: DomainExperience | null;
  envelope?: DomainTransitionEnvelope;
  canProduceExperience: boolean;
  concordance: 'CONCORDANT' | 'CONTRADICTORY' | 'AWAITING_OBSERVATION' | 'COMPUTATION_FAILED';
  reason: string;
} {
  // Reject non-computation inputs
  if (computation.domainKind !== DomainKind.COMPUTATION_RESULT) {
    throw new SemanticBoundaryViolationError(
      DomainKind.COMPUTATION_RESULT,
      (computation as any).domainKind || 'UNKNOWN',
      'Input must be a valid DomainComputationResult'
    );
  }

  // Case 1: Computation Failed
  if (computation.payload.status !== ComputationStatus.COMPLETED) {
    return {
      experience: null,
      canProduceExperience: false,
      concordance: 'COMPUTATION_FAILED',
      reason: `Computation task '${computation.payload.taskId}' ended with status '${computation.payload.status}'. Failed computation cannot produce world experience.`
    };
  }

  // Case 2: P8 Success WITHOUT Observation (or without relevant Observation)
  if (!observation) {
    return {
      experience: null,
      canProduceExperience: false,
      concordance: 'AWAITING_OBSERVATION',
      reason: 'Computation completed successfully, but remains strictly an execution result until a relevant empirical observation is received. Computation success ≠ world success.'
    };
  }

  // Evaluate correlation with Observation
  const correlation = correlateComputationWithObservation(computation, observation, {
    expectedSubject: params.expectedSubject,
    comparator: params.comparator
  });

  if (!correlation.isRelevant) {
    return {
      experience: null,
      canProduceExperience: false,
      concordance: 'AWAITING_OBSERVATION',
      reason: `Observation is not relevant to this computation: ${correlation.reason}`
    };
  }

  const timestamp = new Date().toISOString();
  const seed = {
    cellId: params.cellId,
    computationId: computation.deterministicId,
    observationId: observation.deterministicId,
    concordance: correlation.concordance,
    transactionId: params.transactionId,
    cycleNumber: params.cycleNumber,
    timestamp
  };
  const deterministicId = `exp_${computeCanonicalHash(seed).substring(0, 24)}`;

  const causalReferences: CausalReference[] = [
    {
      antecedentDomain: DomainKind.COMPUTATION_RESULT,
      antecedentId: computation.deterministicId,
      relation: 'COMPUTATIONAL_PREDICTION_EVALUATED'
    },
    {
      antecedentDomain: DomainKind.OBSERVATION,
      antecedentId: observation.deterministicId,
      relation: correlation.concordance === 'CONCORDANT'
        ? 'EMPIRICAL_CONFIRMATION'
        : 'EMPIRICAL_CONTRADICTION'
    }
  ];

  const mergedProvenance = Array.from(
    new Set([...computation.provenance, ...observation.provenance, params.cellId, 'METABOLISM_GROUNDING'])
  );

  const isConcordant = correlation.concordance === 'CONCORDANT';
  const noveltyClassification = isConcordant
    ? NoveltyClassification.REINFORCEMENT
    : NoveltyClassification.CONTRADICTION;

  const verificationStatus = isConcordant
    ? 'CONFIRMED_BY_WORLD'
    : 'CONTRADICTED_BY_WORLD';

  const computationConfidence = computation.confidence ?? (computation.payload.verificationStatus?.verified ? 1.0 : 0.5);
  const observationConfidence = observation.confidence ?? 1.0;
  const baseConfidence = (computationConfidence + observationConfidence) / 2;
  const experienceConfidence = isConcordant
    ? Math.min(1.0, baseConfidence * (1.0 - correlation.discrepancyScore * 0.5))
    : Math.max(0.1, (1.0 - correlation.discrepancyScore) * observationConfidence);

  const lessonsDerived = isConcordant
    ? ['computational_prediction_concordant_with_empirical_world']
    : [
        'world_state_diverged_from_computational_prediction',
        'computational_model_rupture_detected',
        'negative_epistemic_feedback_recorded'
      ];

  const experience: DomainExperience = DomainExperienceSchema.parse({
    contractVersion: 1,
    domainKind: DomainKind.EXPERIENCE,
    deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: mergedProvenance,
    confidence: experienceConfidence,
    status: MetabolismStatus.ACCEPTED,
    persistenceSemantics: {
      category: MemoryCategory.EPISODIC,
      storageKey: `experience_${deterministicId}`,
      immutable: true,
      retentionPolicy: 'RETAIN_INDEFINITELY'
    },
    payload: {
      experienceId: deterministicId,
      transactionId: params.transactionId,
      cellId: params.cellId,
      timestamp,
      informationId: (observation.payload as any).informationId || observation.deterministicId,
      knowledgeIds: params.knowledgeIds || [],
      category: params.category || InformationCategory.GENERAL_TECHNOLOGY,
      outcome: MetabolismStatus.ACCEPTED,
      noveltyClassification,
      noveltyScore: isConcordant ? 0.2 : 0.9,
      source: observation.source || (observation.payload as any).sourceIdentifier || 'empirical_observation',
      confidence: experienceConfidence,
      verificationStatus,
      lessonsDerived,
      observationId: observation.deterministicId,
      priorStateId: params.priorStateId,
      resultingStateId: params.resultingStateId,
      actionComputationId: computation.deterministicId,
      evidenceIds: [],
      cycleNumber: params.cycleNumber,
      causalLinks: {
        triggeringObservationId: observation.deterministicId,
        priorStateId: params.priorStateId,
        resultingStateId: params.resultingStateId,
        actionComputationId: computation.deterministicId,
        evidenceIds: [],
        cycleNumber: params.cycleNumber
      }
    }
  });

  const transitionSeed = {
    sourceId: `${computation.deterministicId},${observation.deterministicId}`,
    targetId: experience.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp
  };

  const envelope: DomainTransitionEnvelope = DomainTransitionEnvelopeSchema.parse({
    transitionId: `tx_comp_obs_to_exp_${computeCanonicalHash(transitionSeed).substring(0, 20)}`,
    sourceDomain: DomainKind.OBSERVATION,
    targetDomain: DomainKind.EXPERIENCE,
    sourceId: observation.deterministicId,
    targetId: experience.deterministicId,
    cellId: params.cellId,
    cycleNumber: params.cycleNumber,
    timestamp,
    causalReferences,
    provenance: experience.provenance,
    confidence: experienceConfidence,
    status: 'COMMITTED',
    persistenceSemantics: experience.persistenceSemantics,
    deterministicHash: computeCanonicalHash(experience)
  });

  return {
    experience,
    envelope,
    canProduceExperience: true,
    concordance: correlation.concordance as 'CONCORDANT' | 'CONTRADICTORY',
    reason: isConcordant
      ? 'Empirical observation confirmed computation output. Experience recorded with positive reinforcement.'
      : 'Empirical observation contradicted computation output. Experience recorded with contradiction/rupture.'
  };
}

