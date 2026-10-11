import { describe, it, expect } from 'vitest';
import { 
  NeuroSymbolicEngine, 
  CyberSecurityExpert, 
  MetabolicCellExpert 
} from '../src/redqueen/cognition/neuro_symbolic_engine';
import { Hypervector } from '../src/redqueen/cognition/hdc';

describe('Red Queen Neuro-Symbolic Cognitive Engine (Pillar 1, 2, 3)', () => {
  it('should initialize with 4096-bit HDC and seed foundational concepts', () => {
    const engine = new NeuroSymbolicEngine({ dimension: 4096 });
    expect(engine.hdcDimension).toBe(4096);
    expect(engine.associativeMemory.size).toBeGreaterThan(0);
  });

  it('should perform one-shot learning of new facts without catastrophic forgetting', () => {
    const engine = new NeuroSymbolicEngine({ dimension: 4096 });
    const initialSize = engine.associativeMemory.size;

    const hv = engine.learnConcept('Quantum-resistant Kyber lattice key exchange', 'SECURITY_AXIOM');
    expect(hv).toBeInstanceOf(Hypervector);
    expect(hv.dimension).toBe(4096);
    expect(engine.associativeMemory.size).toBe(initialSize + 1);

    // Query associative memory for the learned concept
    const matches = engine.queryAssociativeMemory('Quantum-resistant lattice key', 3);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].label).toBe('Quantum-resistant Kyber lattice key exchange');
    expect(matches[0].similarity).toBeGreaterThan(0.4);
  });

  it('should evaluate cybersecurity inputs via CyberSecurityExpert', async () => {
    const expert = new CyberSecurityExpert();
    const canHandleScore = expert.canHandle('Deteksi DDoS flood attack pada port Kademlia');
    expect(canHandleScore).toBeGreaterThan(0.3);

    const evaluation = await expert.evaluate('Deteksi DDoS flood attack pada port Kademlia');
    expect(evaluation.score).toBeGreaterThan(0.8);
    expect(evaluation.conclusion).toContain('Rate-limiting policy');
  });

  it('should route queries accurately through Cellular MoE micro-experts', async () => {
    const engine = new NeuroSymbolicEngine();
    
    // Security stimulus
    const secResult = await engine.processChat('Analisis malware payload dan sybil attack pada swarm');
    expect(secResult.telemetry.activeExperts.length).toBeGreaterThan(0);
    const hasSecurityExpert = secResult.telemetry.activeExperts.some(e => e.name === 'CyberSecurityExpert');
    expect(hasSecurityExpert).toBe(true);

    // Logic stimulus
    const logicResult = await engine.processChat('Jika semua node A terotentikasi dan node B bagian dari A, buktikan B terotentikasi');
    const hasLogicExpert = logicResult.telemetry.activeExperts.some(e => e.name === 'LogicExpert');
    expect(hasLogicExpert).toBe(true);
  });

  it('should execute end-to-end chat with linear SSM recurrence and complete telemetry', async () => {
    const engine = new NeuroSymbolicEngine();
    const response = await engine.processChat('Bagaimana status kesiapan pertahanan dan koordinasi sel Red Queen?');
    
    expect(response.statement.length).toBeGreaterThan(30);
    expect(response.confidence).toBeGreaterThan(0.8);
    expect(response.reasoningSteps.length).toBeGreaterThan(0);
    expect(response.fluidSynthesis).toBeDefined();
    expect(response.fluidSynthesis?.fluencyScore).toBeGreaterThan(0.9);
    
    // Telemetry integrity
    expect(response.telemetry.mode).toBe('NEURO_SYMBOLIC_EDGE');
    expect(response.telemetry.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(response.telemetry.tokensProcessed).toBeGreaterThan(0);
    expect(response.telemetry.hdcStats.activeDimensions).toBe(4096);
    expect(response.telemetry.ssmStats.hiddenStateNorm).toBeGreaterThan(0);
    expect(response.telemetry.ssmStats.memoryFootprintKb).toBeGreaterThan(0);
  });

  it('should synthesize natural human-grade responses for casual and factual inputs (Phase 7)', async () => {
    const engine = new NeuroSymbolicEngine();

    // 1. Casual colloquial Indonesian input
    const casualRes = await engine.processChat('Halo bro, apa kabar? lu bisa apa aja?');
    expect(casualRes.statement.toLowerCase()).toContain('red queen');
    expect(casualRes.fluidSynthesis?.detectedTone).toBe('CASUAL_INDONESIAN');

    // 2. Factual knowledge query about verified domain
    const factRes = await engine.processChat('Apa itu Linux?');
    expect(factRes.statement.length).toBeGreaterThan(40);
    expect(factRes.fluidSynthesis?.groundedFactsCount).toBeGreaterThanOrEqual(0);
  });

  it('should run hardware profiling benchmarks with microsecond precision', () => {
    const engine = new NeuroSymbolicEngine();
    const metrics = engine.runHardwareBenchmark(500);

    expect(metrics.hdcOpsPerSec).toBeGreaterThan(1000);
    expect(metrics.hdcAvgLatencyMicros).toBeGreaterThan(0);
    expect(metrics.ssmStepsPerSec).toBeGreaterThan(1000);
    expect(metrics.ssmAvgLatencyMicros).toBeGreaterThan(0);
    expect(metrics.tokenizerTokensPerSec).toBeGreaterThan(1000);
    expect(metrics.memoryEfficiencyRatioVsTransformer).toBeGreaterThan(100);
    expect(metrics.mobileSimulatedScore.ramFootprintMb).toBeLessThan(30);
  });
});
