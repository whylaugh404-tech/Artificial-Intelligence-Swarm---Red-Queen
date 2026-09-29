import React, { useEffect, useState } from 'react';
import { RedQueenCellVisualizer } from './components/RedQueenCell';
import { ChatInterface } from './components/Chat';
import { BenchmarkPanel } from './components/BenchmarkPanel';
import { CognitiveReasoningPanel } from './components/CognitiveReasoningPanel';
import { CognitiveGraphPanel } from './components/CognitiveGraphPanel';
import { MetabolismHub } from './components/MetabolismHub';
import { GenomeLineagePanel } from './components/GenomeLineagePanel';
import {
  Database,
  GitBranch,
  Network,
  Flame,
  Dna,
  Activity,
  MessageSquare,
  LayoutDashboard,
  Shield,
  Zap
} from 'lucide-react';

type NavigationTab =
  | 'overview'
  | 'reasoning'
  | 'graph'
  | 'metabolism'
  | 'genome'
  | 'benchmark'
  | 'terminal';

export default function App() {
  const [health, setHealth] = useState<any>(null);
  const [memories, setMemories] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<NavigationTab>('reasoning');

  const fetchState = async () => {
    try {
      const [healthRes, memRes] = await Promise.all([
        fetch('/api/health').then(async r => {
          if (!r.ok) return null;
          const text = await r.text();
          try {
            return JSON.parse(text);
          } catch {
            return null;
          }
        }),
        fetch('/api/memory').then(async r => {
          if (!r.ok) return null;
          const text = await r.text();
          try {
            return JSON.parse(text);
          } catch {
            return null;
          }
        })
      ]);
      if (healthRes) {
        setHealth(healthRes);
      }
      if (memRes && Array.isArray(memRes.data)) {
        setMemories(memRes.data);
      }
    } catch (err) {
      console.warn('Network state synchronization waiting for server:', err);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-200 p-3 sm:p-6 font-sans overflow-x-hidden flex flex-col">
      <div className="max-w-[1680px] mx-auto w-full flex flex-col gap-4 flex-1 min-h-0">
        
        {/* Top Navigation / Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between px-2 gap-4 shrink-0 border-b border-neutral-850 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-8 bg-red-600 rounded-sm shrink-0" />
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-white uppercase leading-none mb-1">
                Red Queen
              </h1>
              <p className="text-xs text-neutral-500 font-mono tracking-widest uppercase leading-none">
                Autonomous Cyber-Research Agent Framework
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900/60 border border-neutral-800 rounded-md text-xs font-mono">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-neutral-400">Swarm:</span>
              <span className="text-neutral-200 font-bold">{health?.cell?.swarmState || 'AUTHENTICATED'}</span>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900/60 border border-neutral-800 rounded-md text-xs font-mono">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-neutral-400">Node:</span>
              <span className="text-neutral-200 font-bold">{health?.cell?.nodeId ? health.cell.nodeId.substring(0, 8) : 'ACTIVE'}</span>
            </div>
          </div>
        </header>

        {/* Global Navigation Tabs (Clean segmented control) */}
        <nav className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar p-1.5 bg-neutral-900/50 border border-neutral-800/80 rounded-xl shrink-0">
          <NavTabItem
            active={activeTab === 'reasoning'}
            onClick={() => setActiveTab('reasoning')}
            icon={<GitBranch className="w-4 h-4 text-red-500" />}
            label="Causal Reasoning (R9)"
          />
          <NavTabItem
            active={activeTab === 'graph'}
            onClick={() => setActiveTab('graph')}
            icon={<Network className="w-4 h-4 text-indigo-400" />}
            label="Cognitive Graph"
          />
          <NavTabItem
            active={activeTab === 'metabolism'}
            onClick={() => setActiveTab('metabolism')}
            icon={<Flame className="w-4 h-4 text-amber-400" />}
            label="Metabolism Hub"
          />
          <NavTabItem
            active={activeTab === 'genome'}
            onClick={() => setActiveTab('genome')}
            icon={<Dna className="w-4 h-4 text-cyan-400" />}
            label="Genome & Lineage"
          />
          <NavTabItem
            active={activeTab === 'benchmark'}
            onClick={() => setActiveTab('benchmark')}
            icon={<Activity className="w-4 h-4 text-emerald-400" />}
            label="Swarm Benchmark"
          />
          <NavTabItem
            active={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            icon={<LayoutDashboard className="w-4 h-4 text-neutral-400" />}
            label="Cell Overview"
          />
          <NavTabItem
            active={activeTab === 'terminal'}
            onClick={() => setActiveTab('terminal')}
            icon={<MessageSquare className="w-4 h-4 text-rose-400" />}
            label="Neural Terminal"
          />
        </nav>

        {/* Main Stage Viewport */}
        <main className="flex-1 min-h-0 w-full">
          {activeTab === 'reasoning' && <CognitiveReasoningPanel />}
          {activeTab === 'graph' && <CognitiveGraphPanel />}
          {activeTab === 'metabolism' && <MetabolismHub />}
          {activeTab === 'genome' && <GenomeLineagePanel />}
          {activeTab === 'benchmark' && <BenchmarkPanel />}
          {activeTab === 'terminal' && <ChatInterface />}
          
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-0">
              <div className="lg:col-span-5 h-full">
                <RedQueenCellVisualizer health={health} memoriesCount={memories.length} onRefresh={fetchState} />
              </div>
              <div className="lg:col-span-7 flex flex-col h-full bg-neutral-900/40 border border-neutral-800 rounded-xl p-5 overflow-hidden">
                <div className="flex items-center gap-2 mb-4 shrink-0 border-b border-neutral-800 pb-3">
                  <Database className="w-4 h-4 text-amber-500" />
                  <h3 className="text-xs font-bold tracking-widest text-neutral-300 uppercase">
                    Engram Memory Stream ({memories.length})
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {memories.length === 0 ? (
                    <p className="text-xs text-neutral-600 font-mono">No engrams recorded in cell memory.</p>
                  ) : (
                    memories.slice().reverse().map(mem => (
                      <div key={mem.id} className="border-l-2 border-amber-800/40 pl-3 py-1.5 bg-neutral-950/40 rounded-r">
                        <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono mb-1">
                          <span>{new Date(mem.createdAt).toLocaleTimeString()}</span>
                          <span className="uppercase text-neutral-400">{mem.category || 'EPISODIC'}</span>
                        </div>
                        <p className="text-xs text-neutral-300 break-words font-mono">
                          {mem.content?.observation || mem.content?.title || mem.content?.facts?.[0] || 'Internal Neural State Update'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </main>

      </div>
    </div>
  );
}

function NavTabItem({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 ${
        active
          ? 'bg-neutral-800 text-neutral-100 shadow-sm border border-neutral-700/80'
          : 'bg-transparent text-neutral-400 hover:bg-neutral-850 hover:text-neutral-200'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
