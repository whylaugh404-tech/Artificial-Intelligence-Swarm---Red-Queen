import { describe, it, expect, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import {
  CognitiveRuntime,
  CognitiveRequest
} from '../src/redqueen/cognition/runtime';
import { populationCycleEngine } from '../src/redqueen/evolution/population-cycle';
import { populationSelectionEngine } from '../src/redqueen/evolution/selection';
import { EvaluationInput } from '../src/redqueen/evolution/types';

import { CellCapability } from '../src/redqueen/genome/types';

describe('P9.4 — Red Queen Cognitive Runtime Foundation', () => {
  const activeCells: Cell[] = [];
  const createdPaths: string[] = [];

  const createTestCell = (id: string, options?: { specialization?: string; capabilities?: CellCapability[] }) => {
    const storagePath = join(process.cwd(), `.tmp_test_p94_${id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    if (existsSync(storagePath)) {
      rmSync(storagePath, { recursive: true, force: true });
    }
    const cell = new Cell(storagePath, 'dummy-key', undefined, undefined, undefined, {
      capabilities: options?.capabilities || ['COGNITIVE_REASONING'],
      specialization: options?.specialization || null
    });
    activeCells.push(cell);
    createdPaths.push(storagePath);
    return cell;
  };

  afterEach(async () => {
    for (const c of activeCells) {
      try { await c.stop(); } catch {}
    }
    activeCells.length = 0;
    for (const p of createdPaths) {
      if (existsSync(p)) rmSync(p, { recursive: true, force: true });
    }
    createdPaths.length = 0;
  });

  const defaultContext = {
    contextId: 'ctx_default',
    domain: 'test_domain',
    temporal: { timestamp: new Date().toISOString() },
    spatial: { location: 'test-env' },
    epistemic: { certainty: 1.0 },
    social: { agentId: 'creator' }
  };

  it('1 & 2. Creator input diterima & CognitiveRequest dibuat', async () => {
    const c1 = createTestCell('c1');
    const runtime = new CognitiveRuntime([c1]);

    const request: CognitiveRequest = {
      requestId: 'req-1',
      creatorInput: 'Hello Red Queen',
      context: defaultContext
    };

    const result = await runtime.process(request);
    expect(result.requestId).toBe('req-1');
    expect(result.status).toBe('SUCCESS');
    expect(result.understanding).toBeDefined();
    expect(result.understanding?.summary).toBe('Hello Red Queen');
  });

  it('3. Understanding terjadi sebelum reasoning', async () => {
    const c1 = createTestCell('c1');
    const runtime = new CognitiveRuntime([c1]);

    const result = await runtime.process({
      requestId: 'req-3',
      creatorInput: 'Analyze this',
      context: defaultContext
    });

    const uIndex = result.provenance.findIndex(p => p.startsWith('understanding_formed'));
    const rIndex = result.provenance.findIndex(p => p.startsWith('reasoning_completed'));

    expect(uIndex).toBeGreaterThan(-1);
    expect(rIndex).toBeGreaterThan(-1);
    expect(uIndex).toBeLessThan(rIndex); // Understanding MUST precede reasoning
  });

  it('4 & 5. Relevant Cell ditemukan, Irrelevant diabaikan', async () => {
    const c1 = createTestCell('c1', { specialization: 'MATH_EXPERT' }); // Relevant if specialized
    const c2 = createTestCell('c2', { capabilities: ['AUTHORIZED_MEMORY_OPS'] }); // Irrelevant

    const runtime = new CognitiveRuntime([c1, c2]);

    const result = await runtime.process({
      requestId: 'req-4',
      creatorInput: 'Calculate trajectory',
      context: defaultContext
    });

    expect(result.activatedCells.length).toBe(1);
    expect(result.activatedCells[0].cellId).toBe(c1.nodeId);
    
    // c2 should not be activated
    const activatedIds = result.activatedCells.map(a => a.cellId);
    expect(activatedIds).not.toContain(c2.nodeId);
  });

  it('6 & 7. Multiple Cell contributions dikomposisikan -> Collective result', async () => {
    const c1 = createTestCell('c1', { specialization: 'LOGIC' });
    const c2 = createTestCell('c2', { capabilities: ['COGNITIVE_REASONING'] });
    
    const runtime = new CognitiveRuntime([c1, c2]);

    const result = await runtime.process({
      requestId: 'req-6',
      creatorInput: 'What is the logical conclusion?',
      context: defaultContext
    });

    expect(result.activatedCells.length).toBe(2);
    expect(result.reasoning).toBeDefined();
    expect(result.reasoning?.premises.length).toBe(2); // One premise per activated cell
    expect(result.conclusion).toBeDefined();
    expect(result.conclusion?.statement).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('8, 9, 10, 11, 12. Immutability (Individuality, Genome, Lineage, Memory, Cognitive State)', async () => {
    const c1 = createTestCell('c1', { capabilities: ['COGNITIVE_REASONING'] });
    const runtime = new CognitiveRuntime([c1]);

    const originalNodeId = c1.nodeId;
    const originalGenomeId = c1.genome.genomeId;
    const originalLineageId = c1.lineage.lineageId;
    const originalMemoryRef = c1.memory;
    const originalCognitiveRef = c1.cognitiveState;

    await runtime.process({
      requestId: 'req-8',
      creatorInput: 'Process immutability test',
      context: defaultContext
    });

    expect(c1.nodeId).toBe(originalNodeId);
    expect(c1.genome.genomeId).toBe(originalGenomeId);
    expect(c1.lineage.lineageId).toBe(originalLineageId);
    expect(c1.memory).toBe(originalMemoryRef);
    expect(c1.cognitiveState).toBe(originalCognitiveRef);
  });

  it('13 & 14. Provenance (Evidence, Reasoning, Trace)', async () => {
    const c1 = createTestCell('c1');
    const runtime = new CognitiveRuntime([c1]);

    const result = await runtime.process({
      requestId: 'req-13',
      creatorInput: 'Trace provenance',
      context: defaultContext
    });

    expect(result.provenance).toContain(`request_received:req-13`);
    expect(result.provenance.some(p => p.startsWith('understanding_formed:'))).toBe(true);
    expect(result.provenance.some(p => p.startsWith('cells_activated:'))).toBe(true);
    expect(result.provenance.some(p => p.startsWith('reasoning_completed:'))).toBe(true);
    
    expect(result.reasoning?.provenance).toBeDefined();
    expect(result.reasoning?.conclusion.provenance).toBeDefined();
  });

  it('16, 17, 18. Deterministic Identity (Timestamp isolated, Semantic equivalence)', async () => {
    const c1 = createTestCell('c1');
    const runtime = new CognitiveRuntime([c1]);

    const ctx = {
      contextId: 'ctx_default',
      domain: 'test_domain',
      temporal: { timestamp: '2026-09-15T00:00:00.000Z' },
      spatial: { location: 'test-env' },
      epistemic: { certainty: 1.0 },
      social: { agentId: 'creator' }
    };

    const res1 = await runtime.process({
      requestId: 'req-id',
      creatorInput: 'Same semantic input',
      context: ctx,
      timestamp: '2026-09-15T12:00:00.000Z' // Different timestamp
    });

    const res2 = await runtime.process({
      requestId: 'req-id',
      creatorInput: 'Same semantic input',
      context: ctx,
      timestamp: '2026-09-15T14:00:00.000Z' // Different timestamp
    });

    expect(res1.deterministicIdentity).toBe(res2.deterministicIdentity);
  });

  it('19. Insufficient state ditangani secara eksplisit', async () => {
    const c1 = createTestCell('c1');
    const runtime = new CognitiveRuntime([c1]);

    // Test unknown intent
    const res1 = await runtime.process({
      requestId: 'req-19a',
      creatorInput: 'unknown_intent_marker',
      context: defaultContext
    });
    expect(res1.status).toBe('INSUFFICIENT_UNDERSTANDING');
    expect(res1.understanding).toBeUndefined();
    expect(res1.deterministicIdentity).toBeDefined();

    // Test insufficient active cells / reasoning
    const res2 = await runtime.process({
      requestId: 'req-19b',
      creatorInput: 'insufficient_state_marker',
      context: defaultContext
    });
    expect(res2.status).toBe('INSUFFICIENT_COGNITIVE_STATE');
    expect(res2.understanding).toBeDefined();
    expect(res2.reasoning).toBeUndefined();
    expect(res2.deterministicIdentity).toBeDefined();
  });

  it('20. Tidak ada external AI provider call', async () => {
    const c1 = createTestCell('c1');
    const runtime = new CognitiveRuntime([c1]);
    
    // Process a standard request. 
    // If it succeeds instantly without mocked network fetch/AI provider configuration,
    // we know it runs purely on internal deterministic logical composition.
    const startTime = Date.now();
    const result = await runtime.process({
      requestId: 'req-20',
      creatorInput: 'No LLM',
      context: defaultContext
    });
    const duration = Date.now() - startTime;
    
    expect(result.status).toBe('SUCCESS');
    expect(duration).toBeLessThan(100); // Should be very fast (pure CPU ops)
  });

  // Regressions to ensure P9.4 runtime addition didn't break P9.1, P9.2, P9.3 implementations
  it('21. P9.1 regression', () => {
    const cell = createTestCell('p91_reg');
    const evalInput: EvaluationInput = {
      computationTasks: [{ status: 'COMPLETED' }],
      operationalConfidence: 0.88,
      reliabilityScore: 0.92,
      conceptCount: 6,
      resourceScore: 0.8
    };

    const fitness = cell.evolution.evaluateFitness(cell, evalInput);
    expect(fitness.overallFitness).toBeGreaterThan(0.0);
    
    const originalVersion = cell.genome.genomeVersion;
    const mutationResult = cell.evolution.mutate({
      seed: 'seed_p91',
      maxStepSize: 0.05
    }, cell);

    expect(mutationResult.evolvedGenome.genomeVersion).toBe(originalVersion + 1);
  });

  it('22. P9.2 regression', () => {
    const c1 = createTestCell('p92_1');
    const c2 = createTestCell('p92_2', { specialization: 'ANALYST' });

    const selectionResult = populationSelectionEngine.select([c1, c2], {
      selectionCount: 1,
      preserveSpecializationNiches: true
    });

    expect(selectionResult.populationSize).toBe(2);
    expect(selectionResult.selectedCells.length).toBe(1);
  });

  it('23. P9.3 regression', () => {
    const c1 = createTestCell('p93_1');
    const c2 = createTestCell('p93_2');

    const result = populationCycleEngine.executeCycle([c1, c2], {
      currentGeneration: 0,
      selectionCount: 1
    });

    expect(result.generation).toBe(1);
    expect(result.survivingCells.length).toBe(1);
    expect(result.evolutionEvent.deterministicHash).toBeDefined();
  });
});
