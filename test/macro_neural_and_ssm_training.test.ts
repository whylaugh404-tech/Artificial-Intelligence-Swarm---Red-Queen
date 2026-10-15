import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { LinearSSMCell } from '../src/redqueen/learning/linear_ssm';
import { InterCellSynapticNetwork } from '../src/redqueen/network/synaptic_network';
import { Cell } from '../src/redqueen/core/cell';
import { MessageType } from '../src/redqueen/network/protocol';

describe('Red Queen: Macro-Neural Synaptic Network & Linear SSM Recurrent Training', () => {
  const tmpDir = path.join(process.cwd(), '.tmp_test_macro_neural');

  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  describe('Part 1: Linear SSM Recurrent Learning & Backpropagation Through Time (BPTT)', () => {
    it('initializes with stable recurrent decay parameters and finite weights', () => {
      const ssm = new LinearSSMCell({
        inputDim: 8,
        stateDim: 16,
        outputDim: 8,
        useTernaryWeights: false
      });

      const inv = ssm.assertInvariants();
      expect(inv.valid).toBe(true);
      expect(inv.isStable).toBe(true);
      expect(inv.decayMean).toBeGreaterThan(0.5);
      expect(inv.decayMean).toBeLessThan(0.99);
    });

    it('trains on a sequence via BPTT and strictly decreases loss', () => {
      const inputDim = 4;
      const stateDim = 8;
      const outputDim = 4;
      const ssm = new LinearSSMCell({
        inputDim,
        stateDim,
        outputDim,
        useTernaryWeights: false
      });

      // Construct a synthetic recurrent sequence (dynamic temporal shift)
      const seqLen = 6;
      const inputs: Float32Array[] = [];
      const targets: Float32Array[] = [];

      for (let t = 0; t < seqLen; t++) {
        const inp = new Float32Array(inputDim);
        const tgt = new Float32Array(outputDim);
        for (let i = 0; i < inputDim; i++) {
          inp[i] = Math.sin((t + 1) * 0.5 + i * 0.3);
          // Target is delayed & transformed version of input
          tgt[i] = Math.cos((t + 1) * 0.5 + i * 0.3) * 0.5;
        }
        inputs.push(inp);
        targets.push(tgt);
      }

      // Initial evaluation
      const initialEval = ssm.evaluate([{ inputs, targets }]);

      // Train with Adam optimizer over 20 epochs
      let lastLoss = 0;
      for (let epoch = 0; epoch < 20; epoch++) {
        const stepRes = ssm.trainSequence(inputs, targets, {
          learningRate: 0.05,
          optimizer: 'adam',
          gradientClip: 2.0
        });
        lastLoss = stepRes.loss;
      }

      // Final evaluation
      const finalEval = ssm.evaluate([{ inputs, targets }]);

      expect(finalEval.mse).toBeLessThan(initialEval.mse);
      expect(lastLoss).toBeLessThan(initialEval.mse);

      const inv = ssm.assertInvariants();
      expect(inv.valid).toBe(true);
      expect(inv.isStable).toBe(true);
    });

    it('re-quantizes BitNet ternary representations during training', () => {
      const ssm = new LinearSSMCell({
        inputDim: 4,
        stateDim: 8,
        outputDim: 4,
        useTernaryWeights: true
      });

      const sampleIn = [new Float32Array([0.5, -0.3, 0.8, -0.1])];
      const sampleTgt = [new Float32Array([0.1, 0.4, -0.2, 0.9])];

      const res = ssm.trainSequence(sampleIn, sampleTgt, { learningRate: 0.02 });
      expect(res.loss).toBeGreaterThan(0);
      expect(res.gradNorm).toBeGreaterThan(0);

      // Verify parameters can be exported and imported
      const params = ssm.exportParameters();
      expect(params.useTernaryWeights).toBe(true);
      expect(params.decay.length).toBe(8);
      expect(params.B.length).toBe(32);
      expect(params.C.length).toBe(32);

      const freshSSM = new LinearSSMCell({
        inputDim: 4,
        stateDim: 8,
        outputDim: 4,
        useTernaryWeights: true
      });
      freshSSM.loadParameters(params);

      // Verify inference parity
      const testVec = new Float32Array([0.2, -0.1, 0.5, 0.3]);
      freshSSM.resetState();
      ssm.resetState();
      const out1 = ssm.step(testVec);
      const out2 = freshSSM.step(testVec);

      for (let i = 0; i < 4; i++) {
        expect(out1[i]).toBeCloseTo(out2[i], 3);
      }
    });
  });

  describe('Part 2: Macro-Neural Inter-Cell Synaptic Network (STDP & Plasticity)', () => {
    it('applies Spike-Timing-Dependent Plasticity (LTP for causal, LTD for acausal)', () => {
      const synNet = new InterCellSynapticNetwork('cell_source');
      const targetCellId = 'cell_target';

      const initialSyn = synNet.registerSynapse(targetCellId, 0.4, 1.0);
      const initialWeight = initialSyn.weight;

      const now = Date.now();

      // Test 1: Causal firing (tPost > tPre by 15ms) -> LTP
      const ltpRes = synNet.applySTDP(targetCellId, now, now + 15);
      expect(ltpRes.deltaWeight).toBeGreaterThan(0);
      expect(ltpRes.newWeight).toBeGreaterThan(initialWeight);

      const potentiatedWeight = ltpRes.newWeight;

      // Test 2: Acausal firing (tPost < tPre by 20ms) -> LTD
      const ltdRes = synNet.applySTDP(targetCellId, now + 20, now);
      expect(ltdRes.deltaWeight).toBeLessThan(0);
      expect(ltdRes.newWeight).toBeLessThan(potentiatedWeight);
    });

    it('applies Oja anti-runaway Hebbian plasticity on correlated activations', () => {
      const synNet = new InterCellSynapticNetwork('cell_alpha');
      const peerId = 'cell_beta';
      synNet.registerSynapse(peerId, 0.2, 1.0);

      const vecPre = new Float32Array([0.8, 0.6, 0.1, -0.2]);
      const vecPostAligned = new Float32Array([0.7, 0.5, 0.2, -0.1]); // Positive correlation

      const res = synNet.applyHebbianCoactivation(peerId, vecPre, vecPostAligned, 0.1);
      expect(res.deltaWeight).toBeGreaterThan(0);
      expect(res.newWeight).toBeGreaterThan(0.2);
      expect(res.newWeight).toBeLessThanOrEqual(1.0);
    });

    it('modulates synaptic weights and conductance via task reinforcement', () => {
      const synNet = new InterCellSynapticNetwork('cell_local');
      const peerId = 'cell_remote';
      synNet.registerSynapse(peerId, 0.3, 1.0);

      // Task success reinforcement (LTP + conductance gain)
      const succRes = synNet.applyTaskReinforcement(peerId, 0.9, true);
      expect(succRes.deltaWeight).toBeGreaterThan(0);
      expect(succRes.newConductance).toBeGreaterThan(1.0);

      // Contradiction / Task failure penalty (LTD + conductance drop)
      const failRes = synNet.applyTaskReinforcement(peerId, 0.7, false);
      expect(failRes.deltaWeight).toBeLessThan(0);
      expect(failRes.newConductance).toBeLessThan(succRes.newConductance);
    });

    it('propagates activation pulses and triggers action potentials above threshold', () => {
      const synNet = new InterCellSynapticNetwork('cell_sender');
      const strongPeer = 'cell_strong_peer';
      const weakPeer = 'cell_weak_peer';

      synNet.registerSynapse(strongPeer, 0.8, 1.5); // High weight + conductance
      synNet.registerSynapse(weakPeer, -0.2, 0.5);  // Inhibitory / negative weight

      const pulseVec = new Float32Array([0.8, 0.9, 0.7, 0.85]);
      const results = synNet.propagateActivationPulse(pulseVec);

      expect(results.length).toBe(2);

      const strongRes = results.find(r => r.targetCellId === strongPeer);
      const weakRes = results.find(r => r.targetCellId === weakPeer);

      expect(strongRes?.fired).toBe(true);
      expect(strongRes?.signalMagnitude).toBeGreaterThan(0.5);

      expect(weakRes?.fired).toBe(false);
    });
  });

  describe('Part 3: End-to-End Inter-Cell Macro-Neural Integration & Audit Checks', () => {
    it('integrates inter-cell synapses between Cell instances and passes deep audit', async () => {
      const cellAPath = path.join(tmpDir, 'cell_a.json');
      const cellBPath = path.join(tmpDir, 'cell_b.json');

      const cellA = new Cell(cellAPath, 'test_key', undefined, undefined, undefined, {
        storageSecret: 'secret_a_123456789012345678901234'
      });
      const cellB = new Cell(cellBPath, 'test_key', undefined, undefined, undefined, {
        storageSecret: 'secret_b_123456789012345678901234'
      });

      try {
        await cellA.memory.initialize();
        await cellB.memory.initialize();

        // Register mutual synapses
        cellA.synapticNetwork.registerSynapse(cellB.nodeId, 0.5, 1.0);
        cellB.synapticNetwork.registerSynapse(cellA.nodeId, 0.5, 1.0);

        // Cell A emits a neural synaptic pulse towards Cell B
        const pulseRes = cellA.emitNeuralSynapticPulse(cellB.nodeId, [0.6, 0.8, -0.4, 0.3]);
        expect(pulseRes.length).toBeGreaterThan(0);
        expect(pulseRes[0].targetCellId).toBe(cellB.nodeId);

        // Apply task reinforcement when epistemic yield is verified
        cellA.synapticNetwork.applyTaskReinforcement(cellB.nodeId, 0.88, true);
        const synAtoB = cellA.synapticNetwork.getSynapse(cellB.nodeId);
        expect(synAtoB?.weight).toBeGreaterThan(0.5);
        expect(synAtoB?.taskSuccessReinforcements).toBe(1);

        // Run full system audit on Cell A: MUST PASS ALL 11 CHECKS!
        const auditA = await cellA.integrity.runDeepSystemAudit(cellA);
        expect(auditA.passed).toBe(true);
        expect(auditA.failedChecks).toBe(0);
        expect(auditA.totalChecks).toBe(11);

        // Verify specific checks in audit
        const ssmCheck = auditA.checks.find(c => c.name === 'Linear SSM Recurrent Dynamics & Stability Invariants');
        const synCheck = auditA.checks.find(c => c.name === 'Inter-Cell Synaptic Network STDP & Conductance Invariants');

        expect(ssmCheck?.passed).toBe(true);
        expect(synCheck?.passed).toBe(true);
      } finally {
        await cellA.stop();
        await cellB.stop();
      }
    });
  });
});
