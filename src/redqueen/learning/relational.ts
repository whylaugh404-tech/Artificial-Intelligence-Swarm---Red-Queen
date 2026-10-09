import { CognitiveConcept, CognitiveRelation } from '../cognition/representation/types';
import { computeDeterministicHash } from '../cognition/computation/canonical';
import { Vector, dot, zeros } from './tensor';

export interface RelationalEmbedding {
  conceptId: string;
  vector: Vector;
  incomingMessages: number;
}

/** One-step relation-aware message passing over the cognitive graph. */
export class RelationalMessagePassingNetwork {
  constructor(public readonly dimensions = 32) {
    if (!Number.isInteger(dimensions) || dimensions < 4) throw new Error('Relational dimensions must be >= 4');
  }

  encode(concepts: CognitiveConcept[], relations: CognitiveRelation[]): RelationalEmbedding[] {
    const base = new Map<string, Vector>();
    for (const concept of concepts) base.set(concept.conceptId, this.hashVector(concept.canonicalName));
    const messages = new Map<string, Vector>();
    const counts = new Map<string, number>();
    for (const relation of relations) {
      const source = base.get(relation.subjectConceptId);
      const target = base.get(relation.objectConceptId);
      if (!source || !target) continue;
      const weight = relation.confidence * this.predicateWeight(relation.predicate);
      const message = source.map(value => value * weight);
      const previous = messages.get(relation.objectConceptId) ?? zeros(this.dimensions);
      messages.set(relation.objectConceptId, previous.map((value, index) => value + message[index]));
      counts.set(relation.objectConceptId, (counts.get(relation.objectConceptId) ?? 0) + 1);
    }
    return concepts.map(concept => {
      const self = base.get(concept.conceptId)!;
      const incoming = messages.get(concept.conceptId) ?? zeros(this.dimensions);
      const vector = self.map((value, index) => Math.tanh(value + incoming[index]));
      return { conceptId: concept.conceptId, vector, incomingMessages: counts.get(concept.conceptId) ?? 0 };
    });
  }

  similarity(a: Vector, b: Vector): number {
    if (a.length !== this.dimensions || b.length !== this.dimensions) throw new Error('Relational tensor shape mismatch');
    const normA = Math.sqrt(dot(a, a)) || 1;
    const normB = Math.sqrt(dot(b, b)) || 1;
    return dot(a, b) / (normA * normB);
  }

  private hashVector(value: string): Vector {
    const vector = zeros(this.dimensions);
    const hash = computeDeterministicHash(value);
    for (let index = 0; index < this.dimensions; index++) {
      const byte = parseInt(hash.slice((index * 2) % hash.length, (index * 2) % hash.length + 2), 16);
      vector[index] = (byte / 127.5) - 1;
    }
    return vector;
  }

  private predicateWeight(predicate: string): number {
    const hash = parseInt(computeDeterministicHash(predicate).slice(0, 6), 16);
    return 0.75 + (hash % 50) / 100;
  }
}

