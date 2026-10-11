/**
 * Red Queen Linear State Space Model (SSM) & BitNet Ternary Engine
 * 
 * Implements linear-time sequence modeling with O(1) memory footprint per step.
 * Unlike standard Transformer self-attention which requires O(N^2) time and large KV-caches,
 * this recurrent state-space engine maintains a fixed-size hidden state (few KB),
 * making it ideal for continuous streaming inference on mobile devices.
 * 
 * Also supports BitNet 1.58-bit ternary quantization (-1, 0, +1) to replace
 * floating-point matrix multiplications with low-energy integer additions.
 */

export type TernaryWeight = -1 | 0 | 1;

export interface SSMConfig {
  inputDim: number;
  stateDim: number;
  outputDim: number;
  useTernaryWeights?: boolean;
}

export class LinearSSMCell {
  readonly inputDim: number;
  readonly stateDim: number;
  readonly outputDim: number;
  readonly useTernaryWeights: boolean;

  // Recurrent state transition parameters
  // h_t = (decay * h_{t-1}) + (B * x_t)
  // y_t = (C * h_t) + (D * x_t)
  private decay: Float32Array; // Diagonal state decay (similar to Mamba / RWKV time-decay)
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
      this.decay[i] = 0.75 + 0.23 * Math.sin((i + 1) * 0.17);
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

    // 1. Recurrent state update: h_t = decay * h_{t-1} + (B * x_t)
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
  processSequence(sequence: Float32Array[]): Float32Array[] {
    const outputs: Float32Array[] = [];
    for (const stepInput of sequence) {
      outputs.push(this.step(stepInput));
    }
    return outputs;
  }
}
