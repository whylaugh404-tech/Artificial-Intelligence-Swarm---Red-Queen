import { describe, it, expect } from 'vitest';
import { 
  adaptP5ConfidenceToOpinion, 
  determineEpistemicStatus, 
  adaptConceptToEpistemicState 
} from '../../src/redqueen/cognition/epistemic/adapter';
import { RepresentationVerificationStatus, CognitiveConcept } from '../../src/redqueen/cognition/representation/types';
import { InformationCategory } from "../../src/redqueen/metabolism/types";
import { EpistemicStatus } from '../../src/redqueen/cognition/epistemic/types';
import { createFormalContext } from '../../src/redqueen/cognition/context/types';

describe('P7.0 Epistemic Adapter', () => {
  it('TEST 8: P5.1 representation can be adapted into P7.0 epistemic state', () => {
    const concept: CognitiveConcept = {
      conceptId: 'test_c1',
      canonicalName: 'Test Concept',
      description: 'Desc',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      sourceKnowledgeIds: ['k1'],
      sourceExperienceIds: [],
      originatingCellId: 'cell_1',
      confidence: 0.9,
      verificationStatus: RepresentationVerificationStatus.VERIFIED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      provenance: ['cell_1'],
      metadata: {}
    };

    const ctx = createFormalContext({ domain: 'test', scope: 'global' });
    const epistemicState = adaptConceptToEpistemicState(concept, ctx);

    expect(epistemicState.status).toBe(EpistemicStatus.KNOWN_VERIFIED);
    expect(epistemicState.opinion.belief).toBe(0.9);
    expect(epistemicState.opinion.uncertainty).toBeCloseTo(0.1, 5);
  });

  it('TEST 9: Legacy confidence does not destroy existing P5.1 behavior (conservative mapping)', () => {
    // CASE D: Legacy P5.1 confidence = 0.8, but status is PENDING
    const op = adaptP5ConfidenceToOpinion(0.8, RepresentationVerificationStatus.PENDING);
    expect(op.belief).toBe(0.5); // Capped at 0.5 because it's not supported/verified
    expect(op.uncertainty).toBe(0.5);
    
    const status = determineEpistemicStatus(op, RepresentationVerificationStatus.PENDING);
    expect(status).toBe(EpistemicStatus.HYPOTHESIS); // Not KNOWN or BELIEVED (needs belief > disbelief and low uncertainty)
  });

  it('TEST 10 & CASE E: Unknown evidence produces UNKNOWN rather than fabricated certainty', () => {
    const concept: CognitiveConcept = {
      conceptId: 'test_c2',
      canonicalName: 'Test Unknown Concept',
      description: 'Desc',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      sourceKnowledgeIds: [], // Empty!
      sourceExperienceIds: [],
      originatingCellId: 'cell_1',
      confidence: 1.0, // Fake high confidence
      verificationStatus: RepresentationVerificationStatus.VERIFIED, // Fake status
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      provenance: ['cell_1'],
      metadata: {}
    };

    const ctx = createFormalContext({ domain: 'test', scope: 'global' });
    const epistemicState = adaptConceptToEpistemicState(concept, ctx);

    // Because it lacks evidence refs, it should fallback to UNKNOWN
    expect(epistemicState.status).toBe(EpistemicStatus.UNKNOWN);
    expect(epistemicState.opinion.belief).toBe(0);
    expect(epistemicState.opinion.uncertainty).toBe(1);
  });
  
  it('CASE A: Same source submitted multiple times - EDG independence preservation', () => {
    // In current P7.0, adapter preserves provenance but does not fabricate opinion.
    // The test ensures provenanceRefs is maintained verbatim from P5.1 
    // without flattening into "multiple independent" claims yet (that's P7.3).
    const concept: CognitiveConcept = {
      conceptId: 'echo_chamber_1',
      canonicalName: 'Test Echo',
      description: 'Desc',
      category: InformationCategory.GENERAL_TECHNOLOGY,
      sourceKnowledgeIds: ['k1', 'k1', 'k1'], // Same source 3 times
      sourceExperienceIds: [],
      originatingCellId: 'cell_1',
      confidence: 0.9,
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      provenance: ['cell_1', 'cell_1', 'cell_1'],
      metadata: {}
    };

    const ctx = createFormalContext({ domain: 'test', scope: 'global' });
    const epistemicState = adaptConceptToEpistemicState(concept, ctx);

    // Must preserve identical provenance arrays without merging them incorrectly
    // or inflating the belief simply because there's 3 items.
    expect(epistemicState.provenanceRefs).toEqual(['cell_1', 'cell_1', 'cell_1']);
    // Belief is capped at 0.8 for SUPPORTED, it does not become 0.999 just because of length.
    expect(epistemicState.opinion.belief).toBe(0.8);
  });
});
