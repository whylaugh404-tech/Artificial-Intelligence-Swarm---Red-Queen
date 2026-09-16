import { computeDeterministicHash } from './computation/canonical';
import { FEATURE_VECTOR_KEYS, CognitiveFeatureVector } from './types';

/**
 * P9.6 — Deterministic Chaos: Cell-Specific Logistic Map Dynamics & Bounded Modulation
 * 
 * Implements deterministic chaotic dynamics for Red Queen collective cognition:
 * - Logistic Map per Cell: c_{i,t+1} = r * c_{i,t} * (1 - c_{i,t})
 * - Domain: 0 < c_{i,0} < 1, 3.57 < r <= 4.0 (Default r = 3.9)
 * - Deterministic seed c_{i,0} derived strictly from Cell semantic/cognitive state:
 *   featureVector (x_i), specialization, traits, generation, capabilities.
 *   STRICT INVARIANT: NEVER uses nodeId, sourceCellId, or timestamp as mathematical seed source!
 * - Bounded Modulation per Cell: m_{i,t} = 1 + lambda * (c_{i,t} - 0.5), with 0 <= lambda <= 0.2 (Default lambda = 0.1)
 * - Modulated activation: h_tilde_i = h_i * m_{i,t} (Cell-specific modulation, NOT global)
 * - Collective Composition: C_t = sum_i alpha_i * h_tilde_i = sum_i alpha_i [ h_i (1 + lambda(c_{i,t} - 0.5)) ]
 * 
 * Invariant:
 * Chaos NEVER mutates Cell memory, genome, identity, lineage, or population.
 * Chaos ONLY provides bounded modulation to the activated collective cognitive representation.
 */

export const DEFAULT_CHAOS_R = 3.9;
export const DEFAULT_CHAOS_LAMBDA = 0.1;
export const MIN_CHAOS_R = 3.57;
export const MAX_CHAOS_R = 4.0;
export const MIN_CHAOS_LAMBDA = 0.0;
export const MAX_CHAOS_LAMBDA = 0.2;

/**
 * Validates chaotic dynamics parameters r and lambda.
 */
export function validateChaosParameters(r: number, lambda: number): void {
  if (!Number.isFinite(r) || r <= MIN_CHAOS_R || r > MAX_CHAOS_R) {
    throw new Error(
      `Chaos parameter 'r' must satisfy ${MIN_CHAOS_R} < r <= ${MAX_CHAOS_R}, got: ${r}`
    );
  }
  if (!Number.isFinite(lambda) || lambda < MIN_CHAOS_LAMBDA || lambda > MAX_CHAOS_LAMBDA) {
    throw new Error(
      `Chaos modulation parameter 'lambda' must satisfy ${MIN_CHAOS_LAMBDA} <= lambda <= ${MAX_CHAOS_LAMBDA}, got: ${lambda}`
    );
  }
}

/**
 * Validates that chaotic state variable c is strictly within the open interval (0, 1).
 */
export function validateChaosState(c: number): void {
  if (!Number.isFinite(c) || c <= 0.0 || c >= 1.0) {
    throw new Error(`Chaotic state variable 'c' must satisfy 0 < c < 1, got: ${c}`);
  }
}

/**
 * Computes a single step of the deterministic Logistic Map:
 * c_{t+1} = r * c_t * (1 - c_t)
 */
export function logisticMapStep(c: number, r: number = DEFAULT_CHAOS_R): number {
  validateChaosParameters(r, DEFAULT_CHAOS_LAMBDA);
  validateChaosState(c);

  const next = r * c * (1.0 - c);

  // Validate that the output stays strictly within (0, 1)
  validateChaosState(next);
  return next;
}

/**
 * Iterates the Logistic Map for 'steps' iterations from initial state c0.
 * Returns the final c_t and the full history sequence.
 */
export function iterateLogisticMap(
  c0: number,
  steps: number = 1,
  r: number = DEFAULT_CHAOS_R
): { c0: number; ct: number; sequence: number[] } {
  validateChaosParameters(r, DEFAULT_CHAOS_LAMBDA);
  validateChaosState(c0);

  if (steps < 0 || !Number.isInteger(steps)) {
    throw new Error(`Iteration steps must be a non-negative integer, got: ${steps}`);
  }

  const sequence: number[] = [c0];
  let current = c0;

  for (let t = 0; t < steps; t++) {
    current = logisticMapStep(current, r);
    sequence.push(current);
  }

  return {
    c0,
    ct: current,
    sequence
  };
}

/**
 * Input structure for deriving a Cell's deterministic initial chaos seed c_{i,0}.
 * Strictly excludes any nodeId, sourceCellId, or timestamp.
 */
export interface CellSemanticChaosSeedInput {
  featureVector: CognitiveFeatureVector;
  specialization?: string | null;
  traits?: Record<string, any> | null;
  generation?: number;
  capabilities?: string[];
  domain?: string;
}

/**
 * Derives initial chaotic state c_{i,0} deterministically from a Cell's semantic/cognitive state.
 * 
 * STRICT MANDATE:
 * NEVER uses nodeId, sourceCellId, or timestamp.
 * Seed is derived purely from semantic features:
 * - featureVector (x_i)
 * - specialization
 * - traits
 * - generation
 * - capabilities
 * - domain
 */
export function deriveCellSemanticC0(input: CellSemanticChaosSeedInput): number {
  if (!input || !input.featureVector) {
    throw new Error('Cell semantic chaos seed requires a valid featureVector.');
  }

  const canonicalPayload = {
    featureVector: {
      computation: Number(input.featureVector.computation.toFixed(6)),
      reliability: Number(input.featureVector.reliability.toFixed(6)),
      cognition: Number(input.featureVector.cognition.toFixed(6)),
      knowledge: Number(input.featureVector.knowledge.toFixed(6)),
      specialization: Number(input.featureVector.specialization.toFixed(6)),
      experience: Number(input.featureVector.experience.toFixed(6)),
      resourceEfficiency: Number(input.featureVector.resourceEfficiency.toFixed(6))
    },
    specialization: (input.specialization ?? '').trim().toUpperCase(),
    traits: input.traits ? Object.fromEntries(
      Object.entries(input.traits).sort(([a], [b]) => a.localeCompare(b))
    ) : {},
    generation: typeof input.generation === 'number' ? input.generation : 1,
    capabilities: Array.isArray(input.capabilities) ? [...input.capabilities].sort() : [],
    domain: (input.domain ?? '').trim().toUpperCase()
  };

  const hash = computeDeterministicHash(canonicalPayload);

  // Take 8 hexadecimal characters (32 bits)
  const hexSlice = hash.replace(/[^0-9a-fA-F]/g, '').padEnd(8, 'a').substring(0, 8);
  const intVal = parseInt(hexSlice, 16);

  // Map into strictly bounded open interval [0.05, 0.95] to prevent edge fixed points
  const c0 = ((intVal % 900000) + 50000) / 1000000;
  validateChaosState(c0);
  return c0;
}

/**
 * Derives initial chaotic state c0 deterministically from an arbitrary payload.
 * Backward compatible helper for general seeds.
 */
export function deriveDeterministicC0(seed: string | object): number {
  if (!seed) {
    throw new Error('Deterministic c0 derivation requires a valid non-empty seed.');
  }

  const hash = typeof seed === 'string' && seed.length >= 16
    ? (seed.match(/^[0-9a-fA-F]+$/) ? seed : computeDeterministicHash({ seed }))
    : computeDeterministicHash(seed);

  const hexSlice = hash.replace(/[^0-9a-fA-F]/g, '').padEnd(8, 'a').substring(0, 8);
  const intVal = parseInt(hexSlice, 16);

  const c0 = ((intVal % 900000) + 50000) / 1000000;
  validateChaosState(c0);
  return c0;
}

/**
 * Computes bounded modulation factor:
 * m_t = 1 + lambda * (c_t - 0.5)
 * 
 * Since 0 < c_t < 1 and 0 <= lambda <= 0.2:
 * (c_t - 0.5) in (-0.5, 0.5)
 * lambda * (c_t - 0.5) in (-0.1, 0.1)
 * m_t in (0.9, 1.1)
 */
export function calculateChaosModulation(
  ct: number,
  lambda: number = DEFAULT_CHAOS_LAMBDA
): number {
  validateChaosParameters(DEFAULT_CHAOS_R, lambda);
  validateChaosState(ct);

  const mt = 1.0 + lambda * (ct - 0.5);

  // Strict mathematical bound check: m_t must stay in [1 - 0.5*lambda, 1 + 0.5*lambda]
  const minBound = 1.0 - (lambda * 0.5);
  const maxBound = 1.0 + (lambda * 0.5);
  if (mt < minBound - 1e-12 || mt > maxBound + 1e-12) {
    throw new Error(`Modulation mt=${mt} exceeded bounds [${minBound}, ${maxBound}]`);
  }

  return mt;
}

/**
 * Parameters for chaotic dynamics of a Cell.
 */
export interface CellChaosParameter {
  r: number;
  lambda: number;
}

/**
 * Per-Cell Chaotic Dynamics State:
 * Each Cell maintains:
 * - chaosState: current chaotic state c_{i,t} ∈ (0, 1)
 * - chaosStep: current iteration step t
 * - chaosParameter: { r, lambda }
 * - modulationFactor: m_{i,t} = 1 + lambda * (c_{i,t} - 0.5)
 */
export interface CellChaosState {
  chaosState: number;
  chaosStep: number;
  chaosParameter: CellChaosParameter;
  c0: number;
  ct: number;
  steps: number;
  r: number;
  lambda: number;
  modulationFactor: number;
  mt: number;
  sequence?: number[];
}

export interface ComputeCellChaosParams {
  seedInput: CellSemanticChaosSeedInput;
  steps?: number;
  r?: number;
  lambda?: number;
  initialC0?: number;
}

/**
 * Computes cell-specific chaotic dynamics:
 * 1. Derives c_{i,0} from semantic state (unless overridden).
 * 2. Iterates c_{i,t+1} = r * c_{i,t} * (1 - c_{i,t}) for t steps.
 * 3. Calculates m_{i,t} = 1 + lambda * (c_{i,t} - 0.5).
 */
export function computeCellChaosDynamics(params: ComputeCellChaosParams): CellChaosState {
  const r = params.r ?? DEFAULT_CHAOS_R;
  const lambda = params.lambda ?? DEFAULT_CHAOS_LAMBDA;
  const steps = params.steps ?? 1;

  validateChaosParameters(r, lambda);

  const c0 = params.initialC0 !== undefined ? params.initialC0 : deriveCellSemanticC0(params.seedInput);
  validateChaosState(c0);

  const iter = iterateLogisticMap(c0, steps, r);
  const ct = iter.ct;

  const mt = calculateChaosModulation(ct, lambda);

  return {
    chaosState: ct,
    chaosStep: steps,
    chaosParameter: { r, lambda },
    c0,
    ct,
    steps,
    r,
    lambda,
    modulationFactor: mt,
    mt,
    sequence: iter.sequence
  };
}

/**
 * Applies bounded modulation to an activated cognitive vector h_i:
 * h_tilde_i = h_i * m_{i,t}
 */
export function modulateActivatedVector(
  hVector: Record<string, number>,
  mt: number
): Record<string, number> {
  const modulated: Record<string, number> = {};
  for (const key of FEATURE_VECTOR_KEYS) {
    const hVal = hVector[key] ?? 0;
    modulated[key] = hVal * mt;
  }
  return modulated;
}

/**
 * State object recording nonlinear chaotic dynamics metadata across all participating cells.
 */
export interface NonlinearDynamicsState {
  r: number;
  lambda: number;
  steps: number;
  cellStates: Record<string, CellChaosState>;
  c0?: number;
  ct?: number;
  mt?: number;
}
