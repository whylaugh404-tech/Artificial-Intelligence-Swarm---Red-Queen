import { describe, it, expect } from 'vitest';
import { calculateEffectiveEvidenceWeight } from '../src/redqueen/cognition/epistemic/fusion';
import { Evidence } from '../src/redqueen/cognition/evidence/types';
import { Context } from '../src/redqueen/cognition/epistemic/types';

describe('calculateEffectiveEvidenceWeight', () => {
  const baseContext: Context = {
    contextId: 'ctx-1',
    domain: 'test'
  };

  it('evidence kuat + reliable menghasilkan weight lebih tinggi', () => {
    const ev: Evidence = {
      evidenceId: 'ev1',
      sourceId: 'src1',
      observationId: 'obs1', // reliable
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
      },
      context: baseContext,
      confidence: 0.9 // kuat
    };

    const weight = calculateEffectiveEvidenceWeight(ev);
    expect(weight).toBeCloseTo(0.9);
  });

  it('evidence lemah menghasilkan weight lebih rendah', () => {
    const ev: Evidence = {
      evidenceId: 'ev2',
      sourceId: 'src1',
      observationId: 'obs1',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
      },
      context: baseContext,
      confidence: 0.3 // lemah
    };

    const weight = calculateEffectiveEvidenceWeight(ev);
    expect(weight).toBeCloseTo(0.3);
  });

  it('evidence yang redundant/dependent mendapat discount', () => {
    const ev: Evidence = {
      evidenceId: 'ev3',
      sourceId: 'src1',
      observationId: 'obs1',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
        derivedFrom: ['other_ev_id'] // redundant/dependent
      },
      context: baseContext,
      confidence: 0.9
    };

    const weight = calculateEffectiveEvidenceWeight(ev);
    expect(weight).toBeCloseTo(0.9 * 0.8);
    expect(weight).toBeLessThan(0.9); // discount applied
  });

  it('hasil selalu 0..1', () => {
    const evHigh: Evidence = {
      evidenceId: 'ev4',
      sourceId: 'src1',
      observationId: 'obs1',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
      },
      context: baseContext,
      confidence: 2.5 // unusually high
    };

    const evLow: Evidence = {
      evidenceId: 'ev5',
      sourceId: 'src1',
      observationId: 'obs1',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
        derivedFrom: ['a', 'b', 'c']
      },
      context: baseContext,
      confidence: -0.5 // unusually low
    };

    expect(calculateEffectiveEvidenceWeight(evHigh)).toBeLessThanOrEqual(1.0);
    expect(calculateEffectiveEvidenceWeight(evLow)).toBeGreaterThanOrEqual(0.0);
  });
});
