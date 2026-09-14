import { Cell } from '../../core/cell';
import { CognitiveConcept, CognitiveRelation, RepresentationVerificationStatus } from '../representation/types';
import { EpistemicTransitionTrigger, Context } from '../epistemic/types';
import { Evidence } from '../evidence/types';
import { Experience, MetabolismStatus } from '../../metabolism/types';
import { ConflictType, ConflictResolutionDecision } from '../verification/types';

export interface CognitiveDevelopmentResult {
  conceptsStrengthened: string[];
  conceptsWeakened: string[];
  relationsStrengthened: string[];
  relationsWeakened: string[];
  conflictsDetected: number;
}

export class CognitiveDevelopmentEngine {
  constructor(private localCell: Cell) {}

  /**
   * P7.6 Development Loop: Experience -> Evaluation -> Learning -> Knowledge Update
   */
  public async evaluateExperience(
    experience: Experience,
    context: Context,
    relatedConceptIds: string[] = [],
    relatedRelationIds: string[] = [],
    newEvidence: Evidence[] = []
  ): Promise<CognitiveDevelopmentResult> {
    const result: CognitiveDevelopmentResult = {
      conceptsStrengthened: [],
      conceptsWeakened: [],
      relationsStrengthened: [],
      relationsWeakened: [],
      conflictsDetected: 0
    };

    // Assimilated/Accommodated -> Positive reinforcement
    const isPositive = experience.outcome === MetabolismStatus.ASSIMILATED || experience.outcome === MetabolismStatus.ACCOMMODATED;
    // Rejected -> Negative reinforcement
    const isNegative = experience.outcome === MetabolismStatus.REJECTED;

    if (isPositive) {
      for (const conceptId of relatedConceptIds) {
        await this.strengthenBelief(conceptId, context, newEvidence, `Positive experience ${experience.experienceId}`);
        result.conceptsStrengthened.push(conceptId);
      }
      for (const relId of relatedRelationIds) {
        await this.strengthenRelation(relId, context, newEvidence, `Positive experience ${experience.experienceId}`);
        result.relationsStrengthened.push(relId);
      }
    } else if (isNegative) {
      for (const conceptId of relatedConceptIds) {
        const weakened = await this.weakenBelief(conceptId, context, newEvidence, `Negative experience ${experience.experienceId}`);
        result.conceptsWeakened.push(conceptId);
        if (weakened.verificationStatus === RepresentationVerificationStatus.CONTRADICTED) {
            result.conflictsDetected++;
        }
      }
      for (const relId of relatedRelationIds) {
        const weakened = await this.weakenRelation(relId, context, newEvidence, `Negative experience ${experience.experienceId}`);
        result.relationsWeakened.push(relId);
        if (weakened.verificationStatus === RepresentationVerificationStatus.CONTRADICTED) {
            result.conflictsDetected++;
        }
      }
    }

    return result;
  }

  public async strengthenBelief(conceptId: string, context: Context, evidence: Evidence[], reason: string): Promise<CognitiveConcept> {
    const concept = this.localCell.cognitiveGraph.getConcept(conceptId);
    if (!concept) throw new Error(`Concept ${conceptId} not found`);

    const newConfidence = Math.min(1.0, concept.confidence + 0.1);
    let newStatus = concept.verificationStatus;
    
    // Cannot bypass verification to jump straight to VERIFIED unless it goes through verification engine.
    // We can elevate to SUPPORTED.
    if (newConfidence >= 0.9 && newStatus !== RepresentationVerificationStatus.VERIFIED) {
        newStatus = RepresentationVerificationStatus.SUPPORTED;
    } else if (newConfidence > 0.5 && newStatus === RepresentationVerificationStatus.CONTRADICTED) {
        newStatus = RepresentationVerificationStatus.PENDING; // recovering
    }

    const updated: CognitiveConcept = {
        ...concept,
        confidence: newConfidence,
        verificationStatus: newStatus,
        version: concept.version + 1,
        updatedAt: new Date().toISOString(),
        provenance: Array.from(new Set([...concept.provenance, this.localCell.nodeId]))
    };
    
    await this.localCell.cognitiveGraph.updateConcept(updated);

    await this.localCell.cognitiveGraph.transitionRepresentationState(
      conceptId,
      evidence,
      context,
      {
        trigger: EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
        reason: `Strengthened: ${reason}`,
        customConfidence: newConfidence,
        customVerificationStatus: newStatus
      }
    );

    return updated;
  }

  public async weakenBelief(conceptId: string, context: Context, evidence: Evidence[], reason: string): Promise<CognitiveConcept> {
    const concept = this.localCell.cognitiveGraph.getConcept(conceptId);
    if (!concept) throw new Error(`Concept ${conceptId} not found`);

    const newConfidence = Math.max(0.0, concept.confidence - 0.2);
    let newStatus = concept.verificationStatus;
    
    if (newConfidence <= 0.3) {
        newStatus = RepresentationVerificationStatus.CONTRADICTED;
    } else if (newStatus === RepresentationVerificationStatus.VERIFIED) {
        // Demote from VERIFIED if weakened
        newStatus = RepresentationVerificationStatus.SUPPORTED;
    }

    const updated: CognitiveConcept = {
        ...concept,
        confidence: newConfidence,
        verificationStatus: newStatus,
        version: concept.version + 1,
        updatedAt: new Date().toISOString(),
        provenance: Array.from(new Set([...concept.provenance, this.localCell.nodeId]))
    };
    
    await this.localCell.cognitiveGraph.updateConcept(updated);

    await this.localCell.cognitiveGraph.transitionRepresentationState(
      conceptId,
      evidence,
      context,
      {
        trigger: newStatus === RepresentationVerificationStatus.CONTRADICTED ? EpistemicTransitionTrigger.CONTRADICTION_DETECTED : EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
        explicitVerification: newStatus === RepresentationVerificationStatus.CONTRADICTED ? { status: RepresentationVerificationStatus.CONTRADICTED, verifiedBy: this.localCell.nodeId } : undefined,
        reason: `Weakened: ${reason}`,
        customConfidence: newConfidence,
        customVerificationStatus: newStatus
      }
    );

    return updated;
  }

  public async strengthenRelation(relationId: string, context: Context, evidence: Evidence[], reason: string): Promise<CognitiveRelation> {
    const rel = this.localCell.cognitiveGraph.getRelation(relationId);
    if (!rel) throw new Error(`Relation ${relationId} not found`);

    const newConfidence = Math.min(1.0, rel.confidence + 0.1);
    let newStatus = rel.verificationStatus;
    
    if (newConfidence >= 0.9 && newStatus !== RepresentationVerificationStatus.VERIFIED) {
        newStatus = RepresentationVerificationStatus.SUPPORTED;
    } else if (newConfidence > 0.5 && newStatus === RepresentationVerificationStatus.CONTRADICTED) {
        newStatus = RepresentationVerificationStatus.PENDING;
    }

    const updated: CognitiveRelation = {
        ...rel,
        confidence: newConfidence,
        verificationStatus: newStatus,
        provenance: Array.from(new Set([...rel.provenance, this.localCell.nodeId]))
    };
    
    await this.localCell.cognitiveGraph.updateRelation(updated);

    await this.localCell.cognitiveGraph.transitionRepresentationState(
      relationId,
      evidence,
      context,
      {
        trigger: EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
        reason: `Strengthened relation: ${reason}`,
        customConfidence: newConfidence,
        customVerificationStatus: newStatus
      }
    );

    return updated;
  }

  public async weakenRelation(relationId: string, context: Context, evidence: Evidence[], reason: string): Promise<CognitiveRelation> {
    const rel = this.localCell.cognitiveGraph.getRelation(relationId);
    if (!rel) throw new Error(`Relation ${relationId} not found`);

    const newConfidence = Math.max(0.0, rel.confidence - 0.2);
    let newStatus = rel.verificationStatus;
    
    if (newConfidence <= 0.3) {
        newStatus = RepresentationVerificationStatus.CONTRADICTED;
    }

    const updated: CognitiveRelation = {
        ...rel,
        confidence: newConfidence,
        verificationStatus: newStatus,
        provenance: Array.from(new Set([...rel.provenance, this.localCell.nodeId]))
    };
    
    await this.localCell.cognitiveGraph.updateRelation(updated);

    await this.localCell.cognitiveGraph.transitionRepresentationState(
      relationId,
      evidence,
      context,
      {
        trigger: newStatus === RepresentationVerificationStatus.CONTRADICTED ? EpistemicTransitionTrigger.CONTRADICTION_DETECTED : EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
        explicitVerification: newStatus === RepresentationVerificationStatus.CONTRADICTED ? { status: RepresentationVerificationStatus.CONTRADICTED, verifiedBy: this.localCell.nodeId } : undefined,
        reason: `Weakened relation: ${reason}`,
        customConfidence: newConfidence,
        customVerificationStatus: newStatus
      }
    );

    return updated;
  }
}
