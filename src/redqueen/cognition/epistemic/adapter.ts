import { RepresentationVerificationStatus } from '../representation/types';
import { EpistemicState, EpistemicStatus, SubjectiveOpinion, Context, freezeContext, EpistemicStateSchema, SubjectiveOpinionSchema, ContextSchema } from './types';
import { Evidence, EvidenceSchema, freezeEvidence } from '../evidence/types';
import { ComputationResult } from '../computation/types';

export class EpistemicAdapter {
  
  /**
   * Adapts P5.1 data (scalar confidence + verificationStatus) to P7.0 EpistemicState.
   * Does NOT hallucinate SubjectiveOpinion from scalar confidence.
   */
  public static fromP5(
    confidence: number, 
    verificationStatus: RepresentationVerificationStatus,
    contextParams: Context
  ): EpistemicState {
    
    // If we only have confidence, we don't make up belief/disbelief/uncertainty.
    // However, verificationStatus CAN determine the EpistemicStatus.
    const status = this.evaluateStatus(verificationStatus);

    return {
      stateId: `epistemic_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      status,
      verificationStatus,
      context: freezeContext(contextParams),
      rawConfidence: confidence
    };
  }

  /**
   * Evaluates EpistemicStatus conservatively from verification criteria.
   * PENDING -> HYPOTHESIS
   * SUPPORTED -> BELIEVED
   * VERIFIED -> VERIFIED
   * CONTRADICTED / REJECTED -> CONTRADICTED
   * UNKNOWN / others -> UNKNOWN
   * 
   * Opinion strength alone does not determine verification.
   */
  public static evaluateStatus(
    verificationStatus: RepresentationVerificationStatus | string | undefined,
    opinion?: SubjectiveOpinion
  ): EpistemicStatus;
  public static evaluateStatus(
    opinion: SubjectiveOpinion | undefined,
    verificationStatus: RepresentationVerificationStatus | string | undefined
  ): EpistemicStatus;
  public static evaluateStatus(
    arg1: RepresentationVerificationStatus | string | SubjectiveOpinion | undefined,
    arg2?: SubjectiveOpinion | RepresentationVerificationStatus | string | undefined
  ): EpistemicStatus {
    let verificationStatus: string | undefined;

    if (typeof arg1 === 'string') {
      verificationStatus = arg1;
    } else if (typeof arg2 === 'string') {
      verificationStatus = arg2;
    }

    if (!verificationStatus) {
      return EpistemicStatus.UNKNOWN;
    }

    switch (verificationStatus) {
      case RepresentationVerificationStatus.VERIFIED:
        return EpistemicStatus.VERIFIED;
      case RepresentationVerificationStatus.SUPPORTED:
        return EpistemicStatus.BELIEVED;
      case RepresentationVerificationStatus.PENDING:
        return EpistemicStatus.HYPOTHESIS;
      case RepresentationVerificationStatus.CONTRADICTED:
      case RepresentationVerificationStatus.REJECTED:
        return EpistemicStatus.CONTRADICTED;
      default:
        return EpistemicStatus.UNKNOWN;
    }
  }

  public static createWithOpinion(
    opinion: SubjectiveOpinion,
    verificationStatus: RepresentationVerificationStatus,
    contextParams: Context
  ): EpistemicState {
    SubjectiveOpinionSchema.parse(opinion);
    return {
      stateId: `epistemic_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      status: this.evaluateStatus(verificationStatus, opinion),
      verificationStatus,
      context: freezeContext(contextParams),
      opinion
    };
  }

  /**
   * Adapts P7 EpistemicState into P8 EpistemicComputationContext.
   */
  public static toEpistemicComputationContext(state: EpistemicState, sourceRepresentationId?: string) {
    const uncertainty = state.opinion?.uncertainty ?? 1.0;
    const confidence = state.rawConfidence ?? state.opinion?.belief ?? 0.0;
    
    return {
      sourceRepresentationId,
      epistemicStatus: state.status,
      uncertainty,
      confidence,
      provenance: state.evidenceIds && state.evidenceIds.length > 0 ? state.evidenceIds : ['direct_state_adaptation']
    };
  }

  /**
   * Adapts P8 ComputationResult into P7 Evidence.
   * Forces the provenance sourceId to 'distributed_computation'.
   */
  public static fromComputationResult(result: ComputationResult, contextParams: Context): Readonly<Evidence> {
    const evidence: Evidence = {
      evidenceId: `ev_comp_${result.taskId}_${Date.now()}`,
      sourceId: 'distributed_computation', // Required by P7 constraints
      observationId: result.taskId,
      timestamp: result.completedAt || new Date().toISOString(),
      provenance: {
        sourceId: 'distributed_computation',
        observationId: result.taskId,
        timestamp: result.completedAt || new Date().toISOString(),
        derivedFrom: result.provenance,
        supportingRepresentationIds: [],
        contradictingRepresentationIds: []
      },
      context: freezeContext(contextParams),
      confidence: result.verificationStatus.verified ? result.verificationStatus.consistencyScore : 0.0
    };
    
    const validated = EvidenceSchema.parse(evidence);
    return freezeEvidence(validated);
  }

  public static persist(state: EpistemicState): string {
    return JSON.stringify(state);
  }

  public static reload(json: string): EpistemicState | null {
    try {
      const parsed = JSON.parse(json);
      const result = EpistemicStateSchema.safeParse(parsed);
      
      if (!result.success) {
        return null;
      }
      
      const state = result.data;
      state.context = freezeContext(state.context);
      
      return state;
    } catch {
      return null;
    }
  }
}
