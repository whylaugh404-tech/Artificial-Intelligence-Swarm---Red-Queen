import { expect, test, describe } from 'vitest';
import { EpistemicAdapter } from '../src/redqueen/cognition/epistemic/adapter';
import { EPSILON, SubjectiveOpinionSchema, EpistemicStatus } from '../src/redqueen/cognition/epistemic/types';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';

describe('P7.0 Epistemic Adapter', () => {
  
  describe('1. CONFIDENCE MAPPING', () => {
    test('Should not fabricate SubjectiveOpinion from P5.1 scalar confidence', () => {
      const context = { contextId: 'ctx-1', domain: 'test' };
      const state = EpistemicAdapter.fromP5(0.8, RepresentationVerificationStatus.PENDING, context);
      
      // Opinion should be undefined, not hallucinated
      expect(state.opinion).toBeUndefined();
      // Status should be UNKNOWN as requested when only scalar confidence exists
      expect(state.status).toBe(EpistemicStatus.UNKNOWN);
      // Raw confidence preserved
      expect(state.rawConfidence).toBe(0.8);
    });
  });

  describe('2. EPISTEMIC STATUS', () => {
    test('Should derive status from verification criteria, not opinion thresholds', () => {
      const context = { contextId: 'ctx-2', domain: 'test' };
      const opinion = { belief: 0.9, disbelief: 0.05, uncertainty: 0.05, baseRate: 0.5 };
      
      // Even with high belief (0.9), if verification is PENDING, status is HYPOTHESIS, not VERIFIED
      const statePending = EpistemicAdapter.createWithOpinion(opinion, RepresentationVerificationStatus.PENDING, context);
      expect(statePending.status).toBe(EpistemicStatus.HYPOTHESIS);

      // Status becomes VERIFIED only when verification criteria is VERIFIED
      const stateVerified = EpistemicAdapter.createWithOpinion(opinion, RepresentationVerificationStatus.VERIFIED, context);
      expect(stateVerified.status).toBe(EpistemicStatus.VERIFIED);
    });
  });

  describe('3. CONTEXT IMMUTABILITY', () => {
    test('Context should be deeply immutable', () => {
      const context = { contextId: 'ctx-3', domain: 'test', temporalBounds: { start: 100 } };
      const state = EpistemicAdapter.fromP5(0.5, RepresentationVerificationStatus.PENDING, context);
      
      // Attempt to mutate should fail in strict mode (TypeError) or silently fail.
      expect(() => {
        (state.context as any).domain = 'hacked';
      }).toThrowError();
      
      expect(() => {
        (state.context.temporalBounds as any).start = 999;
      }).toThrowError();
      
      expect(state.context.domain).toBe('test');
      expect(state.context.temporalBounds?.start).toBe(100);
    });
  });

  describe('4. PERSISTENCE TEST', () => {
    test('Should persist and reload valid epistemic state safely', () => {
      const context = { contextId: 'ctx-4', domain: 'test' };
      const original = EpistemicAdapter.createWithOpinion(
        { belief: 0.5, disbelief: 0.3, uncertainty: 0.2, baseRate: 0.5 },
        RepresentationVerificationStatus.SUPPORTED,
        context
      );
      
      const json = EpistemicAdapter.persist(original);
      const reloaded = EpistemicAdapter.reload(json);
      
      expect(reloaded).not.toBeNull();
      expect(reloaded?.stateId).toBe(original.stateId);
      expect(reloaded?.status).toBe(EpistemicStatus.KNOWN);
      
      // Context should be immutable after reload
      expect(() => {
        (reloaded!.context as any).domain = 'hacked';
      }).toThrowError();
    });

    test('Should safely reject malformed persisted state', () => {
      // Malformed JSON
      expect(EpistemicAdapter.reload('{ bad_json ')).toBeNull();
      
      // Missing required fields
      expect(EpistemicAdapter.reload(JSON.stringify({ status: 'UNKNOWN' }))).toBeNull();
      
      // Invalid opinion sum
      const badOpinionState = {
        stateId: 'bad',
        status: 'UNKNOWN',
        verificationStatus: 'PENDING',
        context: { contextId: 'c1', domain: 'd' },
        opinion: { belief: 0.8, disbelief: 0.8, uncertainty: 0.8, baseRate: 0.5 } // sum = 2.4
      };
      expect(EpistemicAdapter.reload(JSON.stringify(badOpinionState))).toBeNull();
    });
  });

  describe('5. FLOATING POINT TEST', () => {
    test('Should accept sum within EPSILON and reject outside EPSILON', () => {
      // Valid exact sum
      expect(SubjectiveOpinionSchema.safeParse({ belief: 0.5, disbelief: 0.2, uncertainty: 0.3, baseRate: 0.5 }).success).toBe(true);
      
      // Within EPSILON (1e-6)
      // e.g. sum = 1.0 + 1e-7
      const slightOver = { belief: 0.5, disbelief: 0.2, uncertainty: 0.3 + (EPSILON / 2), baseRate: 0.5 };
      expect(SubjectiveOpinionSchema.safeParse(slightOver).success).toBe(true);

      // Outside EPSILON
      // sum = 1.0 + 2e-6
      const outsideEpsilon = { belief: 0.5, disbelief: 0.2, uncertainty: 0.3 + (EPSILON * 2), baseRate: 0.5 };
      expect(SubjectiveOpinionSchema.safeParse(outsideEpsilon).success).toBe(false);
    });
  });
});
