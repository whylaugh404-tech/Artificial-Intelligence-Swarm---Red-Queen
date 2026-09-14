import { describe, test, expect, beforeEach } from 'vitest';
import { ReasoningEngine } from '../src/redqueen/cognition/reasoning/engine';
import { CognitiveGraph } from '../src/redqueen/cognition/representation/graph';
import { ReasoningStepType, HypothesisStatus } from '../src/redqueen/cognition/reasoning/types';

import { MemoryStore, MemoryEntry } from '../src/redqueen/memory/store';

class MockMemoryStore implements MemoryStore {
  public data = new Map<string, MemoryEntry>();
  async initialize() {}
  async put(entry: MemoryEntry) { this.data.set(entry.id, entry); }
  async get(id: string) { return this.data.get(id) || null; }
  async search(query: any) {
    return Array.from(this.data.values()).filter(e => (!query.category || e.category === query.category));
  }
  async delete(id: string) { this.data.delete(id); return true; }
  async remove(id: string) { this.data.delete(id); }
  async clear() { this.data.clear(); }
  getStats() { return { total: 0, episodic: 0, semantic: 0, procedural: 0 }; }
}

describe('P7.0 Step 9: Native Reasoning', () => {
  let memory: MockMemoryStore;
  let graph: CognitiveGraph;
  let reasoningEngine: ReasoningEngine;

  beforeEach(() => {
    memory = new MockMemoryStore();
    graph = new CognitiveGraph('test-cell', memory);
    reasoningEngine = new ReasoningEngine(graph);
  });

  test('Reasoning harus mempertahankan chain of inference dan provenance', () => {
    const chain = reasoningEngine.initiateChain('Determine if CPU is active', 'Audit Log A');
    
    expect(chain).toBeDefined();
    expect(chain.goal).toBe('Determine if CPU is active');
    expect(chain.provenance).toBe('Audit Log A');
    expect(chain.uncertainty).toBe(1.0); // Initially complete uncertainty

    const premise = reasoningEngine.addPremise(chain.chainId, {
      sourceId: 'con_cpu_log',
      sourceType: 'CONCEPT',
      description: 'CPU logs show utilization at 85%'
    });

    expect(chain.premises).toHaveLength(1);
    expect(premise.description).toBe('CPU logs show utilization at 85%');

    const step = reasoningEngine.addInferenceStep(
      chain.chainId,
      ReasoningStepType.DEDUCTION,
      'High utilization implies active state',
      [premise.id],
      ['Logging agent is functioning correctly']
    );

    expect(chain.inferenceSteps).toHaveLength(1);
    expect(step.assumptions).toContain('Logging agent is functioning correctly');

    const hypothesis = reasoningEngine.proposeHypothesis(
      chain.chainId,
      step.id,
      {
        description: 'CPU is in active state',
        confidence: 0.8
      }
    );

    expect(hypothesis.status).toBe(HypothesisStatus.PROPOSED);
    expect(hypothesis.description).toBe('CPU is in active state');
    
    const verification = reasoningEngine.verifyHypothesis(
      chain.chainId,
      hypothesis.id,
      ['ev_metric_1'],
      [],
      'Metrics confirm state',
      HypothesisStatus.VERIFIED,
      0.95
    );

    expect(verification.finalStatus).toBe(HypothesisStatus.VERIFIED);
    expect(verification.conclusionDescription).toBe('Metrics confirm state');

    // Uncertainty should drop since a hypothesis was verified
    expect(chain.uncertainty).toBeCloseTo(1.0 - 0.95);
  });

  test('Mampu mempertahankan alternative hypotheses & counter-evidence', () => {
    const chain = reasoningEngine.initiateChain('Identify anomaly', 'Sensor X');
    
    const step = reasoningEngine.addInferenceStep(
      chain.chainId,
      ReasoningStepType.ABDUCTION,
      'Sensor spikes could mean overheating or malfunction',
      [],
      []
    );

    const hyp1 = reasoningEngine.proposeHypothesis(
      chain.chainId,
      step.id,
      {
        description: 'Sensor is overheating',
        confidence: 0.5
      }
    );

    const hyp2 = reasoningEngine.proposeHypothesis(
      chain.chainId,
      step.id,
      {
        description: 'Sensor is malfunctioning',
        confidence: 0.5
      }
    );

    expect(step.hypotheses).toHaveLength(2);

    reasoningEngine.verifyHypothesis(
      chain.chainId,
      hyp1.id,
      [],
      ['ev_temp_normal'],
      'Temperature sensors show normal range',
      HypothesisStatus.FALSIFIED,
      0.1
    );

    reasoningEngine.verifyHypothesis(
      chain.chainId,
      hyp2.id,
      ['ev_err_log'],
      [],
      'Error logs show hardware fault',
      HypothesisStatus.VERIFIED,
      0.9
    );

    expect(hyp1.status).toBe(HypothesisStatus.FALSIFIED);
    expect(hyp2.status).toBe(HypothesisStatus.VERIFIED);

    // Uncertainty based on the verified and falsified confidence average:
    // (0.1 + 0.9) / 2 = 0.5. Uncertainty = 1.0 - 0.5 = 0.5.
    expect(chain.uncertainty).toBeCloseTo(0.5);
  });
});
