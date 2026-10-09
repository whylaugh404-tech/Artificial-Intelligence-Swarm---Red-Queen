import { describe, expect, it } from 'vitest';
import { RelationalMessagePassingNetwork } from '../src/redqueen/learning/relational';

describe('relational message passing', () => {
  it('propagates a typed relation into the target representation', () => {
    const network = new RelationalMessagePassingNetwork(8);
    const now = new Date().toISOString();
    const concept = (conceptId: string, name: string) => ({
      conceptId, canonicalName: name, description: name,
      category: 'GENERAL_TECHNOLOGY' as any, sourceKnowledgeIds: ['k'],
      sourceExperienceIds: [], originatingCellId: 'cell', confidence: 1,
      verificationStatus: 'SUPPORTED' as any, createdAt: now, updatedAt: now,
      version: 1, provenance: ['cell'], metadata: {}
    });
    const concepts = [concept('a', 'source'), concept('b', 'target')];
    const relations = [{
      relationId: 'r', subjectConceptId: 'a', objectConceptId: 'b', predicate: 'CAUSES' as any,
      confidence: 1, provenance: ['cell'], verificationStatus: 'SUPPORTED' as any,
      createdAt: now, originatingCellId: 'cell', metadata: {}
    }];
    const result = network.encode(concepts, relations);
    expect(result).toHaveLength(2);
    expect(result.find(item => item.conceptId === 'b')?.incomingMessages).toBe(1);
    expect(result.find(item => item.conceptId === 'a')?.incomingMessages).toBe(0);
  });
});

