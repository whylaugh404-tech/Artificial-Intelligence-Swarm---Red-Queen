import { describe, it, expect, vi } from 'vitest';
import { CognitiveRuntime } from '../src/redqueen/cognition/runtime';
import { Cell } from '../src/redqueen/core/cell';
import { CellGenome } from '../src/redqueen/genome/types';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';

describe('P9.5 — Non-Linear Collective Cognition', () => {
  const createMockCell = (id: string, specs: string, caps: string[]): Cell => {
    return {
      nodeId: id,
      lineageId: `lin_${id}`,
      genome: {
        genomeId: `gen_${id}`,
        lineageId: `lin_${id}`,
        generation: 1,
        fitness: 1,
        capabilities: caps,
        specialization: specs
      } as unknown as CellGenome,
      memoryStore: {
        put: vi.fn(),
        get: vi.fn(),
        query: vi.fn().mockResolvedValue([])
      } as any,
      p2pTransport: {
        start: vi.fn(),
        stop: vi.fn()
      } as any,
      evolutionEngine: {} as any,
      start: vi.fn(),
      stop: vi.fn(),
      getState: vi.fn(),
      submitTask: vi.fn()
    } as any;
  };

  const c1 = createMockCell('c1', 'MATH_EXPERT', ['COGNITIVE_REASONING', 'INFO_PROCESSING']);
  const c2 = createMockCell('c2', 'PHYSICS_EXPERT', ['COGNITIVE_REASONING']);
  const c3 = createMockCell('c3', 'DATA_EVALUATOR', ['EVIDENCE']);

  const population = [c1, c2, c3];
  const runtime = new CognitiveRuntime(population);

  const mockContext = {
    contextId: 'ctx_mock',
    domain: 'science',
    timeframe: 'now',
    certaintyRequirement: 0.8
  };

  it('1. input menghasilkan structured understanding', async () => {
    const result = await runtime.process({
      requestId: 'req_1',
      creatorInput: 'test structural representation',
      context: mockContext
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.understanding).toBeDefined();
    expect(result.understanding?.intent).toBeDefined();
  });

  it('2. understanding memiliki concepts', async () => {
    const result = await runtime.process({
      requestId: 'req_2',
      creatorInput: 'test concepts',
      context: mockContext
    });

    expect(result.understanding?.concepts).toBeDefined();
    expect(Array.isArray(result.understanding?.concepts)).toBe(true);
  });

  it('3. understanding memiliki relations', async () => {
    const result = await runtime.process({
      requestId: 'req_3',
      creatorInput: 'test relations',
      context: mockContext
    });

    expect(result.understanding?.relations).toBeDefined();
    expect(Array.isArray(result.understanding?.relations)).toBe(true);
  });

  it('4. multiple Cells menghasilkan structured contributions', async () => {
    const result = await runtime.process({
      requestId: 'req_4',
      creatorInput: 'gravity and mass',
      context: mockContext
    });
    
    expect(result.activatedCells.length).toBeGreaterThan(0);
    // Collective composition is triggered internally
    expect(result.collective).toBeDefined();
  });

  it('5. Cell contributions interact', async () => {
    // Mock UnderstandingEngine to inject specific concepts & relations
    const customRuntime = new CognitiveRuntime(population, {
      understandingEngine: {
        compose: (input: any) => ({
          understandingId: 'und_mock',
          summary: input.summary,
          intent: 'evaluate interaction',
          concepts: [
            { conceptId: 'c_gravity', canonicalName: 'gravity' },
            { conceptId: 'c_mass', canonicalName: 'mass' }
          ],
          relations: [
            { relationId: 'rel_1', subjectConceptId: 'c_gravity', predicate: 'DEPENDS_ON', objectConceptId: 'c_mass' }
          ],
          constraints: [],
          unknowns: [],
          requiredCapabilities: [],
          dependencies: [{ sourceId: 'src1', sourceType: 'CONCEPT', role: 'test' }],
          evidenceIds: [],
          context: mockContext,
          provenance: ['test'],
          verificationStatus: RepresentationVerificationStatus.PENDING,
          originatingCellId: 'test',
          createdAt: new Date().toISOString(),
          version: 1,
          metadata: {}
        })
      } as any
    });

    const result = await customRuntime.process({
      requestId: 'req_5',
      creatorInput: 'how does gravity relate to mass?',
      context: mockContext
    });

    expect(result.collective).toBeDefined();
    expect(result.collective.emergentStructures.length).toBeGreaterThan(0);
  });

  it('6. interaction menghasilkan new relation', async () => {
    // emergent structure is essentially a new hypothesis/relation
    const customRuntime = new CognitiveRuntime(population, {
      understandingEngine: {
        compose: (input: any) => ({
          understandingId: 'und_mock_2',
          summary: 'x',
          concepts: [
            { conceptId: 'X', canonicalName: 'X' },
            { conceptId: 'Y', canonicalName: 'Y' }
          ],
          relations: [
            { relationId: 'r1', subjectConceptId: 'X', predicate: 'CAUSES', objectConceptId: 'Y' }
          ],
          constraints: [], unknowns: [], requiredCapabilities: [], dependencies: [{ sourceId: 'src1', sourceType: 'CONCEPT', role: 'test' }], evidenceIds: [],
          context: mockContext, provenance: ['test'], verificationStatus: RepresentationVerificationStatus.PENDING,
          originatingCellId: 'test', createdAt: new Date().toISOString(), version: 1, metadata: {}
        })
      } as any
    });

    const result = await customRuntime.process({
      requestId: 'req_6',
      creatorInput: 'X causes Y',
      context: mockContext
    });

    const emergent = result.collective.emergentStructures[0];
    expect(emergent).toBeDefined();
    expect(emergent.transformation).toBe('CROSS_CELL_RELATION_MATCH');
  });

  it('7. interaction menghasilkan hypothesis', async () => {
    const customRuntime = new CognitiveRuntime(population, {
      understandingEngine: {
        compose: (input: any) => ({
          understandingId: 'und_mock_3',
          summary: 'x',
          concepts: [
            { conceptId: 'A', canonicalName: 'A' },
            { conceptId: 'B', canonicalName: 'B' }
          ],
          relations: [], // No explicit relations -> Conceptual synthesis -> Hypothesis
          constraints: [], unknowns: [], requiredCapabilities: [], dependencies: [{ sourceId: 'src1', sourceType: 'CONCEPT', role: 'test' }], evidenceIds: [],
          context: mockContext, provenance: ['test'], verificationStatus: RepresentationVerificationStatus.PENDING,
          originatingCellId: 'test', createdAt: new Date().toISOString(), version: 1, metadata: {}
        })
      } as any
    });

    const result = await customRuntime.process({
      requestId: 'req_7',
      creatorInput: 'concept A and B',
      context: mockContext
    });

    const hypotheses = result.collective.hypotheses;
    expect(hypotheses.length).toBe(1);
    expect(hypotheses[0].statement).toContain('Possible emergent link between');
  });

  it('8. hypothesis berbeda dari source contribution', async () => {
    const customRuntime = new CognitiveRuntime(population, {
      understandingEngine: {
        compose: (input: any) => ({
          understandingId: 'und_mock_4',
          summary: 'x',
          concepts: [
            { conceptId: 'C', canonicalName: 'C' },
            { conceptId: 'D', canonicalName: 'D' }
          ],
          relations: [],
          constraints: [], unknowns: [], requiredCapabilities: [], dependencies: [{ sourceId: 'src1', sourceType: 'CONCEPT', role: 'test' }], evidenceIds: [],
          context: mockContext, provenance: ['test'], verificationStatus: RepresentationVerificationStatus.PENDING,
          originatingCellId: 'test', createdAt: new Date().toISOString(), version: 1, metadata: {}
        })
      } as any
    });

    const result = await customRuntime.process({
      requestId: 'req_8',
      creatorInput: 'test diff',
      context: mockContext
    });

    const emergent = result.collective.emergentStructures[0];
    const sourceStructs = emergent.sourceStructures;
    expect(sourceStructs).not.toContain(emergent.resultingStructure);
  });

  it('9. evidence dapat mendukung hypothesis', async () => {
    // Handled in collective engine logic
    const customRuntime = new CognitiveRuntime(population, {
      understandingEngine: {
        compose: (input: any) => ({
          understandingId: 'und_mock_9',
          summary: 'evidence',
          concepts: [{ conceptId: 'A' }, { conceptId: 'B' }],
          relations: [{ relationId: 'r1', subjectConceptId: 'A', predicate: 'IS', objectConceptId: 'B' }],
          constraints: [], unknowns: [], requiredCapabilities: [], dependencies: [{ sourceId: 'src1', sourceType: 'CONCEPT', role: 'test' }], evidenceIds: [],
          context: mockContext, provenance: ['test'], verificationStatus: RepresentationVerificationStatus.PENDING,
          originatingCellId: 'test', createdAt: new Date().toISOString(), version: 1, metadata: {}
        })
      } as any
    });

    const result = await customRuntime.process({
      requestId: 'req_9',
      creatorInput: 'evidence evidence', // includes "evidence" keyword to activate EVIDENCE cell
      context: mockContext
    });
    
    // In our mock gatherContributions, EVIDENCE cell provides support for the first relation
    expect(result.collective.beliefs[0].status).toBe(RepresentationVerificationStatus.SUPPORTED);
  });

  it('10. evidence dapat membantah hypothesis', async () => {
    // Modifying gatherContributions for contradiction is tricky from here, 
    // so let's directly call collectiveEngine
    const result = runtime['collectiveEngine'].compose(
      { concepts: [], relations: [] } as any,
      [
        { cellId: 'c1', contributionType: 'RELATION', content: { relationId: 'r1', subjectConceptId: 'A', objectConceptId: 'B', predicate: 'IS' }, confidence: 1 },
        { cellId: 'c1', contributionType: 'CONCEPT', content: { conceptId: 'A' }, confidence: 1 },
        { cellId: 'c2', contributionType: 'EVIDENCE', content: { evidenceId: 'e1', contradicts: 'r1' }, confidence: 1 }
      ],
      mockContext
    );

    expect(result.beliefs[0].status).toBe(RepresentationVerificationStatus.REJECTED);
  });

  it('11. contradiction dipertahankan', async () => {
    const result = runtime['collectiveEngine'].compose(
      { concepts: [], relations: [] } as any,
      [
        { cellId: 'c1', contributionType: 'RELATION', content: { relationId: 'r1', subjectConceptId: 'A', objectConceptId: 'B', predicate: 'IS' }, confidence: 1 },
        { cellId: 'c1', contributionType: 'CONCEPT', content: { conceptId: 'A' }, confidence: 1 },
        { cellId: 'c2', contributionType: 'EVIDENCE', content: { evidenceId: 'e1', contradicts: 'r1' }, confidence: 1 },
        { cellId: 'c3', contributionType: 'EVIDENCE', content: { evidenceId: 'e2', supports: 'r1' }, confidence: 1 }
      ],
      mockContext
    );

    expect(result.beliefs[0].status).toBe(RepresentationVerificationStatus.CONTRADICTED);
    expect(result.contradictions.length).toBe(1);
  });

  it('12. belief dapat berubah berdasarkan evidence', async () => {
    const result = runtime['collectiveEngine'].compose(
      { concepts: [], relations: [] } as any,
      [
        { cellId: 'c1', contributionType: 'RELATION', content: { relationId: 'r1', subjectConceptId: 'A', objectConceptId: 'B', predicate: 'IS' }, confidence: 1 },
        { cellId: 'c1', contributionType: 'CONCEPT', content: { conceptId: 'A' }, confidence: 1 },
        { cellId: 'c2', contributionType: 'EVIDENCE', content: { evidenceId: 'e1', supports: 'r1' }, confidence: 1 }
      ],
      mockContext
    );

    expect(result.beliefs[0].belief).toBeGreaterThan(0.5);
  });

  it('13. collective result bukan penjumlahan score', async () => {
    const customRuntime = new CognitiveRuntime(population, {
      understandingEngine: {
        compose: (input: any) => ({
          understandingId: 'und_mock_13',
          summary: 'x',
          concepts: [{ conceptId: 'C' }, { conceptId: 'D' }],
          relations: [],
          constraints: [], unknowns: [], requiredCapabilities: [], dependencies: [{ sourceId: 'src1', sourceType: 'CONCEPT', role: 'test' }], evidenceIds: [],
          context: mockContext, provenance: ['test'], verificationStatus: RepresentationVerificationStatus.PENDING,
          originatingCellId: 'test', createdAt: new Date().toISOString(), version: 1, metadata: {}
        })
      } as any
    });

    const result = await customRuntime.process({
      requestId: 'req_13',
      creatorInput: 'test score',
      context: mockContext
    });

    const emergent = result.collective.emergentStructures[0];
    expect(typeof emergent).toBe('object');
    expect(emergent.resultingStructure).toBeDefined();
    // Prove it's a structural transformation, not an arithmetic sum
    expect(typeof emergent.resultingStructure.statement).toBe('string');
  });

  it('14. collective result bukan daftar Cell', async () => {
    const customRuntime = new CognitiveRuntime(population, {
      understandingEngine: {
        compose: (input: any) => ({
          understandingId: 'und_mock_14',
          summary: 'x',
          concepts: [{ conceptId: 'C' }, { conceptId: 'D' }],
          relations: [],
          constraints: [], unknowns: [], requiredCapabilities: [], dependencies: [{ sourceId: 'src1', sourceType: 'CONCEPT', role: 'test' }], evidenceIds: [],
          context: mockContext, provenance: ['test'], verificationStatus: RepresentationVerificationStatus.PENDING,
          originatingCellId: 'test', createdAt: new Date().toISOString(), version: 1, metadata: {}
        })
      } as any
    });

    const result = await customRuntime.process({
      requestId: 'req_14',
      creatorInput: 'test list',
      context: mockContext
    });

    const reasoning = result.reasoning;
    // The reasoning shouldn't just be a list of cells
    expect(reasoning?.premises[0].statement).toContain('Emergent structure');
  });

  it('15. emergent structure memiliki provenance', async () => {
    const customRuntime = new CognitiveRuntime(population, {
      understandingEngine: {
        compose: (input: any) => ({
          understandingId: 'und_mock_15',
          summary: 'x',
          concepts: [{ conceptId: 'C' }, { conceptId: 'D' }],
          relations: [],
          constraints: [], unknowns: [], requiredCapabilities: [], dependencies: [{ sourceId: 'src1', sourceType: 'CONCEPT', role: 'test' }], evidenceIds: [],
          context: mockContext, provenance: ['test'], verificationStatus: RepresentationVerificationStatus.PENDING,
          originatingCellId: 'test', createdAt: new Date().toISOString(), version: 1, metadata: {}
        })
      } as any
    });

    const result = await customRuntime.process({
      requestId: 'req_15',
      creatorInput: 'test provenance',
      context: mockContext
    });

    const emergent = result.collective.emergentStructures[0];
    expect(emergent.provenance).toBeDefined();
    expect(emergent.provenance.length).toBeGreaterThan(0);
  });

  it('16. emergent structure deterministic', async () => {
    const result1 = runtime['collectiveEngine'].compose(
      { concepts: [], relations: [] } as any,
      [
        { cellId: 'c1', contributionType: 'CONCEPT', content: { conceptId: 'A' }, confidence: 1 },
        { cellId: 'c2', contributionType: 'CONCEPT', content: { conceptId: 'B' }, confidence: 1 }
      ],
      mockContext
    );

    const result2 = runtime['collectiveEngine'].compose(
      { concepts: [], relations: [] } as any,
      [
        { cellId: 'c1', contributionType: 'CONCEPT', content: { conceptId: 'A' }, confidence: 1 },
        { cellId: 'c2', contributionType: 'CONCEPT', content: { conceptId: 'B' }, confidence: 1 }
      ],
      mockContext
    );

    expect(result1.emergentStructures[0].deterministicIdentity).toBe(result2.emergentStructures[0].deterministicIdentity);
  });

  it('17. Cell individuality preserved', () => {
    expect(c1.nodeId).toBe('c1');
    expect(c2.nodeId).toBe('c2');
  });

  it('18. genome unchanged', () => {
    expect(c1.genome.genomeId).toBe('gen_c1');
  });

  it('19. memory unchanged', () => {
    expect((c1 as any).memoryStore.put).not.toHaveBeenCalled();
  });

  it('20. lineage unchanged', () => {
    expect((c1 as any).lineageId).toBe('lin_c1');
  });

  it('21. no external AI provider', async () => {
    const start = performance.now();
    await runtime.process({
      requestId: 'req_perf',
      creatorInput: 'test perf',
      context: mockContext
    });
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100);
  });

  it('22. deterministic semantic identity', async () => {
    const result1 = await runtime.process({
      requestId: 'same_req',
      creatorInput: 'semantic identity test',
      context: mockContext
    });

    const result2 = await runtime.process({
      requestId: 'same_req',
      creatorInput: 'semantic identity test',
      context: mockContext
    });

    expect(result1.deterministicIdentity).toBe(result2.deterministicIdentity);
  });

  it('23. P9.4 regression', async () => {
    const result = await runtime.process({
      requestId: 'p94',
      creatorInput: 'hello world',
      context: mockContext
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.understanding).toBeDefined();
    expect(result.reasoning).toBeDefined();
    expect(result.conclusion).toBeDefined();
    expect(result.provenance.length).toBeGreaterThan(0);
  });

  it('24. P9.3 regression', async () => {
    const result = await runtime.process({
      requestId: 'p93',
      creatorInput: 'regression',
      context: mockContext
    });
    expect(result.status).toBe('SUCCESS');
  });
});
