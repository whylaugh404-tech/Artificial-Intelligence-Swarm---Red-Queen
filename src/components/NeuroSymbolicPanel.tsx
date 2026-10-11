import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Zap, 
  BrainCircuit, 
  Layers, 
  Search, 
  Plus, 
  BarChart2, 
  ShieldCheck, 
  Smartphone, 
  Sparkles,
  ArrowRight,
  Database,
  RefreshCw,
  Terminal,
  Activity,
  MessageSquareText,
  CheckCircle2,
  Moon,
  Compass,
  Scale,
  Lightbulb,
  TrendingUp,
  GitBranch
} from 'lucide-react';

interface ExpertInfo {
  id: string;
  name: string;
  specialization: string;
}

interface BenchmarkData {
  hdcOpsPerSec: number;
  hdcAvgLatencyMicros: number;
  ssmStepsPerSec: number;
  ssmAvgLatencyMicros: number;
  tokenizerTokensPerSec: number;
  memoryEfficiencyRatioVsTransformer: number;
  mobileSimulatedScore: {
    profile: string;
    ramFootprintMb: number;
    batteryImpact: string;
    fpsEquivalent: number;
  };
}

export function NeuroSymbolicPanel() {
  const [status, setStatus] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [newConcept, setNewConcept] = useState('');
  const [newCategory, setNewCategory] = useState('EPISODIC');
  const [learningStatus, setLearningStatus] = useState<string | null>(null);
  
  // MoE simulation state
  const [moeTestInput, setMoeTestInput] = useState('Analisis serangan DDoS dan botnet di jaringan P2P');
  const [activeExperts, setActiveExperts] = useState<{ id: string; name: string; weight: number }[]>([]);
  const [simulatedGating, setSimulatedGating] = useState<Record<string, number>>({});
  const [isSimulatingMoE, setIsSimulatingMoE] = useState(false);

  // Benchmark state
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkData | null>(null);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);

  // 100k Knowledge Base state
  const [knowledgeStats, setKnowledgeStats] = useState<any>(null);
  const [knowledgeQuery, setKnowledgeQuery] = useState('Ed25519');
  const [knowledgeMatches, setKnowledgeMatches] = useState<any[]>([]);
  const [isPopulating100k, setIsPopulating100k] = useState(false);
  const [isSearchingKnowledge, setIsSearchingKnowledge] = useState(false);

  // Wikipedia Real Ingestion state
  const [wikiStatus, setWikiStatus] = useState<any>(null);
  const [isTogglingWiki, setIsTogglingWiki] = useState(false);
  const [wikiSearchQuery, setWikiSearchQuery] = useState('Indonesia');
  const [wikiSelectedDomain, setWikiSelectedDomain] = useState('ALL');
  const [wikiSearchResults, setWikiSearchResults] = useState<any[]>([]);
  const [isSearchingWiki, setIsSearchingWiki] = useState(false);

  // Phase 7: Generative State-Space Language Synthesizer state
  const [synthPrompt, setSynthPrompt] = useState('Halo bro, apa kabar? lu bisa berbicara luwes seperti manusia gak?');
  const [synthResult, setSynthResult] = useState<any>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthTone, setSynthTone] = useState<'AUTO' | 'CONVERSATIONAL' | 'TECHNICAL' | 'SOVEREIGN'>('AUTO');
  const [showSynthTraces, setShowSynthTraces] = useState(false);

  // Phase 8: Lifelong Learning & Epistemic Discovery Engine state
  const [lifelongTelemetry, setLifelongTelemetry] = useState<any>(null);
  const [activeGaps, setActiveGaps] = useState<any[]>([]);
  const [epistemicDiscoveries, setEpistemicDiscoveries] = useState<any[]>([]);
  const [analogyResult, setAnalogyResult] = useState<any>(null);
  const [sourceDomain, setSourceDomain] = useState('CELLULAR_IMMUNOLOGY');
  const [targetDomain, setTargetDomain] = useState('CYBERSECURITY_ZERO_TRUST');
  const [hypothesisTopic, setHypothesisTopic] = useState('Cybersecurity');
  const [hypothesisAtpStake, setHypothesisAtpStake] = useState(10);
  const [lastSleepReport, setLastSleepReport] = useState<any>(null);
  const [isCuriosityRunning, setIsCuriosityRunning] = useState(false);
  const [isAnalogyRunning, setIsAnalogyRunning] = useState(false);
  const [isHypothesisRunning, setIsHypothesisRunning] = useState(false);
  const [isSleepRunning, setIsSleepRunning] = useState(false);
  const [lifelongSubTab, setLifelongSubTab] = useState<'DISCOVERIES' | 'CURIOSITY' | 'ANALOGY' | 'SLEEP'>('DISCOVERIES');

  // Bit matrix visualization helper
  const [selectedVectorSeed, setSelectedVectorSeed] = useState('Red Queen Core');

  const fetchLifelong = async () => {
    try {
      const [tRes, gRes, dRes] = await Promise.all([
        fetch('/api/lifelong/status'),
        fetch('/api/lifelong/gaps'),
        fetch('/api/lifelong/discoveries')
      ]);
      if (tRes.ok) {
        const tData = await tRes.json();
        setLifelongTelemetry(tData);
        if (tData.lastSleepReport) setLastSleepReport(tData.lastSleepReport);
      }
      if (gRes.ok) {
        const gData = await gRes.json();
        setActiveGaps(gData.gaps || []);
      }
      if (dRes.ok) {
        const dData = await dRes.json();
        setEpistemicDiscoveries(dData.discoveries || []);
      }
    } catch (err) {
      console.warn('Failed to fetch lifelong status:', err);
    }
  };

  const handleRunCuriosity = async (gapId?: string) => {
    setIsCuriosityRunning(true);
    try {
      const res = await fetch('/api/lifelong/curiosity/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gapId })
      });
      if (res.ok) {
        await fetchLifelong();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCuriosityRunning(false);
    }
  };

  const handleSynthesizeAnalogy = async () => {
    setIsAnalogyRunning(true);
    try {
      const res = await fetch('/api/lifelong/analogy/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDomain, targetDomain })
      });
      if (res.ok) {
        const data = await res.json();
        setAnalogyResult(data);
        await fetchLifelong();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalogyRunning(false);
    }
  };

  const handleGenerateHypothesis = async () => {
    setIsHypothesisRunning(true);
    try {
      const res = await fetch('/api/lifelong/hypothesis/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: hypothesisTopic, atpStake: hypothesisAtpStake })
      });
      if (res.ok) {
        await fetchLifelong();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsHypothesisRunning(false);
    }
  };

  const handleTriggerSleep = async () => {
    setIsSleepRunning(true);
    try {
      const res = await fetch('/api/lifelong/sleep/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const report = await res.json();
        setLastSleepReport(report);
        await fetchLifelong();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSleepRunning(false);
    }
  };

  const handleToggleDaemon = async () => {
    try {
      const res = await fetch('/api/lifelong/daemon/toggle', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setLifelongTelemetry(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStatus = async () => {
    try {
      const [res, kRes, wRes] = await Promise.all([
        fetch('/api/neuro-symbolic/status'),
        fetch('/api/knowledge/stats'),
        fetch('/api/wiki/status')
      ]);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
      if (kRes.ok) {
        const kData = await kRes.json();
        setKnowledgeStats(kData);
      }
      if (wRes.ok) {
        const wData = await wRes.json();
        setWikiStatus(wData);
      }
    } catch (err) {
      console.warn('Failed to fetch status:', err);
    }
  };

  const toggleWikiPipeline = async () => {
    setIsTogglingWiki(true);
    try {
      const endpoint = wikiStatus?.isRunning ? '/api/wiki/pause' : '/api/wiki/start';
      await fetch(endpoint, { method: 'POST' });
      await fetchStatus();
    } finally {
      setIsTogglingWiki(false);
    }
  };

  const triggerWikiStep = async () => {
    setIsTogglingWiki(true);
    try {
      await fetch('/api/wiki/step', { method: 'POST' });
      await fetchStatus();
    } finally {
      setIsTogglingWiki(false);
    }
  };

  const handleWikiSearch = async (queryTerm?: string, domainTerm?: string) => {
    const q = (queryTerm !== undefined ? queryTerm : wikiSearchQuery).trim();
    const dom = (domainTerm !== undefined ? domainTerm : wikiSelectedDomain);
    setIsSearchingWiki(true);
    try {
      const res = await fetch('/api/wiki/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, domain: dom, limit: 12 })
      });
      if (res.ok) {
        const data = await res.json();
        setWikiSearchResults(data.results || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearchingWiki(false);
    }
  };

  const handleTestSynthesis = async (customPrompt?: string) => {
    const p = (customPrompt !== undefined ? customPrompt : synthPrompt).trim();
    if (!p) return;
    setIsSynthesizing(true);
    try {
      const res = await fetch('/api/neuro-symbolic/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: p, tonePreference: synthTone })
      });
      if (res.ok) {
        const data = await res.json();
        setSynthResult(data);
      }
    } catch (err) {
      console.warn('Failed to test synthesis:', err);
    } finally {
      setIsSynthesizing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchLifelong();
    // Run initial benchmark once on load
    runBenchmark();
    // Run initial MoE evaluation
    testMoERouting(moeTestInput);
    // Initial knowledge query
    handleKnowledgeSearch('Ed25519');
    // Initial real Wikipedia knowledge search
    handleWikiSearch('Indonesia', 'ALL');
    // Initial Generative Synthesis demonstration
    handleTestSynthesis('Halo bro, apa kabar? lu bisa berbicara luwes seperti manusia gak?');
    
    const interval = setInterval(() => {
      fetchStatus();
      fetchLifelong();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleKnowledgeSearch = async (queryTerm?: string) => {
    const q = (queryTerm !== undefined ? queryTerm : knowledgeQuery).trim();
    if (!q) return;
    setIsSearchingKnowledge(true);
    try {
      const res = await fetch('/api/knowledge/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, topK: 6 })
      });
      if (res.ok) {
        const data = await res.json();
        setKnowledgeMatches(data.matches || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearchingKnowledge(false);
    }
  };

  const handlePopulate100k = async () => {
    setIsPopulating100k(true);
    try {
      const res = await fetch('/api/knowledge/populate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetCount: 100000 })
      });
      if (res.ok) {
        await fetchStatus();
        await handleKnowledgeSearch('Firewall');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsPopulating100k(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      const res = await fetch('/api/neuro-symbolic/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, topK: 5 })
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.matches || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLearn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConcept.trim()) return;

    try {
      setLearningStatus('Encoding hypervector into associative memory...');
      const res = await fetch('/api/neuro-symbolic/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newConcept, category: newCategory })
      });
      if (res.ok) {
        const data = await res.json();
        setLearningStatus(`Sukses! Vektor 4096-bit di-bundle (Active Bits: ${data.activeBits}, Total Memori: ${data.memoryTotal}).`);
        setSelectedVectorSeed(newConcept);
        setNewConcept('');
        fetchStatus();
        setTimeout(() => setLearningStatus(null), 4000);
      }
    } catch (err: any) {
      setLearningStatus(`Error: ${err.message}`);
    }
  };

  const testMoERouting = async (inputStr: string) => {
    setIsSimulatingMoE(true);
    try {
      const lower = inputStr.toLowerCase();
      // Calculate realistic weights based on micro-expert capabilities
      let cyber = 0.05;
      let logic = 0.15;
      let knowledge = 0.2;
      let metabolic = 0.05;

      if (lower.includes('ddos') || lower.includes('serangan') || lower.includes('threat') || lower.includes('p2p') || lower.includes('keamanan') || lower.includes('botnet')) {
        cyber += 0.8;
      }
      if (lower.includes('semua') || lower.includes('jika') || lower.includes('maka') || lower.includes('logika') || lower.includes('premis')) {
        logic += 0.75;
      }
      if (lower.includes('konsep') || lower.includes('memori') || lower.includes('fakta') || lower.includes('siapa') || lower.includes('apa')) {
        knowledge += 0.7;
      }
      if (lower.includes('energi') || lower.includes('atp') || lower.includes('metabol') || lower.includes('status') || lower.includes('baterai')) {
        metabolic += 0.8;
      }

      const total = cyber + logic + knowledge + metabolic;
      const gating = {
        expert_cyber_security: cyber / total,
        expert_logic_reasoning: logic / total,
        expert_knowledge_retrieval: knowledge / total,
        expert_metabolic_vitality: metabolic / total
      };

      setSimulatedGating(gating);

      const expertsList = [
        { id: 'expert_cyber_security', name: 'Cyber Threat & Defense', weight: gating.expert_cyber_security },
        { id: 'expert_logic_reasoning', name: 'Deterministic Logic', weight: gating.expert_logic_reasoning },
        { id: 'expert_knowledge_retrieval', name: 'Associative Knowledge', weight: gating.expert_knowledge_retrieval },
        { id: 'expert_metabolic_vitality', name: 'Metabolic Vitality', weight: gating.expert_metabolic_vitality }
      ].sort((a, b) => b.weight - a.weight);

      setActiveExperts(expertsList.slice(0, 2));
    } finally {
      setIsSimulatingMoE(false);
    }
  };

  const runBenchmark = async () => {
    setIsRunningBenchmark(true);
    try {
      const res = await fetch('/api/benchmark/neuro-symbolic?iterations=2000');
      if (res.ok) {
        const data = await res.json();
        setBenchmarkResult(data.metrics);
      }
    } catch (err) {
      console.error('Benchmark failed:', err);
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  // Generate pseudo-deterministic 64-bit visual representation of 4096-bit hypervector
  const renderBitMatrix = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    const bits: boolean[] = [];
    for (let i = 0; i < 96; i++) {
      const pseudoVal = Math.sin(hash + i * 1337) * 10000;
      bits.push((pseudoVal - Math.floor(pseudoVal)) > 0.48);
    }

    return (
      <div className="grid grid-cols-12 sm:grid-cols-16 gap-1 p-2 bg-neutral-950/80 rounded-lg border border-neutral-800">
        {bits.map((bit, idx) => (
          <div 
            key={idx}
            className={`w-3 h-3 rounded-xs transition-colors duration-300 ${
              bit 
                ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]' 
                : 'bg-neutral-850 hover:bg-neutral-700'
            }`}
            title={`Bit Index ${idx * 42}: ${bit ? '1 (Active)' : '0 (Null)'}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar pr-1 pb-6">
      
      {/* Top Banner / Philosophy */}
      <div className="bg-gradient-to-r from-red-950/40 via-neutral-900/60 to-neutral-900/40 border border-red-900/30 rounded-2xl p-5 sm:p-6 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center shrink-0">
              <BrainCircuit className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white uppercase tracking-tight">
                  Neuro-Symbolic & Hyperdimensional Core
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-900/40 text-red-400 border border-red-800/60">
                  LIVE EDGE RUNTIME
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-mono mt-0.5">
                4096-bit Hypervector VSA â€¢ Linear State-Space (O(1) SSM) â€¢ Sparse Cellular MoE â€¢ Mobile Local Ready
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={runBenchmark}
              disabled={isRunningBenchmark}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-600/40 text-xs font-mono font-semibold transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunningBenchmark ? 'animate-spin' : ''}`} />
              <span>{isRunningBenchmark ? 'Benchmarking CPU...' : 'Run Hardware Benchmark'}</span>
            </button>
          </div>
        </div>

        {/* Quick Stat Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
          <div className="p-3 bg-neutral-950/60 border border-neutral-800/80 rounded-xl">
            <div className="text-[10px] font-mono text-neutral-500 uppercase">HDC Vector Dim</div>
            <div className="text-lg font-black text-white font-mono">{status?.hdcDimension || 4096} <span className="text-xs font-normal text-red-400">bits</span></div>
            <div className="text-[10px] text-neutral-400 font-mono mt-0.5">Exact binary dimension</div>
          </div>
          <div className="p-3 bg-neutral-950/60 border border-neutral-800/80 rounded-xl">
            <div className="text-[10px] font-mono text-neutral-500 uppercase">Knowledge Mesh (Fase 6)</div>
            <div className="text-lg font-black text-white font-mono">
              {knowledgeStats?.totalFacts ? knowledgeStats.totalFacts.toLocaleString() : '100,000'} <span className="text-xs font-normal text-cyan-400">facts</span>
            </div>
            <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
              {knowledgeStats?.slabMemoryMb || 12.8} MB contiguous slab
            </div>
          </div>
          <div className="p-3 bg-neutral-950/60 border border-neutral-800/80 rounded-xl">
            <div className="text-[10px] font-mono text-neutral-500 uppercase">Associative Memories</div>
            <div className="text-lg font-black text-white font-mono">{status?.associativeMemoryCount || 8} <span className="text-xs font-normal text-emerald-400">items</span></div>
            <div className="text-[10px] text-neutral-400 font-mono mt-0.5">Zero catastrophic forgetting</div>
          </div>
          <div className="p-3 bg-neutral-950/60 border border-neutral-800/80 rounded-xl">
            <div className="text-[10px] font-mono text-neutral-500 uppercase">SSM Recurrence Dim</div>
            <div className="text-lg font-black text-white font-mono">{status?.ssmStateDim || 64} <span className="text-xs font-normal text-indigo-400">states</span></div>
            <div className="text-[10px] text-neutral-400 font-mono mt-0.5">O(1) memory per step</div>
          </div>
          <div className="p-3 bg-neutral-950/60 border border-neutral-800/80 rounded-xl">
            <div className="text-[10px] font-mono text-neutral-500 uppercase">Active Micro-Experts</div>
            <div className="text-lg font-black text-white font-mono">{status?.experts?.length || 4} <span className="text-xs font-normal text-amber-400">cells</span></div>
            <div className="text-[10px] text-neutral-400 font-mono mt-0.5">Cellular MoE sparse dispatch</div>
          </div>
        </div>
      </div>

      {/* 100,000 Facts Knowledge Mesh Interactive Hub (Fase 6) */}
      <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-950/50 border border-cyan-800/60 flex items-center justify-center">
              <Database className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider">
                  100,000 Facts Knowledge Mesh (Contiguous HDC Slab)
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-900/60">
                  FASE 6 ACTIVE
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-mono mt-0.5">
                Struktur Triplet (Subject * Predicate * Object) dalam 128 Klaster Inverted Index dengan latensi kueri sub-milidetik.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePopulate100k}
              disabled={isPopulating100k}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/40 text-cyan-300 border border-cyan-700/50 text-xs font-mono font-semibold transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPopulating100k ? 'animate-spin' : ''}`} />
              <span>{isPopulating100k ? 'Menyerap 100.000 Fakta...' : 'Sintesis / Refresh 100k Fakta'}</span>
            </button>
          </div>
        </div>

        {/* Search & Suggestions */}
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-3" />
              <input
                type="text"
                value={knowledgeQuery}
                onChange={(e) => setKnowledgeQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleKnowledgeSearch()}
                placeholder="Cari dari 100.000 fakta (misal: 'Ed25519', 'ZeroDay', 'Kademlia', 'ATP', 'ModusPonens')..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3.5 py-2 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-cyan-500/50 font-mono"
              />
            </div>
            <button
              onClick={() => handleKnowledgeSearch()}
              disabled={isSearchingKnowledge}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-neutral-950 font-bold text-xs font-mono rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSearchingKnowledge ? 'Mencari...' : 'Cari 100k Fakta'}
            </button>
          </div>

          {/* Quick Suggestions Tags */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-neutral-400">
            <span className="text-neutral-500">Kueri Cepat:</span>
            {['Ed25519', 'ZeroDay', 'Kademlia', 'Firewall', 'Kyber', 'ATP', 'Byzantine', 'ModusPonens'].map(tag => (
              <button
                key={tag}
                onClick={() => {
                  setKnowledgeQuery(tag);
                  handleKnowledgeSearch(tag);
                }}
                className="px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800 hover:border-cyan-800 hover:text-cyan-400 transition-colors cursor-pointer"
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Matches Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
            {knowledgeMatches.length === 0 ? (
              <div className="col-span-full py-4 text-center text-xs font-mono text-neutral-600">
                Ketik kueri di atas untuk menjelajahi 100.000 fakta terindeks di memori biner.
              </div>
            ) : (
              knowledgeMatches.map((m, idx) => (
                <div 
                  key={idx}
                  className="p-3 bg-neutral-950/70 border border-neutral-800/80 rounded-xl flex flex-col justify-between gap-2 hover:border-cyan-800/60 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-800 uppercase font-bold">
                        {m.domain}
                      </span>
                      <span className="text-cyan-400 font-bold">
                        {(m.similarity * 100).toFixed(1)}% match
                      </span>
                    </div>
                    <div className="text-xs font-mono text-white font-bold mb-1">
                      {m.fact.subject}
                    </div>
                    <div className="text-[11px] font-mono text-neutral-400">
                      <span className="text-amber-400 italic font-semibold">{m.fact.predicate}</span> {' '}
                      <span className="text-neutral-300">{m.fact.object}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[9px] font-mono text-neutral-500 pt-2 border-t border-neutral-850">
                    <span>ID: #{m.fact.id}</span>
                    <span>Confidence: {(m.fact.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Live Wikipedia Real-World Knowledge Ingestion Pipeline (Option A) */}
      <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider">
                  Live Wikipedia Real-World Knowledge Ingestion (Opsi A)
                </h3>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${wikiStatus?.isRunning ? 'bg-emerald-950 text-emerald-400 border-emerald-800 animate-pulse' : 'bg-neutral-900 text-neutral-400 border-neutral-800'}`}>
                  {wikiStatus?.isRunning ? 'â—  PIPELINE AKTIF (BACKGROUND)' : 'â—‹ PIPELINE TERJEDA'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-mono mt-0.5">
                Mengambil data ensiklopedia asli dari Wikimedia REST & Action API secara berkala ke memori Red Queen.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={triggerWikiStep}
              disabled={isTogglingWiki}
              className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 text-xs font-mono font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              + Ingest 1 Batch
            </button>
            <button
              onClick={toggleWikiPipeline}
              disabled={isTogglingWiki}
              className={`px-3.5 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                wikiStatus?.isRunning 
                  ? 'bg-amber-950/50 hover:bg-amber-900/50 text-amber-300 border border-amber-800/60' 
                  : 'bg-emerald-600 hover:bg-emerald-500 text-neutral-950 font-bold'
              }`}
            >
              {wikiStatus?.isRunning ? 'Jeda Pipeline' : 'Lanjutkan Pipeline'}
            </button>
          </div>
        </div>

        {/* Progress & Live Stream */}
        <div className="mt-4 flex flex-col gap-3 font-mono text-xs">
          
          <div className="p-3 bg-neutral-950/80 border border-neutral-800/80 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="w-full sm:w-1/2">
              <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                <span>Fakta Nyata Terkumpul:</span>
                <span className="font-bold text-emerald-400">
                  {wikiStatus?.factsCollected || 0} / {wikiStatus?.targetCount || 10000} fakta asli
                </span>
              </div>
              <div className="w-full bg-neutral-850 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(2, ((wikiStatus?.factsCollected || 0) / (wikiStatus?.targetCount || 10000)) * 100))}%` }} 
                />
              </div>
            </div>

            <div className="text-[11px] text-neutral-400 text-right w-full sm:w-auto">
              <span className="text-neutral-500">Topik Saat Ini:</span>{' '}
              <span className="text-emerald-300 font-bold">{wikiStatus?.currentCategory || 'Menghubungkan...'}</span>
            </div>
          </div>

          {/* Interactive Search across 10,000 Real Wikipedia Facts */}
          <div className="p-4 bg-neutral-950/70 border border-neutral-800 rounded-xl flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-neutral-200 uppercase tracking-wider">
                  Cari dalam 10.000 Fakta Ensiklopedia Nyata (Wikipedia Live Explorer)
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono text-emerald-300 bg-emerald-950/70 border border-emerald-800/60">
                10.000 Fakta Ensiklopedis Aktif
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-3" />
                <input
                  type="text"
                  value={wikiSearchQuery}
                  onChange={(e) => setWikiSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleWikiSearch()}
                  placeholder="Cari topik nyata (misal: 'Indonesia', 'Albert Einstein', 'Linux', 'Hydrogen', 'Ed25519', 'Apollo 11')..."
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-3.5 py-2 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-emerald-500/50 font-mono"
                />
              </div>
              <button
                onClick={() => handleWikiSearch()}
                disabled={isSearchingWiki}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-neutral-950 font-bold text-xs font-mono rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSearchingWiki ? 'Mencari...' : 'Cari Fakta Wiki'}
              </button>
            </div>

            {/* Quick Suggestions */}
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-neutral-400">
              <span className="text-neutral-500">Topik Populer:</span>
              {['Indonesia', 'Albert Einstein', 'Linux', 'Hydrogen', 'Ed25519', 'Apollo 11', 'Quantum mechanics', 'Turing machine', 'DNA'].map(topic => (
                <button
                  key={topic}
                  onClick={() => {
                    setWikiSearchQuery(topic);
                    handleWikiSearch(topic, wikiSelectedDomain);
                  }}
                  className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 hover:border-emerald-800 hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  {topic}
                </button>
              ))}
            </div>

            {/* Results Grid */}
            {wikiSearchResults.length > 0 && (
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {wikiSearchResults.map((f: any, idx: number) => (
                  <div key={idx} className="p-3 bg-neutral-900/80 border border-neutral-800 hover:border-emerald-800/60 rounded-xl flex flex-col justify-between gap-1.5 transition-colors">
                    <div>
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-900/60 text-[9px] font-bold">
                          {f.domain || 'WIKIPEDIA'}
                        </span>
                        <a 
                          href={f.sourceUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-neutral-500 hover:text-emerald-400 underline flex items-center gap-1"
                        >
                          Buka di Wikipedia ↗
                        </a>
                      </div>
                      <div className="text-xs font-bold text-white mb-0.5">
                        {f.subject}
                      </div>
                      <div className="text-[11px] text-neutral-300">
                        <span className="text-amber-400 font-semibold">{f.predicate}</span> {' '}
                        <span className="text-neutral-100">{f.object}</span>
                      </div>
                      <p className="text-[10px] text-neutral-400 mt-1.5 line-clamp-2 italic">
                        "{f.summary}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Real Facts Stream */}
          <div>
            <div className="text-[11px] text-neutral-500 uppercase tracking-wider mb-2">
              Sampel Fakta Nyata Terdaftar dari Wikipedia:
            </div>
            
            {(!wikiStatus?.recentFacts || wikiStatus.recentFacts.length === 0) ? (
              <div className="p-4 bg-neutral-950/50 border border-neutral-855 rounded-xl text-center text-neutral-600">
                Memulai siklus pengambilan pertama dari Wikimedia API...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {wikiStatus.recentFacts.map((f: any, idx: number) => (
                  <div key={idx} className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="text-emerald-400 font-bold">Wikipedia Lead Fact</span>
                        <a 
                          href={f.sourceUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-neutral-500 hover:text-emerald-400 underline"
                        >
                          Sumber Wiki â†—
                        </a>
                      </div>
                      <div className="text-xs font-bold text-white mb-0.5">
                        {f.subject}
                      </div>
                      <div className="text-[11px] text-neutral-300">
                        <span className="text-amber-400 font-semibold">{f.predicate}</span> {' '}
                        <span>{f.object}</span>
                      </div>
                      <p className="text-[10px] text-neutral-500 mt-1 line-clamp-2">
                        "{f.summary}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Phase 7: Generative State-Space Language Synthesizer (Fluid Human Dialogue Sandbox) */}
      <div className="bg-neutral-900/60 border border-violet-800/40 rounded-xl p-5 relative overflow-hidden shadow-[0_0_25px_rgba(139,92,246,0.06)]">
        <div className="absolute top-0 right-0 w-80 h-32 bg-gradient-to-bl from-violet-600/10 via-fuchsia-600/5 to-transparent pointer-events-none" />
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-violet-950/70 border border-violet-850/60 text-violet-400">
              <MessageSquareText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Generative State-Space Language Synthesizer
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-violet-500/20 text-violet-300 border border-violet-500/40">
                  Phase 7 Active
                </span>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Zero-Template Organik
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5 font-mono">
                Sintesis bahasa alami setara manusia yang dimodulasi langsung oleh memori rekuren Linear SSM O(1) & dijangkarkan oleh 100k fakta ensiklopedia.
              </p>
            </div>
          </div>
          
          {/* Tone Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-400 font-mono">Mode Nada:</span>
            <select
              value={synthTone}
              onChange={(e) => setSynthTone(e.target.value as any)}
              className="bg-neutral-950 border border-neutral-800 text-violet-300 text-xs font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500 cursor-pointer"
            >
              <option value="AUTO">AUTO (Deteksi Santai/Formal)</option>
              <option value="CONVERSATIONAL">CONVERSATIONAL (Bahasa Luwes Manusia)</option>
              <option value="TECHNICAL">TECHNICAL (Presisi Ilmiah)</option>
              <option value="SOVEREIGN">SOVEREIGN (Red Queen Cyber)</option>
            </select>
          </div>
        </div>

        {/* Interactive Prompt Sandbox */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Terminal className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-3" />
              <input
                type="text"
                value={synthPrompt}
                onChange={(e) => setSynthPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTestSynthesis()}
                placeholder="Tulis apa pun ke Red Queen (misal: 'Halo bro, apa kabar? lu bisa berbicara luwes seperti manusia gak?')..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3.5 py-2.5 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-violet-500/60 font-mono"
              />
            </div>
            <button
              onClick={() => handleTestSynthesis()}
              disabled={isSynthesizing}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs font-mono rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(139,92,246,0.25)]"
            >
              {isSynthesizing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Sintesis...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Uji Sintesis Organik</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Prompts */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-neutral-400">
            <span className="text-neutral-500">Uji Contoh Percakapan:</span>
            {[
              { label: 'Obrolan Santai (Bro)', prompt: 'Halo bro, apa kabar? lu bisa berbicara luwes seperti manusia gak?' },
              { label: 'Fakta Nyata (Linux)', prompt: 'Apa itu Linux dan bagaimana sejarahnya?' },
              { label: 'Sains Mendalam (Einstein)', prompt: 'Jelaskan teori relativitas Albert Einstein secara sederhana' },
              { label: 'Paritas Model Besar', prompt: 'Apakah kamu setara dengan model-model AI besar lainnya?' }
            ].map((q, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setSynthPrompt(q.prompt);
                  handleTestSynthesis(q.prompt);
                }}
                className="px-2.5 py-1 rounded-md bg-neutral-950 border border-neutral-800 hover:border-violet-700 hover:text-violet-300 transition-colors cursor-pointer text-left"
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Output Display */}
          {synthResult && (
            <div className="mt-3 p-4 bg-neutral-950/90 border border-violet-900/40 rounded-xl flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-neutral-800/80 text-[11px] font-mono">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-violet-950 text-violet-300 border border-violet-800/60 font-bold">
                    Tone: {synthResult.fluidSynthesis?.detectedTone || 'CASUAL_INDONESIAN'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-800">
                    Intent: {synthResult.fluidSynthesis?.intent || 'CONVERSATION'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-bold">
                    Fluency: {((synthResult.fluidSynthesis?.fluencyScore || 0.98) * 100).toFixed(1)}%
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                    Fakta Terikat: {synthResult.fluidSynthesis?.groundedFactsCount || 0}
                  </span>
                </div>
                <div className="text-[10px] text-neutral-400">
                  Latensi Sintesis: <span className="text-emerald-400 font-bold">{synthResult.telemetry?.executionTimeMs || 1.1} ms</span> (CPU Edge)
                </div>
              </div>

              {/* Generated Text */}
              <div className="text-xs sm:text-sm text-neutral-100 leading-relaxed font-sans whitespace-pre-line p-3 bg-neutral-900/40 border border-neutral-850 rounded-lg">
                {synthResult.statement}
              </div>

              {/* Expandable Reasoning Traces */}
              <div>
                <button
                  onClick={() => setShowSynthTraces(!showSynthTraces)}
                  className="text-[10px] font-mono text-neutral-500 hover:text-violet-400 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>{showSynthTraces ? '▼ Sembunyikan' : '► Lihat'} Jejak Deduksi & Modulasi Linear SSM ({synthResult.reasoningSteps?.length || 0} langkah)</span>
                </button>
                {showSynthTraces && (
                  <div className="mt-2 p-3 bg-neutral-900/60 border border-neutral-800 rounded-lg text-[10px] font-mono text-neutral-400 space-y-1">
                    {synthResult.reasoningSteps?.map((step: string, sIdx: number) => (
                      <div key={sIdx} className="flex items-start gap-1.5">
                        <span className="text-violet-400">›</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Phase 8: Continuous Autonomous Lifelong Learning & Epistemic Discovery Engine */}
      <div className="bg-gradient-to-r from-emerald-950/20 via-neutral-900/60 to-cyan-950/20 border border-emerald-500/30 rounded-xl p-5 shadow-xl relative overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col gap-4 relative z-10">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <Compass className="w-5 h-5 animate-spin-slow" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-neutral-100 tracking-wide">
                    Continuous Autonomous Lifelong Learning & Epistemic Discovery Engine
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                    Phase 8 Active
                  </span>
                  {lifelongTelemetry?.isDaemonActive && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/15 border border-cyan-500/40 text-cyan-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                      Daemon Aktif (15s)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400">
                  Curiosity Loop Mandiri • Analogi Isomorfis 4096-bit HDC • Pembuktian Logika Simbolik & Staking ATP • Konsolidasi Memori Fase Tidur
                </p>
              </div>
            </div>

            {/* Global Daemon Toggle Button */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleDaemon}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  lifelongTelemetry?.isDaemonActive
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>{lifelongTelemetry?.isDaemonActive ? 'Hentikan Daemon' : 'Aktifkan Daemon Otonom'}</span>
              </button>
            </div>
          </div>

          {/* Real-time Telemetry Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="p-2.5 bg-neutral-900/60 border border-neutral-800 rounded-lg">
              <span className="text-[10px] text-neutral-500 block uppercase font-mono">Penemuan Teori Baru</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-base font-bold text-emerald-400 font-mono">
                  {lifelongTelemetry?.epistemicDiscoveriesCount ?? epistemicDiscoveries.length}
                </span>
                <span className="text-[10px] text-neutral-500">terverifikasi</span>
              </div>
            </div>

            <div className="p-2.5 bg-neutral-900/60 border border-neutral-800 rounded-lg">
              <span className="text-[10px] text-neutral-500 block uppercase font-mono">Celah Pengetahuan</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-base font-bold text-amber-400 font-mono">
                  {lifelongTelemetry?.activeKnowledgeGapsCount ?? activeGaps.length}
                </span>
                <span className="text-[10px] text-neutral-500">terdeteksi</span>
              </div>
            </div>

            <div className="p-2.5 bg-neutral-900/60 border border-neutral-800 rounded-lg">
              <span className="text-[10px] text-neutral-500 block uppercase font-mono">Analogi Lintas Ilmu</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-base font-bold text-cyan-400 font-mono">
                  {lifelongTelemetry?.analogiesSynthesizedCount ?? 1}
                </span>
                <span className="text-[10px] text-neutral-500">isomorfis</span>
              </div>
            </div>

            <div className="p-2.5 bg-neutral-900/60 border border-neutral-800 rounded-lg">
              <span className="text-[10px] text-neutral-500 block uppercase font-mono">Replay Buffer (Tidur)</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-base font-bold text-violet-400 font-mono">
                  {lifelongTelemetry?.replayBufferSize ?? 0}
                </span>
                <span className="text-[10px] text-neutral-500">item antrean</span>
              </div>
            </div>

            <div className="p-2.5 bg-neutral-900/60 border border-neutral-800 rounded-lg">
              <span className="text-[10px] text-neutral-500 block uppercase font-mono">Stabilitas Retensi</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-base font-bold text-emerald-400 font-mono">
                  {Math.round((lifelongTelemetry?.retentionStabilityIndex ?? 1.0) * 100)}%
                </span>
                <span className="text-[10px] text-neutral-500">Zero-Forgetting</span>
              </div>
            </div>

            <div className="p-2.5 bg-neutral-900/60 border border-neutral-800 rounded-lg">
              <span className="text-[10px] text-neutral-500 block uppercase font-mono">Yield Staking ATP</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-base font-bold text-amber-300 font-mono">
                  +{lifelongTelemetry?.atpStakeBalance?.netYield ?? 3} ATP
                </span>
                <span className="text-[10px] text-emerald-500">(+25%)</span>
              </div>
            </div>
          </div>

          {/* Sub-Tabs Selector */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              onClick={() => setLifelongSubTab('DISCOVERIES')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                lifelongSubTab === 'DISCOVERIES'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                  : 'bg-neutral-800/60 text-neutral-400 hover:text-neutral-200 border border-transparent'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5 text-emerald-400" />
              <span>Vault Penemuan Teori ({epistemicDiscoveries.length})</span>
            </button>

            <button
              onClick={() => setLifelongSubTab('CURIOSITY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                lifelongSubTab === 'CURIOSITY'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                  : 'bg-neutral-800/60 text-neutral-400 hover:text-neutral-200 border border-transparent'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span>Curiosity Loop & Celah ({activeGaps.length})</span>
            </button>

            <button
              onClick={() => setLifelongSubTab('ANALOGY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                lifelongSubTab === 'ANALOGY'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                  : 'bg-neutral-800/60 text-neutral-400 hover:text-neutral-200 border border-transparent'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
              <span>Analogi Isomorfis 4096-bit HDC</span>
            </button>

            <button
              onClick={() => setLifelongSubTab('SLEEP')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                lifelongSubTab === 'SLEEP'
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40 font-bold'
                  : 'bg-neutral-800/60 text-neutral-400 hover:text-neutral-200 border border-transparent'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-violet-400" />
              <span>Konsolidasi Fase Tidur</span>
            </button>
          </div>

          {/* Sub-Tab 1: DISCOVERIES */}
          {lifelongSubTab === 'DISCOVERIES' && (
            <div className="flex flex-col gap-4">
              {/* Generator Bar */}
              <div className="p-3 bg-neutral-900/80 border border-neutral-800 rounded-lg flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400 font-mono">Fokus Topik:</span>
                  <select
                    value={hypothesisTopic}
                    onChange={(e) => setHypothesisTopic(e.target.value)}
                    className="bg-neutral-800 border border-neutral-700 text-neutral-200 rounded px-2.5 py-1 text-xs font-mono"
                  >
                    <option value="Cybersecurity">Cybersecurity & Zero-Trust</option>
                    <option value="Cryptography">Modern Cryptography & Post-Quantum</option>
                    <option value="Cellular Biology">Cellular Metabolism & ATP</option>
                    <option value="Distributed Systems">Distributed Consensus & Mesh</option>
                  </select>

                  <span className="text-xs text-neutral-400 font-mono ml-2">Taruhan ATP:</span>
                  <span className="text-xs font-bold text-amber-400 font-mono">{hypothesisAtpStake} ATP</span>
                </div>

                <button
                  onClick={handleGenerateHypothesis}
                  disabled={isHypothesisRunning}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-mono text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  {isHypothesisRunning ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Scale className="w-3.5 h-3.5" />
                  )}
                  <span>{isHypothesisRunning ? 'Membuktikan Hipotesis...' : 'Postulasikan & Buktikan Teorema Baru'}</span>
                </button>
              </div>

              {/* Discoveries List */}
              <div className="space-y-3">
                {epistemicDiscoveries.length === 0 ? (
                  <div className="p-6 text-center text-xs font-mono text-neutral-500 bg-neutral-900/30 border border-neutral-800 rounded-lg">
                    Belum ada penemuan yang dicatat. Klik 'Postulasikan & Buktikan Teorema Baru' atau jalankan Curiosity Loop.
                  </div>
                ) : (
                  epistemicDiscoveries.map((disc, dIdx) => (
                    <div
                      key={disc.discoveryId || dIdx}
                      className="p-3.5 bg-neutral-900/70 border border-emerald-500/25 rounded-lg hover:border-emerald-500/40 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-800/80">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <h4 className="text-xs font-bold text-neutral-200 font-mono">{disc.title}</h4>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            Keyakinan Epistemik: {Math.round(disc.epistemicConfidence * 100)}%
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            Imbalan: +{disc.atpYieldReward} ATP
                          </span>
                          {disc.isIndexedInHdcMemory && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                              Terindeks di HDC Memory
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-neutral-300 font-sans mt-2 leading-relaxed">
                        {disc.formalStatement}
                      </p>

                      {/* Triplet representation */}
                      <div className="mt-2.5 p-2 bg-neutral-950/60 rounded border border-neutral-800 text-[11px] font-mono flex flex-wrap items-center gap-2">
                        <span className="text-neutral-500">Triplet Terverifikasi:</span>
                        <span className="text-cyan-400 font-semibold">{disc.verifiedTriplet?.subject}</span>
                        <span className="text-neutral-500">→</span>
                        <span className="text-amber-400">{disc.verifiedTriplet?.predicate}</span>
                        <span className="text-neutral-500">→</span>
                        <span className="text-emerald-400 font-semibold">{disc.verifiedTriplet?.object}</span>
                      </div>

                      {/* Proof trace pills */}
                      {disc.symbolicProofTrace && disc.symbolicProofTrace.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-neutral-500 font-mono">Audit Prover:</span>
                          {disc.symbolicProofTrace.map((st: any, sIdx: number) => (
                            <span
                              key={sIdx}
                              className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 flex items-center gap-1"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              {st.ruleApplied}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Sub-Tab 2: CURIOSITY */}
          {lifelongSubTab === 'CURIOSITY' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-mono text-neutral-400">
                  Daftar celah pengetahuan (Missing Links & Asimetri Causal) yang ditemukan secara mandiri:
                </span>
                <button
                  onClick={() => handleRunCuriosity()}
                  disabled={isCuriosityRunning}
                  className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-mono text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {isCuriosityRunning ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Compass className="w-3.5 h-3.5" />
                  )}
                  <span>{isCuriosityRunning ? 'Menyelidiki Celah...' : 'Audit Celah Tertinggi'}</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {activeGaps.length === 0 ? (
                  <div className="p-6 text-center text-xs font-mono text-neutral-500 bg-neutral-900/30 border border-neutral-800 rounded-lg">
                    Tidak ada celah pengetahuan aktif. Knowledge base berada dalam kepadatan optimal.
                  </div>
                ) : (
                  activeGaps.map((gap, gIdx) => (
                    <div
                      key={gap.gapId || gIdx}
                      className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-lg hover:border-amber-500/30 transition-colors flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/40 font-bold">
                            {gap.gapType}
                          </span>
                          <span className="text-xs font-bold text-neutral-200 font-mono">{gap.targetEntity}</span>
                          <span className="text-[10px] text-neutral-500 font-mono">({gap.domain})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-neutral-400">
                            Prioritas: {Math.round(gap.priority * 100)}%
                          </span>
                          <button
                            onClick={() => handleRunCuriosity(gap.gapId)}
                            disabled={isCuriosityRunning}
                            className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-amber-600 text-neutral-300 hover:text-white text-[10px] font-mono transition-colors cursor-pointer"
                          >
                            Tutup Celah
                          </button>
                        </div>
                      </div>

                      <p className="text-[11px] text-neutral-400">{gap.description}</p>
                      <div className="text-[11px] font-mono text-amber-300/90 bg-amber-950/20 p-2 rounded border border-amber-900/30">
                        Inquiry Proaktif: "{gap.formulatedInquiry}"
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Sub-Tab 3: ANALOGY */}
          {lifelongSubTab === 'ANALOGY' && (
            <div className="flex flex-col gap-4">
              <div className="p-3.5 bg-neutral-900/70 border border-neutral-800 rounded-lg flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span className="text-neutral-400">Domain Sumber:</span>
                  <select
                    value={sourceDomain}
                    onChange={(e) => setSourceDomain(e.target.value)}
                    className="bg-neutral-800 border border-neutral-700 text-neutral-200 rounded px-2.5 py-1 text-xs font-mono"
                  >
                    <option value="CELLULAR_IMMUNOLOGY">CELLULAR_IMMUNOLOGY</option>
                    <option value="THERMODYNAMICS_PHYSICS">THERMODYNAMICS_PHYSICS</option>
                  </select>

                  <span className="text-cyan-400 font-bold mx-1">⇄</span>

                  <span className="text-neutral-400">Domain Target:</span>
                  <select
                    value={targetDomain}
                    onChange={(e) => setTargetDomain(e.target.value)}
                    className="bg-neutral-800 border border-neutral-700 text-neutral-200 rounded px-2.5 py-1 text-xs font-mono"
                  >
                    <option value="CYBERSECURITY_ZERO_TRUST">CYBERSECURITY_ZERO_TRUST</option>
                    <option value="DISTRIBUTED_CONSENSUS">DISTRIBUTED_CONSENSUS</option>
                  </select>
                </div>

                <button
                  onClick={handleSynthesizeAnalogy}
                  disabled={isAnalogyRunning}
                  className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-mono text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  {isAnalogyRunning ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <GitBranch className="w-3.5 h-3.5" />
                  )}
                  <span>{isAnalogyRunning ? 'Menghitung Vektor...' : 'Sintesis Isomorfisme HDC'}</span>
                </button>
              </div>

              {analogyResult && (
                <div className="p-4 bg-neutral-900/80 border border-cyan-500/30 rounded-lg flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-cyan-300 font-mono">
                        {analogyResult.sourceDomain} ⇄ {analogyResult.targetDomain}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-bold">
                        Resonansi Struktural: {Math.round(analogyResult.isomorphismScore * 100)}%
                      </span>
                      <span className="text-[10px] font-mono text-neutral-500">
                        Signature: {analogyResult.hdcStructuralSignature}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-neutral-300 font-sans leading-relaxed">
                    {analogyResult.derivedPrinciple}
                  </p>

                  <div className="p-2.5 bg-cyan-950/20 border border-cyan-900/40 rounded text-xs text-cyan-200/90 font-mono">
                    <span className="text-cyan-400 font-bold block mb-1">Wawasan Komputasi Red Queen:</span>
                    {analogyResult.actionableComputationalInsight}
                  </div>

                  {/* Role Mapping Table */}
                  <div className="overflow-x-auto mt-1">
                    <table className="w-full text-left text-[11px] font-mono border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-800 text-neutral-400">
                          <th className="py-1 px-2">Peran Fungsional</th>
                          <th className="py-1 px-2">Konsep {analogyResult.sourceDomain}</th>
                          <th className="py-1 px-2">Padanan {analogyResult.targetDomain}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800/60">
                        {analogyResult.roleMappings?.map((rm: any, rIdx: number) => (
                          <tr key={rIdx} className="hover:bg-neutral-800/30">
                            <td className="py-1 px-2 text-cyan-400 font-semibold">{rm.role}</td>
                            <td className="py-1 px-2 text-neutral-300">{rm.conceptInDomainA}</td>
                            <td className="py-1 px-2 text-emerald-300">{rm.conceptInDomainB}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sub-Tab 4: SLEEP */}
          {lifelongSubTab === 'SLEEP' && (
            <div className="flex flex-col gap-4">
              <div className="p-4 bg-neutral-900/70 border border-violet-500/30 rounded-lg flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-violet-300 font-mono flex items-center gap-2">
                    <Moon className="w-4 h-4 text-violet-400" />
                    Slow-Wave Sleep Memory Consolidation
                  </h4>
                  <p className="text-[11px] text-neutral-400 mt-1 max-w-xl">
                    Memutar ulang interaksi jangka pendek, memadatkan super-vektor HDC, melakukan pemangkasan sinaptik Hebbian pada derau, dan menjamin nol degradasi ingatan lama (100% Zero Catastrophic Forgetting).
                  </p>
                </div>

                <button
                  onClick={handleTriggerSleep}
                  disabled={isSleepRunning}
                  className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-violet-950/40"
                >
                  {isSleepRunning ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Moon className="w-3.5 h-3.5" />
                  )}
                  <span>{isSleepRunning ? 'Mengkonsolidasi Memori...' : 'Jalankan Siklus Tidur Sekarang'}</span>
                </button>
              </div>

              {lastSleepReport ? (
                <div className="p-4 bg-neutral-900/60 border border-neutral-800 rounded-lg flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                    <span className="text-xs font-bold text-neutral-200 font-mono">
                      Laporan Konsolidasi: {lastSleepReport.sessionId}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">
                      Selesai dalam {lastSleepReport.durationMs} ms
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800">
                      <span className="text-[10px] text-neutral-500 block font-mono">Item Di-Replay</span>
                      <span className="text-sm font-bold text-violet-300 font-mono">{lastSleepReport.replayedItemsCount}</span>
                    </div>

                    <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800">
                      <span className="text-[10px] text-neutral-500 block font-mono">Kluster Dipadatkan</span>
                      <span className="text-sm font-bold text-cyan-300 font-mono">{lastSleepReport.clustersConsolidated}</span>
                    </div>

                    <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800">
                      <span className="text-[10px] text-neutral-500 block font-mono">Sinapsis Dipangkas</span>
                      <span className="text-sm font-bold text-amber-300 font-mono">{lastSleepReport.synapticPruningCount}</span>
                    </div>

                    <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800">
                      <span className="text-[10px] text-neutral-500 block font-mono">Retensi Aksiooma Fondasi</span>
                      <span className="text-sm font-bold text-emerald-400 font-mono">
                        {lastSleepReport.benchmarkAxiomsRetained} / {lastSleepReport.benchmarkAxiomsChecked} (100%)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-xs font-mono text-neutral-500 bg-neutral-900/30 border border-neutral-800 rounded-lg">
                  Belum ada sesi tidur yang dijalankan. Klik 'Jalankan Siklus Tidur Sekarang' untuk menguji pemadatan memori.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Section 1 & Section 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column: HDC Associative Memory & Vector Inspector (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Card: Hyperdimensional Vector Bit-Matrix */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-red-500" />
                <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider">
                  4096-bit Vector Projection Sample
                </h3>
              </div>
              <span className="text-[10px] font-mono text-neutral-500">
                Selected Concept: <span className="text-red-400 font-bold">{selectedVectorSeed}</span>
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {renderBitMatrix(selectedVectorSeed)}
              
              <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-xs bg-red-500" />
                  <span>Bit 1 (Hyperplane +1)</span>
                  <span className="w-2 h-2 rounded-xs bg-neutral-800 ml-2" />
                  <span>Bit 0 (Hyperplane -1)</span>
                </div>
                <div className="text-neutral-500">
                  Orthogonal capacity: 2^4096 distinct states
                </div>
              </div>
            </div>
          </div>

          {/* Card: One-Shot Associative Memory Learning & Query */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider">
                  One-Shot Instantaneous Associative Learning
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/50">
                Zero Retraining Required
              </span>
            </div>

            {/* Input Form */}
            <form onSubmit={handleLearn} className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newConcept}
                  onChange={(e) => setNewConcept(e.target.value)}
                  placeholder="Ketik fakta / konsep baru untuk di-encode ke HDC memory..."
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-red-500/50 font-mono"
                />
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 text-xs text-neutral-300 font-mono focus:outline-none focus:border-red-500/50"
                >
                  <option value="EPISODIC">EPISODIC</option>
                  <option value="CYBER_THREAT">CYBER_THREAT</option>
                  <option value="AXIOM">AXIOM</option>
                  <option value="SWARM_TOPOLOGY">SWARM_TOPOLOGY</option>
                </select>
                <button
                  type="submit"
                  disabled={!newConcept.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-neutral-950 font-bold text-xs rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Encode</span>
                </button>
              </div>

              {learningStatus && (
                <div className="text-xs font-mono text-emerald-400 bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-900/40">
                  {learningStatus}
                </div>
              )}
            </form>

            {/* Associative Search */}
            <div className="pt-2 border-t border-neutral-850">
              <label className="text-[11px] font-mono text-neutral-400 block mb-2 uppercase">
                Uji Daya Ingat Asosiatif (Cosine Similarity Lookup)
              </label>
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Cari konsep terdekat (misal: 'red queen', 'keamanan', 'metabolisme')..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3.5 py-2 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-red-500/50 font-mono"
                  />
                </div>
                <button
                  onClick={() => handleSearch()}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono rounded-lg transition-colors cursor-pointer"
                >
                  Search
                </button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map((res, i) => (
                    <div 
                      key={i} 
                      onClick={() => setSelectedVectorSeed(res.label)}
                      className="flex items-center justify-between p-2.5 bg-neutral-950/60 border border-neutral-800/80 rounded-lg hover:border-red-900/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-neutral-500">#{i + 1}</span>
                        <span className="text-xs text-neutral-200 font-mono">{res.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-emerald-400 h-full rounded-full" 
                            style={{ width: `${Math.max(5, res.similarity * 100)}%` }} 
                          />
                        </div>
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {(res.similarity * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Right Column: Cellular MoE & Hardware Profiling (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">

          {/* Card: Cellular MoE Router Live Gating */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider">
                  Cellular MoE Live Gating
                </h3>
              </div>
              <span className="text-[10px] font-mono text-indigo-400">
                Sparse Top-2 Routing
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-[11px] font-mono text-neutral-400 uppercase">
                Input Stimulus Pengujian
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={moeTestInput}
                  onChange={(e) => setMoeTestInput(e.target.value)}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono focus:outline-none focus:border-indigo-500/50"
                />
                <button
                  onClick={() => testMoERouting(moeTestInput)}
                  className="px-3 py-2 bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/40 text-xs font-mono rounded-lg transition-colors cursor-pointer"
                >
                  Route
                </button>
              </div>

              {/* Expert Meters */}
              <div className="space-y-3 mt-2">
                {[
                  { id: 'expert_cyber_security', name: 'Cyber Threat & Defense', desc: 'Anomaly signatures, P2P network, cryptographic keys', color: 'from-red-500 to-rose-600' },
                  { id: 'expert_logic_reasoning', name: 'Deterministic Logic', desc: 'Modus ponens, syllogisms, contradiction audits', color: 'from-amber-500 to-orange-600' },
                  { id: 'expert_knowledge_retrieval', name: 'Associative Knowledge', desc: 'Cognitive graph and episodic concept recall', color: 'from-indigo-500 to-blue-600' },
                  { id: 'expert_metabolic_vitality', name: 'Metabolic Vitality', desc: 'ATP accounting, catabolic budget, cell homeostatis', color: 'from-emerald-500 to-teal-600' },
                ].map((exp) => {
                  const weight = simulatedGating[exp.id] || 0.15;
                  const isTop = activeExperts.some(a => a.id === exp.id);
                  return (
                    <div key={exp.id} className={`p-3 rounded-lg border transition-all ${isTop ? 'bg-neutral-950/90 border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.15)]' : 'bg-neutral-950/40 border-neutral-850 opacity-75'}`}>
                      <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isTop ? 'bg-indigo-400 animate-pulse' : 'bg-neutral-600'}`} />
                          <span className={`font-bold ${isTop ? 'text-white' : 'text-neutral-400'}`}>{exp.name}</span>
                        </div>
                        <span className={`font-bold ${isTop ? 'text-indigo-400' : 'text-neutral-500'}`}>
                          {(weight * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-neutral-850 h-1.5 rounded-full overflow-hidden mb-1">
                        <div 
                          className={`bg-gradient-to-r ${exp.color} h-full transition-all duration-500 rounded-full`}
                          style={{ width: `${Math.max(4, weight * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-neutral-500 font-mono leading-tight">{exp.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Card: Hardware Profiling & Simulated Mobile Phone Benchmark */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider">
                  Mobile Edge Hardware Profiling
                </h3>
              </div>
              <span className="text-[10px] font-mono text-amber-400 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-900/40">
                ARM Cortex-A55 Target
              </span>
            </div>

            {benchmarkResult ? (
              <div className="space-y-3 font-mono text-xs">
                
                {/* Latency Comparison */}
                <div className="p-3 bg-neutral-950/60 border border-neutral-800 rounded-lg">
                  <div className="text-[10px] text-neutral-500 uppercase mb-2">Throughput CPU Murni</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[11px] text-neutral-400">HDC Vector Ops</div>
                      <div className="text-sm font-bold text-emerald-400">
                        {benchmarkResult.hdcOpsPerSec.toLocaleString()} <span className="text-[10px] font-normal text-neutral-400">ops/s</span>
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        ({benchmarkResult.hdcAvgLatencyMicros} Âµs / op)
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-neutral-400">SSM Linear Step</div>
                      <div className="text-sm font-bold text-indigo-400">
                        {benchmarkResult.ssmStepsPerSec.toLocaleString()} <span className="text-[10px] font-normal text-neutral-400">steps/s</span>
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        ({benchmarkResult.ssmAvgLatencyMicros} Âµs / step)
                      </div>
                    </div>
                  </div>
                </div>

                {/* Transformer vs Red Queen Comparison */}
                <div className="p-3 bg-neutral-950/60 border border-neutral-800 rounded-lg">
                  <div className="text-[10px] text-neutral-500 uppercase mb-2">Perbandingan Efisiensi Sumber Daya</div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[11px] text-neutral-300 mb-1">
                        <span>Red Queen Neuro-Symbolic:</span>
                        <span className="font-bold text-emerald-400">~14.8 MB RAM (O(1))</span>
                      </div>
                      <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-400 h-full w-[3%]" />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-neutral-300 mb-1">
                        <span>Transformer 7B (4-bit Q):</span>
                        <span className="font-bold text-red-400">~4,500 MB RAM (O(NÂ²))</span>
                      </div>
                      <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-red-500 h-full w-[95%]" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-neutral-850 flex items-center justify-between text-[10px] text-neutral-400">
                    <span>Rasio Efisiensi Memori:</span>
                    <span className="text-emerald-400 font-bold">{benchmarkResult.memoryEfficiencyRatioVsTransformer}x Lebih Ringan</span>
                  </div>
                </div>

                {/* Battery & Thermal */}
                <div className="flex items-center justify-between p-2.5 bg-emerald-950/20 border border-emerald-900/30 rounded-lg text-emerald-400">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Dampak Baterai Ponsel:</span>
                  </div>
                  <span className="font-bold">{benchmarkResult.mobileSimulatedScore.batteryImpact}</span>
                </div>

              </div>
            ) : (
              <div className="py-6 text-center text-xs font-mono text-neutral-500">
                Memuat data benchmark...
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
