import { describe, it, expect, beforeEach, vi } from 'vitest';
import { safeTanh, applyTanhVector } from '../src/redqueen/cognition/activation';
import {
  logisticMapStep,
  iterateLogisticMap,
  deriveDeterministicC0,
  deriveCellSemanticC0,
  computeCellChaosDynamics,
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
  applyLinearTransformation,
  getEpistemicMask,
  getEpistemicMaskRecord,
  arrayToVector
} from '../src/redqueen/cognition/types';
import {
  calculateEmergenceMetrics,
  generateDeterministicPerturbation,
  maskedDistance,
  maskedKLDivergence
} from '../src/redqueen/cognition/collective/emergence';

describe('P9.6 — Nonlinear Cognitive Dynamics: Tanh + Cell-Specific Deterministic Chaos', () => {
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

  describe('3. Semantic Seeding (Non-nodeId, Non-timestamp Invariant)', () => {
    it('menurunkan c_{i,0} murni dari cognitive/semantic state tanpa nodeId atau timestamp', () => {
      const featureVec: CognitiveFeatureVector = {
        computation: 0.85,
        reliability: 0.9,
        cognition: 0.75,
        knowledge: 0.8,
        specialization: 0.95,
        experience: 0.6,
        resourceEfficiency: 0.7
      };

      const seedInput1 = {
        featureVector: featureVec,
        specialization: 'QUANTUM_ALGORITHMS',
        traits: { riskTolerance: 0.2 },
        generation: 4,
        capabilities: ['COGNITIVE_REASONING'],
        domain: 'QUANTUM'
      };

      // Exactly identical semantic state
      const seedInput2 = {
        featureVector: { ...featureVec },
        specialization: 'QUANTUM_ALGORITHMS',
        traits: { riskTolerance: 0.2 },
        generation: 4,
        capabilities: ['COGNITIVE_REASONING'],
        domain: 'QUANTUM'
      };

      const c0_1 = deriveCellSemanticC0(seedInput1);
      const c0_2 = deriveCellSemanticC0(seedInput2);

      expect(c0_1).toBe(c0_2);
      expect(c0_1).toBeGreaterThan(0.0);
      expect(c0_1).toBeLessThan(1.0);

      // Verify that changing semantic state (e.g. specialization or generation) changes c0
      const seedInputDiff = {
        ...seedInput1,
        specialization: 'NEURAL_EMBEDDINGS'
      };
      const c0_diff = deriveCellSemanticC0(seedInputDiff);
      expect(c0_1).not.toBe(c0_diff);
    });

    it('memastikan c_{i,0} identik untuk dua cell dengan semantic state sama meskipun nodeId berbeda', () => {
      const mockCellA = createMockCell('cell_node_AAA', 'OPTIMIZATION', ['REASONING'], 0.9, 2);
      const mockCellB = createMockCell('cell_node_BBB', 'OPTIMIZATION', ['REASONING'], 0.9, 2);

      const featA = engine.extractFeatureVectorWithStatus(mockCellA).vector;
      const featB = engine.extractFeatureVectorWithStatus(mockCellB).vector;

      const c0_A = deriveCellSemanticC0({
        featureVector: featA,
        specialization: mockCellA.genome?.specialization,
        traits: mockCellA.genome?.traits,
        generation: mockCellA.genome?.generation,
        capabilities: mockCellA.genome?.capabilities
      });

      const c0_B = deriveCellSemanticC0({
        featureVector: featB,
        specialization: mockCellB.genome?.specialization,
        traits: mockCellB.genome?.traits,
        generation: mockCellB.genome?.generation,
        capabilities: mockCellB.genome?.capabilities
      });

      // Since semantic state is identical, c0 MUST be identical (proving nodeId is NOT used)
      expect(c0_A).toBe(c0_B);
    });
  });

  describe('4. Cell-Specific Chaos & Collective Composition', () => {
    it('menghasilkan chaotic dynamics yang spesifik per Cell (bukan global m_t)', () => {
      const population = [cellAlpha, cellBeta, cellGamma];
      const result = engine.executeNonlinearComposition(population, undefined, 'quantum');

      expect(result).toBeDefined();
      expect(result.compositionType).toBe('nonlinear_tanh_chaos');
      expect(result.nonlinearDynamics).toBeDefined();

      const dyn = result.nonlinearDynamics!;
      expect(dyn.cellStates).toBeDefined();
      expect(Object.keys(dyn.cellStates!)).toHaveLength(3);

      const stateAlpha = dyn.cellStates![cellAlpha.nodeId];
      const stateBeta = dyn.cellStates![cellBeta.nodeId];
      const stateGamma = dyn.cellStates![cellGamma.nodeId];

      // Verify each cell has its required fields
      for (const st of [stateAlpha, stateBeta, stateGamma]) {
        expect(st.chaosState).toBeGreaterThan(0);
        expect(st.chaosState).toBeLessThan(1);
        expect(st.c0).toBeGreaterThan(0);
        expect(st.c0).toBeLessThan(1);
        expect(st.ct).toBeGreaterThan(0);
        expect(st.ct).toBeLessThan(1);
        expect(st.chaosStep).toBe(1);
        expect(st.chaosParameter.r).toBe(DEFAULT_CHAOS_R);
        expect(st.chaosParameter.lambda).toBe(DEFAULT_CHAOS_LAMBDA);
        expect(st.modulationFactor).toBeGreaterThanOrEqual(0.95);
        expect(st.modulationFactor).toBeLessThanOrEqual(1.05);
      }

      // Crucial verification: Alpha and Beta have different semantic profiles,
      // so their initial chaos state c_{i,0} and modulation factors m_{i,t} are DIFFERENT.
      expect(stateAlpha.c0).not.toBe(stateBeta.c0);
      expect(stateAlpha.modulationFactor).not.toBe(stateBeta.modulationFactor);

      // Verify that each cell's modulated vector uses ITS OWN m_{i,t}
      for (const cell of population) {
        const h_i = result.activatedVectors![cell.nodeId];
        const h_tilde = result.modulatedVectors![cell.nodeId];
        const cellDyn = dyn.cellStates![cell.nodeId];

        expect(h_tilde.computation).toBeCloseTo(h_i.computation * cellDyn.modulationFactor, 6);
        expect(h_tilde.reliability).toBeCloseTo(h_i.reliability * cellDyn.modulationFactor, 6);
      }

      // Verify weighted collective composition: C_t = sum_i alpha_i * h_tilde_i
      const expectedCComputation = population.reduce((sum, cell) => {
        const alpha = result.weights[cell.nodeId];
        const h_tilde = result.modulatedVectors![cell.nodeId];
        return sum + alpha * h_tilde.computation;
      }, 0);

      const expectedClamped = Math.max(0, Math.min(1, expectedCComputation));
      expect(result.resultVector.computation).toBeCloseTo(expectedClamped, 5);
    });

    it('mendukung multi-step dynamics (steps > 1) dengan evolusi chaotic per Cell', () => {
      const population = [cellAlpha, cellBeta];
      const result = engine.executeNonlinearComposition(population, undefined, 'quantum', {
        steps: 5,
        r: 3.9,
        lambda: 0.15
      });

      const dyn = result.nonlinearDynamics!;
      expect(dyn.steps).toBe(5);

      for (const cell of population) {
        const cellChaos = dyn.cellStates![cell.nodeId];
        expect(cellChaos.chaosStep).toBe(5);
        expect(cellChaos.chaosParameter.r).toBe(3.9);
        expect(cellChaos.chaosParameter.lambda).toBe(0.15);
        expect(cellChaos.sequence).toBeDefined();
        expect(cellChaos.sequence!.length).toBe(6); // [c0, c1, c2, c3, c4, c5]
        expect(cellChaos.ct).toBe(cellChaos.sequence![5]);
      }
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

    it('mencatat provenance lengkap untuk setiap Cell chaos dan collective composition', () => {
      const population = [cellAlpha, cellBeta];
      const result = engine.executeNonlinearComposition(population, undefined, 'quantum');

      expect(result.provenance.some(p => p.startsWith('cell_specific_chaos:'))).toBe(true);
      expect(result.provenance.some(p => p.startsWith('deterministic_chaos_collective:'))).toBe(true);
      expect(result.provenance.some(p => p.includes('cell_alpha_p96'))).toBe(true);
      expect(result.provenance.some(p => p.includes('cell_beta_p96'))).toBe(true);
    });
  });

  describe('5. Feature Status Provenance & Absence of Heuristic Priors', () => {
    it('menangani data yang hilang dengan status UNKNOWN dan nilai 0.0 tanpa mengarang prior palsu (no fake 0.5)', () => {
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

      // Section 2A: No heuristic 0.5 prior! Unknown is explicitly undefined and UNKNOWN.
      expect(statuses.computation).toBe('UNKNOWN');
      expect(statuses.reliability).toBe('UNKNOWN');
      expect(statuses.cognition).toBe('UNKNOWN');
      expect(statuses.knowledge).toBe('UNKNOWN');
      expect(statuses.specialization).toBe('UNKNOWN');
      expect(statuses.experience).toBe('UNKNOWN');
      expect(statuses.resourceEfficiency).toBe('UNKNOWN');

      expect(vector.computation).toBeUndefined();
      expect(vector.reliability).toBeUndefined();
      expect(vector.cognition).toBeUndefined();
      expect(vector.knowledge).toBeUndefined();
      expect(vector.specialization).toBeUndefined();
      expect(vector.experience).toBeUndefined();
      expect(vector.resourceEfficiency).toBeUndefined();

      expect(provenance.some(p => p.includes('computation:UNKNOWN(no_actual_state)'))).toBe(true);
      expect(provenance.some(p => p.includes('cognition:UNKNOWN(no_actual_state)'))).toBe(true);
      expect(provenance.some(p => p.includes('specialization:UNKNOWN(no_specialization_declared)'))).toBe(true);
    });

    it('mengidentifikasi status KNOWN secara eksklusif dari cognitive/operational state aktual', () => {
      const cellWithRealState: Cell = {
        nodeId: 'cell_real_state',
        lineageId: 'lin_real',
        genome: {
          genomeId: 'gen_real',
          lineageId: 'lin_real',
          specialization: 'QUANTUM_COMPUTING'
        } as unknown as CellGenome,
        memoryStore: {} as any,
        p2pTransport: {} as any,
        evolutionEngine: {} as any,
        start: vi.fn(),
        stop: vi.fn(),
        getState: vi.fn().mockReturnValue({
          computation: 0.85,
          reliability: 0.95,
          cognition: 0.90,
          knowledge: 0.70,
          experience: 0.60,
          resourceEfficiency: 0.80
        }),
        submitTask: vi.fn()
      } as any;

      const { vector, statuses, provenance } = engine.extractFeatureVectorWithStatus(cellWithRealState, 'quantum');

      expect(statuses.computation).toBe('KNOWN_VALUE');
      expect(statuses.reliability).toBe('KNOWN_VALUE');
      expect(statuses.cognition).toBe('KNOWN_VALUE');
      expect(statuses.knowledge).toBe('KNOWN_VALUE');
      expect(statuses.specialization).toBe('KNOWN_VALUE');
      expect(statuses.experience).toBe('KNOWN_VALUE');
      expect(statuses.resourceEfficiency).toBe('KNOWN_VALUE');

      expect(vector.computation).toBe(0.85);
      expect(vector.reliability).toBe(0.95);
      expect(vector.cognition).toBe(0.90);
      expect(vector.knowledge).toBe(0.70);
      expect(vector.specialization).toBe(1.0);
      expect(vector.experience).toBe(0.60);
      expect(vector.resourceEfficiency).toBe(0.80);

      expect(provenance.some(p => p.includes('computation:KNOWN_VALUE(cell_state:0.85)'))).toBe(true);
      expect(provenance.some(p => p.includes('specialization:KNOWN_VALUE(domain_match:QUANTUM_COMPUTING_matches_quantum)'))).toBe(true);
    });

    it('perubahan metadata tidak mengubah cognitive feature secara palsu jika actual state tidak berubah', () => {
      const baseCellState = { computation: 0.75, reliability: 0.88 };

      const cellMeta1: Cell = {
        nodeId: 'cell_meta_1',
        lineageId: 'lin_1',
        genome: {
          genomeId: 'gen_1',
          lineageId: 'lin_1',
          generation: 1,
          capabilities: ['KNOWLEDGE_QUERY']
        } as any,
        getState: vi.fn().mockReturnValue(baseCellState)
      } as any;

      const cellMeta2: Cell = {
        nodeId: 'cell_meta_2',
        lineageId: 'lin_1',
        genome: {
          genomeId: 'gen_2',
          lineageId: 'lin_1',
          generation: 99, // 99 generations higher
          capabilities: ['COGNITIVE_REASONING', 'CODE_ANALYSIS', 'MASSIVE_COMPUTE']
        } as any,
        getState: vi.fn().mockReturnValue(baseCellState)
      } as any;

      const feat1 = engine.extractFeatureVectorWithStatus(cellMeta1);
      const feat2 = engine.extractFeatureVectorWithStatus(cellMeta2);

      // Computation and reliability come strictly from baseCellState
      expect(feat1.vector.computation).toBe(feat2.vector.computation);
      expect(feat1.vector.reliability).toBe(feat2.vector.reliability);
      // Cognition is NOT fabricated from capabilities, remains undefined and UNKNOWN
      expect(feat1.vector.cognition).toBeUndefined();
      expect(feat2.vector.cognition).toBeUndefined();
      expect(feat1.statuses.cognition).toBe('UNKNOWN');
      expect(feat2.statuses.cognition).toBe('UNKNOWN');
    });
  });

  describe('6. Mathematical Invariants: Affine Independence & Nonlinear Range', () => {
    it('memastikan W dan b strictly invariant terhadap input vector x dan nodeId', () => {
      const vecX1: CognitiveFeatureVector = {
        computation: 0.9,
        reliability: 0.8,
        cognition: 0.7,
        knowledge: 0.6,
        specialization: 0.5,
        experience: 0.4,
        resourceEfficiency: 0.3
      };
      const vecX2: CognitiveFeatureVector = {
        computation: 0.1,
        reliability: 0.2,
        cognition: 0.3,
        knowledge: 0.4,
        specialization: 0.5,
        experience: 0.6,
        resourceEfficiency: 0.7
      };

      const params = { capabilities: ['COGNITIVE_REASONING'], specialization: 'MATH_SPECIALIST' };

      const { matrix: W1, bias: b1 } = generateDeterministicMatrixAndBias(vecX1, params.capabilities, params.specialization);
      const { matrix: W2, bias: b2 } = generateDeterministicMatrixAndBias(vecX2, params.capabilities, params.specialization);

      // Mathematical Requirement: W(x1) === W(x2) and b(x1) === b(x2)
      expect(W1).toEqual(W2);
      expect(b1).toEqual(b2);

      // Output z differs purely because x differs: W*x1 + b != W*x2 + b
      const trans1 = applyLinearTransformation(vecX1, W1, b1);
      const trans2 = applyLinearTransformation(vecX2, W2, b2);
      expect(trans1.transformedVector).not.toEqual(trans2.transformedVector);
    });

    it('mempertahankan un-clamped nonlinear spectrum (nonlinearCollectiveVector) tanpa truncation tersembunyi', () => {
      const population = [cellAlpha, cellBeta];
      const result = engine.executeNonlinearComposition(population, undefined, 'quantum');

      expect(result.nonlinearCollectiveVector).toBeDefined();
      expect(result.compositionType).toBe('nonlinear_tanh_chaos');

      // The un-clamped vector exists alongside the bounded unit-interval resultVector
      for (const [key, val] of Object.entries(result.nonlinearCollectiveVector!)) {
        expect(typeof val).toBe('number');
        expect(Number.isFinite(val)).toBe(true);
      }
      expect(result.provenance).toContain('nonlinear_spectrum_preserved:full_range');
    });

    it('menolak iterasi chaos yang melebihi batas kedalaman siklus maksimum (MAX_COGNITIVE_CYCLE_DEPTH)', () => {
      expect(() => iterateLogisticMap(0.5, 101)).toThrow(/satisfying 0 <= steps <= 100/);
    });

    it('menghasilkan EpistemicFeatureRecord dengan granular provenance pada featureDetails', () => {
      const population = [cellAlpha, cellBeta];
      const result = engine.executeNonlinearComposition(population, undefined, 'quantum');

      expect(result.featureDetails).toBeDefined();
      expect(result.featureDetails![cellAlpha.nodeId]).toBeDefined();
      const alphaDetails = result.featureDetails![cellAlpha.nodeId];

      expect(alphaDetails.reliability.status).toBe('KNOWN_VALUE');
      expect(alphaDetails.reliability.provenance).toContain('reliability:');
      expect(alphaDetails.specialization.status).toBe('KNOWN_VALUE');
      expect(alphaDetails.specialization.provenance).toContain('domain_match');
      expect(alphaDetails.computation.status).toBe('UNKNOWN');
      expect(alphaDetails.computation.provenance).toContain('computation:UNKNOWN');
    });

    it('menghitung kuantifikasi metrik Emergence secara matematis dalam CollectiveRepresentation', () => {
      const mockUnderstanding: any = {
        understandingId: 'und_test',
        conceptId: 'con_alpha',
        epistemicStatus: 'BELIEVED',
        confidence: 0.8,
        groundingEvidenceIds: [],
        uncertaintyFactors: [],
        timestamp: '2026-09-16T00:00:00.000Z'
      };

      const context = {
        contextId: 'ctx_emergence',
        domain: 'quantum',
        environment: 'swarm',
        activeGoals: ['synthesize'],
        constraints: [],
        timestamp: '2026-09-16T00:00:00.000Z'
      };

      const contributions = [
        {
          cellId: cellAlpha.nodeId,
          contributionType: 'CONCEPT' as const,
          content: { conceptId: 'con_alpha', canonicalName: 'EntangledQubit' }
        },
        {
          cellId: cellBeta.nodeId,
          contributionType: 'CONCEPT' as const,
          content: { conceptId: 'con_beta', canonicalName: 'SuperpositionState' }
        }
      ];

      const representation = engine.compose(mockUnderstanding, contributions, context);

      expect(representation.emergenceMetrics).toBeDefined();
      const em = representation.emergenceMetrics!;
      expect(typeof em.synergy).toBe('number');
      expect(typeof em.informationGain).toBe('number');
      expect(typeof em.coherence).toBe('number');
      expect(typeof em.stability).toBe('number');
      expect(typeof em.isEmergent).toBe('boolean');
      expect(em.metricSummary).toBeDefined();
      expect(representation.provenance.some(p => p.startsWith('emergence_metrics_computed:'))).toBe(true);
    });

    it('menghitung bobot komposisi secara deterministik tanpa fallback prior fitness palsu', () => {
      const cellAllUnknown: Cell = {
        nodeId: 'cell_no_fitness',
        lineageId: 'lin_1',
        genome: {
          genomeId: 'gen_1',
          lineageId: 'lin_1'
        } as unknown as CellGenome,
        memoryStore: {} as any,
        p2pTransport: {} as any,
        evolutionEngine: {} as any,
        start: vi.fn(),
        stop: vi.fn(),
        getState: vi.fn().mockReturnValue({}), // Completely unknown state
        submitTask: vi.fn()
      } as any;

      const weights = engine.calculateCompositionWeights([cellAllUnknown]);
      expect(weights['cell_no_fitness']).toBeDefined();
      expect(weights['cell_no_fitness'].weight).toBe(0.0); // Not 0.5 fabricated
    });
  });

  describe('7. P9.6.1 Precision Repairs: Epistemic Distinctions, Perturbation Stability & Strict Emergence Gates', () => {
    it('membuktikan bahwa UNKNOWN !== KNOWN_ZERO secara epistemik dan representasional', () => {
      const cellZero: Cell = {
        nodeId: 'cell_zero_test',
        lineageId: 'lin_1',
        genome: { genomeId: 'g1', lineageId: 'lin_1' } as any,
        getState: vi.fn().mockReturnValue({ computation: 0.0 }) // Known zero
      } as any;

      const cellMissing: Cell = {
        nodeId: 'cell_missing_test',
        lineageId: 'lin_1',
        genome: { genomeId: 'g2', lineageId: 'lin_1' } as any,
        getState: vi.fn().mockReturnValue({}) // No computation field at all
      } as any;

      const resZero = engine.extractFeatureVectorWithStatus(cellZero);
      const resMissing = engine.extractFeatureVectorWithStatus(cellMissing);

      // 1. Explicit distinction
      expect(resZero.statuses.computation).toBe('KNOWN_ZERO');
      expect(resZero.vector.computation).toBe(0.0);

      expect(resMissing.statuses.computation).toBe('UNKNOWN');
      expect(resMissing.vector.computation).toBeUndefined();

      // 2. UNKNOWN must not equal KNOWN_ZERO
      expect(resMissing.statuses.computation).not.toBe(resZero.statuses.computation);
      expect(resMissing.vector.computation).not.toBe(resZero.vector.computation);

      // 3. Epistemic mask validity
      const maskZero = getEpistemicMaskRecord(resZero.vector);
      const maskMissing = getEpistemicMaskRecord(resMissing.vector);

      expect(maskZero.computation).toBe(true);
      expect(maskMissing.computation).toBe(false);
    });

    it('membuktikan bahwa UNKNOWN tidak diperlakukan sebagai numeric zero dalam transformasi matematis', () => {
      // Vector A has computation = 0.0 (KNOWN_ZERO), reliability = 0.8
      const vecKnownZero: CognitiveFeatureVector = {
        computation: 0.0,
        reliability: 0.8,
        cognition: 0.5,
        knowledge: 0.5,
        specialization: 0.5,
        experience: 0.5,
        resourceEfficiency: 0.5
      };

      // Vector B has computation = undefined (UNKNOWN), reliability = 0.8
      const vecUnknown: CognitiveFeatureVector = {
        computation: undefined,
        reliability: 0.8,
        cognition: 0.5,
        knowledge: 0.5,
        specialization: 0.5,
        experience: 0.5,
        resourceEfficiency: 0.5
      };

      const { matrix, bias } = generateDeterministicMatrixAndBias('quantum');

      const transKnownZero = applyLinearTransformation(vecKnownZero, matrix, bias);
      const transUnknown = applyLinearTransformation(vecUnknown, matrix, bias);

      // In vecUnknown, computation is omitted from the valid dimension set and weights re-normalized over known features
      // In vecKnownZero, computation enters the dot product as 0.0 with full 7-dim weighting
      // Therefore transUnknown MUST NOT equal transKnownZero!
      expect(transUnknown.transformedVector.computation).not.toEqual(transKnownZero.transformedVector.computation);
      expect(transUnknown.transformedVector.reliability).not.toEqual(transKnownZero.transformedVector.reliability);
    });

    it('membuktikan stabilitas emergence berbasis perturbasi input riil (dual-pass sensitivity)', () => {
      const { matrix, bias } = generateDeterministicMatrixAndBias('quantum');
      const transformations: Record<string, LinearTransformation> = {
        'cell_alpha_p96': {
          dimension: 7,
          matrix,
          bias,
          transformedVector: { computation: 0.7, reliability: 0.8, cognition: 0.75, knowledge: 0.6, specialization: 0.9, experience: 0.5, resourceEfficiency: 0.6 },
          provenance: ['trans_alpha']
        },
        'cell_beta_p96': {
          dimension: 7,
          matrix,
          bias,
          transformedVector: { computation: 0.6, reliability: 0.7, cognition: 0.65, knowledge: 0.8, specialization: 0.7, experience: 0.6, resourceEfficiency: 0.7 },
          provenance: ['trans_beta']
        }
      };

      const baselineInput = {
        'cell_alpha_p96': { computation: 0.7, reliability: 0.8, cognition: 0.75, knowledge: 0.6, specialization: 0.9, experience: 0.5, resourceEfficiency: 0.6 },
        'cell_beta_p96': { computation: 0.6, reliability: 0.7, cognition: 0.65, knowledge: 0.8, specialization: 0.7, experience: 0.6, resourceEfficiency: 0.7 }
      };

      const weights = {
        'cell_alpha_p96': 0.6,
        'cell_beta_p96': 0.4
      };

      const resultVector = {
        computation: 0.66,
        reliability: 0.76,
        cognition: 0.71,
        knowledge: 0.68,
        specialization: 0.82,
        experience: 0.54,
        resourceEfficiency: 0.64
      };

      const metrics = calculateEmergenceMetrics({
        resultVector,
        inputVectors: baselineInput,
        weights,
        transformations,
        emergentStructuresCount: 1,
        evidenceCount: 2,
        hasEvidence: true
      });

      // Sensitivity and stability are derived from dual-pass perturbed execution
      expect(metrics.sensitivity).toBeDefined();
      expect(metrics.sensitivity).toBeGreaterThanOrEqual(0);
      expect(metrics.stability).toBeCloseTo(1 / (1 + metrics.sensitivity!), 5);
      expect(metrics.gates.isReproducible).toBe(false);
    });

    it('memverifikasi bahwa isEmergent adalah Strict Boolean Gate yang membutuhkan semua 7 kondisi', () => {
      const { matrix, bias } = generateDeterministicMatrixAndBias('quantum');
      const transformations: Record<string, LinearTransformation> = {
        'cell_alpha_p96': {
          dimension: 7,
          matrix,
          bias,
          transformedVector: { computation: 0.8, reliability: 0.9, cognition: 0.85, knowledge: 0.7, specialization: 0.95, experience: 0.6, resourceEfficiency: 0.7 },
          provenance: ['trans_alpha']
        },
        'cell_beta_p96': {
          dimension: 7,
          matrix,
          bias,
          transformedVector: { computation: 0.3, reliability: 0.4, cognition: 0.35, knowledge: 0.5, specialization: 0.4, experience: 0.5, resourceEfficiency: 0.4 },
          provenance: ['trans_beta']
        }
      };

      const baselineInput = {
        'cell_alpha_p96': { computation: 0.8, reliability: 0.9, cognition: 0.85, knowledge: 0.7, specialization: 0.95, experience: 0.6, resourceEfficiency: 0.7 },
        'cell_beta_p96': { computation: 0.3, reliability: 0.4, cognition: 0.35, knowledge: 0.5, specialization: 0.4, experience: 0.5, resourceEfficiency: 0.4 }
      };

      const weights = {
        'cell_alpha_p96': 0.5,
        'cell_beta_p96': 0.5
      };

      // Result with high synergy and baseline divergence
      const resultVector = {
        computation: 0.75,
        reliability: 0.85,
        cognition: 0.80,
        knowledge: 0.75,
        specialization: 0.90,
        experience: 0.70,
        resourceEfficiency: 0.75
      };

      // Condition 1: Missing evidence -> isEmergent must be FALSE
      const metricsNoEvidence = calculateEmergenceMetrics({
        resultVector,
        inputVectors: baselineInput,
        weights,
        transformations,
        emergentStructuresCount: 2,
        evidenceCount: 0,
        hasEvidence: false
      });
      expect(metricsNoEvidence.isEmergent).toBe(false);

      // Condition 2: No structural novelty -> isEmergent must be FALSE
      const metricsNoNovelty = calculateEmergenceMetrics({
        resultVector,
        inputVectors: baselineInput,
        weights,
        transformations,
        emergentStructuresCount: 0,
        evidenceCount: 3,
        hasEvidence: true
      });
      expect(metricsNoNovelty.isEmergent).toBe(false);

      // Condition 3: Single cell (no interaction) -> isEmergent must be FALSE
      const metricsSingleCell = calculateEmergenceMetrics({
        resultVector,
        inputVectors: { 'cell_alpha_p96': baselineInput['cell_alpha_p96'] },
        weights: { 'cell_alpha_p96': 1.0 },
        transformations: { 'cell_alpha_p96': transformations['cell_alpha_p96'] },
        emergentStructuresCount: 2,
        evidenceCount: 3,
        hasEvidence: true
      });
      expect(metricsSingleCell.isEmergent).toBe(false);

      // Condition 4: Zero baseline deviation -> isEmergent must be FALSE
      const avgVec = {
        computation: 0.55,
        reliability: 0.65,
        cognition: 0.60,
        knowledge: 0.60,
        specialization: 0.675,
        experience: 0.55,
        resourceEfficiency: 0.55
      };
      const metricsNoDev = calculateEmergenceMetrics({
        resultVector: avgVec,
        inputVectors: baselineInput,
        weights,
        transformations,
        emergentStructuresCount: 2,
        evidenceCount: 3,
        hasEvidence: true
      });
      expect(metricsNoDev.isEmergent).toBe(false);

      // Condition 5: All conditions satisfied -> isEmergent is strictly evaluated
      const fullMetrics = calculateEmergenceMetrics({
        resultVector,
        inputVectors: baselineInput,
        weights,
        transformations,
        emergentStructuresCount: 2,
        evidenceCount: 3,
        hasEvidence: true
      });
      // The gate summary must explicitly document all 7 boolean gates
      expect(fullMetrics.gates).toBeDefined();
      expect(typeof fullMetrics.gates.hasInteraction).toBe('boolean');
      expect(typeof fullMetrics.gates.hasBaselineDeviation).toBe('boolean');
      expect(typeof fullMetrics.gates.hasInformationGain).toBe('boolean');
      expect(typeof fullMetrics.gates.hasStructuralNovelty).toBe('boolean');
      expect(typeof fullMetrics.gates.hasEvidence).toBe('boolean');
      expect(typeof fullMetrics.gates.isReproducible).toBe('boolean');
      expect(typeof fullMetrics.gates.hasValidStability).toBe('boolean');

      const g = fullMetrics.gates;
      const expectedEmergent = g.hasInteraction && g.hasBaselineDeviation && g.hasInformationGain && g.hasStructuralNovelty && g.hasEvidence && g.isReproducible && g.hasValidStability;
      expect(fullMetrics.isEmergent).toBe(expectedEmergent);
    });
  });
});

  describe('P9.6.2 — Final Mathematical Integrity Repairs', () => {
    it('TEST A — preserves UNKNOWN as undefined in arrayToVector', () => {
      const result = arrayToVector([
        undefined,
        1,
        0,
        undefined,
        0.5,
        undefined,
        0.9
      ]);

      expect(result.computation).toBeUndefined();
      expect(result.reliability).toBe(1);
      expect(result.cognition).toBe(0);
      expect(result.knowledge).toBeUndefined();
      expect(result.specialization).toBe(0.5);
      expect(result.experience).toBeUndefined();
      expect(result.resourceEfficiency).toBe(0.9);
    });

    it('TEST B — distinguishes known zero from UNKNOWN', () => {
      const result = arrayToVector([
        0,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      ]);

      expect(result.computation).toBe(0);
      expect(result.reliability).toBeUndefined();
    });

    it('TEST C — handles known dimension + unknown baseline in KL divergence without NaN or Infinity', () => {
      const p = [0.4, undefined];
      const q = [0.2, undefined];
      const kl = maskedKLDivergence(p, q);
      expect(kl).toBeDefined();
      expect(Number.isFinite(kl)).toBe(true);
      expect(isNaN(kl!)).toBe(false);

      const res = calculateEmergenceMetrics({
        resultVector: { computation: 0.8, reliability: undefined, cognition: 0.5 },
        inputVectors: {
          cell1: { computation: undefined, reliability: 0.7, cognition: 0.3 }
        },
        weights: { cell1: 1.0 }
      });
      expect(Number.isFinite(res.informationGain)).toBe(true);
      expect(isNaN(res.informationGain)).toBe(false);
    });

    it('TEST D — perturbs boundary values 0 and 1 deterministically with positive epsilon', () => {
      const perturbed = generateDeterministicPerturbation([0, 1, 0.5], 0.02);
      expect(perturbed[0]).toBeGreaterThan(0);
      expect(perturbed[1]).toBeLessThan(1);
      expect(perturbed[0]).toBeCloseTo(0.02, 6);
      expect(perturbed[1]).toBeCloseTo(0.98, 6);
    });

    it('TEST E — requires all seven emergence gates to be true for isEmergent === true', () => {
      const inputVectors = {
        cell1: { computation: 0.8 },
        cell2: { computation: 0.1 }
      };

      const allTrueParams = {
        resultVector: { computation: 0.9 },
        inputVectors,
        weights: { cell1: 0.5, cell2: 0.5 },
        hasInteraction: true,
        hasBaselineDeviation: true,
        hasInformationGain: true,
        hasStructuralNovelty: true,
        hasEvidence: true,
        isReproducible: true,
        hasValidStability: true
      };

      const res = calculateEmergenceMetrics(allTrueParams);
      expect(res.isEmergent).toBe(true);
      expect(res.status).toBe('VERIFIED');

      const gatesToTest = [
        'hasInteraction',
        'hasBaselineDeviation',
        'hasInformationGain',
        'hasStructuralNovelty',
        'hasEvidence',
        'isReproducible',
        'hasValidStability'
      ] as const;

      for (const gate of gatesToTest) {
        const testParams = { ...allTrueParams, [gate]: false };
        const testRes = calculateEmergenceMetrics(testParams as any);
        expect(testRes.isEmergent).toBe(false);
        expect(testRes.status).not.toBe('VERIFIED');
      }
    });

    it('TEST F — defaults hasEvidence, hasStructuralNovelty, and isReproducible to false when missing', () => {
      const inputVectors = {
        cell1: { computation: 0.8 },
        cell2: { computation: 0.2 }
      };

      const res = calculateEmergenceMetrics({
        resultVector: { computation: 0.9 },
        inputVectors,
        weights: { cell1: 0.5, cell2: 0.5 }
      });

      expect(res.gates.hasEvidence).toBe(false);
      expect(res.gates.hasStructuralNovelty).toBe(false);
      expect(res.gates.isReproducible).toBe(false);
      expect(res.isEmergent).toBe(false);
    });

    it('TEST G — prevents caller from forcing VERIFIED status when conditions are not satisfied', () => {
      const inputVectors = {
        cell1: { computation: 0.8 },
        cell2: { computation: 0.2 }
      };

      const overrideParams = {
        resultVector: { computation: 0.9 },
        inputVectors,
        weights: { cell1: 0.5, cell2: 0.5 },
        status: 'VERIFIED' as const,
        hasEvidence: false,
        hasStructuralNovelty: false,
        isReproducible: false
      };

      const res = calculateEmergenceMetrics(overrideParams as any);
      expect(res.status).not.toBe('VERIFIED');
    });

    it('calculates maskedDistance ignoring undefined and returning undefined if no shared dimensions', () => {
      expect(maskedDistance([undefined, 1], [0, 1])).toBe(0);
      expect(maskedDistance([undefined], [undefined])).toBeUndefined();
    });

    it('generates perturbation independent of cell identity', () => {
      const base = [0.4, 0.6];
      const perturbed = generateDeterministicPerturbation(base, 0.001);
      expect(perturbed).not.toEqual(base);

      const a = generateDeterministicPerturbation([0.4, 0.6], 0.001);
      const b = generateDeterministicPerturbation([0.4, 0.6], 0.001);
      expect(a).toEqual(b);
    });
  });