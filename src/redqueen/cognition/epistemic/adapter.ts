import { RepresentationVerificationStatus } from '../representation/types';
import { EpistemicState, EpistemicStatus, SubjectiveOpinion, Context, freezeContext, EpistemicStateSchema } from './types';

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
    // status = UNKNOWN because we don't have sufficient epistemic information (SubjectiveOpinion).
    const status = EpistemicStatus.UNKNOWN;

    return {
      stateId: `epistemic_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      status,
      verificationStatus,
      context: freezeContext(contextParams),
      rawConfidence: confidence
    };
  }

  /**
   * Evaluates EpistemicStatus without using magic threshold on opinion.
   * KNOWN/VERIFIED comes from verification criteria.
   */
  public static evaluateStatus(
    opinion: SubjectiveOpinion | undefined,
    verificationStatus: RepresentationVerificationStatus
  ): EpistemicStatus {
    if (!opinion) {
      return EpistemicStatus.UNKNOWN;
    }

    switch (verificationStatus) {
      case RepresentationVerificationStatus.VERIFIED:
        return EpistemicStatus.VERIFIED;
      case RepresentationVerificationStatus.SUPPORTED:
        return EpistemicStatus.KNOWN;
      case RepresentationVerificationStatus.PENDING:
        return EpistemicStatus.HYPOTHESIS;
      default:
        return EpistemicStatus.UNKNOWN;
    }
  }

  public static createWithOpinion(
    opinion: SubjectiveOpinion,
    verificationStatus: RepresentationVerificationStatus,
    contextParams: Context
  ): EpistemicState {
    return {
      stateId: `epistemic_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      status: this.evaluateStatus(opinion, verificationStatus),
      verificationStatus,
      context: freezeContext(contextParams),
      opinion
    };
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
