import { z } from 'zod';

export const EPSILON_TOLERANCE = 1e-4;

/**
 * P9.5 — Linear Mathematical Cognitive Model Types
 *
 * Core mathematical representations for Red Queen AI collective cognition.
 * Cell is an internal cognitive-computational unit, not a political/social simulation.
 */

export const CognitiveFeatureVectorSchema = z.object({
  computation: z.number().min(0.0).max(1.0),
  reliability: z.number().min(0.0).max(1.0),
  cognition: z.number().min(0.0).max(1.0),
  knowledge: z.number().min(0.0).max(1.0),
  specialization: z.number().min(0.0).max(1.0),
  experience: z.number().min(0.0).max(1.0),
  resourceEfficiency: z.number().min(0.0).max(1.0)
});

export type CognitiveFeatureVector = z.infer<typeof CognitiveFeatureVectorSchema>;

export const LinearTransformationSchema = z.object({
  dimension: z.number().int().positive(),
  matrix: z.array(z.array(z.number())),
  bias: z.array(z.number()),
  transformedVector: CognitiveFeatureVectorSchema,
  description: z.string().optional()
});

export type LinearTransformation = z.infer<typeof LinearTransformationSchema>;

export const CompositionWeightSchema = z.object({
  cellId: z.string().min(1),
  weight: z.number().min(0.0).max(1.0),
  rawScore: z.number().min(0.0),
  rationale: z.string().optional()
});

export type CompositionWeight = z.infer<typeof CompositionWeightSchema>;

export const CompositionTraceSchema = z.object({
  traceId: z.string().min(1),
  steps: z.array(z.string()),
  timestamp: z.string(),
  inputVectors: z.record(z.string(), CognitiveFeatureVectorSchema),
  transformedVectors: z.record(z.string(), CognitiveFeatureVectorSchema),
  weights: z.record(z.string(), z.number()),
  resultVector: CognitiveFeatureVectorSchema
});

export type CompositionTrace = z.infer<typeof CompositionTraceSchema>;

export const CollectiveCognitiveStateSchema = z.object({
  collectiveId: z.string().min(1),
  sourceCellIds: z.array(z.string()).min(1),
  inputVectors: z.record(z.string(), CognitiveFeatureVectorSchema),
  weights: z.record(z.string(), z.number()),
  transformations: z.record(z.string(), LinearTransformationSchema),
  resultVector: CognitiveFeatureVectorSchema,
  provenance: z.array(z.string()),
  deterministicIdentity: z.string().min(1),
  trace: CompositionTraceSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export type CollectiveCognitiveState = z.infer<typeof CollectiveCognitiveStateSchema>;

/**
 * Clamps and validates a finite number into [0, 1].
 */
export function clamp01(val: number): number {
  if (!Number.isFinite(val) || Number.isNaN(val)) return 0.0;
  return Math.max(0.0, Math.min(1.0, val));
}

/**
 * Validates that all fields in CognitiveFeatureVector are finite and bounded in [0, 1].
 */
export function validateFeatureVector(v: CognitiveFeatureVector): boolean {
  return (
    Number.isFinite(v.computation) && v.computation >= 0 && v.computation <= 1 &&
    Number.isFinite(v.reliability) && v.reliability >= 0 && v.reliability <= 1 &&
    Number.isFinite(v.cognition) && v.cognition >= 0 && v.cognition <= 1 &&
    Number.isFinite(v.knowledge) && v.knowledge >= 0 && v.knowledge <= 1 &&
    Number.isFinite(v.specialization) && v.specialization >= 0 && v.specialization <= 1 &&
    Number.isFinite(v.experience) && v.experience >= 0 && v.experience <= 1 &&
    Number.isFinite(v.resourceEfficiency) && v.resourceEfficiency >= 0 && v.resourceEfficiency <= 1
  );
}

/**
 * Ordered dimension keys for CognitiveFeatureVector (length = 7).
 */
export const FEATURE_VECTOR_KEYS: Array<keyof CognitiveFeatureVector> = [
  'computation',
  'reliability',
  'cognition',
  'knowledge',
  'specialization',
  'experience',
  'resourceEfficiency'
];

/**
 * Converts a CognitiveFeatureVector to an array of 7 numbers.
 */
export function vectorToArray(v: CognitiveFeatureVector): number[] {
  return [
    clamp01(v.computation),
    clamp01(v.reliability),
    clamp01(v.cognition),
    clamp01(v.knowledge),
    clamp01(v.specialization),
    clamp01(v.experience),
    clamp01(v.resourceEfficiency)
  ];
}

/**
 * Converts an array of 7 numbers back to a CognitiveFeatureVector clamped in [0, 1].
 */
export function arrayToVector(arr: number[]): CognitiveFeatureVector {
  return {
    computation: clamp01(arr[0] ?? 0),
    reliability: clamp01(arr[1] ?? 0),
    cognition: clamp01(arr[2] ?? 0),
    knowledge: clamp01(arr[3] ?? 0),
    specialization: clamp01(arr[4] ?? 0),
    experience: clamp01(arr[5] ?? 0),
    resourceEfficiency: clamp01(arr[6] ?? 0)
  };
}

/**
 * Computes linear transformation: z = W x + b
 * Clamping each element of z into [0, 1].
 */
export function applyLinearTransformation(
  x: CognitiveFeatureVector,
  matrix: number[][],
  bias: number[],
  description?: string
): LinearTransformation {
  const xArr = vectorToArray(x);
  const zArr: number[] = new Array(7).fill(0);

  for (let i = 0; i < 7; i++) {
    let sum = bias[i] ?? 0;
    const row = matrix[i] ?? [];
    for (let j = 0; j < 7; j++) {
      sum += (row[j] ?? 0) * xArr[j];
    }
    zArr[i] = clamp01(sum);
  }

  const transformedVector = arrayToVector(zArr);

  return {
    dimension: 7,
    matrix,
    bias,
    transformedVector,
    description
  };
}

/**
 * Generates a deterministic transformation matrix W_i and bias vector b_i for a Cell.
 * Incorporates cognitive cross-couplings and deterministic cell-specific modulations.
 */
export function generateDeterministicMatrixAndBias(
  cellId: string,
  specialization: string | null = null,
  capabilities: string[] = []
): { matrix: number[][]; bias: number[] } {
  const caps = Array.isArray(capabilities) ? capabilities : [];
  // Deterministic seed hash derived from cellId and traits
  let hash = 0x811c9dc5;
  const str = `${cellId}:${specialization ?? 'general'}:${caps.slice().sort().join(',')}`;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  // Base matrix capturing functional couplings:
  // [0] computation -> [0] self-retention 0.75, [2] powers cognition 0.15, [6] efficiency 0.10
  // [1] reliability -> [1] self-retention 0.80, [2] stabilizes cognition 0.10
  // [2] cognition   -> [2] self-retention 0.70, [6] modulates efficiency 0.10
  // [3] knowledge   -> [3] self-retention 0.70, [2] informs cognition 0.20
  // [4] specialization -> [4] self-retention 0.85, [3] sharpens knowledge 0.15
  // [5] experience  -> [5] self-retention 0.70, [1] calibrates reliability 0.20
  // [6] resourceEfficiency -> [6] self-retention 0.80

  const baseMatrix: number[][] = [
    [0.75, 0.00, 0.05, 0.00, 0.05, 0.05, 0.10], // computation
    [0.05, 0.80, 0.00, 0.00, 0.00, 0.15, 0.00], // reliability (experience calibrates)
    [0.15, 0.05, 0.65, 0.15, 0.00, 0.00, 0.00], // cognition (compute + knowledge inform)
    [0.00, 0.00, 0.00, 0.75, 0.20, 0.05, 0.00], // knowledge (specialization focuses)
    [0.00, 0.00, 0.00, 0.05, 0.85, 0.10, 0.00], // specialization
    [0.05, 0.05, 0.00, 0.05, 0.05, 0.80, 0.00], // experience
    [0.10, 0.10, 0.00, 0.00, 0.00, 0.00, 0.80]  // resourceEfficiency
  ];

  // Derive small deterministic cell-specific offset delta in [-0.05, 0.05]
  const matrix: number[][] = [];
  for (let i = 0; i < 7; i++) {
    const row: number[] = [];
    for (let j = 0; j < 7; j++) {
      hash = Math.imul(hash ^ (i * 7 + j), 0x01000193);
      const rand01 = ((hash >>> 0) % 1000) / 1000;
      const delta = (rand01 - 0.5) * 0.1;
      const val = Math.max(0, Math.min(1.0, baseMatrix[i][j] + delta));
      row.push(Number(val.toFixed(4)));
    }
    matrix.push(row);
  }

  // Deterministic bias in [0.01, 0.05]
  const bias: number[] = [];
  for (let i = 0; i < 7; i++) {
    hash = Math.imul(hash ^ (i + 101), 0x01000193);
    const bVal = 0.01 + (((hash >>> 0) % 40) / 1000);
    bias.push(Number(bVal.toFixed(4)));
  }

  return { matrix, bias };
}
