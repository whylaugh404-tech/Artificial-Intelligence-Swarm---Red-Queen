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
 * Reads and validates a finite normalized number in [0, 1].
 * Returns undefined if value is not a finite number.
 */
export function readFiniteNormalized(
  value: unknown
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return clamp01(value);
}

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
    const safeInputs: CompositionInput[] = (inputs || []).map((inp: CompositionInput | Record<string, unknown>, idx: number) => {
      if ('type' in inp && typeof inp.type === 'string') return inp as CompositionInput;
      const partObj = inp as Record<string, unknown>;
      return {
        inputId: (partObj.partitionId as string) || `input_${idx}`,
        type: CompositionType.COMPUTE,
        structure: partObj,
        provenance: Array.isArray(partObj.provenance)
          ? (partObj.provenance as string[])
          : ['compute_partition']
      };
    });
    const safeRelations = Array.isArray(relations) ? relations : [];

    const cognitionInput = safeInputs.find(
      i => i.type === CompositionType.UNDERSTANDING || i.type === CompositionType.CELL_STATE
    );
    const knowledgeInput = safeInputs.find(i => i.type === CompositionType.KNOWLEDGE);
    const experienceInput = safeInputs.find(i => i.type === CompositionType.EXPERIENCE);
    const reasoningInput = safeInputs.find(i => i.type === CompositionType.REASONING);
    const epistemicInput = safeInputs.find(
      i => (i.type === CompositionType.CELL_STATE || i.type === CompositionType.GENERIC_STRUCTURE) &&
        i.inputId.includes('epistemic')
    );
    const specializationInput = safeInputs.find(i => i.inputId.includes('specialization'));
    const computeInputs = safeInputs.filter(i => i.type === CompositionType.COMPUTE);
    const effectiveComputeInputs = computeInputs.length > 0
      ? computeInputs
      : safeInputs;

    // 1. Linear-Compositional Model: Data-Driven Feature Extraction & Linear Transformation
    const inputVectors: Record<string, CognitiveFeatureVector> = {};
    const transformations: Record<string, LinearTransformation> = {};
    const rawScores: Record<string, number> = {};
    const partitionFeatureProvenances: Record<string, Record<keyof CognitiveFeatureVector, string>> = {};

    const cogStruct = (cognitionInput?.structure ?? {}) as Record<string, unknown>;
    const knowStruct = (knowledgeInput?.structure ?? {}) as Record<string, unknown>;
    const expStruct = (experienceInput?.structure ?? {}) as Record<string, unknown>;
    const reasStruct = (reasoningInput?.structure ?? {}) as Record<string, unknown>;
    const epistemicStruct = ((epistemicInput?.structure ?? cogStruct.epistemicState) ?? {}) as Record<string, unknown>;
    const specStruct = (specializationInput?.structure ?? {}) as Record<string, unknown>;

    effectiveComputeInputs.forEach((c) => {
      const partId = String(c.structure.partitionId ?? c.inputId);
      const cap = Number(c.structure.capacity ?? 1000);
      const avail = Number(c.structure.availability ?? 1.0);
      const profile = c.structure.communicationProfile as Record<string, unknown> | undefined;
      const rel = Number(profile?.reliability ?? 0.95);
      const latency = Number(profile?.latency ?? 10);
      const partSpec = c.structure.specialization ? String(c.structure.specialization) : undefined;

      // --- Data-Driven Feature Extraction (CognitiveState + Knowledge + Experience + Reasoning + EpistemicState + Specialization) ---

      // 1. Cognition feature
      let cognitionVal: number;
      let cognitionProvenance: string;

      const operationalConfidence = readFiniteNormalized(cogStruct.operationalConfidence);
      const cognitiveConfidence = readFiniteNormalized(cogStruct.confidence);
      const reasoningValidity = readFiniteNormalized(reasStruct.validity);
      const reasoningConfidence = readFiniteNormalized(reasStruct.confidence);

      const candidateCognitionMeasurements: { value: number; label: string }[] = [];
      if (operationalConfidence !== undefined) {
        candidateCognitionMeasurements.push({
          value: operationalConfidence,
          label: `cognitiveState.operationalConfidence(${operationalConfidence.toFixed(4)})`
        });
      }
      if (cognitiveConfidence !== undefined) {
        candidateCognitionMeasurements.push({
          value: cognitiveConfidence,
          label: `cognitiveState.confidence(${cognitiveConfidence.toFixed(4)})`
        });
      }
      if (reasoningValidity !== undefined) {
        candidateCognitionMeasurements.push({
          value: reasoningValidity,
          label: `reasoningState.validity(${reasoningValidity.toFixed(4)})`
        });
      }
      if (reasoningConfidence !== undefined) {
        candidateCognitionMeasurements.push({
          value: reasoningConfidence,
          label: `reasoningState.confidence(${reasoningConfidence.toFixed(4)})`
        });
      }

      if (candidateCognitionMeasurements.length > 0) {
        cognitionVal =
          candidateCognitionMeasurements.reduce((sum, m) => sum + m.value, 0) /
          candidateCognitionMeasurements.length;
        cognitionProvenance = `cognition:from:${candidateCognitionMeasurements.map(m => m.label).join('+')}`;
      } else {
        cognitionVal = 0.5;
        cognitionProvenance = 'cognition:uninformative_prior(no_semantic_cognitive_measurement)';
      }

      // 2. Knowledge feature
      let knowledgeVal: number;
      let knowledgeProvenance: string;

      const knowledgeConfidence = readFiniteNormalized(knowStruct.confidence);

      if (knowledgeConfidence !== undefined) {
        knowledgeVal = knowledgeConfidence;
        knowledgeProvenance = `knowledge:from:knowledgeState.confidence(${knowledgeConfidence.toFixed(4)})`;
      } else {
        knowledgeVal = 0.5;
        knowledgeProvenance = 'knowledge:uninformative_prior(no_semantic_knowledge_measurement)';
      }

      // 3. Experience feature
      let experienceVal: number;
      let experienceProvenance: string;

      const expLevel = readFiniteNormalized(expStruct.level);
      const expErrorRate = readFiniteNormalized(expStruct.errorRate);
      const expSuccessRate = readFiniteNormalized(expStruct.successRate);

      const expCandidates: { value: number; label: string }[] = [];

      if (expLevel !== undefined) {
        expCandidates.push({
          value: expLevel,
          label: `experienceState.level(${expLevel.toFixed(4)})`
        });
      }

      if (expErrorRate !== undefined) {
        const quality = clamp01(1.0 - expErrorRate);
        expCandidates.push({
          value: quality,
          label: `experienceState.errorRate(${expErrorRate.toFixed(4)})`
        });
      }

      if (expSuccessRate !== undefined) {
        expCandidates.push({
          value: expSuccessRate,
          label: `experienceState.successRate(${expSuccessRate.toFixed(4)})`
        });
      }

      const totalEvents = typeof expStruct.totalEvents === 'number' && Number.isFinite(expStruct.totalEvents) && expStruct.totalEvents > 0
        ? expStruct.totalEvents
        : undefined;

      if (totalEvents !== undefined) {
        if (typeof expStruct.successfulNavigations === 'number' && Number.isFinite(expStruct.successfulNavigations) && expStruct.successfulNavigations >= 0) {
          const ratio = clamp01(expStruct.successfulNavigations / totalEvents);
          expCandidates.push({
            value: ratio,
            label: `experienceState.successfulNavigationsRatio(${expStruct.successfulNavigations}/${totalEvents}=${ratio.toFixed(4)})`
          });
        }
        if (typeof expStruct.tasksCompleted === 'number' && Number.isFinite(expStruct.tasksCompleted) && expStruct.tasksCompleted >= 0) {
          const ratio = clamp01(expStruct.tasksCompleted / totalEvents);
          expCandidates.push({
            value: ratio,
            label: `experienceState.tasksCompletedRatio(${expStruct.tasksCompleted}/${totalEvents}=${ratio.toFixed(4)})`
          });
        }
      }

      if (expCandidates.length > 0) {
        experienceVal =
          expCandidates.reduce((sum, c) => sum + c.value, 0) /
          expCandidates.length;
        experienceProvenance = `experience:from:${expCandidates.map(c => c.label).join('+')}`;
      } else {
        experienceVal = 0.5;
        experienceProvenance = 'experience:uninformative_prior(no_semantic_experience_measurement)';
      }

      // 4. Specialization feature
      let specializationVal = 0.5;
      let specializationProvenance = 'specialization:uninformative_prior(no_specialization_declared)';
      const declaredSpecs: string[] = [];
      if (typeof specStruct.value === 'string') {
        declaredSpecs.push(specStruct.value);
      } else if (Array.isArray(specStruct.value)) {
        for (const item of specStruct.value) {
          if (typeof item === 'string') declaredSpecs.push(item);
          else if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).domain === 'string') {
            declaredSpecs.push(String((item as Record<string, unknown>).domain));
          }
        }
      } else if (typeof specStruct.domain === 'string') {
        declaredSpecs.push(specStruct.domain);
      }
      if (partSpec) {
        declaredSpecs.push(partSpec);
      }

      const targetDomain = context.domain.toLowerCase().trim();
      if (declaredSpecs.length > 0) {
        const match = declaredSpecs.find(s =>
          s.toLowerCase().includes(targetDomain) || targetDomain.includes(s.toLowerCase())
        );
        if (match) {
          specializationVal = 0.95;
          specializationProvenance = `specialization:from:domain_match(${match}_matches_${context.domain})`;
        } else {
          specializationVal = 0.35;
          specializationProvenance = `specialization:from:domain_divergence(declared=[${declaredSpecs.join(',')}],target=${context.domain})`;
        }
      }

      // 5. Reliability feature (EpistemicState + Substrate Profile)
      const epistemicConfidence = readFiniteNormalized(epistemicStruct.confidence);
      const epistemicCertainty = readFiniteNormalized(epistemicStruct.certainty);
      const epistemicTruthScore = readFiniteNormalized(epistemicStruct.truthScore);
      const epistemicRawConfidence = readFiniteNormalized(epistemicStruct.rawConfidence);
      const cogOperationalConfidence = readFiniteNormalized(cogStruct.operationalConfidence);

      let epistemicScore: number | undefined;
      let epistemicSource = '';

      if (epistemicConfidence !== undefined) {
        epistemicScore = epistemicConfidence;
        epistemicSource = `epistemicState.confidence(${epistemicScore.toFixed(4)})`;
      } else if (epistemicCertainty !== undefined) {
        epistemicScore = epistemicCertainty;
        epistemicSource = `epistemicState.certainty(${epistemicScore.toFixed(4)})`;
      } else if (epistemicTruthScore !== undefined) {
        epistemicScore = epistemicTruthScore;
        epistemicSource = `epistemicState.truthScore(${epistemicScore.toFixed(4)})`;
      } else if (epistemicRawConfidence !== undefined) {
        epistemicScore = epistemicRawConfidence;
        epistemicSource = `epistemicState.rawConfidence(${epistemicScore.toFixed(4)})`;
      } else if (cogOperationalConfidence !== undefined) {
        epistemicScore = cogOperationalConfidence;
        epistemicSource = `cognitiveState.operationalConfidence(${epistemicScore.toFixed(4)})`;
      }

      const substrateReliability = clamp01(rel);
      let reliabilityVal: number;
      let reliabilityProvenance: string;
      if (epistemicScore !== undefined) {
        reliabilityVal = clamp01(0.6 * epistemicScore + 0.4 * substrateReliability);
        reliabilityProvenance = `reliability:from:${epistemicSource}+substrate(${substrateReliability.toFixed(4)})`;
      } else {
        reliabilityVal = substrateReliability;
        reliabilityProvenance = `reliability:from:substrate.communicationProfile(${substrateReliability.toFixed(4)})`;
      }

      // 6. Computation feature (Compute substrate operational capacity, NOT intelligence)
      const computationVal = clamp01(cap / 10000);
      const computationProvenance = `computation:from:substrate.capacity(${cap},parallelism=${c.structure.parallelism ?? 1})`;

      // 7. Resource efficiency feature (Substrate availability & latency efficiency)
      const resourceEfficiencyVal = clamp01(avail * (rel * 0.7 + (100 / (100 + latency)) * 0.3));
      const resourceEfficiencyProvenance = `resourceEfficiency:from:substrate(avail=${avail},rel=${rel},latency=${latency})`;

      // Form normalized feature vector x_i
      const x_i: CognitiveFeatureVector = {
        computation: computationVal,
        reliability: reliabilityVal,
        cognition: cognitionVal,
        knowledge: knowledgeVal,
        specialization: specializationVal,
        experience: experienceVal,
        resourceEfficiency: resourceEfficiencyVal
      };

      inputVectors[partId] = x_i;
      partitionFeatureProvenances[partId] = {
        computation: computationProvenance,
        reliability: reliabilityProvenance,
        cognition: cognitionProvenance,
        knowledge: knowledgeProvenance,
        specialization: specializationProvenance,
        experience: experienceProvenance,
        resourceEfficiency: resourceEfficiencyProvenance
      };

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
      const score = Math.max(
        0.01,
        (avail * 0.3) + (rel * 0.3) + (x_i.specialization * 0.2) + (x_i.resourceEfficiency * 0.2)
      );
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

    // Build collective feature provenance
    const firstPartId = Object.keys(partitionFeatureProvenances)[0];
    const collectiveFeatureProvenance: Record<string, string> = {};
    if (firstPartId && partitionFeatureProvenances[firstPartId]) {
      const baseProv = partitionFeatureProvenances[firstPartId];
      for (const k of FEATURE_VECTOR_KEYS) {
        collectiveFeatureProvenance[k] = baseProv[k];
      }
    }

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
    const specializations = effectiveComputeInputs
      .map(c => String(c.structure.specialization ?? ''))
      .filter(Boolean);
    if (typeof specStruct.value === 'string') {
      specializations.push(specStruct.value);
    } else if (Array.isArray(specStruct.value)) {
      for (const item of specStruct.value) {
        if (typeof item === 'string') specializations.push(item);
        else if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).domain === 'string') {
          specializations.push(String((item as Record<string, unknown>).domain));
        }
      }
    } else if (typeof specStruct.domain === 'string') {
      specializations.push(specStruct.domain);
    }
    const uniqueSpecializations = Array.from(new Set(specializations)).sort();

    // 6. Non-Additive Integrated Structure
    const integratedStructure: Record<string, unknown> = {
      cognition: cognitionInput ? structuredClone(cognitionInput.structure) : {},
      knowledge: knowledgeInput ? structuredClone(knowledgeInput.structure) : {},
      experience: experienceInput ? structuredClone(experienceInput.structure) : {},
      reasoning: reasoningInput ? structuredClone(reasoningInput.structure) : {}
    };

    const mode = String(cognitionInput?.structure?.mode ?? 'analytical');

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
        resultVector,
        featureProvenance: collectiveFeatureProvenance
      },
      relationGraph,
      specializationAlignment: uniqueSpecializations,
      featureProvenance: collectiveFeatureProvenance
    };

    const reasoningTrace = [
      `[TRANSFORMATION] ${this.transformationType} applied under domain '${context.domain}'`,
      `[FEATURE_PROVENANCE] Grounded 7 cognitive dimensions from CognitiveState, KnowledgeState, ExperienceState, ReasoningState, EpistemicState, and Specialization`,
      `[LINEAR_COMPOSITION] Derived collective feature vector C = Σ α_i z_i across ${effectiveComputeInputs.length} partition(s)`,
      `[COMPUTE_ALLOCATION] Bound ${effectiveComputeInputs.length} partition(s) with aggregate capacity ${totalCapacity}, effective capacity ${effectiveCapacity}, parallelism ${totalParallelism}`,
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
          partitionCount: effectiveComputeInputs.length
        },
        linearComposition: {
          inputVectors,
          transformations,
          weights,
          resultVector,
          featureProvenance: collectiveFeatureProvenance
        },
        featureProvenance: collectiveFeatureProvenance,
        resultVector
      },
      reasoningTrace
    };
  }
}
