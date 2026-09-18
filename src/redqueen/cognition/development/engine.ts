import { Cell } from '../../core/cell';
import { CognitiveConcept, CognitiveRelation, RepresentationVerificationStatus } from '../representation/types';
import { EpistemicTransitionTrigger, Context } from '../epistemic/types';
import { Evidence } from '../evidence/types';
import { Experience, MetabolismStatus } from '../../metabolism/types';

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

    // Accepted -> Positive reinforcement
    const isPositive = experience.outcome === MetabolismStatus.ACCEPTED;
    // Rejected/Invalid/Failed -> Negative reinforcement
    const isNegative =
      experience.outcome === MetabolismStatus.REJECTED ||
      experience.outcome === MetabolismStatus.INVALID ||
      experience.outcome === MetabolismStatus.FAILED;

    // Grounding: derive evidence from experience if not supplied
    const nowIso = new Date().toISOString();
    let activeEvidence = [...newEvidence];
    if (activeEvidence.length === 0) {
      const expEv: Evidence = {
        evidenceId: `ev_exp_${experience.experienceId}`,
        sourceId: experience.experienceId,
        timestamp: nowIso,
        confidence: experience.confidence,
        provenance: {
          sourceId: this.localCell.nodeId,
          derivedFrom: [experience.experienceId],
          supportingRepresentationIds: isPositive ? relatedConceptIds : undefined,
          contradictingRepresentationIds: isNegative ? relatedConceptIds : undefined,
          timestamp: nowIso
        },
        context
      };
      await this.localCell.cognitiveGraph.insertEvidence(expEv);
      activeEvidence = [expEv];
    }

    if (isPositive) {
      for (const conceptId of relatedConceptIds) {
        await this.strengthenBelief(
          conceptId,
          context,
          activeEvidence,
          `Positive experience reinforcement from ${experience.experienceId}`
        );
        result.conceptsStrengthened.push(conceptId);
      }
      for (const relId of relatedRelationIds) {
        await this.strengthenRelation(
          relId,
          context,
          activeEvidence,
          `Positive experience reinforcement from ${experience.experienceId}`
        );
        result.relationsStrengthened.push(relId);
      }
    } else if (isNegative) {
      for (const conceptId of relatedConceptIds) {
        const weakened = await this.weakenBelief(
          conceptId,
          context,
          activeEvidence,
          `Negative experience contradiction from ${experience.experienceId}`
        );
        result.conceptsWeakened.push(conceptId);
        if (weakened.verificationStatus === RepresentationVerificationStatus.CONTRADICTED) {
          result.conflictsDetected++;
        }
      }
      for (const relId of relatedRelationIds) {
        const weakened = await this.weakenRelation(
          relId,
          context,
          activeEvidence,
          `Negative experience contradiction from ${experience.experienceId}`
        );
        result.relationsWeakened.push(relId);
        if (weakened.verificationStatus === RepresentationVerificationStatus.CONTRADICTED) {
          result.conflictsDetected++;
        }
      }
    }

    return result;
  }

  public async strengthenBelief(
    conceptId: string,
    context: Context,
    evidence: Evidence[],
    reason: string
  ): Promise<CognitiveConcept> {
    if (!reason || !reason.trim()) {
      throw new Error('Reason is required for cognitive belief update');
    }
    if (!evidence || evidence.length === 0) {
      throw new Error('Evidence is required for cognitive belief update');
    }

    const concept = this.localCell.cognitiveGraph.getConcept(conceptId);
    if (!concept) throw new Error(`Concept ${conceptId} not found`);

    let totalConfidence = 0;
    let count = 0;
    for (const e of evidence) {
      if (e.confidence !== undefined) {
        totalConfidence += e.confidence;
        count++;
      }
    }
    const avgEvidenceConfidence = count > 0 ? totalConfidence / count : 0.0;
    const delta = (1.0 - concept.confidence) * (0.3 * avgEvidenceConfidence);
    const newConfidence = Math.min(1.0, concept.confidence + delta);

    let newStatus = concept.verificationStatus;
    if (newConfidence >= 0.85 && newStatus !== RepresentationVerificationStatus.VERIFIED) {
      newStatus = RepresentationVerificationStatus.SUPPORTED;
    } else if (newConfidence > 0.5 && newStatus === RepresentationVerificationStatus.CONTRADICTED) {
      newStatus = RepresentationVerificationStatus.PENDING;
    }

    const updated: CognitiveConcept = {
      ...concept,
      confidence: newConfidence,
      verificationStatus: newStatus,
      version: concept.version + 1,
      updatedAt: new Date().toISOString(),
      provenance: Array.from(new Set([...concept.provenance, this.localCell.nodeId]))
    };

    return await this.localCell.cognitiveGraph.executeAtomicDevelopmentUpdate(conceptId, async () => {
      await this.localCell.cognitiveGraph.updateConcept(updated);
      if (this.localCell.cognitiveState) {
        this.localCell.cognitiveState.updateConfidence(newConfidence);
      }
      await this.localCell.cognitiveGraph.transitionRepresentationState(conceptId, evidence, context, {
        trigger: EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
        reason: `Strengthened: ${reason}`,
        customConfidence: newConfidence,
        customVerificationStatus: newStatus
      });
      return updated;
    });
  }

  public async weakenBelief(
    conceptId: string,
    context: Context,
    evidence: Evidence[],
    reason: string
  ): Promise<CognitiveConcept> {
    if (!reason || !reason.trim()) {
      throw new Error('Reason is required for cognitive belief update');
    }
    if (!evidence || evidence.length === 0) {
      throw new Error('Evidence is required for cognitive belief update');
    }

    const concept = this.localCell.cognitiveGraph.getConcept(conceptId);
    if (!concept) throw new Error(`Concept ${conceptId} not found`);

    let totalConfidence = 0;
    let count = 0;
    for (const e of evidence) {
      if (e.confidence !== undefined) {
        totalConfidence += e.confidence;
        count++;
      }
    }
    const avgEvidenceConfidence = count > 0 ? totalConfidence / count : 0.0;
    const delta = concept.confidence * (0.35 * avgEvidenceConfidence) + 0.15;
    const newConfidence = Math.max(0.0, concept.confidence - delta);

    let newStatus = concept.verificationStatus;
    if (newConfidence <= 0.3) {
      newStatus = RepresentationVerificationStatus.CONTRADICTED;
    } else if (newStatus === RepresentationVerificationStatus.VERIFIED) {
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

    return await this.localCell.cognitiveGraph.executeAtomicDevelopmentUpdate(conceptId, async () => {
      await this.localCell.cognitiveGraph.updateConcept(updated);
      if (this.localCell.cognitiveState) {
        this.localCell.cognitiveState.updateConfidence(newConfidence);
      }
      await this.localCell.cognitiveGraph.transitionRepresentationState(conceptId, evidence, context, {
        trigger:
          newStatus === RepresentationVerificationStatus.CONTRADICTED
            ? EpistemicTransitionTrigger.CONTRADICTION_DETECTED
            : EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
        explicitVerification:
          newStatus === RepresentationVerificationStatus.CONTRADICTED
            ? { status: RepresentationVerificationStatus.CONTRADICTED, verifiedBy: this.localCell.nodeId }
            : undefined,
        reason: `Weakened: ${reason}`,
        customConfidence: newConfidence,
        customVerificationStatus: newStatus
      });
      return updated;
    });
  }

  public async strengthenRelation(
    relationId: string,
    context: Context,
    evidence: Evidence[],
    reason: string
  ): Promise<CognitiveRelation> {
    if (!reason || !reason.trim()) {
      throw new Error('Reason is required for cognitive belief update');
    }
    if (!evidence || evidence.length === 0) {
      throw new Error('Evidence is required for cognitive belief update');
    }

    const rel = this.localCell.cognitiveGraph.getRelation(relationId);
    if (!rel) throw new Error(`Relation ${relationId} not found`);

    let totalConfidence = 0;
    let count = 0;
    for (const e of evidence) {
      if (e.confidence !== undefined) {
        totalConfidence += e.confidence;
        count++;
      }
    }
    const avgEvidenceConfidence = count > 0 ? totalConfidence / count : 0.0;
    const delta = (1.0 - rel.confidence) * (0.3 * avgEvidenceConfidence);
    const newConfidence = Math.min(1.0, rel.confidence + delta);

    let newStatus = rel.verificationStatus;
    if (newConfidence >= 0.85 && newStatus !== RepresentationVerificationStatus.VERIFIED) {
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

    return await this.localCell.cognitiveGraph.executeAtomicDevelopmentUpdate(relationId, async () => {
      await this.localCell.cognitiveGraph.updateRelation(updated);
      await this.localCell.cognitiveGraph.transitionRepresentationState(relationId, evidence, context, {
        trigger: EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
        reason: `Strengthened relation: ${reason}`,
        customConfidence: newConfidence,
        customVerificationStatus: newStatus
      });
      return updated;
    });
  }

  public async weakenRelation(
    relationId: string,
    context: Context,
    evidence: Evidence[],
    reason: string
  ): Promise<CognitiveRelation> {
    if (!reason || !reason.trim()) {
      throw new Error('Reason is required for cognitive belief update');
    }
    if (!evidence || evidence.length === 0) {
      throw new Error('Evidence is required for cognitive belief update');
    }

    const rel = this.localCell.cognitiveGraph.getRelation(relationId);
    if (!rel) throw new Error(`Relation ${relationId} not found`);

    let totalConfidence = 0;
    let count = 0;
    for (const e of evidence) {
      if (e.confidence !== undefined) {
        totalConfidence += e.confidence;
        count++;
      }
    }
    const avgEvidenceConfidence = count > 0 ? totalConfidence / count : 0.0;
    const delta = rel.confidence * (0.35 * avgEvidenceConfidence) + 0.15;
    const newConfidence = Math.max(0.0, rel.confidence - delta);

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

    return await this.localCell.cognitiveGraph.executeAtomicDevelopmentUpdate(relationId, async () => {
      await this.localCell.cognitiveGraph.updateRelation(updated);
      await this.localCell.cognitiveGraph.transitionRepresentationState(relationId, evidence, context, {
        trigger:
          newStatus === RepresentationVerificationStatus.CONTRADICTED
            ? EpistemicTransitionTrigger.CONTRADICTION_DETECTED
            : EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
        explicitVerification:
          newStatus === RepresentationVerificationStatus.CONTRADICTED
            ? { status: RepresentationVerificationStatus.CONTRADICTED, verifiedBy: this.localCell.nodeId }
            : undefined,
        reason: `Weakened relation: ${reason}`,
        customConfidence: newConfidence,
        customVerificationStatus: newStatus
      });
      return updated;
    });
  }

  /**
   * Deterministically replays historical cognitive development for a representation.
   */
  public replayHistory(representationId: string, upToTransitionId?: string) {
    return this.localCell.cognitiveGraph.replayDevelopmentHistory(representationId, upToTransitionId);
  }

  /**
   * Recovers a representation to a consistent epistemic state from transition records.
   */
  public async recoverConsistentState(representationId: string): Promise<boolean> {
    return this.localCell.cognitiveGraph.recoverConsistentState(representationId);
  }
}
