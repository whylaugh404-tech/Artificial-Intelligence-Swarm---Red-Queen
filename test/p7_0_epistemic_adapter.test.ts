import { expect, test, describe } from 'vitest';
import { EpistemicAdapter } from '../src/redqueen/cognition/epistemic/adapter';
import { EPSILON, SubjectiveOpinionSchema, EpistemicStatus } from '../src/redqueen/cognition/epistemic/types';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';

describe('P7.0 Epistemic Adapter Regression Suite (Step 1B)', () => {
  const dummyContext = { contextId: 'ctx-test', domain: 'osint_domain' };
  const validOpinion = { belief: 0.7, disbelief: 0.1, uncertainty: 0.2, baseRate: 0.5 };

  // TEST 1: PENDING menghasilkan HYPOTHESIS
  test('TEST 1: PENDING verification status produces HYPOTHESIS', () => {
    expect(EpistemicAdapter.evaluateStatus(RepresentationVerificationStatus.PENDING)).toBe(EpistemicStatus.HYPOTHESIS);

    const state = EpistemicAdapter.createWithOpinion(validOpinion, RepresentationVerificationStatus.PENDING, dummyContext);
    expect(state.status).toBe(EpistemicStatus.HYPOTHESIS);
  });

  // TEST 2: SUPPORTED menghasilkan BELIEVED, BUKAN KNOWN
  test('TEST 2: SUPPORTED produces BELIEVED, NOT KNOWN', () => {
    const status = EpistemicAdapter.evaluateStatus(RepresentationVerificationStatus.SUPPORTED);
    expect(status).toBe(EpistemicStatus.BELIEVED);
    expect(status).not.toBe(EpistemicStatus.KNOWN);

    const state = EpistemicAdapter.createWithOpinion(validOpinion, RepresentationVerificationStatus.SUPPORTED, dummyContext);
    expect(state.status).toBe(EpistemicStatus.BELIEVED);
    expect(state.status).not.toBe(EpistemicStatus.KNOWN);
  });

  // TEST 3: VERIFIED menghasilkan VERIFIED
  test('TEST 3: VERIFIED verification status produces VERIFIED', () => {
    expect(EpistemicAdapter.evaluateStatus(RepresentationVerificationStatus.VERIFIED)).toBe(EpistemicStatus.VERIFIED);

    const state = EpistemicAdapter.createWithOpinion(validOpinion, RepresentationVerificationStatus.VERIFIED, dummyContext);
    expect(state.status).toBe(EpistemicStatus.VERIFIED);
  });

  // TEST 4: UNKNOWN menghasilkan UNKNOWN
  test('TEST 4: UNKNOWN or unsupported verification state produces UNKNOWN', () => {
    expect(EpistemicAdapter.evaluateStatus('UNKNOWN')).toBe(EpistemicStatus.UNKNOWN);
    expect(EpistemicAdapter.evaluateStatus(undefined)).toBe(EpistemicStatus.UNKNOWN);
    expect(EpistemicAdapter.evaluateStatus('UNSUPPORTED_STATUS')).toBe(EpistemicStatus.UNKNOWN);
  });

  // TEST 5: Negative/rejected/contradicted verification status menghasilkan CONTRADICTED
  test('TEST 5: Negative verification states (CONTRADICTED, REJECTED) produce CONTRADICTED', () => {
    expect(EpistemicAdapter.evaluateStatus(RepresentationVerificationStatus.CONTRADICTED)).toBe(EpistemicStatus.CONTRADICTED);
    expect(EpistemicAdapter.evaluateStatus(RepresentationVerificationStatus.REJECTED)).toBe(EpistemicStatus.CONTRADICTED);

    const stateContradicted = EpistemicAdapter.createWithOpinion(validOpinion, RepresentationVerificationStatus.CONTRADICTED, dummyContext);
    expect(stateContradicted.status).toBe(EpistemicStatus.CONTRADICTED);

    const stateRejected = EpistemicAdapter.createWithOpinion(validOpinion, RepresentationVerificationStatus.REJECTED, dummyContext);
    expect(stateRejected.status).toBe(EpistemicStatus.CONTRADICTED);
  });

  // TEST 6: High confidence without opinion does not fabricate SubjectiveOpinion
  test('TEST 6: High scalar confidence without opinion preserves rawConfidence and does not fabricate SubjectiveOpinion', () => {
    const state = EpistemicAdapter.fromP5(0.99, RepresentationVerificationStatus.PENDING, dummyContext);
    expect(state.opinion).toBeUndefined();
    expect(state.rawConfidence).toBe(0.99);
    expect(state.status).toBe(EpistemicStatus.UNKNOWN);
  });

  // TEST 7: Valid SubjectiveOpinion is preserved
  test('TEST 7: Valid SubjectiveOpinion is strictly preserved in EpistemicState', () => {
    const state = EpistemicAdapter.createWithOpinion(validOpinion, RepresentationVerificationStatus.VERIFIED, dummyContext);
    expect(state.opinion).toEqual(validOpinion);
    expect(state.opinion?.belief).toBe(0.7);
    expect(state.opinion?.disbelief).toBe(0.1);
    expect(state.opinion?.uncertainty).toBe(0.2);
    expect(state.opinion?.baseRate).toBe(0.5);
  });

  // TEST 8: Opinion with belief + disbelief + uncertainty not summing to 1 within EPSILON is rejected
  test('TEST 8: SubjectiveOpinion sum outside EPSILON is rejected, accepted within EPSILON', () => {
    // Valid sum
    expect(SubjectiveOpinionSchema.safeParse({ belief: 0.5, disbelief: 0.3, uncertainty: 0.2, baseRate: 0.5 }).success).toBe(true);

    // Sum slightly off but within EPSILON (1e-6)
    const withinEpsilon = { belief: 0.5, disbelief: 0.3, uncertainty: 0.2 + (EPSILON / 2), baseRate: 0.5 };
    expect(SubjectiveOpinionSchema.safeParse(withinEpsilon).success).toBe(true);

    // Sum outside EPSILON
    const outsideEpsilon = { belief: 0.5, disbelief: 0.3, uncertainty: 0.2 + (EPSILON * 2), baseRate: 0.5 };
    expect(SubjectiveOpinionSchema.safeParse(outsideEpsilon).success).toBe(false);

    // Completely broken sum
    expect(SubjectiveOpinionSchema.safeParse({ belief: 0.9, disbelief: 0.9, uncertainty: 0.9, baseRate: 0.5 }).success).toBe(false);
  });

  // TEST 9: Context remains immutable after state creation
  test('TEST 9: Context remains immutable after EpistemicState creation', () => {
    const ctx = { contextId: 'ctx-imm-9', domain: 'network' };
    const state = EpistemicAdapter.fromP5(0.5, RepresentationVerificationStatus.SUPPORTED, ctx);

    expect(() => {
      (state.context as any).domain = 'mutated';
    }).toThrowError();
    expect(state.context.domain).toBe('network');
  });

  // TEST 10: Nested temporalBounds is also immutable
  test('TEST 10: Nested temporalBounds is deeply immutable', () => {
    const ctx = {
      contextId: 'ctx-imm-10',
      domain: 'intel',
      temporalBounds: { start: 1000, end: 2000 }
    };
    const state = EpistemicAdapter.fromP5(0.5, RepresentationVerificationStatus.SUPPORTED, ctx);

    expect(() => {
      (state.context.temporalBounds as any).start = 9999;
    }).toThrowError();
    expect(() => {
      (state.context.temporalBounds as any).end = 8888;
    }).toThrowError();
    expect(state.context.temporalBounds?.start).toBe(1000);
    expect(state.context.temporalBounds?.end).toBe(2000);
  });

  // TEST 11: Persistence -> reload preserves all fields
  test('TEST 11: Persistence -> reload maintains status, verificationStatus, context, opinion, rawConfidence', () => {
    const stateOriginal = EpistemicAdapter.createWithOpinion(
      validOpinion,
      RepresentationVerificationStatus.SUPPORTED,
      { contextId: 'ctx-p11', domain: 'persisted_domain', temporalBounds: { start: 123 } }
    );
    (stateOriginal as any).rawConfidence = 0.85;

    const serialized = EpistemicAdapter.persist(stateOriginal);
    const reloaded = EpistemicAdapter.reload(serialized);

    expect(reloaded).not.toBeNull();
    expect(reloaded?.status).toBe(EpistemicStatus.BELIEVED);
    expect(reloaded?.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
    expect(reloaded?.context.contextId).toBe('ctx-p11');
    expect(reloaded?.context.domain).toBe('persisted_domain');
    expect(reloaded?.context.temporalBounds?.start).toBe(123);
    expect(reloaded?.opinion).toEqual(validOpinion);
    expect(reloaded?.rawConfidence).toBe(0.85);

    // Deep immutability holds after reload
    expect(() => {
      (reloaded!.context as any).domain = 'modified';
    }).toThrowError();
    expect(() => {
      (reloaded!.context.temporalBounds as any).start = 999;
    }).toThrowError();
  });

  // TEST 12: Malformed persisted epistemic state is safely rejected
  test('TEST 12: Malformed persisted epistemic state is safely rejected', () => {
    // Malformed JSON string
    expect(EpistemicAdapter.reload('NOT_JSON')).toBeNull();

    // Incomplete payload
    expect(EpistemicAdapter.reload(JSON.stringify({ status: 'UNKNOWN' }))).toBeNull();

    // Invalid status string
    expect(EpistemicAdapter.reload(JSON.stringify({
      stateId: 'id-1',
      status: 'INVALID_STATUS',
      verificationStatus: 'PENDING',
      context: { contextId: 'c', domain: 'd' }
    }))).toBeNull();

    // Invalid opinion inside payload
    expect(EpistemicAdapter.reload(JSON.stringify({
      stateId: 'id-2',
      status: 'HYPOTHESIS',
      verificationStatus: 'PENDING',
      context: { contextId: 'c', domain: 'd' },
      opinion: { belief: 0.9, disbelief: 0.9, uncertainty: 0.9, baseRate: 0.5 }
    }))).toBeNull();
  });
});
