import { CollectiveComputationEngine } from '../src/redqueen/cognition/computation/engine';
import { Cell } from '../src/redqueen/core/cell';
import { CellGenomeSchema } from '../src/redqueen/genome/types';
import { describe, it, expect, beforeEach } from 'vitest';

describe('CellTraits executionParallelism', () => {
  let mockCell: any;

  beforeEach(() => {
    mockCell = {
      nodeId: 'test_cell_1',
      genome: {
        genomeId: 'gen_1',
        capabilities: ['COGNITIVE_REASONING'],
        traits: {
          executionParallelism: 4,
          maxCognitiveCycleDepth: 5
        }
      },
      cognitiveState: {
        getSpecialization: () => null
      },
      cognitiveGraph: {
        getAllConcepts: () => []
      },
      lifecycle: {
        getState: () => 'ACTIVE'
      }
    };
  });

  it('should use executionParallelism=4 and produce parallelism=4', () => {
    const engine = new CollectiveComputationEngine(mockCell as any);
    const capacity = engine.getCellComputeCapacity(mockCell as any);
    
    expect(capacity.parallelism).toBe(4);
  });

  it('should default to parallelism=1 if executionParallelism is not provided', () => {
    mockCell.genome.traits = {
      maxCognitiveCycleDepth: 5
      // executionParallelism not provided
    };
    const engine = new CollectiveComputationEngine(mockCell as any);
    const capacity = engine.getCellComputeCapacity(mockCell as any);
    
    expect(capacity.parallelism).toBe(1);
  });

  it('should not be affected by maxCognitiveCycleDepth', () => {
    mockCell.genome.traits = {
      maxCognitiveCycleDepth: 10,
      executionParallelism: 2
    };
    const engine = new CollectiveComputationEngine(mockCell as any);
    const capacity = engine.getCellComputeCapacity(mockCell as any);
    
    expect(capacity.parallelism).toBe(2);
    // Even with a very large maxCognitiveCycleDepth, parallelism remains 2
  });
});
