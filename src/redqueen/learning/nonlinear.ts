/**
 * A small trainable nonlinear state-transition model.
 *
 * This is deliberately separate from the deterministic chaos controller:
 * chaos supplies bounded exploration, while this model learns a transition
 * function from observed state sequences.
 *
 * y = sigmoid(a*x + b*x*(1-x) + c)
 */
export interface NonlinearCheckpoint {
  version: 1;
  a: number;
  b: number;
  c: number;
  step: number;
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

export class AdaptiveNonlinearDynamics {
  private a = 1.5;
  private b = 1.0;
  private c = -1.25;
  private step = 0;

  constructor(checkpoint?: NonlinearCheckpoint) {
    if (!checkpoint) return;
    this.restore(checkpoint);
  }

  restore(checkpoint: NonlinearCheckpoint): void {
    if (checkpoint.version !== 1 || !Number.isInteger(checkpoint.step) || checkpoint.step < 0 ||
      [checkpoint.a, checkpoint.b, checkpoint.c].some(value => !Number.isFinite(value))) {
      throw new Error('Invalid nonlinear dynamics checkpoint');
    }
    this.a = checkpoint.a;
    this.b = checkpoint.b;
    this.c = checkpoint.c;
    this.step = checkpoint.step;
  }

  predict(state: number): number {
    this.assertState(state);
    return sigmoid(this.a * state + this.b * state * (1 - state) + this.c);
  }

  train(samples: Array<{ state: number; nextState: number }>, learningRate = 0.05): { loss: number; step: number } {
    if (!Array.isArray(samples) || samples.length === 0) throw new Error('Nonlinear training requires samples');
    if (!Number.isFinite(learningRate) || learningRate <= 0) throw new Error('Learning rate must be positive');
    let loss = 0;
    for (const sample of samples) {
      this.assertState(sample.state);
      this.assertState(sample.nextState);
      const basis = sample.state * (1 - sample.state);
      const logit = this.a * sample.state + this.b * basis + this.c;
      const prediction = sigmoid(logit);
      const error = prediction - sample.nextState;
      loss += error * error;
      const derivative = 2 * error * prediction * (1 - prediction);
      this.a -= learningRate * derivative * sample.state;
      this.b -= learningRate * derivative * basis;
      this.c -= learningRate * derivative;
      this.step++;
    }
    return { loss: loss / samples.length, step: this.step };
  }

  checkpoint(): NonlinearCheckpoint {
    return { version: 1, a: this.a, b: this.b, c: this.c, step: this.step };
  }

  private assertState(value: number): void {
    if (!Number.isFinite(value) || value <= 0 || value >= 1) {
      throw new Error('Nonlinear state must be finite and strictly between 0 and 1');
    }
  }
}

