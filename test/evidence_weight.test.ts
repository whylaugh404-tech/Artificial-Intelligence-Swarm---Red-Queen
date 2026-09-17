import { describe, it, expect, vi } from 'vitest';
import { calculateEffectiveEvidenceWeight, EpistemicFusionEngine, AttributedEvidence } from '../src/redqueen/cognition/epistemic/fusion';
import { Evidence } from '../src/redqueen/cognition/evidence/types';
import { Context } from '../src/redqueen/cognition/epistemic/types';
import { ReasoningEngine } from '../src/redqueen/cognition/reasoning/engine';

function isAttributedEvidence(item: AttributedEvidence | Evidence): item is AttributedEvidence {
  return typeof item === 'object' && item !== null && 'evidence' in item && 'weight' in item;
}

describe('Evidence Weight & Reasoning Integration', () => {
  const baseContext: Context = {
    contextId: 'ctx-1',
    domain: 'test'
  };

  it('confidence 0.9 menghasilkan weight sekitar 0.9 jika tidak ada dependency discount', () => {
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

  it('confidence 0.3 menghasilkan weight sekitar 0.3', () => {
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

  it('derived evidence mendapat discount', () => {
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

  it('Reasoning tidak lagi selalu menggunakan weight 1.0', () => {
    const reasoningEngine = new ReasoningEngine();
    const fuseSpy = vi.spyOn(EpistemicFusionEngine.prototype, 'fuse');

    const evNormal: Evidence = {
      evidenceId: 'ev_normal',
      sourceId: 'src1',
      observationId: 'obs_normal',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
      },
      context: baseContext,
      confidence: 0.9
    };

    const evLow: Evidence = {
      evidenceId: 'ev_low',
      sourceId: 'src1',
      observationId: 'obs_low',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
      },
      context: baseContext,
      confidence: 0.3
    };

    const evDerived: Evidence = {
      evidenceId: 'ev_derived',
      sourceId: 'src1',
      observationId: 'obs_derived',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
        derivedFrom: ['parent_ev']
      },
      context: baseContext,
      confidence: 0.9
    };

    const evCounter: Evidence = {
      evidenceId: 'ev_counter',
      sourceId: 'src1',
      observationId: 'obs_counter',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString()
      },
      context: baseContext,
      confidence: 0.4
    };

    reasoningEngine.reason({
      goal: 'Test reasoning evidence weighting integration',
      context: baseContext,
      originatingCellId: 'cell-1',
      premises: [
        {
          statement: 'Observation premise with multiple evidences',
          confidence: 0.9,
          evidenceIds: ['ev_normal', 'ev_low', 'ev_derived']
        }
      ],
      evidences: [evNormal, evLow, evDerived, evCounter],
      counterEvidences: ['ev_counter']
    });

    expect(fuseSpy).toHaveBeenCalled();
    const lastCall = fuseSpy.mock.calls[fuseSpy.mock.calls.length - 1];
    const passedAttributedEvidences = lastCall[0].filter(isAttributedEvidence);

    const attrNormal = passedAttributedEvidences.find(a => a.evidence.evidenceId === 'ev_normal');
    const attrLow = passedAttributedEvidences.find(a => a.evidence.evidenceId === 'ev_low');
    const attrDerived = passedAttributedEvidences.find(a => a.evidence.evidenceId === 'ev_derived');
    const attrCounter = passedAttributedEvidences.find(a => a.evidence.evidenceId === 'ev_counter');

    expect(attrNormal).toBeDefined();
    expect(attrLow).toBeDefined();
    expect(attrDerived).toBeDefined();
    expect(attrCounter).toBeDefined();

    // Verify weights are not always 1.0, but use calculateEffectiveEvidenceWeight
    expect(attrNormal?.weight).not.toBe(1.0);
    expect(attrNormal?.weight).toBeCloseTo(0.9);

    expect(attrLow?.weight).not.toBe(1.0);
    expect(attrLow?.weight).toBeCloseTo(0.3);

    expect(attrDerived?.weight).not.toBe(1.0);
    expect(attrDerived?.weight).toBeCloseTo(0.72); // 0.9 * 0.8

    expect(attrCounter?.weight).not.toBe(1.0);
    expect(attrCounter?.weight).toBeCloseTo(0.4);

    fuseSpy.mockRestore();
  });
});
