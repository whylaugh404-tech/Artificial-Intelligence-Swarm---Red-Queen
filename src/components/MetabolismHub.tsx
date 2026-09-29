import React, { useState, useEffect } from 'react';
import { Flame, Send, CheckCircle2, AlertTriangle, RefreshCw, Hash, Cpu, ShieldCheck, Clock } from 'lucide-react';

interface MetabolismEvent {
  eventId: string;
  eventType: string;
  cellId: string;
  informationId: string;
  knowledgeId?: string;
  timestamp: string;
  details?: Record<string, any>;
}

export function MetabolismHub() {
  const [events, setEvents] = useState<MetabolismEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('ALL');

  // Ingestion Form State
  const [sourceType, setSourceType] = useState('USER_PROVIDED');
  const [sourceIdentifier, setSourceIdentifier] = useState('OSINT_FEED_ALPHA');
  const [contentType, setContentType] = useState('text/plain');
  const [content, setContent] = useState('Zero-day vulnerability signature detected: Unauthenticated buffer overflow in legacy transport daemon.');
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch('/api/cell/metabolism/events?limit=50');
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch metabolism events`);
      const data = await res.json();
      if (Array.isArray(data.events)) {
        setEvents(data.events);
      }
    } catch (err: any) {
      console.warn('Metabolism events fetch gap:', err.message);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setSubmitting(true);
    setError(null);
    setLastResult(null);

    try {
      const res = await fetch('/api/cell/metabolize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType,
          sourceIdentifier,
          contentType,
          content: content.trim()
        })
      });
      const data = await res.json();
      if (!res.ok && data.status !== 'INVALID') {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setLastResult(data);
      fetchEvents();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEvents = selectedFilter === 'ALL'
    ? events
    : events.filter(e => e.eventType === selectedFilter);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border border-neutral-800 rounded-xl overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-neutral-950 border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-3">
          <Flame className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-sm font-bold text-neutral-200 uppercase tracking-wider">Information Metabolism Pipeline</h2>
            <p className="text-[11px] text-neutral-500 font-mono">Nutrient Intake, Hashing, Epistemic Validation & Knowledge Digestion</p>
          </div>
        </div>

        <button
          onClick={fetchEvents}
          disabled={loadingEvents}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 bg-neutral-900 border border-neutral-800 rounded transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingEvents ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="m-4 p-3 bg-red-950/40 border border-red-900 text-red-400 text-xs rounded flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Split Console */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-neutral-800">
        
        {/* Left Column: Intake Ingestion Console */}
        <div className="lg:col-span-5 flex flex-col min-h-0 bg-[#070707] overflow-y-auto custom-scrollbar p-5 space-y-6">
          
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4 space-y-4">
            <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2 border-b border-neutral-800 pb-2">
              <Send className="w-3.5 h-3.5 text-amber-400" />
              Nutrient Intake Ingestion
            </span>

            <form onSubmit={handleIngest} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-neutral-400 mb-1">Source Type</label>
                  <select
                    value={sourceType}
                    onChange={e => setSourceType(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-amber-600"
                  >
                    <option value="USER_PROVIDED">USER_PROVIDED</option>
                    <option value="LOCAL_DATA">LOCAL_DATA</option>
                    <option value="PUBLIC_WEB">PUBLIC_WEB</option>
                    <option value="DOCUMENT">DOCUMENT</option>
                    <option value="API">API</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-neutral-400 mb-1">Content Type</label>
                  <select
                    value={contentType}
                    onChange={e => setContentType(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-amber-600"
                  >
                    <option value="text/plain">text/plain</option>
                    <option value="application/json">application/json</option>
                    <option value="text/markdown">text/markdown</option>
                    <option value="text/csv">text/csv</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">Source Identifier</label>
                <input
                  type="text"
                  value={sourceIdentifier}
                  onChange={e => setSourceIdentifier(e.target.value)}
                  placeholder="e.g. OSINT_FEED_ALPHA"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-600 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">Nutrient Payload / Observation</label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={4}
                  placeholder="Enter observation, telemetry data, or threat intelligence to metabolize..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-600 resize-none font-mono"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 text-xs font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Metabolism Cycle...</span>
                  </>
                ) : (
                  <>
                    <Flame className="w-3.5 h-3.5" />
                    <span>Metabolize Intake</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Last Result Card */}
          {lastResult && (
            <div className={`p-4 rounded-lg border space-y-3 ${
              lastResult.status === 'ACCEPTED'
                ? 'bg-neutral-900/60 border-emerald-900/50'
                : 'bg-red-950/30 border-red-900/50'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  {lastResult.status === 'ACCEPTED' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300">Intake Accepted & Metabolized</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span className="text-rose-300">Intake {lastResult.status}</span>
                    </>
                  )}
                </span>
                <span className="text-[10px] font-mono text-neutral-500 tabular-nums">
                  {lastResult.processingDurationMs}ms
                </span>
              </div>

              <div className="space-y-1.5 text-xs font-mono">
                {lastResult.informationId && (
                  <div className="flex justify-between text-neutral-400 border-b border-neutral-800/80 pb-1">
                    <span className="text-neutral-500">Information ID:</span>
                    <span className="text-neutral-200">{lastResult.informationId.substring(0, 18)}...</span>
                  </div>
                )}
                {lastResult.knowledgeId && (
                  <div className="flex justify-between text-neutral-400 border-b border-neutral-800/80 pb-1">
                    <span className="text-neutral-500">Knowledge Record:</span>
                    <span className="text-indigo-400">{lastResult.knowledgeId.substring(0, 18)}...</span>
                  </div>
                )}
                {lastResult.classification && (
                  <div className="flex justify-between text-neutral-400 border-b border-neutral-800/80 pb-1">
                    <span className="text-neutral-500">Classification:</span>
                    <span className="text-amber-400">{lastResult.classification}</span>
                  </div>
                )}
                {lastResult.quality && (
                  <div className="flex justify-between text-neutral-400 border-b border-neutral-800/80 pb-1">
                    <span className="text-neutral-500">Quality Score:</span>
                    <span className="text-emerald-400 tabular-nums">{(lastResult.quality.qualityScore * 100).toFixed(1)}%</span>
                  </div>
                )}
                {lastResult.reason && (
                  <p className="text-[11px] text-neutral-300 pt-1 font-sans leading-relaxed">
                    {lastResult.reason}
                  </p>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Metabolism Audit Trail */}
        <div className="lg:col-span-7 flex flex-col min-h-0 bg-[#0a0a0a] p-6 space-y-4">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">Metabolic Audit Stream</h3>
              <p className="text-[10px] text-neutral-500 font-mono">Live Invariant Verification & Event Log</p>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
              {['ALL', 'KNOWLEDGE_CREATED', 'EXPERIENCE_CREATED', 'REPRESENTATION_STORED', 'NORMALIZED'].map(f => (
                <button
                  key={f}
                  onClick={() => setSelectedFilter(f)}
                  className={`px-2.5 py-1 text-[10px] font-semibold rounded uppercase whitespace-nowrap transition-colors ${
                    selectedFilter === f
                      ? 'bg-neutral-800 text-neutral-100'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {f === 'ALL' ? 'All Events' : f.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {filteredEvents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-neutral-600 space-y-2 py-16">
                <ShieldCheck className="w-10 h-10 opacity-30" />
                <p className="text-xs font-mono">No metabolic events matching filter recorded.</p>
              </div>
            ) : (
              filteredEvents.slice().reverse().map(ev => (
                <div key={ev.eventId} className="p-3 bg-neutral-900/40 border border-neutral-800/80 rounded-lg flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5"></span>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-bold text-neutral-200">
                          {ev.eventType}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-500">
                          {ev.informationId?.substring(0, 16)}...
                        </span>
                      </div>
                      {ev.details && (
                        <p className="text-[11px] font-mono text-neutral-400 line-clamp-2">
                          {ev.details.title || ev.details.primaryCategory || JSON.stringify(ev.details)}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-neutral-500 shrink-0 whitespace-nowrap">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
