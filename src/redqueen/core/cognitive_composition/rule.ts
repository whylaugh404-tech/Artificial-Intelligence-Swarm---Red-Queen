import {
  CompositionConstraint,
  CompositionContext,
  CompositionInput,
  CompositionRelation,
  CompositionTopology,
  CompositionTransformationRule,
  CompositionType
} from '../composition/types';
import {
  CognitiveFeatureVector,
  LinearTransformation,
  applyLinearTransformation,
  generateDeterministicMatrixAndBias,
  vectorToArray,
  arrayToVector,
  clamp01,
  FEATURE_VECTOR_KEYS
} from '../../cognition/types';

/**
 * R4 & P9.5: Cognitive Composition Rule
 * 
 * Implements the linear-compositional mathematical model:
 * X = [x_1, ..., x_n] (Feature vectors normalized to [0,1])
 * Z = [W_1 x_1 + b_1, ..., W_n x_n + b_n] (Deterministic linear transformations)
 * C = Σ α_i z_i with α_i >= 0 and Σ α_i = 1 (State/fitness/relevance-derived weights)
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
    relations: CompositionRelation[] = [],
    topology?: CompositionTopology,
    constraints: CompositionConstraint[] = [],
    context: CompositionContext = { contextId: 'ctx_default', domain: 'general', parameters: {} }
  ): {
    derivedStructure: Record<string, unknown>;
    reasoningTrace: string[];
  } {
    const safeInputs = (inputs || []).map((inp: any, idx) => {
      if (inp.type) return inp;
      return {
        inputId: inp.partitionId || `input_${idx}`,
        type: CompositionType.COMPUTE,
        structure: inp,
        metadata: {}
      } as unknown as CompositionInput;
    });
    const safeRelations = Array.isArray(relations) ? relations : [];

    const cognitionInput = safeInputs.find(
      i => i.type === CompositionType.UNDERSTANDING || i.type === CompositionType.CELL_STATE
    ) ?? safeInputs[0];
    const knowledgeInput = safeInputs.find(i => i.type === CompositionType.KNOWLEDGE) ?? safeInputs[0];
    const experienceInput = safeInputs.find(i => i.type === CompositionType.EXPERIENCE);
    const reasoningInput = safeInputs.find(i => i.type === CompositionType.REASONING);
    const computeInputs = safeInputs.filter(i => i.type === CompositionType.COMPUTE);

    // 1. Linear-Compositional Model: Feature Extraction & Linear Transformation
    const inputVectors: Record<string, CognitiveFeatureVector> = {};
    const transformations: Record<string, LinearTransformation> = {};
    const rawScores: Record<string, number> = {};

    computeInputs.forEach((c, idx) => {
      const partId = String(c.structure.partitionId ?? `part_${idx}`);
      const cap = Number(c.structure.capacity ?? 1000);
      const avail = Number(c.structure.availability ?? 1.0);
      const profile = c.structure.communicationProfile as Record<string, unknown> | undefined;
      const rel = Number(profile?.reliability ?? 0.95);
      const spec = c.structure.specialization ? 0.9 : 0.5;

      // Extract x_i in [0, 1]
      const x_i: CognitiveFeatureVector = {
        computation: clamp01(cap / 10000),
        reliability: clamp01(rel),
        cognition: clamp01(0.7 + (idx * 0.05)),
        knowledge: clamp01(0.6 + (idx * 0.05)),
        specialization: clamp01(spec),
        experience: clamp01(avail * 0.8),
        resourceEfficiency: clamp01(avail * rel)
      };

      inputVectors[partId] = x_i;

      // Deterministic transformation matrix W_i and bias b_i
      const { matrix, bias } = generateDeterministicMatrixAndBias(
        x_i,
        [String(c.structure.architecture ?? 'generic')]
      );

      const trans = applyLinearTransformation(
        x_i,
        matrix,
        bias,
        `Linear transformation for partition ${partId}`
      );
      transformations[partId] = trans;

      // Deterministic relevance/fitness raw score: s_i > 0
      const score = Math.max(0.01, (avail * 0.4) + (rel * 0.3) + (x_i.computation * 0.3));
      rawScores[partId] = score;
    });

    // 2. Weights α_i >= 0, Σ α_i = 1
    const totalScore = Object.values(rawScores).reduce((sum, s) => sum + s, 0) || 1.0;
    const weights: Record<string, number> = {};
    for (const [id, score] of Object.entries(rawScores)) {
      weights[id] = Number((score / totalScore).toFixed(6));
    }

    // Adjust last weight to guarantee exact sum = 1.0
    const weightKeys = Object.keys(weights);
    if (weightKeys.length > 0) {
      const sumExceptLast = weightKeys.slice(0, -1).reduce((s, k) => s + weights[k], 0);
      weights[weightKeys[weightKeys.length - 1]] = Number((1.0 - sumExceptLast).toFixed(6));
    }

    // 3. Collective Linear Composition C = Σ α_i z_i
    const cArr = new Array(7).fill(0);
    for (const [id, trans] of Object.entries(transformations)) {
      const alpha = weights[id] ?? 0;
      const zRecord = trans.transformedVector;
      for (let j = 0; j < 7; j++) {
        const key = FEATURE_VECTOR_KEYS[j];
        cArr[j] += alpha * (zRecord[key] ?? 0);
      }
    }
    const resultVector = arrayToVector(cArr);

    // Operational bounds derivation
    let totalCapacity: number;
    let totalParallelism: number;
    let totalMemory: number;
    let effectiveCapacity: number;

    if (computeInputs.length === 1) {
      // Direct exact preservation for single partition
      const single = computeInputs[0];
      totalCapacity = Number(single.structure.capacity ?? 0);
      totalParallelism = Number(single.structure.parallelism ?? 1);
      totalMemory = Number(single.structure.memory ?? 0);
      const avail = Number(single.structure.availability ?? 1);
      effectiveCapacity = Math.round(totalCapacity * avail);
    } else {
      // Linear-compositional bounds synthesis for multi-partition / collective
      const sumCap = computeInputs.reduce((sum, c) => sum + Number(c.structure.capacity ?? 0), 0);
      const sumPar = computeInputs.reduce((sum, c) => sum + Number(c.structure.parallelism ?? 1), 0);
      const sumMem = computeInputs.reduce((sum, c) => sum + Number(c.structure.memory ?? 0), 0);
      
      // Compositional effective capacity modulated by linear composition resultVector
      totalCapacity = Math.round(sumCap * (0.85 + (0.15 * resultVector.computation)));
      totalParallelism = Math.max(1, Math.round(sumPar * (0.80 + (0.20 * resultVector.resourceEfficiency))));
      totalMemory = Math.round(sumMem * (0.90 + (0.10 * resultVector.reliability)));
      effectiveCapacity = Math.round(totalCapacity * resultVector.reliability);
    }

    const latencies = computeInputs.map(c => {
      const profile = c.structure.communicationProfile as Record<string, unknown> | undefined;
      return Number(profile?.latency ?? 0);
    });
    const latencyBudget = latencies.length > 0 ? Math.min(...latencies) : 0;

    // 4. Relational Structural Graph with Semantics
    const relationGraph = safeRelations.map(rel => ({
      source: rel.sourceInputId,
      target: rel.targetInputId,
      relationType: rel.relationType,
      semantics: rel.semantics
    })).sort((a, b) => {
      const keyA = `${a.source}-${a.target}-${a.relationType}`;
      const keyB = `${b.source}-${b.target}-${b.relationType}`;
      return keyA.localeCompare(keyB);
    });

    // 5. Specialization Alignment
    const specializations = computeInputs
      .map(c => String(c.structure.specialization ?? ''))
      .filter(Boolean);
    const uniqueSpecializations = Array.from(new Set(specializations)).sort();

    // 6. Non-Additive Integrated Structure
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
      linearComposition: {
        inputVectors,
        transformations,
        weights,
        resultVector
      },
      relationGraph,
      specializationAlignment: uniqueSpecializations
    };

    const reasoningTrace = [
      `[TRANSFORMATION] ${this.transformationType} applied under domain '${context.domain}'`,
      `[LINEAR_COMPOSITION] Derived collective feature vector C = Σ α_i z_i across ${computeInputs.length} partition(s)`,
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
        },
        linearComposition: {
          inputVectors,
          transformations,
          weights,
          resultVector
        }
      },
      reasoningTrace
    };
  }
}
