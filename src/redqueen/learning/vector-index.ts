import { MemoryCategory, MemoryEntry, MemoryStore } from '../memory/store';
import { computeDeterministicHash } from '../cognition/computation/canonical';
import { dot, HashEmbeddingModel, Vector } from './tensor';

export interface VectorIndexRecord { id: string; text: string; vector: Vector; metadata?: Record<string, unknown>; }
export interface VectorSearchResult extends VectorIndexRecord { score: number; }

function cosineSimilarity(a: Vector, b: Vector): number {
  if (a.length !== b.length) throw new Error(`Vector shape mismatch: ${a.length} != ${b.length}`);
  const normA = Math.sqrt(dot(a, a));
  const normB = Math.sqrt(dot(b, b));
  if (normA === 0 || normB === 0) return 0;
  return dot(a, b) / (normA * normB);
}

/** Persistent, deterministic nearest-neighbour index for the local cell. */
export class NeuralVectorIndex {
  constructor(private readonly memory: MemoryStore, public readonly embedding: HashEmbeddingModel) {}

  async upsert(id: string, text: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!id.trim() || !text.trim()) throw new Error('Vector index id and text are required');
    const vector = this.embedding.embed(text);
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id: `vector_${id}`,
      cellId: this.memory.getOwningCellId?.(),
      category: MemoryCategory.SEMANTIC,
      type: 'NEURAL_VECTOR',
      content: { id, text, vector, metadata },
      source: 'neural_vector_index',
      createdAt: now,
      updatedAt: now,
      confidence: 1,
      hash: computeDeterministicHash({ id, text, vector, metadata }),
      provenance: ['neural_vector_index']
    };
    await this.memory.put(entry);
  }

  async search(text: string, limit = 5): Promise<VectorSearchResult[]> {
    if (!text.trim()) throw new Error('Vector search query is required');
    if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) throw new Error('Vector search limit must be between 1 and 1000');
    const query = this.embedding.embed(text);
    const entries = await this.memory.search({ type: 'NEURAL_VECTOR' });
    return entries.map(entry => {
      const content = entry.content as VectorIndexRecord;
      return { ...content, score: cosineSimilarity(query, content.vector) };
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
  }
}

