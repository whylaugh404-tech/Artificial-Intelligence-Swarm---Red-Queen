import { MemoryCategory, MemoryStore } from '../memory/store';
import { BinaryMLP, MLPCheckpoint } from './mlp';
import { HashEmbeddingModel, Vector } from './tensor';

export interface TextTrainingSample { text: string; target: number; }
export interface BinaryMetrics {
  loss: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  samples: number;
}

export class NeuralLearningEngine {
  public readonly embedding: HashEmbeddingModel;
  private model: BinaryMLP;
  private checkpointId = 'neural_checkpoint_default';

  constructor(private readonly memory: MemoryStore, dimensions = 32, hiddenSize = 16) {
    this.embedding = new HashEmbeddingModel(dimensions);
    this.model = new BinaryMLP(dimensions, hiddenSize);
  }

  async train(samples: TextTrainingSample[], epochs = 10, learningRate = 0.05, validationSamples: TextTrainingSample[] = samples): Promise<{ epochs: number; loss: number; step: number; metrics: BinaryMetrics; validationMetrics: BinaryMetrics }> {
    if (!Number.isInteger(epochs) || epochs <= 0 || epochs > 10000) throw new Error('epochs must be between 1 and 10000');
    const tensors = samples.map(sample => ({ input: this.embedding.embed(sample.text), target: sample.target }));
    let result = { loss: 0, step: 0 };
    let bestCheckpoint: MLPCheckpoint | undefined;
    let bestValidationLoss = Number.POSITIVE_INFINITY;
    for (let epoch = 0; epoch < epochs; epoch++) {
      result = this.model.train(tensors, learningRate);
      const validationMetrics = this.evaluate(validationSamples);
      if (validationMetrics.loss < bestValidationLoss) {
        bestValidationLoss = validationMetrics.loss;
        bestCheckpoint = this.model.checkpoint();
      }
    }
    if (bestCheckpoint) this.model = new BinaryMLP(bestCheckpoint.inputSize, bestCheckpoint.hiddenSize, bestCheckpoint);
    await this.saveCheckpoint();
    return { epochs, ...result, metrics: this.evaluate(samples), validationMetrics: this.evaluate(validationSamples) };
  }

  evaluate(samples: TextTrainingSample[]): BinaryMetrics {
    if (samples.length === 0) throw new Error('Evaluation requires at least one sample');
    let loss = 0;
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    let correct = 0;
    for (const sample of samples) {
      const score = this.model.predict(this.embedding.embed(sample.text));
      const prediction = score >= 0.5 ? 1 : 0;
      loss += -(sample.target * Math.log(score + 1e-9) + (1 - sample.target) * Math.log(1 - score + 1e-9));
      if (prediction === sample.target) correct++;
      if (prediction === 1 && sample.target === 1) truePositive++;
      if (prediction === 1 && sample.target === 0) falsePositive++;
      if (prediction === 0 && sample.target === 1) falseNegative++;
    }
    const precision = truePositive / Math.max(1, truePositive + falsePositive);
    const recall = truePositive / Math.max(1, truePositive + falseNegative);
    return {
      loss: loss / samples.length,
      accuracy: correct / samples.length,
      precision,
      recall,
      f1: (2 * precision * recall) / Math.max(1e-9, precision + recall),
      samples: samples.length
    };
  }

  infer(text: string): { score: number; label: number; checkpointId: string } {
    const score = this.model.predict(this.embedding.embed(text));
    return { score, label: score >= 0.5 ? 1 : 0, checkpointId: this.checkpointId };
  }

  async saveCheckpoint(): Promise<void> {
    const checkpoint = this.model.checkpoint();
    await this.memory.put({
      id: this.checkpointId,
      cellId: this.memory.getOwningCellId?.(),
      category: MemoryCategory.PROCEDURAL,
      type: 'NEURAL_CHECKPOINT',
      content: checkpoint,
      source: 'neural_learning_engine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1,
      hash: '',
      provenance: ['neural_learning_engine'],
      version: checkpoint.step
    });
  }

  async loadCheckpoint(): Promise<boolean> {
    const entry = await this.memory.get(this.checkpointId);
    if (!entry || entry.type !== 'NEURAL_CHECKPOINT') return false;
    this.model = new BinaryMLP(entry.content.inputSize, entry.content.hiddenSize, entry.content as MLPCheckpoint);
    return true;
  }
}

