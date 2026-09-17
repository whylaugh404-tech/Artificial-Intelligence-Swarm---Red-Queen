import { describe, it, expect } from 'vitest';
import { resolveEvidencePolarity } from '../src/redqueen/cognition/worldmodel/engine';
import { Evidence } from '../src/redqueen/cognition/evidence/types';
import { CognitiveConcept } from '../src/redqueen/cognition/representation/types';
import { EvidencePolarity } from '../src/redqueen/cognition/epistemic/fusion';

import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';

describe('resolveEvidencePolarity', () => {
  const target: CognitiveConcept = {
    conceptId: 'target-1',
    canonicalName: 'Target',
    description: 'Target concept',
    verificationStatus: RepresentationVerificationStatus.PENDING,
    attributes: {}
  } as unknown as CognitiveConcept;

  const baseEvidence: Evidence = {
    evidenceId: 'ev-1',
    sourceId: 'src-1',
    timestamp: new Date().toISOString(),
    provenance: {
      sourceId: 'src-1',
      timestamp: new Date().toISOString(),
    },
    context: {
      contextId: 'ctx-1',
      domain: 'test'
    }
  };

  it('supporting evidence → SUPPORTS', () => {
    const ev = {
      ...baseEvidence,
      provenance: {
        ...baseEvidence.provenance,
        supportingRepresentationIds: ['target-1']
      }
    };
    expect(resolveEvidencePolarity(ev, target)).toBe(EvidencePolarity.SUPPORTS);
  });

  it('contradicting evidence → CONTRADICTS', () => {
    const ev = {
      ...baseEvidence,
      provenance: {
        ...baseEvidence.provenance,
        contradictingRepresentationIds: ['target-1']
      }
    };
    expect(resolveEvidencePolarity(ev, target)).toBe(EvidencePolarity.CONTRADICTS);
  });

  it('unrelated/unknown evidence → UNKNOWN/NEUTRAL', () => {
    // Evidence with no relations
    expect(resolveEvidencePolarity(baseEvidence, target)).toBe(EvidencePolarity.NEUTRAL);

    // Evidence related to something else
    const evOther = {
      ...baseEvidence,
      provenance: {
        ...baseEvidence.provenance,
        supportingRepresentationIds: ['other-target'],
        contradictingRepresentationIds: ['other-target']
      }
    };
    expect(resolveEvidencePolarity(evOther, target)).toBe(EvidencePolarity.NEUTRAL);
  });
});
