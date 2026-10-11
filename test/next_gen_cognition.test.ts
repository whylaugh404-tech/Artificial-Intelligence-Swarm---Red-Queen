import { describe, it, expect } from 'vitest';
import { 
  Hypervector, 
  bundle, 
  AssociativeItemMemory 
} from '../src/redqueen/cognition/hdc';
import { MicroTokenizer } from '../src/redqueen/cognition/tokenizer';
import { LinearSSMCell } from '../src/redqueen/learning/linear_ssm';
import { 
  CellularMoERouter, 
  LogicExpert, 
  KnowledgeExpert, 
  DialogueExpert, 
  ToolActionExpert 
} from '../src/redqueen/learning/cellular_moe';

describe('Next-Gen Edge Cognition: HDC, Linear SSM, and Cellular MoE', () => {

  describe('1. Hyperdimensional Computing (HDC / VSA)', () => {
    it('generates deterministic hypervectors from labels', () => {
      const v1 = Hypervector.fromLabel('concept_red_queen', 2048);
      const v2 = Hypervector.fromLabel('concept_red_queen', 2048);
      const v3 = Hypervector.fromLabel('concept_cell', 2048);

      expect(v1.dimension).toBe(2048);
      expect(v1.similarity(v2)).toBe(1.0); // Exact match
      // Orthogonal/random vectors have similarity near ~0.5
      const simDiff = v1.similarity(v3);
      expect(simDiff).toBeGreaterThan(0.40);
      expect(simDiff).toBeLessThan(0.60);
    });

    it('implements binding (XOR) with self-inverting property', () => {
      const role = Hypervector.fromLabel('role:guardian', 1024);
      const filler = Hypervector.fromLabel('entity:queen', 1024);

      // Binding creates a concept pair
      const bound = role.bind(filler);

      // Bound vector is dissimilar to components
      expect(bound.similarity(role)).toBeLessThan(0.60);
      expect(bound.similarity(filler)).toBeLessThan(0.60);

      // Unbinding: A * B * B = A (Self-inversion)
      const recoveredRole = bound.bind(filler);
      expect(recoveredRole.similarity(role)).toBe(1.0);
    });

    it('implements bundling (majority superposition) preserving component similarity', () => {
      const v1 = Hypervector.fromLabel('dog', 2048);
      const v2 = Hypervector.fromLabel('cat', 2048);
      const v3 = Hypervector.fromLabel('horse', 2048);

      const bundled = bundle([v1, v2, v3]);

      // Superposition vector retains similarity to each constituent (>0.60)
      expect(bundled.similarity(v1)).toBeGreaterThan(0.60);
      expect(bundled.similarity(v2)).toBeGreaterThan(0.60);
      expect(bundled.similarity(v3)).toBeGreaterThan(0.60);

      // Dissimilar to non-constituent
      const unrelated = Hypervector.fromLabel('airplane', 2048);
      expect(bundled.similarity(unrelated)).toBeLessThan(0.58);
    });

    it('implements permutation for sequence encoding', () => {
      const tokenA = Hypervector.fromLabel('word:start', 1024);
      const perm1 = tokenA.permute(1);
      const perm2 = tokenA.permute(2);

      expect(tokenA.similarity(perm1)).toBeLessThan(0.60);
      expect(perm1.similarity(perm2)).toBeLessThan(0.60);

      // Inverse shift recovers original vector
      const recovered = perm1.permute(-1);
      expect(recovered.similarity(tokenA)).toBe(1.0);
    });

    it('supports AssociativeItemMemory for record and sequence encoding', () => {
      const mem = new AssociativeItemMemory(2048);
      
      const recordVec = mem.encodeRecord({
        subject: 'RedQueen',
        action: 'adapt',
        target: 'Environment'
      });

      expect(recordVec.dimension).toBe(2048);

      // Query associative recall
      const seqVec = mem.encodeSequence(['observe', 'reason', 'act']);
      expect(seqVec.dimension).toBe(2048);
      expect(mem.size).toBeGreaterThan(5);
    });
  });

  describe('2. Micro-Tokenizer', () => {
    it('encodes and decodes text seamlessly with special tokens', () => {
      const tokenizer = new MicroTokenizer();
      const text = 'red queen cell status ok';
      const encoded = tokenizer.encode(text, true);

      expect(encoded[0]).toBe(tokenizer.bosId);
      expect(encoded[encoded.length - 1]).toBe(tokenizer.eosId);

      const decoded = tokenizer.decode(encoded);
      expect(decoded.toLowerCase()).toContain('red');
      expect(decoded.toLowerCase()).toContain('queen');
      expect(decoded.toLowerCase()).toContain('cell');
    });

    it('dynamically registers new tokens', () => {
      const tokenizer = new MicroTokenizer();
      const initialSize = tokenizer.vocabSize;
      const newId = tokenizer.registerToken('mitosis_protocol');

      expect(newId).toBe(initialSize);
      expect(tokenizer.vocabSize).toBe(initialSize + 1);

      const encoded = tokenizer.encode('mitosis_protocol');
      expect(encoded).toContain(newId);
    });
  });

  describe('3. Linear State Space Model (SSM) & BitNet Ternary Quantization', () => {
    it('executes O(1) recurrent step without state drift', () => {
      const ssm = new LinearSSMCell({
        inputDim: 8,
        stateDim: 16,
        outputDim: 4,
        useTernaryWeights: false
      });

      const inputVector = new Float32Array([0.5, -0.2, 0.1, 0.9, -0.4, 0.3, -0.1, 0.0]);
      const out1 = ssm.step(inputVector);

      expect(out1.length).toBe(4);
      expect(Number.isFinite(out1[0])).toBe(true);

      const snapshot = ssm.getStateSnapshot();
      expect(snapshot.length).toBe(16);

      // Subsequent step retains recurrent state
      const out2 = ssm.step(inputVector);
      expect(out2.length).toBe(4);

      // Reset works
      ssm.resetState();
      const resetSnapshot = ssm.getStateSnapshot();
      expect(resetSnapshot.every(val => val === 0)).toBe(true);
    });

    it('supports BitNet 1.58-bit ternary quantization', () => {
      const ssmTernary = new LinearSSMCell({
        inputDim: 6,
        stateDim: 12,
        outputDim: 3,
        useTernaryWeights: true
      });

      const input = [0.2, -0.5, 0.7, -0.1, 0.4, -0.3];
      const output = ssmTernary.step(input);

      expect(output.length).toBe(3);
      expect(Number.isFinite(output[0])).toBe(true);
      expect(Number.isFinite(output[1])).toBe(true);
      expect(Number.isFinite(output[2])).toBe(true);
    });
  });

  describe('4. Cellular Mixture of Experts (MoE)', () => {
    it('routes contexts sparsely to relevant micro-experts', async () => {
      const router = new CellularMoERouter(2); // Top-2 experts
      expect(router.availableExperts.length).toBe(4);

      // Test Logic Context
      const logicCtx = {
        prompt: 'Apakah ini logis dan valid jika kesimpulan bertentangan?',
        tokens: [1, 2, 3]
      };
      const logicResult = await router.route(logicCtx);
      expect(logicResult.activeExperts).toContain('LogicExpert');
      expect(logicResult.activeExperts.length).toBe(2);
      expect(logicResult.expertOutputs.length).toBe(2);

      // Test Tool/Action Context
      const toolCtx = {
        prompt: 'Jalankan dan eksekusi perbaikan cell metabolism sekarang',
        tokens: [4, 5, 6]
      };
      const toolResult = await router.route(toolCtx);
      expect(toolResult.activeExperts).toContain('ToolActionExpert');
    });
  });
});
