import { CognitiveConcept, CognitiveRelation } from '../representation/types';
import { Evidence } from '../evidence/types';

export enum ReasoningStepType {
  DEDUCTION = 'DEDUCTION',
  INDUCTION = 'INDUCTION',
  ABDUCTION = 'ABDUCTION',
  ANALOGY = 'ANALOGY'
}

export enum HypothesisStatus {
  PROPOSED = 'PROPOSED',
  VERIFIED = 'VERIFIED',
  FALSIFIED = 'FALSIFIED',
  UNDECIDED = 'UNDECIDED'
}

export interface Premise {
  id: string;
  sourceId: string; // ID of a Concept or Relation
  sourceType: 'CONCEPT' | 'RELATION';
  description: string;
}

export interface Hypothesis {
  id: string;
  description: string;
  status: HypothesisStatus;
  proposedConcept?: Partial<CognitiveConcept>;
  proposedRelation?: Partial<CognitiveRelation>;
  confidence: number;
}

export interface InferenceStep {
  id: string;
  type: ReasoningStepType;
  description: string;
  premises: string[]; // IDs of Premises
  hypotheses: Hypothesis[];
  assumptions: string[];
}

export interface VerificationProcess {
  hypothesisId: string;
  evidenceId: string[];
  counterEvidenceId: string[];
  conclusionDescription: string;
  finalStatus: HypothesisStatus;
  updatedConfidence: number;
}

export interface ReasoningChain {
  chainId: string;
  goal: string;
  premises: Premise[];
  inferenceSteps: InferenceStep[];
  verifications: VerificationProcess[];
  uncertainty: number; // 0.0 to 1.0, where 0 is absolute certainty and 1 is complete uncertainty
  provenance: string; // The origin or trigger of this reasoning chain
}
