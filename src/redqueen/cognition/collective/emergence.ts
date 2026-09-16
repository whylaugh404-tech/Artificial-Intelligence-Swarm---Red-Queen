import { z } from 'zod';
import { CognitiveFeatureVector, FEATURE_VECTOR_KEYS, vectorToArray } from '../types';

/**
 * Emergence Metrics Schema
 * Rigorous mathematical quantification of emergent phenomena in collective cognition:
 * - synergy: Non-linear super-additivity M(C) - sum_i alpha_i M(x_i)
 * - informationGain: Relative entropy / KL divergence D_KL(P_collective || Q_weighted_prior)
 * - coherence: Directional alignment of constituent cells with collective state
 * - stability: Invariance / bounded variation under chaotic perturbation 1 / (1 + std_dev)
 */
export const EmergenceMetricsSchema = z.object({
  synergy: z.number(),
  informationGain: z.number().min(0.0),
  coherence: z.number().min(0.0).max(1.0),
  stability: z.number().min(0.0).max(1.0),
  metricSummary: z.string(),
  isEmergent: z.boolean()
});

export type EmergenceMetrics = z.infer<typeof EmergenceMetricsSchema>;

export interface EmergenceMetricParams {
  resultVector: CognitiveFeatureVector | Record<string, number>;
  inputVectors: Record<string, CognitiveFeatureVector>;
  weights: Record<string, number>;
  modulatedVectors?: Record<string, Record<string, number>>;
  modulationFactors?: Record<string, number>;
  threshold?: number;
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
 * Calculates genuine mathematical emergence metrics without static defaults or mocks.
 */
export function calculateEmergenceMetrics(params: EmergenceMetricParams): EmergenceMetrics {
  const { resultVector, inputVectors, weights, modulatedVectors, modulationFactors } = params;
  const cellIds = Object.keys(inputVectors);

  if (cellIds.length === 0) {
    return {
      synergy: 0.0,
      informationGain: 0.0,
      coherence: 1.0,
      stability: 1.0,
      metricSummary: 'Zero constituent cells; trivial identity state.',
      isEmergent: false
    };
  }

  const cArr: number[] = FEATURE_VECTOR_KEYS.map(k => (resultVector as any)[k] ?? 0);
  const cNorm = vectorNorm(cArr);

  // 1. Calculate Synergy: S = ||C|| - sum_i alpha_i ||x_i||
  let weightedInputNormSum = 0;
  for (const id of cellIds) {
    const alpha = weights[id] ?? (1.0 / cellIds.length);
    const xArr = vectorToArray(inputVectors[id]);
    weightedInputNormSum += alpha * vectorNorm(xArr);
  }
  const rawSynergy = cNorm - weightedInputNormSum;
  const synergy = Number(rawSynergy.toFixed(6));

  // 2. Calculate Information Gain: D_KL(P || Q)
  // Construct probability distribution P from collective state
  const cSum = cArr.reduce((sum, v) => sum + Math.max(0, v), 0) + EPSILON * 7;
  const P = cArr.map(v => (Math.max(0, v) + EPSILON) / cSum);

  // Construct weighted baseline distribution Q from inputs
  const qArr = new Array(7).fill(0);
  for (const id of cellIds) {
    const alpha = weights[id] ?? (1.0 / cellIds.length);
    const xArr = vectorToArray(inputVectors[id]);
    for (let j = 0; j < 7; j++) {
      qArr[j] += alpha * Math.max(0, xArr[j]);
    }
  }
  const qSum = qArr.reduce((sum, v) => sum + v, 0) + EPSILON * 7;
  const Q = qArr.map(v => (v + EPSILON) / qSum);

  // Kullback-Leibler divergence
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
      // Normalize cosine [-1, 1] to [0, 1]
      const normalizedSim = (cosSim + 1.0) / 2.0;
      coherenceSum += alpha * normalizedSim;
      validCoherenceWeight += alpha;
    }
  }
  const coherence = Number(
    (validCoherenceWeight > 0 ? coherenceSum / validCoherenceWeight : 1.0).toFixed(6)
  );

  // 4. Calculate Stability: 1 / (1 + standard_deviation)
  let variance = 0;
  if (modulationFactors && Object.keys(modulationFactors).length > 0) {
    const factors = Object.values(modulationFactors);
    const mean = factors.reduce((sum, f) => sum + f, 0) / factors.length;
    variance = factors.reduce((sum, f) => sum + (f - mean) * (f - mean), 0) / factors.length;
  } else if (modulatedVectors && Object.keys(modulatedVectors).length > 0) {
    const modVals: number[] = [];
    for (const vec of Object.values(modulatedVectors)) {
      for (const k of FEATURE_VECTOR_KEYS) {
        modVals.push(vec[k] ?? 0);
      }
    }
    const mean = modVals.reduce((sum, v) => sum + v, 0) / (modVals.length || 1);
    variance = modVals.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / (modVals.length || 1);
  }
  const stdDev = Math.sqrt(Math.max(0, variance));
  const stability = Number((1.0 / (1.0 + stdDev)).toFixed(6));

  // Genuine emergence threshold: non-zero information gain or non-zero synergy
  const threshold = params.threshold ?? 0.001;
  const isEmergent = Math.abs(synergy) > threshold || informationGain > threshold;

  const metricSummary = `Emergence analysis across ${cellIds.length} cell(s): synergy=${synergy}, infoGain=${informationGain}, coherence=${coherence}, stability=${stability} (isEmergent=${isEmergent})`;

  return Object.freeze({
    synergy,
    informationGain,
    coherence,
    stability,
    metricSummary,
    isEmergent
  });
}
