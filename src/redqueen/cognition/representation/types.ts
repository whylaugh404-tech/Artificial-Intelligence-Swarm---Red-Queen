import { z } from 'zod';
import { InformationCategory, InformationCategorySchema } from '../../metabolism/types';

/**
 * P5.1: Cognitive Representation Foundation
 * 
 * Formal data models for explicit, verifiable, persistent, and reasoning-ready
 * cognitive representations on top of Knowledge and Experience.
 */

export enum RepresentationVerificationStatus {
  PENDING = 'PENDING',
  SUPPORTED = 'SUPPORTED',
  VERIFIED = 'VERIFIED',
  CONTRADICTED = 'CONTRADICTED',
  REJECTED = 'REJECTED'
}

export const RepresentationVerificationStatusSchema = z.nativeEnum(RepresentationVerificationStatus);

export enum CognitiveRelationPredicate {
  IS_A = 'IS_A',
  INSTANCE_OF = 'INSTANCE_OF',
  PART_OF = 'PART_OF',
  RELATED_TO = 'RELATED_TO',
  CAUSES = 'CAUSES',
  REQUIRES = 'REQUIRES',
  DEPENDS_ON = 'DEPENDS_ON',
  SUPPORTS = 'SUPPORTS',
  CONTRADICTS = 'CONTRADICTS',
  SIMILAR_TO = 'SIMILAR_TO',
  GENERALIZES = 'GENERALIZES',
  SPECIALIZES = 'SPECIALIZES',
  ANALOGOUS_TO = 'ANALOGOUS_TO',
  DERIVED_FROM = 'DERIVED_FROM'
}

export const CognitiveRelationPredicateSchema = z.nativeEnum(CognitiveRelationPredicate);

/**
 * Cognitive Concept Model
 * 
 * An explicit conceptual entity formed from one or more Knowledge records.
 * Must always be provenance-aware, versioned, and confidence-attributed.
 */
export const CognitiveConceptSchema = z.object({
  conceptId: z.string().min(1).max(256),
  canonicalName: z.string().min(1).max(256),
  description: z.string().min(1).max(4096),
  category: InformationCategorySchema,
  sourceKnowledgeIds: z.array(z.string().min(1)).min(1),
  sourceExperienceIds: z.array(z.string().min(1)).default([]),
  originatingCellId: z.string().min(1).max(256),
  confidence: z.number().min(0).max(1), // Explicit representation confidence
  verificationStatus: RepresentationVerificationStatusSchema,
  epistemicStateId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().min(1),
  provenance: z.array(z.string().min(1)).min(1),
  metadata: z.record(z.string(), z.any()).default({})
});

export type CognitiveConcept = z.infer<typeof CognitiveConceptSchema>;

/**
 * Cognitive Relation Model
 * 
 * Strongly-typed semantic link connecting two concepts within the cognitive graph.
 */
export const CognitiveRelationSchema = z.object({
  relationId: z.string().min(1).max(256),
  subjectConceptId: z.string().min(1).max(256),
  predicate: CognitiveRelationPredicateSchema,
  objectConceptId: z.string().min(1).max(256),
  confidence: z.number().min(0).max(1),
  provenance: z.array(z.string().min(1)).min(1),
  verificationStatus: RepresentationVerificationStatusSchema,
  epistemicStateId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  originatingCellId: z.string().min(1).max(256),
  metadata: z.record(z.string(), z.any()).default({})
});

export type CognitiveRelation = z.infer<typeof CognitiveRelationSchema>;

/**
 * Abstraction Model
 * 
 * General pattern representation discarding incidentals while retaining structural invariants.
 */
export const CognitiveAbstractionSchema = z.object({
  abstractionId: z.string().min(1).max(256),
  sourceConceptIds: z.array(z.string().min(1)).min(1),
  generalizedPattern: z.string().min(1).max(4096),
  retainedStructure: z.record(z.string(), z.any()),
  discardedDetails: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  provenance: z.array(z.string().min(1)).min(1),
  originatingCellId: z.string().min(1).max(256),
  verificationStatus: RepresentationVerificationStatusSchema,
  epistemicStateId: z.string().min(1).optional(),
  version: z.number().int().min(1),
  createdAt: z.string().datetime()
});

export type CognitiveAbstraction = z.infer<typeof CognitiveAbstractionSchema>;

/**
 * Generalization Model
 * 
 * General rule or pattern derived across instances.
 * If evidence count <= 1, it must be marked as PENDING (candidate/hypothesis), not verified.
 */
export const CognitiveGeneralizationSchema = z.object({
  generalizationId: z.string().min(1).max(256),
  sourceConceptIds: z.array(z.string().min(1)).min(1),
  pattern: z.string().min(1).max(4096),
  supportingEvidence: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  verificationStatus: RepresentationVerificationStatusSchema,
  epistemicStateId: z.string().min(1).optional(),
  provenance: z.array(z.string().min(1)).min(1),
  createdAt: z.string().datetime(),
  originatingCellId: z.string().min(1).max(256)
});

export type CognitiveGeneralization = z.infer<typeof CognitiveGeneralizationSchema>;

/**
 * Structural Analogy Model
 * 
 * Cross-domain structural alignment between concepts, mapped by structural relations.
 * Pure lexical similarity does not constitute an analogy.
 */
export const AnalogyDomainStructureSchema = z.object({
  domain: z.string().min(1).max(256),
  elements: z.array(z.string().min(1)),
  relations: z.array(z.string().min(1))
});

export type AnalogyDomainStructure = z.infer<typeof AnalogyDomainStructureSchema>;

export const MappedRelationSchema = z.object({
  sourceElement: z.string().min(1),
  targetElement: z.string().min(1),
  relationType: z.string().min(1)
});

export type MappedRelation = z.infer<typeof MappedRelationSchema>;

/**
 * Structural Signature Model
 * 
 * Compact, bounded topological fingerprint of a concept within its local graph neighborhood.
 * Used for fast candidate filtering in structural analogy and generalization discovery
 * without requiring exhaustive O(N^2) graph isomorphism tests.
 */
export const StructuralSignatureSchema = z.object({
  conceptId: z.string().min(1).max(256),
  category: InformationCategorySchema,
  inDegree: z.number().int().nonnegative(),
  outDegree: z.number().int().nonnegative(),
  incomingPredicates: z.array(CognitiveRelationPredicateSchema),
  outgoingPredicates: z.array(CognitiveRelationPredicateSchema),
  neighborCategories: z.array(InformationCategorySchema),
  localMotifs: z.array(z.string()).default([]),
  structuralHash: z.string().min(1),
  depth: z.number().int().min(1).max(5)
});

export type StructuralSignature = z.infer<typeof StructuralSignatureSchema>;

export const CognitiveAnalogySchema = z.object({
  analogyId: z.string().min(1).max(256),
  sourceConceptIds: z.array(z.string().min(1)).min(1),
  targetConceptIds: z.array(z.string().min(1)).min(1),
  sourceStructure: AnalogyDomainStructureSchema,
  targetStructure: AnalogyDomainStructureSchema,
  mappedRelations: z.array(MappedRelationSchema).min(1),
  structuralSimilarity: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  provenance: z.array(z.string().min(1)).min(1),
  verificationStatus: RepresentationVerificationStatusSchema,
  epistemicStateId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  originatingCellId: z.string().min(1).max(256)
});

export type CognitiveAnalogy = z.infer<typeof CognitiveAnalogySchema>;

/**
 * Defensive Runtime Budgets for Cognitive Representation
 */
export interface CognitiveRepresentationBudget {
  readonly maxConceptsPerTransaction: number;
  readonly maxRelationsPerTransaction: number;
  readonly maxRepresentationsPerCell: number;
  readonly maxGraphTraversalDepth: number;
  readonly maxAnalogiesPerConcept: number;
  readonly maxGeneralizationsPerConcept: number;
  readonly maxVisitedNodesTraversal: number;
  readonly traversalTimeoutMs: number;
  readonly maxStructuralSignatureDepth: number;
  readonly maxAnalogyCandidates: number;
}

export const DEFAULT_REPRESENTATION_BUDGET: CognitiveRepresentationBudget = {
  maxConceptsPerTransaction: 20,
  maxRelationsPerTransaction: 50,
  maxRepresentationsPerCell: 5000,
  maxGraphTraversalDepth: 5,
  maxAnalogiesPerConcept: 10,
  maxGeneralizationsPerConcept: 10,
  maxVisitedNodesTraversal: 100,
  traversalTimeoutMs: 2000,
  maxStructuralSignatureDepth: 2,
  maxAnalogyCandidates: 20
};
