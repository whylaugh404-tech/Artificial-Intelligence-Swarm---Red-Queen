import { createHash } from 'crypto';
import {
  CompositionInput,
  CompositionRelation,
  CompositionTopology,
  CompositionConstraint,
  CompositionContext,
  CompositionResult,
  CompositionTrace,
  CompositionTransformationRule,
  CompositionType
} from './types';
import { logger } from '../logger';

export class CompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompositionError';
  }
}

/**
 * R1: COMPOSITION LAW / COMPOSITION PRIMITIVE
 * 
 * The mathematical composition primitive.
 * X* = F(X1, X2, ..., Xn, R, C, T, D)
 * 
 * This engine handles structural, deterministic composition of heterogeneous inputs,
 * preserving relations, context, constraints, topology, and provenance.
 * It is completely detached from LLM/SLM reliance.
 */
export class CompositionEngine {
  private rules: Map<string, CompositionTransformationRule> = new Map();

  /**
   * Registers a deterministic transformation rule.
   */
  public registerRule(rule: CompositionTransformationRule): void {
    if (this.rules.has(rule.transformationType)) {
      throw new CompositionError(`Rule ${rule.transformationType} is already registered.`);
    }
    this.rules.set(rule.transformationType, rule);
    logger.info('CompositionEngine', 'rule_registered', { rule: rule.transformationType });
  }

  /**
   * Executes a composition using a specific registered rule.
   */
  public compose(
    transformationType: string,
    inputs: CompositionInput[],
    relations: CompositionRelation[] = [],
    topology: CompositionTopology | undefined = undefined,
    constraints: CompositionConstraint[] = [],
    context: CompositionContext,
    deterministicTimestamp?: string
  ): CompositionResult {
    const rule = this.rules.get(transformationType);
    if (!rule) {
      throw new CompositionError(`Transformation rule '${transformationType}' not found.`);
    }

    // 1. Validation phase
    this.validateInputs(inputs);
    this.validateRelations(inputs, relations);
    this.validateTopology(inputs, topology);
    this.validateConstraints(inputs, constraints);

    // 2. Applicability check
    if (!rule.canApply(inputs, relations, topology, constraints, context)) {
      throw new CompositionError(
        `Rule '${transformationType}' cannot be applied to the provided structures and context.`
      );
    }

    // 3. Transformation execution (Deterministic)
    const { derivedStructure, reasoningTrace } = rule.apply(
      inputs,
      relations,
      topology,
      constraints,
      context
    );

    // 4. Trace generation
    const timestamp = deterministicTimestamp || new Date().toISOString();
    
    // Deterministic hash generation for identities
    const compositionSignature = JSON.stringify({
      transformationType,
      inputIds: inputs.map(i => i.inputId).sort(),
      relationIds: relations.map(r => r.relationId).sort(),
      topologyId: topology?.topologyId,
      constraintIds: constraints.map(c => c.constraintId).sort(),
      contextId: context.contextId
    });
    const traceId = `trace_${this.computeHash(compositionSignature)}`;
    
    const trace: CompositionTrace = {
      traceId,
      timestamp,
      transformationType,
      inputIds: inputs.map(i => i.inputId),
      relationIds: relations.map(r => r.relationId),
      topologyId: topology?.topologyId,
      constraintIds: constraints.map(c => c.constraintId),
      contextId: context.contextId,
      reasoningTrace
    };

    // 5. Provenance preservation
    const combinedProvenance = new Set<string>();
    inputs.forEach(input => {
      input.provenance.forEach(p => combinedProvenance.add(p));
    });
    combinedProvenance.add(traceId); // Adding the current composition to provenance

    // 6. Result structuring
    const resultType = this.inferResultType(rule.supportedTypes, inputs);
    const resultId = `comp_${this.computeHash(traceId + JSON.stringify(derivedStructure))}`;
    
    const result: CompositionResult = {
      resultId,
      type: resultType,
      derivedStructure,
      trace,
      provenance: Array.from(combinedProvenance).sort(), // Sorted for determinism
      metadata: {
        compositionTimestamp: timestamp,
        ruleApplied: transformationType
      }
    };

    logger.debug(
      'CompositionEngine',
      'composition_executed',
      { inputs: inputs.length, rule: transformationType, resultId: result.resultId }
    );

    return result;
  }

  private validateInputs(inputs: CompositionInput[]): void {
    if (inputs.length === 0) {
      throw new CompositionError('Composition requires at least one input structure.');
    }
    const ids = new Set<string>();
    for (const input of inputs) {
      if (ids.has(input.inputId)) {
        throw new CompositionError(`Duplicate input ID detected: ${input.inputId}`);
      }
      ids.add(input.inputId);
    }
  }

  private validateRelations(inputs: CompositionInput[], relations: CompositionRelation[]): void {
    const inputIds = new Set(inputs.map(i => i.inputId));
    for (const relation of relations) {
      if (!inputIds.has(relation.sourceInputId)) {
        throw new CompositionError(`Relation ${relation.relationId} references missing source input ${relation.sourceInputId}`);
      }
      if (!inputIds.has(relation.targetInputId)) {
        throw new CompositionError(`Relation ${relation.relationId} references missing target input ${relation.targetInputId}`);
      }
    }
  }

  private validateTopology(inputs: CompositionInput[], topology?: CompositionTopology): void {
    if (!topology) return;
    const inputIds = new Set(inputs.map(i => i.inputId));
    for (const [nodeId, connections] of Object.entries(topology.graphMapping)) {
      if (!inputIds.has(nodeId)) {
        throw new CompositionError(`Topology references missing input node ${nodeId}`);
      }
      for (const connectedId of connections) {
        if (!inputIds.has(connectedId)) {
          throw new CompositionError(`Topology references missing connected input node ${connectedId}`);
        }
      }
    }
  }

  private validateConstraints(inputs: CompositionInput[], constraints: CompositionConstraint[]): void {
    const inputIds = new Set(inputs.map(i => i.inputId));
    for (const constraint of constraints) {
      if (constraint.targetInputId && !inputIds.has(constraint.targetInputId)) {
        throw new CompositionError(`Constraint ${constraint.constraintId} references missing input ${constraint.targetInputId}`);
      }
    }
  }

  private inferResultType(supportedTypes: CompositionType[], inputs: CompositionInput[]): CompositionType {
    // If rule explicitly targets a specific type, prefer it
    if (supportedTypes.length === 1) {
      return supportedTypes[0];
    }
    // Otherwise, attempt to preserve uniform input type
    const inputTypes = new Set(inputs.map(i => i.type));
    if (inputTypes.size === 1) {
      return inputs[0].type;
    }
    // Default to generic structure if heterogeneous and no specific rule type
    return CompositionType.GENERIC_STRUCTURE;
  }

  private computeHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex').substring(0, 16);
  }
}
