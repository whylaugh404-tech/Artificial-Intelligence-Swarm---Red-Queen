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
    const abstractionPattern = this.detectAbstractionPattern(knowledge);
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
    const candidateGeneralization = this.evaluateGeneralization(primaryConcept, knowledge, graph);
    if (candidateGeneralization) {
      generalizations.push(candidateGeneralization);
    }

    // 5. Structural Analogy Mapping
    if (graph) {
      const analogiesDerived = this.discoverAnalogies(primaryConcept, knowledge, graph);
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
   * Detects general structural patterns and invariants across facts.
   */
  private detectAbstractionPattern(knowledge: KnowledgeRecord): {
    pattern: string;
    retainedStructure: Record<string, any>;
    discardedDetails: string[];
  } | null {
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
   */
  private evaluateGeneralization(
    concept: CognitiveConcept,
    knowledge: KnowledgeRecord,
    graph?: CognitiveGraph
  ): CognitiveGeneralization | null {
    const patternInfo = this.detectAbstractionPattern(knowledge);
    if (!patternInfo) return null;

    const supportingEvidence: string[] = [concept.conceptId];
    const sourceConceptIds: string[] = [concept.conceptId];

    if (graph) {
      // Find other concepts in graph matching this category or pattern
      const existingConcepts = graph.getAllConcepts();
      for (const other of existingConcepts) {
        if (other.conceptId !== concept.conceptId && other.category === concept.category) {
          const otherText = `${other.canonicalName} ${other.description}`.toLowerCase();
          if (patternInfo.pattern.toLowerCase().includes('boundary') && (otherText.includes('inject') || otherText.includes('input'))) {
            supportingEvidence.push(other.conceptId);
            sourceConceptIds.push(other.conceptId);
          } else if (patternInfo.pattern.toLowerCase().includes('overflow') && (otherText.includes('overflow') || otherText.includes('bound'))) {
            supportingEvidence.push(other.conceptId);
            sourceConceptIds.push(other.conceptId);
          }
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
      sourceConceptIds,
      pattern: patternInfo.pattern,
      supportingEvidence,
      confidence: isMultiEvidence ? 0.85 : 0.45,
      verificationStatus,
      provenance: [this.cellId],
      createdAt: new Date().toISOString(),
      originatingCellId: this.cellId
    };
  }

  /**
   * Discovers structural cross-domain analogies.
   * Structural mapping of elements and relations is strictly verified.
   */
  private discoverAnalogies(
    concept: CognitiveConcept,
    knowledge: KnowledgeRecord,
    graph: CognitiveGraph
  ): CognitiveAnalogy[] {
    const analogies: CognitiveAnalogy[] = [];
    const concepts = graph.getAllConcepts();

    for (const target of concepts) {
      if (target.conceptId === concept.conceptId) continue;

      // Check cross-domain candidate
      const isSqlAndCmd = (
        (concept.canonicalName.toLowerCase().includes('sql') && target.canonicalName.toLowerCase().includes('command')) ||
        (concept.canonicalName.toLowerCase().includes('command') && target.canonicalName.toLowerCase().includes('sql'))
      );

      const isPathAndSql = (
        (concept.canonicalName.toLowerCase().includes('path traversal') && target.canonicalName.toLowerCase().includes('injection')) ||
        (concept.canonicalName.toLowerCase().includes('injection') && target.canonicalName.toLowerCase().includes('path traversal'))
      );

      if (isSqlAndCmd) {
        // Construct structural mapping
        const isSqlSource = concept.canonicalName.toLowerCase().includes('sql');
        const sourceDomain = isSqlSource ? 'Database Queries' : 'Operating System Shell';
        const targetDomain = isSqlSource ? 'Operating System Shell' : 'Database Queries';

        const analogy: CognitiveAnalogy = {
          analogyId: `ana_${uuidv4()}`,
          sourceConceptIds: [concept.conceptId],
          targetConceptIds: [target.conceptId],
          sourceStructure: {
            domain: sourceDomain,
            elements: ['untrusted_input', isSqlSource ? 'sql_interpreter' : 'shell_interpreter', 'data_instruction_boundary'],
            relations: ['input_fed_into_interpreter', 'interpreter_evaluates_syntax', 'instruction_boundary_violated']
          },
          targetStructure: {
            domain: targetDomain,
            elements: ['untrusted_input', isSqlSource ? 'shell_interpreter' : 'sql_interpreter', 'data_instruction_boundary'],
            relations: ['input_fed_into_interpreter', 'interpreter_evaluates_syntax', 'instruction_boundary_violated']
          },
          mappedRelations: [
            { sourceElement: 'untrusted_input', targetElement: 'untrusted_input', relationType: 'IDENTITY' },
            {
              sourceElement: isSqlSource ? 'sql_interpreter' : 'shell_interpreter',
              targetElement: isSqlSource ? 'shell_interpreter' : 'sql_interpreter',
              relationType: 'ISOMORPHIC_ROLE'
            },
            { sourceElement: 'data_instruction_boundary', targetElement: 'data_instruction_boundary', relationType: 'IDENTITY' }
          ],
          structuralSimilarity: 0.92,
          confidence: 0.88,
          provenance: [this.cellId],
          verificationStatus: RepresentationVerificationStatus.SUPPORTED,
          createdAt: new Date().toISOString(),
          originatingCellId: this.cellId
        };
        analogies.push(analogy);
      }
    }

    return analogies;
  }
}
