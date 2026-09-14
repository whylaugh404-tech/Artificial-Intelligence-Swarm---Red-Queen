import { HypothesisStatus } from '../reasoning/types';

export enum ConflictType {
  DIRECT_CONTRADICTION = 'DIRECT_CONTRADICTION',
  EPISTEMIC_MISMATCH = 'EPISTEMIC_MISMATCH',
  EVIDENCE_COLLISION = 'EVIDENCE_COLLISION',
  ONTOLOGICAL_DRIFT = 'ONTOLOGICAL_DRIFT'
}

export enum ResolutionStrategy {
  SYNTHESIS = 'SYNTHESIS',
  OVERRIDE = 'OVERRIDE',
  MAINTAIN_COMPETITION = 'MAINTAIN_COMPETITION',
  DEFER_TO_COLLECTIVE = 'DEFER_TO_COLLECTIVE'
}

export interface ConflictRecord {
  id: string;
  type: ConflictType;
  entityId: string; // The ID of the concept/relation in conflict
  claimA: string;
  claimB: string;
  evidenceA: string[];
  evidenceB: string[];
  status: 'OPEN' | 'RESOLVED';
  resolution?: ResolutionRecord;
  discoveryTime: number;
}

export interface ResolutionRecord {
  strategy: ResolutionStrategy;
  rationale: string;
  resultingBeliefId?: string;
  resolutionTime: number;
}

export interface BeliefUpdateTask {
  id: string;
  targetEntityId: string;
  newEvidenceIds: string[];
  proposedState: string;
}
