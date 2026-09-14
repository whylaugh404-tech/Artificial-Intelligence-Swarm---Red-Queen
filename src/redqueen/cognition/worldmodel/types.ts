import { z } from 'zod';
import {
  CognitiveConcept,
  CognitiveRelation,
  RepresentationVerificationStatus,
  RepresentationVerificationStatusSchema
} from '../representation/types';
import {
  Context,
  ContextSchema,
  EpistemicStatus,
  EpistemicStatusSchema,
  SubjectiveOpinion,
  SubjectiveOpinionSchema
} from '../epistemic/types';
import {
  CompositionConstraint,
  CompositionConstraintSchema
} from '../../core/composition/types';
import { CognitiveUnderstanding, CognitiveUnderstandingSchema } from '../understanding/types';
import { Evidence, EvidenceSchema } from '../evidence/types';
import { CognitiveGraph } from '../representation/graph';

/**
 * P7.2 ARCHITECTURAL BOUNDARIES SPECIFICATION:
 * 
 * 1. Cognitive Representation (P5.1):
 *    - Atomic, typed symbolic structures (CognitiveConcept, CognitiveRelation, CognitiveAbstraction,
 *      CognitiveGeneralization, CognitiveAnalogy).
 *    - Substrate: Grounded in raw Knowledge and Experience.
 *    - Canonical Storage: Maintained and indexed in the individual Cell's `CognitiveGraph`.
 *    - Scope: Fine-grained, element-level cognitive nodes and edges.
 * 
 * 2. Cognitive Understanding (P7.1):
 *    - Contextual epistemic synthesis (`CognitiveUnderstanding`) integrating representations and evidence
 *      into an explicit, verifiable unit.
 *    - Captures "how" and "why" representations connect under a bounded context with explicit dependencies.
 *    - Scope: Phenomenon / situation-level contextual subgraphs with supporting evidence.
 * 
 * 3. Internal World Model (P7.2):
 *    - Macroscopic, coherent semantic model of a complete domain, environment, or system
 *      (e.g., a Computer System with Hardware, Software, OS, Processes, Memory, Network, and Dependencies).
 *    - ARCHITECTURAL RULE: The World Model is NOT a second CognitiveGraph. It does not clone
 *      or create alternate graph storage. Instead, it references and composes existing representations
 *      and cognitive understandings by their semantic roles.
 *    - Structure: Categorizes elements into entities, states, events, processes, causal relations,
 *      dependencies, and structural relations under explicit constraints, context, and uncertainty.
 *    - Traceability: Guarantees unbroken provenance and auditability:
 *      World Model element → Understanding → Representation → Evidence.
 *    - Scope: Comprehensive, holistic system/worldview model.
 */

export type WorldModelElementRole = 'ENTITY' | 'STATE' | 'EVENT' | 'PROCESS';
export const WorldModelElementRoleSchema = z.enum(['ENTITY', 'STATE', 'EVENT', 'PROCESS']);

export const WorldModelProcessRefSchema = z.object({
  conceptId: z.string().min(1),
  steps: z.array(z.string().min(1)).optional()
});
export type WorldModelProcessRef = z.infer<typeof WorldModelProcessRefSchema>;

export const WorldModelSchema = z.object({
  worldModelId: z.string().min(1).max(256),
  name: z.string().optional(),
  description: z.string().optional(),
  context: ContextSchema,
  
  // Element references by semantic role (references to CognitiveConcept in CognitiveGraph)
  entities: z.array(z.string().min(1)).default([]),
  states: z.array(z.string().min(1)).default([]),
  events: z.array(z.string().min(1)).default([]),
  processes: z.array(WorldModelProcessRefSchema).default([]),
  
  // Relations categorized by semantic nature (references to CognitiveRelation in CognitiveGraph)
  causalRelations: z.array(z.string().min(1)).default([]),
  dependencies: z.array(z.string().min(1)).default([]),
  structuralRelations: z.array(z.string().min(1)).default([]),
  
  // References to higher-level CognitiveUnderstandings
  understandingIds: z.array(z.string().min(1)).default([]),
  
  // Constraints applied to the model (reusing CompositionConstraint)
  constraints: z.array(CompositionConstraintSchema).default([]),
  
  // Epistemic status & uncertainty (reusing epistemic types)
  verificationStatus: RepresentationVerificationStatusSchema,
  epistemicStatus: EpistemicStatusSchema,
  uncertainty: SubjectiveOpinionSchema,
  
  // Provenance & evidence traceability
  evidenceIds: z.array(z.string().min(1)).default([]),
  provenance: z.array(z.string().min(1)).min(1),
  originatingCellId: z.string().min(1),
  
  // Deterministic metadata & immutability
  createdAt: z.string().datetime(),
  version: z.number().int().min(1),
  metadata: z.record(z.string(), z.any()).default({})
});

export type WorldModel = z.infer<typeof WorldModelSchema> & {
  trace?(elementId: string): WorldModelTrace;
};

export interface WorldModelTrace {
  readonly elementId: string;
  readonly elementType: 'CONCEPT' | 'RELATION' | 'UNDERSTANDING' | 'EVIDENCE';
  readonly representation?: CognitiveConcept | CognitiveRelation;
  readonly understandings: ReadonlyArray<CognitiveUnderstanding>;
  readonly evidences: ReadonlyArray<Evidence>;
  readonly epistemicStatus?: EpistemicStatus | RepresentationVerificationStatus;
}

export interface WorldModelCompositionInput {
  name?: string;
  description?: string;
  context: Context;
  originatingCellId: string;
  
  // Optional reference to canonical CognitiveGraph
  graph?: CognitiveGraph;
  
  // Cognitive Understandings to incorporate
  understandings?: CognitiveUnderstanding[];
  
  // Concepts by semantic role (can be conceptId strings or CognitiveConcept objects)
  entities?: Array<string | CognitiveConcept>;
  states?: Array<string | CognitiveConcept>;
  events?: Array<string | CognitiveConcept>;
  processes?: Array<string | CognitiveConcept | { conceptId: string; steps?: string[] }>;
  
  // General concepts (default to ENTITY if not assigned other roles)
  concepts?: Array<CognitiveConcept>;
  
  // Relations (can be relationId strings or CognitiveRelation objects)
  relations?: Array<string | CognitiveRelation>;
  
  // Additional composition constraints
  constraints?: CompositionConstraint[];
  
  // Explicit subjective opinion / uncertainty
  uncertainty?: SubjectiveOpinion;
  
  metadata?: Record<string, any>;
}
