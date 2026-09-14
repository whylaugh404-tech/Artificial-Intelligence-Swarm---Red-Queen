import { createHash } from 'crypto';
import { CognitiveGraph } from '../representation/graph';
import { CognitiveStateTransitionEngine } from '../epistemic/transition';
import { Evidence } from '../evidence/types';
import { EpistemicStatus } from '../epistemic/types';
import { RepresentationVerificationStatus } from '../representation/types';
import {
  CognitiveConflict,
  ConflictType,
  ConflictResolutionDecision,
  CognitiveConflictSchema,
  VerificationResult
} from './types';
import { deepFreeze } from '../../genome';

export class VerificationEngine {
  private defaultGraph: CognitiveGraph | undefined;
  private epistemicEngine: CognitiveStateTransitionEngine | undefined;
  private conflicts: Map<string, Readonly<CognitiveConflict>> = new Map();

  constructor() {}

  public setGraph(graph: CognitiveGraph) {
    this.defaultGraph = graph;
  }

  public setEpistemicEngine(engine: CognitiveStateTransitionEngine) {
    this.epistemicEngine = engine;
  }

  public getConflict(conflictId: string): Readonly<CognitiveConflict> | undefined {
    return this.conflicts.get(conflictId);
  }

  public detectAndResolveConflict(params: {
    type: ConflictType;
    claimAId: string;
    claimBId: string;
    description: string;
    graphOverride?: CognitiveGraph;
  }): Readonly<CognitiveConflict> {
    const graph = params.graphOverride || this.defaultGraph;
    if (!graph) throw new Error('No CognitiveGraph available for VerificationEngine');

    // Load representations
    const claimAConcept = graph.getConcept(params.claimAId);
    const claimARel = graph.getRelation(params.claimAId);
    const repA = claimAConcept || claimARel;

    const claimBConcept = graph.getConcept(params.claimBId);
    const claimBRel = graph.getRelation(params.claimBId);
    const repB = claimBConcept || claimBRel;

    if (!repA || !repB) {
      throw new Error('Both claims must exist in the CognitiveGraph to detect a conflict');
    }

    const claimAStatus = repA.verificationStatus === RepresentationVerificationStatus.VERIFIED ? EpistemicStatus.VERIFIED : EpistemicStatus.BELIEVED;
    const claimBStatus = repB.verificationStatus === RepresentationVerificationStatus.VERIFIED ? EpistemicStatus.VERIFIED : EpistemicStatus.BELIEVED;

    // Load Evidence
    const evidenceIdsA = repA.evidenceIds || [];
    const evidenceIdsB = repB.evidenceIds || [];

    let scoreA = 0;
    let scoreB = 0;

    for (const evId of evidenceIdsA) {
      const ev = graph.getEvidence(evId);
      if (ev) scoreA += ev.confidence !== undefined ? ev.confidence : 0.8;
    }

    for (const evId of evidenceIdsB) {
      const ev = graph.getEvidence(evId);
      if (ev) scoreB += ev.confidence !== undefined ? ev.confidence : 0.8;
    }

    let decision = ConflictResolutionDecision.UNRESOLVED;
    let resolutionReason: string | undefined;

    // Logic to resolve
    if (scoreA > scoreB + 1.0) {
      decision = ConflictResolutionDecision.REJECT_CLAIM_B;
      resolutionReason = `Claim A has significantly stronger evidence support (${scoreA.toFixed(2)} vs ${scoreB.toFixed(2)})`;
    } else if (scoreB > scoreA + 1.0) {
      decision = ConflictResolutionDecision.REJECT_CLAIM_A;
      resolutionReason = `Claim B has significantly stronger evidence support (${scoreB.toFixed(2)} vs ${scoreA.toFixed(2)})`;
    } else if (scoreA > 0 && scoreA === scoreB) {
      // Very specific heuristic: if identical strong score but mutually exclusive? Unresolved.
      decision = ConflictResolutionDecision.UNRESOLVED;
      resolutionReason = `Evidence strength is balanced (${scoreA.toFixed(2)} vs ${scoreB.toFixed(2)}), requires more investigation`;
    } else {
      decision = ConflictResolutionDecision.UNRESOLVED;
      resolutionReason = `Insufficient or balanced evidence to make a definitive resolution`;
    }

    const timestamp = new Date().toISOString();
    const sig = `${params.type}:${params.claimAId}:${params.claimBId}:${timestamp}`;
    const conflictId = `cf_${createHash('sha256').update(sig).digest('hex').substring(0, 12)}`;

    const conflict: CognitiveConflict = {
      conflictId,
      type: params.type,
      claimAId: params.claimAId,
      claimBId: params.claimBId,
      claimAEvidenceIds: evidenceIdsA,
      claimBEvidenceIds: evidenceIdsB,
      claimAStatus,
      claimBStatus,
      description: params.description,
      detectedAt: timestamp,
      resolvedAt: decision !== ConflictResolutionDecision.UNRESOLVED ? timestamp : undefined,
      resolutionDecision: decision,
      resolutionReason
    };

    const validated = CognitiveConflictSchema.parse(conflict);
    const frozen = deepFreeze(validated);

    this.conflicts.set(frozen.conflictId, frozen);

    // Return frozen conflict. Calling code will handle transition.
    return frozen;
  }
}
