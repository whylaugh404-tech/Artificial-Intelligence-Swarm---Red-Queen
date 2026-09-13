import {
  CompositionConstraint,
  CompositionContext,
  CompositionInput,
  CompositionRelation,
  CompositionTopology,
  CompositionTransformationRule,
  CompositionType
} from '../composition/types';

/**
 * R4: Cognitive Composition Rule
 * Synthesizes Cognitive State + Compute Partition + Knowledge/Experience non-additively,
 * preserving structural hierarchy, relational dependencies, and computational operational bounds.
 */
export class CognitiveCompositionRule implements CompositionTransformationRule {
  public readonly transformationType = 'COGNITIVE_STRUCTURAL_SYNTHESIS';

  public readonly supportedTypes: CompositionType[] = [
    CompositionType.UNDERSTANDING,
    CompositionType.KNOWLEDGE,
    CompositionType.EXPERIENCE,
    CompositionType.REASONING,
    CompositionType.COMPUTE,
    CompositionType.CELL_STATE,
    CompositionType.GENERIC_STRUCTURE
  ];

  public canApply(
    inputs: CompositionInput[],
    relations: CompositionRelation[],
    topology: CompositionTopology | undefined,
    constraints: CompositionConstraint[],
    context: CompositionContext
  ): boolean {
    // Must contain at least cognitive (UNDERSTANDING), knowledge, and compute inputs
    const hasCognition = inputs.some(
      i => i.type === CompositionType.UNDERSTANDING || i.type === CompositionType.CELL_STATE
    );
    const hasKnowledge = inputs.some(i => i.type === CompositionType.KNOWLEDGE);
    const hasCompute = inputs.some(i => i.type === CompositionType.COMPUTE);

    if (!hasCognition || !hasKnowledge || !hasCompute) {
      return false;
    }

    // Evaluate constraints if present
    for (const constraint of constraints) {
      if (constraint.type === 'CAPACITY') {
        const minCapacity = Number(constraint.condition.minCapacity ?? 0);
        const computeInputs = inputs.filter(i => i.type === CompositionType.COMPUTE);
        const totalCapacity = computeInputs.reduce((sum, c) => {
          return sum + Number(c.structure.capacity ?? 0);
        }, 0);
        if (totalCapacity < minCapacity) {
          return false;
        }
      }

      if (constraint.type === 'REQUIREMENT' && constraint.targetInputId) {
        const target = inputs.find(i => i.inputId === constraint.targetInputId);
        if (!target) return false;
        const requiredKey = String(constraint.condition.requiredKey ?? '');
        if (requiredKey && !(requiredKey in target.structure)) {
          return false;
        }
      }
    }

    return true;
  }

  public apply(
    inputs: CompositionInput[],
    relations: CompositionRelation[],
    topology: CompositionTopology | undefined,
    constraints: CompositionConstraint[],
    context: CompositionContext
  ): {
    derivedStructure: Record<string, unknown>;
    reasoningTrace: string[];
  } {
    const cognitionInput = inputs.find(
      i => i.type === CompositionType.UNDERSTANDING || i.type === CompositionType.CELL_STATE
    ) ?? inputs[0];
    const knowledgeInput = inputs.find(i => i.type === CompositionType.KNOWLEDGE) ?? inputs[0];
    const experienceInput = inputs.find(i => i.type === CompositionType.EXPERIENCE);
    const reasoningInput = inputs.find(i => i.type === CompositionType.REASONING);
    const computeInputs = inputs.filter(i => i.type === CompositionType.COMPUTE);

    // 1. Compute Capability Binding
    const totalCapacity = computeInputs.reduce(
      (sum, c) => sum + Number(c.structure.capacity ?? 0),
      0
    );
    const totalParallelism = computeInputs.reduce(
      (sum, c) => sum + Number(c.structure.parallelism ?? 1),
      0
    );
    const totalMemory = computeInputs.reduce(
      (sum, c) => sum + Number(c.structure.memory ?? 0),
      0
    );
    const avgAvailability = computeInputs.length > 0
      ? computeInputs.reduce((sum, c) => sum + Number(c.structure.availability ?? 1), 0) / computeInputs.length
      : 1;

    const latencies = computeInputs.map(c => {
      const profile = c.structure.communicationProfile as Record<string, unknown> | undefined;
      return Number(profile?.latency ?? 0);
    });
    const latencyBudget = latencies.length > 0 ? Math.min(...latencies) : 0;
    const effectiveCapacity = Math.round(totalCapacity * avgAvailability);

    // 2. Relational Structural Graph
    const relationGraph: Record<string, string[]> = {};
    for (const rel of relations) {
      if (!relationGraph[rel.sourceInputId]) {
        relationGraph[rel.sourceInputId] = [];
      }
      relationGraph[rel.sourceInputId].push(rel.targetInputId);
    }
    // Sort keys and values for determinism
    const sortedRelationGraph: Record<string, string[]> = {};
    for (const key of Object.keys(relationGraph).sort()) {
      sortedRelationGraph[key] = [...relationGraph[key]].sort();
    }

    // 3. Specialization Alignment
    const specializations = computeInputs
      .map(c => String(c.structure.specialization ?? ''))
      .filter(Boolean);
    const uniqueSpecializations = Array.from(new Set(specializations)).sort();

    // 4. Non-Additive Integrated Structure (maintains hierarchy and boundaries)
    const integratedStructure: Record<string, unknown> = {
      cognition: structuredClone(cognitionInput.structure),
      knowledge: structuredClone(knowledgeInput.structure),
      experience: experienceInput ? structuredClone(experienceInput.structure) : {},
      reasoning: reasoningInput ? structuredClone(reasoningInput.structure) : {}
    };

    const mode = String(cognitionInput.structure.mode ?? 'analytical');

    const resultingCognitiveState = {
      mode,
      contextDomain: context.domain,
      integratedStructure,
      operationalBounds: {
        allocatedParallelism: totalParallelism,
        effectiveCapacity,
        memoryLimit: totalMemory,
        latencyBudget
      },
      relationGraph: sortedRelationGraph,
      specializationAlignment: uniqueSpecializations
    };

    const reasoningTrace = [
      `[TRANSFORMATION] ${this.transformationType} applied under domain '${context.domain}'`,
      `[COMPUTE_ALLOCATION] Bound ${computeInputs.length} partition(s) with aggregate capacity ${totalCapacity}, effective capacity ${effectiveCapacity}, parallelism ${totalParallelism}`,
      `[RELATION_MAPPING] Integrated ${relations.length} relational dependencies into structured graph`,
      `[TOPOLOGY] Structured using arrangement '${topology?.arrangementType ?? 'DIRECT'}'`
    ];

    return {
      derivedStructure: {
        resultingCognitiveState,
        computeSummary: {
          totalCapacity,
          totalParallelism,
          totalMemory,
          partitionCount: computeInputs.length
        }
      },
      reasoningTrace
    };
  }
}
