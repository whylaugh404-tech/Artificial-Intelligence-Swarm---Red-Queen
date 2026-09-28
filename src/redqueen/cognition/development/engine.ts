import { Cell } from '../../core/cell';
import { CognitiveConcept, CognitiveRelation, CognitiveRelationPredicate, CognitiveGeneralization, RepresentationVerificationStatus } from '../representation/types';
import { EpistemicTransitionTrigger, Context } from '../epistemic/types';
import { Evidence } from '../evidence/types';
import { Experience, MetabolismStatus, NoveltyClassification, InformationCategory } from '../../metabolism/types';
import { computeDeterministicHash } from '../computation/canonical';

export interface CognitiveDevelopmentResult {
  conceptsStrengthened: string[];
  conceptsWeakened: string[];
  relationsStrengthened: string[];
  relationsWeakened: string[];
  conflictsDetected: number;
  unresolvedGapsRecorded?: string[];
  generalizationsFormed?: string[];
  generalizationsUpdated?: string[];
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
      unresolvedGapsRecorded: [],
      generalizationsFormed: [],
      generalizationsUpdated: []
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

        // Autonomous Generalization Formation / Reinforcement from Positive Experience
        // Requires at least 2 independent experiences before generalizing to parent concepts
        try {
          const genResult = await this.detectAndFormGeneralization(
            conceptId,
            experience,
            activeEvidence,
            false,
            activeContext
          );
          if (genResult) {
            if (genResult.isNew) {
              if (!result.generalizationsFormed) result.generalizationsFormed = [];
              if (!result.generalizationsFormed.includes(genResult.gen.generalizationId)) {
                result.generalizationsFormed.push(genResult.gen.generalizationId);
              }
            } else {
              if (!result.generalizationsUpdated) result.generalizationsUpdated = [];
              if (!result.generalizationsUpdated.includes(genResult.gen.generalizationId)) {
                result.generalizationsUpdated.push(genResult.gen.generalizationId);
              }
            }

            // Propagate positive reinforcement to parent concept ONLY once a verified generalization is formed
            const relations = this.localCell.cognitiveGraph.getRelationsForConcept(conceptId);
            for (const rel of relations) {
              if (
                rel.subjectConceptId === conceptId &&
                (rel.predicate === CognitiveRelationPredicate.INSTANCE_OF ||
                 rel.predicate === CognitiveRelationPredicate.SPECIALIZES ||
                 rel.predicate === CognitiveRelationPredicate.IS_A)
              ) {
                const parentConceptId = rel.objectConceptId;
                if (!targetConceptIds.includes(parentConceptId) && !result.conceptsStrengthened.includes(parentConceptId)) {
                  try {
                    await this.strengthenBelief(
                      parentConceptId,
                      activeContext,
                      activeEvidence,
                      `Inherited positive reinforcement from generalization ${genResult.gen.generalizationId}: ${genResult.gen.pattern}`,
                      experience.experienceId
                    );
                    result.conceptsStrengthened.push(parentConceptId);
                  } catch {
                    // Safe fallback if parent concept cannot be strengthened
                  }
                }
              }
            }
          }
        } catch {
          // Safe fallback
        }
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

        if (isConflict) {
          // Autonomous Generalization Formation / Update from Empirical Conflict Experience
          // Requires at least 2 independent experiences before generalizing to parent concepts
          try {
            const genResult = await this.detectAndFormGeneralization(
              conceptId,
              experience,
              activeEvidence,
              isConflict || isNegative,
              activeContext
            );
            if (genResult) {
              if (genResult.isNew) {
                if (!result.generalizationsFormed) result.generalizationsFormed = [];
                if (!result.generalizationsFormed.includes(genResult.gen.generalizationId)) {
                  result.generalizationsFormed.push(genResult.gen.generalizationId);
                }
              } else {
                if (!result.generalizationsUpdated) result.generalizationsUpdated = [];
                if (!result.generalizationsUpdated.includes(genResult.gen.generalizationId)) {
                  result.generalizationsUpdated.push(genResult.gen.generalizationId);
                }
              }

              // Propagate conflict to parent concept ONLY once a verified generalization is formed from >= 2 independent experiences
              const relations = this.localCell.cognitiveGraph.getRelationsForConcept(conceptId);
              for (const rel of relations) {
                if (
                  rel.subjectConceptId === conceptId &&
                  (rel.predicate === CognitiveRelationPredicate.INSTANCE_OF ||
                   rel.predicate === CognitiveRelationPredicate.SPECIALIZES ||
                   rel.predicate === CognitiveRelationPredicate.IS_A)
                ) {
                  const parentConceptId = rel.objectConceptId;
                  if (!targetConceptIds.includes(parentConceptId) && !result.conceptsWeakened.includes(parentConceptId)) {
                    try {
                      const parentWeakened = await this.weakenBelief(
                        parentConceptId,
                        activeContext,
                        activeEvidence,
                        `Inherited empirical conflict from generalization ${genResult.gen.generalizationId}: ${genResult.gen.pattern}`,
                        experience.experienceId
                      );
                      result.conceptsWeakened.push(parentConceptId);
                      if (parentWeakened.verificationStatus === RepresentationVerificationStatus.CONTRADICTED) {
                        result.conflictsDetected++;
                      }
                    } catch {
                      // Safe fallback if parent concept cannot be weakened
                    }
                  }
                }
              }
            }
          } catch {
            // Safe fallback
          }
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

  /**
   * P7.6 & R9: Autonomous Pattern Detection & Generalization Formation from Empirical Experience.
   * Discovers shared patterns across sibling instances belonging to a parent class
   * or sharing structural relational signatures, and dynamically creates or updates
   * a persistent CognitiveGeneralization in the CognitiveGraph.
   */
  private async detectAndFormGeneralization(
    conceptId: string,
    experience: Experience,
    activeEvidence: Evidence[],
    isConflict: boolean,
    activeContext: Context
  ): Promise<{ gen: CognitiveGeneralization; isNew: boolean } | null> {
    const concept = this.localCell.cognitiveGraph.getConcept(conceptId);
    if (!concept) return null;

    // 1. Identify parent abstractions / general concepts via hierarchical relations
    const relations = this.localCell.cognitiveGraph.getRelationsForConcept(conceptId);
    const parentRelations = relations.filter(
      r => r.subjectConceptId === conceptId &&
      (r.predicate === CognitiveRelationPredicate.INSTANCE_OF ||
       r.predicate === CognitiveRelationPredicate.SPECIALIZES ||
       r.predicate === CognitiveRelationPredicate.IS_A)
    );

    // 2. Extract empirical anomaly / consequence details from observation or experience
    let empiricalAnomaly: string | undefined;
    const obsId = experience.observationId || (experience.causalLinks?.triggeringObservationId) || experience.informationId;
    if (obsId) {
      try {
        const obsEntry = await this.localCell.memory.get(obsId);
        if (obsEntry?.content) {
          const content = typeof obsEntry.content === 'string' ? JSON.parse(obsEntry.content) : obsEntry.content;
          empiricalAnomaly = content.anomaly || content.content?.anomaly || content.error || content.failureMode || content.details;
        }
      } catch {
        // safe fallback
      }
    }
    if (!empiricalAnomaly && experience.lessonsDerived && experience.lessonsDerived.length > 0) {
      empiricalAnomaly = experience.lessonsDerived[0];
    }

    // 3. For each parent concept, detect shared pattern across all sibling instances
    for (const parentRel of parentRelations) {
      const parentConceptId = parentRel.objectConceptId;
      const parentConcept = this.localCell.cognitiveGraph.getConcept(parentConceptId);
      if (!parentConcept) continue;

      // Find all sibling concepts in the graph that also belong to this parent concept
      const siblingRelations = this.localCell.cognitiveGraph.queryRelations({
        object: parentConceptId
      }).filter(
        r => r.predicate === CognitiveRelationPredicate.INSTANCE_OF ||
             r.predicate === CognitiveRelationPredicate.SPECIALIZES ||
             r.predicate === CognitiveRelationPredicate.IS_A
      );

      const siblingConceptIds = Array.from(new Set(siblingRelations.map(r => r.subjectConceptId)));
      if (!siblingConceptIds.includes(conceptId)) {
        siblingConceptIds.push(conceptId);
      }
      siblingConceptIds.sort();

      const allCoveredConceptIds = Array.from(new Set([parentConceptId, ...siblingConceptIds])).sort();

      const anomalyLabel = empiricalAnomaly
        ? String(empiricalAnomaly).toLowerCase().replace(/_/g, ' ')
        : 'empirical operational failure';

      const pattern = isConflict
        ? `Empirical risk invariant: ${parentConcept.canonicalName} instances exhibit ${anomalyLabel} across operational units`
        : `Empirical operational invariant: ${parentConcept.canonicalName} instances confirmed under operational telemetry`;

      const genSeed = `${parentConceptId}:${anomalyLabel}`;
      const genId = `gen_${computeDeterministicHash(genSeed).substring(0, 16)}`;

      // Check if a generalization already exists for this parent concept or pattern
      const existingGens = this.localCell.cognitiveGraph.getAllGeneralizations();
      let matchedGen = existingGens.find(
        g => g.generalizationId === genId ||
             (g.sourceConceptIds.includes(parentConceptId) && (g.pattern.includes(parentConcept.canonicalName) || g.pattern.includes(anomalyLabel))) ||
             g.pattern === pattern
      );

      const newEvidenceIds = activeEvidence.map(e => e.evidenceId);

      if (matchedGen) {
        // Update existing generalization
        const mergedConceptIds = Array.from(new Set([...matchedGen.sourceConceptIds, ...allCoveredConceptIds])).sort();
        const mergedSupportingEvidence = Array.from(new Set([...matchedGen.supportingEvidence, ...newEvidenceIds])).sort();
        const mergedEvidenceIds = Array.from(new Set([...(matchedGen.evidenceIds || []), ...newEvidenceIds])).sort();

        const isMultiEvidence = mergedSupportingEvidence.length > 1;
        const newStatus = isConflict
          ? RepresentationVerificationStatus.CONTRADICTED
          : (isMultiEvidence ? RepresentationVerificationStatus.SUPPORTED : RepresentationVerificationStatus.PENDING);

        const newConfidence = isMultiEvidence
          ? Math.min(0.95, 0.6 + (mergedSupportingEvidence.length * 0.15))
          : 0.6;

        const updatedGen: CognitiveGeneralization = {
          ...matchedGen,
          sourceConceptIds: mergedConceptIds,
          pattern,
          supportingEvidence: mergedSupportingEvidence,
          evidenceIds: mergedEvidenceIds,
          confidence: newConfidence,
          verificationStatus: newStatus,
          provenance: Array.from(new Set([...matchedGen.provenance, this.localCell.nodeId, experience.experienceId]))
        };

        await this.localCell.cognitiveGraph.updateGeneralization(updatedGen);
        return { gen: updatedGen, isNew: false };
      } else {
        // Forming a NEW generalization:
        // INVARIANT: Requires minimal 2 independent Experiences / evidence sources showing a compatible pattern.
        // sourceConceptIds alone cannot be counted as independent evidence without grounding experiences.
        const allGraphEvidences = this.localCell.cognitiveGraph.getAllEvidences();
        const candidateEvidences = new Map<string, Evidence>();
        for (const ev of allGraphEvidences) {
          candidateEvidences.set(ev.evidenceId, ev);
        }
        for (const ev of activeEvidence) {
          candidateEvidences.set(ev.evidenceId, ev);
        }

        const matchingEvidences: Evidence[] = [];
        const supportedConceptIds = new Set<string>();
        const supportingExperienceIds = new Set<string>();

        for (const ev of candidateEvidences.values()) {
          // 1. Polarity check: must match isConflict
          const targetReps = isConflict
            ? (ev.provenance?.contradictingRepresentationIds || [])
            : (ev.provenance?.supportingRepresentationIds || []);

          const matchedSibling = targetReps.find(id => siblingConceptIds.includes(id));
          if (!matchedSibling) continue;

          // 2. Extract experience ID from provenance or derivedFrom
          const expId = ev.provenance?.derivedFrom?.find(id => id.startsWith('exp_') || id.includes('experience')) ||
            (activeEvidence.some(ae => ae.evidenceId === ev.evidenceId) ? experience.experienceId : undefined);

          // 3. Compatibility check: Conflicting / irrelevant experiences must NOT be forced into the generalization
          if (isConflict) {
            let evAnomaly: string | undefined;
            const evObsId = ev.provenance?.observationId || ev.provenance?.derivedFrom?.find(id => id.startsWith('obs_'));
            if (evObsId) {
              try {
                const memObs = await this.localCell.memory.get(evObsId);
                if (memObs?.content) {
                  const parsed = typeof memObs.content === 'string' ? JSON.parse(memObs.content) : memObs.content;
                  evAnomaly = parsed.anomaly || parsed.content?.anomaly || parsed.error || parsed.failureMode || parsed.details;
                }
              } catch {}
            }
            if (!evAnomaly && expId) {
              try {
                const memExp = await this.localCell.memory.get(expId);
                if (memExp?.content) {
                  const parsed = typeof memExp.content === 'string' ? JSON.parse(memExp.content) : memExp.content;
                  evAnomaly = parsed.lessonsDerived?.[0] || parsed.metadata?.anomaly;
                }
              } catch {}
            }

            if (evAnomaly && empiricalAnomaly) {
              const normEv = String(evAnomaly).toLowerCase().replace(/_/g, ' ');
              const normEmp = anomalyLabel;
              const isCompatible = normEv.includes(normEmp) || normEmp.includes(normEv) ||
                (normEv.includes('cavitation') && normEmp.includes('cavitation')) ||
                (normEv.includes('rupture') && normEmp.includes('rupture')) ||
                (normEv.includes('overdrive') && normEmp.includes('overdrive')) ||
                (normEv.includes('failure') && normEmp.includes('failure'));
              if (!isCompatible) {
                // Incompatible anomaly: do not merge
                continue;
              }
            }
          }

          matchingEvidences.push(ev);
          supportedConceptIds.add(matchedSibling);
          if (expId) {
            supportingExperienceIds.add(expId);
          }
        }

        // Ensure current experience is recorded
        if (activeEvidence.length > 0) {
          supportingExperienceIds.add(experience.experienceId);
          supportedConceptIds.add(conceptId);
        }

        const independentEvidenceCount = matchingEvidences.length;
        const independentConceptCount = supportedConceptIds.size;
        const independentExperienceCount = supportingExperienceIds.size;

        // CRITICAL INVARIANT: Minimal 2 independent Experiences / evidence sources required
        if (independentExperienceCount < 2 || independentEvidenceCount < 2 || independentConceptCount < 2) {
          // Insufficient independent evidence. Do not form a generalization from a single experience.
          continue;
        }

        // >= 2 independent experiences and evidences confirmed!
        const evidenceIdsToStore = Array.from(new Set(matchingEvidences.map(e => e.evidenceId))).sort();
        const provenanceToStore = Array.from(new Set([
          this.localCell.nodeId,
          ...Array.from(supportingExperienceIds)
        ])).sort();

        const confidence = Math.min(0.95, 0.6 + (matchingEvidences.length * 0.15));
        const verificationStatus = isConflict
          ? RepresentationVerificationStatus.CONTRADICTED
          : RepresentationVerificationStatus.SUPPORTED;

        const newGen: CognitiveGeneralization = {
          generalizationId: genId,
          sourceConceptIds: allCoveredConceptIds,
          pattern,
          supportingEvidence: evidenceIdsToStore,
          evidenceIds: evidenceIdsToStore,
          confidence,
          verificationStatus,
          provenance: provenanceToStore,
          createdAt: new Date().toISOString(),
          originatingCellId: this.localCell.nodeId
        };

        const inserted = await this.localCell.cognitiveGraph.insertGeneralization(newGen);
        return { gen: inserted, isNew: true };
      }
    }

    // Fallback: If no hierarchical parent relation exists, check topological structural signature
    const existingConcepts = this.localCell.cognitiveGraph.getAllConcepts();
    const currentSig = this.localCell.cognitiveGraph.computeStructuralSignature(conceptId);
    if (currentSig) {
      const structurallySimilarSiblings: string[] = [conceptId];
      for (const other of existingConcepts) {
        if (other.conceptId === conceptId) continue;
        const otherSig = this.localCell.cognitiveGraph.computeStructuralSignature(other.conceptId);
        if (otherSig) {
          const sim = this.localCell.cognitiveGraph.compareSignatures(currentSig, otherSig);
          if (sim >= 0.5) {
            structurallySimilarSiblings.push(other.conceptId);
          }
        }
      }

      if (structurallySimilarSiblings.length > 1) {
        structurallySimilarSiblings.sort();
        const anomalyLabel = empiricalAnomaly
          ? String(empiricalAnomaly).toLowerCase().replace(/_/g, ' ')
          : 'empirical failure';

        const pattern = `Structural risk invariant: components with signature topology encounter ${anomalyLabel}`;
        const genSeed = `struct_${currentSig.outgoingPredicates.sort().join('_')}:${anomalyLabel}`;
        const genId = `gen_${computeDeterministicHash(genSeed).substring(0, 16)}`;

        const newEvidenceIds = activeEvidence.map(e => e.evidenceId);
        const existingGens = this.localCell.cognitiveGraph.getAllGeneralizations();
        const matchedExisting = existingGens.find(g => g.generalizationId === genId || g.pattern === pattern);

        if (matchedExisting) {
          const mergedConceptIds = Array.from(new Set([...matchedExisting.sourceConceptIds, ...structurallySimilarSiblings])).sort();
          const mergedSupportingEvidence = Array.from(new Set([...matchedExisting.supportingEvidence, ...newEvidenceIds])).sort();
          const updatedGen: CognitiveGeneralization = {
            ...matchedExisting,
            sourceConceptIds: mergedConceptIds,
            supportingEvidence: mergedSupportingEvidence,
            evidenceIds: mergedSupportingEvidence,
            confidence: Math.min(0.95, 0.6 + (mergedSupportingEvidence.length * 0.15)),
            verificationStatus: isConflict ? RepresentationVerificationStatus.CONTRADICTED : RepresentationVerificationStatus.SUPPORTED,
            provenance: Array.from(new Set([...matchedExisting.provenance, this.localCell.nodeId, experience.experienceId]))
          };
          await this.localCell.cognitiveGraph.updateGeneralization(updatedGen);
          return { gen: updatedGen, isNew: false };
        } else {
          // Require minimal 2 independent experiences / evidences for structural generalization
          const allGraphEvidences = this.localCell.cognitiveGraph.getAllEvidences();
          const candidateEvidences = new Map<string, Evidence>();
          for (const ev of allGraphEvidences) {
            candidateEvidences.set(ev.evidenceId, ev);
          }
          for (const ev of activeEvidence) {
            candidateEvidences.set(ev.evidenceId, ev);
          }

          const matchingEvidences: Evidence[] = [];
          const supportedConceptIds = new Set<string>();
          const supportingExperienceIds = new Set<string>();

          for (const ev of candidateEvidences.values()) {
            const targetReps = isConflict
              ? (ev.provenance?.contradictingRepresentationIds || [])
              : (ev.provenance?.supportingRepresentationIds || []);
            const matchedSibling = targetReps.find(id => structurallySimilarSiblings.includes(id));
            if (!matchedSibling) continue;

            const expId = ev.provenance?.derivedFrom?.find(id => id.startsWith('exp_') || id.includes('experience')) ||
              (activeEvidence.some(ae => ae.evidenceId === ev.evidenceId) ? experience.experienceId : undefined);

            matchingEvidences.push(ev);
            supportedConceptIds.add(matchedSibling);
            if (expId) supportingExperienceIds.add(expId);
          }

          if (activeEvidence.length > 0) {
            supportingExperienceIds.add(experience.experienceId);
            supportedConceptIds.add(conceptId);
          }

          if (supportingExperienceIds.size < 2 || matchingEvidences.length < 2 || supportedConceptIds.size < 2) {
            return null;
          }

          const evidenceIdsToStore = Array.from(new Set(matchingEvidences.map(e => e.evidenceId))).sort();
          const provenanceToStore = Array.from(new Set([
            this.localCell.nodeId,
            ...Array.from(supportingExperienceIds)
          ])).sort();

          const newGen: CognitiveGeneralization = {
            generalizationId: genId,
            sourceConceptIds: structurallySimilarSiblings,
            pattern,
            supportingEvidence: evidenceIdsToStore,
            evidenceIds: evidenceIdsToStore,
            confidence: Math.min(0.95, 0.6 + (matchingEvidences.length * 0.15)),
            verificationStatus: isConflict ? RepresentationVerificationStatus.CONTRADICTED : RepresentationVerificationStatus.SUPPORTED,
            provenance: provenanceToStore,
            createdAt: new Date().toISOString(),
            originatingCellId: this.localCell.nodeId
          };
          const inserted = await this.localCell.cognitiveGraph.insertGeneralization(newGen);
          return { gen: inserted, isNew: true };
        }
      }
    }

    return null;
  }
}
