import { z } from 'zod';
import { ComputationResult, ComputationResultSchema, ComputationStatus, ComputationStatusSchema } from '../cognition/computation/types';
import { InformationRecord, InformationRecordSchema, InformationSourceType, InformationSourceTypeSchema, Experience, ExperienceSchema, MetabolismStatus, MetabolismStatusSchema } from '../metabolism/types';
import { Evidence, EvidenceSchema } from '../cognition/evidence/types';
import { EpistemicState, EpistemicStateSchema, EpistemicStatus, EpistemicStatusSchema, SubjectiveOpinion, SubjectiveOpinionSchema } from '../cognition/epistemic/types';
import { FitnessComponents, FitnessComponentsSchema } from '../evolution/types';
import { MemoryCategory } from '../memory/store';

/**
 * RED QUEEN FEEDBACK DOMAIN ARCHITECTURE
 * 
 * Strict Domain Separation:
 * ComputationResult ≠ Observation
 * Observation ≠ Experience
 * Experience ≠ Evidence
 * Evidence ≠ Truth (Epistemic Truth)
 * LearningUpdate ≠ EvolutionTelemetry
 * EvolutionTelemetry ≠ MitosisDecision
 * 
 * Principle: NO "UniversalFeedback" object that conflates distinct organs.
 */

export enum DomainKind {
  COMPUTATION_RESULT = 'COMPUTATION_RESULT',
  OBSERVATION = 'OBSERVATION',
  EXPERIENCE = 'EXPERIENCE',
  EVIDENCE = 'EVIDENCE',
  EPISTEMIC_TRUTH = 'EPISTEMIC_TRUTH',
  LEARNING_UPDATE = 'LEARNING_UPDATE',
  EVOLUTION_TELEMETRY = 'EVOLUTION_TELEMETRY',
  MITOSIS_DECISION = 'MITOSIS_DECISION'
}

export const DomainKindSchema = z.nativeEnum(DomainKind);

/**
 * Causal Reference binding transitions between domain boundaries
 */
export const CausalReferenceSchema = z.object({
  antecedentDomain: DomainKindSchema,
  antecedentId: z.string().min(1),
  relation: z.string().min(1)
});

export type CausalReference = z.infer<typeof CausalReferenceSchema>;

/**
 * Explicit Persistence Semantics for each Domain Contract
 */
export const DomainPersistenceSemanticsSchema = z.object({
  category: z.nativeEnum(MemoryCategory),
  storageKey: z.string().min(1),
  immutable: z.boolean().default(true),
  ttlMs: z.number().int().positive().optional(),
  retentionPolicy: z.enum(['RETAIN_INDEFINITELY', 'RETAIN_GENERATIONAL', 'TRANSIENT_CYCLE']).default('RETAIN_INDEFINITELY')
});

export type DomainPersistenceSemantics = z.infer<typeof DomainPersistenceSemanticsSchema>;

/**
 * Base Domain Contract attributes required across all organs
 */
const BaseContractFields = {
  contractVersion: z.literal(1).default(1),
  deterministicId: z.string().min(1),
  cellId: z.string().min(1),
  cycleNumber: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  causalReferences: z.array(CausalReferenceSchema).default([]),
  provenance: z.array(z.string()).min(1),
  persistenceSemantics: DomainPersistenceSemanticsSchema
};

// 1. Computation Result Domain Contract
export const DomainComputationResultSchema = z.object({
  ...BaseContractFields,
  domainKind: z.literal(DomainKind.COMPUTATION_RESULT),
  confidence: z.number().min(0).max(1).optional(),
  status: ComputationStatusSchema,
  payload: ComputationResultSchema
});

export type DomainComputationResult = z.infer<typeof DomainComputationResultSchema>;

// 2. Observation Domain Contract
export enum ObservationType {
  INTERNAL = 'INTERNAL',
  EXTERNAL = 'EXTERNAL'
}

export const ObservationTypeSchema = z.nativeEnum(ObservationType);

export const StructuredObservationSchema = z.object({
  observationId: z.string().min(1).max(256),
  informationId: z.string().min(1).max(256).optional(),
  observationType: ObservationTypeSchema.default(ObservationType.EXTERNAL),
  observedSubject: z.string().min(1).max(1024),
  source: z.string().min(1).max(1024),
  sourceType: InformationSourceTypeSchema.default(InformationSourceType.CELL_KNOWLEDGE),
  sourceIdentifier: z.string().min(1).max(1024).optional(),
  sourceUri: z.string().max(2048).optional(),
  timestamp: z.string().datetime(),
  acquiredAt: z.string().datetime().optional(),
  observedState: z.any().optional(),
  content: z.string().min(1),
  contentType: z.string().min(1).max(128).default('application/json'),
  language: z.string().min(2).max(16).default('en'),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/, 'Must be a 64-character lowercase hex SHA-256 hash'),
  observerCellId: z.string().max(256).optional(),
  originatingCellId: z.string().max(256).optional(),
  metadata: z.record(z.string(), z.any()).default({})
});

export type StructuredObservation = z.infer<typeof StructuredObservationSchema>;

export const ObservationPayloadSchema = z.union([
  StructuredObservationSchema,
  InformationRecordSchema
]);

export type ObservationPayload = z.infer<typeof ObservationPayloadSchema>;

export const DomainObservationSchema = z.object({
  ...BaseContractFields,
  domainKind: z.literal(DomainKind.OBSERVATION),
  observationType: ObservationTypeSchema.optional(),
  observedSubject: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  status: z.enum(['RECEIVED', 'NORMALIZED', 'FILTERED', 'STORED']),
  payload: ObservationPayloadSchema
});

export type DomainObservation = z.infer<typeof DomainObservationSchema>;

// 3. Experience Domain Contract
export const DomainExperienceSchema = z.object({
  ...BaseContractFields,
  domainKind: z.literal(DomainKind.EXPERIENCE),
  confidence: z.number().min(0).max(1),
  status: MetabolismStatusSchema,
  payload: ExperienceSchema
});

export type DomainExperience = z.infer<typeof DomainExperienceSchema>;

// 4. Evidence Domain Contract
export const DomainEvidenceSchema = z.object({
  ...BaseContractFields,
  domainKind: z.literal(DomainKind.EVIDENCE),
  confidence: z.number().min(0).max(1),
  status: z.enum(['SUPPORTING', 'CONTRADICTING', 'NEUTRAL']),
  targetHypothesisId: z.string().min(1).optional(),
  payload: EvidenceSchema
});

export type DomainEvidence = z.infer<typeof DomainEvidenceSchema>;

// 5. Epistemic Truth Domain Contract
export const DomainEpistemicTruthSchema = z.object({
  ...BaseContractFields,
  domainKind: z.literal(DomainKind.EPISTEMIC_TRUTH),
  confidence: z.number().min(0).max(1),
  status: EpistemicStatusSchema,
  opinion: SubjectiveOpinionSchema.optional(),
  payload: EpistemicStateSchema
});

export type DomainEpistemicTruth = z.infer<typeof DomainEpistemicTruthSchema>;

// 6. Learning Update Domain Contract (Ontogenetic Plasticity)
export const LearningUpdatePayloadSchema = z.object({
  learningId: z.string().min(1),
  conceptsStrengthened: z.array(z.string()).default([]),
  conceptsWeakened: z.array(z.string()).default([]),
  relationsStrengthened: z.array(z.string()).default([]),
  relationsWeakened: z.array(z.string()).default([]),
  conflictsDetected: z.number().int().nonnegative().default(0),
  deltaWeights: z.record(z.string(), z.number()).default({}),
  triggerReason: z.string().min(1)
});

export type LearningUpdatePayload = z.infer<typeof LearningUpdatePayloadSchema>;

export const DomainLearningUpdateSchema = z.object({
  ...BaseContractFields,
  domainKind: z.literal(DomainKind.LEARNING_UPDATE),
  confidence: z.number().min(0).max(1),
  status: z.enum(['APPLIED', 'REJECTED', 'CONFLICT_DETECTED']),
  payload: LearningUpdatePayloadSchema
});

export type DomainLearningUpdate = z.infer<typeof DomainLearningUpdateSchema>;

// 7. Evolution Telemetry Domain Contract (Phylogenetic Metrics)
export const EvolutionTelemetryPayloadSchema = z.object({
  telemetryId: z.string().min(1),
  lineageId: z.string().min(1),
  generation: z.number().int().nonnegative(),
  fitnessComponents: FitnessComponentsSchema,
  overallFitness: z.number().min(0).max(1),
  computationPerformanceScore: z.number().min(0).max(1).optional(),
  epistemicContributionScore: z.number().min(0).max(1).optional(),
  measurementWindow: z.object({
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime()
  }),
  sourceExperienceId: z.string().optional(),
  sourceLearningId: z.string().optional(),
  taskOutcome: z.string().optional(),
  predictionAccuracy: z.number().min(0).max(1).optional(),
  verificationResult: z.string().optional(),
  confidenceChange: z.number().min(-1).max(1).optional(),
  repeatedFailure: z.number().int().nonnegative().optional(),
  adaptationScore: z.number().min(0).max(1).optional(),
  resourceEfficiency: z.number().min(0).max(1).optional(),
  robustnessScore: z.number().min(0).max(1).optional(),
  knowledgeOutcomeScore: z.number().min(0).max(1).optional(),
  metrics: z.record(z.string(), z.unknown()).optional()
});

export type EvolutionTelemetryPayload = z.infer<typeof EvolutionTelemetryPayloadSchema>;

export const DomainEvolutionTelemetrySchema = z.object({
  ...BaseContractFields,
  domainKind: z.literal(DomainKind.EVOLUTION_TELEMETRY),
  confidence: z.number().min(0).max(1),
  status: z.enum(['RECORDED', 'AGGREGATED', 'EVALUATED']),
  payload: EvolutionTelemetryPayloadSchema
});

export type DomainEvolutionTelemetry = z.infer<typeof DomainEvolutionTelemetrySchema>;

// 8. Mitosis Decision Domain Contract (Discrete Governance Gate)
export const MitosisDecisionPayloadSchema = z.object({
  decisionId: z.string().min(1),
  decision: z.enum(['PERMITTED', 'DENIED']),
  eventId: z.string().min(1),
  parentCellId: z.string().min(1),
  reason: z.string().min(1),
  evaluatedConditions: z.object({
    parentActive: z.boolean(),
    populationCeilingChecked: z.boolean(),
    currentPopulation: z.number().int().nonnegative(),
    populationCeiling: z.number().int().positive(),
    memoryPressureChecked: z.boolean(),
    memoryPressure: z.number().min(0).max(1),
    minMemoryPressure: z.number().min(0).max(1),
    cooldownChecked: z.boolean(),
    cooldownRemainingMs: z.number().nonnegative(),
    authorizationVerified: z.boolean()
  }),
  authorizationState: z.string().optional()
});

export type MitosisDecisionPayload = z.infer<typeof MitosisDecisionPayloadSchema>;

export const DomainMitosisDecisionSchema = z.object({
  ...BaseContractFields,
  domainKind: z.literal(DomainKind.MITOSIS_DECISION),
  confidence: z.literal(1.0).default(1.0),
  status: z.enum(['PERMITTED', 'DENIED']),
  payload: MitosisDecisionPayloadSchema
});

export type DomainMitosisDecision = z.infer<typeof DomainMitosisDecisionSchema>;

/**
 * Union of strictly typed domain contracts.
 * NOT a universal feedback object: each has a distinct discriminator (domainKind) and schema.
 */
export type FeedbackDomainObject =
  | DomainComputationResult
  | DomainObservation
  | DomainExperience
  | DomainEvidence
  | DomainEpistemicTruth
  | DomainLearningUpdate
  | DomainEvolutionTelemetry
  | DomainMitosisDecision;

/**
 * Transition Envelope recording an explicit, causal crossing between domain boundaries.
 */
export const DomainTransitionEnvelopeSchema = z.object({
  transitionId: z.string().min(1),
  sourceDomain: DomainKindSchema,
  targetDomain: DomainKindSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  cellId: z.string().min(1),
  cycleNumber: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  causalReferences: z.array(CausalReferenceSchema),
  provenance: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1).optional(),
  status: z.string().min(1),
  persistenceSemantics: DomainPersistenceSemanticsSchema,
  deterministicHash: z.string().regex(/^[a-f0-9]{64}$/)
});

export type DomainTransitionEnvelope = z.infer<typeof DomainTransitionEnvelopeSchema>;
