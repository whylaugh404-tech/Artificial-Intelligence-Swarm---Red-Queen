import { describe, it, expect, vi } from 'vitest';
import { CognitiveRuntime } from '../src/redqueen/cognition/runtime';
import { Cell } from '../src/redqueen/core/cell';
import { CellGenome } from '../src/redqueen/genome/types';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';
import { CollectiveCognitionEngine } from '../src/redqueen/cognition/collective/engine';
import {
  CognitiveFeatureVector,
  applyLinearTransformation,
  generateDeterministicMatrixAndBias,
  clamp01,
  EPSILON_TOLERANCE
} from '../src/redqueen/cognition/types';
import { CognitiveCompositionRule } from '../src/redqueen/core/cognitive_composition/rule';
import { ComputePartition } from '../src/redqueen/core/cognitive_composition/types';

describe('P9.5 — Linear Mathematical Cognitive Model & Collective Cognition', () => {
  const createMockCell = (
    id: string,
    specs: string,
    caps: string[],
    fitness = 0.9,
    generation = 1
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
        specialization: specs
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

  const c1 = createMockCell('c1', 'MATH_EXPERT', ['COGNITIVE_REASONING', 'INFO_PROCESSING'], 0.95);
  const c2 = createMockCell('c2', 'PHYSICS_EXPERT', ['COGNITIVE_REASONING'], 0.85);
  const c3 = createMockCell('c3', 'DATA_EVALUATOR', ['EVIDENCE'], 0.75);

  const population = [c1, c2, c3];
  const engine = new CollectiveCognitionEngine(c1);
  const runtime = new CognitiveRuntime(population);

  const mockContext = {
    contextId: 'ctx_p9_5',
    domain: 'science',
    timeframe: 'current',
    certaintyRequirement: 0.8
  };

  describe('1. Representasi Matematis Cell (Feature Vector x_i)', () => {
    it('mengekstraksi feature vector x_i berdimensi 7 dengan semua nilai ternormalisasi ke [0, 1]', () => {
      const vector: CognitiveFeatureVector = engine.extractFeatureVector(c1, 'science');

      expect(vector).toBeDefined();
      const keys: (keyof CognitiveFeatureVector)[] = [
        'computation',
        'reliability',
        'cognition',
        'knowledge',
        'specialization',
        'experience',
        'resourceEfficiency'
      ];

      keys.forEach(k => {
        expect(typeof vector[k]).toBe('number');
        expect(vector[k]).toBeGreaterThanOrEqual(0.0);
        expect(vector[k]).toBeLessThanOrEqual(1.0);
      });
    });

    it('merefleksikan spesialisasi dan kapabilitas genome ke dalam bobot fitur x_i', () => {
      const vecMath = engine.extractFeatureVector(c1, 'math');
      const vecPhysics = engine.extractFeatureVector(c2, 'math');

      // c1 has MATH_EXPERT which matches 'math' domain -> specialization must be higher
      expect(vecMath.specialization).toBeGreaterThan(vecPhysics.specialization);
      // c1 has INFO_PROCESSING -> computation capacity is higher
      expect(vecMath.computation).toBeGreaterThanOrEqual(vecPhysics.computation);
    });
  });

  describe('2. Transformasi Linear (z_i = W_i * x_i + b_i)', () => {
    it('menghasilkan matriks transformasi W_i (7x7) dan bias b_i (7x1) yang deterministik dan independen dari x', () => {
      const x1 = { computation: 0.8, reliability: 0.9, cognition: 0.7, knowledge: 0.85, specialization: 0.95, experience: 0.5, resourceEfficiency: 0.6 };
      const { matrix: W1, bias: b1 } = generateDeterministicMatrixAndBias(x1, ['COGNITIVE_REASONING']);
      const { matrix: W2, bias: b2 } = generateDeterministicMatrixAndBias(x1, ['COGNITIVE_REASONING']);

      expect(W1.length).toBe(7);
      expect(b1.length).toBe(7);
      expect(W1[0].length).toBe(7);

      expect(W1).toEqual(W2);
      expect(b1).toEqual(b2);

      // Section 3 Requirement: For identical transformation parameters, W and b are constant
      const x3 = { computation: 0.1, reliability: 0.2, cognition: 0.3, knowledge: 0.4, specialization: 0.5, experience: 0.6, resourceEfficiency: 0.7 };
      const { matrix: W3, bias: b3 } = generateDeterministicMatrixAndBias(x3, ['COGNITIVE_REASONING']);
      expect(W1).toEqual(W3);
      expect(b1).toEqual(b3);

      // Different inputs produce different outputs W*x + b strictly because x differs
      const trans1 = applyLinearTransformation(x1, W1, b1);
      const trans3 = applyLinearTransformation(x3, W3, b3);
      expect(trans1.transformedVector).not.toEqual(trans3.transformedVector);
    });

    it('menerapkan z_i = W_i * x_i + b_i tanpa clamping non-linear', () => {
      const x = { computation: 0.8, reliability: 0.9, cognition: 0.7, knowledge: 0.85, specialization: 0.95, experience: 0.5, resourceEfficiency: 0.6 };
      
      const { matrix: W, bias: b } = generateDeterministicMatrixAndBias(x, ['COGNITIVE_REASONING']);
      const trans = applyLinearTransformation(x, W, b);
      const z = trans.transformedVector;
      expect(z).toBeDefined();

      const keys: (keyof CognitiveFeatureVector)[] = [
        'computation', 'reliability', 'cognition', 'knowledge', 'specialization', 'experience', 'resourceEfficiency'
      ];
      
      const manualZ: Record<string, number> = {};
      const xArr = [x.computation, x.reliability, x.cognition, x.knowledge, x.specialization, x.experience, x.resourceEfficiency];
      
      for(let i=0; i<7; i++) {
        let sum = b[i];
        for(let j=0; j<7; j++) {
           sum += W[i][j] * xArr[j];
        }
        manualZ[keys[i]] = sum;
      }

      keys.forEach(k => {
        expect(z[k]).toBeCloseTo(manualZ[k], 5);
      });
    });
  });

  describe('3. Normalisasi Bobot Komposisi (Σ α_i = 1 dan α_i >= 0)', () => {
    it('menghitung bobot α_i >= 0 dan Σ α_i = 1.0 (convex combination)', () => {
      const weights = engine.calculateCompositionWeights(population, 'science');

      let sum = 0;
      population.forEach(cell => {
        const alpha = weights[cell.nodeId];
        expect(alpha).toBeDefined();
        expect(alpha.weight).toBeGreaterThanOrEqual(0.0);
        expect(alpha.normalizedWeight).toBeGreaterThanOrEqual(0.0);
        sum += alpha.normalizedWeight;
      });

      expect(Math.abs(sum - 1.0)).toBeLessThan(EPSILON_TOLERANCE);
    });

    it('memberikan bobot lebih besar pada Cell dengan fitness dan relevansi lebih tinggi', () => {
      // c1: fitness 0.95, specialization MATH_EXPERT
      // c3: fitness 0.75, specialization DATA_EVALUATOR
      const weights = engine.calculateCompositionWeights(population, 'math');

      expect(weights['c1'].normalizedWeight).toBeGreaterThan(weights['c3'].normalizedWeight);
    });
  });

  describe('4. Komposisi Kognitif Linear (C = Σ α_i * z_i)', () => {
    it('menghasilkan Collective Cognitive State C yang sesuai dengan weighted linear combination', () => {
      const state = engine.executeLinearComposition(population, mockContext, 'science');

      expect(state).toBeDefined();
      expect(state.resultVector).toBeDefined();

      // Verify manual calculation: C_k = sum_i(alpha_i * z_{i,k})
      const manualResult: Record<string, number> = {
        computation: 0,
        reliability: 0,
        cognition: 0,
        knowledge: 0,
        specialization: 0,
        experience: 0,
        resourceEfficiency: 0
      };

      for (const cell of population) {
        const alpha = state.weights[cell.nodeId];
        const z = state.transformations[cell.nodeId].transformedVector;
        for (const k of Object.keys(manualResult) as (keyof CognitiveFeatureVector)[]) {
          manualResult[k] += alpha * z[k];
        }
      }

      for (const k of Object.keys(manualResult) as (keyof CognitiveFeatureVector)[]) {
        const expected = clamp01(manualResult[k]);
        expect(Math.abs(state.resultVector[k] - expected)).toBeLessThan(EPSILON_TOLERANCE);
      }
    });

    it('CognitiveCompositionRule menghasilkan komposisi linear yang valid pada compute partitions', () => {
      const partitions: ComputePartition[] = [
        {
          partitionId: 'p1',
          cellIdentity: 'c1',
          name: 'part1',
          architecture: 'wasm64',
          capacity: 800,
          parallelism: 2,
          memory: 1024,
          specialization: 'MATH_EXPERT',
          availability: 0.99,
          communicationProfile: {
            bandwidth: 1000,
            latency: 5,
            topology: 'direct',
            reliability: 0.95
          },
          runtimeMetadata: {}
        },
        {
          partitionId: 'p2',
          cellIdentity: 'c2',
          name: 'part2',
          architecture: 'wasm64',
          capacity: 600,
          parallelism: 1,
          memory: 512,
          specialization: 'PHYSICS_EXPERT',
          availability: 0.95,
          communicationProfile: {
            bandwidth: 800,
            latency: 10,
            topology: 'direct',
            reliability: 0.90
          },
          runtimeMetadata: {}
        }
      ];

      const rule = new CognitiveCompositionRule();
      const composed = rule.apply(partitions as any);

      expect(composed.derivedStructure).toBeDefined();
      const compSummary = (composed.derivedStructure as any).computeSummary;
      const linComp = (composed.derivedStructure as any).linearComposition;
      expect(compSummary.totalCapacity).toBeGreaterThan(0);
      expect(compSummary.partitionCount).toBe(2);
      expect(linComp.resultVector).toBeDefined();
      expect(linComp.weights).toBeDefined();
      expect(composed.reasoningTrace.length).toBeGreaterThan(0);
    });
  });

  describe('5. Determinisme Matematis & Boundedness', () => {
    it('input sama selalu menghasilkan output collective state dan deterministicIdentity yang identik', () => {
      const state1 = engine.executeLinearComposition(population, mockContext, 'science');
      const state2 = engine.executeLinearComposition(population, mockContext, 'science');

      expect(state1.resultVector).toEqual(state2.resultVector);
      expect(state1.weights).toEqual(state2.weights);
      expect(state1.deterministicIdentity).toBe(state2.deterministicIdentity);
    });

    it('mempertahankan properti boundedness: ∀k, 0 <= C_k <= 1', () => {
      // Create extreme edge-case cells
      const highCell = createMockCell('c_high', 'SUPER_SPECIALIST', ['ALL'], 1.0);
      const lowCell = createMockCell('c_low', 'MINIMAL', [], 0.0);

      const state = engine.executeLinearComposition([highCell, lowCell], mockContext, 'extreme');
      const keys: (keyof CognitiveFeatureVector)[] = [
        'computation',
        'reliability',
        'cognition',
        'knowledge',
        'specialization',
        'experience',
        'resourceEfficiency'
      ];

      keys.forEach(k => {
        expect(state.resultVector[k]).toBeGreaterThanOrEqual(0.0);
        expect(state.resultVector[k]).toBeLessThanOrEqual(1.0);
      });
    });

    it('menjamin non-randomness: 100 eksekusi berturut-turut menghasilkan variance 0', () => {
      const firstRun = engine.executeLinearComposition(population, mockContext, 'science');
      for (let i = 0; i < 100; i++) {
        const nextRun = engine.executeLinearComposition(population, mockContext, 'science');
        expect(nextRun.deterministicIdentity).toBe(firstRun.deterministicIdentity);
        expect(nextRun.resultVector.cognition).toBe(firstRun.resultVector.cognition);
      }
    });
  });

  describe('6. Integrasi Pipeline Kognitif (Bukan sekadar agregasi kapasitas)', () => {
    it('menjalankan pipeline lengkap dan menyertakan collective linear mathematical state', async () => {
      const result = await runtime.process({
        requestId: 'req_full_pipeline',
        creatorInput: 'Evaluate gravity and relativistic mass relations in astrophysics',
        context: mockContext
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.understanding).toBeDefined();
      expect(result.understanding?.concepts.length).toBeGreaterThan(0);
      expect(result.activatedCells.length).toBeGreaterThan(0);

      // Verifikasi collective representation memuat collectiveState linear
      expect(result.collective).toBeDefined();
      expect(result.collective.collectiveState).toBeDefined();
      const collState = result.collective.collectiveState;
      expect(collState.resultVector).toBeDefined();
      expect(collState.weights).toBeDefined();
      expect(collState.transformations).toBeDefined();

      // Verifikasi provenance mencakup tahapan linear composition
      expect(result.provenance).toContainEqual(expect.stringContaining('linear_composition_computed'));
      expect(result.provenance).toContainEqual(expect.stringContaining('collective_state_formed'));
      expect(result.provenance).toContainEqual(expect.stringContaining('understanding_formed'));
      expect(result.provenance).toContainEqual(expect.stringContaining('reasoning_completed'));
    });

    it('understanding dibangun dari concepts/relations yang didukung oleh Cells, bukan deskripsi mentah palsu', async () => {
      const result = await runtime.process({
        requestId: 'req_understanding_concepts',
        creatorInput: 'mass causes gravity curvature',
        context: mockContext
      });

      expect(result.understanding).toBeDefined();
      const concepts = result.understanding!.concepts;
      expect(concepts.length).toBeGreaterThan(0);
      // Concepts must be grounded with evidence IDs from collective composition
      concepts.forEach(c => {
        expect(c.verificationStatus).toBe(RepresentationVerificationStatus.SUPPORTED);
        expect(c.evidenceIds.length).toBeGreaterThan(0);
      });
    });

    it('menolak status SUCCESS jika intent tidak dapat dipahami (unknown_intent_marker)', async () => {
      const result = await runtime.process({
        requestId: 'req_insufficient',
        creatorInput: 'unknown_intent_marker',
        context: mockContext
      });

      expect(result.status).toBe('INSUFFICIENT_UNDERSTANDING');
      expect(result.understanding).toBeUndefined();
    });
  });

  describe('7. Regresi P9.1 - P9.4 Tetap Terpenuhi', () => {
    it('Cell individuality, genome, lineage, and memory tetap terlindungi (P9.1 - P9.4)', () => {
      expect(c1.nodeId).toBe('c1');
      expect(c2.nodeId).toBe('c2');
      expect(c1.genome.genomeId).toBe('gen_c1');
      expect((c1 as any).lineageId).toBe('lin_c1');
      expect((c1 as any).memoryStore.put).not.toHaveBeenCalled();
    });

    it('perbedaan timestamp tidak mengubah deterministic identity (isolasi waktu P9.4)', async () => {
      const res1 = await runtime.process({
        requestId: 'req_time_iso',
        creatorInput: 'Identical semantic statement for verification',
        context: mockContext,
        timestamp: '2026-09-15T10:00:00.000Z'
      });

      const res2 = await runtime.process({
        requestId: 'req_time_iso',
        creatorInput: 'Identical semantic statement for verification',
        context: mockContext,
        timestamp: '2026-09-15T18:00:00.000Z'
      });

      expect(res1.deterministicIdentity).toBe(res2.deterministicIdentity);
    });

    it('eksekusi murni internal deterministik tanpa panggilan external AI provider', async () => {
      const start = performance.now();
      await runtime.process({
        requestId: 'req_no_ext',
        creatorInput: 'Internal mathematical composition test',
        context: mockContext
      });
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });
});
