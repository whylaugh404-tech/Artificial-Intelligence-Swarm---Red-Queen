import React, { useState, useEffect } from 'react';
import { Network, Plus, RefreshCw, AlertCircle, Layers, Link2, ShieldCheck, Database, Search } from 'lucide-react';

interface CognitiveConcept {
  conceptId: string;
  canonicalName: string;
  description: string;
  category: string;
  confidence: number;
  verificationStatus: string;
  evidenceIds?: string[];
  provenance: string[];
  sourceKnowledgeIds: string[];
  createdAt: string;
}

interface CognitiveGeneralization {
  generalizationId: string;
  sourceConceptIds: string[];
  generalizedPattern: string;
  confidence: number;
  verificationStatus: string;
  provenance: string[];
}

interface CognitiveRelation {
  relationId: string;
  subjectConceptId: string;
  predicate: string;
  objectConceptId: string;
  confidence: number;
  verificationStatus: string;
}

interface CognitiveEvidence {
  evidenceId: string;
  sourceId: string;
  confidence: number;
  timestamp: string;
  observationId?: string;
  context?: { contextId: string; domain: string };
}

export function CognitiveGraphPanel() {
  const [graphData, setGraphData] = useState<{
    concepts: CognitiveConcept[];
    generalizations: CognitiveGeneralization[];
    relations: CognitiveRelation[];
    evidences: CognitiveEvidence[];
    budget?: any;
  }>({
    concepts: [],
    generalizations: [],
    relations: [],
    evidences: []
  });

  const [activeTab, setActiveTab] = useState<'concepts' | 'generalizations' | 'relations' | 'evidences'>('concepts');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Concept Modal / Insert Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('CYBERSECURITY');
  const [newDescription, setNewDescription] = useState('');
  const [newConfidence, setNewConfidence] = useState(0.85);
  const [adding, setAdding] = useState(false);

  const fetchGraph = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cell/cognitive-graph');
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch cognitive graph`);
      const data = await res.json();
      setGraphData({
        concepts: Array.isArray(data.concepts) ? data.concepts : [],
        generalizations: Array.isArray(data.generalizations) ? data.generalizations : [],
        relations: Array.isArray(data.relations) ? data.relations : [],
        evidences: Array.isArray(data.evidences) ? data.evidences : [],
        budget: data.budget
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraph();
  }, []);

  const handleCreateConcept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setAdding(true);
    try {
      const res = await fetch('/api/cell/cognitive-graph/concept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonicalName: newName.trim(),
          category: newCategory,
          description: newDescription.trim() || 'Operator-injected cognitive concept',
          confidence: newConfidence
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to insert concept');
      setShowAddModal(false);
      setNewName('');
      setNewDescription('');
      fetchGraph();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const filteredConcepts = graphData.concepts.filter(c =>
    c.canonicalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.conceptId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border border-neutral-800 rounded-xl overflow-hidden font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 bg-neutral-950 border-b border-neutral-800 gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <Network className="w-5 h-5 text-indigo-400" />
          <div>
            <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-wider">Cognitive Representation Graph</h2>
            <p className="text-[11px] text-neutral-500 font-mono">Semantic Invariants, Abstractions & Evidence Provenance</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Concept</span>
          </button>
          <button
            onClick={fetchGraph}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 bg-neutral-900 border border-neutral-800 rounded transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="m-4 p-3 bg-red-950/40 border border-red-900 text-red-400 text-xs rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metrics Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-neutral-800 border-b border-neutral-800 shrink-0">
        <MetricTile label="CONCEPTS" value={graphData.concepts.length} color="text-indigo-400" />
        <MetricTile label="INVARIANTS (R9)" value={graphData.generalizations.length} color="text-emerald-400" />
        <MetricTile label="RELATIONS" value={graphData.relations.length} color="text-amber-400" />
        <MetricTile label="EVIDENCES" value={graphData.evidences.length} color="text-rose-400" />
      </div>

      {/* Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-3 bg-[#0d0d0d] border-b border-neutral-800 gap-3 shrink-0">
        <div className="flex items-center gap-1">
          <SubTabButton
            active={activeTab === 'concepts'}
            onClick={() => setActiveTab('concepts')}
            label="Concepts"
            count={graphData.concepts.length}
          />
          <SubTabButton
            active={activeTab === 'generalizations'}
            onClick={() => setActiveTab('generalizations')}
            label="Invariant Generalizations"
            count={graphData.generalizations.length}
          />
          <SubTabButton
            active={activeTab === 'relations'}
            onClick={() => setActiveTab('relations')}
            label="Relations"
            count={graphData.relations.length}
          />
          <SubTabButton
            active={activeTab === 'evidences'}
            onClick={() => setActiveTab('evidences')}
            label="Evidences"
            count={graphData.evidences.length}
          />
        </div>

        {activeTab === 'concepts' && (
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search concepts..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded pl-8 pr-3 py-1.5 text-xs text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-neutral-700"
            />
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#050505]">
        
        {/* Tab 1: Concepts */}
        {activeTab === 'concepts' && (
          <div>
            {filteredConcepts.length === 0 ? (
              <div className="text-center py-16 text-neutral-600 space-y-2">
                <Layers className="w-10 h-10 mx-auto opacity-40" />
                <p className="text-xs font-mono">No matching concepts found in graph.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredConcepts.map(c => (
                  <div key={c.conceptId} className="bg-neutral-900/40 border border-neutral-800 rounded-lg p-4 flex flex-col justify-between hover:border-neutral-700 transition-colors">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[10px] font-mono text-neutral-500 uppercase">{c.category}</span>
                        <span className="text-[10px] font-mono font-bold text-neutral-400">
                          Status: <strong className="text-emerald-400">{c.verificationStatus}</strong>
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-neutral-100 mb-2 leading-snug">{c.canonicalName}</h4>
                      <p className="text-xs text-neutral-400 leading-relaxed line-clamp-3 mb-4">{c.description}</p>
                    </div>

                    <div className="pt-3 border-t border-neutral-800/80 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-neutral-500">Confidence:</span>
                        <span className="text-neutral-200 font-bold tabular-nums">{(c.confidence * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-neutral-950 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-full"
                          style={{ width: `${Math.min(100, Math.max(5, c.confidence * 100))}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono pt-1">
                        <span>Evidences: {c.evidenceIds?.length || 0}</span>
                        <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Invariant Generalizations (R9) */}
        {activeTab === 'generalizations' && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-lg text-xs text-neutral-300">
              <span className="font-bold text-emerald-400 block mb-1">Causal Invariant Formation:</span>
              When two or more distinct experiences with independent evidence converge on structural patterns, the Red Queen engine synthesizes persistent invariant generalizations.
            </div>

            {graphData.generalizations.length === 0 ? (
              <div className="text-center py-16 text-neutral-600 space-y-2">
                <ShieldCheck className="w-10 h-10 mx-auto opacity-40 text-emerald-600" />
                <p className="text-xs font-mono">No generalizations formed yet. Run experiences through metabolism or tests.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {graphData.generalizations.map(g => (
                  <div key={g.generalizationId} className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
                        INVARIANT RULE · {g.generalizationId}
                      </span>
                      <span className="text-xs font-mono text-neutral-400 tabular-nums">
                        Confidence: <strong className="text-emerald-400">{(g.confidence * 100).toFixed(1)}%</strong>
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-neutral-200 mb-3">{g.generalizedPattern}</p>
                    <div className="text-[11px] font-mono text-neutral-500 flex flex-wrap gap-2">
                      <span>Source Concepts: {g.sourceConceptIds.join(', ') || 'N/A'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Relations */}
        {activeTab === 'relations' && (
          <div>
            {graphData.relations.length === 0 ? (
              <div className="text-center py-16 text-neutral-600 space-y-2">
                <Link2 className="w-10 h-10 mx-auto opacity-40" />
                <p className="text-xs font-mono">No relational edges recorded in graph.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {graphData.relations.map(rel => (
                  <div key={rel.relationId} className="p-3 bg-neutral-900/40 border border-neutral-800 rounded-lg flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-3">
                      <span className="text-neutral-300 font-bold">{rel.subjectConceptId}</span>
                      <span className="px-2 py-0.5 bg-neutral-800 rounded text-indigo-400 text-[10px] font-bold">
                        {rel.predicate}
                      </span>
                      <span className="text-neutral-300 font-bold">{rel.objectConceptId}</span>
                    </div>
                    <div className="flex items-center gap-4 text-neutral-400 text-[11px]">
                      <span>Confidence: {(rel.confidence * 100).toFixed(0)}%</span>
                      <span className="text-emerald-400">{rel.verificationStatus}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Evidences */}
        {activeTab === 'evidences' && (
          <div>
            {graphData.evidences.length === 0 ? (
              <div className="text-center py-16 text-neutral-600 space-y-2">
                <Database className="w-10 h-10 mx-auto opacity-40" />
                <p className="text-xs font-mono">No evidence entries in the cognitive graph.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {graphData.evidences.map(ev => (
                  <div key={ev.evidenceId} className="p-3 bg-neutral-900/40 border border-neutral-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs font-mono">
                    <div>
                      <span className="text-neutral-200 font-bold block">{ev.evidenceId}</span>
                      <span className="text-neutral-500 text-[10px]">Source: {ev.sourceId} {ev.observationId ? `· Obs: ${ev.observationId}` : ''}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-neutral-400">
                      <span>Confidence: <strong className="text-neutral-200 tabular-nums">{(ev.confidence * 100).toFixed(0)}%</strong></span>
                      <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Add Concept Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-sm font-bold text-neutral-100 uppercase tracking-wider">Register Operational Concept</h3>
              <button onClick={() => setShowAddModal(false)} className="text-neutral-500 hover:text-neutral-300 text-xs">✕</button>
            </div>

            <form onSubmit={handleCreateConcept} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Canonical Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. DistributedKademliaOverlay"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-red-600"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Information Category</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-xs text-neutral-300 focus:outline-none focus:border-red-600"
                >
                  <option value="CYBERSECURITY">CYBERSECURITY</option>
                  <option value="NETWORKING">NETWORKING</option>
                  <option value="OPERATING_SYSTEM">OPERATING_SYSTEM</option>
                  <option value="HARDWARE">HARDWARE</option>
                  <option value="AI">AI</option>
                  <option value="PROGRAMMING">PROGRAMMING</option>
                  <option value="GENERAL_TECHNOLOGY">GENERAL_TECHNOLOGY</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Description / Invariant Semantics</label>
                <textarea
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="Structural properties and operational description..."
                  rows={3}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-red-600 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Initial Confidence: <span className="text-neutral-200 font-mono">{(newConfidence * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={newConfidence}
                  onChange={e => setNewConfidence(parseFloat(e.target.value))}
                  className="w-full accent-red-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white bg-red-600 hover:bg-red-500 rounded disabled:bg-neutral-800 transition-colors"
                >
                  {adding ? 'Inserting...' : 'Insert Concept'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

function MetricTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-neutral-950 p-3 flex flex-col">
      <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">{label}</span>
      <span className={`text-xl font-bold font-mono tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function SubTabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
        active
          ? 'bg-neutral-800 text-neutral-100 shadow-sm'
          : 'text-neutral-500 hover:text-neutral-300'
      }`}
    >
      {label} <span className="font-mono text-[10px] text-neutral-500 ml-1">({count})</span>
    </button>
  );
}
