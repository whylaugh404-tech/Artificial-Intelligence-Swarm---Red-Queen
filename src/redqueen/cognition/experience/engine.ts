import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  Experience,
  ExperienceSchema,
  MetabolismStatus,
  NoveltyClassification,
  InformationCategory
} from '../../metabolism/types';
import {
  DomainObservation,
  DomainObservationSchema,
  DomainExperience,
  DomainExperienceSchema,
  DomainKind,
  CausalReference,
  DomainTransitionEnvelope,
  DomainTransitionEnvelopeSchema
} from '../../feedback/types';
import {
  assertNotComputationResult
} from '../../feedback/transitions';
import {
  SemanticBoundaryViolationError
} from '../../feedback/errors';
import { computeDeterministicHash } from '../computation/canonical';
import { MemoryCategory, MemoryStore } from '../../memory/store';
import { CognitiveConcept, CognitiveRelationPredicate } from '../representation/types';
import { Evidence } from '../evidence/types';
import { Context } from '../epistemic/types';
import { CognitiveDevelopmentResult } from '../development/engine';
import { logger } from '../../core/logger';
import type { Cell } from '../../core/cell';

const COMPONENT = 'organic_experience_engine';

export interface ValidatedObservation {
  readonly observationId: string;
  readonly observedSubject: string;
  readonly source: string;
  readonly timestamp: string;
  readonly confidence: number;
  readonly content: any;
  readonly raw?: any;
}

export interface ExperienceTransitionOptions {
  readonly transactionId?: string;
  readonly cycleNumber?: number;
  readonly actionComputationId?: string;
  readonly category?: InformationCategory;
  readonly forceDeduplicate?: boolean;
  readonly lessonsDerived?: string[];
  readonly expectedContradiction?: boolean;
  readonly enableCognitiveDevelopment?: boolean;
  readonly relatedConceptIds?: string[];
  readonly relatedRelationIds?: string[];
  readonly context?: Context;
}

export interface ExperienceTransitionResult {
  readonly status: 'CREATED' | 'DUPLICATE' | 'REJECTED';
  readonly experience: Experience;
  readonly domainExperience?: DomainExperience;
  readonly transitionEnvelope?: DomainTransitionEnvelope;
  readonly polarity: 'CONCORDANT' | 'CONTRADICTORY' | 'NOVEL' | 'DUPLICATE';
  readonly reason: string;
  readonly resultingStateId?: string;
  readonly developmentResult?: CognitiveDevelopmentResult;
}

export interface ExperienceReplayTrace {
  readonly experienceId: string;
  readonly cellId: string;
  readonly timestamp: string;
  readonly cycleNumber?: number;
  readonly triggeringObservationId?: string;
  readonly priorStateId?: string;
  readonly resultingStateId?: string;
  readonly actionComputationId?: string;
  readonly evidenceIds?: readonly string[];
  readonly outcome: MetabolismStatus;
  readonly noveltyClassification: NoveltyClassification;
  readonly verified: boolean;
  readonly integrityHash: string;
  readonly observationFound: boolean;
  readonly replayStatus: 'VALID_CAUSAL_TRACE' | 'CORRUPTED_OR_INCOMPLETE';
}

/**
 * Organic Experience Transition Engine
 * 
 * Implements the canonical transition:
 * Observation → validation → contextualization → Experience → persistence
 * 
 * Guarantees:
 * 1. Uses existing Experience and DomainExperience models without duplicating types.
 * 2. Causal anchoring: triggering observation, prior state, resulting state, action/computation, evidence, timestamp/cycle, cell identity.
 * 3. Idempotent duplicate suppression: prevents runaway duplicate experience spam.
 * 4. Non-destructive conflict preservation: empirical contradictions are preserved as explicit epistemic friction rather than overwritten.
 * 5. Replay and recovery: full episodic tracing for cell learning and evolution.
 */
export class OrganicExperienceTransitionEngine {
  // In-memory duplicate suppression cache: cellId:obsHash -> experienceId
  private static readonly processedObservationHashes: Map<string, string> = new Map();

  /**
   * Stage 1: Validation
   * Validates raw inputs and enforces semantic boundary: ComputationResult ≠ Observation.
   */
  public static validateObservation(rawObservation: any): ValidatedObservation {
    if (!rawObservation) {
      throw new SemanticBoundaryViolationError(
        DomainKind.OBSERVATION,
        'NULL_OR_UNDEFINED',
        'Cannot process null or undefined observation'
      );
    }

    // Explicit boundary check: Reject raw ComputationResult masquerading as Observation
    if (rawObservation.domainKind === DomainKind.COMPUTATION_RESULT) {
      throw new SemanticBoundaryViolationError(
        DomainKind.OBSERVATION,
        DomainKind.COMPUTATION_RESULT,
        'ComputationResult passed directly as Observation without empirical world validation'
      );
    }

    if (rawObservation.payload) {
      assertNotComputationResult(rawObservation.payload, 'OrganicExperienceValidation');
    }

    let observedSubject: string | undefined;
    let source: string | undefined;
    let timestamp: string | undefined;
    let confidence: number = 1.0;
    let content: any = rawObservation;
    let observationId: string | undefined;

    if (rawObservation.domainKind === DomainKind.OBSERVATION) {
      observedSubject = rawObservation.observedSubject || (rawObservation.payload as any)?.observedSubject;
      source = rawObservation.source || (rawObservation.payload as any)?.sourceIdentifier || (rawObservation.payload as any)?.source;
      timestamp = rawObservation.timestamp || (rawObservation.payload as any)?.timestamp;
      confidence = rawObservation.confidence ?? 1.0;
      content = rawObservation.payload ?? rawObservation;
      observationId = rawObservation.deterministicId;
    } else {
      observedSubject = rawObservation.observedSubject || rawObservation.subject || rawObservation.type;
      source = rawObservation.source || rawObservation.sourceId || rawObservation.sourceIdentifier;
      timestamp = rawObservation.timestamp || rawObservation.createdAt;
      confidence = typeof rawObservation.confidence === 'number' ? rawObservation.confidence : 1.0;
      content = rawObservation.content ?? rawObservation;
      observationId = rawObservation.observationId || rawObservation.id;
    }

    if (!observedSubject || typeof observedSubject !== 'string' || observedSubject.trim().length === 0) {
      throw new Error("Observation validation failed: 'observedSubject' must be a non-empty string");
    }

    if (!source || typeof source !== 'string' || source.trim().length === 0) {
      throw new Error("Observation validation failed: 'source' must be a non-empty string");
    }

    const validTimestamp = timestamp && !isNaN(Date.parse(timestamp))
      ? new Date(timestamp).toISOString()
      : new Date().toISOString();

    const normalizedSubject = observedSubject.trim();
    const normalizedSource = source.trim();
    const cleanConfidence = Math.max(0, Math.min(1, confidence));

    if (!observationId) {
      const hashContent = computeDeterministicHash({
        subject: normalizedSubject,
        source: normalizedSource,
        content
      });
      observationId = `obs_${hashContent.substring(0, 20)}`;
    }

    return {
      observationId,
      observedSubject: normalizedSubject,
      source: normalizedSource,
      timestamp: validTimestamp,
      confidence: cleanConfidence,
      content,
      raw: rawObservation
    };
  }

  /**
   * Canonical Pipeline:
   * Observation → validation → contextualization → Experience → persistence
   */
  public static async transitionObservationToExperience(
    rawObservation: any,
    cell: Cell,
    options?: ExperienceTransitionOptions
  ): Promise<ExperienceTransitionResult> {
    // 1. Validation
    const validated = this.validateObservation(rawObservation);

    // 2. Contextualization: Capture Prior State
    const priorState = cell.cognitiveState.getState();
    const priorStateId = computeDeterministicHash(priorState);
    const cycleNumber = options?.cycleNumber ?? 0;
    const transactionId = options?.transactionId ?? `tx_${uuidv4()}`;
    const cellId = cell.nodeId;

    // 3. Duplicate Suppression Check
    const obsHash = computeDeterministicHash({
      cellId,
      subject: validated.observedSubject,
      source: validated.source,
      content: validated.content
    });
    const cacheKey = `${cellId}:${obsHash}`;

    const existingExpId = this.processedObservationHashes.get(cacheKey);
    if (existingExpId && options?.forceDeduplicate !== false) {
      // Fetch existing from memory
      const existingEntry = await cell.memory.get(existingExpId).catch(() => null);
      if (existingEntry && existingEntry.content) {
        logger.info(COMPONENT, 'duplicate_observation_suppressed', {
          cellId,
          observationId: validated.observationId,
          existingExperienceId: existingExpId
        });
        return {
          status: 'DUPLICATE',
          experience: existingEntry.content as Experience,
          polarity: 'DUPLICATE',
          reason: `Duplicate observation detected and suppressed: already metabolized into experience '${existingExpId}'.`,
          resultingStateId: priorStateId
        };
      }
    }

    // 4. Contextualize against Cognitive Graph and WorldModel
    let polarity: 'CONCORDANT' | 'CONTRADICTORY' | 'NOVEL' = 'NOVEL';
    let matchedConcept: CognitiveConcept | undefined;

    try {
      matchedConcept = await cell.cognitiveGraph.findConceptByName(validated.observedSubject);
    } catch {
      // Ignore if graph lookup fails or concept not found
    }

    if (matchedConcept) {
      // Evaluate concordance vs contradiction
      const content = validated.content;
      const isExplicitContradiction = options?.expectedContradiction === true ||
        (content && (content.contradicts === true || content.status === 'CONTRADICTED' || content.isFalse === true));

      if (isExplicitContradiction) {
        polarity = 'CONTRADICTORY';
      } else {
        // Concept exists and observation aligns or reinforces
        polarity = 'CONCORDANT';
      }
    } else {
      polarity = 'NOVEL';
    }

    // 5. Build Experience (using canonical Experience interface)
    const timestamp = validated.timestamp;
    const expSeed = {
      cellId,
      observationId: validated.observationId,
      priorStateId,
      cycleNumber,
      timestamp
    };
    const experienceId = `exp_${computeDeterministicHash(expSeed).substring(0, 24)}`;

    const noveltyClassification = polarity === 'CONTRADICTORY'
      ? NoveltyClassification.CONTRADICTION
      : (polarity === 'CONCORDANT' ? NoveltyClassification.REINFORCEMENT : NoveltyClassification.NOVEL);

    const noveltyScore = polarity === 'CONTRADICTORY' ? 0.9 : (polarity === 'NOVEL' ? 0.7 : 0.2);

    const verificationStatus = polarity === 'CONTRADICTORY'
      ? 'CONTRADICTED_BY_WORLD'
      : (polarity === 'CONCORDANT' ? 'CONFIRMED_BY_WORLD' : 'PENDING');

    const lessonsDerived = options?.lessonsDerived && options.lessonsDerived.length > 0
      ? options.lessonsDerived
      : (polarity === 'CONTRADICTORY'
          ? [
              'empirical_world_contradiction_detected',
              'prior_belief_conflicted_with_empirical_observation',
              'evidence_conflict_preserved_non_destructively'
            ]
          : (polarity === 'CONCORDANT'
              ? ['empirical_world_confirmation_recorded', 'prior_representation_reinforced']
              : ['novel_empirical_phenomenon_observed']));

    const evidenceIds: string[] = [];

    // 6. Handle Contradiction Non-Destructively (Preserve Evidence Conflict)
    if (polarity === 'CONTRADICTORY') {
      const conflictEvidenceId = `ev_conflict_${validated.observationId}`;
      const conflictEvidence: Evidence = {
        evidenceId: conflictEvidenceId,
        sourceId: validated.source,
        observationId: validated.observationId,
        timestamp,
        provenance: {
          sourceId: validated.source,
          observationId: validated.observationId,
          timestamp,
          derivedFrom: [validated.observationId, experienceId],
          contradictingRepresentationIds: matchedConcept ? [matchedConcept.conceptId] : undefined
        },
        context: {
          contextId: `ctx_conflict_${validated.observedSubject.toLowerCase()}`,
          domain: 'empirical_observation'
        },
        confidence: validated.confidence
      };

      try {
        await cell.cognitiveGraph.insertEvidence(conflictEvidence);
        evidenceIds.push(conflictEvidenceId);

        if (matchedConcept) {
          // Record knowledge gap in CognitiveState to handle cognitive friction
          cell.cognitiveState.recordKnowledgeGap(
            `Contradiction in ${validated.observedSubject}`,
            options?.category ?? InformationCategory.GENERAL_TECHNOLOGY,
            `Observed empirical contradiction against concept '${matchedConcept.canonicalName}'`,
            0.8
          );
        }
      } catch (err) {
        logger.warn(COMPONENT, 'failed_to_insert_conflict_evidence', { err });
      }
    }

    // 7. Update Cognitive State and Capture Resulting State
    cell.cognitiveState.addExperienceReference(experienceId);
    if (polarity === 'NOVEL' && matchedConcept) {
      cell.cognitiveState.addConceptReference(matchedConcept.conceptId);
    }
    const resultingState = cell.cognitiveState.getState();
    const resultingStateId = computeDeterministicHash(resultingState);

    const causalLinks = {
      triggeringObservationId: validated.observationId,
      priorStateId,
      resultingStateId,
      actionComputationId: options?.actionComputationId,
      evidenceIds: evidenceIds.length > 0 ? evidenceIds : undefined,
      cycleNumber
    };

    const experience: Experience = ExperienceSchema.parse({
      experienceId,
      transactionId,
      cellId,
      timestamp,
      informationId: validated.observationId,
      knowledgeIds: [],
      category: options?.category ?? InformationCategory.GENERAL_TECHNOLOGY,
      outcome: MetabolismStatus.ACCEPTED,
      noveltyClassification,
      noveltyScore,
      source: validated.source,
      confidence: validated.confidence,
      verificationStatus,
      lessonsDerived,
      observationId: validated.observationId,
      priorStateId,
      resultingStateId,
      actionComputationId: options?.actionComputationId,
      evidenceIds: evidenceIds.length > 0 ? evidenceIds : undefined,
      cycleNumber,
      causalLinks
    });

    // 8. Persistence to MemoryStore
    const experienceEntry = {
      id: experience.experienceId,
      cellId,
      category: MemoryCategory.EPISODIC,
      type: 'EXPERIENCE_RECORD',
      content: experience,
      source: validated.source,
      createdAt: timestamp,
      updatedAt: timestamp,
      confidence: experience.confidence,
      hash: computeDeterministicHash(experience),
      provenance: [cellId, validated.source, validated.observationId],
      version: 1
    };

    await cell.memory.put(experienceEntry);
    // Also save with experience_ prefix for dual index compatibility
    await cell.memory.put({
      ...experienceEntry,
      id: `experience_${experience.experienceId}`
    });

    // Persist triggering observation if not already present
    const obsEntry = await cell.memory.get(validated.observationId).catch(() => null);
    if (!obsEntry) {
      await cell.memory.put({
        id: validated.observationId,
        cellId,
        category: MemoryCategory.EPISODIC,
        type: 'OBSERVATION_RECORD',
        content: validated.content,
        source: validated.source,
        createdAt: timestamp,
        updatedAt: timestamp,
        confidence: validated.confidence,
        hash: computeDeterministicHash(validated.content),
        provenance: [cellId, validated.source],
        version: 1
      });
    }

    // Persist mutated CognitiveState
    await cell.cognitiveState.persist(cell.memory);

    // Register in duplicate suppression cache
    this.processedObservationHashes.set(cacheKey, experienceId);

    // Also construct DomainExperience & Envelope for formal feedback transition contracts
    const causalReferences: CausalReference[] = [
      {
        antecedentDomain: DomainKind.OBSERVATION,
        antecedentId: validated.observationId,
        relation: 'METABOLIZED_INTO_EXPERIENCE'
      }
    ];
    if (options?.actionComputationId) {
      causalReferences.push({
        antecedentDomain: DomainKind.COMPUTATION_RESULT,
        antecedentId: options.actionComputationId,
        relation: 'ACTION_COMPUTATION_LINK'
      });
    }

    const domainExperience: DomainExperience = DomainExperienceSchema.parse({
      contractVersion: 1,
      domainKind: DomainKind.EXPERIENCE,
      deterministicId: experienceId,
      cellId,
      cycleNumber,
      timestamp,
      causalReferences,
      provenance: [cellId, validated.source, 'ORGANIC_TRANSITION'],
      confidence: experience.confidence,
      status: MetabolismStatus.ACCEPTED,
      persistenceSemantics: {
        category: MemoryCategory.EPISODIC,
        storageKey: `experience_${experienceId}`,
        immutable: true,
        retentionPolicy: 'RETAIN_INDEFINITELY'
      },
      payload: experience
    });

    const transitionEnvelope: DomainTransitionEnvelope = DomainTransitionEnvelopeSchema.parse({
      transitionId: `tx_obs_exp_${computeDeterministicHash({ source: validated.observationId, target: experienceId }).substring(0, 20)}`,
      sourceDomain: DomainKind.OBSERVATION,
      targetDomain: DomainKind.EXPERIENCE,
      sourceId: validated.observationId,
      targetId: experienceId,
      cellId,
      cycleNumber,
      timestamp,
      causalReferences,
      provenance: domainExperience.provenance,
      confidence: experience.confidence,
      status: 'COMMITTED',
      persistenceSemantics: domainExperience.persistenceSemantics,
      deterministicHash: computeDeterministicHash(experience)
    });

    let developmentResult: CognitiveDevelopmentResult | undefined;
    if (options?.enableCognitiveDevelopment !== false && cell.cognitiveDevelopment) {
      try {
        const targetConcepts = options?.relatedConceptIds && options.relatedConceptIds.length > 0
          ? options.relatedConceptIds
          : (matchedConcept ? [matchedConcept.conceptId] : []);
        const targetRelations = options?.relatedRelationIds || [];
        const activeEvs = evidenceIds
          .map(id => cell.cognitiveGraph.getEvidence(id)!)
          .filter(Boolean);

        developmentResult = await cell.cognitiveDevelopment.evaluateExperience(
          experience,
          options?.context,
          targetConcepts,
          targetRelations,
          activeEvs
        );
      } catch (err: any) {
        logger.warn(COMPONENT, 'cognitive_development_trigger_failed', {
          experienceId,
          error: err.message
        });
      }
    }

    return {
      status: 'CREATED',
      experience,
      domainExperience,
      transitionEnvelope,
      polarity,
      reason: polarity === 'CONTRADICTORY'
        ? 'Observation contradicted existing concept. Experience recorded with non-destructive conflict preservation.'
        : (polarity === 'CONCORDANT'
            ? 'Observation confirmed existing concept. Experience recorded with reinforcement.'
            : 'Novel observation metabolized into episodic experience.'),
      resultingStateId,
      developmentResult
    };
  }

  /**
   * Replay and verify an Experience's causal trace
   */
  public static async replayExperience(
    experienceId: string,
    cell: Cell
  ): Promise<ExperienceReplayTrace> {
    const entry = await cell.memory.get(experienceId) || await cell.memory.get(`experience_${experienceId}`);
    if (!entry || !entry.content) {
      throw new Error(`Experience '${experienceId}' not found in cell memory`);
    }

    const experience = entry.content as Experience;
    const cleanId = experience.observationId || experience.informationId;
    const obsEntry = cleanId ? await cell.memory.get(cleanId).catch(() => null) : null;

    const integrityHash = computeDeterministicHash(experience);
    const hasCausalChain = Boolean(
      experience.cellId &&
      experience.timestamp &&
      experience.priorStateId &&
      experience.resultingStateId
    );

    return {
      experienceId: experience.experienceId,
      cellId: experience.cellId,
      timestamp: experience.timestamp,
      cycleNumber: experience.cycleNumber,
      triggeringObservationId: experience.observationId || experience.informationId,
      priorStateId: experience.priorStateId,
      resultingStateId: experience.resultingStateId,
      actionComputationId: experience.actionComputationId,
      evidenceIds: experience.evidenceIds,
      outcome: experience.outcome,
      noveltyClassification: experience.noveltyClassification,
      verified: hasCausalChain,
      integrityHash,
      observationFound: Boolean(obsEntry),
      replayStatus: hasCausalChain ? 'VALID_CAUSAL_TRACE' : 'CORRUPTED_OR_INCOMPLETE'
    };
  }

  /**
   * Recover all experiences belonging to a cell from persistent memory
   */
  public static async recoverCellExperiences(cell: Cell): Promise<Experience[]> {
    const entries = await cell.memory.search({
      category: MemoryCategory.EPISODIC,
      type: 'EXPERIENCE_RECORD'
    });

    const uniqueMap = new Map<string, Experience>();
    for (const entry of entries) {
      if (entry.content && entry.content.experienceId) {
        const exp = entry.content as Experience;
        if (!uniqueMap.has(exp.experienceId)) {
          uniqueMap.set(exp.experienceId, exp);
          cell.cognitiveState.addExperienceReference(exp.experienceId);
        }
      }
    }

    // Sort chronologically
    const recovered = Array.from(uniqueMap.values()).sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    logger.info(COMPONENT, 'cell_experiences_recovered', {
      cellId: cell.nodeId,
      count: recovered.length
    });

    return recovered;
  }

  /**
   * Clear in-memory duplicate cache (useful for test resets)
   */
  public static clearCache(): void {
    this.processedObservationHashes.clear();
  }
}
