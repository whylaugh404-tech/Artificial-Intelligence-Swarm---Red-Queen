import React, { useState, useEffect } from 'react';
import { Dna, GitCommit, Shield, Brain, RefreshCw, AlertCircle } from 'lucide-react';

export function GenomeLineagePanel() {
  const [genome, setGenome] = useState<any>(null);
  const [lineage, setLineage] = useState<any>(null);
  const [cognitiveState, setCognitiveState] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [genRes, linRes, cogRes] = await Promise.all([
        fetch('/api/cell/genome').then(r => r.ok ? r.json() : null),
        fetch('/api/cell/lineage').then(r => r.ok ? r.json() : null),
        fetch('/api/cell/cognitive-state').then(r => r.ok ? r.json() : null)
      ]);
      setGenome(genRes);
      setLineage(linRes);
      setCognitiveState(cogRes);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border border-neutral-800 rounded-xl overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-neutral-950 border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-3">
          <Dna className="w-5 h-5 text-indigo-400" />
          <div>
            <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-wider">Genome, Lineage & Working Memory</h2>
            <p className="text-[11px] text-neutral-500 font-mono">Genetic Encoded Traits, Mitosis Provenance & Neural State</p>
          </div>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 bg-neutral-900 border border-neutral-800 rounded transition-colors"
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

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#050505] space-y-6">
        
        {/* Top Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2 text-indigo-400">
              <Dna className="w-4 h-4" />
              <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">GENOME GENERATION</span>
            </div>
            <span className="text-2xl font-black font-mono text-neutral-100 tabular-nums">
              Gen {genome?.generation ?? 0}
            </span>
            <span className="text-xs text-neutral-500 font-mono block mt-1">
              Logic Version: {genome?.logicVersion || '1.0.0'}
            </span>
          </div>

          <div className="bg-neutral-900/40 border border-neutral-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2 text-emerald-400">
              <GitCommit className="w-4 h-4" />
              <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">ANCESTRAL LINEAGE</span>
            </div>
            <span className="text-2xl font-black font-mono text-neutral-100 tabular-nums">
              {lineage?.ancestorCellIds?.length ?? 0} Ancestors
            </span>
            <span className="text-xs text-neutral-500 font-mono block mt-1">
              Root Parent: {lineage?.parentCellId ? lineage.parentCellId.substring(0, 10) + '...' : 'Genesis Shard'}
            </span>
          </div>

          <div className="bg-neutral-900/40 border border-neutral-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2 text-amber-400">
              <Brain className="w-4 h-4" />
              <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">OPERATIONAL CONFIDENCE</span>
            </div>
            <span className="text-2xl font-black font-mono text-neutral-100 tabular-nums">
              {((cognitiveState?.operationalConfidence ?? 1) * 100).toFixed(0)}%
            </span>
            <span className="text-xs text-neutral-500 font-mono block mt-1">
              Lifecycle: <strong className="text-emerald-400">{cognitiveState?.lifecycleState || 'ACTIVE'}</strong>
            </span>
          </div>
        </div>

        {/* Genetic Traits & Evolutionary Capabilities */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Traits */}
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5 space-y-4">
            <div className="border-b border-neutral-800 pb-2">
              <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Encoded Evolutionary Traits</h3>
              <p className="text-[10px] text-neutral-500 font-mono">Defensive parameters regulating adaptation and learning</p>
            </div>

            {genome?.traits ? (
              <div className="space-y-3 font-mono text-xs">
                <TraitRow label="Mutation Rate" value={`${(genome.traits.mutationRate * 100).toFixed(1)}%`} bar={genome.traits.mutationRate} color="bg-rose-500" />
                <TraitRow label="Risk Tolerance" value={`${(genome.traits.riskTolerance * 100).toFixed(1)}%`} bar={genome.traits.riskTolerance} color="bg-amber-500" />
                <TraitRow label="Exploration vs Exploitation" value={`${(genome.traits.explorationVsExploitation * 100).toFixed(1)}%`} bar={genome.traits.explorationVsExploitation} color="bg-indigo-500" />
                <div className="flex justify-between border-t border-neutral-800/80 pt-2 text-neutral-400">
                  <span className="text-neutral-500">Max Cognitive Cycle Depth:</span>
                  <span className="text-neutral-200">{genome.traits.maxCognitiveCycleDepth}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span className="text-neutral-500">Execution Parallelism:</span>
                  <span className="text-neutral-200">{genome.traits.executionParallelism} worker(s)</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-600 font-mono">Loading traits...</p>
            )}
          </div>

          {/* Capabilities */}
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5 space-y-4">
            <div className="border-b border-neutral-800 pb-2">
              <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Active Swarm Capabilities</h3>
              <p className="text-[10px] text-neutral-500 font-mono">Genetically verified primitive execution rights</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {Array.isArray(genome?.capabilities) && genome.capabilities.map((cap: string) => (
                <div key={cap} className="px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs font-mono text-neutral-300 flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{cap}</span>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-neutral-800/80 space-y-2 text-xs font-mono">
              <div className="flex justify-between text-neutral-400">
                <span className="text-neutral-500">Genome ID:</span>
                <span className="text-neutral-200">{genome?.genomeId || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span className="text-neutral-500">Specialization:</span>
                <span className="text-neutral-200">{genome?.specialization || 'GENERALIST'}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Cognitive Working Memory & State Breakdown */}
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-lg p-5 space-y-4">
          <div className="border-b border-neutral-800 pb-2">
            <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Cognitive State & Working Memory Storage</h3>
            <p className="text-[10px] text-neutral-500 font-mono">Epistemic categorization and memory engrams distribution</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-neutral-950 border border-neutral-800/80 rounded font-mono text-xs">
              <span className="text-neutral-500 text-[10px] uppercase block mb-1">TOTAL MEMORIES</span>
              <span className="text-xl font-bold text-neutral-100 tabular-nums">
                {cognitiveState?.memoryStats?.total ?? 0}
              </span>
            </div>
            <div className="p-3 bg-neutral-950 border border-neutral-800/80 rounded font-mono text-xs">
              <span className="text-neutral-500 text-[10px] uppercase block mb-1">SEMANTIC ENGRAMS</span>
              <span className="text-xl font-bold text-indigo-400 tabular-nums">
                {cognitiveState?.memoryStats?.semantic ?? 0}
              </span>
            </div>
            <div className="p-3 bg-neutral-950 border border-neutral-800/80 rounded font-mono text-xs">
              <span className="text-neutral-500 text-[10px] uppercase block mb-1">EPISODIC EXPERIENCES</span>
              <span className="text-xl font-bold text-emerald-400 tabular-nums">
                {cognitiveState?.memoryStats?.episodic ?? 0}
              </span>
            </div>
            <div className="p-3 bg-neutral-950 border border-neutral-800/80 rounded font-mono text-xs">
              <span className="text-neutral-500 text-[10px] uppercase block mb-1">PROCEDURAL KNOWLEDGE</span>
              <span className="text-xl font-bold text-amber-400 tabular-nums">
                {cognitiveState?.memoryStats?.procedural ?? 0}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function TraitRow({ label, value, bar, color }: { label: string; value: string; bar: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-neutral-400">
        <span className="text-neutral-500">{label}:</span>
        <span className="text-neutral-200 font-bold tabular-nums">{value}</span>
      </div>
      <div className="w-full bg-neutral-950 h-1.5 rounded-full overflow-hidden">
        <div className={`${color} h-full rounded-full`} style={{ width: `${Math.min(100, Math.max(5, bar * 100))}%` }} />
      </div>
    </div>
  );
}
