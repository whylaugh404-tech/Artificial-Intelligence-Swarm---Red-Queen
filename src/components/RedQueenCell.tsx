import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Network, Activity, Cpu, Shield, Zap, Send, CheckCircle2 } from 'lucide-react';

export function RedQueenCellVisualizer({ health, memoriesCount, onRefresh }: { health: any; memoriesCount: number; onRefresh?: () => void }) {
  const isHealthy = health?.cell?.state === 'ACTIVE';
  const cell = health?.cell;

  const [observation, setObservation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleInjectObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!observation.trim()) return;

    setSubmitting(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/observe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observation: observation.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg('Observation ingested into neural cognition pipeline');
        setObservation('');
        if (onRefresh) onRefresh();
      } else {
        setStatusMsg(`Failed: ${data.error || 'Server error'}`);
      }
    } catch (err: any) {
      setStatusMsg(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative w-full flex flex-col items-center justify-between p-6 md:p-8 bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden font-sans space-y-6">
      
      {/* Background Matrix / Grid */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none" 
        style={{
          backgroundImage: 'linear-gradient(to right, #ffffff11 1px, transparent 1px), linear-gradient(to bottom, #ffffff11 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      />

      {/* Hologram Shard Visualizer */}
      <div className="relative z-10 flex flex-col items-center">
        <div className="relative w-40 h-40 flex items-center justify-center">
          <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
            className={`absolute w-full h-full border-2 border-dashed rounded-full ${isHealthy ? 'border-red-500/30' : 'border-amber-500/30'}`}
          />
          <motion.div 
            animate={{ rotate: -360 }} 
            transition={{ repeat: Infinity, duration: 18, ease: "linear" }}
            className={`absolute w-3/4 h-3/4 border border-dotted rounded-full ${isHealthy ? 'border-red-400/50' : 'border-amber-400/50'}`}
          />
          
          <motion.div 
            animate={{ scale: [1, 1.05, 1] }} 
            transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
            className={`w-16 h-16 rounded-full shadow-[0_0_35px_rgba(239,68,68,0.4)] flex items-center justify-center bg-neutral-900 border ${
              isHealthy ? 'border-red-500 text-red-500' : 'border-amber-500 text-amber-500'
            }`}
          >
            <Cpu className="w-8 h-8" />
          </motion.div>
        </div>

        <h3 className="mt-4 text-lg font-bold tracking-widest uppercase text-neutral-100">
          Red Queen Organism
        </h3>
        
        <div className="mt-1 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isHealthy ? 'bg-red-500' : 'bg-amber-500'}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isHealthy ? 'bg-red-500' : 'bg-amber-500'}`} />
          </span>
          <span className="text-xs font-mono tracking-widest text-neutral-400 uppercase">
            {cell?.state || 'INITIALIZING'} · {cell?.swarmState || 'AUTHENTICATED'}
          </span>
        </div>
      </div>

      {/* Diagnostics Grid */}
      <div className="w-full grid grid-cols-2 gap-3 relative z-10">
        <DiagnosticCard icon={<Activity className="w-4 h-4" />} label="NODE ID" value={cell?.nodeId ? cell.nodeId.substring(0, 8) : '---'} color="text-indigo-400" />
        <DiagnosticCard icon={<Network className="w-4 h-4" />} label="PEERS" value={cell?.peers?.toString() || '0'} color="text-emerald-400" />
        <DiagnosticCard icon={<Shield className="w-4 h-4" />} label="TOTAL MEMORY" value={memoriesCount.toString()} color="text-amber-400" />
        <DiagnosticCard icon={<Zap className="w-4 h-4" />} label="CONCEPTS" value={cell?.cognitiveGraph?.conceptsCount?.toString() || '0'} color="text-red-400" />
      </div>

      {/* Swarm & Mitosis Topology */}
      <div className="w-full p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg text-xs font-mono space-y-2 relative z-10">
        <div className="flex justify-between text-neutral-400 border-b border-neutral-800 pb-1.5">
          <span className="text-neutral-500">Swarm Cluster:</span>
          <span className="text-neutral-200">{cell?.swarmId || 'redqueen-swarm-alpha-1'}</span>
        </div>
        <div className="flex justify-between text-neutral-400 border-b border-neutral-800 pb-1.5">
          <span className="text-neutral-500">Mitosis Population Ceiling:</span>
          <span className="text-neutral-200">{cell?.mitosis?.populationCeiling || 10} cells</span>
        </div>
        <div className="flex justify-between text-neutral-400">
          <span className="text-neutral-500">Kademlia DHT Buckets:</span>
          <span className="text-neutral-200">{cell?.dhtBucketsActive ?? 0} active</span>
        </div>
      </div>

      {/* Quick Cognition Observation Injector */}
      <div className="w-full relative z-10 pt-2 border-t border-neutral-800/80">
        <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500 mb-2 block">
          Inject Live Cognition Observation
        </span>
        <form onSubmit={handleInjectObservation} className="flex gap-2">
          <input
            type="text"
            value={observation}
            onChange={e => setObservation(e.target.value)}
            placeholder="e.g. Telemetry sensor reading normal..."
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-red-600"
          />
          <button
            type="submit"
            disabled={submitting || !observation.trim()}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <Send className="w-3 h-3" />
            <span>Inject</span>
          </button>
        </form>
        {statusMsg && (
          <p className="text-[11px] text-emerald-400 font-mono mt-1.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>{statusMsg}</span>
          </p>
        )}
      </div>

    </div>
  );
}

function DiagnosticCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        <div className={color}>{icon}</div>
        <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">{label}</span>
      </div>
      <span className="font-mono text-base font-bold text-neutral-200 tabular-nums">{value}</span>
    </div>
  );
}
