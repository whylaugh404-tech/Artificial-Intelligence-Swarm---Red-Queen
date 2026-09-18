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
  CausalReference
} from './types';
import {
  SemanticBoundaryViolationError,
  InvalidDomainTransitionError
} from './errors';
import { EpistemicStatus, SubjectiveOpinion } from '../cognition/epistemic/types';
import { MetabolismStatus } from '../metabolism/types';
import { FitnessComponents } from '../evolution/types';

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
      informationId: observation.payload.informationId,
      knowledgeIds: params.knowledgeIds,
      category: params.category,
      outcome: params.outcome,
      noveltyClassification: params.noveltyClassification,
      noveltyScore: params.noveltyScore,
      source: observation.payload.sourceIdentifier,
      confidence: params.confidence,
      lessonsDerived: params.lessonsDerived
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
