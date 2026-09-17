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

  it('evidence dengan observationId dan tanpa observationId tidak otomatis mendapatkan reliability berbeda', () => {
    const evWithObs: Evidence = {
      evidenceId: 'ev_obs',
      sourceId: 'src1',
      observationId: 'obs-123',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
      },
      context: baseContext,
      confidence: 0.85
    };

    const evWithoutObs: Evidence = {
      evidenceId: 'ev_no_obs',
      sourceId: 'src1',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
      },
      context: baseContext,
      confidence: 0.85
    };

    const weightWithObs = calculateEffectiveEvidenceWeight(evWithObs);
    const weightWithoutObs = calculateEffectiveEvidenceWeight(evWithoutObs);

    expect(weightWithObs).toBeCloseTo(0.85);
    expect(weightWithoutObs).toBeCloseTo(0.85);
    expect(weightWithObs).toEqual(weightWithoutObs);
  });

  it('confidence tetap memengaruhi effective weight secara proporsional', () => {
    const evHigh: Evidence = {
      evidenceId: 'ev_high',
      sourceId: 'src1',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
      },
      context: baseContext,
      confidence: 0.9
    };

    const evLow: Evidence = {
      evidenceId: 'ev_low_conf',
      sourceId: 'src1',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
      },
      context: baseContext,
      confidence: 0.3
    };

    const weightHigh = calculateEffectiveEvidenceWeight(evHigh);
    const weightLow = calculateEffectiveEvidenceWeight(evLow);

    expect(weightHigh).toBeCloseTo(0.9);
    expect(weightLow).toBeCloseTo(0.3);
    expect(weightHigh).toBeGreaterThan(weightLow);
  });

  it('derived evidence tetap mendapatkan dependency discount', () => {
    const evIndependent: Evidence = {
      evidenceId: 'ev_indep',
      sourceId: 'src1',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
      },
      context: baseContext,
      confidence: 0.9
    };

    const evDerived: Evidence = {
      evidenceId: 'ev_derived_disc',
      sourceId: 'src1',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
        derivedFrom: ['other_ev_id']
      },
      context: baseContext,
      confidence: 0.9
    };

    const weightIndep = calculateEffectiveEvidenceWeight(evIndependent);
    const weightDerived = calculateEffectiveEvidenceWeight(evDerived);

    expect(weightIndep).toBeCloseTo(0.9);
    expect(weightDerived).toBeCloseTo(0.9 * 0.8);
    expect(weightDerived).toBeLessThan(weightIndep);
  });

  it('menggunakan reliability eksplisit jika tersedia pada evidence', () => {
    const evExplicit = {
      evidenceId: 'ev_explicit',
      sourceId: 'src1',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
      },
      context: baseContext,
      confidence: 0.8,
      reliability: 0.5
    } as unknown as Evidence;

    const weight = calculateEffectiveEvidenceWeight(evExplicit);
    expect(weight).toBeCloseTo(0.8 * 0.5);
  });

  it('hasil selalu berada pada [0, 1]', () => {
    const evHigh: Evidence = {
      evidenceId: 'ev4',
      sourceId: 'src1',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
      },
      context: baseContext,
      confidence: 2.5
    };

    const evLow: Evidence = {
      evidenceId: 'ev5',
      sourceId: 'src1',
      timestamp: new Date().toISOString(),
      provenance: {
        sourceId: 'src1',
        timestamp: new Date().toISOString(),
        derivedFrom: ['a', 'b', 'c']
      },
      context: baseContext,
      confidence: -0.5
    };

    expect(calculateEffectiveEvidenceWeight(evHigh)).toBeLessThanOrEqual(1.0);
    expect(calculateEffectiveEvidenceWeight(evHigh)).toBe(1.0);
    expect(calculateEffectiveEvidenceWeight(evLow)).toBeGreaterThanOrEqual(0.0);
    expect(calculateEffectiveEvidenceWeight(evLow)).toBe(0.0);
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

    const chain = reasoningEngine.reason({
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

    // Also verify conclusion.counterEvidence reflects calculated dynamic weight
    const conclusionCounter = chain.conclusion.counterEvidence.find(c => c.evidenceId === 'ev_counter');
    expect(conclusionCounter).toBeDefined();
    expect(conclusionCounter?.weight).not.toBe(1.0);
    expect(conclusionCounter?.weight).toBeCloseTo(0.4);

    fuseSpy.mockRestore();
  });
});
