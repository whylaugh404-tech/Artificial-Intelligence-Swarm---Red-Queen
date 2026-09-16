import { describe, it, expect, beforeEach, vi } from 'vitest';
import { safeTanh, applyTanhVector } from '../src/redqueen/cognition/activation';
import {
  logisticMapStep,
  iterateLogisticMap,
  deriveDeterministicC0,
  calculateChaosModulation,
  modulateActivatedVector,
  validateChaosParameters,
  validateChaosState,
  DEFAULT_CHAOS_R,
  DEFAULT_CHAOS_LAMBDA
} from '../src/redqueen/cognition/chaos';
import { CollectiveCognitionEngine } from '../src/redqueen/cognition/collective/engine';
import { Cell } from '../src/redqueen/core/cell';
import { CellGenome } from '../src/redqueen/genome/types';
import {
  CognitiveFeatureVector,
  LinearTransformation,
  generateDeterministicMatrixAndBias,
  applyLinearTransformation
} from '../src/redqueen/cognition/types';

describe('P9.6 — Nonlinear Cognitive Dynamics: Tanh + Deterministic Chaos', () => {
  let engine: CollectiveCognitionEngine;
  let cellAlpha: Cell;
  let cellBeta: Cell;
  let cellGamma: Cell;

  const createMockCell = (
    id: string,
    specs: string,
    caps: string[],
    fitness = 0.9,
    generation = 1,
    riskTolerance = 0.2,
    exploration = 0.8
  ): Cell => {
    return {
      nodeId: id,
      lineageId: `lin_${id}`,
      genome: {
        genomeId: `gen_${id}`,
        lineageId: `lin_${id}`,
        generation,
        fitness,
        capabilities: caps,
        specialization: specs,
        traits: {
          riskTolerance,
          explorationVsExploitation: exploration
        }
      } as unknown as CellGenome,
      memoryStore: {
        put: vi.fn(),
        get: vi.fn(),
        query: vi.fn().mockResolvedValue([])
      } as any,
      p2pTransport: {
        start: vi.fn(),
        stop: vi.fn()
      } as any,
      evolutionEngine: {} as any,
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn().mockReturnValue({ mode: 'active', reliability: 0.95 }),
      submitTask: vi.fn()
    } as any;
  };

  beforeEach(() => {
    cellAlpha = createMockCell(
      'cell_alpha_p96',
      'QUANTUM_ALGORITHMS',
      ['COGNITIVE_REASONING', 'INFO_PROCESSING'],
      0.95,
      4,
      0.1,
      0.85
    );

    cellBeta = createMockCell(
      'cell_beta_p96',
      'PHYSICS_SIMULATION',
      ['COGNITIVE_REASONING', 'CODE_ANALYSIS'],
      0.88,
      3,
      0.25,
      0.7
    );

    cellGamma = createMockCell(
      'cell_gamma_p96',
      'NETWORK_TOPOLOGY',
      ['KNOWLEDGE_QUERY'],
      0.72,
      1,
      0.5,
      0.5
    );

    engine = new CollectiveCognitionEngine(cellAlpha);
  });

  describe('1. Nonlinear Tanh Activation (h_i = tanh(z_i))', () => {
    it('menghitung safeTanh dengan tepat, simetris, dan bernilai dalam (-1, 1)', () => {
      expect(safeTanh(0)).toBe(0);
      expect(safeTanh(1)).toBeCloseTo(Math.tanh(1), 10);
      expect(safeTanh(-1)).toBeCloseTo(Math.tanh(-1), 10);
      // Symmetry: tanh(-x) = -tanh(x)
      expect(safeTanh(-0.75)).toBeCloseTo(-safeTanh(0.75), 10);
      // Monotonicity
      expect(safeTanh(2)).toBeGreaterThan(safeTanh(1));
      expect(safeTanh(-1)).toBeGreaterThan(safeTanh(-2));
      // Strict bounds
      expect(safeTanh(0.5)).toBeGreaterThan(-1);
      expect(safeTanh(0.5)).toBeLessThan(1);
    });

    it('aman terhadap nilai ekstrem (±100, ±Infinity, NaN) tanpa overflow atau NaN', () => {
      expect(safeTanh(100)).toBe(1.0);
      expect(safeTanh(-100)).toBe(-1.0);
      expect(safeTanh(1e12)).toBe(1.0);
      expect(safeTanh(-1e12)).toBe(-1.0);
      expect(safeTanh(Infinity)).toBe(1.0);
      expect(safeTanh(-Infinity)).toBe(-1.0);
      expect(safeTanh(NaN)).toBe(0.0);
    });

    it('menerapkan aktivasi Tanh pada seluruh dimensi CognitiveFeatureVector (applyTanhVector)', () => {
      const zVector: Record<string, number> = {
        computation: 1.5,
        reliability: -0.8,
        cognition: 0.0,
        knowledge: 2.2,
        specialization: -1.2,
        experience: 0.45,
        resourceEfficiency: -0.1
      };

      const hVector = applyTanhVector(zVector);

      for (const [key, zVal] of Object.entries(zVector)) {
        expect(hVector[key]).toBeCloseTo(Math.tanh(zVal), 8);
        expect(hVector[key]).toBeGreaterThanOrEqual(-1.0);
        expect(hVector[key]).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe('2. Deterministic Chaos: Logistic Map & Bounded Modulation', () => {
    it('menghitung logistic map step c_{t+1} = r * c_t * (1 - c_t) secara deterministik', () => {
      const c0 = 0.35;
      const r = 3.9;
      const expectedNext = r * c0 * (1 - c0); // 3.9 * 0.35 * 0.65 = 0.88725
      const c1 = logisticMapStep(c0, r);

      expect(c1).toBeCloseTo(expectedNext, 10);
      expect(c1).toBeGreaterThan(0);
      expect(c1).toBeLessThan(1);
    });

    it('menolak parameter r dan state c di luar batasan matematis yang valid', () => {
      // r must be in (3.57, 4.0]
      expect(() => validateChaosParameters(3.5, 0.1)).toThrow();
      expect(() => validateChaosParameters(4.1, 0.1)).toThrow();
      expect(() => validateChaosParameters(3.9, 0.25)).toThrow(); // lambda > 0.2

      // c must be in (0, 1)
      expect(() => validateChaosState(0.0)).toThrow();
      expect(() => validateChaosState(1.0)).toThrow();
      expect(() => validateChaosState(-0.1)).toThrow();
      expect(() => validateChaosState(1.1)).toThrow();
    });

    it('menghasilkan deret chaotic yang deterministik dan identik untuk seed yang sama', () => {
      const c0 = 0.42;
      const iterA = iterateLogisticMap(c0, 10, DEFAULT_CHAOS_R);
      const iterB = iterateLogisticMap(c0, 10, DEFAULT_CHAOS_R);

      expect(iterA.sequence.length).toBe(11);
      expect(iterA.sequence).toEqual(iterB.sequence);
      expect(iterA.ct).toEqual(iterB.ct);

      // Verify chaotic divergence for slight variation
      const iterSlightlyDifferent = iterateLogisticMap(0.4200001, 10, DEFAULT_CHAOS_R);
      expect(iterA.ct).not.toEqual(iterSlightlyDifferent.ct);
    });

    it('menurunkan c0 deterministik dari state/payload tanpa Math.random()', () => {
      const payload1 = { domain: 'quantum', nodes: ['cell_1', 'cell_2'] };
      const payload2 = { domain: 'quantum', nodes: ['cell_1', 'cell_2'] };
      const payloadDifferent = { domain: 'biology', nodes: ['cell_1', 'cell_2'] };

      const c0_1 = deriveDeterministicC0(payload1);
      const c0_2 = deriveDeterministicC0(payload2);
      const c0_diff = deriveDeterministicC0(payloadDifferent);

      expect(c0_1).toBe(c0_2);
      expect(c0_1).toBeGreaterThan(0.0);
      expect(c0_1).toBeLessThan(1.0);
      expect(c0_1).not.toBe(c0_diff);
    });

    it('menghitung faktor modulasi m_t = 1 + lambda * (c_t - 0.5) dengan batas ketat [0.9, 1.1]', () => {
      const lambda = 0.1;

      // Extreme test points
      const mtNear0 = calculateChaosModulation(0.001, lambda);
      const mtMid = calculateChaosModulation(0.5, lambda);
      const mtNear1 = calculateChaosModulation(0.999, lambda);

      expect(mtMid).toBeCloseTo(1.0, 10);
      expect(mtNear0).toBeGreaterThanOrEqual(0.95);
      expect(mtNear1).toBeLessThanOrEqual(1.05);

      // Verify modulation equation
      const testCt = 0.8;
      const expectedMt = 1 + 0.1 * (0.8 - 0.5); // 1.03
      expect(calculateChaosModulation(testCt, 0.1)).toBeCloseTo(expectedMt, 10);
    });

    it('mengaplikasikan bounded modulation pada vektor yang teraktivasi (h_tilde = h * m_t)', () => {
      const hVec = { computation: 0.8, reliability: -0.4, cognition: 0.6 };
      const mt = 1.05;
      const modulated = modulateActivatedVector(hVec, mt);

      expect(modulated.computation).toBeCloseTo(0.8 * 1.05, 10);
      expect(modulated.reliability).toBeCloseTo(-0.4 * 1.05, 10);
      expect(modulated.cognition).toBeCloseTo(0.6 * 1.05, 10);
    });
  });

  describe('3. Collective Composition dengan Tanh + Chaos (C_t = sum alpha_i (h_i * m_t))', () => {
    it('menjalankan executeNonlinearComposition dengan benar dan mematuhi rumus C_t', () => {
      const population = [cellAlpha, cellBeta, cellGamma];
      const result = engine.executeNonlinearComposition(population, undefined, 'quantum');

      expect(result).toBeDefined();
      expect(result.compositionType).toBe('nonlinear_tanh_chaos');
      expect(result.activatedVectors).toBeDefined();
      expect(result.modulatedVectors).toBeDefined();
      expect(result.nonlinearDynamics).toBeDefined();

      // Check dynamics parameters
      const dyn = result.nonlinearDynamics!;
      expect(dyn.r).toBe(DEFAULT_CHAOS_R);
      expect(dyn.lambda).toBe(DEFAULT_CHAOS_LAMBDA);
      expect(dyn.c0).toBeGreaterThan(0);
      expect(dyn.c0).toBeLessThan(1);
      expect(dyn.ct).toBeGreaterThan(0);
      expect(dyn.ct).toBeLessThan(1);
      expect(dyn.mt).toBeGreaterThanOrEqual(0.95);
      expect(dyn.mt).toBeLessThanOrEqual(1.05);

      // Verify that activated vectors are h_i = tanh(z_i)
      for (const cell of population) {
        const trans = result.transformations[cell.nodeId];
        const h_i = result.activatedVectors![cell.nodeId];
        expect(h_i).toBeDefined();
        expect(h_i.computation).toBeCloseTo(Math.tanh(trans.transformedVector.computation), 6);
        expect(h_i.reliability).toBeCloseTo(Math.tanh(trans.transformedVector.reliability), 6);
      }

      // Verify that modulated vectors are h_tilde_i = h_i * m_t
      for (const cell of population) {
        const h_i = result.activatedVectors![cell.nodeId];
        const h_tilde = result.modulatedVectors![cell.nodeId];
        expect(h_tilde.computation).toBeCloseTo(h_i.computation * dyn.mt, 6);
      }

      // Verify weighted sum: C_t = sum alpha_i * h_tilde_i
      const expectedCComputation = population.reduce((sum, cell) => {
        const alpha = result.weights[cell.nodeId];
        const h_tilde = result.modulatedVectors![cell.nodeId];
        return sum + alpha * h_tilde.computation;
      }, 0);

      // Clamped to [0, 1] in final resultVector
      const expectedClamped = Math.max(0, Math.min(1, expectedCComputation));
      expect(result.resultVector.computation).toBeCloseTo(expectedClamped, 5);
    });

    it('menghasilkan determinisme penuh: input identik menghasilkan output identik', () => {
      const population = [cellAlpha, cellBeta, cellGamma];
      const run1 = engine.executeNonlinearComposition(population, undefined, 'quantum');
      const run2 = engine.executeNonlinearComposition(population, undefined, 'quantum');

      expect(run1.deterministicIdentity).toBe(run2.deterministicIdentity);
      expect(run1.collectiveId).toBe(run2.collectiveId);
      expect(run1.resultVector).toEqual(run2.resultVector);
      expect(run1.nonlinearDynamics).toEqual(run2.nonlinearDynamics);
    });

    it('TIDAK memutasi Cell state, genome, maupun memory apa pun', () => {
      const originalGenome = JSON.parse(JSON.stringify(cellAlpha.genome));
      const population = [cellAlpha, cellBeta];

      engine.executeNonlinearComposition(population, undefined, 'quantum');

      expect(cellAlpha.genome).toEqual(originalGenome);
      expect(cellAlpha.nodeId).toBe('cell_alpha_p96');
    });
  });

  describe('4. Feature Status Provenance (Explicit UNKNOWN handling)', () => {
    it('menangani data yang hilang dengan status UNKNOWN tanpa mengarang angka palsu', () => {
      const cellEmpty: Cell = {
        nodeId: 'cell_empty',
        lineageId: 'lin_empty',
        genome: {
          genomeId: 'gen_empty',
          lineageId: 'lin_empty'
          // No capabilities, traits, specialization, or generation
        } as unknown as CellGenome,
        memoryStore: {} as any,
        p2pTransport: {} as any,
        evolutionEngine: {} as any,
        start: vi.fn(),
        stop: vi.fn(),
        getState: vi.fn().mockReturnValue(null),
        submitTask: vi.fn()
      } as any;

      const { vector, statuses, provenance } = engine.extractFeatureVectorWithStatus(cellEmpty);

      expect(statuses.computation).toBe('UNKNOWN');
      expect(statuses.reliability).toBe('UNKNOWN');
      expect(statuses.cognition).toBe('UNKNOWN');
      expect(statuses.knowledge).toBe('UNKNOWN');
      expect(statuses.specialization).toBe('UNKNOWN');
      expect(statuses.experience).toBe('UNKNOWN');
      expect(statuses.resourceEfficiency).toBe('UNKNOWN');

      // Uses neutral uninformative prior (0.5 for neutral dimensions, 0.0 for specialization)
      expect(vector.computation).toBe(0.5);
      expect(vector.specialization).toBe(0.0);

      expect(provenance.some(p => p.includes('computation:UNKNOWN'))).toBe(true);
      expect(provenance.some(p => p.includes('specialization:UNKNOWN'))).toBe(true);
    });

    it('mengidentifikasi status KNOWN ketika data capability dan genome tersedia', () => {
      const { statuses, provenance } = engine.extractFeatureVectorWithStatus(cellAlpha, 'quantum');

      expect(statuses.computation).toBe('KNOWN');
      expect(statuses.cognition).toBe('KNOWN');
      expect(statuses.specialization).toBe('KNOWN');
      expect(provenance.some(p => p.includes('specialization:KNOWN'))).toBe(true);
    });
  });
});
