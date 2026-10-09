import { dot, Vector, zeros } from './tensor';

export interface MLPCheckpoint {
  version: 1;
  inputSize: number;
  hiddenSize: number;
  weights1: Vector[];
  bias1: Vector;
  weights2: Vector;
  bias2: number;
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

export class BinaryMLP {
  private readonly weights1: Vector[];
  private readonly bias1: Vector;
  private readonly weights2: Vector;
  private bias2 = 0;
  private step = 0;

  constructor(
    public readonly inputSize: number,
    public readonly hiddenSize = 16,
    checkpoint?: MLPCheckpoint
  ) {
    if (checkpoint) {
      if (checkpoint.inputSize !== inputSize || checkpoint.hiddenSize !== hiddenSize) {
        throw new Error('Checkpoint shape does not match model shape');
      }
      this.weights1 = checkpoint.weights1.map(row => [...row]);
      this.bias1 = [...checkpoint.bias1];
      this.weights2 = [...checkpoint.weights2];
      this.bias2 = checkpoint.bias2;
      this.step = checkpoint.step;
      return;
    }
    this.weights1 = Array.from({ length: hiddenSize }, (_, h) =>
      Array.from({ length: inputSize }, (_, i) => Math.sin((h + 1) * (i + 3)) * 0.05)
    );
    this.bias1 = zeros(hiddenSize);
    this.weights2 = Array.from({ length: hiddenSize }, (_, h) => Math.cos(h + 1) * 0.05);
  }

  predict(input: Vector): number {
    this.assertInput(input);
    const hidden = this.weights1.map((row, index) => sigmoid(dot(row, input) + this.bias1[index]));
    return sigmoid(dot(this.weights2, hidden) + this.bias2);
  }

  train(samples: Array<{ input: Vector; target: number }>, learningRate = 0.05): { loss: number; step: number } {
    if (samples.length === 0) throw new Error('Training requires at least one sample');
    if (!(learningRate > 0 && Number.isFinite(learningRate))) throw new Error('Learning rate must be positive');
    let loss = 0;
    for (const sample of samples) {
      this.assertInput(sample.input);
      if (sample.target < 0 || sample.target > 1) throw new Error('Binary target must be between 0 and 1');
      const hidden = this.weights1.map((row, index) => sigmoid(dot(row, sample.input) + this.bias1[index]));
      const output = sigmoid(dot(this.weights2, hidden) + this.bias2);
      const error = output - sample.target;
      loss += -(sample.target * Math.log(output + 1e-9) + (1 - sample.target) * Math.log(1 - output + 1e-9));
      for (let h = 0; h < this.hiddenSize; h++) {
        const hiddenGradient = error * this.weights2[h] * hidden[h] * (1 - hidden[h]);
        this.weights2[h] -= learningRate * error * hidden[h];
        for (let i = 0; i < this.inputSize; i++) this.weights1[h][i] -= learningRate * hiddenGradient * sample.input[i];
        this.bias1[h] -= learningRate * hiddenGradient;
      }
      this.bias2 -= learningRate * error;
      this.step++;
    }
    return { loss: loss / samples.length, step: this.step };
  }

  checkpoint(): MLPCheckpoint {
    return {
      version: 1,
      inputSize: this.inputSize,
      hiddenSize: this.hiddenSize,
      weights1: this.weights1.map(row => [...row]),
      bias1: [...this.bias1],
      weights2: [...this.weights2],
      bias2: this.bias2,
      step: this.step
    };
  }

  private assertInput(input: Vector): void {
    if (input.length !== this.inputSize || input.some(value => !Number.isFinite(value))) {
      throw new Error(`Expected finite tensor with shape [${this.inputSize}]`);
    }
  }
}

