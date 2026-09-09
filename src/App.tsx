import React, { useEffect, useState } from 'react';
import { RedQueenCellVisualizer } from './components/RedQueenCell';
import { ChatInterface } from './components/Chat';
import { Database, Shield, Zap, MessageSquare, LayoutDashboard } from 'lucide-react';

export default function App() {
  const [health, setHealth] = useState<any>(null);
  const [memories, setMemories] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'dashboard' | 'memory'>('chat');

  const fetchState = async () => {
    try {
      const [healthRes, memRes] = await Promise.all([
        fetch('/api/health').then(r => r.json()),
        fetch('/api/memory').then(r => r.json())
      ]);
      setHealth(healthRes);
      setMemories(memRes.data || []);
    } catch (err) {
      console.error('Failed to fetch state', err);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-200 p-4 md:p-8 font-sans overflow-x-hidden flex flex-col">
      <div className="max-w-[1600px] mx-auto w-full flex flex-col gap-4 lg:gap-6 flex-1 min-h-0">
        
        {/* Top Navigation / Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between px-2 gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-red-600 rounded-sm shrink-0"></div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-white uppercase leading-none mb-1">Red Queen</h1>
              <p className="text-xs text-neutral-500 font-mono tracking-widest uppercase leading-none">Autonomous Agent Framework</p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <StatusBadge icon={<Shield className="w-3 h-3" />} label="Security" status="Active" color="text-emerald-400" />
            <StatusBadge icon={<Zap className="w-3 h-3" />} label="Uplink" status="Stable" color="text-indigo-400" />
          </div>
        </header>

        {/* Mobile Tabs */}
        <div className="flex lg:hidden bg-neutral-900/50 p-1 rounded-lg border border-neutral-800 shrink-0">
          <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<MessageSquare className="w-4 h-4"/>} label="Red Queen" />
          <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard className="w-4 h-4"/>} label="Dashboard" />
          <TabButton active={activeTab === 'memory'} onClick={() => setActiveTab('memory')} icon={<Database className="w-4 h-4"/>} label="Memory" />
        </div>

        {/* Main Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
          
          {/* Left Column: Visualizer & System Stats */}
          <div className={`lg:col-span-4 flex-col gap-6 lg:h-full lg:min-h-0 ${activeTab === 'dashboard' || activeTab === 'memory' ? 'flex h-auto' : 'hidden lg:flex'}`}>
            
            <div className={`lg:h-2/3 shrink-0 ${activeTab === 'dashboard' ? 'h-auto py-8' : 'hidden lg:block'}`}>
              <RedQueenCellVisualizer health={health} memoriesCount={memories.length} />
            </div>
            
            {/* Memory Mini-Log */}
            <div className={`lg:flex-1 bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-5 flex-col min-h-0 ${activeTab === 'memory' ? 'flex h-[500px]' : 'hidden lg:flex'}`}>
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <Database className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-bold tracking-widest text-neutral-400 uppercase">Memory Provenance</h3>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {memories.length === 0 ? (
                  <p className="text-xs text-neutral-600 font-mono">No engrams recorded.</p>
                ) : (
                  memories.slice().reverse().map(mem => (
                    <div key={mem.id} className="border-l-2 border-amber-900/30 pl-3 py-1">
                      <p className="text-[10px] text-neutral-500 font-mono mb-1">{new Date(mem.createdAt).toLocaleTimeString()}</p>
                      <p className="text-xs text-neutral-300 break-words">{mem.content.observation || 'Internal State Update'}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Chat Interface */}
          <div className={`lg:col-span-8 lg:h-full lg:min-h-0 w-full ${activeTab === 'chat' ? 'block h-[600px] lg:h-full' : 'hidden lg:block'}`}>
            <ChatInterface />
          </div>
          
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button onClick={onClick} className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${active ? 'bg-red-900/20 text-red-500' : 'text-neutral-500 hover:text-neutral-300'}`}>
      {icon} <span className="hidden sm:inline">{label}</span><span className="sm:hidden">{label.split(' ')[0]}</span>
    </button>
  );
}

function StatusBadge({ icon, label, status, color }: { icon: React.ReactNode, label: string, status: string, color: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-neutral-900/50 border border-neutral-800 rounded-full">
      <div className={color}>{icon}</div>
      <div className="flex flex-col">
        <span className="text-[9px] uppercase tracking-widest text-neutral-500 leading-none">{label}</span>
        <span className="text-xs font-bold text-neutral-300 leading-none mt-1">{status}</span>
      </div>
    </div>
  );
}
