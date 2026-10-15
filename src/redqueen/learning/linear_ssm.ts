/**
 * Red Queen Linear State Space Model (SSM) & BitNet Ternary Engine
 * 
 * Implements linear-time sequence modeling with O(1) memory footprint per step.
 * Unlike standard Transformer self-attention which requires O(N^2) time and large KV-caches,
 * this recurrent state-space engine maintains a fixed-size hidden state (few KB),
 * making it ideal for continuous streaming inference and online learning on edge devices.
 * 
 * Features:
 * 1. O(1) Step Inference: Continuous recurrent updates h_t = tanh(decay * h_{t-1} + B * x_t).
 * 2. BitNet 1.58-bit Ternary Quantization: {-1, 0, +1} quantized weights for energy-efficient inference.
 * 3. True Backpropagation Through Time (BPTT) & Online Gradient Descent:
 *    Full mathematical backpropagation for recurrent state transitions, input projection B,
 *    output projection C, skip-connection D, and dynamic time-decay parameters.
 * 4. Adam & Momentum Optimizers with gradient clipping, weight decay, and stability bounds.
 */

export type TernaryWeight = -1 | 0 | 1;

export interface SSMConfig {
  inputDim: number;
  stateDim: number;
  outputDim: number;
  useTernaryWeights?: boolean;
}

export interface SSMTrainOptions {
  learningRate?: number;
  optimizer?: 'adam' | 'sgd' | 'momentum';
  momentum?: number;
  beta1?: number;
  beta2?: number;
  epsilon?: number;
  weightDecay?: number;
  gradientClip?: number;
  trainDecay?: boolean;
}

export interface SSMTrainStepResult {
  loss: number;
  gradNorm: number;
  stepCount: number;
  decayMean: number;
}

export interface SSMParametersExport {
  inputDim: number;
  stateDim: number;
  outputDim: number;
  useTernaryWeights: boolean;
  decay: number[];
  B: number[];
  C: number[];
  D: number[];
  scaleB: number;
  scaleC: number;
  timestamp: string;
}

export class LinearSSMCell {
  readonly inputDim: number;
  readonly stateDim: number;
  readonly outputDim: number;
  readonly useTernaryWeights: boolean;

  // Recurrent state transition parameters (continuous master weights)
  // h_t = tanh(decay * h_{t-1} + B * x_t)
  // y_t = (C * h_t) + (D * x_t)
  private decay: Float32Array; // Diagonal state decay in (0, 1)
  private B: Float32Array;     // inputDim * stateDim
  private C: Float32Array;     // stateDim * outputDim
  private D: Float32Array;     // inputDim * outputDim

  // Ternary quantized representations for ultra-low mobile memory
  private ternaryB?: Int8Array;
  private ternaryC?: Int8Array;
  private scaleB: number = 1.0;
  private scaleC: number = 1.0;

  // Active hidden state for O(1) step inference
  private state: Float32Array;

  // Adam / Momentum optimizer momentum and velocity states
  private mB: Float32Array;
  private vB: Float32Array;
  private mC: Float32Array;
  private vC: Float32Array;
  private mD: Float32Array;
  private vD: Float32Array;
  private mDecay: Float32Array;
  private vDecay: Float32Array;
  private optStep: number = 0;

  constructor(config: SSMConfig) {
    this.inputDim = config.inputDim;
    this.stateDim = config.stateDim;
    this.outputDim = config.outputDim;
    this.useTernaryWeights = config.useTernaryWeights ?? false;

    this.decay = new Float32Array(this.stateDim);
    this.state = new Float32Array(this.stateDim);

    this.B = new Float32Array(this.inputDim * this.stateDim);
    this.C = new Float32Array(this.stateDim * this.outputDim);
    this.D = new Float32Array(this.inputDim * this.outputDim);

    // Optimizer state arrays
    this.mB = new Float32Array(this.B.length);
    this.vB = new Float32Array(this.B.length);
    this.mC = new Float32Array(this.C.length);
    this.vC = new Float32Array(this.C.length);
    this.mD = new Float32Array(this.D.length);
    this.vD = new Float32Array(this.D.length);
    this.mDecay = new Float32Array(this.stateDim);
    this.vDecay = new Float32Array(this.stateDim);

    this.initWeights();
    if (this.useTernaryWeights) {
      this.quantizeToTernary();
    }
  }

  /**
   * Reset recurrent hidden state to zero
   */
  resetState(): void {
    this.state.fill(0);
  }

  /**
   * Get current state snapshot
   */
  getStateSnapshot(): Float32Array {
    const copy = new Float32Array(this.stateDim);
    copy.set(this.state);
    return copy;
  }

  /**
   * Restore state snapshot
   */
  setState(savedState: Float32Array): void {
    if (savedState.length !== this.stateDim) {
      throw new Error(`State size mismatch: expected ${this.stateDim}, got ${savedState.length}`);
    }
    this.state.set(savedState);
  }

  /**
   * Initialize state-space transition matrices with stable recurrent dynamics
   */
  private initWeights(): void {
    // Diagonal decay initialization in [0.7, 0.98] to retain memory across steps
    for (let i = 0; i < this.stateDim; i++) {
      this.decay[i] = 0.75 + 0.20 * Math.sin((i + 1) * 0.17);
    }

    // Xavier/He-like initialization for projection matrices
    const scaleIn = Math.sqrt(2.0 / (this.inputDim + this.stateDim));
    for (let i = 0; i < this.B.length; i++) {
      this.B[i] = ((Math.random() * 2 - 1) * scaleIn);
    }

    const scaleOut = Math.sqrt(2.0 / (this.stateDim + this.outputDim));
    for (let i = 0; i < this.C.length; i++) {
      this.C[i] = ((Math.random() * 2 - 1) * scaleOut);
    }

    for (let i = 0; i < this.D.length; i++) {
      this.D[i] = (Math.random() * 0.1 - 0.05);
    }
  }

  /**
   * Quantize continuous matrices to BitNet 1.58-bit ternary {-1, 0, +1}
   * Quantization rule: round(clip(W / scale, -1, 1))
   */
  quantizeToTernary(): void {
    // Quantize B
    let sumAbsB = 0;
    for (let i = 0; i < this.B.length; i++) sumAbsB += Math.abs(this.B[i]);
    this.scaleB = (sumAbsB / this.B.length) || 1.0;
    this.ternaryB = new Int8Array(this.B.length);
    for (let i = 0; i < this.B.length; i++) {
      const q = Math.round(this.B[i] / this.scaleB);
      this.ternaryB[i] = Math.max(-1, Math.min(1, q)) as TernaryWeight;
    }

    // Quantize C
    let sumAbsC = 0;
    for (let i = 0; i < this.C.length; i++) sumAbsC += Math.abs(this.C[i]);
    this.scaleC = (sumAbsC / this.C.length) || 1.0;
    this.ternaryC = new Int8Array(this.C.length);
    for (let i = 0; i < this.C.length; i++) {
      const q = Math.round(this.C[i] / this.scaleC);
      this.ternaryC[i] = Math.max(-1, Math.min(1, q)) as TernaryWeight;
    }
  }

  /**
   * O(1) single recurrent step execution:
   * Consumes single input vector x_t, updates hidden state, produces output y_t.
   */
  step(x: Float32Array | number[]): Float32Array {
    if (x.length !== this.inputDim) {
      throw new Error(`Input dim mismatch: expected ${this.inputDim}, got ${x.length}`);
    }

    const inputArr = x instanceof Float32Array ? x : new Float32Array(x);
    const output = new Float32Array(this.outputDim);

    // 1. Recurrent state update: h_t = tanh(decay * h_{t-1} + (B * x_t))
    for (let s = 0; s < this.stateDim; s++) {
      let bDotX = 0;

      if (this.ternaryB) {
        // Fast integer accumulator for BitNet weights
        for (let i = 0; i < this.inputDim; i++) {
          const w = this.ternaryB[i * this.stateDim + s];
          if (w === 1) bDotX += inputArr[i];
          else if (w === -1) bDotX -= inputArr[i];
        }
        bDotX *= this.scaleB;
      } else {
        // Floating point multiply-accumulate
        for (let i = 0; i < this.inputDim; i++) {
          bDotX += inputArr[i] * this.B[i * this.stateDim + s];
        }
      }

      // Linear state-space update + tanh nonlinearity bounding
      this.state[s] = Math.tanh(this.decay[s] * this.state[s] + bDotX);
    }

    // 2. Output projection: y_t = (C * h_t) + (D * x_t)
    for (let o = 0; o < this.outputDim; o++) {
      let cDotH = 0;

      if (this.ternaryC) {
        for (let s = 0; s < this.stateDim; s++) {
          const w = this.ternaryC[s * this.outputDim + o];
          if (w === 1) cDotH += this.state[s];
          else if (w === -1) cDotH -= this.state[s];
        }
        cDotH *= this.scaleC;
      } else {
        for (let s = 0; s < this.stateDim; s++) {
          cDotH += this.state[s] * this.C[s * this.outputDim + o];
        }
      }

      // Skip-connection contribution from input (D * x_t)
      let dDotX = 0;
      for (let i = 0; i < this.inputDim; i++) {
        dDotX += inputArr[i] * this.D[i * this.outputDim + o];
      }

      output[o] = cDotH + dDotX;
    }

    return output;
  }

  /**
   * Process an entire sequence in O(N) linear time
   */
  processSequence(sequence: Array<Float32Array | number[]>): Float32Array[] {
    const outputs: Float32Array[] = [];
    for (const stepInput of sequence) {
      outputs.push(this.step(stepInput));
    }
    return outputs;
  }

  /**
   * TRUE BACKPROPAGATION THROUGH TIME (BPTT) FOR RECURRENT STATE SPACE
   * 
   * Mathematically exact training of recurrent transition matrices B, C, D, and decay
   * over a temporal sequence of inputs and targets.
   * 
   * @param inputs Sequence of input vectors [x_0, x_1, ..., x_{T-1}]
   * @param targets Sequence of desired output vectors [y_0*, y_1*, ..., y_{T-1}*]
   * @param options Learning rate, optimizer type, gradient clipping, weight decay
   */
  trainSequence(
    inputs: Array<Float32Array | number[]>,
    targets: Array<Float32Array | number[]>,
    options: SSMTrainOptions = {}
  ): SSMTrainStepResult {
    if (inputs.length === 0 || targets.length === 0) {
      throw new Error('trainSequence requires non-empty inputs and targets');
    }
    if (inputs.length !== targets.length) {
      throw new Error(`Sequence length mismatch: inputs has ${inputs.length}, targets has ${targets.length}`);
    }

    const T = inputs.length;
    const lr = options.learningRate ?? 0.01;
    const optimizer = options.optimizer ?? 'adam';
    const beta1 = options.beta1 ?? 0.9;
    const beta2 = options.beta2 ?? 0.999;
    const eps = options.epsilon ?? 1e-8;
    const weightDecay = options.weightDecay ?? 1e-4;
    const clipVal = options.gradientClip ?? 5.0;
    const trainDecay = options.trainDecay ?? true;

    // Convert inputs and targets to Float32Array
    const inSeq: Float32Array[] = inputs.map(x => (x instanceof Float32Array ? x : new Float32Array(x)));
    const tgtSeq: Float32Array[] = targets.map(y => (y instanceof Float32Array ? y : new Float32Array(y)));

    // FORWARD PASS: Record temporal trajectory
    // hHistory[0] is initial state before step 0
    const hHistory: Float32Array[] = [new Float32Array(this.state)];
    const yHistory: Float32Array[] = [];

    for (let t = 0; t < T; t++) {
      const xt = inSeq[t];
      const htPrev = hHistory[t];
      const ht = new Float32Array(this.stateDim);
      const yt = new Float32Array(this.outputDim);

      // Compute h_t = tanh(decay * h_{t-1} + B * x_t)
      for (let s = 0; s < this.stateDim; s++) {
        let bDotX = 0;
        for (let i = 0; i < this.inputDim; i++) {
          bDotX += xt[i] * this.B[i * this.stateDim + s];
        }
        ht[s] = Math.tanh(this.decay[s] * htPrev[s] + bDotX);
      }
      hHistory.push(ht);

      // Compute y_t = C * h_t + D * x_t
      for (let o = 0; o < this.outputDim; o++) {
        let cDotH = 0;
        for (let s = 0; s < this.stateDim; s++) {
          cDotH += ht[s] * this.C[s * this.outputDim + o];
        }
        let dDotX = 0;
        for (let i = 0; i < this.inputDim; i++) {
          dDotX += xt[i] * this.D[i * this.outputDim + o];
        }
        yt[o] = cDotH + dDotX;
      }
      yHistory.push(yt);
    }

    // Set cell internal state to final state
    this.state.set(hHistory[T]);

    // BACKWARD PASS (BPTT): Compute gradients
    const gradB = new Float32Array(this.B.length);
    const gradC = new Float32Array(this.C.length);
    const gradD = new Float32Array(this.D.length);
    const gradDecay = new Float32Array(this.stateDim);

    let totalLoss = 0;
    const deltaHNext = new Float32Array(this.stateDim);

    for (let t = T - 1; t >= 0; t--) {
      const xt = inSeq[t];
      const ht = hHistory[t + 1];
      const htPrev = hHistory[t];
      const yt = yHistory[t];
      const target = tgtSeq[t];

      // Error at output: e_t = y_t - target
      const deltaY = new Float32Array(this.outputDim);
      for (let o = 0; o < this.outputDim; o++) {
        const diff = yt[o] - target[o];
        deltaY[o] = diff;
        totalLoss += 0.5 * diff * diff;
      }

      // Gradients for C and D from output error
      for (let o = 0; o < this.outputDim; o++) {
        const dy = deltaY[o];
        for (let s = 0; s < this.stateDim; s++) {
          gradC[s * this.outputDim + o] += dy * ht[s];
        }
        for (let i = 0; i < this.inputDim; i++) {
          gradD[i * this.outputDim + o] += dy * xt[i];
        }
      }

      // Backpropagate error into hidden state: delta_t^h
      const deltaH = new Float32Array(this.stateDim);
      for (let s = 0; s < this.stateDim; s++) {
        let sumC = 0;
        for (let o = 0; o < this.outputDim; o++) {
          sumC += deltaY[o] * this.C[s * this.outputDim + o];
        }
        // Add recurrent gradient flowing backwards from step t+1
        deltaH[s] = sumC + deltaHNext[s];
      }

      // Nonlinearity derivative: d(tanh(z))/dz = 1 - tanh^2(z) = 1 - h_t^2
      const deltaZ = new Float32Array(this.stateDim);
      for (let s = 0; s < this.stateDim; s++) {
        deltaZ[s] = deltaH[s] * (1.0 - ht[s] * ht[s]);
      }

      // Gradient for B and decay
      for (let s = 0; s < this.stateDim; s++) {
        const dz = deltaZ[s];
        for (let i = 0; i < this.inputDim; i++) {
          gradB[i * this.stateDim + s] += dz * xt[i];
        }
        if (trainDecay) {
          gradDecay[s] += dz * htPrev[s];
        }
        // Prepare recurrent gradient for step t-1
        deltaHNext[s] = dz * this.decay[s];
      }
    }

    const meanLoss = totalLoss / (T * this.outputDim);

    // Compute gradient norm for clipping
    let gradNormSq = 0;
    for (let i = 0; i < gradB.length; i++) gradNormSq += gradB[i] * gradB[i];
    for (let i = 0; i < gradC.length; i++) gradNormSq += gradC[i] * gradC[i];
    for (let i = 0; i < gradD.length; i++) gradNormSq += gradD[i] * gradD[i];
    for (let i = 0; i < gradDecay.length; i++) gradNormSq += gradDecay[i] * gradDecay[i];
    const gradNorm = Math.sqrt(gradNormSq);

    // Apply gradient clipping
    let clipScale = 1.0;
    if (gradNorm > clipVal && gradNorm > 1e-7) {
      clipScale = clipVal / gradNorm;
    }

    // PARAMETER UPDATES VIA OPTIMIZER (ADAM / MOMENTUM / SGD)
    this.optStep++;
    const step = this.optStep;

    const updateWeights = (
      params: Float32Array,
      grads: Float32Array,
      m: Float32Array,
      v: Float32Array,
      isDecayParam: boolean = false
    ) => {
      for (let i = 0; i < params.length; i++) {
        const g = grads[i] * clipScale;

        if (optimizer === 'adam') {
          // Adam moment updates
          m[i] = beta1 * m[i] + (1.0 - beta1) * g;
          v[i] = beta2 * v[i] + (1.0 - beta2) * g * g;

          // Bias correction
          const mHat = m[i] / (1.0 - Math.pow(beta1, step));
          const vHat = v[i] / (1.0 - Math.pow(beta2, step));

          // Weight decay regularization
          params[i] -= lr * (mHat / (Math.sqrt(vHat) + eps) + weightDecay * params[i]);
        } else if (optimizer === 'momentum') {
          m[i] = beta1 * m[i] + g;
          params[i] -= lr * (m[i] + weightDecay * params[i]);
        } else {
          // Vanilla SGD
          params[i] -= lr * (g + weightDecay * params[i]);
        }

        // Stability bounds for time-decay: must stay strictly in (0.05, 0.99)
        if (isDecayParam) {
          params[i] = Math.max(0.05, Math.min(0.99, params[i]));
        }
      }
    };

    updateWeights(this.B, gradB, this.mB, this.vB);
    updateWeights(this.C, gradC, this.mC, this.vC);
    updateWeights(this.D, gradD, this.mD, this.vD);
    if (trainDecay) {
      updateWeights(this.decay, gradDecay, this.mDecay, this.vDecay, true);
    }

    // Re-quantize to BitNet ternary if enabled
    if (this.useTernaryWeights) {
      this.quantizeToTernary();
    }

    // Calculate average decay
    let decaySum = 0;
    for (let s = 0; s < this.stateDim; s++) decaySum += this.decay[s];
    const decayMean = decaySum / this.stateDim;

    return {
      loss: meanLoss,
      gradNorm,
      stepCount: this.optStep,
      decayMean
    };
  }

  /**
   * Online single-step training: performs BPTT over a 1-step sequence
   */
  trainStep(
    input: Float32Array | number[],
    target: Float32Array | number[],
    options: SSMTrainOptions = {}
  ): SSMTrainStepResult {
    return this.trainSequence([input], [target], options);
  }

  /**
   * Train over multiple epochs across a dataset of sequences
   */
  trainEpoch(
    dataset: Array<{ inputs: Array<Float32Array | number[]>; targets: Array<Float32Array | number[]> }>,
    options: SSMTrainOptions = {}
  ): { averageLoss: number; totalSequences: number; finalGradNorm: number } {
    if (dataset.length === 0) {
      throw new Error('trainEpoch requires non-empty dataset');
    }

    let totalLoss = 0;
    let lastGradNorm = 0;

    for (const sample of dataset) {
      const res = this.trainSequence(sample.inputs, sample.targets, options);
      totalLoss += res.loss;
      lastGradNorm = res.gradNorm;
    }

    return {
      averageLoss: totalLoss / dataset.length,
      totalSequences: dataset.length,
      finalGradNorm: lastGradNorm
    };
  }

  /**
   * Evaluate model Mean Squared Error over a test dataset without updating weights
   */
  evaluate(
    dataset: Array<{ inputs: Array<Float32Array | number[]>; targets: Array<Float32Array | number[]> }>
  ): { mse: number; sequenceCount: number } {
    if (dataset.length === 0) return { mse: 0, sequenceCount: 0 };

    const originalState = this.getStateSnapshot();
    let totalMse = 0;
    let totalSteps = 0;

    for (const sample of dataset) {
      this.resetState();
      const inSeq = sample.inputs;
      const tgtSeq = sample.targets;

      for (let t = 0; t < inSeq.length; t++) {
        const out = this.step(inSeq[t]);
        const tgt = tgtSeq[t];
        for (let o = 0; o < this.outputDim; o++) {
          const diff = out[o] - (tgt instanceof Float32Array ? tgt[o] : tgt[o]);
          totalMse += diff * diff;
        }
        totalSteps++;
      }
    }

    this.setState(originalState);
    return {
      mse: totalSteps > 0 ? totalMse / (totalSteps * this.outputDim) : 0,
      sequenceCount: dataset.length
    };
  }

  /**
   * Invariant verification check for SystemIntegrity
   */
  assertInvariants(): { valid: boolean; maxWeight: number; isStable: boolean; decayMean: number } {
    let maxWeight = 0;
    let decaySum = 0;

    for (let i = 0; i < this.B.length; i++) {
      const v = this.B[i];
      if (isNaN(v) || !isFinite(v)) return { valid: false, maxWeight: NaN, isStable: false, decayMean: 0 };
      if (Math.abs(v) > maxWeight) maxWeight = Math.abs(v);
    }
    for (let i = 0; i < this.C.length; i++) {
      const v = this.C[i];
      if (isNaN(v) || !isFinite(v)) return { valid: false, maxWeight: NaN, isStable: false, decayMean: 0 };
      if (Math.abs(v) > maxWeight) maxWeight = Math.abs(v);
    }
    for (let i = 0; i < this.D.length; i++) {
      const v = this.D[i];
      if (isNaN(v) || !isFinite(v)) return { valid: false, maxWeight: NaN, isStable: false, decayMean: 0 };
      if (Math.abs(v) > maxWeight) maxWeight = Math.abs(v);
    }
    for (let s = 0; s < this.stateDim; s++) {
      const d = this.decay[s];
      if (isNaN(d) || !isFinite(d) || d <= 0 || d >= 1.0) {
        return { valid: false, maxWeight, isStable: false, decayMean: 0 };
      }
      decaySum += d;
    }

    const decayMean = decaySum / this.stateDim;
    return {
      valid: true,
      maxWeight,
      isStable: decayMean < 0.99 && decayMean > 0.05,
      decayMean
    };
  }

  /**
   * Export all learned parameters
   */
  exportParameters(): SSMParametersExport {
    return {
      inputDim: this.inputDim,
      stateDim: this.stateDim,
      outputDim: this.outputDim,
      useTernaryWeights: this.useTernaryWeights,
      decay: Array.from(this.decay),
      B: Array.from(this.B),
      C: Array.from(this.C),
      D: Array.from(this.D),
      scaleB: this.scaleB,
      scaleC: this.scaleC,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Load trained parameters into this cell
   */
  loadParameters(params: Partial<SSMParametersExport>): void {
    if (params.decay && params.decay.length === this.stateDim) {
      this.decay.set(params.decay);
    }
    if (params.B && params.B.length === this.B.length) {
      this.B.set(params.B);
    }
    if (params.C && params.C.length === this.C.length) {
      this.C.set(params.C);
    }
    if (params.D && params.D.length === this.D.length) {
      this.D.set(params.D);
    }
    if (typeof params.scaleB === 'number') this.scaleB = params.scaleB;
    if (typeof params.scaleC === 'number') this.scaleC = params.scaleC;

    if (this.useTernaryWeights) {
      this.quantizeToTernary();
    }
  }
}
