import { Cell } from '../../core/cell';
import { CognitiveRelationPredicate, RepresentationVerificationStatus } from '../representation/types';
import { ConflictType, ConflictResolutionDecision } from '../verification/types';
import { Context, EpistemicTransitionTrigger } from '../epistemic/types';
import { CognitiveUnderstanding } from '../understanding/types';
import { deepFreeze } from '../../genome/genome';
import { logger } from '../../core/logger';
import { computeDeterministicHash } from '../computation/canonical';
import {
  CognitiveFeatureVector,
  LinearTransformation,
  CompositionWeight,
  CompositionTrace,
  CollectiveCognitiveState,
  applyLinearTransformation,
  generateDeterministicMatrixAndBias,
  vectorToArray,
  arrayToVector,
  clamp01,
  validateFeatureVector
} from '../types';

export interface PeerSelectionCriteria {
  requiredCapabilities?: string[];
  targetCategory?: string;
  targetDomain?: string;
  minKnowledgeOverlap?: string[];
}

export interface CellContribution {
  cellId: string;
  contributionType?: 'CONCEPT' | 'RELATION' | 'EVIDENCE' | 'EXPERIENCE' | 'HYPOTHESIS';
  content?: any;
  confidence?: number;
  concepts?: string[];
  relations?: string[];
  evidences?: string[];
  abstractions?: string[];
  generalizations?: string[];
  analogies?: string[];
}

export interface CollectiveSynthesisOptions {
  criteria?: PeerSelectionCriteria;
  context?: Context;
  summary?: string;
  intent?: any;
}

export interface EmergentStructure {
  emergentId: string;
  sourceCells: string[];
  sourceStructures: any[];
  transformation: string;
  resultingStructure: any;
  confidence: number;
  provenance: string[];
  deterministicIdentity: string;
  verificationStatus: RepresentationVerificationStatus;
}

export interface BeliefState {
  conceptId: string;
  belief: number;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  status: RepresentationVerificationStatus;
}

export interface CollectiveRepresentation {
  emergentStructures: EmergentStructure[];
  hypotheses: any[];
  beliefs: BeliefState[];
  contradictions: any[];
  provenance: string[];
  collectiveState: CollectiveCognitiveState;
  sourceCellIds: string[];
  featureVectors: Record<string, CognitiveFeatureVector>;
  weights: Record<string, number>;
  transformations: Record<string, LinearTransformation>;
  resultVector: CognitiveFeatureVector;
  deterministicIdentity: string;
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
  collectiveState?: CollectiveCognitiveState;
  sourceCellIds?: string[];
  featureVectors?: Record<string, CognitiveFeatureVector>;
  weights?: Record<string, number>;
  transformations?: Record<string, LinearTransformation>;
  resultVector?: CognitiveFeatureVector;
  deterministicIdentity?: string;
}

/**
 * P9.5: Collective Cognition Engine
 * 
 * Orchestrates distributed linear mathematical cognitive composition across Cells:
 * Cell states -> Feature extraction (x_i) -> Linear transformation (z_i = W_i x_i + b_i)
 * -> Weighted composition (C = Σ α_i z_i) -> CollectiveCognitiveState -> New Cognitive Representation
 */
export class CollectiveCognitionEngine {
  private readonly component = 'collective_cognition';

  constructor(private localCell?: Cell) {}

  /**
   * Extracts a normalized CognitiveFeatureVector x_i ∈ [0, 1]^7 from a Cell.
   * Minimal fields: [computation, reliability, cognition, knowledge, specialization, experience, resourceEfficiency].
   */
  public extractFeatureVector(cell: Cell, targetDomain?: string): CognitiveFeatureVector {
    // 1. Computation
    let computation = 0.6;
    if (cell.genome?.capabilities?.includes('INFO_PROCESSING') || (cell.genome?.capabilities as any)?.includes('COMPUTATION')) {
      computation = 0.9;
    } else if ((cell as any).computationalCapability?.partitions && (cell as any).computationalCapability.partitions.length > 0) {
      const cap = (cell as any).computationalCapability.partitions[0].capacity ?? 1000;
      computation = clamp01(cap / 5000);
    }

    // 2. Reliability
    let reliability = 0.85;
    if ((cell.genome as any)?.fitness !== undefined) {
      reliability = clamp01(0.5 + ((cell.genome as any).fitness * 0.45));
    }
    if ((cell.genome?.traits as any)?.reliabilityScore !== undefined) {
      reliability = clamp01((cell.genome.traits as any).reliabilityScore);
    }

    // 3. Cognition
    let cognition = 0.65;
    if (cell.genome?.capabilities?.includes('COGNITIVE_REASONING')) {
      cognition = 0.95;
    }

    // 4. Knowledge
    let knowledge = 0.5;
    try {
      if (cell.cognitiveGraph) {
        const concepts = cell.cognitiveGraph.getAllConcepts();
        knowledge = clamp01(0.4 + (concepts.length * 0.1));
      }
    } catch {
      knowledge = 0.5;
    }

    // 5. Specialization
    let specialization = 0.5;
    if (cell.genome?.specialization) {
      if (targetDomain && cell.genome.specialization.toUpperCase().includes(targetDomain.toUpperCase())) {
        specialization = 1.0;
      } else {
        specialization = 0.85;
      }
    }

    // 6. Experience
    let experience = 0.6;
    if (cell.genome?.generation !== undefined) {
      experience = clamp01(0.4 + (cell.genome.generation * 0.15));
    }

    // 7. Resource Efficiency
    const resourceEfficiency = clamp01((computation * 0.5) + (reliability * 0.5));

    const vector: CognitiveFeatureVector = {
      computation: clamp01(computation),
      reliability: clamp01(reliability),
      cognition: clamp01(cognition),
      knowledge: clamp01(knowledge),
      specialization: clamp01(specialization),
      experience: clamp01(experience),
      resourceEfficiency: clamp01(resourceEfficiency)
    };

    validateFeatureVector(vector);
    return vector;
  }

  /**
   * Calculates normalized composition weights α_i >= 0, Σ α_i = 1 for a set of cells.
   * Based on cell state, fitness, reliability, and domain specialization.
   */
  public calculateCompositionWeights(
    cells: Cell[],
    targetDomain?: string
  ): Record<string, { weight: number; normalizedWeight: number }> {
    const rawScores: Record<string, number> = {};
    for (const cell of cells) {
      const x_i = this.extractFeatureVector(cell, targetDomain);
      const fitness = (cell.genome as any)?.fitness ?? 0.8;
      const specBonus = (cell.genome?.specialization && targetDomain && cell.genome.specialization.toUpperCase().includes(targetDomain.toUpperCase())) ? 0.35 : (cell.genome?.specialization ? 0.15 : 0.0);
      const rawScore = Math.max(0.01, (fitness * 0.4) + (x_i.reliability * 0.3) + specBonus + (x_i.cognition * 0.2));
      rawScores[cell.nodeId] = rawScore;
    }

    const totalScore = Object.values(rawScores).reduce((sum, s) => sum + s, 0) || 1.0;
    const weights: Record<string, { weight: number; normalizedWeight: number }> = {};
    const cellIds = Object.keys(rawScores);

    for (const id of cellIds) {
      const normalized = Number((rawScores[id] / totalScore).toFixed(6));
      weights[id] = {
        weight: rawScores[id],
        normalizedWeight: normalized
      };
    }

    // Ensure sum equals 1.0 within numerical precision
    if (cellIds.length > 0) {
      const sumExceptLast = cellIds.slice(0, -1).reduce((s, id) => s + weights[id].normalizedWeight, 0);
      weights[cellIds[cellIds.length - 1]].normalizedWeight = Number((1.0 - sumExceptLast).toFixed(6));
    }

    return weights;
  }

  /**
   * Computes the linear mathematical composition over a set of relevant cells:
   * 1. x_i = extractFeatureVector(cell_i)
   * 2. z_i = W_i x_i + b_i
   * 3. α_i >= 0, Σ α_i = 1 derived from cell state/fitness/relevance
   * 4. C = Σ α_i z_i
   */
  public executeLinearComposition(
    cells: Cell[],
    context?: Context,
    targetDomain?: string
  ): CollectiveCognitiveState {
    if (!cells || cells.length === 0) {
      throw new Error('Collective linear composition requires at least one cell.');
    }

    // Sort cells deterministically by nodeId
    const sortedCells = [...cells].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
    const sourceCellIds = sortedCells.map(c => c.nodeId);

    const inputVectors: Record<string, CognitiveFeatureVector> = {};
    const transformations: Record<string, LinearTransformation> = {};
    const rawScores: Record<string, number> = {};
    const steps: string[] = [];

    // Step 1 & 2: Feature extraction and linear transformation for each Cell
    for (const cell of sortedCells) {
      const x_i = this.extractFeatureVector(cell, targetDomain);
      inputVectors[cell.nodeId] = x_i;

      const { matrix, bias } = generateDeterministicMatrixAndBias(
        cell.nodeId,
        cell.genome?.specialization ?? null,
        cell.genome?.capabilities ?? []
      );

      const trans = applyLinearTransformation(
        x_i,
        matrix,
        bias,
        `Linear transformation for Cell ${cell.nodeId}`
      );
      transformations[cell.nodeId] = trans;

      // Calculate state/fitness/relevance raw score s_i > 0
      const fitness = (cell.genome as any)?.fitness ?? 0.8;
      const specBonus = (cell.genome?.specialization && targetDomain && cell.genome.specialization.toUpperCase().includes(targetDomain.toUpperCase())) ? 0.35 : (cell.genome?.specialization ? 0.15 : 0.0);
      const rawScore = Math.max(0.01, (fitness * 0.4) + (x_i.reliability * 0.3) + specBonus + (x_i.cognition * 0.2));
      rawScores[cell.nodeId] = rawScore;

      steps.push(`Cell ${cell.nodeId} transformed: x_i -> z_i`);
    }

    // Step 3: Compute normalized weights α_i >= 0, Σ α_i = 1
    const totalScore = Object.values(rawScores).reduce((sum, s) => sum + s, 0) || 1.0;
    const weights: Record<string, number> = {};
    const cellIds = Object.keys(rawScores);

    for (const id of cellIds) {
      weights[id] = Number((rawScores[id] / totalScore).toFixed(6));
    }

    // Adjust last weight to ensure mathematically exact sum = 1.0
    if (cellIds.length > 0) {
      const sumExceptLast = cellIds.slice(0, -1).reduce((s, id) => s + weights[id], 0);
      weights[cellIds[cellIds.length - 1]] = Number((1.0 - sumExceptLast).toFixed(6));
    }
    steps.push(`Normalized composition weights calculated across ${cellIds.length} cells`);

    // Step 4: Weighted composition C = Σ α_i z_i
    const cArr = new Array(7).fill(0);
    for (const id of cellIds) {
      const alpha = weights[id];
      const zArr = vectorToArray(transformations[id].transformedVector);
      for (let j = 0; j < 7; j++) {
        cArr[j] += alpha * zArr[j];
      }
    }
    const resultVector = arrayToVector(cArr);
    steps.push(`Collective vector C = Σ α_i z_i composed`);

    // Deterministic identity isolated from timestamps (semantic equivalence)
    const semanticPayload = {
      sourceCellIds,
      inputVectors,
      weights,
      transformedVectors: Object.fromEntries(
        Object.entries(transformations).map(([k, v]) => [k, v.transformedVector])
      ),
      resultVector
    };
    const deterministicIdentity = computeDeterministicHash(semanticPayload);
    const collectiveId = `coll_${deterministicIdentity.substring(0, 16)}`;

    const trace: CompositionTrace = {
      traceId: `trace_${deterministicIdentity.substring(0, 16)}`,
      steps,
      timestamp: new Date().toISOString(),
      inputVectors,
      transformedVectors: Object.fromEntries(
        Object.entries(transformations).map(([k, v]) => [k, v.transformedVector])
      ),
      weights,
      resultVector
    };

    const provenance = [
      `collective_linear_composition_initiated:${sourceCellIds.join(',')}`,
      `weights_assigned:${Object.entries(weights).map(([k, v]) => `${k}=${v}`).join(';')}`,
      `collective_state_formed:${collectiveId}`
    ];

    return {
      collectiveId,
      sourceCellIds,
      inputVectors,
      weights,
      transformations,
      resultVector,
      provenance,
      deterministicIdentity,
      trace
    };
  }

  /**
   * Relevance-based peer selection to avoid unneeded broadcasting.
   */
  public selectRelevantPeers(peers: Cell[], criteria?: PeerSelectionCriteria): Cell[] {
    if (!peers || peers.length === 0) return [];

    return peers.filter(peer => {
      // Must not be self if localCell is defined
      if (this.localCell && peer.nodeId === this.localCell.nodeId) return false;

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

      // Domain check
      if (criteria.targetDomain) {
        const spec = peer.genome?.specialization?.toUpperCase() ?? '';
        if (!spec.includes(criteria.targetDomain.toUpperCase())) {
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
   * High-level composition method called by CognitiveRuntime or directly.
   * Transforms Cell contributions and states through the linear mathematical model.
   */
  public compose(
    understanding: CognitiveUnderstanding,
    contributions: CellContribution[],
    context: Context,
    cells?: Cell[]
  ): CollectiveRepresentation {
    const activeCells = cells ?? (this.localCell ? [this.localCell] : []);
    
    // Perform linear mathematical composition
    let collectiveState: CollectiveCognitiveState;
    if (activeCells.length > 0) {
      collectiveState = this.executeLinearComposition(activeCells, context, context.domain);
    } else {
      // Construct from contributions metadata
      const uniqueCellIds = Array.from(new Set(contributions.map(c => c.cellId))).sort();
      const mockCells: any[] = uniqueCellIds.map(id => ({
        nodeId: id,
        genome: {
          genomeId: `gen_${id}`,
          generation: 1,
          fitness: 0.9,
          capabilities: ['COGNITIVE_REASONING'],
          specialization: 'LOGIC'
        }
      }));
      collectiveState = this.executeLinearComposition(mockCells, context, context.domain);
    }

    const emergentStructures: EmergentStructure[] = [];
    const hypotheses: any[] = [];
    const beliefs: BeliefState[] = [];
    const contradictions: any[] = [];
    const provenance: string[] = [
      'collective_composition_started',
      ...collectiveState.provenance
    ];

    // Group contributions by type
    const concepts = contributions.filter(c => c.contributionType === 'CONCEPT');
    const relations = contributions.filter(c => c.contributionType === 'RELATION');
    const evidences = contributions.filter(c => c.contributionType === 'EVIDENCE');

    // Helper to strip non-semantic timestamps from hash payloads ensuring time-isolated determinism
    const sanitizeForSemanticHash = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(sanitizeForSemanticHash);
      const { createdAt, updatedAt, timestamp, ...rest } = obj;
      const cleaned: any = {};
      for (const [k, v] of Object.entries(rest)) {
        cleaned[k] = sanitizeForSemanticHash(v);
      }
      return cleaned;
    };

    // Cross-Cell Interaction: Match concepts and relations
    for (const rel of relations) {
      const relContent = rel.content ?? {};
      const relatedConcepts = concepts.filter(c => 
        (c.content?.conceptId && (c.content.conceptId === relContent.subjectConceptId || c.content.conceptId === relContent.objectConceptId))
      );

      if (relatedConcepts.length > 0) {
        const supportingEvs = evidences.filter(e => e.content?.supports === relContent.relationId);
        const contradictingEvs = evidences.filter(e => e.content?.contradicts === relContent.relationId);

        let status = RepresentationVerificationStatus.PENDING;
        if (contradictingEvs.length > 0 && supportingEvs.length > 0) {
          status = RepresentationVerificationStatus.CONTRADICTED;
          contradictions.push({
            target: relContent,
            supporters: supportingEvs.map(e => e.cellId),
            contradictors: contradictingEvs.map(e => e.cellId)
          });
        } else if (supportingEvs.length > 0) {
          status = RepresentationVerificationStatus.SUPPORTED;
        } else if (contradictingEvs.length > 0) {
          status = RepresentationVerificationStatus.REJECTED;
        }

        const sourceCells = Array.from(new Set([
          rel.cellId,
          ...relatedConcepts.map(c => c.cellId),
          ...supportingEvs.map(e => e.cellId),
          ...contradictingEvs.map(e => e.cellId)
        ])).sort();

        const resultingStructure = {
          type: 'HYPOTHESIS',
          statement: `${relContent.subjectConceptId} ${relContent.predicate} ${relContent.objectConceptId}`,
          context: {
            contextId: context.contextId,
            domain: context.domain
          },
          status: 'HYPOTHESIS',
          linearConfidence: collectiveState.resultVector.cognition
        };

        const hashPayload = sanitizeForSemanticHash({
          sources: sourceCells,
          relation: relContent,
          concepts: relatedConcepts.map(c => c.content),
          resultingStructure
        });

        const deterministicIdentity = computeDeterministicHash(hashPayload);
        const emergentId = `emg_${deterministicIdentity.substring(0, 16)}`;

        const emergent: EmergentStructure = {
          emergentId,
          sourceCells,
          sourceStructures: [relContent, ...relatedConcepts.map(c => c.content)],
          transformation: 'CROSS_CELL_RELATION_MATCH',
          resultingStructure,
          confidence: Math.max(rel.confidence ?? 0.8, 0.1),
          provenance: [`interaction:${rel.cellId}_with_multiple_cells`, `collective_state:${collectiveState.collectiveId}`],
          deterministicIdentity,
          verificationStatus: status
        };

        emergentStructures.push(emergent);
        hypotheses.push(resultingStructure);

        beliefs.push({
          conceptId: relContent.relationId ?? 'rel_unknown',
          belief: status === RepresentationVerificationStatus.SUPPORTED ? 0.9 : (status === RepresentationVerificationStatus.CONTRADICTED ? 0.5 : 0.1),
          supportingEvidence: supportingEvs.map(e => e.content?.evidenceId ?? 'ev_unknown'),
          contradictingEvidence: contradictingEvs.map(e => e.content?.evidenceId ?? 'ev_unknown'),
          status
        });
      }
    }

    // Emergence logic: Combine concepts that have no explicit relations to form an emergent hypothesis
    if (concepts.length > 1 && relations.length === 0) {
      const sourceCells = Array.from(new Set(concepts.map(c => c.cellId))).sort();
      const resultingStructure = {
        type: 'HYPOTHESIS',
        statement: `Possible emergent link between ${concepts.map(c => c.content?.canonicalName || c.content?.conceptId).join(' and ')}`,
        context: {
          contextId: context.contextId,
          domain: context.domain
        },
        status: 'HYPOTHESIS',
        linearConfidence: collectiveState.resultVector.cognition
      };

      const deterministicIdentity = computeDeterministicHash(sanitizeForSemanticHash({
        concepts: concepts.map(c => c.content),
        resultingStructure
      }));

      emergentStructures.push({
        emergentId: `emg_${deterministicIdentity.substring(0, 16)}`,
        sourceCells,
        sourceStructures: concepts.map(c => c.content),
        transformation: 'CONCEPTUAL_SYNTHESIS',
        resultingStructure,
        confidence: collectiveState.resultVector.cognition,
        provenance: ['conceptual_synthesis_without_relations', `collective_state:${collectiveState.collectiveId}`],
        deterministicIdentity,
        verificationStatus: RepresentationVerificationStatus.PENDING
      });
      hypotheses.push(resultingStructure);
    }

    provenance.push(`emergent_structures_generated:${emergentStructures.length}`);

    const representation: CollectiveRepresentation = {
      emergentStructures,
      hypotheses,
      beliefs,
      contradictions,
      provenance,
      collectiveState,
      sourceCellIds: collectiveState.sourceCellIds,
      featureVectors: collectiveState.inputVectors,
      weights: collectiveState.weights,
      transformations: collectiveState.transformations,
      resultVector: collectiveState.resultVector,
      deterministicIdentity: collectiveState.deterministicIdentity
    };

    return representation;
  }

  /**
   * Synthesizes collective cognition across selected peers via semantic composition and linear mathematical model.
   * Full backward compatibility with P7.5 and Cell.
   */
  public async synthesizeWithPeers(
    peers: Cell[],
    options?: CollectiveSynthesisOptions
  ): Promise<CollectiveSynthesisResult> {
    if (!this.localCell) {
      throw new Error('synthesizeWithPeers requires localCell in constructor.');
    }

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
            contribution.evidences!.push(ev.evidenceId);
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
            contribution.concepts!.push(inserted.conceptId);
            allInvolvedConceptIds.add(inserted.conceptId);
          } else {
            const mergedProvenance = Array.from(new Set([...localConcept.provenance, peer.nodeId]));
            if (mergedProvenance.length > localConcept.provenance.length) {
              await this.localCell.cognitiveGraph.updateConcept({
                ...localConcept,
                provenance: mergedProvenance,
                version: localConcept.version + 1,
                updatedAt: new Date().toISOString()
              });
            }
            contribution.concepts!.push(localConcept.conceptId);
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
            contribution.relations!.push(insertedRel.relationId);
            allInvolvedRelationIds.add(insertedRel.relationId);
            allInvolvedConceptIds.add(rel.subjectConceptId);
            allInvolvedConceptIds.add(rel.objectConceptId);

            if (conflictingLocal) {
              conflictsDetected++;
              allInvolvedRelationIds.add(conflictingLocal.relationId);

              const conflict = this.localCell.verification.detectAndResolveConflict({
                type: ConflictType.DIRECT_CONTRADICTION,
                claimAId: conflictingLocal.relationId,
                claimBId: clonedRel.relationId,
                description: `Collective peer divergence between local ${conflictingLocal.predicate} and peer ${clonedRel.predicate}`
              });

              if (conflict.resolutionDecision === ConflictResolutionDecision.REJECT_CLAIM_B) {
                conflictsResolved++;
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
                await this.localCell.cognitiveGraph.preserveConflict(
                  conflictingLocal.subjectConceptId,
                  conflictingLocal.objectConceptId,
                  `Preserved peer divergence via verification: ${conflict.resolutionDecision}`
                );
              }
            }
          } else {
            contribution.relations!.push(localRel.relationId);
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
            contribution.abstractions!.push(abs.abstractionId);
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
            contribution.generalizations!.push(gen.generalizationId);
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
            contribution.analogies!.push(ana.analogyId);
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

    // Execute linear mathematical composition across local cell + responding peers
    const participatingCells = [this.localCell, ...selectedPeers.filter(p => !failedPeers.includes(p.nodeId))];
    const collectiveState = this.executeLinearComposition(
      participatingCells,
      synthesisContext,
      synthesisContext.domain
    );

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

    const collectiveId = collectiveState.collectiveId;

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
      timestamp: new Date().toISOString(),
      collectiveState,
      sourceCellIds: collectiveState.sourceCellIds,
      featureVectors: collectiveState.inputVectors,
      weights: collectiveState.weights,
      transformations: collectiveState.transformations,
      resultVector: collectiveState.resultVector,
      deterministicIdentity: collectiveState.deterministicIdentity
    };

    return deepFreeze(result);
  }
}
