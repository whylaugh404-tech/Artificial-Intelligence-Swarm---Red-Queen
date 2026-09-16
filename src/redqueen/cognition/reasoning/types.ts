import { z } from 'zod';
import {
  CognitiveConcept,
  CognitiveConceptSchema,
  CognitiveRelation,
  CognitiveRelationPredicate,
  CognitiveRelationSchema,
  RepresentationVerificationStatus,
  RepresentationVerificationStatusSchema
} from '../representation/types';
import {
  Context,
  ContextSchema,
  EpistemicStatus,
  EpistemicStatusSchema,
  SubjectiveOpinion,
  SubjectiveOpinionSchema
} from '../epistemic/types';
import { CognitiveUnderstanding, CognitiveUnderstandingSchema } from '../understanding/types';
import { WorldModel, WorldModelSchema } from '../worldmodel/types';
import { Evidence, EvidenceSchema } from '../evidence/types';
import { CompositionConstraint, CompositionConstraintSchema } from '../../core/composition/types';
import { CognitiveGraph } from '../representation/graph';

export type PremiseSourceType =
  | 'CONCEPT'
  | 'RELATION'
  | 'UNDERSTANDING'
  | 'WORLD_MODEL'
  | 'OBSERVATION'
  | 'AXIOM';

export const PremiseSourceTypeSchema = z.enum([
  'CONCEPT',
  'RELATION',
  'UNDERSTANDING',
  'WORLD_MODEL',
  'OBSERVATION',
  'AXIOM'
]);

export const ReasoningPremiseSchema = z.object({
  premiseId: z.string().min(1),
  statement: z.string().min(1),
  sourceType: PremiseSourceTypeSchema,
  sourceId: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  epistemicStatus: EpistemicStatusSchema.optional(),
  evidenceIds: z.array(z.string().min(1)).default([]),
  provenance: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.any()).default({})
});
export type ReasoningPremise = z.infer<typeof ReasoningPremiseSchema>;

export enum InferenceRuleType {
  DEDUCTION = 'DEDUCTION',
  INDUCTION = 'INDUCTION',
  ABDUCTION = 'ABDUCTION',
  CAUSAL_PROPAGATION = 'CAUSAL_PROPAGATION',
  TRANSITIVE_DEPENDENCY = 'TRANSITIVE_DEPENDENCY',
  CONSTRAINT_CHECK = 'CONSTRAINT_CHECK',
  ANALOGY = 'ANALOGY'
}

export const InferenceRuleTypeSchema = z.nativeEnum(InferenceRuleType);

export const InferenceStepSchema = z.object({
  stepId: z.string().min(1),
  rule: z.string().min(1),
  description: z.string().min(1),
  premiseIds: z.array(z.string().min(1)).min(1),
  assumptions: z.array(z.string().min(1)).default([]),
  derivedHypothesisId: z.string().min(1),
  intermediateConfidence: z.number().min(0).max(1).optional()
});
export type InferenceStep = z.infer<typeof InferenceStepSchema>;

export const ReasoningHypothesisSchema = z.object({
  hypothesisId: z.string().min(1),
  statement: z.string().min(1),
  targetConceptId: z.string().optional(),
  targetRelationId: z.string().optional(),
  predicate: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  status: EpistemicStatusSchema.default(EpistemicStatus.HYPOTHESIS),
  rationale: z.string().default('')
});
export type ReasoningHypothesis = z.infer<typeof ReasoningHypothesisSchema>;

export const CounterEvidenceItemSchema = z.object({
  evidenceId: z.string().min(1),
  reason: z.string().min(1),
  weight: z.number().min(0).max(1).default(1.0),
  sourceId: z.string().optional()
});
export type CounterEvidenceItem = z.infer<typeof CounterEvidenceItemSchema>;

export const AlternativeHypothesisSchema = z.object({
  hypothesisId: z.string().min(1),
  statement: z.string().min(1),
  status: EpistemicStatusSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1)
});
export type AlternativeHypothesis = z.infer<typeof AlternativeHypothesisSchema>;

export const ReasoningVerificationSchema = z.object({
  verificationId: z.string().min(1),
  hypothesisId: z.string().min(1),
  supportingEvidenceIds: z.array(z.string().min(1)).default([]),
  counterEvidenceIds: z.array(z.string().min(1)).default([]),
  hasContradiction: z.boolean().default(false),
  verificationStatus: RepresentationVerificationStatusSchema,
  epistemicStatus: EpistemicStatusSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string()
});
export type ReasoningVerification = z.infer<typeof ReasoningVerificationSchema>;

export const ReasoningConclusionSchema = z.object({
  conclusionId: z.string().min(1),
  statement: z.string().min(1),
  status: EpistemicStatusSchema,
  premises: z.array(ReasoningPremiseSchema),
  inferenceChain: z.array(InferenceStepSchema),
  evidence: z.array(z.string().min(1)).default([]),
  counterEvidence: z.array(CounterEvidenceItemSchema).default([]),
  assumptions: z.array(z.string().min(1)).default([]),
  uncertainty: SubjectiveOpinionSchema,
  alternatives: z.array(AlternativeHypothesisSchema).default([]),
  provenance: z.array(z.string().min(1)).min(1),
  originatingCellId: z.string().min(1),
  createdAt: z.string().datetime()
});
export type ReasoningConclusion = z.infer<typeof ReasoningConclusionSchema>;

export const ReasoningChainSchema = z.object({
  reasoningId: z.string().min(1).max(256),
  goal: z.string().min(1),
  context: ContextSchema,
  status: EpistemicStatusSchema,
  worldModelId: z.string().optional(),
  understandingIds: z.array(z.string().min(1)).default([]),
  premises: z.array(ReasoningPremiseSchema),
  inferenceChain: z.array(InferenceStepSchema),
  hypotheses: z.array(ReasoningHypothesisSchema),
  verification: ReasoningVerificationSchema,
  conclusion: ReasoningConclusionSchema,
  provenance: z.array(z.string().min(1)).min(1),
  originatingCellId: z.string().min(1),
  createdAt: z.string().datetime(),
  version: z.number().int().min(1).default(1),
  metadata: z.record(z.string(), z.any()).default({})
});

export type ReasoningChain = z.infer<typeof ReasoningChainSchema> & {
  trace?(elementId: string): ReasoningTrace;
};

export interface ReasoningTrace {
  readonly elementId: string;
  readonly elementType:
    | 'PREMISE'
    | 'INFERENCE_STEP'
    | 'HYPOTHESIS'
    | 'EVIDENCE'
    | 'CONCEPT'
    | 'RELATION'
    | 'UNDERSTANDING'
    | 'WORLD_MODEL';
  readonly representation?: CognitiveConcept | CognitiveRelation;
  readonly understanding?: CognitiveUnderstanding;
  readonly worldModel?: WorldModel;
  readonly evidence?: Evidence;
  readonly premises: ReadonlyArray<ReasoningPremise>;
  readonly inferenceSteps: ReadonlyArray<InferenceStep>;
  readonly hypotheses: ReadonlyArray<ReasoningHypothesis>;
  readonly evidences: ReadonlyArray<Evidence>;
  readonly epistemicStatus?: EpistemicStatus;
}

export interface ReasoningPremiseInput {
  statement: string;
  sourceType?: PremiseSourceType;
  sourceId?: string;
  concept?: CognitiveConcept | string;
  relation?: CognitiveRelation | string;
  understanding?: CognitiveUnderstanding | string;
  worldModel?: WorldModel | string;
  confidence?: number;
  epistemicStatus?: EpistemicStatus;
  evidenceIds?: string[];
  provenance?: string[];
  metadata?: Record<string, any>;
}

export interface InferenceStepInput {
  stepId?: string;
  rule: InferenceRuleType | string;
  description: string;
  premiseIds?: string[];
  assumptions?: string[];
  derivedHypothesisId?: string;
  intermediateConfidence?: number;
}

export interface ReasoningHypothesisInput {
  hypothesisId?: string;
  statement: string;
  targetConceptId?: string;
  targetRelationId?: string;
  predicate?: CognitiveRelationPredicate | string;
  confidence?: number;
  status?: EpistemicStatus;
  rationale?: string;
}

export interface AlternativeHypothesisInput {
  hypothesisId?: string;
  statement: string;
  status?: EpistemicStatus;
  confidence: number;
  reason: string;
}

export interface ReasoningInput {
  goal: string;
  context: Context;
  originatingCellId: string;
  
  // Optional higher-level structures to reason over
  worldModel?: WorldModel | string;
  understandings?: CognitiveUnderstanding[];
  
  // Explicit inputs
  premises: Array<ReasoningPremiseInput | ReasoningPremise>;
  inferenceSteps?: InferenceStepInput[];
  hypotheses?: Array<ReasoningHypothesisInput | ReasoningHypothesis>;
  
  // Supporting and counter evidences
  evidences?: Array<Evidence | string>;
  counterEvidences?: Array<CounterEvidenceItem | Evidence | string>;
  
  assumptions?: string[];
  alternatives?: Array<AlternativeHypothesisInput | AlternativeHypothesis>;
  
  // Minimum evidence confidence or count threshold (default 0.5)
  minEvidenceThreshold?: number;
  
  metadata?: Record<string, any>;
}
