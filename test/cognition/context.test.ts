import { describe, it, expect } from 'vitest';
import { createFormalContext, areContextsEqual } from '../../src/redqueen/cognition/context/types';

describe('Formal Context', () => {
  it('TEST 5: Context creation deterministic', () => {
    const ctx1 = createFormalContext({
      domain: 'network',
      scope: 'local',
      assumptions: ['A', 'B'],
      qualifiers: { key: 'value', alpha: 'beta' }
    });

    const ctx2 = createFormalContext({
      domain: 'network',
      scope: 'local',
      assumptions: ['B', 'A'], // unordered assumptions
      qualifiers: { alpha: 'beta', key: 'value' } // unordered qualifiers
    });

    expect(ctx1.id).toBe(ctx2.id);
  });

  it('TEST 6: Different contexts remain different (CASE B)', () => {
    const ctx1 = createFormalContext({ domain: 'network', scope: 'port' });
    const ctx2 = createFormalContext({ domain: 'shipping', scope: 'port' });

    expect(ctx1.id).not.toBe(ctx2.id);
    expect(areContextsEqual(ctx1, ctx2)).toBe(false);
  });

  it('TEST 7: Same canonical context produces same ID', () => {
    const ctx1 = createFormalContext({ domain: 'math', scope: 'geometry' });
    const ctx2 = createFormalContext({ domain: 'math', scope: 'geometry' });

    expect(areContextsEqual(ctx1, ctx2)).toBe(true);
  });
});
