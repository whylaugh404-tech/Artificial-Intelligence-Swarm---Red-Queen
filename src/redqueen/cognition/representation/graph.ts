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
  DEFAULT_REPRESENTATION_BUDGET
} from './types';
import { InformationCategory } from '../../metabolism/types';
import { v4 as uuidv4 } from 'uuid';

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
   */
  public async insertAbstraction(candidate: CognitiveAbstraction): Promise<CognitiveAbstraction> {
    const validated = CognitiveAbstractionSchema.parse(candidate);
    this.abstractions.set(validated.abstractionId, validated);

    // Also link abstraction to source concepts via GENERALIZES relation if not present
    for (const sourceId of validated.sourceConceptIds) {
      if (this.concepts.has(sourceId)) {
        await this.insertRelation({
          relationId: `rel_abs_${uuidv4()}`,
          subjectConceptId: validated.sourceConceptIds[0],
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
   * Updates status to CONTRADICTED and records a CONTRADICTS relation.
   */
  public async preserveConflict(
    conceptIdA: string,
    conceptIdB: string,
    reason: string
  ): Promise<CognitiveRelation> {
    const conceptA = this.concepts.get(conceptIdA);
    const conceptB = this.concepts.get(conceptIdB);

    if (conceptA) {
      conceptA.verificationStatus = RepresentationVerificationStatus.CONTRADICTED;
      await this.persistEntry(conceptA.conceptId, 'COGNITIVE_CONCEPT', conceptA, conceptA.confidence, conceptA.provenance);
    }
    if (conceptB) {
      conceptB.verificationStatus = RepresentationVerificationStatus.CONTRADICTED;
      await this.persistEntry(conceptB.conceptId, 'COGNITIVE_CONCEPT', conceptB, conceptB.confidence, conceptB.provenance);
    }

    const conflictRelation: CognitiveRelation = {
      relationId: `rel_conflict_${uuidv4()}`,
      subjectConceptId: conceptIdA,
      predicate: CognitiveRelationPredicate.CONTRADICTS,
      objectConceptId: conceptIdB,
      confidence: 1.0,
      provenance: [this.cellId],
      verificationStatus: RepresentationVerificationStatus.CONTRADICTED,
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

  public getAllConflicts(): CognitiveRelation[] {
    return this.getAllRelations().filter(r => r.predicate === CognitiveRelationPredicate.CONTRADICTS);
  }

  public getStats() {
    return {
      concepts: this.concepts.size,
      relations: this.relations.size,
      abstractions: this.abstractions.size,
      generalizations: this.generalizations.size,
      analogies: this.analogies.size
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

      for (const entry of entries) {
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
