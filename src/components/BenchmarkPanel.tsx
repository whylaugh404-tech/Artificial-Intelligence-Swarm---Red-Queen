import React, { useState } from 'react';
import { Play, Activity, Network, FileJson, CheckCircle2, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';

export function BenchmarkPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runBenchmark = async () => {
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/benchmark/dataset');
      if (!response.ok) {
        throw new Error(`Failed to run benchmark: ${response.statusText}`);
      }
      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden font-sans">
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-900 border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-wider">Distributed Computation Benchmark (P8.2)</h2>
        </div>
        <button
          onClick={runBenchmark}
          disabled={running}
          className={`flex items-center gap-2 px-4 py-1.5 rounded text-xs font-bold uppercase tracking-widest transition-colors ${
            running ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
        >
          {running ? (
            <>
              <div className="w-3 h-3 rounded-full border-2 border-t-indigo-400 border-neutral-600 animate-spin"></div>
              <span>Running...</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3" />
              <span>Run Benchmark</span>
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-[#0a0a0a]">
        {error && (
          <div className="bg-red-950/40 border border-red-900 rounded p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {!result && !running && !error && (
          <div className="flex flex-col items-center justify-center h-full text-neutral-500 space-y-4">
            <Network className="w-16 h-16 text-neutral-800" />
            <p className="text-sm text-center max-w-md">
              Run the benchmark to ingest the CSV dataset, decompose it, and distribute it across 3 Kademlia DHT authenticated Worker Cells via P2P.
            </p>
          </div>
        )}

        {running && (
          <div className="flex flex-col items-center justify-center h-full text-indigo-400 space-y-6">
            <div className="relative flex items-center justify-center">
              <div className="w-24 h-24 rounded-full border-4 border-indigo-900/30 animate-ping absolute"></div>
              <Network className="w-12 h-12 text-indigo-500 relative z-10" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-indigo-300">Spawning Distributed Fabric</p>
              <p className="text-xs text-indigo-500/70 mt-2 font-mono">1 Orchestrator, 3 Workers, P2P Socket Connecting...</p>
            </div>
          </div>
        )}

        {result && !running && (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Metrics Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard title="Dataset Size" value={result.metrics.datasetSize} unit="records" icon={<FileJson className="w-4 h-4 text-emerald-400"/>} />
              <MetricCard title="Partitions" value={result.metrics.partitions} unit="chunks" icon={<Network className="w-4 h-4 text-blue-400"/>} />
              <MetricCard title="Execution Time" value={result.metrics.dispatchAndExecutionTimeMs} unit="ms" icon={<Zap className="w-4 h-4 text-amber-400"/>} />
              <MetricCard title="Overhead" value={result.metrics.memoryOverheadMb} unit="MB" icon={<Activity className="w-4 h-4 text-rose-400"/>} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="col-span-1 bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Cost Model
                </h3>
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between border-b border-neutral-800 pb-2">
                    <span className="text-neutral-500">Communication</span>
                    <span className="text-neutral-200">{result.metrics.communicationCostMs.toFixed(2)} ms</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-800 pb-2">
                    <span className="text-neutral-500">Synchronization</span>
                    <span className="text-neutral-200">{result.metrics.synchronizationCostMs.toFixed(2)} ms</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-800 pb-2">
                    <span className="text-neutral-500">Verification</span>
                    <span className="text-neutral-200">{result.metrics.verificationCostMs.toFixed(2)} ms</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-indigo-400 font-bold">Total P2P Roundtrip</span>
                    <span className="text-indigo-400 font-bold">{result.metrics.totalRoundTripTimeMs} ms</span>
                  </div>
                </div>
              </div>

              <div className="col-span-2 bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex flex-col">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Execution Provenance
                </h3>
                <div className="flex-1 overflow-auto text-xs font-mono bg-[#050505] p-3 rounded border border-neutral-800 custom-scrollbar">
                  <pre className="text-neutral-300 whitespace-pre-wrap">
{JSON.stringify({
  status: result.executionResult.status,
  stateChecksum: result.executionResult.finalOutput.stateChecksum,
  provenanceChain: result.executionResult.finalOutput.provenanceChain,
  crossCellResolution: result.executionResult.finalOutput.crossCellResolution,
}, null, 2)}
                  </pre>
                </div>
              </div>
            </div>

            {/* Aggregated Output Data (Preview) */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex flex-col">
              <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Unified State Vector (Preview)</h3>
              <div className="flex-1 overflow-auto text-xs font-mono bg-[#050505] p-3 rounded border border-neutral-800 custom-scrollbar max-h-96">
                <pre className="text-neutral-300 whitespace-pre-wrap">
                  {JSON.stringify(result.executionResult.finalOutput.unifiedStateVector, null, 2)}
                </pre>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ title, value, unit, icon }: { title: string, value: string | number, unit: string, icon: React.ReactNode }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">{title}</span>
      </div>
      <div className="flex items-baseline gap-1 mt-auto">
        <span className="text-2xl font-black text-neutral-200">{value}</span>
        <span className="text-xs text-neutral-500 font-mono">{unit}</span>
      </div>
    </div>
  );
}
