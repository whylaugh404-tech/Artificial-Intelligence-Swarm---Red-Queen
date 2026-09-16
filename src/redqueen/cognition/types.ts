import { z } from 'zod';

export const EPSILON_TOLERANCE = 1e-4;

/**
 * P9.5 — Linear Mathematical Cognitive Model Types
 *
 * Core mathematical representations for Red Queen AI collective cognition.
 * Cell is an internal cognitive-computational unit, not a political/social simulation.
 */

export const CognitiveFeatureVectorSchema = z.object({
  computation: z.number().min(0.0).max(1.0).nullable().optional(),
  reliability: z.number().min(0.0).max(1.0).nullable().optional(),
  cognition: z.number().min(0.0).max(1.0).nullable().optional(),
  knowledge: z.number().min(0.0).max(1.0).nullable().optional(),
  specialization: z.number().min(0.0).max(1.0).nullable().optional(),
  experience: z.number().min(0.0).max(1.0).nullable().optional(),
  resourceEfficiency: z.number().min(0.0).max(1.0).nullable().optional()
});

export type CognitiveFeatureVector = z.infer<typeof CognitiveFeatureVectorSchema>;

export const LinearTransformationSchema = z.object({
  dimension: z.number().int().positive(),
  matrix: z.array(z.array(z.number())),
  bias: z.array(z.number()),
  transformedVector: z.record(z.string(), z.number()), // Unbounded intermediate linear result z_i
  description: z.string().optional(),
  provenance: z.array(z.string()).optional()
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
  transformedVectors: z.record(z.string(), z.record(z.string(), z.number())),
  weights: z.record(z.string(), z.number()),
  resultVector: CognitiveFeatureVectorSchema
});

export type CompositionTrace = z.infer<typeof CompositionTraceSchema>;

export const CellChaosDynamicsSchema = z.object({
  chaosState: z.number().min(0.0).max(1.0),
  c0: z.number().min(0.0).max(1.0),
  ct: z.number().min(0.0).max(1.0),
  chaosStep: z.number().int().nonnegative(),
  steps: z.number().int().nonnegative().optional(),
  chaosParameter: z.object({
    r: z.number().min(3.57).max(4.0),
    lambda: z.number().min(0.0).max(0.2)
  }),
  r: z.number().min(3.57).max(4.0).optional(),
  lambda: z.number().min(0.0).max(0.2).optional(),
  modulationFactor: z.number().positive(),
  mt: z.number().positive().optional(),
  sequence: z.array(z.number()).optional()
});

export type CellChaosDynamics = z.infer<typeof CellChaosDynamicsSchema>;

export const NonlinearDynamicsSchema = z.object({
  r: z.number().min(3.57).max(4.0),
  lambda: z.number().min(0.0).max(0.2),
  steps: z.number().int().nonnegative(),
  cellStates: z.record(z.string(), CellChaosDynamicsSchema).optional(),
  c0: z.number().min(0.0).max(1.0).optional(),
  ct: z.number().min(0.0).max(1.0).optional(),
  mt: z.number().positive().optional()
});

export type NonlinearDynamics = z.infer<typeof NonlinearDynamicsSchema>;

export const FeatureStatusSchema = z.enum([
  'KNOWN_ZERO',
  'KNOWN_VALUE',
  'UNKNOWN',
  'KNOWN',
  'DERIVED',
  'ESTIMATED',
  'OBSERVED'
]);
export type FeatureStatus = z.infer<typeof FeatureStatusSchema>;

export function isKnownStatus(status: FeatureStatus): boolean {
  return status === 'KNOWN_ZERO' || status === 'KNOWN_VALUE' || status === 'KNOWN' || status === 'DERIVED' || status === 'ESTIMATED' || status === 'OBSERVED';
}

export const EpistemicFeatureValueSchema = z.object({
  value: z.number().min(0.0).max(1.0).nullable().optional(),
  status: FeatureStatusSchema,
  provenance: z.string()
});
export type EpistemicFeatureValue = z.infer<typeof EpistemicFeatureValueSchema>;

export const FeatureAvailabilitySchema = z.object({
  computation: FeatureStatusSchema,
  reliability: FeatureStatusSchema,
  cognition: FeatureStatusSchema,
  knowledge: FeatureStatusSchema,
  specialization: FeatureStatusSchema,
  experience: FeatureStatusSchema,
  resourceEfficiency: FeatureStatusSchema
});
export type FeatureAvailability = z.infer<typeof FeatureAvailabilitySchema>;

export const EpistemicFeatureRecordSchema = z.object({
  computation: EpistemicFeatureValueSchema,
  reliability: EpistemicFeatureValueSchema,
  cognition: EpistemicFeatureValueSchema,
  knowledge: EpistemicFeatureValueSchema,
  specialization: EpistemicFeatureValueSchema,
  experience: EpistemicFeatureValueSchema,
  resourceEfficiency: EpistemicFeatureValueSchema
});
export type EpistemicFeatureRecord = z.infer<typeof EpistemicFeatureRecordSchema>;

export const CollectiveCognitiveStateSchema = z.object({
  collectiveId: z.string().min(1),
  sourceCellIds: z.array(z.string()).min(1),
  inputVectors: z.record(z.string(), CognitiveFeatureVectorSchema),
  weights: z.record(z.string(), z.number()),
  transformations: z.record(z.string(), LinearTransformationSchema),
  activatedVectors: z.record(z.string(), z.record(z.string(), z.number())).optional(),
  modulatedVectors: z.record(z.string(), z.record(z.string(), z.number())).optional(),
  nonlinearDynamics: NonlinearDynamicsSchema.optional(),
  compositionType: z.enum(['linear', 'nonlinear_tanh_chaos']).optional(),
  nonlinearCollectiveVector: z.record(z.string(), z.number()).optional(),
  featureStatuses: z.record(z.string(), FeatureAvailabilitySchema).optional(),
  featureDetails: z.record(z.string(), EpistemicFeatureRecordSchema).optional(),
  resultVector: CognitiveFeatureVectorSchema,
  provenance: z.array(z.string()),
  deterministicIdentity: z.string().min(1),
  trace: CompositionTraceSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export type CollectiveCognitiveState = z.infer<typeof CollectiveCognitiveStateSchema>;

export interface NonlinearCompositionOptions {
  enableNonlinear?: boolean;
  r?: number;
  lambda?: number;
  steps?: number;
  c0?: number;
  cellC0?: Record<string, number>;
}

/**
 * Clamps and validates a finite number into [0, 1].
 */
export function clamp01(val: number): number {
  if (!Number.isFinite(val) || Number.isNaN(val)) return 0.0;
  return Math.max(0.0, Math.min(1.0, val));
}

/**
 * Validates that all defined fields in CognitiveFeatureVector are finite and bounded in [0, 1].
 * UNKNOWN fields (undefined or null) are explicitly permitted without numeric defaults.
 */
export function validateFeatureVector(v: CognitiveFeatureVector): boolean {
  for (const k of FEATURE_VECTOR_KEYS) {
    const val = v[k];
    if (val !== undefined && val !== null) {
      if (!Number.isFinite(val) || val < 0.0 || val > 1.0) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Derives an epistemic mask over the 7 cognitive dimensions.
 * Returns true for KNOWN dimensions (KNOWN_ZERO or KNOWN_VALUE), false for UNKNOWN.
 */
export function getEpistemicMask(v: CognitiveFeatureVector): boolean[] {
  return FEATURE_VECTOR_KEYS.map(k => {
    const val = v[k];
    return val !== undefined && val !== null && Number.isFinite(val);
  });
}

/**
 * Derives an epistemic mask record keyed by dimension name.
 */
export function getEpistemicMaskRecord(v: CognitiveFeatureVector): Record<keyof CognitiveFeatureVector, boolean> {
  const record: Partial<Record<keyof CognitiveFeatureVector, boolean>> = {};
  for (const k of FEATURE_VECTOR_KEYS) {
    const val = v[k];
    record[k] = val !== undefined && val !== null && Number.isFinite(val);
  }
  return record as Record<keyof CognitiveFeatureVector, boolean>;
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
 * Epistemic mathematical representation that preserves the distinction
 * between KNOWN values (including 0.0) and UNKNOWN dimensions.
 */
export function vectorToArray(v: CognitiveFeatureVector): Array<number | undefined> {
  return FEATURE_VECTOR_KEYS.map(key => {
    const val = v[key];
    return val !== undefined && val !== null ? clamp01(val) : undefined;
  });
}

/**
 * Converts an array of 7 numbers back to a CognitiveFeatureVector clamped in [0, 1].
 * Preserves undefined for epistemically unknown dimensions without converting them to 0.
 */
export function arrayToVector(
  arr: Array<number | undefined>
): CognitiveFeatureVector {
  return {
    computation:
      arr[0] === undefined ? undefined : clamp01(arr[0]),

    reliability:
      arr[1] === undefined ? undefined : clamp01(arr[1]),

    cognition:
      arr[2] === undefined ? undefined : clamp01(arr[2]),

    knowledge:
      arr[3] === undefined ? undefined : clamp01(arr[3]),

    specialization:
      arr[4] === undefined ? undefined : clamp01(arr[4]),

    experience:
      arr[5] === undefined ? undefined : clamp01(arr[5]),

    resourceEfficiency:
      arr[6] === undefined ? undefined : clamp01(arr[6])
  };
}

/**
 * Computes linear transformation: z = W x + b
 * Uses epistemic mask / valid-dimension set: UNKNOWN dimensions do not drag output down to zero.
 */
export function applyLinearTransformation(
  x: CognitiveFeatureVector,
  matrix: number[][],
  bias: number[],
  description?: string,
  epistemicMask?: boolean[]
): LinearTransformation {
  const mask = epistemicMask ?? getEpistemicMask(x);
  const zArr: number[] = new Array(7).fill(0);

  for (let i = 0; i < 7; i++) {
    let sum = bias[i] ?? 0;
    const row = matrix[i] ?? [];
    let validWeight = 0;
    let totalWeight = 0;
    let weightedValidSum = 0;

    for (let j = 0; j < 7; j++) {
      const key = FEATURE_VECTOR_KEYS[j];
      const val = x[key];
      const w = row[j] ?? 0;
      totalWeight += Math.abs(w);
      if (mask[j] && val !== undefined && val !== null && Number.isFinite(val)) {
        validWeight += Math.abs(w);
        weightedValidSum += w * clamp01(val);
      }
    }

    if (validWeight > 0 && totalWeight > 0) {
      // Scale weighted observed dimensions so UNKNOWN is not penalized as numerical zero
      sum += (weightedValidSum / validWeight) * totalWeight;
    } else {
      sum += weightedValidSum;
    }

    zArr[i] = sum;
  }

  const transformedVector: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    transformedVector[FEATURE_VECTOR_KEYS[i]] = zArr[i];
  }

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
 * Invariant (Section 3 of Mathematical Specification):
 * W and b MUST be strictly independent of the dynamic input feature vector x_i!
 * W = W(params) and b = b(params), where params are transformation parameters (capabilities, specialization).
 * For identical transformation parameters:
 *   W(x1) === W(x2)
 *   b(x1) === b(x2)
 * Different inputs x1 != x2 produce different outputs W*x1 + b != W*x2 + b purely because x differs.
 * Furthermore, W and b are strictly independent of physical identities (nodeId, socket, timestamp).
 */
export function generateDeterministicMatrixAndBias(
  _x?: unknown,
  capabilities: string[] = [],
  specialization?: string | null
): { matrix: number[][]; bias: number[] } {
  const caps = Array.isArray(capabilities) ? [...capabilities].sort() : [];
  const spec = (specialization ?? '').trim().toUpperCase();

  // Base matrix capturing functional couplings across the 7 cognitive dimensions:
  const baseMatrix: number[][] = [
    [0.75, 0.00, 0.05, 0.00, 0.05, 0.05, 0.10], // computation
    [0.05, 0.80, 0.00, 0.00, 0.00, 0.15, 0.00], // reliability
    [0.15, 0.05, 0.65, 0.15, 0.00, 0.00, 0.00], // cognition
    [0.00, 0.00, 0.00, 0.75, 0.20, 0.05, 0.00], // knowledge
    [0.00, 0.00, 0.00, 0.05, 0.85, 0.10, 0.00], // specialization
    [0.05, 0.05, 0.00, 0.05, 0.05, 0.80, 0.00], // experience
    [0.10, 0.10, 0.00, 0.00, 0.00, 0.00, 0.80]  // resourceEfficiency
  ];

  // Modulate matrix deterministically by semantic transformation parameters ONLY:
  const capabilityAdjustment = caps.length > 0 ? (caps.length * 0.005) : 0.0;
  const specAdjustment = spec.length > 0 ? (spec.charCodeAt(0) % 7) * 0.002 : 0.0;

  const matrix: number[][] = [];
  for (let i = 0; i < 7; i++) {
    const row: number[] = [];
    for (let j = 0; j < 7; j++) {
      let val = baseMatrix[i][j] + capabilityAdjustment + specAdjustment;
      if (val < 0) val = 0;
      row.push(Number(val.toFixed(4)));
    }
    matrix.push(row);
  }

  // Deterministic bias b_i independent of x and independent of nodeId
  const baseBias: number[] = [0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02];
  const bias: number[] = [];
  for (let i = 0; i < 7; i++) {
    const bVal = baseBias[i] + (caps.length > 0 ? 0.01 : 0.0);
    bias.push(Number(bVal.toFixed(4)));
  }

  return { matrix, bias };
}
