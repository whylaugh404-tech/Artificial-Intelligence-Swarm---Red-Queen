import { Cell } from '../../core/cell';
import { CognitiveConcept, CognitiveRelation, RepresentationVerificationStatus } from '../representation/types';
import { EpistemicTransitionTrigger, Context } from '../epistemic/types';
import { Evidence } from '../evidence/types';
import { Experience, MetabolismStatus, NoveltyClassification, InformationCategory } from '../../metabolism/types';

export interface CognitiveDevelopmentResult {
  conceptsStrengthened: string[];
  conceptsWeakened: string[];
  relationsStrengthened: string[];
  relationsWeakened: string[];
  conflictsDetected: number;
  unresolvedGapsRecorded?: string[];
}

export class CognitiveDevelopmentEngine {
  constructor(private localCell: Cell) {}

  /**
   * P7.6 Development Loop: Experience -> Evaluation -> Learning -> Knowledge Update
   */
  public async evaluateExperience(
    experience: Experience,
    context?: Context,
    relatedConceptIds: string[] = [],
    relatedRelationIds: string[] = [],
    newEvidence: Evidence[] = []
  ): Promise<CognitiveDevelopmentResult> {
    const result: CognitiveDevelopmentResult = {
      conceptsStrengthened: [],
      conceptsWeakened: [],
      relationsStrengthened: [],
      relationsWeakened: [],
      conflictsDetected: 0,
      unresolvedGapsRecorded: []
    };

    const activeContext: Context = context || {
      contextId: `ctx_${experience.category ? experience.category.toLowerCase() : 'general'}`,
      domain: experience.category || 'general'
    };

    // 1. Causal Target Representation Discovery if not explicitly provided
    let targetConceptIds = [...relatedConceptIds];
    const targetRelationIds = [...relatedRelationIds];

    if (targetConceptIds.length === 0) {
      // A. Look up from triggering observation in memory
      const obsId = experience.observationId || (experience.causalLinks?.triggeringObservationId) || experience.informationId;
      if (obsId) {
        try {
          const obsEntry = await this.localCell.memory.get(obsId);
          if (obsEntry && obsEntry.content) {
            const subject = obsEntry.content.observedSubject || obsEntry.content.subject || obsEntry.content.canonicalName;
            if (subject && typeof subject === 'string') {
              const found = await this.localCell.cognitiveGraph.findConceptByName(subject);
              if (found && !targetConceptIds.includes(found.conceptId)) {
                targetConceptIds.push(found.conceptId);
              }
            }
          }
        } catch {
          // safe fallback
        }
      }

      // B. Look up from knowledgeIds
      if (experience.knowledgeIds && experience.knowledgeIds.length > 0) {
        const allConcepts = this.localCell.cognitiveGraph.getAllConcepts();
        for (const c of allConcepts) {
          if (c.sourceKnowledgeIds.some(kid => experience.knowledgeIds.includes(kid))) {
            if (!targetConceptIds.includes(c.conceptId)) {
              targetConceptIds.push(c.conceptId);
            }
          }
        }
      }

      // C. Look up from evidenceIds in experience
      if (experience.evidenceIds && experience.evidenceIds.length > 0) {
        for (const evId of experience.evidenceIds) {
          const ev = this.localCell.cognitiveGraph.getEvidence(evId);
          if (ev?.provenance?.supportingRepresentationIds) {
            for (const repId of ev.provenance.supportingRepresentationIds) {
              if (this.localCell.cognitiveGraph.getConcept(repId) && !targetConceptIds.includes(repId)) {
                targetConceptIds.push(repId);
              }
            }
          }
          if (ev?.provenance?.contradictingRepresentationIds) {
            for (const repId of ev.provenance.contradictingRepresentationIds) {
              if (this.localCell.cognitiveGraph.getConcept(repId) && !targetConceptIds.includes(repId)) {
                targetConceptIds.push(repId);
              }
            }
          }
        }
      }
    }

    // 2. Classify Experience Epistemic Polarity
    const isConflict =
      experience.verificationStatus === 'CONTRADICTED_BY_WORLD' ||
      experience.noveltyClassification === NoveltyClassification.CONTRADICTION ||
      (experience.lessonsDerived && experience.lessonsDerived.some(l => l.includes('contradiction') || l.includes('rupture') || l.includes('diverged')));

    const isNegative =
      isConflict ||
      experience.outcome === MetabolismStatus.REJECTED ||
      experience.outcome === MetabolismStatus.INVALID ||
      experience.outcome === MetabolismStatus.FAILED;

    const isPositive =
      !isNegative &&
      experience.outcome === MetabolismStatus.ACCEPTED;

    const isNovel =
      !isNegative &&
      !isPositive &&
      (experience.noveltyClassification === NoveltyClassification.NOVEL ||
       experience.verificationStatus === 'PENDING');

    // 3. Ground Active Evidence with Complete Provenance
    const nowIso = new Date().toISOString();
    let activeEvidence = [...newEvidence];

    if (activeEvidence.length === 0 && experience.evidenceIds && experience.evidenceIds.length > 0) {
      const existingEvs = experience.evidenceIds
        .map(id => this.localCell.cognitiveGraph.getEvidence(id))
        .filter((e): e is Evidence => Boolean(e));
      if (existingEvs.length > 0) {
        activeEvidence = existingEvs;
      }
    }

    if (activeEvidence.length === 0) {
      const expEv: Evidence = {
        evidenceId: `ev_exp_${experience.experienceId}`,
        sourceId: experience.source || experience.experienceId,
        observationId: experience.observationId || (experience.causalLinks?.triggeringObservationId),
        timestamp: nowIso,
        confidence: experience.confidence,
        provenance: {
          sourceId: this.localCell.nodeId,
          observationId: experience.observationId || (experience.causalLinks?.triggeringObservationId),
          derivedFrom: [
            experience.experienceId,
            ...(experience.observationId ? [experience.observationId] : [])
          ],
          supportingRepresentationIds: isPositive ? targetConceptIds : undefined,
          contradictingRepresentationIds: (isNegative || isConflict) ? targetConceptIds : undefined,
          timestamp: nowIso
        },
        context: activeContext
      };
      await this.localCell.cognitiveGraph.insertEvidence(expEv);
      activeEvidence = [expEv];
    }

    // 4. Evidence-driven Learning & State Transitions
    if (isPositive) {
      for (const conceptId of targetConceptIds) {
        await this.strengthenBelief(
          conceptId,
          activeContext,
          activeEvidence,
          `Positive experience reinforcement from ${experience.experienceId}`,
          experience.experienceId
        );
        result.conceptsStrengthened.push(conceptId);
      }
      for (const relId of targetRelationIds) {
        await this.strengthenRelation(
          relId,
          activeContext,
          activeEvidence,
          `Positive experience reinforcement from ${experience.experienceId}`,
          experience.experienceId
        );
        result.relationsStrengthened.push(relId);
      }
    } else if (isNegative) {
      for (const conceptId of targetConceptIds) {
        const weakened = await this.weakenBelief(
          conceptId,
          activeContext,
          activeEvidence,
          isConflict
            ? `Empirical conflict contradiction from ${experience.experienceId}`
            : `Negative experience weakening from ${experience.experienceId}`,
          experience.experienceId
        );
        result.conceptsWeakened.push(conceptId);
        if (
          weakened.verificationStatus === RepresentationVerificationStatus.CONTRADICTED ||
          isConflict
        ) {
          result.conflictsDetected++;
        }
      }
      for (const relId of targetRelationIds) {
        const weakened = await this.weakenRelation(
          relId,
          activeContext,
          activeEvidence,
          isConflict
            ? `Empirical conflict contradiction from ${experience.experienceId}`
            : `Negative experience weakening from ${experience.experienceId}`,
          experience.experienceId
        );
        result.relationsWeakened.push(relId);
        if (
          weakened.verificationStatus === RepresentationVerificationStatus.CONTRADICTED ||
          isConflict
        ) {
          result.conflictsDetected++;
        }
      }

      if (isConflict && this.localCell.cognitiveState) {
        const gap = this.localCell.cognitiveState.recordKnowledgeGap(
          targetConceptIds.length > 0
            ? `Empirical Contradiction in [${targetConceptIds.join(', ')}]`
            : `Empirical Contradiction from ${experience.experienceId}`,
          experience.category || InformationCategory.GENERAL_TECHNOLOGY,
          `Empirical contradiction detected against representations: ${experience.lessonsDerived?.join('; ') || 'Conflict observed'}`,
          0.85
        );
        if (result.unresolvedGapsRecorded) {
          result.unresolvedGapsRecorded.push(gap.gapId);
        }
      }
    } else if (isNovel) {
      // Novel experience without prior confirmation: Do NOT increase confidence without evidence!
      // Record experience reference in cognitive state for episodic tracing
      if (this.localCell.cognitiveState) {
        this.localCell.cognitiveState.addExperienceReference(experience.experienceId);
      }
    }

    // 5. Epistemic Trace & Transactional Persistence
    if (this.localCell.cognitiveState) {
      this.localCell.cognitiveState.addExperienceReference(experience.experienceId);
      await this.localCell.cognitiveState.persist(this.localCell.memory);
    }

    return result;
  }

  public async strengthenBelief(
    conceptId: string,
    context: Context,
    evidence: Evidence[],
    reason: string,
    sourceExperienceId?: string
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
      sourceExperienceIds: sourceExperienceId
        ? Array.from(new Set([...(concept.sourceExperienceIds || []), sourceExperienceId]))
        : (concept.sourceExperienceIds || []),
      evidenceIds: Array.from(new Set([...(concept.evidenceIds || []), ...evidence.map(e => e.evidenceId)])),
      provenance: Array.from(new Set([...concept.provenance, this.localCell.nodeId]))
    };

    const prevSnapshot = this.localCell.cognitiveState ? this.localCell.cognitiveState.getState() : undefined;

    return await this.localCell.cognitiveGraph.executeAtomicDevelopmentUpdate(conceptId, async () => {
      try {
        await this.localCell.cognitiveGraph.updateConcept(updated);
        if (this.localCell.cognitiveState) {
          this.localCell.cognitiveState.updateConfidence(newConfidence);
          this.localCell.cognitiveState.addConceptReference(conceptId);
          if (sourceExperienceId) {
            this.localCell.cognitiveState.addExperienceReference(sourceExperienceId);
          }
        }
        await this.localCell.cognitiveGraph.transitionRepresentationState(conceptId, evidence, context, {
          trigger: EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
          reason: `Strengthened: ${reason}`,
          customConfidence: newConfidence,
          customVerificationStatus: newStatus
        });
        return updated;
      } catch (err) {
        if (prevSnapshot && this.localCell.cognitiveState) {
          this.localCell.cognitiveState.restoreFromSnapshot(prevSnapshot);
        }
        throw err;
      }
    });
  }

  public async weakenBelief(
    conceptId: string,
    context: Context,
    evidence: Evidence[],
    reason: string,
    sourceExperienceId?: string
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
      sourceExperienceIds: sourceExperienceId
        ? Array.from(new Set([...(concept.sourceExperienceIds || []), sourceExperienceId]))
        : (concept.sourceExperienceIds || []),
      evidenceIds: Array.from(new Set([...(concept.evidenceIds || []), ...evidence.map(e => e.evidenceId)])),
      provenance: Array.from(new Set([...concept.provenance, this.localCell.nodeId]))
    };

    const prevSnapshot = this.localCell.cognitiveState ? this.localCell.cognitiveState.getState() : undefined;

    return await this.localCell.cognitiveGraph.executeAtomicDevelopmentUpdate(conceptId, async () => {
      try {
        await this.localCell.cognitiveGraph.updateConcept(updated);
        if (this.localCell.cognitiveState) {
          this.localCell.cognitiveState.updateConfidence(newConfidence);
          this.localCell.cognitiveState.addConceptReference(conceptId);
          if (sourceExperienceId) {
            this.localCell.cognitiveState.addExperienceReference(sourceExperienceId);
          }
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
      } catch (err) {
        if (prevSnapshot && this.localCell.cognitiveState) {
          this.localCell.cognitiveState.restoreFromSnapshot(prevSnapshot);
        }
        throw err;
      }
    });
  }

  public async strengthenRelation(
    relationId: string,
    context: Context,
    evidence: Evidence[],
    reason: string,
    sourceExperienceId?: string
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
      evidenceIds: Array.from(new Set([...(rel.evidenceIds || []), ...evidence.map(e => e.evidenceId)])),
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
    reason: string,
    sourceExperienceId?: string
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
      evidenceIds: Array.from(new Set([...(rel.evidenceIds || []), ...evidence.map(e => e.evidenceId)])),
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
