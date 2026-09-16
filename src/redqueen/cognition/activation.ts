import { FEATURE_VECTOR_KEYS, CognitiveFeatureVector } from './types';

/**
 * P9.6 — Nonlinear Cognitive Activation: Tanh Function
 * 
 * Provides deterministic and numerically safe tanh activation for Red Queen internal cognition.
 * Transforms linear affine representation z_i = W_i x_i + b_i into bounded non-linear activation h_i = tanh(z_i).
 * 
 * Invariants:
 * - h_i = tanh(z_i)
 * - Safe for any real number (monotonic, finite, bounded in (-1, 1))
 * - Zero random noise
 */

/**
 * Numerically safe hyperbolic tangent activation.
 * Handles non-finite numbers and limits deterministically.
 */
export function safeTanh(z: number): number {
  if (Number.isNaN(z)) {
    return 0.0;
  }
  if (z === Infinity) {
    return 1.0;
  }
  if (z === -Infinity) {
    return -1.0;
  }
  // Standard IEEE-754 Math.tanh is monotonic, continuous, and strictly bounded in [-1, 1]
  const val = Math.tanh(z);
  return Number.isFinite(val) ? val : 0.0;
}

/**
 * Applies tanh activation component-wise to a 7-dimensional vector z_i.
 * h_i = tanh(z_i)
 */
export function applyTanhVector(
  zVector: Record<string, number> | number[]
): Record<string, number> {
  const hVector: Record<string, number> = {};

  if (Array.isArray(zVector)) {
    for (let i = 0; i < 7; i++) {
      const key = FEATURE_VECTOR_KEYS[i];
      hVector[key] = safeTanh(zVector[i] ?? 0);
    }
  } else {
    for (let i = 0; i < 7; i++) {
      const key = FEATURE_VECTOR_KEYS[i];
      hVector[key] = safeTanh(zVector[key] ?? 0);
    }
  }

  return hVector;
}

/**
 * Backward compatible alias for applyTanhVector.
 */
export const applyTanhToVector = applyTanhVector;

/**
 * Structured representation of an activated Cell cognitive state.
 */
export interface ActivatedCognitiveVector {
  cellId: string;
  zVector: Record<string, number>;
  hVector: Record<string, number>;
  activationFunction: 'tanh';
}

/**
 * Computes h_i = tanh(z_i) for a Cell's transformed affine state.
 */
export function computeCellActivation(
  cellId: string,
  transformedVector: Record<string, number>
): ActivatedCognitiveVector {
  return {
    cellId,
    zVector: { ...transformedVector },
    hVector: applyTanhVector(transformedVector),
    activationFunction: 'tanh'
  };
}
