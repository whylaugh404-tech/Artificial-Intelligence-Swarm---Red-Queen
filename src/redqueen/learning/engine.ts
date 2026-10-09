import { MemoryCategory, MemoryStore } from '../memory/store';
import { BinaryMLP, MLPCheckpoint } from './mlp';
import { HashEmbeddingModel, Vector } from './tensor';

export interface TextTrainingSample { text: string; target: number; }

export class NeuralLearningEngine {
  public readonly embedding: HashEmbeddingModel;
  private model: BinaryMLP;
  private checkpointId = 'neural_checkpoint_default';

  constructor(private readonly memory: MemoryStore, dimensions = 32, hiddenSize = 16) {
    this.embedding = new HashEmbeddingModel(dimensions);
    this.model = new BinaryMLP(dimensions, hiddenSize);
  }

  async train(samples: TextTrainingSample[], epochs = 10, learningRate = 0.05): Promise<{ epochs: number; loss: number; step: number }> {
    if (!Number.isInteger(epochs) || epochs <= 0 || epochs > 10000) throw new Error('epochs must be between 1 and 10000');
    const tensors = samples.map(sample => ({ input: this.embedding.embed(sample.text), target: sample.target }));
    let result = { loss: 0, step: 0 };
    for (let epoch = 0; epoch < epochs; epoch++) result = this.model.train(tensors, learningRate);
    await this.saveCheckpoint();
    return { epochs, ...result };
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

