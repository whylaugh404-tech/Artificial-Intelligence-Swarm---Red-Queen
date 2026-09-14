import { Cell } from '../../core/cell';
import { CognitiveRelationPredicate } from '../representation/types';
import { ConflictType, ConflictResolutionDecision } from '../verification/types';

export interface CollectiveSynthesisResult {
  syncedConcepts: number;
  syncedRelations: number;
  syncedEvidences: number;
  syncedAbstractions: number;
  syncedGeneralizations: number;
  syncedAnalogies: number;
  conflictsDetected: number;
  conflictsResolved: number;
  provenanceCells: string[];
}

export class CollectiveCognitionEngine {
  constructor(private localCell: Cell) {}

  public async synthesizeWithPeers(peers: Cell[]): Promise<CollectiveSynthesisResult> {
    const result: CollectiveSynthesisResult = {
      syncedConcepts: 0,
      syncedRelations: 0,
      syncedEvidences: 0,
      syncedAbstractions: 0,
      syncedGeneralizations: 0,
      syncedAnalogies: 0,
      conflictsDetected: 0,
      conflictsResolved: 0,
      provenanceCells: peers.map(p => p.nodeId)
    };

    for (const peer of peers) {
      const peerGraph = peer.cognitiveGraph;

      // 1. Evidence
      for (const ev of peerGraph.getAllEvidences()) {
        const localEv = this.localCell.cognitiveGraph.getEvidence(ev.evidenceId);
        if (!localEv) {
          const clone = { ...ev };
          if (!clone.provenance) clone.provenance = { sourceId: peer.nodeId };
          await this.localCell.cognitiveGraph.insertEvidence(clone);
          result.syncedEvidences++;
        }
      }

      // 2. Concepts
      for (const concept of peerGraph.getAllConcepts()) {
        const localConcept = this.localCell.cognitiveGraph.getConcept(concept.conceptId);
        if (!localConcept) {
          await this.localCell.cognitiveGraph.insertConcept({
              ...concept,
              provenance: Array.from(new Set([...concept.provenance, peer.nodeId]))
          });
          result.syncedConcepts++;
        }
      }

      // 3. Relations & Conflict Detection
      for (const rel of peerGraph.getAllRelations()) {
        const localRel = this.localCell.cognitiveGraph.getRelation(rel.relationId);
        if (!localRel) {
          // Compare check
          const conflictingLocal = this.localCell.cognitiveGraph.getAllRelations().find(
            lr => lr.subjectConceptId === rel.subjectConceptId && 
                  lr.objectConceptId === rel.objectConceptId && 
                  lr.predicate !== rel.predicate &&
                  lr.predicate !== CognitiveRelationPredicate.RELATED_TO &&
                  rel.predicate !== CognitiveRelationPredicate.RELATED_TO
          );

          const clonedRel = { ...rel, provenance: Array.from(new Set([...rel.provenance, peer.nodeId])) };
          await this.localCell.cognitiveGraph.insertRelation(clonedRel);
          result.syncedRelations++;

          if (conflictingLocal) {
            result.conflictsDetected++;
            
            const conflict = this.localCell.verification.detectAndResolveConflict({
              type: ConflictType.DIRECT_CONTRADICTION,
              claimAId: conflictingLocal.relationId,
              claimBId: clonedRel.relationId,
              description: `Collective peer divergence between local ${conflictingLocal.predicate} and peer ${clonedRel.predicate}`
            });

            if (conflict.resolutionDecision !== ConflictResolutionDecision.UNRESOLVED) {
              result.conflictsResolved++;
              // Record resolution in graph using preserveConflict to document why
              await this.localCell.cognitiveGraph.preserveConflict(
                conflictingLocal.subjectConceptId, 
                conflictingLocal.objectConceptId, 
                `Resolved peer divergence via verification: ${conflict.resolutionDecision}`
              );
            }
          }
        }
      }

      // 4. Abstractions
      for (const abs of peerGraph.getAllAbstractions()) {
          if (!this.localCell.cognitiveGraph.getAllAbstractions().find(a => a.abstractionId === abs.abstractionId)) {
             await this.localCell.cognitiveGraph.insertAbstraction({
                 ...abs,
                 provenance: Array.from(new Set([...abs.provenance, peer.nodeId]))
             });
             result.syncedAbstractions++;
          }
      }

      // 5. Generalizations
      for (const gen of peerGraph.getAllGeneralizations()) {
          if (!this.localCell.cognitiveGraph.getAllGeneralizations().find(a => a.generalizationId === gen.generalizationId)) {
             await this.localCell.cognitiveGraph.insertGeneralization({
                 ...gen,
                 provenance: Array.from(new Set([...gen.provenance, peer.nodeId]))
             });
             result.syncedGeneralizations++;
          }
      }

      // 6. Analogies
      for (const ana of peerGraph.getAllAnalogies()) {
          if (!this.localCell.cognitiveGraph.getAllAnalogies().find(a => a.analogyId === ana.analogyId)) {
             await this.localCell.cognitiveGraph.insertAnalogy({
                 ...ana,
                 provenance: Array.from(new Set([...ana.provenance, peer.nodeId]))
             });
             result.syncedAnalogies++;
          }
      }
    }

    return result;
  }
}
