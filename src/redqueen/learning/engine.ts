import { MemoryCategory, MemoryStore } from '../memory/store';
import { BinaryMLP, MLPCheckpoint } from './mlp';
import { HashEmbeddingModel, Vector } from './tensor';
import { NeuralVectorIndex, VectorSearchResult } from './vector-index';
import { AdaptiveNonlinearDynamics, NonlinearCheckpoint } from './nonlinear';
import { RelationalMessagePassingNetwork, RelationalEmbedding } from './relational';
import { CognitiveConcept, CognitiveRelation } from '../cognition/representation/types';

export interface TextTrainingSample { text: string; target: number; }
export interface DatasetTextRecord { text: string; label?: number; target?: number; }
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
  public readonly vectorIndex: NeuralVectorIndex;
  public readonly nonlinearDynamics: AdaptiveNonlinearDynamics;
  public readonly relationalNetwork: RelationalMessagePassingNetwork;
  private model: BinaryMLP;
  private checkpointId = 'neural_checkpoint_default';
  private nonlinearCheckpointId = 'nonlinear_checkpoint_default';

  constructor(private readonly memory: MemoryStore, dimensions = 32, hiddenSize = 16) {
    this.embedding = new HashEmbeddingModel(dimensions);
    this.vectorIndex = new NeuralVectorIndex(memory, this.embedding);
    this.model = new BinaryMLP(dimensions, hiddenSize);
    this.nonlinearDynamics = new AdaptiveNonlinearDynamics();
    this.relationalNetwork = new RelationalMessagePassingNetwork(dimensions);
  }

  async train(samples: TextTrainingSample[], epochs = 10, learningRate = 0.05, validationSamples?: TextTrainingSample[]): Promise<{ epochs: number; loss: number; step: number; metrics: BinaryMetrics; validationMetrics: BinaryMetrics }> {
    if (!Number.isInteger(epochs) || epochs <= 0 || epochs > 10000) throw new Error('epochs must be between 1 and 10000');
    this.validateSamples(samples, 'Training');
    const validationSet = validationSamples ?? this.createValidationSplit(samples);
    this.validateSamples(validationSet, 'Validation');
    const tensors = samples.map(sample => ({ input: this.embedding.embed(sample.text), target: sample.target }));
    let result = { loss: 0, step: 0 };
    let bestTrainingResult = result;
    let bestCheckpoint: MLPCheckpoint | undefined;
    let bestValidationLoss = Number.POSITIVE_INFINITY;
    for (let epoch = 0; epoch < epochs; epoch++) {
      result = this.model.train(tensors, learningRate);
      const validationMetrics = this.evaluate(validationSet);
      if (validationMetrics.loss < bestValidationLoss) {
        bestValidationLoss = validationMetrics.loss;
        bestCheckpoint = this.model.checkpoint();
        bestTrainingResult = result;
      }
    }
    if (bestCheckpoint) this.model = new BinaryMLP(bestCheckpoint.inputSize, bestCheckpoint.hiddenSize, bestCheckpoint);
    await this.saveCheckpoint();
    return { epochs, ...bestTrainingResult, metrics: this.evaluate(samples), validationMetrics: this.evaluate(validationSet) };
  }

  async trainDataset(records: DatasetTextRecord[], epochs = 10, learningRate = 0.05): Promise<{ epochs: number; loss: number; step: number; metrics: BinaryMetrics; validationMetrics: BinaryMetrics }> {
    if (!Array.isArray(records) || records.length < 2) throw new Error('Dataset requires at least two records');
    const samples = records.map((record, index) => {
      const target = record?.target ?? record?.label;
      if (!record || typeof record.text !== 'string' || !Number.isFinite(target)) {
        throw new Error(`Dataset record ${index} requires text and finite label/target`);
      }
      return { text: record.text, target: target as number };
    });
    if (samples.some(sample => sample.target < 0 || sample.target > 1)) {
      throw new Error('Dataset labels must be between 0 and 1');
    }
    const validationSize = Math.max(1, Math.floor(samples.length * 0.2));
    const training = samples.slice(0, samples.length - validationSize);
    const validation = samples.slice(samples.length - validationSize);
    return this.train(training, epochs, learningRate, validation);
  }

  evaluate(samples: TextTrainingSample[]): BinaryMetrics {
    if (samples.length === 0) throw new Error('Evaluation requires at least one sample');
    this.validateSamples(samples, 'Evaluation');
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

  async index(textId: string, text: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.vectorIndex.upsert(textId, text, metadata);
  }

  async search(text: string, limit = 5): Promise<VectorSearchResult[]> {
    return this.vectorIndex.search(text, limit);
  }

  async trainNonlinear(samples: Array<{ state: number; nextState: number }>, learningRate = 0.05): Promise<{ loss: number; step: number; checkpoint: NonlinearCheckpoint }> {
    const result = this.nonlinearDynamics.train(samples, learningRate);
    const checkpoint = this.nonlinearDynamics.checkpoint();
    await this.memory.put({
      id: this.nonlinearCheckpointId,
      cellId: this.memory.getOwningCellId?.(),
      category: MemoryCategory.PROCEDURAL,
      type: 'NONLINEAR_CHECKPOINT',
      content: checkpoint,
      source: 'neural_learning_engine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: 1,
      hash: '',
      provenance: ['neural_learning_engine'],
      version: checkpoint.step
    });
    return { ...result, checkpoint };
  }

  predictNonlinear(state: number): number {
    return this.nonlinearDynamics.predict(state);
  }

  encodeCognitiveGraph(concepts: CognitiveConcept[], relations: CognitiveRelation[]): RelationalEmbedding[] {
    return this.relationalNetwork.encode(concepts, relations);
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
    let loaded = false;
    const entry = await this.memory.get(this.checkpointId);
    if (entry && entry.type === 'NEURAL_CHECKPOINT') {
      const checkpoint = entry.content as MLPCheckpoint;
      if (checkpoint.version !== 1) throw new Error(`Unsupported neural checkpoint version: ${checkpoint.version}`);
      this.model = new BinaryMLP(checkpoint.inputSize, checkpoint.hiddenSize, checkpoint);
      loaded = true;
    }
    const nonlinearEntry = await this.memory.get(this.nonlinearCheckpointId);
    if (nonlinearEntry && nonlinearEntry.type === 'NONLINEAR_CHECKPOINT') {
      const checkpoint = nonlinearEntry.content as NonlinearCheckpoint;
      if (checkpoint.version !== 1) throw new Error(`Unsupported nonlinear checkpoint version: ${checkpoint.version}`);
      this.nonlinearDynamics.restore(checkpoint);
      loaded = true;
    }
    return loaded;
  }

  private validateSamples(samples: TextTrainingSample[], phase: string): void {
    if (!Array.isArray(samples) || samples.length === 0) throw new Error(`${phase} requires at least one sample`);
    for (const sample of samples) {
      if (!sample || typeof sample.text !== 'string' || !sample.text.trim()) {
        throw new Error(`${phase} samples require non-empty text`);
      }
      if (!Number.isFinite(sample.target) || sample.target < 0 || sample.target > 1) {
        throw new Error(`${phase} targets must be finite numbers between 0 and 1`);
      }
    }
  }

  private createValidationSplit(samples: TextTrainingSample[]): TextTrainingSample[] {
    if (samples.length < 2) return samples;
    const holdoutSize = Math.max(1, Math.floor(samples.length * 0.2));
    return samples.slice(samples.length - holdoutSize);
  }
}


