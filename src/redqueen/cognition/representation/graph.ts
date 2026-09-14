import { MemoryStore, MemoryCategory, MemoryEntry } from '../../memory/store';
import { logger } from '../../core/logger';
import {
  CognitiveConcept,
  CognitiveConceptSchema,
  CognitiveRelation,
  CognitiveRelationSchema,
  CognitiveRelationPredicate,
  CognitiveAbstraction,
  CognitiveAbstractionSchema,
  CognitiveGeneralization,
  CognitiveGeneralizationSchema,
  CognitiveAnalogy,
  CognitiveAnalogySchema,
  RepresentationVerificationStatus,
  CognitiveRepresentationBudget,
  DEFAULT_REPRESENTATION_BUDGET,
  StructuralSignature
} from './types';
import { InformationCategory } from '../../metabolism/types';
import {
  EpistemicState,
  EpistemicStateSchema,
  Context,
  EpistemicStatus,
  EpistemicTransitionTrigger,
  CognitiveTransitionRecord,
  CognitiveTransitionRecordSchema,
  freezeTransitionRecord
} from '../epistemic/types';
import {
  CognitiveStateTransitionEngine,
  TransitionInput,
  TransitionOutput
} from '../epistemic/transition';
import { Evidence, EvidenceSchema, freezeEvidence, EvidenceDependency, EvidenceDependencySchema } from '../evidence/types';
import { EvidenceDependencyGraph } from '../evidence/graph';
import { EpistemicFusionEngine, EpistemicFusionResult, AttributedEvidence } from '../epistemic/fusion';
import { EpistemicAdapter } from '../epistemic/adapter';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

/**
 * Concept Graph Foundation for an individual Cell.
 * 
 * Provides an explicit semantic network of Concepts, Relations, Abstractions,
 * Generalizations, and Structural Analogies.
 * 
 * Guarantees:
 * - Local MemoryStore persistence & strict Cell memory isolation.
 * - Cycle-safe bounded graph traversal (depth, visited, timeout).
 * - Non-destructive conflict preservation (contradictory representations are retained with CONTRADICTS links).
 * - Finite representation budgets to prevent unbounded graph explosion.
 */
export class CognitiveGraph {
  private readonly component = 'cognitive_graph';
  private readonly budget: CognitiveRepresentationBudget;

  // In-memory indexed caches backed by persistent MemoryStore
  private readonly concepts: Map<string, CognitiveConcept> = new Map();
  private readonly relations: Map<string, CognitiveRelation> = new Map();
  private readonly abstractions: Map<string, CognitiveAbstraction> = new Map();
  private readonly generalizations: Map<string, CognitiveGeneralization> = new Map();
  private readonly analogies: Map<string, CognitiveAnalogy> = new Map();
  private readonly epistemicStates: Map<string, EpistemicState> = new Map();
  private readonly evidences: Map<string, Evidence> = new Map();
  private readonly edg: EvidenceDependencyGraph = new EvidenceDependencyGraph();
  private readonly transitions: Map<string, CognitiveTransitionRecord> = new Map();
  private readonly repEpistemicIndex: Map<string, string> = new Map();
  private readonly transitionEngine: CognitiveStateTransitionEngine = new CognitiveStateTransitionEngine();

  // Adjacency indices for rapid relationship lookups
  private readonly outgoingRelations: Map<string, Set<string>> = new Map();
  private readonly incomingRelations: Map<string, Set<string>> = new Map();

  constructor(
    public readonly cellId: string,
    private readonly memory: MemoryStore,
    budget?: Partial<CognitiveRepresentationBudget>
  ) {
    this.budget = Object.freeze({
      ...DEFAULT_REPRESENTATION_BUDGET,
      ...(budget || {})
    });
  }

  /**
   * Inserts a concept into the graph and persists to MemoryStore.
   */
  public async insertConcept(candidate: CognitiveConcept): Promise<CognitiveConcept> {
    const validated = CognitiveConceptSchema.parse(candidate);

    if (this.concepts.size >= this.budget.maxRepresentationsPerCell) {
      throw new Error(`Cognitive graph representation budget exceeded (${this.budget.maxRepresentationsPerCell} concepts)`);
    }

    // Duplicate detection by canonicalName and category
    const existing = this.detectDuplicateConcept(validated.canonicalName, validated.category);
    if (existing) {
      // Merge provenance and update version
      const mergedProvenance = Array.from(new Set([...existing.provenance, ...validated.provenance]));
      const mergedKnowledge = Array.from(new Set([...existing.sourceKnowledgeIds, ...validated.sourceKnowledgeIds]));
      const updatedConcept: CognitiveConcept = {
        ...existing,
        description: validated.description.length > existing.description.length ? validated.description : existing.description,
        provenance: mergedProvenance,
        sourceKnowledgeIds: mergedKnowledge,
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
        confidence: Math.max(existing.confidence, validated.confidence)
      };

      this.concepts.set(updatedConcept.conceptId, updatedConcept);
      await this.persistEntry(updatedConcept.conceptId, 'COGNITIVE_CONCEPT', updatedConcept, updatedConcept.confidence, updatedConcept.provenance);
      return updatedConcept;
    }

    this.concepts.set(validated.conceptId, validated);
    await this.persistEntry(validated.conceptId, 'COGNITIVE_CONCEPT', validated, validated.confidence, validated.provenance);

    logger.debug(this.component, 'concept_inserted', {
      cellId: this.cellId,
      conceptId: validated.conceptId,
      name: validated.canonicalName
    });

    return validated;
  }

  /**
   * Inserts a typed relationship connecting two concepts.
   */
  public async insertRelation(candidate: CognitiveRelation): Promise<CognitiveRelation> {
    const validated = CognitiveRelationSchema.parse(candidate);

    // Self-loop prevention: A concept cannot relate to itself unless explicitly justified
    if (validated.subjectConceptId === validated.objectConceptId) {
      throw new Error(`Self-loop relation rejected: concept '${validated.subjectConceptId}' cannot relate to itself via '${validated.predicate}'`);
    }

    // Duplicate relation check
    for (const rel of this.relations.values()) {
      if (
        rel.subjectConceptId === validated.subjectConceptId &&
        rel.predicate === validated.predicate &&
        rel.objectConceptId === validated.objectConceptId
      ) {
        // Already exists - update confidence if higher
        if (validated.confidence > rel.confidence) {
          const updated: CognitiveRelation = {
            ...rel,
            confidence: validated.confidence,
            provenance: Array.from(new Set([...rel.provenance, ...validated.provenance]))
          };
          this.relations.set(updated.relationId, updated);
          await this.persistEntry(updated.relationId, 'COGNITIVE_RELATION', updated, updated.confidence, updated.provenance);
          return updated;
        }
        return rel;
      }
    }

    this.relations.set(validated.relationId, validated);

    // Index adjacency
    if (!this.outgoingRelations.has(validated.subjectConceptId)) {
      this.outgoingRelations.set(validated.subjectConceptId, new Set());
    }
    this.outgoingRelations.get(validated.subjectConceptId)!.add(validated.relationId);

    if (!this.incomingRelations.has(validated.objectConceptId)) {
      this.incomingRelations.set(validated.objectConceptId, new Set());
    }
    this.incomingRelations.get(validated.objectConceptId)!.add(validated.relationId);

    await this.persistEntry(validated.relationId, 'COGNITIVE_RELATION', validated, validated.confidence, validated.provenance);

    return validated;
  }

  /**
   * Inserts an abstraction pattern into the cognitive graph.
   * Enforces self-abstraction rejection and structural validation.
   */
  public async insertAbstraction(candidate: CognitiveAbstraction): Promise<CognitiveAbstraction> {
    const validated = CognitiveAbstractionSchema.parse(candidate);

    // Self-abstraction prevention: An abstraction cannot be self-referential or match the concrete concept itself
    for (const sourceId of validated.sourceConceptIds) {
      if (sourceId === validated.abstractionId) {
        throw new Error(`Self-abstraction rejected: abstractionId '${validated.abstractionId}' cannot equal source conceptId`);
      }
      const concept = this.concepts.get(sourceId);
      if (concept) {
        const normPattern = validated.generalizedPattern.trim().toLowerCase();
        const normName = concept.canonicalName.trim().toLowerCase();
        if (
          normPattern === normName ||
          normPattern === `abstraction(${normName})` ||
          normPattern === `${normName} abstraction`
        ) {
          throw new Error(`Self-abstraction rejected: abstraction pattern matches concept canonical name '${concept.canonicalName}'`);
        }
      }
    }

    this.abstractions.set(validated.abstractionId, validated);

    // Also link abstraction to other source concepts via GENERALIZES relation if not present
    const primarySourceId = validated.sourceConceptIds[0];
    for (const sourceId of validated.sourceConceptIds) {
      if (sourceId !== primarySourceId && this.concepts.has(sourceId)) {
        await this.insertRelation({
          relationId: `rel_abs_${uuidv4()}`,
          subjectConceptId: primarySourceId,
          predicate: CognitiveRelationPredicate.GENERALIZES,
          objectConceptId: sourceId,
          confidence: validated.confidence,
          provenance: validated.provenance,
          verificationStatus: validated.verificationStatus,
          createdAt: new Date().toISOString(),
          originatingCellId: this.cellId,
          metadata: { abstractionId: validated.abstractionId }
        }).catch(() => {});
      }
    }

    await this.persistEntry(validated.abstractionId, 'COGNITIVE_ABSTRACTION', validated, validated.confidence, validated.provenance);
    return validated;
  }

  /**
   * Inserts a generalization pattern into the cognitive graph.
   * Enforces that generalizations with <= 1 evidence must be candidate/hypothesis (PENDING).
   */
  public async insertGeneralization(candidate: CognitiveGeneralization): Promise<CognitiveGeneralization> {
    let toValidate = { ...candidate };
    if (toValidate.supportingEvidence.length <= 1 && toValidate.verificationStatus === RepresentationVerificationStatus.VERIFIED) {
      // Must be candidate/pending if only supported by 1 evidence
      toValidate.verificationStatus = RepresentationVerificationStatus.PENDING;
    }

    const validated = CognitiveGeneralizationSchema.parse(toValidate);
    this.generalizations.set(validated.generalizationId, validated);
    await this.persistEntry(validated.generalizationId, 'COGNITIVE_GENERALIZATION', validated, validated.confidence, validated.provenance);
    return validated;
  }

  /**
   * Inserts a structural cross-domain analogy into the cognitive graph.
   * Enforces structural mapping requirements.
   */
  public async insertAnalogy(candidate: CognitiveAnalogy): Promise<CognitiveAnalogy> {
    let toValidate = { ...candidate };

    // Strict validation: Analogy must have structural mapping, not mere lexical similarity
    if (toValidate.mappedRelations.length === 0 || toValidate.structuralSimilarity <= 0) {
      if (toValidate.verificationStatus === RepresentationVerificationStatus.VERIFIED) {
        toValidate.verificationStatus = RepresentationVerificationStatus.PENDING;
      }
    }

    const validated = CognitiveAnalogySchema.parse(toValidate);
    this.analogies.set(validated.analogyId, validated);

    // Link analogy concepts via ANALOGOUS_TO relation
    for (const src of validated.sourceConceptIds) {
      for (const tgt of validated.targetConceptIds) {
        if (this.concepts.has(src) && this.concepts.has(tgt)) {
          await this.insertRelation({
            relationId: `rel_ana_${uuidv4()}`,
            subjectConceptId: src,
            predicate: CognitiveRelationPredicate.ANALOGOUS_TO,
            objectConceptId: tgt,
            confidence: validated.confidence,
            provenance: validated.provenance,
            verificationStatus: validated.verificationStatus,
            createdAt: new Date().toISOString(),
            originatingCellId: this.cellId,
            metadata: { analogyId: validated.analogyId, structuralSimilarity: validated.structuralSimilarity }
          }).catch(() => {});
        }
      }
    }

    await this.persistEntry(validated.analogyId, 'COGNITIVE_ANALOGY', validated, validated.confidence, validated.provenance);
    return validated;
  }

  /**
   * Preserves conflicting representations without destructive overwrite.
   * Both concepts are preserved non-destructively with their verification status intact.
   * Records a CONTRADICTS relation explicitly with verification status SUPPORTED.
   */
  public async preserveConflict(
    conceptIdA: string,
    conceptIdB: string,
    reason: string
  ): Promise<CognitiveRelation> {
    const conceptA = this.concepts.get(conceptIdA);
    const conceptB = this.concepts.get(conceptIdB);

    // Conflict metadata recorded on concepts without destroying them (non-destructive)
    if (conceptA) {
      conceptA.metadata = {
        ...conceptA.metadata,
        conflictingConceptIds: Array.from(
          new Set([...((conceptA.metadata?.conflictingConceptIds as string[]) || []), conceptIdB])
        )
      };

      const esA = conceptA.epistemicStateId ? this.epistemicStates.get(conceptA.epistemicStateId) : undefined;
      const ctxA: Context = esA?.context || {
        contextId: `ctx_conflict_${conceptIdA}`,
        domain: 'CONFLICT_RESOLUTION'
      };

      const outputA = this.transitionEngine.transition({
        targetRepresentationId: conceptIdA,
        previousState: esA,
        context: ctxA,
        trigger: EpistemicTransitionTrigger.CONTRADICTION_DETECTED,
        explicitVerification: {
          status: RepresentationVerificationStatus.CONTRADICTED,
          verifiedBy: this.cellId
        },
        reason: `Preserved conflict with concept ${conceptIdB}: ${reason}`
      });

      await this.insertEpistemicState(outputA.nextState);
      this.transitions.set(outputA.transitionRecord.transitionId, outputA.transitionRecord);
      await this.persistEntry(
        outputA.transitionRecord.transitionId,
        'COGNITIVE_STATE_TRANSITION',
        outputA.transitionRecord,
        1.0,
        [this.cellId]
      );
      this.repEpistemicIndex.set(`${conceptIdA}::${ctxA.contextId}`, outputA.nextState.stateId);

      conceptA.epistemicStateId = outputA.nextState.stateId;
      conceptA.verificationStatus = outputA.nextState.verificationStatus;
      await this.persistEntry(conceptA.conceptId, 'COGNITIVE_CONCEPT', conceptA, conceptA.confidence, conceptA.provenance);
    }

    if (conceptB) {
      conceptB.metadata = {
        ...conceptB.metadata,
        conflictingConceptIds: Array.from(
          new Set([...((conceptB.metadata?.conflictingConceptIds as string[]) || []), conceptIdA])
        )
      };

      const esB = conceptB.epistemicStateId ? this.epistemicStates.get(conceptB.epistemicStateId) : undefined;
      const ctxB: Context = esB?.context || {
        contextId: `ctx_conflict_${conceptIdB}`,
        domain: 'CONFLICT_RESOLUTION'
      };

      const outputB = this.transitionEngine.transition({
        targetRepresentationId: conceptIdB,
        previousState: esB,
        context: ctxB,
        trigger: EpistemicTransitionTrigger.CONTRADICTION_DETECTED,
        explicitVerification: {
          status: RepresentationVerificationStatus.CONTRADICTED,
          verifiedBy: this.cellId
        },
        reason: `Preserved conflict with concept ${conceptIdA}: ${reason}`
      });

      await this.insertEpistemicState(outputB.nextState);
      this.transitions.set(outputB.transitionRecord.transitionId, outputB.transitionRecord);
      await this.persistEntry(
        outputB.transitionRecord.transitionId,
        'COGNITIVE_STATE_TRANSITION',
        outputB.transitionRecord,
        1.0,
        [this.cellId]
      );
      this.repEpistemicIndex.set(`${conceptIdB}::${ctxB.contextId}`, outputB.nextState.stateId);

      conceptB.epistemicStateId = outputB.nextState.stateId;
      conceptB.verificationStatus = outputB.nextState.verificationStatus;
      await this.persistEntry(conceptB.conceptId, 'COGNITIVE_CONCEPT', conceptB, conceptB.confidence, conceptB.provenance);
    }

    const conflictRelation: CognitiveRelation = {
      relationId: `rel_conflict_${uuidv4()}`,
      subjectConceptId: conceptIdA,
      predicate: CognitiveRelationPredicate.CONTRADICTS,
      objectConceptId: conceptIdB,
      confidence: 1.0,
      provenance: [this.cellId],
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: new Date().toISOString(),
      originatingCellId: this.cellId,
      metadata: { reason }
    };

    return this.insertRelation(conflictRelation);
  }

  public getConcept(conceptId: string): CognitiveConcept | undefined {
    return this.concepts.get(conceptId);
  }

  public findConceptByName(name: string): CognitiveConcept | undefined {
    const lower = name.trim().toLowerCase();
    for (const concept of this.concepts.values()) {
      if (concept.canonicalName.toLowerCase() === lower) {
        return concept;
      }
    }
    return undefined;
  }

  public detectDuplicateConcept(canonicalName: string, category: InformationCategory): CognitiveConcept | undefined {
    const lower = canonicalName.trim().toLowerCase();
    for (const concept of this.concepts.values()) {
      if (concept.canonicalName.toLowerCase() === lower && concept.category === category) {
        return concept;
      }
    }
    return undefined;
  }

  public getRelation(relationId: string): CognitiveRelation | undefined {
    return this.relations.get(relationId);
  }

  public queryRelations(query: {
    subject?: string;
    predicate?: CognitiveRelationPredicate;
    object?: string;
  }): CognitiveRelation[] {
    const results: CognitiveRelation[] = [];
    for (const rel of this.relations.values()) {
      if (query.subject && rel.subjectConceptId !== query.subject) continue;
      if (query.predicate && rel.predicate !== query.predicate) continue;
      if (query.object && rel.objectConceptId !== query.object) continue;
      results.push(rel);
    }
    return results;
  }

  public getRelationsForConcept(conceptId: string): CognitiveRelation[] {
    const rels: CognitiveRelation[] = [];
    const outIds = this.outgoingRelations.get(conceptId) || new Set();
    for (const id of outIds) {
      const rel = this.relations.get(id);
      if (rel) rels.push(rel);
    }
    const inIds = this.incomingRelations.get(conceptId) || new Set();
    for (const id of inIds) {
      const rel = this.relations.get(id);
      if (rel && !outIds.has(id)) rels.push(rel);
    }
    return rels;
  }

  public getContradictions(conceptId: string): CognitiveRelation[] {
    return this.queryRelations({
      predicate: CognitiveRelationPredicate.CONTRADICTS
    }).filter(r => r.subjectConceptId === conceptId || r.objectConceptId === conceptId);
  }

  public getSupportingEvidence(conceptId: string): {
    knowledgeIds: string[];
    experienceIds: string[];
    generalizations: CognitiveGeneralization[];
  } {
    const concept = this.concepts.get(conceptId);
    if (!concept) {
      return { knowledgeIds: [], experienceIds: [], generalizations: [] };
    }

    const matchedGen = Array.from(this.generalizations.values()).filter(g =>
      g.sourceConceptIds.includes(conceptId)
    );

    return {
      knowledgeIds: [...concept.sourceKnowledgeIds],
      experienceIds: [...concept.sourceExperienceIds],
      generalizations: matchedGen
    };
  }

  /**
   * Bounded and cycle-safe graph neighborhood traversal.
   */
  public getNeighbors(
    startConceptId: string,
    options?: {
      maxDepth?: number;
      predicateFilter?: CognitiveRelationPredicate[];
    }
  ): CognitiveConcept[] {
    const maxDepth = Math.min(options?.maxDepth ?? this.budget.maxGraphTraversalDepth, this.budget.maxGraphTraversalDepth);
    const predicateFilter = options?.predicateFilter;
    const startTime = Date.now();

    const visitedNodes = new Set<string>();
    const neighbors: CognitiveConcept[] = [];
    const queue: Array<{ conceptId: string; depth: number }> = [{ conceptId: startConceptId, depth: 0 }];
    visitedNodes.add(startConceptId);

    while (queue.length > 0) {
      if (Date.now() - startTime > this.budget.traversalTimeoutMs) {
        logger.warn(this.component, 'graph_traversal_timeout', { startConceptId });
        break;
      }

      if (visitedNodes.size >= this.budget.maxVisitedNodesTraversal) {
        logger.warn(this.component, 'graph_traversal_max_visited_reached', { count: visitedNodes.size });
        break;
      }

      const { conceptId, depth } = queue.shift()!;
      if (depth >= maxDepth) continue;

      const outRelIds = this.outgoingRelations.get(conceptId) || new Set();
      for (const relId of outRelIds) {
        const rel = this.relations.get(relId);
        if (!rel) continue;
        if (predicateFilter && !predicateFilter.includes(rel.predicate)) continue;

        const targetId = rel.objectConceptId;
        if (!visitedNodes.has(targetId)) {
          visitedNodes.add(targetId);
          const targetConcept = this.concepts.get(targetId);
          if (targetConcept) {
            neighbors.push(targetConcept);
          }
          queue.push({ conceptId: targetId, depth: depth + 1 });
        }
      }
    }

    return neighbors;
  }

  /**
   * Traverse starting from concept including starting node, bounded by depth and timeout.
   */
  public traverse(
    startConceptId: string,
    options?: { maxDepth?: number; predicateFilter?: CognitiveRelationPredicate[]; timeoutMs?: number }
  ): CognitiveConcept[] {
    const start = this.getConcept(startConceptId);
    const neighbors = this.getNeighbors(startConceptId, options);
    return start ? [start, ...neighbors] : neighbors;
  }

  /**
   * Computes a bounded structural topological signature for a concept.
   * Captures in/out predicates, degrees, neighbor categories, and local motifs.
   */
  public computeStructuralSignature(
    conceptId: string, 
    depth: number = 1,
    inFlightContext?: { concept: CognitiveConcept; relations: CognitiveRelation[] }
  ): StructuralSignature | null {
    let concept = this.concepts.get(conceptId);
    let inFlightRelations: CognitiveRelation[] = [];

    if (inFlightContext) {
      if (!concept && inFlightContext.concept && inFlightContext.concept.conceptId === conceptId) {
        concept = inFlightContext.concept;
      }
      if (inFlightContext.relations) {
        inFlightRelations = inFlightContext.relations.filter(
          r => r.subjectConceptId === conceptId || r.objectConceptId === conceptId
        );
      }
    }

    if (!concept) return null;

    const boundedDepth = Math.min(depth, this.budget.maxStructuralSignatureDepth || 2);
    const outgoingPredicates: CognitiveRelationPredicate[] = [];
    const incomingPredicates: CognitiveRelationPredicate[] = [];
    const neighborCategoriesSet = new Set<InformationCategory>();
    const localMotifs: string[] = [];

    if (this.concepts.has(conceptId)) {
      const outRelIds = this.outgoingRelations.get(conceptId) || new Set();
      const inRelIds = this.incomingRelations.get(conceptId) || new Set();

      for (const relId of outRelIds) {
        const rel = this.relations.get(relId);
        if (rel) {
          outgoingPredicates.push(rel.predicate);
          const target = this.concepts.get(rel.objectConceptId);
          if (target) {
            neighborCategoriesSet.add(target.category);
            localMotifs.push(`OUT:${rel.predicate}->${target.category}`);

            // Depth 2 if requested
            if (boundedDepth > 1) {
              const nextOutRelIds = this.outgoingRelations.get(target.conceptId) || new Set();
              for (const nRelId of nextOutRelIds) {
                const nRel = this.relations.get(nRelId);
                if (nRel) {
                  localMotifs.push(`CHAIN:${rel.predicate}->${nRel.predicate}`);
                }
              }
            }
          }
        }
      }

      for (const relId of inRelIds) {
        const rel = this.relations.get(relId);
        if (rel) {
          incomingPredicates.push(rel.predicate);
          const source = this.concepts.get(rel.subjectConceptId);
          if (source) {
            neighborCategoriesSet.add(source.category);
            localMotifs.push(`IN:${rel.predicate}<-${source.category}`);
          }
        }
      }
    }

    if (inFlightRelations.length > 0) {
      for (const rel of inFlightRelations) {
        if (rel.subjectConceptId === conceptId) {
          outgoingPredicates.push(rel.predicate);
          const target = this.concepts.get(rel.objectConceptId);
          if (target) {
            neighborCategoriesSet.add(target.category);
            localMotifs.push(`OUT:${rel.predicate}->${target.category}`);
          }
        }
        if (rel.objectConceptId === conceptId) {
          incomingPredicates.push(rel.predicate);
          const source = this.concepts.get(rel.subjectConceptId);
          if (source) {
            neighborCategoriesSet.add(source.category);
            localMotifs.push(`IN:${rel.predicate}<-${source.category}`);
          }
        }
      }
    }

    // Sort to make signature canonical and deterministic
    outgoingPredicates.sort();
    incomingPredicates.sort();
    localMotifs.sort();
    const neighborCategories = Array.from(neighborCategoriesSet).sort();

    // Canonical structural representation
    const rawFingerprint = JSON.stringify({
      category: concept.category,
      inDeg: incomingPredicates.length,
      outDeg: outgoingPredicates.length,
      inPreds: incomingPredicates,
      outPreds: outgoingPredicates,
      motifs: localMotifs
    });

    const structuralHash = crypto.createHash('sha256').update(rawFingerprint).digest('hex').slice(0, 16);

    return {
      conceptId,
      category: concept.category,
      inDegree: incomingPredicates.length,
      outDegree: outgoingPredicates.length,
      incomingPredicates,
      outgoingPredicates,
      neighborCategories,
      localMotifs,
      structuralHash,
      depth: boundedDepth
    };
  }

  /**
   * Fast structural candidate pruning for cross-domain analogies.
   * Compares structural signatures (predicate overlap, topological degree similarity, motif match)
   * without O(N^2) exhaustive full-graph isomorphism.
   */
  public findAnalogyCandidates(
    sourceConceptId: string,
    options?: { 
      maxCandidates?: number; 
      minSimilarityThreshold?: number;
      inFlightContext?: { concept: CognitiveConcept; relations: CognitiveRelation[] };
    }
  ): Array<{ targetConceptId: string; signatureSimilarity: number; targetSignature: StructuralSignature }> {
    const sourceSig = this.computeStructuralSignature(sourceConceptId, 1, options?.inFlightContext);
    if (!sourceSig) return [];

    const maxCandidates = options?.maxCandidates ?? this.budget.maxAnalogyCandidates;
    const minThreshold = options?.minSimilarityThreshold ?? 0.2;
    const candidates: Array<{ targetConceptId: string; signatureSimilarity: number; targetSignature: StructuralSignature }> = [];

    for (const concept of this.concepts.values()) {
      if (concept.conceptId === sourceConceptId) continue;

      const targetSig = this.computeStructuralSignature(concept.conceptId);
      if (!targetSig) continue;

      // Must have some relational structure to form an analogy
      if (sourceSig.outDegree === 0 && sourceSig.inDegree === 0) continue;
      if (targetSig.outDegree === 0 && targetSig.inDegree === 0) continue;

      // Calculate topological similarity based on predicates and degree compatibility
      const sim = this.compareSignatures(sourceSig, targetSig);
      if (sim >= minThreshold) {
        candidates.push({
          targetConceptId: concept.conceptId,
          signatureSimilarity: sim,
          targetSignature: targetSig
        });
      }
    }

    candidates.sort((a, b) => b.signatureSimilarity - a.signatureSimilarity);
    return candidates.slice(0, maxCandidates);
  }

  public compareSignatures(a: StructuralSignature, b: StructuralSignature): number {
    // Jaccard similarity of outgoing predicates
    const setAOut = new Set(a.outgoingPredicates);
    const setBOut = new Set(b.outgoingPredicates);
    const unionOut = new Set([...setAOut, ...setBOut]);
    let intersectOut = 0;
    for (const p of setAOut) {
      if (setBOut.has(p)) intersectOut++;
    }
    const outScore = unionOut.size > 0 ? intersectOut / unionOut.size : 0;

    // Jaccard similarity of incoming predicates
    const setAIn = new Set(a.incomingPredicates);
    const setBIn = new Set(b.incomingPredicates);
    const unionIn = new Set([...setAIn, ...setBIn]);
    let intersectIn = 0;
    for (const p of setAIn) {
      if (setBIn.has(p)) intersectIn++;
    }
    const inScore = unionIn.size > 0 ? intersectIn / unionIn.size : 0;

    // Degree ratio compatibility
    const maxOut = Math.max(a.outDegree, b.outDegree);
    const minOut = Math.min(a.outDegree, b.outDegree);
    const degOutRatio = maxOut > 0 ? minOut / maxOut : 1.0;

    const maxIn = Math.max(a.inDegree, b.inDegree);
    const minIn = Math.min(a.inDegree, b.inDegree);
    const degInRatio = maxIn > 0 ? minIn / maxIn : 1.0;

    // Weighted structural score
    return Number(((outScore * 0.4) + (inScore * 0.3) + (degOutRatio * 0.15) + (degInRatio * 0.15)).toFixed(3));
  }

  public getAllConcepts(): CognitiveConcept[] {
    return Array.from(this.concepts.values());
  }

  public getAllRelations(): CognitiveRelation[] {
    return Array.from(this.relations.values());
  }

  public getAllAbstractions(): CognitiveAbstraction[] {
    return Array.from(this.abstractions.values());
  }

  public getAllGeneralizations(): CognitiveGeneralization[] {
    return Array.from(this.generalizations.values());
  }

  public getAllAnalogies(): CognitiveAnalogy[] {
    return Array.from(this.analogies.values());
  }

  public getEpistemicState(stateId: string): EpistemicState | undefined {
    return this.epistemicStates.get(stateId);
  }

  public async insertEvidence(evidence: Evidence): Promise<Evidence> {
    const validated = EvidenceSchema.parse(evidence);
    const frozen = freezeEvidence(validated);
    this.evidences.set(frozen.evidenceId, frozen);
    this.edg.addEvidence(frozen);
    await this.persistEntry(frozen.evidenceId, 'COGNITIVE_EVIDENCE', frozen, 1.0, []);
    return frozen;
  }

  public getEvidence(evidenceId: string): Evidence | undefined {
    return this.evidences.get(evidenceId);
  }

  public getAllEvidences(): Evidence[] {
    return Array.from(this.evidences.values());
  }

  public async insertDependency(candidate: EvidenceDependency): Promise<EvidenceDependency> {
    const inserted = this.edg.insertDependency(candidate);
    await this.persistEntry(
      inserted.dependencyId,
      'EVIDENCE_DEPENDENCY',
      inserted,
      inserted.confidence ?? 1.0,
      inserted.provenance
    );
    return inserted;
  }

  public getDependency(dependencyId: string): EvidenceDependency | undefined {
    return this.edg.getDependency(dependencyId);
  }

  public getDependencies(): EvidenceDependency[] {
    return this.edg.getAllDependencies();
  }

  public getDependenciesForEvidence(evidenceId: string): EvidenceDependency[] {
    return this.edg.getDependenciesForEvidence(evidenceId);
  }

  public getDependencyBetween(evidenceIdA: string, evidenceIdB: string): EvidenceDependency | undefined {
    return this.edg.getDependencyBetween(evidenceIdA, evidenceIdB);
  }

  public getEDG(): EvidenceDependencyGraph {
    return this.edg;
  }

  public async fuseEvidences(
    evidences: Array<AttributedEvidence | Evidence>,
    context: Context,
    options?: {
      targetRepresentationId?: string;
      baseRate?: number;
      fusionId?: string;
    }
  ): Promise<Readonly<EpistemicFusionResult>> {
    const fusionEngine = new EpistemicFusionEngine();
    const result = fusionEngine.fuse(evidences, context, this.edg, options);
    await this.insertEpistemicState(result.fusedState);
    return result;
  }

  public async insertEpistemicState(state: EpistemicState): Promise<EpistemicState> {
    const validated = EpistemicStateSchema.parse(state);
    this.epistemicStates.set(validated.stateId, validated);
    await this.persistEntry(validated.stateId, 'EPISTEMIC_STATE', validated, validated.rawConfidence || 0, []);
    return validated;
  }

  /**
   * P7.0 Step 6: Cognitive State Transition Execution
   * 
   * Deterministically transitions a cognitive representation's epistemic state:
   * S(t+1) = Transition(S(t), E(t), F(t), C(t))
   */
  public async transitionRepresentationState(
    targetRepresentationId: string,
    evidences: Array<AttributedEvidence | Evidence>,
    context: Context,
    options?: {
      explicitVerification?: {
        status: RepresentationVerificationStatus;
        verifiedBy?: string;
        proof?: string;
      };
      trigger?: EpistemicTransitionTrigger;
      reason?: string;
      customStateId?: string;
      customTransitionId?: string;
      deterministicTimestamp?: string;
      fusionResult?: EpistemicFusionResult;
    }
  ): Promise<{
    nextState: Readonly<EpistemicState>;
    transitionRecord: Readonly<CognitiveTransitionRecord>;
    fusionResult?: Readonly<EpistemicFusionResult>;
  }> {
    // 1. Locate previous epistemic state for target representation in this context
    const previousState = this.getEpistemicStateForRepresentation(
      targetRepresentationId,
      context.contextId
    );

    // 2. Execute deterministic transition via transition engine
    const output = this.transitionEngine.transition({
      targetRepresentationId,
      previousState,
      evidences,
      fusionResult: options?.fusionResult,
      context,
      edg: this.edg,
      explicitVerification: options?.explicitVerification,
      trigger: options?.trigger,
      reason: options?.reason,
      customStateId: options?.customStateId,
      customTransitionId: options?.customTransitionId,
      deterministicTimestamp: options?.deterministicTimestamp
    });

    // 3. Persist new epistemic state
    await this.insertEpistemicState(output.nextState);

    // 4. Record and persist transition record
    this.transitions.set(output.transitionRecord.transitionId, output.transitionRecord);
    await this.persistEntry(
      output.transitionRecord.transitionId,
      'COGNITIVE_STATE_TRANSITION',
      output.transitionRecord,
      1.0,
      [this.cellId]
    );

    // 5. Index representation to state in this context
    this.repEpistemicIndex.set(
      `${targetRepresentationId}::${context.contextId}`,
      output.nextState.stateId
    );

    // 6. Update structural representation in the graph
    await this.updateRepresentationEpistemicBinding(
      targetRepresentationId,
      output.nextState.stateId,
      output.nextState.verificationStatus,
      output.nextState.rawConfidence
    );

    return output;
  }

  private async updateRepresentationEpistemicBinding(
    representationId: string,
    stateId: string,
    verificationStatus: RepresentationVerificationStatus,
    confidence?: number
  ): Promise<void> {
    const concept = this.concepts.get(representationId);
    if (concept) {
      concept.epistemicStateId = stateId;
      concept.verificationStatus = verificationStatus;
      if (confidence !== undefined) concept.confidence = confidence;
      await this.persistEntry(concept.conceptId, 'COGNITIVE_CONCEPT', concept, concept.confidence, concept.provenance);
      return;
    }

    const relation = this.relations.get(representationId);
    if (relation) {
      relation.epistemicStateId = stateId;
      relation.verificationStatus = verificationStatus;
      if (confidence !== undefined) relation.confidence = confidence;
      await this.persistEntry(relation.relationId, 'COGNITIVE_RELATION', relation, relation.confidence, relation.provenance);
      return;
    }

    const abstraction = this.abstractions.get(representationId);
    if (abstraction) {
      abstraction.epistemicStateId = stateId;
      abstraction.verificationStatus = verificationStatus;
      if (confidence !== undefined) abstraction.confidence = confidence;
      await this.persistEntry(abstraction.abstractionId, 'COGNITIVE_ABSTRACTION', abstraction, abstraction.confidence, abstraction.provenance);
      return;
    }

    const generalization = this.generalizations.get(representationId);
    if (generalization) {
      generalization.epistemicStateId = stateId;
      generalization.verificationStatus = verificationStatus;
      if (confidence !== undefined) generalization.confidence = confidence;
      await this.persistEntry(generalization.generalizationId, 'COGNITIVE_GENERALIZATION', generalization, generalization.confidence, generalization.provenance);
      return;
    }

    const analogy = this.analogies.get(representationId);
    if (analogy) {
      analogy.epistemicStateId = stateId;
      analogy.verificationStatus = verificationStatus;
      if (confidence !== undefined) analogy.confidence = confidence;
      await this.persistEntry(analogy.analogyId, 'COGNITIVE_ANALOGY', analogy, analogy.confidence, analogy.provenance);
      return;
    }
  }

  public getTransition(transitionId: string): CognitiveTransitionRecord | undefined {
    return this.transitions.get(transitionId);
  }

  public getAllTransitions(): CognitiveTransitionRecord[] {
    return Array.from(this.transitions.values());
  }

  public getTransitionsForRepresentation(targetRepresentationId: string): CognitiveTransitionRecord[] {
    return Array.from(this.transitions.values()).filter(
      t => t.targetRepresentationId === targetRepresentationId
    );
  }

  public getEpistemicStateForRepresentation(
    representationId: string,
    contextId?: string
  ): EpistemicState | undefined {
    if (contextId) {
      const indexedStateId = this.repEpistemicIndex.get(`${representationId}::${contextId}`);
      if (indexedStateId) {
        return this.epistemicStates.get(indexedStateId);
      }
    }

    const rep =
      this.concepts.get(representationId) ||
      this.relations.get(representationId) ||
      this.abstractions.get(representationId) ||
      this.generalizations.get(representationId) ||
      this.analogies.get(representationId);

    if (rep && (rep as any).epistemicStateId) {
      const state = this.epistemicStates.get((rep as any).epistemicStateId);
      if (state && (!contextId || state.context.contextId === contextId)) {
        return state;
      }
    }

    const transitions = this.getTransitionsForRepresentation(representationId);
    if (transitions.length > 0) {
      const filtered = contextId
        ? transitions.filter(t => t.context.contextId === contextId)
        : transitions;
      if (filtered.length > 0) {
        const latest = filtered[filtered.length - 1];
        return this.epistemicStates.get(latest.nextStateId);
      }
    }

    return undefined;
  }

  public getTransitionEngine(): CognitiveStateTransitionEngine {
    return this.transitionEngine;
  }

  public getAllConflicts(): CognitiveRelation[] {
    return this.getAllRelations().filter(r => r.predicate === CognitiveRelationPredicate.CONTRADICTS);
  }

  public getStats() {
    return {
      concepts: this.concepts.size,
      relations: this.relations.size,
      abstractions: this.abstractions.size,
      generalizations: this.generalizations.size,
      analogies: this.analogies.size,
      epistemicStates: this.epistemicStates.size,
      evidences: this.evidences.size,
      dependencies: this.edg.getAllDependencies().length,
      transitions: this.transitions.size
    };
  }

  /**
   * Restores or loads graph state from MemoryStore.
   */
  public async load(): Promise<void> {
    return this.restore();
  }

  public async restore(): Promise<void> {
    try {
      const entries = await this.memory.search({
        category: MemoryCategory.SEMANTIC
      });

      // Sort entries so COGNITIVE_EVIDENCE is restored before EVIDENCE_DEPENDENCY
      const priority = (type?: string) => (type === 'EVIDENCE_DEPENDENCY' ? 2 : 1);
      const sortedEntries = [...entries].sort((a, b) => priority(a.type) - priority(b.type));

      for (const entry of sortedEntries) {
        if (!entry.content) continue;
        switch (entry.type) {
          case 'COGNITIVE_CONCEPT': {
            const parsed = CognitiveConceptSchema.safeParse(entry.content);
            if (parsed.success) {
              this.concepts.set(parsed.data.conceptId, parsed.data);
            }
            break;
          }
          case 'COGNITIVE_RELATION': {
            const parsed = CognitiveRelationSchema.safeParse(entry.content);
            if (parsed.success) {
              const rel = parsed.data;
              this.relations.set(rel.relationId, rel);
              if (!this.outgoingRelations.has(rel.subjectConceptId)) {
                this.outgoingRelations.set(rel.subjectConceptId, new Set());
              }
              this.outgoingRelations.get(rel.subjectConceptId)!.add(rel.relationId);
              if (!this.incomingRelations.has(rel.objectConceptId)) {
                this.incomingRelations.set(rel.objectConceptId, new Set());
              }
              this.incomingRelations.get(rel.objectConceptId)!.add(rel.relationId);
            }
            break;
          }
          case 'COGNITIVE_ABSTRACTION': {
            const parsed = CognitiveAbstractionSchema.safeParse(entry.content);
            if (parsed.success) {
              this.abstractions.set(parsed.data.abstractionId, parsed.data);
            }
            break;
          }
          case 'COGNITIVE_GENERALIZATION': {
            const parsed = CognitiveGeneralizationSchema.safeParse(entry.content);
            if (parsed.success) {
              this.generalizations.set(parsed.data.generalizationId, parsed.data);
            }
            break;
          }
          case 'COGNITIVE_ANALOGY': {
            const parsed = CognitiveAnalogySchema.safeParse(entry.content);
            if (parsed.success) {
              this.analogies.set(parsed.data.analogyId, parsed.data);
            }
            break;
          }
          case 'COGNITIVE_EVIDENCE': {
            const parsed = EvidenceSchema.safeParse(entry.content);
            if (parsed.success) {
              const frozen = freezeEvidence(parsed.data);
              this.evidences.set(frozen.evidenceId, frozen);
              this.edg.addEvidence(frozen);
            }
            break;
          }
          case 'EVIDENCE_DEPENDENCY': {
            const parsed = EvidenceDependencySchema.safeParse(entry.content);
            if (parsed.success) {
              try {
                this.edg.insertDependency(parsed.data);
              } catch {
                // Ignore corrupted or dangling dependencies on reload
              }
            }
            break;
          }
          case 'EPISTEMIC_STATE': {
            const parsed = EpistemicStateSchema.safeParse(entry.content);
            if (parsed.success) {
              this.epistemicStates.set(parsed.data.stateId, parsed.data);
            }
            break;
          }
          case 'COGNITIVE_STATE_TRANSITION': {
            const parsed = CognitiveTransitionRecordSchema.safeParse(entry.content);
            if (parsed.success) {
              const frozen = freezeTransitionRecord(parsed.data);
              this.transitions.set(frozen.transitionId, frozen);
              this.repEpistemicIndex.set(
                `${frozen.targetRepresentationId}::${frozen.context.contextId}`,
                frozen.nextStateId
              );
            }
            break;
          }
        }
      }

      logger.info(this.component, 'cognitive_graph_restored', {
        cellId: this.cellId,
        ...this.getStats()
      });
    } catch (err) {
      logger.warn(this.component, 'cognitive_graph_restore_failed', { err });
    }
  }

  /**
   * Helper to persist an entry to MemoryStore enforcing isolation and provenance.
   */
  private async persistEntry(
    id: string,
    type: string,
    content: any,
    confidence: number,
    provenance: string[]
  ): Promise<void> {
    const memoryEntry: MemoryEntry = {
      id,
      cellId: this.cellId,
      category: MemoryCategory.SEMANTIC,
      type,
      content,
      source: 'cognitive_graph',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence,
      hash: '',
      provenance,
      version: 1
    };

    await this.memory.put(memoryEntry);
  }
}
