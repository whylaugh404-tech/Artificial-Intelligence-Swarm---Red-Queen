import { z } from 'zod';
import {
  CognitiveFeatureVector,
  FEATURE_VECTOR_KEYS,
  vectorToArray,
  clamp01,
  applyLinearTransformation,
  LinearTransformation
} from '../types';
import { applyTanhVector } from '../activation';

export const EmergenceStatusSchema = z.enum(['HYPOTHESIS', 'EVIDENCED', 'VERIFIED']);
export type EmergenceStatus = z.infer<typeof EmergenceStatusSchema>;

export const EmergenceGatesSchema = z.object({
  hasInteraction: z.boolean(),
  hasBaselineDeviation: z.boolean(),
  hasInformationGain: z.boolean(),
  hasStructuralNovelty: z.boolean(),
  hasEvidence: z.boolean(),
  isReproducible: z.boolean(),
  hasValidStability: z.boolean()
});
export type EmergenceGates = z.infer<typeof EmergenceGatesSchema>;

/**
 * Emergence Metrics Schema
 * Rigorous mathematical quantification of emergent phenomena in collective cognition:
 * - synergy: Non-linear super-additivity ||C_base - Q_weighted_linear_prior||
 * - informationGain: Relative entropy / KL divergence D_KL(P_collective || Q_weighted_prior)
 * - coherence: Directional alignment of constituent cells with collective state
 * - stability: Response against bounded deterministic perturbation: 1 / (1 + (Δoutput / Δinput))
 * - gates: Explicit breakdown of the 7 emergence validation gates
 * - status: Strict epistemic level: HYPOTHESIS | EVIDENCED | VERIFIED
 * - isEmergent: Boolean gate requiring ALL 7 validation conditions simultaneously
 */
export const EmergenceMetricsSchema = z.object({
  synergy: z.number(),
  informationGain: z.number().min(0.0),
  coherence: z.number().min(0.0).max(1.0),
  stability: z.number().min(0.0).max(1.0),
  sensitivity: z.number().nonnegative().optional(),
  deltaInput: z.number().nonnegative().optional(),
  deltaOutput: z.number().nonnegative().optional(),
  status: EmergenceStatusSchema,
  gates: EmergenceGatesSchema,
  metricSummary: z.string(),
  isEmergent: z.boolean()
});

export type EmergenceMetrics = z.infer<typeof EmergenceMetricsSchema>;

export interface EmergenceMetricParams {
  resultVector: CognitiveFeatureVector | Record<string, number>;
  inputVectors: Record<string, CognitiveFeatureVector>;
  weights: Record<string, number>;
  transformations?: Record<string, LinearTransformation>;
  modulatedVectors?: Record<string, Record<string, number>>;
  modulationFactors?: Record<string, number>;
  threshold?: number;

  // Custom collective evaluation callback for perturbation test if provided
  computePerturbedCollective?: (perturbedInputs: Record<string, CognitiveFeatureVector>) => CognitiveFeatureVector | Record<string, number> | number[];

  // Explicit emergence gates (if omitted, evaluated from inputs/counts)
  hasInteraction?: boolean;
  hasBaselineDeviation?: boolean;
  hasInformationGain?: boolean;
  hasStructuralNovelty?: boolean;
  hasEvidence?: boolean;
  isReproducible?: boolean;
  hasValidStability?: boolean;
  emergentStructuresCount?: number;
  evidenceCount?: number;
  status?: EmergenceStatus;
}

const EPSILON = 1e-9;

function vectorNorm(arr: number[]): number {
  const sumSq = arr.reduce((sum, val) => sum + val * val, 0);
  return Math.sqrt(sumSq);
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, idx) => sum + val * (b[idx] ?? 0), 0);
}

/**
 * Generates a bounded, deterministic perturbation ε for input feature vectors X -> X'.
 * strictly preserves Cell identity, genome, nodeId, memory, lineage, and fitness.
 */
export function generateDeterministicPerturbation(
  inputVectors: Record<string, CognitiveFeatureVector>,
  epsilon = 0.02
): { perturbedInputs: Record<string, CognitiveFeatureVector>; deltaInput: number } {
  const perturbedInputs: Record<string, CognitiveFeatureVector> = {};
  let totalDeltaSq = 0;
  let count = 0;

  for (const [cellId, vec] of Object.entries(inputVectors)) {
    const perturbed: CognitiveFeatureVector = { ...vec };
    let seed = 0;
    for (let i = 0; i < cellId.length; i++) {
      seed = (seed * 31 + cellId.charCodeAt(i)) >>> 0;
    }

    for (let j = 0; j < FEATURE_VECTOR_KEYS.length; j++) {
      const key = FEATURE_VECTOR_KEYS[j];
      const val = vec[key];
      if (val !== undefined && val !== null && Number.isFinite(val)) {
        const stepSeed = (seed + j * 7919) >>> 0;
        const factor = ((stepSeed % 1000) / 1000) * 2 - 1; // [-1, 1]
        const deltaMagnitude = Math.abs(factor) < 0.25 ? 0.5 : factor;
        const delta = Number((deltaMagnitude * epsilon).toFixed(6));

        let newVal = clamp01(val + delta);
        if (newVal === val) {
          newVal = clamp01(val + (val >= 0.5 ? -epsilon : epsilon));
        }

        perturbed[key] = newVal;
        const diff = newVal - val;
        totalDeltaSq += diff * diff;
        count++;
      }
    }
    perturbedInputs[cellId] = perturbed;
  }

  const deltaInput = count > 0 ? Number(Math.sqrt(totalDeltaSq).toFixed(6)) : 0.0;
  return { perturbedInputs, deltaInput };
}

/**
 * Calculates genuine mathematical emergence metrics using:
 * 1. Super-additive synergy vs independent baseline
 * 2. Information gain (KL divergence)
 * 3. Directional coherence
 * 4. Dual-pass perturbation stability: X -> C_base vs X' -> C_perturbed (no inverted modulation)
 * 5. Explicit 7-condition emergence boolean gate
 */
export function calculateEmergenceMetrics(params: EmergenceMetricParams): EmergenceMetrics {
  const {
    resultVector,
    inputVectors,
    weights,
    transformations,
    modulationFactors,
    computePerturbedCollective
  } = params;

  const cellIds = Object.keys(inputVectors);

  if (cellIds.length === 0) {
    return {
      synergy: 0.0,
      informationGain: 0.0,
      coherence: 1.0,
      stability: 1.0,
      deltaInput: 0.0,
      deltaOutput: 0.0,
      status: 'HYPOTHESIS',
      gates: {
        hasInteraction: false,
        hasBaselineDeviation: false,
        hasInformationGain: false,
        hasStructuralNovelty: false,
        hasEvidence: false,
        isReproducible: true,
        hasValidStability: true
      },
      metricSummary: 'Zero constituent cells; trivial identity state.',
      isEmergent: false
    };
  }

  const cArr: number[] = FEATURE_VECTOR_KEYS.map(k => (resultVector as any)[k] ?? 0);
  const cNorm = vectorNorm(cArr);

  // Baseline Q is independent weighted prior sum(alpha * x_i)
  const qArr = new Array(7).fill(0);
  for (const id of cellIds) {
    const alpha = weights[id] ?? (1.0 / cellIds.length);
    const xArr = vectorToArray(inputVectors[id]);
    for (let j = 0; j < 7; j++) {
      qArr[j] += alpha * xArr[j];
    }
  }

  // 1. Calculate Synergy: distance(actualCollective, independentBaseline)
  let synergyDistSq = 0;
  for (let j = 0; j < 7; j++) {
    const diff = cArr[j] - qArr[j];
    synergyDistSq += diff * diff;
  }
  const rawSynergy = Math.sqrt(synergyDistSq);
  const synergy = Number(rawSynergy.toFixed(6));

  // 2. Calculate Information Gain: D_KL(P || Q)
  const cSum = cArr.reduce((sum, v) => sum + Math.max(0, v), 0) + EPSILON * 7;
  const P = cArr.map(v => (Math.max(0, v) + EPSILON) / cSum);

  const qSum = qArr.reduce((sum, v) => sum + Math.max(0, v), 0) + EPSILON * 7;
  const Q = qArr.map(v => (Math.max(0, v) + EPSILON) / qSum);

  let klDiv = 0;
  for (let j = 0; j < 7; j++) {
    klDiv += P[j] * Math.log(P[j] / Q[j]);
  }
  const informationGain = Number(Math.max(0.0, klDiv).toFixed(6));

  // 3. Calculate Coherence: sum_i alpha_i (x_i . C) / (||x_i|| * ||C||)
  let coherenceSum = 0;
  let validCoherenceWeight = 0;
  for (const id of cellIds) {
    const alpha = weights[id] ?? (1.0 / cellIds.length);
    const xArr = vectorToArray(inputVectors[id]);
    const xNorm = vectorNorm(xArr);
    if (xNorm > EPSILON && cNorm > EPSILON) {
      const cosSim = Math.max(-1.0, Math.min(1.0, dotProduct(xArr, cArr) / (xNorm * cNorm)));
      const normalizedSim = (cosSim + 1.0) / 2.0;
      coherenceSum += alpha * normalizedSim;
      validCoherenceWeight += alpha;
    }
  }
  const coherence = Number(
    (validCoherenceWeight > 0 ? coherenceSum / validCoherenceWeight : 1.0).toFixed(6)
  );

  // 4. True Perturbation Stability:
  // BASELINE: X -> collective -> C_base
  // PERTURBED: X' = X + deterministic ε -> collective computation -> C_perturbed
  // Δinput = distance(X, X')
  // Δoutput = distance(C_base, C_perturbed)
  // stability = 1 / (1 + (Δoutput / (Δinput + ε)))
  const { perturbedInputs, deltaInput } = generateDeterministicPerturbation(inputVectors);

  const cPerturbedArr = new Array(7).fill(0);
  if (typeof computePerturbedCollective === 'function') {
    const customResult = computePerturbedCollective(perturbedInputs);
    if (Array.isArray(customResult)) {
      for (let j = 0; j < 7; j++) cPerturbedArr[j] = customResult[j] ?? 0;
    } else {
      for (let j = 0; j < 7; j++) {
        const key = FEATURE_VECTOR_KEYS[j];
        cPerturbedArr[j] = (customResult as any)[key] ?? 0;
      }
    }
  } else if (transformations && Object.keys(transformations).length > 0) {
    // Recompute collective mathematical engine: affine -> tanh -> chaos modulation -> weighted sum
    for (const id of cellIds) {
      const alpha = weights[id] ?? (1.0 / cellIds.length);
      const trans = transformations[id];
      const mt = modulationFactors?.[id] ?? 1.0;
      if (trans) {
        const zPert = applyLinearTransformation(perturbedInputs[id], trans.matrix, trans.bias);
        const hPert = applyTanhVector(zPert.transformedVector);
        for (let j = 0; j < 7; j++) {
          const key = FEATURE_VECTOR_KEYS[j];
          cPerturbedArr[j] += alpha * (hPert[key] ?? 0) * mt;
        }
      } else {
        const xArr = vectorToArray(perturbedInputs[id]);
        for (let j = 0; j < 7; j++) {
          cPerturbedArr[j] += alpha * xArr[j];
        }
      }
    }
  } else {
    for (const id of cellIds) {
      const alpha = weights[id] ?? (1.0 / cellIds.length);
      const xArr = vectorToArray(perturbedInputs[id]);
      for (let j = 0; j < 7; j++) {
        cPerturbedArr[j] += alpha * xArr[j];
      }
    }
  }

  let deltaOutputSq = 0;
  for (let j = 0; j < 7; j++) {
    const diff = cPerturbedArr[j] - cArr[j];
    deltaOutputSq += diff * diff;
  }
  const deltaOutput = Number(Math.sqrt(deltaOutputSq).toFixed(6));

  const sensitivity = deltaOutput / (deltaInput + EPSILON);
  const stability = Number((1.0 / (1.0 + sensitivity)).toFixed(6));

  // 5. Complete Emergence Boolean Gate
  // Strict mandate: Require interaction, baseline deviation, information gain,
  // structural novelty, evidence, reproducibility, and valid perturbation stability.
  const threshold = params.threshold ?? 0.001;

  const gates: EmergenceGates = {
    hasInteraction: Boolean(params.hasInteraction ?? (cellIds.length >= 2)),
    hasBaselineDeviation: Boolean(params.hasBaselineDeviation ?? (synergy > threshold)),
    hasInformationGain: Boolean(params.hasInformationGain ?? (informationGain > threshold)),
    hasStructuralNovelty: Boolean(
      params.hasStructuralNovelty ??
      (params.emergentStructuresCount !== undefined ? params.emergentStructuresCount > 0 : true)
    ),
    hasEvidence: Boolean(
      params.hasEvidence ??
      (params.evidenceCount !== undefined ? params.evidenceCount > 0 : false)
    ),
    isReproducible: Boolean(params.isReproducible ?? true),
    hasValidStability: Boolean(params.hasValidStability ?? (stability >= 0.2 && stability <= 1.0))
  };

  const isEmergent =
    gates.hasInteraction &&
    gates.hasBaselineDeviation &&
    gates.hasInformationGain &&
    gates.hasStructuralNovelty &&
    gates.hasEvidence &&
    gates.isReproducible &&
    gates.hasValidStability;

  // Distinct epistemic status separation:
  // HYPOTHESIS: unverified conjecture lacking sufficient empirical grounding
  // EVIDENCED: supported by grounding evidence but incomplete emergence gates
  // VERIFIED: all 7 emergence conditions verified simultaneously
  let status: EmergenceStatus = 'HYPOTHESIS';
  if (params.status) {
    status = params.status;
  } else if (isEmergent) {
    status = 'VERIFIED';
  } else if (gates.hasEvidence) {
    status = 'EVIDENCED';
  } else {
    status = 'HYPOTHESIS';
  }

  const metricSummary = `Emergence analysis across ${cellIds.length} cell(s): synergy=${synergy}, infoGain=${informationGain}, coherence=${coherence}, stability=${stability} [Δin=${deltaInput}, Δout=${deltaOutput}] status=${status} (isEmergent=${isEmergent})`;

  return Object.freeze({
    synergy,
    informationGain,
    coherence,
    stability,
    sensitivity,
    deltaInput,
    deltaOutput,
    status,
    gates,
    metricSummary,
    isEmergent
  });
}
