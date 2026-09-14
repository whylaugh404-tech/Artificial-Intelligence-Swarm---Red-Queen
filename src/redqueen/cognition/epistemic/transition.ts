import { createHash } from 'crypto';
import {
  Context,
  ContextSchema,
  EpistemicState,
  EpistemicStateSchema,
  EpistemicStatus,
  EpistemicStatusSchema,
  EpistemicTransitionTrigger,
  EpistemicTransitionTriggerSchema,
  CognitiveTransitionRecord,
  CognitiveTransitionRecordSchema,
  freezeEpistemicState,
  freezeTransitionRecord,
  freezeContext,
  SubjectiveOpinion,
  SubjectiveOpinionSchema,
  EPSILON
} from './types';
import { RepresentationVerificationStatus } from '../representation/types';
import { Evidence } from '../evidence/types';
import { EvidenceDependencyGraph } from '../evidence/graph';
import { EpistemicFusionEngine, EpistemicFusionResult, EvidencePolarity, AttributedEvidence } from './fusion';
import { logger } from '../../core/logger';

export interface TransitionInput {
  targetRepresentationId: string;
  previousState?: EpistemicState;
  evidences?: Array<Evidence | AttributedEvidence>;
  fusionResult?: EpistemicFusionResult;
  context: Context;
  edg?: EvidenceDependencyGraph;
  explicitVerification?: {
    status: RepresentationVerificationStatus;
    verifiedBy?: string;
    proof?: string;
  };
  trigger?: EpistemicTransitionTrigger;
  reason?: string;
  customTransitionId?: string;
  customStateId?: string;
  deterministicTimestamp?: string;
}

export interface TransitionOutput {
  readonly nextState: Readonly<EpistemicState>;
  readonly transitionRecord: Readonly<CognitiveTransitionRecord>;
  readonly fusionResult?: Readonly<EpistemicFusionResult>;
}

/**
 * Deterministic helper to generate a reproducible cryptographic hash
 * across canonical state transition parameters.
 */
function computeDeterministicTransitionHash(data: Record<string, any>): string {
  const sortedKeys = Object.keys(data).sort();
  const canonical: Record<string, any> = {};
  for (const k of sortedKeys) {
    canonical[k] = data[k];
  }
  const serialized = JSON.stringify(canonical);
  return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
}

/**
 * P7.0 Step 6: Cognitive State Transition Engine
 * 
 * Implements deterministic, context-aware, immutable state transitions:
 * S(t+1) = Transition(S(t), E(t), F(t), C(t))
 * 
 * Rules enforced:
 * 1. Explicit state progression across UNKNOWN, HYPOTHESIS, BELIEVED, KNOWN, VERIFIED, CONTRADICTED.
 * 2. Strict VERIFIED boundary: mass/confidence/fusion CANNOT produce VERIFIED;
 *    only valid, explicit verification can transition to VERIFIED.
 * 3. Non-destructive conflict handling: preserves both sides of conflicting evidence,
 *    demoting contradictory beliefs to unresolved HYPOTHESIS/UNKNOWN.
 * 4. Strict context isolation: representations evaluated per context without cross-context contamination.
 * 5. Full immutability & backward compatibility: previous states are never mutated; legacy records preserved.
 */
export class CognitiveStateTransitionEngine {
  private readonly component = 'cognitive_state_transition';
  private readonly fusionEngine: EpistemicFusionEngine = new EpistemicFusionEngine();

  /**
   * Deterministically transitions a cognitive representation from S(t) to S(t+1).
   */
  public transition(input: TransitionInput): TransitionOutput {
    const validatedContext = ContextSchema.parse(input.context);

    // Context Isolation Check (Rule 5)
    if (input.previousState) {
      const prevContext = input.previousState.context;
      if (
        (prevContext.contextId !== validatedContext.contextId ||
          prevContext.domain !== validatedContext.domain) &&
        input.trigger !== EpistemicTransitionTrigger.CONTEXT_SHIFT
      ) {
        throw new Error(
          `Context mismatch: cannot transition epistemic state across mismatched contexts ` +
          `[${prevContext.domain}:${prevContext.contextId}] vs [${validatedContext.domain}:${validatedContext.contextId}] ` +
          `without explicit CONTEXT_SHIFT trigger.`
        );
      }
    }

    // Step 1: Resolve Fusion Result and Evidence Pool
    let effectiveFusionResult: EpistemicFusionResult | undefined = input.fusionResult;
    const evidenceIds: string[] = [];

    if (!effectiveFusionResult && input.evidences && input.evidences.length > 0) {
      effectiveFusionResult = this.fusionEngine.fuse(
        input.evidences,
        validatedContext,
        input.edg || new EvidenceDependencyGraph(),
        {
          targetRepresentationId: input.targetRepresentationId,
          previousState: input.previousState
        }
      );
    }

    if (effectiveFusionResult) {
      for (const ev of effectiveFusionResult.supportingEvidence) {
        if (!evidenceIds.includes(ev.evidenceId)) {
          evidenceIds.push(ev.evidenceId);
        }
      }
      for (const ev of effectiveFusionResult.conflictingEvidence) {
        if (!evidenceIds.includes(ev.evidenceId)) {
          evidenceIds.push(ev.evidenceId);
        }
      }
    } else if (input.evidences) {
      for (const item of input.evidences) {
        const ev = 'evidence' in item ? item.evidence : item;
        if (!evidenceIds.includes(ev.evidenceId)) {
          evidenceIds.push(ev.evidenceId);
        }
      }
    }

    evidenceIds.sort();

    // Step 2: Extract current epistemic status
    const previousState = input.previousState ? EpistemicStateSchema.parse(input.previousState) : undefined;
    const previousStatus = previousState?.status ?? EpistemicStatus.UNKNOWN;
    const previousVerStatus = previousState?.verificationStatus ?? RepresentationVerificationStatus.PENDING;

    // Step 3: Analyze Evidence and Conflict Signals
    const hasConflict = Boolean(effectiveFusionResult?.hasConflict);
    const hasSupporting = Boolean(
      (effectiveFusionResult && effectiveFusionResult.supportingEvidence.length > 0) ||
      (effectiveFusionResult && effectiveFusionResult.effectiveSupportMass > 0)
    );
    const hasContradicting = Boolean(
      (effectiveFusionResult && effectiveFusionResult.conflictingEvidence.length > 0) ||
      (effectiveFusionResult && effectiveFusionResult.effectiveConflictMass > 0)
    );

    let nextStatus: EpistemicStatus = previousStatus;
    let nextVerStatus: RepresentationVerificationStatus = previousVerStatus;
    let determinedTrigger: EpistemicTransitionTrigger = input.trigger ?? EpistemicTransitionTrigger.EVIDENCE_OBSERVED;
    let determinedReason: string = input.reason || '';

    // Step 4: Explicit State Machine Evaluation

    // 4A. Explicit Verification Signal Provided
    if (input.explicitVerification) {
      const ver = input.explicitVerification;
      if (ver.status === RepresentationVerificationStatus.VERIFIED) {
        // Verification Boundary Check:
        // Cannot verify if there is active unresolved conflict
        if (hasConflict) {
          nextStatus = EpistemicStatus.HYPOTHESIS;
          nextVerStatus = RepresentationVerificationStatus.PENDING;
          determinedTrigger = EpistemicTransitionTrigger.CONFLICT_FLAGGED;
          determinedReason = determinedReason || 'Explicit verification rejected due to active unresolved evidence conflict.';
        } else if (hasContradicting && !hasSupporting) {
          // Cannot verify a contradicted representation
          nextStatus = EpistemicStatus.CONTRADICTED;
          nextVerStatus = RepresentationVerificationStatus.CONTRADICTED;
          determinedTrigger = EpistemicTransitionTrigger.CONTRADICTION_DETECTED;
          determinedReason = determinedReason || 'Explicit verification rejected: representation is contradicted by evidence.';
        } else if (previousStatus === EpistemicStatus.CONTRADICTED) {
          // Cannot jump directly from CONTRADICTED to VERIFIED (Rule 2)
          nextStatus = EpistemicStatus.HYPOTHESIS;
          nextVerStatus = RepresentationVerificationStatus.PENDING;
          determinedTrigger = EpistemicTransitionTrigger.CONFLICT_FLAGGED;
          determinedReason = determinedReason || 'Re-evaluating previously contradicted representation as hypothesis; direct jump to VERIFIED is prohibited.';
        } else {
          // Valid explicit verification: transitions to VERIFIED
          nextStatus = EpistemicStatus.VERIFIED;
          nextVerStatus = RepresentationVerificationStatus.VERIFIED;
          determinedTrigger = EpistemicTransitionTrigger.EXPLICIT_VERIFICATION;
          determinedReason = determinedReason || `Verified by authorized verification: ${ver.verifiedBy || 'system'}`;
        }
      } else if (
        ver.status === RepresentationVerificationStatus.CONTRADICTED ||
        ver.status === RepresentationVerificationStatus.REJECTED
      ) {
        nextStatus = EpistemicStatus.CONTRADICTED;
        nextVerStatus = RepresentationVerificationStatus.CONTRADICTED;
        determinedTrigger = EpistemicTransitionTrigger.CONTRADICTION_DETECTED;
        determinedReason = determinedReason || `Explicitly rejected/contradicted by verification: ${ver.verifiedBy || 'system'}`;
      } else {
        nextVerStatus = ver.status;
      }
    }
    // 4B. Explicit Contradiction Trigger
    else if (input.trigger === EpistemicTransitionTrigger.CONTRADICTION_DETECTED) {
      nextStatus = EpistemicStatus.CONTRADICTED;
      nextVerStatus = RepresentationVerificationStatus.CONTRADICTED;
      determinedTrigger = EpistemicTransitionTrigger.CONTRADICTION_DETECTED;
      determinedReason = determinedReason || 'Representation contradicted by explicit contradictory relation or finding.';
    }
    // 4C. Evidence Conflict Detected (Rule 4: Non-destructive conflict)
    else if (hasConflict || input.trigger === EpistemicTransitionTrigger.CONFLICT_FLAGGED) {
      determinedTrigger = EpistemicTransitionTrigger.CONFLICT_FLAGGED;
      nextVerStatus = RepresentationVerificationStatus.PENDING;

      if (
        previousStatus === EpistemicStatus.VERIFIED ||
        previousStatus === EpistemicStatus.BELIEVED ||
        previousStatus === EpistemicStatus.KNOWN
      ) {
        // Demote to HYPOTHESIS when contradictions surface against established belief
        nextStatus = EpistemicStatus.HYPOTHESIS;
        determinedReason = determinedReason ||
          `Unresolved conflict between opposing evidence clusters: demoted from ${previousStatus} to HYPOTHESIS.`;
      } else if (previousStatus === EpistemicStatus.CONTRADICTED) {
        // Contradicted claim receives opposing supporting evidence -> becomes disputed HYPOTHESIS
        nextStatus = EpistemicStatus.HYPOTHESIS;
        determinedReason = determinedReason ||
          'Previously contradicted representation received supporting evidence: transitioned to disputed HYPOTHESIS.';
      } else {
        // UNKNOWN or HYPOTHESIS stays HYPOTHESIS (unresolved)
        nextStatus = EpistemicStatus.HYPOTHESIS;
        determinedReason = determinedReason || 'Unresolved conflict: evidence clusters contradict each other.';
      }
    }
    // 4D. Pure Contradiction (hasContradicting && !hasSupporting)
    else if (hasContradicting && !hasSupporting) {
      nextStatus = EpistemicStatus.CONTRADICTED;
      nextVerStatus = RepresentationVerificationStatus.CONTRADICTED;
      determinedTrigger = EpistemicTransitionTrigger.CONTRADICTION_DETECTED;
      determinedReason = determinedReason ||
        `Direct contradiction: refuted by ${effectiveFusionResult?.conflictingEvidence.length || 1} contradicting evidence record(s).`;
    }
    // 4D. Pure Supporting Evidence (hasSupporting && !hasContradicting)
    else if (hasSupporting && !hasContradicting) {
      determinedTrigger = effectiveFusionResult
        ? EpistemicTransitionTrigger.FUSION_APPLIED
        : EpistemicTransitionTrigger.EVIDENCE_OBSERVED;

      switch (previousStatus) {
        case EpistemicStatus.UNKNOWN:
          // UNKNOWN + supporting evidence -> HYPOTHESIS
          nextStatus = EpistemicStatus.HYPOTHESIS;
          nextVerStatus = RepresentationVerificationStatus.PENDING;
          determinedReason = determinedReason || 'Supporting evidence observed: transitioned from UNKNOWN to HYPOTHESIS.';
          break;

        case EpistemicStatus.HYPOTHESIS:
          // HYPOTHESIS + supporting evidence -> BELIEVED
          nextStatus = EpistemicStatus.BELIEVED;
          nextVerStatus = RepresentationVerificationStatus.SUPPORTED;
          determinedReason = determinedReason || 'Supporting evidence observed: transitioned from HYPOTHESIS to BELIEVED.';
          break;

        case EpistemicStatus.BELIEVED:
          // BELIEVED + more supporting evidence -> remains BELIEVED.
          // Fusion / Transition DOES NOT create VERIFIED without explicit verification!
          nextStatus = EpistemicStatus.BELIEVED;
          nextVerStatus = RepresentationVerificationStatus.SUPPORTED;
          determinedReason = determinedReason || 'Additional supporting evidence consolidated existing BELIEVED state.';
          break;

        case EpistemicStatus.CONTRADICTED:
          // CONTRADICTED + new supporting evidence -> HYPOTHESIS (Rule 2: jangan otomatis menjadi VERIFIED!)
          nextStatus = EpistemicStatus.HYPOTHESIS;
          nextVerStatus = RepresentationVerificationStatus.PENDING;
          determinedReason = determinedReason || 'Previously contradicted representation received new supporting evidence: re-opened as HYPOTHESIS.';
          break;

        case EpistemicStatus.VERIFIED:
          // Already VERIFIED + new supporting evidence -> remains VERIFIED
          nextStatus = EpistemicStatus.VERIFIED;
          nextVerStatus = RepresentationVerificationStatus.VERIFIED;
          determinedReason = determinedReason || 'Additional supporting evidence corroborates VERIFIED representation.';
          break;

        case EpistemicStatus.KNOWN:
          nextStatus = EpistemicStatus.KNOWN;
          nextVerStatus = previousVerStatus;
          determinedReason = determinedReason || 'Supporting evidence reinforces KNOWN state.';
          break;
      }
    }
    // 4E. No New Evidence / Neutral
    else {
      if (previousState) {
        nextStatus = previousState.status;
        nextVerStatus = previousState.verificationStatus;
        determinedReason = determinedReason || 'No new evidence: state preserved unchanged.';
      } else {
        nextStatus = EpistemicStatus.UNKNOWN;
        nextVerStatus = RepresentationVerificationStatus.PENDING;
        determinedReason = determinedReason || 'Initial state initialized without evidence.';
      }
    }

    // Step 5: Derive Subjective Opinion and Confidence
    let nextOpinion: SubjectiveOpinion | undefined;
    let nextConfidence: number | undefined;

    if (effectiveFusionResult?.fusedState.opinion) {
      nextOpinion = effectiveFusionResult.fusedState.opinion;
      nextConfidence = effectiveFusionResult.fusedState.rawConfidence;
    } else if (previousState?.opinion) {
      nextOpinion = { ...previousState.opinion };
      nextConfidence = previousState.rawConfidence;
    } else {
      // Default initial opinion based on status
      if (nextStatus === EpistemicStatus.VERIFIED) {
        nextOpinion = { belief: 1.0, disbelief: 0.0, uncertainty: 0.0, baseRate: 0.5 };
        nextConfidence = 1.0;
      } else if (nextStatus === EpistemicStatus.CONTRADICTED) {
        nextOpinion = { belief: 0.0, disbelief: 1.0, uncertainty: 0.0, baseRate: 0.5 };
        nextConfidence = 0.0;
      } else {
        nextOpinion = { belief: 0.0, disbelief: 0.0, uncertainty: 1.0, baseRate: 0.5 };
        nextConfidence = 0.0;
      }
    }

    // Validate subjective opinion sum = 1.0 within EPSILON
    if (nextOpinion) {
      SubjectiveOpinionSchema.parse(nextOpinion);
    }

    // Step 6: Deterministic ID generation (Rule 8: Determinism)
    const timestamp = input.deterministicTimestamp || new Date().toISOString();
    const hash = computeDeterministicTransitionHash({
      repId: input.targetRepresentationId,
      prevId: previousState?.stateId || 'root',
      prevStatus: previousStatus,
      nextStatus,
      nextVerStatus,
      ctxId: validatedContext.contextId,
      domain: validatedContext.domain,
      evidenceIds,
      trigger: determinedTrigger,
      hasConflict
    });

    const stateId = input.customStateId || `state_${hash}`;
    const transitionId = input.customTransitionId || `trans_${hash}`;

    // Step 7: Construct Immutable EpistemicState S(t+1)
    const nextStateRaw: EpistemicState = {
      stateId,
      opinion: nextOpinion,
      status: nextStatus,
      verificationStatus: nextVerStatus,
      context: validatedContext,
      rawConfidence: nextConfidence,
      previousStateId: previousState?.stateId,
      transitionReason: determinedReason,
      evidenceIds: evidenceIds.length > 0 ? evidenceIds : undefined,
      createdAt: timestamp
    };

    const validatedNextState = EpistemicStateSchema.parse(nextStateRaw);
    const frozenNextState = freezeEpistemicState(validatedNextState);

    // Step 8: Construct Immutable CognitiveTransitionRecord
    const transitionRecordRaw: CognitiveTransitionRecord = {
      transitionId,
      targetRepresentationId: input.targetRepresentationId,
      previousStateId: previousState?.stateId,
      previousStatus: previousState?.status,
      nextStateId: frozenNextState.stateId,
      nextStatus: frozenNextState.status,
      context: validatedContext,
      trigger: determinedTrigger,
      reason: determinedReason,
      evidenceIds,
      hasConflict,
      timestamp
    };

    const validatedTransitionRecord = CognitiveTransitionRecordSchema.parse(transitionRecordRaw);
    const frozenTransitionRecord = freezeTransitionRecord(validatedTransitionRecord);

    logger.debug(this.component, 'state_transition_completed', {
      representationId: input.targetRepresentationId,
      from: previousStatus,
      to: nextStatus,
      trigger: determinedTrigger,
      hasConflict,
      evidenceCount: evidenceIds.length
    });

    return {
      nextState: frozenNextState,
      transitionRecord: frozenTransitionRecord,
      fusionResult: effectiveFusionResult
    };
  }

  /**
   * Safe serialization of CognitiveTransitionRecord.
   */
  public persist(record: CognitiveTransitionRecord): string {
    const validated = CognitiveTransitionRecordSchema.parse(record);
    return JSON.stringify(validated);
  }

  /**
   * Safe reloading of serialized CognitiveTransitionRecord.
   */
  public reload(json: string): Readonly<CognitiveTransitionRecord> | null {
    try {
      const parsed = JSON.parse(json);
      const validated = CognitiveTransitionRecordSchema.parse(parsed);
      return freezeTransitionRecord(validated);
    } catch (err) {
      logger.warn(this.component, 'reload_transition_record_failed', { err });
      return null;
    }
  }

  /**
   * Safe serialization of EpistemicState.
   */
  public persistState(state: EpistemicState): string {
    const validated = EpistemicStateSchema.parse(state);
    return JSON.stringify(validated);
  }

  /**
   * Safe reloading of serialized EpistemicState.
   */
  public reloadState(json: string): Readonly<EpistemicState> | null {
    try {
      const parsed = JSON.parse(json);
      const validated = EpistemicStateSchema.parse(parsed);
      return freezeEpistemicState(validated);
    } catch (err) {
      logger.warn(this.component, 'reload_epistemic_state_failed', { err });
      return null;
    }
  }
}
