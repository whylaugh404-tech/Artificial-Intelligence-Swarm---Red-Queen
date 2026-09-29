import React, { useState, useEffect } from 'react';
import { GitBranch, Play, CheckCircle2, AlertCircle, HelpCircle, ShieldAlert, Cpu, ArrowRight, RefreshCw } from 'lucide-react';

interface ReasoningChain {
  reasoningId: string;
  goal: string;
  context: { contextId: string; domain: string };
  status: string;
  premises: Array<{
    premiseId: string;
    statement: string;
    sourceType: string;
    sourceId: string;
  }>;
  inferenceChain: Array<{
    stepId: string;
    rule: string;
    description: string;
    premiseIds: string[];
    derivedHypothesisId: string;
    intermediateConfidence?: number;
  }>;
  hypotheses: Array<{
    hypothesisId: string;
    statement: string;
    status: string;
    targetConceptId?: string;
  }>;
  verification: {
    verificationId: string;
    hypothesisId: string;
    hasContradiction: boolean;
    verificationStatus: string;
    epistemicStatus: string;
    confidence: number;
    rationale: string;
  };
  conclusion: {
    conclusionId: string;
    statement: string;
    status: string;
    uncertainty: {
      belief: number;
      disbelief: number;
      uncertainty: number;
      baseRate: number;
    };
    alternatives: Array<{
      hypothesisId: string;
      statement: string;
      status: string;
      confidence: number;
      reason: string;
    }>;
    selectedAlternative?: {
      hypothesisId: string;
      statement: string;
      status: string;
      confidence: number;
      reason: string;
    };
    createdAt: string;
  };
}

export function CognitiveReasoningPanel() {
  const [chains, setChains] = useState<ReasoningChain[]>([]);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Reasoning Form state
  const [goal, setGoal] = useState('Evaluate Sector Heat Exchanger Invariant');
  const [domain, setDomain] = useState('CYBER_SECURITY');
  const [premiseStatement, setPremiseStatement] = useState('Core sensor telemetry indicates operating thermal pressure at 42C');
  const [premiseSource, setPremiseSource] = useState('OBSERVATION');
  const [hypothesisStatement, setHypothesisStatement] = useState('Primary cooling loop operating within verified invariant parameters');
  const [altStatement, setAltStatement] = useState('Engage auxiliary low-pressure passive heat exchangers');

  const fetchChains = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cell/reasoning');
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch reasoning chains`);
      const data = await res.json();
      if (Array.isArray(data.chains)) {
        setChains(data.chains);
        if (data.chains.length > 0 && !selectedChainId) {
          setSelectedChainId(data.chains[data.chains.length - 1].reasoningId);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChains();
  }, []);

  const handleExecuteReasoning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim() || !premiseStatement.trim() || !hypothesisStatement.trim()) return;

    setExecuting(true);
    setError(null);

    const payload = {
      goal,
      context: { contextId: `ctx_${Date.now()}`, domain },
      premises: [
        {
          premiseId: `prm_${Date.now()}`,
          statement: premiseStatement,
          sourceType: premiseSource,
          sourceId: `src_${Date.now()}`
        }
      ],
      hypotheses: [
        {
          hypothesisId: `hyp_${Date.now()}`,
          statement: hypothesisStatement,
          status: 'HYPOTHESIS'
        }
      ],
      alternatives: altStatement.trim()
        ? [
            {
              hypothesisId: `alt_${Date.now()}`,
              statement: altStatement,
              confidence: 0.5,
              reason: 'Alternate operational pathway'
            }
          ]
        : []
    };

    try {
      const res = await fetch('/api/cell/reason', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.chain) {
        setChains(prev => [...prev, data.chain]);
        setSelectedChainId(data.chain.reasoningId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  const selectedChain = chains.find(c => c.reasoningId === selectedChainId) || chains[chains.length - 1];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border border-neutral-800 rounded-xl overflow-hidden font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-neutral-950 border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-3">
          <GitBranch className="w-5 h-5 text-red-500" />
          <div>
            <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-wider">Causal Reasoning Engine (R9)</h2>
            <p className="text-[11px] text-neutral-500 font-mono">Endogenous Epistemic Confidence & Invariant Selection</p>
          </div>
        </div>

        <button
          onClick={fetchChains}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 bg-neutral-900 border border-neutral-800 rounded-md transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="m-4 p-3 bg-red-950/40 border border-red-900 text-red-400 text-xs rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Workspace Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-neutral-800">
        
        {/* Left: Interactive Reasoning Dispatch & History */}
        <div className="lg:col-span-5 flex flex-col min-h-0 bg-[#070707] overflow-y-auto custom-scrollbar p-5 space-y-6">
          
          {/* Dispatch Form */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
              <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                <Play className="w-3.5 h-3.5 text-red-400" />
                Dispatch Causal Inquiry
              </span>
              <span className="text-[10px] text-neutral-500 font-mono">Real Engine Endpoint</span>
            </div>

            <form onSubmit={handleExecuteReasoning} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">Inquiry Goal</label>
                <input
                  type="text"
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-red-600"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-neutral-400 mb-1">Context Domain</label>
                  <select
                    value={domain}
                    onChange={e => setDomain(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-red-600"
                  >
                    <option value="CYBER_SECURITY">CYBER_SECURITY</option>
                    <option value="INFRASTRUCTURE">INFRASTRUCTURE</option>
                    <option value="HEAT_TRANSFER">HEAT_TRANSFER</option>
                    <option value="P2P_ROUTING">P2P_ROUTING</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-neutral-400 mb-1">Premise Source</label>
                  <select
                    value={premiseSource}
                    onChange={e => setPremiseSource(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-red-600"
                  >
                    <option value="OBSERVATION">OBSERVATION</option>
                    <option value="CONCEPT">CONCEPT</option>
                    <option value="AXIOM">AXIOM</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">Initial Premise</label>
                <input
                  type="text"
                  value={premiseStatement}
                  onChange={e => setPremiseStatement(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-red-600"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">Target Primary Hypothesis</label>
                <input
                  type="text"
                  value={hypothesisStatement}
                  onChange={e => setHypothesisStatement(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-red-600"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">Competing Alternative Hypothesis</label>
                <input
                  type="text"
                  value={altStatement}
                  onChange={e => setAltStatement(e.target.value)}
                  placeholder="Optional competing hypothesis"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-red-600"
                />
              </div>

              <button
                type="submit"
                disabled={executing}
                className="w-full mt-2 py-2 px-4 bg-red-600 hover:bg-red-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-2"
              >
                {executing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Evaluating Graph & Evidence...</span>
                  </>
                ) : (
                  <>
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Execute Reasoning Cycle</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Past Reasoning Chains List */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
              Reasoning Chains ({chains.length})
            </span>
            {chains.length === 0 ? (
              <p className="text-xs text-neutral-600 font-mono">No reasoning chains executed yet.</p>
            ) : (
              <div className="space-y-2">
                {chains.slice().reverse().map(chain => (
                  <button
                    key={chain.reasoningId}
                    onClick={() => setSelectedChainId(chain.reasoningId)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedChainId === chain.reasoningId
                        ? 'bg-neutral-900 border-red-900/60 shadow-[0_0_15px_rgba(220,38,38,0.1)]'
                        : 'bg-neutral-950/60 border-neutral-800/80 hover:bg-neutral-900/40 text-neutral-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono text-neutral-500">{chain.reasoningId.substring(0, 14)}</span>
                      <span className="text-[10px] font-mono text-neutral-500">{chain.context.domain}</span>
                    </div>
                    <p className="text-xs font-semibold text-neutral-200 line-clamp-1">{chain.goal}</p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-neutral-400 font-mono">
                      <span>Status: {chain.conclusion.status}</span>
                      <span>·</span>
                      <span>{chain.inferenceChain.length} step(s)</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Selected Reasoning Chain Deep-Dive */}
        <div className="lg:col-span-7 flex flex-col min-h-0 bg-[#0a0a0a] overflow-y-auto custom-scrollbar p-6">
          {!selectedChain ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-600 space-y-3">
              <HelpCircle className="w-10 h-10" />
              <p className="text-xs font-mono">Select or execute a reasoning chain to view detailed provenance.</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Header Box */}
              <div className="border border-neutral-800 bg-neutral-900/40 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
                    <span className="text-neutral-500">Chain ID:</span>
                    <span className="text-neutral-200 font-bold">{selectedChain.reasoningId}</span>
                  </div>
                  <div className="text-[11px] font-mono text-neutral-500">
                    {new Date(selectedChain.conclusion.createdAt).toLocaleTimeString()}
                  </div>
                </div>
                <h3 className="text-base font-bold text-neutral-100">{selectedChain.goal}</h3>
                <div className="flex items-center gap-3 mt-3 text-xs text-neutral-400">
                  <span>Domain: <strong className="text-neutral-200">{selectedChain.context.domain}</strong></span>
                  <span>·</span>
                  <span>Epistemic State: <strong className="text-red-400 font-mono">{selectedChain.conclusion.status}</strong></span>
                </div>
              </div>

              {/* Conclusion & Internally Calculated Confidence Card */}
              <div className="border border-neutral-800 bg-neutral-900/60 rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Autonomous Conclusion (Internal Graph State)
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    Caller Confidence Bypassed
                  </span>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-neutral-100 leading-relaxed">
                    {selectedChain.conclusion.statement}
                  </p>
                  
                  {selectedChain.conclusion.selectedAlternative && (
                    <div className="mt-3 p-3 bg-neutral-950 border border-red-950/60 rounded flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                        Selected Competing Alternative:
                      </span>
                      <p className="text-xs text-neutral-200">
                        {selectedChain.conclusion.selectedAlternative.statement}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] font-mono text-neutral-400 mt-1">
                        <span>Internally Calculated Confidence: <strong className="text-neutral-200 tabular-nums">{(selectedChain.conclusion.selectedAlternative.confidence * 100).toFixed(2)}%</strong></span>
                        <span>·</span>
                        <span>Reason: {selectedChain.conclusion.selectedAlternative.reason}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Subjective Opinion Distribution */}
                <div className="pt-3 border-t border-neutral-800/80">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500 mb-2 block">
                    Subjective Opinion Tensor (Belief / Disbelief / Uncertainty)
                  </span>
                  <div className="grid grid-cols-4 gap-3 font-mono text-xs text-center">
                    <div className="bg-neutral-950 border border-neutral-800 p-2 rounded">
                      <span className="text-[10px] text-neutral-500 block">Belief</span>
                      <span className="font-bold text-emerald-400 tabular-nums">
                        {(selectedChain.conclusion.uncertainty.belief * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 p-2 rounded">
                      <span className="text-[10px] text-neutral-500 block">Disbelief</span>
                      <span className="font-bold text-rose-400 tabular-nums">
                        {(selectedChain.conclusion.uncertainty.disbelief * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 p-2 rounded">
                      <span className="text-[10px] text-neutral-500 block">Uncertainty</span>
                      <span className="font-bold text-amber-400 tabular-nums">
                        {(selectedChain.conclusion.uncertainty.uncertainty * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="bg-neutral-950 border border-neutral-800 p-2 rounded">
                      <span className="text-[10px] text-neutral-500 block">Base Rate</span>
                      <span className="font-bold text-indigo-400 tabular-nums">
                        {(selectedChain.conclusion.uncertainty.baseRate * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Verification & Rationale */}
              <div className="border border-neutral-800 bg-neutral-900/40 rounded-lg p-4 space-y-2">
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
                  Verification Rationale
                </span>
                <p className="text-xs text-neutral-300 font-mono leading-relaxed bg-[#050505] p-3 rounded border border-neutral-800">
                  {selectedChain.verification.rationale || 'Deductive consistency established without unmitigated contradictions.'}
                </p>
                <div className="flex items-center gap-4 text-xs font-mono text-neutral-400 pt-1">
                  <span>Contradiction Detected: <strong className={selectedChain.verification.hasContradiction ? 'text-red-400' : 'text-emerald-400'}>{selectedChain.verification.hasContradiction ? 'YES' : 'NONE'}</strong></span>
                  <span>·</span>
                  <span>Verification Status: <strong className="text-neutral-200">{selectedChain.verification.verificationStatus}</strong></span>
                </div>
              </div>

              {/* Inference Step Progression */}
              <div className="border border-neutral-800 bg-neutral-900/40 rounded-lg p-4 space-y-3">
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
                  Deductive Inference Chain ({selectedChain.inferenceChain.length} steps)
                </span>
                <div className="space-y-2">
                  {selectedChain.inferenceChain.map((step, idx) => (
                    <div key={step.stepId} className="p-3 bg-neutral-950 border border-neutral-800/80 rounded flex items-start gap-3">
                      <span className="text-xs font-mono text-red-500 font-bold shrink-0 mt-0.5">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono uppercase bg-neutral-900 px-1.5 py-0.5 rounded text-neutral-400">
                            {step.rule}
                          </span>
                          <span className="text-[10px] font-mono text-neutral-500">
                            Derived: {step.derivedHypothesisId}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-200 leading-normal">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
}
