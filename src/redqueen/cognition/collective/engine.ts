import { Cell } from '../../core/cell';
import { CognitiveRelationPredicate, RepresentationVerificationStatus } from '../representation/types';
import { ConflictType, ConflictResolutionDecision } from '../verification/types';
import { Context, EpistemicTransitionTrigger } from '../epistemic/types';
import { CognitiveUnderstanding } from '../understanding/types';
import { deepFreeze } from '../../genome/genome';
import { logger } from '../../core/logger';
import * as crypto from 'crypto';

export interface PeerSelectionCriteria {
  requiredCapabilities?: string[];
  targetCategory?: string;
  targetDomain?: string;
  minKnowledgeOverlap?: string[];
}

export interface CellContribution {
  cellId: string;
  concepts: string[];
  relations: string[];
  evidences: string[];
  abstractions: string[];
  generalizations: string[];
  analogies: string[];
}

export interface CollectiveSynthesisOptions {
  criteria?: PeerSelectionCriteria;
  context?: Context;
  summary?: string;
}

export interface CollectiveSynthesisResult {
  collectiveId: string;
  syncedConcepts: number;
  syncedRelations: number;
  syncedEvidences: number;
  syncedAbstractions: number;
  syncedGeneralizations: number;
  syncedAnalogies: number;
  conflictsDetected: number;
  conflictsResolved: number;
  provenanceCells: string[];
  contributions: Record<string, CellContribution>;
  collectiveUnderstanding?: CognitiveUnderstanding;
  failedPeers: string[];
  timestamp: string;
}

export class CollectiveCognitionEngine {
  private readonly component = 'collective_cognition';

  constructor(private localCell: Cell) {}

  /**
   * Relevance-based peer selection to avoid unneeded broadcasting.
   */
  public selectRelevantPeers(peers: Cell[], criteria?: PeerSelectionCriteria): Cell[] {
    if (!peers || peers.length === 0) return [];

    return peers.filter(peer => {
      // Must not be self
      if (peer.nodeId === this.localCell.nodeId) return false;

      if (!criteria) return true;

      // Capability check
      if (criteria.requiredCapabilities && criteria.requiredCapabilities.length > 0) {
        const peerCaps = peer.genome?.capabilities || [];
        const hasCaps = criteria.requiredCapabilities.every(cap => peerCaps.includes(cap as any));
        if (!hasCaps) return false;
      }

      // Category check
      if (criteria.targetCategory) {
        try {
          const peerConcepts = peer.cognitiveGraph.getAllConcepts();
          const hasCategory = peerConcepts.some(c => c.category === criteria.targetCategory);
          if (!hasCategory) return false;
        } catch {
          return false;
        }
      }

      // Knowledge overlap check
      if (criteria.minKnowledgeOverlap && criteria.minKnowledgeOverlap.length > 0) {
        try {
          const peerConcepts = peer.cognitiveGraph.getAllConcepts();
          const peerConceptIds = new Set(peerConcepts.map(c => c.conceptId));
          const hasOverlap = criteria.minKnowledgeOverlap.some(id => peerConceptIds.has(id));
          if (!hasOverlap) return false;
        } catch {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Synthesizes collective cognition across selected peers via semantic composition.
   */
  public async synthesizeWithPeers(
    peers: Cell[],
    options?: CollectiveSynthesisOptions
  ): Promise<CollectiveSynthesisResult> {
    const selectedPeers = this.selectRelevantPeers(peers, options?.criteria);
    const contributions: Record<string, CellContribution> = {};
    const failedPeers: string[] = [];

    let syncedConcepts = 0;
    let syncedRelations = 0;
    let syncedEvidences = 0;
    let syncedAbstractions = 0;
    let syncedGeneralizations = 0;
    let syncedAnalogies = 0;
    let conflictsDetected = 0;
    let conflictsResolved = 0;

    const allInvolvedConceptIds = new Set<string>();
    const allInvolvedRelationIds = new Set<string>();
    const allInvolvedEvidenceIds = new Set<string>();

    const synthesisContext: Context = options?.context || {
      contextId: `ctx_collective_${Date.now()}`,
      domain: 'COLLECTIVE_SYNTHESIS'
    };

    for (const peer of selectedPeers) {
      const contribution: CellContribution = {
        cellId: peer.nodeId,
        concepts: [],
        relations: [],
        evidences: [],
        abstractions: [],
        generalizations: [],
        analogies: []
      };

      try {
        const peerGraph = peer.cognitiveGraph;
        if (!peerGraph) {
          throw new Error(`Peer ${peer.nodeId} cognitiveGraph unavailable`);
        }

        // 1. Evidence Synthesis
        for (const ev of peerGraph.getAllEvidences()) {
          const localEv = this.localCell.cognitiveGraph.getEvidence(ev.evidenceId);
          if (!localEv) {
            const clone = { ...ev };
            if (!clone.provenance) {
              clone.provenance = {
                sourceId: peer.nodeId,
                timestamp: new Date().toISOString()
              };
            }
            await this.localCell.cognitiveGraph.insertEvidence(clone);
            syncedEvidences++;
            contribution.evidences.push(ev.evidenceId);
            allInvolvedEvidenceIds.add(ev.evidenceId);
          } else {
            allInvolvedEvidenceIds.add(ev.evidenceId);
          }
        }

        // 2. Concept Composition
        for (const concept of peerGraph.getAllConcepts()) {
          const localConcept = this.localCell.cognitiveGraph.getConcept(concept.conceptId);
          if (!localConcept) {
            const inserted = await this.localCell.cognitiveGraph.insertConcept({
              ...concept,
              provenance: Array.from(new Set([...concept.provenance, peer.nodeId]))
            });
            syncedConcepts++;
            contribution.concepts.push(inserted.conceptId);
            allInvolvedConceptIds.add(inserted.conceptId);
          } else {
            // Merge provenance into local concept
            const mergedProvenance = Array.from(new Set([...localConcept.provenance, peer.nodeId]));
            if (mergedProvenance.length > localConcept.provenance.length) {
              await this.localCell.cognitiveGraph.updateConcept({
                ...localConcept,
                provenance: mergedProvenance,
                version: localConcept.version + 1,
                updatedAt: new Date().toISOString()
              });
            }
            contribution.concepts.push(localConcept.conceptId);
            allInvolvedConceptIds.add(localConcept.conceptId);
          }
        }

        // 3. Relations & Verification/Conflict Resolution
        for (const rel of peerGraph.getAllRelations()) {
          const localRel = this.localCell.cognitiveGraph.getRelation(rel.relationId);
          if (!localRel) {
            const conflictingLocal = this.localCell.cognitiveGraph.getAllRelations().find(
              lr =>
                lr.subjectConceptId === rel.subjectConceptId &&
                lr.objectConceptId === rel.objectConceptId &&
                lr.predicate !== rel.predicate &&
                lr.predicate !== CognitiveRelationPredicate.RELATED_TO &&
                rel.predicate !== CognitiveRelationPredicate.RELATED_TO
            );

            const clonedRel = {
              ...rel,
              provenance: Array.from(new Set([...rel.provenance, peer.nodeId]))
            };
            const insertedRel = await this.localCell.cognitiveGraph.insertRelation(clonedRel);
            syncedRelations++;
            contribution.relations.push(insertedRel.relationId);
            allInvolvedRelationIds.add(insertedRel.relationId);
            allInvolvedConceptIds.add(rel.subjectConceptId);
            allInvolvedConceptIds.add(rel.objectConceptId);

            if (conflictingLocal) {
              conflictsDetected++;
              allInvolvedRelationIds.add(conflictingLocal.relationId);

              // Process conflict through existing Verification Engine
              const conflict = this.localCell.verification.detectAndResolveConflict({
                type: ConflictType.DIRECT_CONTRADICTION,
                claimAId: conflictingLocal.relationId,
                claimBId: clonedRel.relationId,
                description: `Collective peer divergence between local ${conflictingLocal.predicate} and peer ${clonedRel.predicate}`
              });

              if (conflict.resolutionDecision === ConflictResolutionDecision.REJECT_CLAIM_B) {
                conflictsResolved++;
                // Demote peer's relation claim
                await this.localCell.cognitiveGraph.transitionRepresentationState(
                  clonedRel.relationId,
                  [],
                  synthesisContext,
                  {
                    trigger: EpistemicTransitionTrigger.CONTRADICTION_DETECTED,
                    explicitVerification: {
                      status: RepresentationVerificationStatus.CONTRADICTED,
                      verifiedBy: this.localCell.nodeId,
                      proof: conflict.resolutionReason
                    },
                    reason: `Demoted peer relation by verification: ${conflict.resolutionReason}`
                  }
                );
              } else if (conflict.resolutionDecision === ConflictResolutionDecision.REJECT_CLAIM_A) {
                conflictsResolved++;
                // Demote local relation claim
                await this.localCell.cognitiveGraph.transitionRepresentationState(
                  conflictingLocal.relationId,
                  [],
                  synthesisContext,
                  {
                    trigger: EpistemicTransitionTrigger.CONTRADICTION_DETECTED,
                    explicitVerification: {
                      status: RepresentationVerificationStatus.CONTRADICTED,
                      verifiedBy: this.localCell.nodeId,
                      proof: conflict.resolutionReason
                    },
                    reason: `Demoted local relation by verification: ${conflict.resolutionReason}`
                  }
                );
              } else {
                // Preserved non-destructively
                await this.localCell.cognitiveGraph.preserveConflict(
                  conflictingLocal.subjectConceptId,
                  conflictingLocal.objectConceptId,
                  `Preserved peer divergence via verification: ${conflict.resolutionDecision}`
                );
              }
            }
          } else {
            contribution.relations.push(localRel.relationId);
            allInvolvedRelationIds.add(localRel.relationId);
          }
        }

        // 4. Abstractions
        for (const abs of peerGraph.getAllAbstractions()) {
          if (!this.localCell.cognitiveGraph.getAllAbstractions().find(a => a.abstractionId === abs.abstractionId)) {
            await this.localCell.cognitiveGraph.insertAbstraction({
              ...abs,
              provenance: Array.from(new Set([...abs.provenance, peer.nodeId]))
            });
            syncedAbstractions++;
            contribution.abstractions.push(abs.abstractionId);
          }
        }

        // 5. Generalizations
        for (const gen of peerGraph.getAllGeneralizations()) {
          if (!this.localCell.cognitiveGraph.getAllGeneralizations().find(a => a.generalizationId === gen.generalizationId)) {
            await this.localCell.cognitiveGraph.insertGeneralization({
              ...gen,
              provenance: Array.from(new Set([...gen.provenance, peer.nodeId]))
            });
            syncedGeneralizations++;
            contribution.generalizations.push(gen.generalizationId);
          }
        }

        // 6. Analogies
        for (const ana of peerGraph.getAllAnalogies()) {
          if (!this.localCell.cognitiveGraph.getAllAnalogies().find(a => a.analogyId === ana.analogyId)) {
            await this.localCell.cognitiveGraph.insertAnalogy({
              ...ana,
              provenance: Array.from(new Set([...ana.provenance, peer.nodeId]))
            });
            syncedAnalogies++;
            contribution.analogies.push(ana.analogyId);
          }
        }

        contributions[peer.nodeId] = contribution;
      } catch (peerErr) {
        logger.warn(this.component, 'peer_synthesis_failed_safely_ignored', {
          peerId: peer.nodeId,
          error: peerErr
        });
        failedPeers.push(peer.nodeId);
      }
    }

    // Semantic Composition into a unified CognitiveUnderstanding
    const contributingConcepts = this.localCell.cognitiveGraph
      .getAllConcepts()
      .filter(c => allInvolvedConceptIds.has(c.conceptId));
    const contributingRelations = this.localCell.cognitiveGraph
      .getAllRelations()
      .filter(r => allInvolvedRelationIds.has(r.relationId));
    const contributingEvidences = this.localCell.cognitiveGraph
      .getAllEvidences()
      .filter(e => allInvolvedEvidenceIds.has(e.evidenceId));

    let collectiveUnderstanding: CognitiveUnderstanding | undefined;
    if (contributingConcepts.length > 0 || contributingRelations.length > 0) {
      collectiveUnderstanding = this.localCell.understanding.compose({
        summary: options?.summary || `Collective synthesis with peers: ${Object.keys(contributions).join(', ')}`,
        concepts: contributingConcepts,
        relations: contributingRelations,
        evidences: contributingEvidences,
        context: synthesisContext,
        originatingCellId: this.localCell.nodeId
      });
      await this.localCell.cognitiveGraph.insertUnderstanding(collectiveUnderstanding);
    }

    // Deterministic collective identity based on semantic inputs
    const semanticInputs = {
      participatingCells: Array.from(new Set([this.localCell.nodeId, ...Object.keys(contributions)])).sort(),
      conceptIds: Array.from(allInvolvedConceptIds).sort(),
      relationIds: Array.from(allInvolvedRelationIds).sort(),
      evidenceIds: Array.from(allInvolvedEvidenceIds).sort()
    };
    const collectiveId = `coll_${crypto
      .createHash('sha256')
      .update(JSON.stringify(semanticInputs))
      .digest('hex')
      .substring(0, 16)}`;

    const result: CollectiveSynthesisResult = {
      collectiveId,
      syncedConcepts,
      syncedRelations,
      syncedEvidences,
      syncedAbstractions,
      syncedGeneralizations,
      syncedAnalogies,
      conflictsDetected,
      conflictsResolved,
      provenanceCells: Array.from(new Set(selectedPeers.map(p => p.nodeId))),
      contributions,
      collectiveUnderstanding,
      failedPeers,
      timestamp: new Date().toISOString()
    };

    return deepFreeze(result);
  }
}
