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

  computePerturbedCollective?: (perturbedInputs: Record<string, CognitiveFeatureVector>) => CognitiveFeatureVector | Record<string, number> | number[];

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

export function finiteDimensions(values: Array<number | undefined>): number[] {
  return values.filter((value): value is number => value !== undefined && Number.isFinite(value));
}

export function maskedDistance(
  a: Array<number | undefined>,
  b: Array<number | undefined>
): number | undefined {
  let sum = 0;
  let count = 0;

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== undefined && b[i] !== undefined && Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      const delta = a[i]! - b[i]!;
      sum += delta * delta;
      count++;
    }
  }

  if (count === 0) {
    return undefined;
  }

  return Math.sqrt(sum / count);
}

export function generateDeterministicPerturbation(
  featureVector: Array<number | undefined>,
  epsilon: number
): Array<number | undefined> {
  return featureVector.map((value, index) => {
    if (value === undefined || !Number.isFinite(value)) {
      return undefined;
    }

    const direction =
      value <= 0
        ? 1
        : value >= 1
          ? -1
          : index % 2 === 0
            ? 1
            : -1;

    return clamp01(value + direction * epsilon);
  });
}

export function maskedKLDivergence(
  p: Array<number | undefined>,
  q: Array<number | undefined>
): number | undefined {
  const validIndices: number[] = [];

  for (let i = 0; i < Math.min(p.length, q.length); i++) {
    const pv = p[i];
    const qv = q[i];

    if (
      pv !== undefined &&
      qv !== undefined &&
      Number.isFinite(pv) &&
      Number.isFinite(qv)
    ) {
      validIndices.push(i);
    }
  }

  if (validIndices.length === 0) {
    return undefined;
  }

  let pSum = 0;
  let qSum = 0;

  for (const i of validIndices) {
    pSum += Math.max(0, p[i]!);
    qSum += Math.max(0, q[i]!);
  }

  if (pSum <= 0 || qSum <= 0) {
    return undefined;
  }

  let kl = 0;

  for (const i of validIndices) {
    const pi =
      (Math.max(0, p[i]!) + EPSILON) /
      (pSum + EPSILON * validIndices.length);

    const qi =
      (Math.max(0, q[i]!) + EPSILON) /
      (qSum + EPSILON * validIndices.length);

    kl += pi * Math.log(pi / qi);
  }

  return Math.max(0, kl);
}

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
        isReproducible: false,
        hasValidStability: false
      },
      metricSummary: 'Zero constituent cells; trivial identity state.',
      isEmergent: false
    };
  }

  const cArr = vectorToArray(resultVector as CognitiveFeatureVector);

  const qArr: Array<number | undefined> = new Array(7).fill(undefined);
  for (const id of cellIds) {
    const alpha = weights[id] ?? (1.0 / cellIds.length);
    const xArr = vectorToArray(inputVectors[id]);
    for (let j = 0; j < 7; j++) {
      const xVal = xArr[j];
      if (xVal !== undefined && Number.isFinite(xVal)) {
        qArr[j] = (qArr[j] ?? 0) + alpha * xVal;
      }
    }
  }

  const synergy = maskedDistance(cArr, qArr) ?? 0.0;
  const informationGain = maskedKLDivergence(cArr, qArr) ?? 0.0;

  let coherenceSum = 0;
  let validCoherenceWeight = 0;
  
  const cNormSq = cArr.reduce((sum, val) => sum! + (val !== undefined ? val * val : 0), 0)!;
  const cNorm = Math.sqrt(cNormSq);

  for (const id of cellIds) {
    const alpha = weights[id] ?? (1.0 / cellIds.length);
    const xArr = vectorToArray(inputVectors[id]);
    
    let dp = 0;
    let xNormSq = 0;
    for (let j = 0; j < 7; j++) {
      const xVal = xArr[j];
      if (xVal !== undefined) {
        xNormSq += xVal * xVal;
        const cVal = cArr[j];
        if (cVal !== undefined) {
          dp += xVal * cVal;
        }
      }
    }
    const xNorm = Math.sqrt(xNormSq);

    if (xNorm > EPSILON && cNorm > EPSILON) {
      const cosSim = Math.max(-1.0, Math.min(1.0, dp / (xNorm * cNorm)));
      const normalizedSim = (cosSim + 1.0) / 2.0;
      coherenceSum += alpha * normalizedSim;
      validCoherenceWeight += alpha;
    }
  }
  const coherence = validCoherenceWeight > 0 ? coherenceSum / validCoherenceWeight : 1.0;

  const perturbedInputs: Record<string, CognitiveFeatureVector> = {};
  const epsilon = 0.02;
  
  let totalDeltaSq = 0;
  let countDelta = 0;
  
  for (const [id, vec] of Object.entries(inputVectors)) {
    const xArr = vectorToArray(vec);
    const xPert = generateDeterministicPerturbation(xArr, epsilon);
    const pertVec = { ...vec };
    
    for (let j = 0; j < 7; j++) {
      const pVal = xPert[j];
      const origVal = xArr[j];
      if (pVal !== undefined && origVal !== undefined) {
        pertVec[FEATURE_VECTOR_KEYS[j]] = pVal;
        const diff = pVal - origVal;
        totalDeltaSq += diff * diff;
        countDelta++;
      }
    }
    perturbedInputs[id] = pertVec;
  }
  
  const deltaInput = countDelta > 0 ? Math.sqrt(totalDeltaSq) : 0.0;

  const cPerturbedArr: Array<number | undefined> = new Array(7).fill(undefined);
  if (typeof computePerturbedCollective === 'function') {
    const customResult = computePerturbedCollective(perturbedInputs);
    if (Array.isArray(customResult)) {
      for (let j = 0; j < 7; j++) {
        const value = customResult[j];
        if (value !== undefined && Number.isFinite(value)) {
          cPerturbedArr[j] = value;
        }
      }
    } else {
      const customArr = vectorToArray(customResult as CognitiveFeatureVector);
      for (let j = 0; j < 7; j++) {
        const value = customArr[j];
        if (value !== undefined && Number.isFinite(value)) {
          cPerturbedArr[j] = value;
        }
      }
    }
  } else if (transformations && Object.keys(transformations).length > 0) {
    for (const id of cellIds) {
      const alpha = weights[id] ?? (1.0 / cellIds.length);
      const trans = transformations[id];
      const mt = modulationFactors?.[id] ?? 1.0;
      if (trans) {
        const zPert = applyLinearTransformation(perturbedInputs[id], trans.matrix, trans.bias);
        const hPert = applyTanhVector(zPert.transformedVector);
        for (let j = 0; j < 7; j++) {
          const key = FEATURE_VECTOR_KEYS[j];
          const val = hPert[key];
          if (val !== undefined && Number.isFinite(val)) {
            cPerturbedArr[j] = (cPerturbedArr[j] ?? 0) + alpha * val * mt;
          }
        }
      } else {
        const xArr = vectorToArray(perturbedInputs[id]);
        for (let j = 0; j < 7; j++) {
          const val = xArr[j];
          if (val !== undefined && Number.isFinite(val)) {
            cPerturbedArr[j] = (cPerturbedArr[j] ?? 0) + alpha * val;
          }
        }
      }
    }
  } else {
    for (const id of cellIds) {
      const alpha = weights[id] ?? (1.0 / cellIds.length);
      const xArr = vectorToArray(perturbedInputs[id]);
      for (let j = 0; j < 7; j++) {
        const val = xArr[j];
        if (val !== undefined && Number.isFinite(val)) {
          cPerturbedArr[j] = (cPerturbedArr[j] ?? 0) + alpha * val;
        }
      }
    }
  }

  const deltaOutput = maskedDistance(cPerturbedArr, cArr) ?? 0.0;
  const sensitivity = deltaOutput / (deltaInput + EPSILON);
  const stability = 1.0 / (1.0 + sensitivity);

  const threshold = params.threshold ?? 0.001;

  const hasStructuralNovelty = params.hasStructuralNovelty === true || (params.emergentStructuresCount !== undefined && params.emergentStructuresCount > 0);
  const hasEvidence = params.hasEvidence === true || (params.evidenceCount !== undefined && params.evidenceCount > 0);
  const isReproducible = params.isReproducible === true;

  const gates: EmergenceGates = {
    hasInteraction: Boolean(params.hasInteraction ?? (cellIds.length >= 2)),
    hasBaselineDeviation: Boolean(params.hasBaselineDeviation ?? (synergy > threshold)),
    hasInformationGain: Boolean(params.hasInformationGain ?? (informationGain > threshold)),
    hasStructuralNovelty,
    hasEvidence,
    isReproducible,
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

  let status: EmergenceStatus;
  if (isEmergent && gates.isReproducible && gates.hasValidStability) {
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
