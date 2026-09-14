import { test, expect, describe } from 'vitest';
import { CognitiveStateTransitionEngine } from '../src/redqueen/cognition/epistemic/transition';
import { EpistemicStatus, EpistemicTransitionTrigger, EpistemicState } from '../src/redqueen/cognition/epistemic/types';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';

describe('P7.0 Step 6: Epistemic Transition Engine', () => {
  const engine = new CognitiveStateTransitionEngine();
  const context = { domain: 'TEST', contextId: 'ctx_001' };

  test('UNKNOWN + valid support -> HYPOTHESIS', () => {
    const prev: EpistemicState = {
      stateId: 'state_1',
      status: EpistemicStatus.UNKNOWN,
      verificationStatus: RepresentationVerificationStatus.PENDING,
      context,
      rawConfidence: 0.0,
      createdAt: new Date().toISOString()
    };
    
    const result = engine.transition({
      targetRepresentationId: 'rep_1',
      previousState: prev,
      context,
      trigger: EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
      evidences: [{
        evidence: {
          evidenceId: 'ev_1',
          sourceId: "src_1", timestamp: new Date().toISOString(), content: 'some support',
          provenance: { sourceId: 'src_1', timestamp: new Date().toISOString() },
          context
        },
        polarity: 'SUPPORTS',
        weight: 1.0
      }]
    } as any);

    expect(result.nextState.status).toBe(EpistemicStatus.HYPOTHESIS);
    expect(result.nextState.verificationStatus).toBe(RepresentationVerificationStatus.PENDING);
  });

  test('HYPOTHESIS + valid support -> BELIEVED', () => {
    const prev: EpistemicState = {
      stateId: 'state_2',
      status: EpistemicStatus.HYPOTHESIS,
      verificationStatus: RepresentationVerificationStatus.PENDING,
      context,
      rawConfidence: 0.5,
      createdAt: new Date().toISOString()
    };
    
    const result = engine.transition({
      targetRepresentationId: 'rep_1',
      previousState: prev,
      context,
      trigger: EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
      evidences: [{
        evidence: {
          evidenceId: 'ev_2',
          sourceId: "src_1", timestamp: new Date().toISOString(), content: 'more support',
          provenance: { sourceId: 'src_1', timestamp: new Date().toISOString() },
          context
        },
        polarity: 'SUPPORTS',
        weight: 1.0
      }]
    } as any);

    expect(result.nextState.status).toBe(EpistemicStatus.BELIEVED);
    expect(result.nextState.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
  });

  test('BELIEVED + support -> BELIEVED', () => {
    const prev: EpistemicState = {
      stateId: 'state_3',
      status: EpistemicStatus.BELIEVED,
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      context,
      rawConfidence: 0.8,
      createdAt: new Date().toISOString()
    };
    
    const result = engine.transition({
      targetRepresentationId: 'rep_1',
      previousState: prev,
      context,
      trigger: EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
      evidences: [{
        evidence: {
          evidenceId: 'ev_3',
          sourceId: "src_1", timestamp: new Date().toISOString(), content: 'even more support',
          provenance: { sourceId: 'src_1', timestamp: new Date().toISOString() },
          context
        },
        polarity: 'SUPPORTS',
        weight: 1.0
      }]
    } as any);

    expect(result.nextState.status).toBe(EpistemicStatus.BELIEVED);
  });

  test('CONTRADICTED + valid support -> HYPOTHESIS', () => {
    const prev: EpistemicState = {
      stateId: 'state_4',
      status: EpistemicStatus.CONTRADICTED,
      verificationStatus: RepresentationVerificationStatus.CONTRADICTED,
      context,
      rawConfidence: 0.0,
      createdAt: new Date().toISOString()
    };
    
    const result = engine.transition({
      targetRepresentationId: 'rep_1',
      previousState: prev,
      context,
      trigger: EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
      evidences: [{
        evidence: {
          evidenceId: 'ev_4',
          sourceId: "src_1", timestamp: new Date().toISOString(), content: 'new support',
          provenance: { sourceId: 'src_1', timestamp: new Date().toISOString() },
          context
        },
        polarity: 'SUPPORTS',
        weight: 1.0
      }]
    } as any);

    expect(result.nextState.status).toBe(EpistemicStatus.HYPOTHESIS);
    expect(result.nextState.verificationStatus).toBe(RepresentationVerificationStatus.PENDING);
  });

  test('VERIFIED + support -> remains VERIFIED, without dropping', () => {
    const prev: EpistemicState = {
      stateId: 'state_5',
      status: EpistemicStatus.VERIFIED,
      verificationStatus: RepresentationVerificationStatus.VERIFIED,
      context,
      rawConfidence: 1.0,
      createdAt: new Date().toISOString()
    };
    
    const result = engine.transition({
      targetRepresentationId: 'rep_1',
      previousState: prev,
      context,
      trigger: EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
      evidences: [{
        evidence: {
          evidenceId: 'ev_5',
          sourceId: "src_1", timestamp: new Date().toISOString(), content: 'corroborating',
          provenance: { sourceId: 'src_1', timestamp: new Date().toISOString() },
          context
        },
        polarity: 'SUPPORTS',
        weight: 1.0
      }]
    } as any);

    expect(result.nextState.status).toBe(EpistemicStatus.VERIFIED);
  });

  test('VERIFIED + conflict -> demotes to HYPOTHESIS (unresolved conflict)', () => {
    const prev: EpistemicState = {
      stateId: 'state_6',
      status: EpistemicStatus.VERIFIED,
      verificationStatus: RepresentationVerificationStatus.VERIFIED,
      context,
      rawConfidence: 1.0,
      createdAt: new Date().toISOString()
    };
    
    const result = engine.transition({
      targetRepresentationId: 'rep_1',
      previousState: prev,
      context,
      trigger: EpistemicTransitionTrigger.CONFLICT_FLAGGED,
      evidences: [
        {
          evidence: {
            evidenceId: 'ev_6a',
            sourceId: "src_1", timestamp: new Date().toISOString(), content: 'support',
            provenance: { sourceId: 'src_1', timestamp: new Date().toISOString() },
            context
          },
          polarity: 'SUPPORTS',
          weight: 1.0
        },
        {
          evidence: {
            evidenceId: 'ev_6b',
            sourceId: "src_1", timestamp: new Date().toISOString(), content: 'conflict',
            provenance: { sourceId: 'src_2', timestamp: new Date().toISOString() },
            context
          },
          polarity: 'CONTRADICTS',
          weight: 1.0
        }
      ]
    } as any);

    // Rule: Unresolved conflict demotes to HYPOTHESIS
    expect(result.nextState.status).toBe(EpistemicStatus.HYPOTHESIS);
    expect(result.transitionRecord.hasConflict).toBe(true);
  });

  test('CONTRADICTED only from explicit contradiction / contradictory evidence', () => {
    const prev: EpistemicState = {
      stateId: 'state_7',
      status: EpistemicStatus.BELIEVED,
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      context,
      rawConfidence: 0.8,
      createdAt: new Date().toISOString()
    };
    
    const result = engine.transition({
      targetRepresentationId: 'rep_1',
      previousState: prev,
      context,
      trigger: EpistemicTransitionTrigger.EVIDENCE_OBSERVED,
      evidences: [{
        evidence: {
          evidenceId: 'ev_7',
          sourceId: "src_1", timestamp: new Date().toISOString(), content: 'total contradiction',
          provenance: { sourceId: 'src_1', timestamp: new Date().toISOString() },
          context
        },
        polarity: 'CONTRADICTS',
        weight: 1.0
      }]
    } as any);

    expect(result.nextState.status).toBe(EpistemicStatus.CONTRADICTED);
  });
});
