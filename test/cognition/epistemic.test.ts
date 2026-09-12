import { describe, it, expect } from 'vitest';
import { SubjectiveOpinionSchema, EpistemicStatus } from '../../src/redqueen/cognition/epistemic/types';

describe('Subjective Logic Types', () => {
  it('TEST 1: Valid SubjectiveOpinion accepted', () => {
    const valid = { belief: 0.5, disbelief: 0.2, uncertainty: 0.3, baseRate: 0.5 };
    const result = SubjectiveOpinionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('TEST 2: Invalid belief/disbelief/uncertainty rejected (sum != 1)', () => {
    const invalid = { belief: 0.5, disbelief: 0.5, uncertainty: 0.5, baseRate: 0.5 };
    const result = SubjectiveOpinionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('TEST 3 & 4: Opinion normalization invariant & Floating point tolerance handled correctly', () => {
    // 0.1 + 0.2 in JS is 0.30000000000000004
    // 1 - 0.30000000000000004 = 0.6999999999999999
    // sum = 1.0 within epsilon
    const validFloatingPoint = {
      belief: 0.1,
      disbelief: 0.2,
      uncertainty: 0.7,
      baseRate: 0.5
    };
    const result = SubjectiveOpinionSchema.safeParse(validFloatingPoint);
    expect(result.success).toBe(true);

    const slightlyOff = {
      belief: 0.1,
      disbelief: 0.2,
      uncertainty: 0.700001,
      baseRate: 0.5
    };
    const resultOff = SubjectiveOpinionSchema.safeParse(slightlyOff);
    expect(resultOff.success).toBe(false); // Epsilon is 1e-6, 1e-6 difference might fail or pass, let's test strict rejection.
  });
});
