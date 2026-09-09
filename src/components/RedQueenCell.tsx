import React from 'react';
import { motion } from 'motion/react';
import { Network, Activity, Cpu, Shield, Zap } from 'lucide-react';

export function RedQueenCellVisualizer({ health, memoriesCount }: { health: any, memoriesCount: number }) {
  const isHealthy = health?.cell?.state === 'ACTIVE';

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-8 bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
      
      {/* Background Matrix / Grid simulation */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(to right, #ffffff11 1px, transparent 1px), linear-gradient(to bottom, #ffffff11 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {/* Core Shard Hologram */}
        <div className="relative w-48 h-48 flex items-center justify-center">
          <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
            className={`absolute w-full h-full border-2 border-dashed rounded-full ${isHealthy ? 'border-red-500/30' : 'border-amber-500/30'}`}
          />
          <motion.div 
            animate={{ rotate: -360 }} 
            transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
            className={`absolute w-3/4 h-3/4 border border-dotted rounded-full ${isHealthy ? 'border-red-400/50' : 'border-amber-400/50'}`}
          />
          
          <motion.div 
            animate={{ scale: [1, 1.05, 1] }} 
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            className={`w-16 h-16 rounded-full shadow-[0_0_40px_rgba(239,68,68,0.4)] flex items-center justify-center bg-neutral-900 border ${isHealthy ? 'border-red-500 text-red-500' : 'border-amber-500 text-amber-500'}`}
          >
            <Cpu className="w-8 h-8" />
          </motion.div>
        </div>

        <h3 className="mt-6 text-xl font-bold tracking-widest uppercase text-neutral-200">
          Red Queen Cell
        </h3>
        
        <div className="mt-2 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isHealthy ? 'bg-red-500' : 'bg-amber-500'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isHealthy ? 'bg-red-500' : 'bg-amber-500'}`}></span>
          </span>
          <span className="text-xs font-mono tracking-widest text-neutral-400 uppercase">
            {health?.cell?.state || 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Diagnostics Grid */}
      <div className="mt-12 grid grid-cols-2 gap-4 w-full relative z-10">
        <DiagnosticCard icon={<Activity />} label="NODE ID" value={health?.cell?.nodeId?.substring(0, 8) || '---'} color="text-indigo-400" />
        <DiagnosticCard icon={<Network />} label="PEERS" value={health?.cell?.peers?.toString() || '0'} color="text-emerald-400" />
        <DiagnosticCard icon={<Shield />} label="MEMORIES" value={memoriesCount.toString()} color="text-amber-400" />
        <DiagnosticCard icon={<Zap />} label="LATENCY" value={isHealthy ? '14ms' : '---'} color="text-red-400" />
      </div>
    </div>
  );
}

function DiagnosticCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: string }) {
  return (
    <div className="flex flex-col p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-4 h-4 ${color}`}>
          {icon}
        </div>
        <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">{label}</span>
      </div>
      <span className="font-mono text-lg text-neutral-200">{value}</span>
    </div>
  );
}
