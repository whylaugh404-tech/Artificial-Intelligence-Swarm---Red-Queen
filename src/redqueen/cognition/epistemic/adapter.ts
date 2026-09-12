import { CognitiveConcept, CognitiveRelation, RepresentationVerificationStatus } from '../representation/types';
import { EpistemicStatus, EpistemicState, SubjectiveOpinion } from './types';
import { FormalContext } from '../context/types';

export function adaptP5ConfidenceToOpinion(confidence: number, verificationStatus: RepresentationVerificationStatus): SubjectiveOpinion {
  let b = 0;
  let d = 0;
  let u = 1;
  const a = 0.5; // base rate default

  switch (verificationStatus) {
    case RepresentationVerificationStatus.REJECTED:
    case RepresentationVerificationStatus.CONTRADICTED:
      // High disbelief
      d = confidence;
      b = 0;
      u = 1 - d;
      break;
    case RepresentationVerificationStatus.VERIFIED:
      // High belief
      b = confidence;
      d = 0;
      u = 1 - b;
      break;
    case RepresentationVerificationStatus.SUPPORTED:
      // Some evidence, mostly belief, but capped to avoid full certainty
      b = Math.min(confidence, 0.8);
      d = 0;
      u = 1 - b;
      break;
    case RepresentationVerificationStatus.PENDING:
    default:
      // Treats confidence conservatively
      b = Math.min(confidence, 0.5);
      d = 0;
      u = 1 - b;
      break;
  }

  // Handle precision errors to ensure sum to exactly 1.0 within floating point constraints.
  // We prioritize b and d, putting the remainder into u.
  // If b + d > 1, cap it. (Should not happen normally based on logic above)
  const sumBD = b + d;
  if (sumBD > 1) {
    b = b / sumBD;
    d = d / sumBD;
    u = 0;
  } else {
    u = Number(Math.max(0, 1 - b - d).toFixed(6));
  }

  return { belief: b, disbelief: d, uncertainty: u, baseRate: a };
}

export function determineEpistemicStatus(opinion: SubjectiveOpinion, verificationStatus: RepresentationVerificationStatus): EpistemicStatus {
  if (verificationStatus === RepresentationVerificationStatus.CONTRADICTED || verificationStatus === RepresentationVerificationStatus.REJECTED) {
    return EpistemicStatus.CONTRADICTED;
  }
  
  // High uncertainty is always UNKNOWN regardless of status
  if (opinion.uncertainty >= 0.8) {
    return EpistemicStatus.UNKNOWN;
  }

  if (verificationStatus === RepresentationVerificationStatus.VERIFIED && opinion.belief >= 0.9) {
    return EpistemicStatus.KNOWN_VERIFIED;
  }
  
  if (opinion.uncertainty > 0.4) {
    return EpistemicStatus.HYPOTHESIS;
  }
  
  if (opinion.belief > opinion.disbelief) {
    return EpistemicStatus.BELIEVED;
  }
  
  return EpistemicStatus.UNKNOWN;
}

export function adaptConceptToEpistemicState(concept: CognitiveConcept, context: FormalContext): EpistemicState {
  // Edge Case: If it lacks source evidence completely or provenance is artificially fabricated without verification
  if (concept.sourceKnowledgeIds.length === 0 && concept.sourceExperienceIds.length === 0) {
    return {
      subjectId: concept.conceptId,
      contextId: context.id,
      opinion: { belief: 0, disbelief: 0, uncertainty: 1, baseRate: 0.5 },
      status: EpistemicStatus.UNKNOWN,
      evidenceRefs: [],
      provenanceRefs: concept.provenance
    };
  }

  const opinion = adaptP5ConfidenceToOpinion(concept.confidence, concept.verificationStatus);
  const status = determineEpistemicStatus(opinion, concept.verificationStatus);
  
  return {
    subjectId: concept.conceptId,
    contextId: context.id,
    opinion,
    status,
    evidenceRefs: [...concept.sourceKnowledgeIds, ...(concept.sourceExperienceIds || [])],
    provenanceRefs: concept.provenance
  };
}

export function adaptRelationToEpistemicState(relation: CognitiveRelation, context: FormalContext): EpistemicState {
  const opinion = adaptP5ConfidenceToOpinion(relation.confidence, relation.verificationStatus);
  const status = determineEpistemicStatus(opinion, relation.verificationStatus);
  
  return {
    subjectId: relation.relationId,
    contextId: context.id,
    opinion,
    status,
    evidenceRefs: [], // P5.1 relation doesn't have source knowledge array directly, relies on provenance
    provenanceRefs: relation.provenance
  };
}
