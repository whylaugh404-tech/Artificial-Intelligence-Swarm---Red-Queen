import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../core/logger';
import { KnowledgeRecord, Experience, InformationCategory } from '../../metabolism/types';
import {
  CognitiveConcept,
  CognitiveRelation,
  CognitiveRelationPredicate,
  CognitiveAbstraction,
  CognitiveGeneralization,
  CognitiveAnalogy,
  RepresentationVerificationStatus,
  CognitiveRepresentationBudget,
  DEFAULT_REPRESENTATION_BUDGET
} from './types';
import { CognitiveGraph } from './graph';

export interface ExtractedRepresentation {
  readonly concepts: CognitiveConcept[];
  readonly relations: CognitiveRelation[];
  readonly abstractions: CognitiveAbstraction[];
  readonly generalizations: CognitiveGeneralization[];
  readonly analogies: CognitiveAnalogy[];
}

/**
 * Normalizes string predicate to standard CognitiveRelationPredicate.
 */
export function normalizePredicate(predicateStr: string): CognitiveRelationPredicate {
  const upper = predicateStr.trim().toUpperCase().replace(/[-\s]/g, '_');
  if (Object.values(CognitiveRelationPredicate).includes(upper as CognitiveRelationPredicate)) {
    return upper as CognitiveRelationPredicate;
  }
  if (upper.includes('CAUSE')) return CognitiveRelationPredicate.CAUSES;
  if (upper.includes('REQUIRE')) return CognitiveRelationPredicate.REQUIRES;
  if (upper.includes('DEPEND')) return CognitiveRelationPredicate.DEPENDS_ON;
  if (upper.includes('SUPPORT')) return CognitiveRelationPredicate.SUPPORTS;
  if (upper.includes('CONFLICT') || upper.includes('CONTRADICT')) return CognitiveRelationPredicate.CONTRADICTS;
  if (upper.includes('SIMILAR')) return CognitiveRelationPredicate.SIMILAR_TO;
  if (upper.includes('INSTANCE')) return CognitiveRelationPredicate.INSTANCE_OF;
  if (upper.includes('PART')) return CognitiveRelationPredicate.PART_OF;
  if (upper.includes('GENERAL')) return CognitiveRelationPredicate.GENERALIZES;
  if (upper.includes('SPECIAL')) return CognitiveRelationPredicate.SPECIALIZES;
  if (upper.includes('ANALOG')) return CognitiveRelationPredicate.ANALOGOUS_TO;
  if (upper.includes('DERIVE')) return CognitiveRelationPredicate.DERIVED_FROM;
  return CognitiveRelationPredicate.RELATED_TO;
}

/**
 * Substrate engine that turns Knowledge and Experience into explicit Cognitive Representations.
 * 
 * Separates:
 * - Knowledge confidence (factual confidence)
 * - Representation confidence (structural pattern confidence)
 * - Operational confidence (cell health/execution state)
 */
export class CognitiveRepresentationEngine {
  private readonly component = 'representation_engine';
  private readonly budget: CognitiveRepresentationBudget;

  constructor(
    public readonly cellId: string,
    budget?: Partial<CognitiveRepresentationBudget>
  ) {
    this.budget = Object.freeze({
      ...DEFAULT_REPRESENTATION_BUDGET,
      ...(budget || {})
    });
  }

  /**
   * Derives concepts, relations, abstractions, generalizations, and analogies from a KnowledgeRecord.
   */
  public async extractRepresentations(
    knowledge: KnowledgeRecord,
    experience?: Experience,
    graph?: CognitiveGraph
  ): Promise<ExtractedRepresentation> {
    const concepts: CognitiveConcept[] = [];
    const relations: CognitiveRelation[] = [];
    const abstractions: CognitiveAbstraction[] = [];
    const generalizations: CognitiveGeneralization[] = [];
    const analogies: CognitiveAnalogy[] = [];

    const now = new Date().toISOString();
    const rawProvenance = knowledge.sourceProvenance || (knowledge as any).provenance || [];
    const provenanceTrail = Array.from(new Set([
      this.cellId,
      ...(Array.isArray(rawProvenance)
        ? rawProvenance.map((p: any) => typeof p === 'string' ? p : p.sourceIdentifier || p.cellId || '')
        : [])
    ])).filter(Boolean);

    const factsList = knowledge.facts || [];
    const relsList = knowledge.relationships || [];

    // 1. Primary Concept Formation
    // Representation confidence is derived from structural facts completeness & knowledge confidence
    const representationConfidence = Math.min(
      0.95,
      Number(((knowledge.confidence * 0.7) + (Math.min(factsList.length, 5) * 0.05)).toFixed(3))
    );

    const primaryConceptId = `concept_${uuidv4()}`;
    const primaryConcept: CognitiveConcept = {
      conceptId: primaryConceptId,
      canonicalName: knowledge.title,
      description: knowledge.summary || knowledge.title,
      category: knowledge.category,
      sourceKnowledgeIds: [knowledge.knowledgeId],
      sourceExperienceIds: experience ? [experience.experienceId] : [],
      originatingCellId: this.cellId,
      confidence: representationConfidence,
      verificationStatus: RepresentationVerificationStatus.SUPPORTED,
      createdAt: now,
      updatedAt: now,
      version: 1,
      provenance: provenanceTrail,
      metadata: {
        factsCount: factsList.length,
        reinforcementCount: knowledge.reinforcementCount || 0
      }
    };
    concepts.push(primaryConcept);

    // Secondary concepts from extractedData.coreConcepts if present
    const extConcepts = (knowledge as any).extractedData?.coreConcepts;
    if (Array.isArray(extConcepts)) {
      for (const coreName of extConcepts) {
        if (typeof coreName === 'string' && coreName.trim() && !concepts.some(c => c.canonicalName.toLowerCase() === coreName.toLowerCase())) {
          concepts.push({
            conceptId: `concept_${uuidv4()}`,
            canonicalName: coreName.trim(),
            description: `Core concept derived from ${knowledge.title}`,
            category: knowledge.category,
            sourceKnowledgeIds: [knowledge.knowledgeId],
            sourceExperienceIds: experience ? [experience.experienceId] : [],
            originatingCellId: this.cellId,
            confidence: Number((representationConfidence * 0.9).toFixed(3)),
            verificationStatus: RepresentationVerificationStatus.SUPPORTED,
            createdAt: now,
            updatedAt: now,
            version: 1,
            provenance: provenanceTrail,
            metadata: {}
          });
        }
      }
    }

    // 2. Secondary Concepts & Typed Relations from Knowledge Relationships
    for (const rel of relsList.slice(0, this.budget.maxRelationsPerTransaction)) {
      const targetConceptName = rel.object.trim();
      let targetConceptId = `concept_${uuidv4()}`;

      // Check if target concept already exists in graph
      if (graph) {
        const existingTarget = graph.findConceptByName(targetConceptName);
        if (existingTarget) {
          targetConceptId = existingTarget.conceptId;
        }
      }

      // If target is new, instantiate it
      if (targetConceptId.startsWith('concept_') && !concepts.some(c => c.canonicalName.toLowerCase() === targetConceptName.toLowerCase())) {
        const secondaryConcept: CognitiveConcept = {
          conceptId: targetConceptId,
          canonicalName: targetConceptName,
          description: `Related entity in relation '${rel.predicate}' with ${knowledge.title}`,
          category: knowledge.category,
          sourceKnowledgeIds: [knowledge.knowledgeId],
          sourceExperienceIds: experience ? [experience.experienceId] : [],
          originatingCellId: this.cellId,
          confidence: Number((representationConfidence * 0.85).toFixed(3)),
          verificationStatus: RepresentationVerificationStatus.PENDING,
          createdAt: now,
          updatedAt: now,
          version: 1,
          provenance: provenanceTrail,
          metadata: {}
        };
        concepts.push(secondaryConcept);
      }

      const relationPredicate = normalizePredicate(rel.predicate);
      const cognitiveRel: CognitiveRelation = {
        relationId: `rel_${uuidv4()}`,
        subjectConceptId: primaryConcept.conceptId,
        predicate: relationPredicate,
        objectConceptId: targetConceptId,
        confidence: Number((rel.confidence || representationConfidence).toFixed(3)),
        provenance: provenanceTrail,
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        createdAt: now,
        originatingCellId: this.cellId,
        metadata: { originalPredicate: rel.predicate }
      };
      relations.push(cognitiveRel);
    }

    // 3. Abstraction Derivation
    const abstractionPattern = this.detectAbstractionPattern(knowledge, relations, graph);
    if (abstractionPattern) {
      const abstraction: CognitiveAbstraction = {
        abstractionId: `abs_${uuidv4()}`,
        sourceConceptIds: [primaryConcept.conceptId],
        generalizedPattern: abstractionPattern.pattern,
        retainedStructure: abstractionPattern.retainedStructure,
        discardedDetails: abstractionPattern.discardedDetails,
        confidence: Number((representationConfidence * 0.9).toFixed(3)),
        provenance: provenanceTrail,
        originatingCellId: this.cellId,
        verificationStatus: RepresentationVerificationStatus.SUPPORTED,
        version: 1,
        createdAt: now
      };
      abstractions.push(abstraction);
    }

    // 4. Generalization Derivation
    // Examine if there is multi-concept evidence in the graph or single evidence candidate
    const candidateGeneralization = this.evaluateGeneralization(primaryConcept, knowledge, graph, relations);
    if (candidateGeneralization) {
      generalizations.push(candidateGeneralization);
    }

    // 5. Structural Analogy Mapping
    if (graph) {
      const analogiesDerived = this.discoverAnalogies(primaryConcept, knowledge, graph, relations);
      analogies.push(...analogiesDerived);
    }

    logger.debug(this.component, 'representations_extracted', {
      cellId: this.cellId,
      knowledgeId: knowledge.knowledgeId,
      concepts: concepts.length,
      relations: relations.length,
      abstractions: abstractions.length,
      generalizations: generalizations.length,
      analogies: analogies.length
    });

    return {
      concepts,
      relations,
      abstractions,
      generalizations,
      analogies
    };
  }

  /**
   * Detects general structural patterns and invariants across relations and facts.
   * Prioritizes relational and topological invariants over lexical keywords.
   */
  private detectAbstractionPattern(
    knowledge: KnowledgeRecord,
    extractedRelations?: CognitiveRelation[],
    graph?: CognitiveGraph
  ): {
    pattern: string;
    retainedStructure: Record<string, any>;
    discardedDetails: string[];
  } | null {
    // 1. Structural Predicate Invariants (Domain-independent)
    if (extractedRelations && extractedRelations.length > 0) {
      const predicates = extractedRelations.map(r => r.predicate);

      if (predicates.includes(CognitiveRelationPredicate.PART_OF)) {
        return {
          pattern: 'Compositional hierarchy: subsystem components structured as integral constituents of a higher-order system',
          retainedStructure: {
            relationship: CognitiveRelationPredicate.PART_OF,
            invariant: 'compositional_hierarchy'
          },
          discardedDetails: ['component implementation specifics', 'substrate physical properties']
        };
      }

      if (predicates.includes(CognitiveRelationPredicate.CAUSES)) {
        return {
          pattern: 'Causal propagation invariant: antecedent events or states induce deterministic systemic consequences',
          retainedStructure: {
            relationship: CognitiveRelationPredicate.CAUSES,
            invariant: 'causal_chain'
          },
          discardedDetails: ['intermediate timing latency', 'carrier medium']
        };
      }

      if (predicates.includes(CognitiveRelationPredicate.REQUIRES) || predicates.includes(CognitiveRelationPredicate.DEPENDS_ON)) {
        return {
          pattern: 'Prerequisite dependency constraint: operational transition conditioned upon prior satisfaction of invariants',
          retainedStructure: {
            relationship: CognitiveRelationPredicate.REQUIRES,
            invariant: 'precondition_constraint'
          },
          discardedDetails: ['runtime scheduling mechanism', 'resource allocation format']
        };
      }
    }

    // 2. Semantic Heuristics (Supplementary / fallback)
    const factsText = Array.isArray(knowledge.facts) ? knowledge.facts.join(' ') : '';
    const text = `${knowledge.title || ''} ${knowledge.summary || ''} ${factsText}`.toLowerCase();

    if (text.includes('consensus') || text.includes('byzantine') || text.includes('quorum') || text.includes('fault tolerance')) {
      return {
        pattern: 'Distributed multi-party agreement under asynchronous and adversarial conditions',
        retainedStructure: {
          mechanism: 'distributed_consensus',
          fault_model: 'byzantine_or_crash'
        },
        discardedDetails: ['transport protocol', 'node implementation specifics']
      };
    }

    if (text.includes('inject') || text.includes('untrusted input') || text.includes('boundary')) {
      return {
        pattern: 'Untrusted input crossing an instruction/data boundary without strict parsing or sanitization',
        retainedStructure: {
          mechanism: 'boundary_violation',
          actor: 'untrusted_input',
          sink: 'interpreter_or_executor'
        },
        discardedDetails: ['specific programming language', 'database dialect', 'runtime environment']
      };
    }

    if (text.includes('overflow') || text.includes('bound') || text.includes('buffer')) {
      return {
        pattern: 'Write or read operation exceeding allocated memory or resource boundary',
        retainedStructure: {
          mechanism: 'resource_boundary_exceeded',
          constraint: 'finite_allocation'
        },
        discardedDetails: ['architecture specifics', 'variable identifiers']
      };
    }

    if (text.includes('traversal') || text.includes('path') || text.includes('escape')) {
      return {
        pattern: 'Hierarchical scope breakout via unconstrained path or directory resolution',
        retainedStructure: {
          mechanism: 'hierarchical_escape',
          constraint: 'rooted_filesystem'
        },
        discardedDetails: ['operating system directory separator']
      };
    }

    if (text.includes('authentication') || text.includes('credential') || text.includes('identity')) {
      return {
        pattern: 'Verification of principal identity against authoritative proof prior to granting access',
        retainedStructure: {
          mechanism: 'access_control_verification',
          prerequisite: 'identity_proof'
        },
        discardedDetails: ['hash algorithm', 'token serialization format']
      };
    }

    return null;
  }

  /**
   * Evaluates generalization candidate with strict evidence tracking.
   * If only 1 evidence exists, verificationStatus must be PENDING (hypothesis).
   * Uses structural signatures / relational patterns rather than hardcoded keywords.
   */
  private evaluateGeneralization(
    concept: CognitiveConcept,
    knowledge: KnowledgeRecord,
    graph?: CognitiveGraph,
    extractedRelations?: CognitiveRelation[]
  ): CognitiveGeneralization | null {
    const patternInfo = this.detectAbstractionPattern(knowledge, extractedRelations, graph);
    if (!patternInfo) return null;

    const supportingEvidence: string[] = [concept.conceptId];
    const sourceConceptIds: string[] = [concept.conceptId];

    if (graph) {
      const existingConcepts = graph.getAllConcepts();
      const currentSig = graph.computeStructuralSignature(concept.conceptId);

      for (const other of existingConcepts) {
        if (other.conceptId === concept.conceptId) continue;

        // Check structural signature similarity if available
        if (currentSig) {
          const otherSig = graph.computeStructuralSignature(other.conceptId);
          if (otherSig) {
            const sharedOut = currentSig.outgoingPredicates.filter(p => otherSig.outgoingPredicates.includes(p));
            const sharedIn = currentSig.incomingPredicates.filter(p => otherSig.incomingPredicates.includes(p));
            if (sharedOut.length > 0 || sharedIn.length > 0) {
              supportingEvidence.push(other.conceptId);
              sourceConceptIds.push(other.conceptId);
              continue;
            }
          }
        }

        // Match category & pattern compatibility
        if (other.category === concept.category) {
          supportingEvidence.push(other.conceptId);
          sourceConceptIds.push(other.conceptId);
        }
      }
    }

    // Strict Rule: If evidence <= 1, it is a CANDIDATE/HYPOTHESIS (PENDING), NOT established.
    const isMultiEvidence = supportingEvidence.length > 1;
    const verificationStatus = isMultiEvidence
      ? RepresentationVerificationStatus.SUPPORTED
      : RepresentationVerificationStatus.PENDING;

    return {
      generalizationId: `gen_${uuidv4()}`,
      sourceConceptIds: Array.from(new Set(sourceConceptIds)),
      pattern: patternInfo.pattern,
      supportingEvidence: Array.from(new Set(supportingEvidence)),
      confidence: isMultiEvidence
        ? Math.min(0.92, Number((0.5 + (supportingEvidence.length * 0.12)).toFixed(3)))
        : 0.45,
      verificationStatus,
      provenance: [this.cellId],
      createdAt: new Date().toISOString(),
      originatingCellId: this.cellId
    };
  }

  /**
   * Discovers structural cross-domain analogies.
   * Aligns source structure and target structure through isomorphic relational mapping.
   * Calculates dynamic structural similarity and confidence from topology.
   * Pure lexical similarity without structural relation mapping produces NO analogy.
   */
  private discoverAnalogies(
    concept: CognitiveConcept,
    knowledge: KnowledgeRecord,
    graph: CognitiveGraph,
    extractedRelations: CognitiveRelation[]
  ): CognitiveAnalogy[] {
    const analogies: CognitiveAnalogy[] = [];

    // Filter candidate targets using structural signatures
    const candidates = graph.findAnalogyCandidates(concept.conceptId, {
      maxCandidates: this.budget.maxAnalogyCandidates,
      minSimilarityThreshold: 0.2
    });

    const candidateTargets: Array<{ targetConceptId: string; signatureSimilarity: number }> = [...candidates];
    if (candidateTargets.length === 0) {
      for (const other of graph.getAllConcepts()) {
        if (other.conceptId !== concept.conceptId && other.category !== concept.category) {
          candidateTargets.push({ targetConceptId: other.conceptId, signatureSimilarity: 0.3 });
        }
      }
    }

    // Source relations for concept
    const sourceRels = [
      ...extractedRelations.filter(r => r.subjectConceptId === concept.conceptId || r.objectConceptId === concept.conceptId),
      ...graph.getRelationsForConcept(concept.conceptId)
    ];

    const uniqueSourceRels = Array.from(new Map(sourceRels.map(r => [r.relationId, r])).values());
    if (uniqueSourceRels.length === 0) {
      return []; // No relational structure = no analogy
    }

    for (const cand of candidateTargets.slice(0, this.budget.maxAnalogyCandidates)) {
      const target = graph.getConcept(cand.targetConceptId);
      if (!target || target.conceptId === concept.conceptId) continue;

      const targetRels = graph.getRelationsForConcept(target.conceptId);
      if (targetRels.length === 0) continue; // No target relations = no structure

      // Align relations based on isomorphic predicates
      const mappedRelations: Array<{ sourceElement: string; targetElement: string; relationType: string }> = [];
      const targetMatchedRelIds = new Set<string>();

      for (const sRel of uniqueSourceRels) {
        for (const tRel of targetRels) {
          if (targetMatchedRelIds.has(tRel.relationId)) continue;

          if (sRel.predicate === tRel.predicate) {
            targetMatchedRelIds.add(tRel.relationId);

            const srcOther = sRel.subjectConceptId === concept.conceptId ? sRel.objectConceptId : sRel.subjectConceptId;
            const tgtOther = tRel.subjectConceptId === target.conceptId ? tRel.objectConceptId : tRel.subjectConceptId;

            const srcOtherConcept = graph.getConcept(srcOther);
            const tgtOtherConcept = graph.getConcept(tgtOther);

            mappedRelations.push({
              sourceElement: srcOtherConcept ? srcOtherConcept.canonicalName : srcOther,
              targetElement: tgtOtherConcept ? tgtOtherConcept.canonicalName : tgtOther,
              relationType: sRel.predicate
            });
            break;
          }
        }
      }

      // Negative check: If NO structural relations mapped, reject candidate!
      if (mappedRelations.length === 0) {
        continue;
      }

      // Compute actual structural similarity from mapping coverage and topology
      const maxRelCount = Math.max(uniqueSourceRels.length, targetRels.length, 1);
      const coverage = mappedRelations.length / maxRelCount;
      const structuralSimilarity = Number(((coverage * 0.7) + (cand.signatureSimilarity * 0.3)).toFixed(3));

      if (structuralSimilarity < 0.25) {
        continue;
      }

      // Compute dynamic confidence
      const confidence = Number((Math.min(concept.confidence, target.confidence) * structuralSimilarity).toFixed(3));

      const sourceDomain = String(concept.category || 'SourceDomain');
      const targetDomain = String(target.category || 'TargetDomain');

      const sourceElementNames = [concept.canonicalName, ...mappedRelations.map(m => m.sourceElement)];
      const targetElementNames = [target.canonicalName, ...mappedRelations.map(m => m.targetElement)];

      const analogy: CognitiveAnalogy = {
        analogyId: `ana_${uuidv4()}`,
        sourceConceptIds: [concept.conceptId],
        targetConceptIds: [target.conceptId],
        sourceStructure: {
          domain: sourceDomain,
          elements: Array.from(new Set(sourceElementNames)),
          relations: uniqueSourceRels.map(r => `${r.predicate}`)
        },
        targetStructure: {
          domain: targetDomain,
          elements: Array.from(new Set(targetElementNames)),
          relations: targetRels.map(r => `${r.predicate}`)
        },
        mappedRelations,
        structuralSimilarity,
        confidence,
        provenance: [this.cellId],
        verificationStatus: (structuralSimilarity >= 0.75 && mappedRelations.length >= 2)
          ? RepresentationVerificationStatus.SUPPORTED
          : RepresentationVerificationStatus.PENDING,
        createdAt: new Date().toISOString(),
        originatingCellId: this.cellId
      };

      analogies.push(analogy);

      if (analogies.length >= this.budget.maxAnalogiesPerConcept) {
        break;
      }
    }

    return analogies;
  }
}
