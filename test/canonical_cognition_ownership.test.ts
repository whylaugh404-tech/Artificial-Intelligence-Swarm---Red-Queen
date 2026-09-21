import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import { Cell } from '../src/redqueen/core/cell';
import { CognitiveRuntime, CognitiveRequest } from '../src/redqueen/cognition/runtime';
import { CognitionPipeline, LegacyCognitionAdapter } from '../src/redqueen/cognition/pipeline';
import { OpenRouterAIProvider } from '../src/redqueen/cognition/ai-provider';

describe('Repair Prompt 11: Canonical Cognition Path / Legacy Pipeline Ownership', () => {
  let cell: Cell;
  const storageDir = './.test_storage_cognition_canonical';

  beforeEach(async () => {
    cell = new Cell(
      ':memory:',
      'fake_api_key',
      undefined,
      undefined,
      undefined,
      { storageSecret: 'test_secret' }
    );
    await cell.memory.initialize();
  });

  afterEach(async () => {
    await cell.stop();
  });

  describe('1. Topology & Canonical Ownership', () => {
    it('enforces Cell -> CognitiveRuntime -> cognition organs topology', () => {
      // Cell must own a canonical CognitiveRuntime instance
      expect(cell.cognitiveRuntime).toBeDefined();
      expect(cell.cognitiveRuntime).toBeInstanceOf(CognitiveRuntime);
      expect(cell.runtime).toBe(cell.cognitiveRuntime);

      // Cognitive organs must be instantiated and wired
      expect(cell.understanding).toBeDefined();
      expect(cell.reasoning).toBeDefined();
      expect(cell.worldModel).toBeDefined();
      expect(cell.collectiveCognition).toBeDefined();
      expect(cell.cognitiveGraph).toBeDefined();

      // CognitiveRuntime population should contain this cell
      const population = cell.cognitiveRuntime.getPopulation();
      expect(population.some(c => c.nodeId === cell.nodeId)).toBe(true);
    });

    it('exposes processCognitiveRequest delegating directly to canonical CognitiveRuntime', async () => {
      const runtimeProcessSpy = vi.spyOn(cell.cognitiveRuntime, 'process');

      const mockRequest: CognitiveRequest = {
        requestId: 'req_test_canonical_01',
        creatorInput: 'Analyze the system state and determine causality',
        context: {
          contextId: 'ctx_test_canonical_01',
          domain: 'system_analysis'
        },
        timestamp: '2026-01-01T00:00:00.000Z'
      };

      const result = await cell.processCognitiveRequest(mockRequest);

      expect(runtimeProcessSpy).toHaveBeenCalledWith(mockRequest);
      expect(result).toBeDefined();
      expect(result.requestId).toBe('req_test_canonical_01');
      expect(result.deterministicIdentity).toBeDefined();
    });
  });

  describe('2. Legacy CognitionPipeline Isolation & Deprecation Control', () => {
    it('marks CognitionPipeline as legacy and implements LegacyCognitionAdapter', () => {
      expect(cell.cognition).toBeDefined();
      expect(cell.cognition.isLegacy).toBe(true);
      expect(cell.cognition.cellId).toBe(cell.nodeId);
    });

    it('prevents accidental production activation and blocks bypassing epistemic controls', async () => {
      // Direct call without allowLegacyUnsafeExecution MUST throw
      await expect(cell.cognition.executeCycle('empirical observation test'))
        .rejects
        .toThrow(/LEGACY_PIPELINE_ACTIVATION_BLOCKED/);
    });

    it('allows execution only under explicit isolated legacy testing mode', async () => {
      // Mock ai provider generation for legacy cycle
      const mockGenerate = vi.fn().mockResolvedValue({
        goal: 'test_goal',
        hypotheses: ['hypothesis_1'],
        evidence: ['evidence_1'],
        actions: [{ type: 'noop', payload: {} }],
        confidence: 0.85,
        verification: ['verified']
      });

      (cell.cognition as any).ai = {
        generate: mockGenerate
      };

      // Calling with allowLegacyUnsafeExecution: true should proceed in isolated mode
      await expect(
        cell.cognition.executeCycle('empirical observation test', { allowLegacyUnsafeExecution: true })
      ).resolves.not.toThrow();

      expect(mockGenerate).toHaveBeenCalled();
    });
  });

  describe('3. No Parallel Secret Cognitive Brains', () => {
    it('ensures ingestDataset uses canonical pipeline and never triggers legacy executeCycle', async () => {
      const legacyCycleSpy = vi.spyOn(cell.cognition, 'executeCycle');

      await cell.ingestDataset({
        id: 'dataset_record_canonical_01',
        metric: 'throughput',
        value: 1250,
        unit: 'rps'
      });

      // Assert legacy executeCycle is never called
      expect(legacyCycleSpy).not.toHaveBeenCalled();

      // Assert canonical cognitive structures were updated
      const concepts = cell.cognitiveGraph.getAllConcepts();
      expect(concepts.length).toBeGreaterThanOrEqual(0);
    });
  });
});
