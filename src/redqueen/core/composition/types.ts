import { z } from 'zod';

export enum CompositionType {
  COMPUTE = 'COMPUTE',
  KNOWLEDGE = 'KNOWLEDGE',
  UNDERSTANDING = 'UNDERSTANDING',
  REASONING = 'REASONING',
  EXPERIENCE = 'EXPERIENCE',
  CELL_STATE = 'CELL_STATE',
  GENERIC_STRUCTURE = 'GENERIC_STRUCTURE'
}

export const CompositionTypeSchema = z.nativeEnum(CompositionType);

/**
 * Represents an input structure for composition.
 */
export const CompositionInputSchema = z.object({
  inputId: z.string().min(1),
  type: CompositionTypeSchema,
  structure: z.record(z.string(), z.any()), // Heterogeneous structure
  provenance: z.array(z.string()).min(1)
});

export type CompositionInput = z.infer<typeof CompositionInputSchema>;

/**
 * Represents a relation between input structures.
 */
export const CompositionRelationSchema = z.object({
  relationId: z.string().min(1),
  sourceInputId: z.string().min(1),
  targetInputId: z.string().min(1),
  relationType: z.string().min(1),
  semantics: z.record(z.string(), z.any()).optional()
});

export type CompositionRelation = z.infer<typeof CompositionRelationSchema>;

/**
 * Represents the structural topology/arrangement of inputs.
 */
export const CompositionTopologySchema = z.object({
  topologyId: z.string().min(1),
  arrangementType: z.string(), // e.g., 'PIPELINE', 'GRAPH', 'HIERARCHICAL', 'PARALLEL'
  graphMapping: z.record(z.string(), z.array(z.string())) // Node ID to connected Node IDs
});

export type CompositionTopology = z.infer<typeof CompositionTopologySchema>;

/**
 * Represents constraints or dependencies required for composition.
 */
export const CompositionConstraintSchema = z.object({
  constraintId: z.string().min(1),
  type: z.enum(['REQUIREMENT', 'EXCLUSION', 'CAPACITY', 'PRECONDITION', 'LOGICAL']),
  targetInputId: z.string().optional(),
  condition: z.record(z.string(), z.any())
});

export type CompositionConstraint = z.infer<typeof CompositionConstraintSchema>;

/**
 * Represents context for the composition.
 */
export const CompositionContextSchema = z.object({
  contextId: z.string().min(1),
  domain: z.string().min(1),
  parameters: z.record(z.string(), z.any()).default({})
});

export type CompositionContext = z.infer<typeof CompositionContextSchema>;

/**
 * Represents the trace of how a composition was formed.
 */
export const CompositionTraceSchema = z.object({
  traceId: z.string().min(1),
  timestamp: z.string().datetime(),
  transformationType: z.string().min(1),
  inputIds: z.array(z.string()).min(1),
  relationIds: z.array(z.string()),
  topologyId: z.string().optional(),
  constraintIds: z.array(z.string()),
  contextId: z.string(),
  reasoningTrace: z.array(z.string()) // Deterministic step-by-step trace of how the result was formed
});

export type CompositionTrace = z.infer<typeof CompositionTraceSchema>;

/**
 * Represents the structured result of a composition.
 */
export const CompositionResultSchema = z.object({
  resultId: z.string().min(1),
  type: CompositionTypeSchema,
  derivedStructure: z.record(z.string(), z.any()),
  trace: CompositionTraceSchema,
  provenance: z.array(z.string()).min(1), // Combined provenance + traceId
  metadata: z.record(z.string(), z.any()).default({}) // e.g., deterministic hash
});

export type CompositionResult = z.infer<typeof CompositionResultSchema>;

/**
 * Defines a structural composition transformation rule.
 */
export interface CompositionTransformationRule {
  readonly transformationType: string;
  readonly supportedTypes: CompositionType[];
  
  /**
   * Deterministically evaluates if this rule can be applied to the given inputs, relations, topology, and context.
   */
  canApply(
    inputs: CompositionInput[],
    relations: CompositionRelation[],
    topology: CompositionTopology | undefined,
    constraints: CompositionConstraint[],
    context: CompositionContext
  ): boolean;
  
  /**
   * Deterministically applies the composition rule to generate a derived structure.
   */
  apply(
    inputs: CompositionInput[],
    relations: CompositionRelation[],
    topology: CompositionTopology | undefined,
    constraints: CompositionConstraint[],
    context: CompositionContext
  ): {
    derivedStructure: Record<string, any>;
    reasoningTrace: string[];
  };
}
