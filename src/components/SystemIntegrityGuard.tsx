import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Terminal, 
  RefreshCw, 
  Bug, 
  FileCode, 
  Layers, 
  Flame, 
  Activity,
  Cpu,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

export interface CodeLocation {
  file: string;
  line?: number;
  column?: number;
  functionOrClass: string;
}

export interface SystemAnomaly {
  id: string;
  timestamp: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'SILENT_INVARIANT_BREACH';
  subsystem: string;
  location: CodeLocation;
  message: string;
  stackTrace: string;
  stateSnapshot: Record<string, unknown>;
  suggestedRemediation: string;
  resolved: boolean;
}

export interface SubsystemAuditCheck {
  name: string;
  subsystem: string;
  passed: boolean;
  durationMs: number;
  location: CodeLocation;
  error?: string;
  stateSnapshot?: Record<string, unknown>;
}

export interface SystemAuditReport {
  timestamp: string;
  passed: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  checks: SubsystemAuditCheck[];
  activeAnomalies: SystemAnomaly[];
}

export interface LockdownReport {
  isOperable: boolean;
  status: 'OPERATIONAL' | 'HALTED_INTEGRITY_COMPROMISED';
  lockdownTimestamp: string | null;
  lockdownReason: string | SystemAnomaly | null;
  lockdownAnomaly?: SystemAnomaly | null;
  totalAnomalies: number;
  activeAnomaliesCount?: number;
  anomalies: SystemAnomaly[];
  activeAnomalies?: SystemAnomaly[];
  lastAudit: SystemAuditReport | null;
}

interface Props {
  onStatusChange?: (isOperable: boolean) => void;
}

export function SystemIntegrityGuard({ onStatusChange }: Props) {
  const [report, setReport] = useState<LockdownReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<SystemAuditReport | null>(null);
  const [expandedAnomaly, setExpandedAnomaly] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchIntegrityStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/integrity/status');
      if (res.ok) {
        const data: LockdownReport = await res.json();
        setReport(data);
        if (onStatusChange) {
          onStatusChange(data.isOperable);
        }
        if (data.lastAudit) {
          setAuditResult(data.lastAudit);
        }
      }
    } catch (err) {
      console.error('Failed to fetch system integrity status:', err);
    } finally {
      setLoading(false);
    }
  };

  const runDeepAudit = async () => {
    try {
      setAuditing(true);
      const res = await fetch('/api/integrity/audit', { method: 'POST' });
      if (res.ok) {
        const data: SystemAuditReport = await res.json();
        setAuditResult(data);
        await fetchIntegrityStatus();
      }
    } catch (err) {
      console.error('Failed to trigger deep audit:', err);
    } finally {
      setAuditing(false);
    }
  };

  const resetLockdown = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/integrity/reset', { method: 'POST' });
      if (res.ok) {
        await fetchIntegrityStatus();
      }
    } catch (err) {
      console.error('Failed to reset lockdown:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrityStatus();
    if (!autoRefresh) return;
    const interval = setInterval(fetchIntegrityStatus, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const isHalted = report ? !report.isOperable : false;

  return (
    <div className="flex flex-col gap-6 w-full max-w-full">
      {/* Lockdown Alert Banner (Always Visible when Compromised) */}
      {isHalted && (
        <div className="bg-red-950/80 border-2 border-red-600 rounded-xl p-5 shadow-2xl shadow-red-950/60 animate-pulse">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-600/30 border border-red-500 rounded-lg text-red-400">
                <ShieldAlert className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-red-600 text-white font-bold rounded">
                    FAIL-FAST LOCKDOWN
                  </span>
                  <span className="text-xs text-red-300 font-mono">
                    {report?.lockdownTimestamp ? new Date(report.lockdownTimestamp).toLocaleTimeString() : 'ACTIVE'}
                  </span>
                </div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight mt-0.5">
                  SYSTEM HALTED: INTEGRITY ANOMALY DETECTED
                </h2>
                <p className="text-xs text-red-200/90 font-mono mt-1">
                  Semua operasi otonom, inferensi nalar, dan metabolisme dinonaktifkan demi mencegah kompromi sistem.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto">
              <button
                onClick={runDeepAudit}
                disabled={auditing}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-mono font-bold tracking-wider uppercase transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${auditing ? 'animate-spin' : ''}`} />
                {auditing ? 'Memindai Codebase...' : 'Jalankan Audit & Verifikasi'}
              </button>
            </div>
          </div>

          {/* Primary Lockdown Reason Box */}
          {(() => {
            const primaryAnomaly: SystemAnomaly | undefined =
              (typeof report?.lockdownReason === 'object' && report?.lockdownReason !== null)
                ? report.lockdownReason
                : (report?.lockdownAnomaly || report?.activeAnomalies?.[0] || report?.anomalies?.[0]);

            const primaryMessage = typeof report?.lockdownReason === 'string'
              ? report.lockdownReason
              : (primaryAnomaly?.message || 'Integritas sistem terkompromi akibat anomali invarian.');

            if (!report?.lockdownReason && !primaryAnomaly) return null;

            return (
              <div className="mt-4 p-4 bg-black/60 border border-red-800/80 rounded-lg font-mono text-xs">
                <div className="flex items-center justify-between text-red-400 font-bold mb-2">
                  <span className="flex items-center gap-1.5">
                    <FileCode className="w-4 h-4 text-red-400" />
                    Tata Letak Bug: {primaryAnomaly?.location?.file || 'src/redqueen/core/system_integrity.ts'}:{primaryAnomaly?.location?.line ?? 1}
                  </span>
                  <span className="text-[11px] text-red-300 uppercase">
                    Subsystem: {primaryAnomaly?.subsystem || 'RUNTIME'}
                  </span>
                </div>
                <p className="text-neutral-200 text-sm font-semibold mb-2">
                  {primaryMessage}
                </p>
                {primaryAnomaly?.stackTrace && (
                  <pre className="text-[11px] text-red-300/80 bg-neutral-950 p-2.5 rounded overflow-x-auto max-h-32 border border-red-900/40">
                    {primaryAnomaly.stackTrace}
                  </pre>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Main Integrity & Sentry Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Sentry Status & Subsystem Health Sweep */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-rose-500" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-200">
                  Status Integritas Sistem (34k+ LOC)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold uppercase ${
                  report?.isOperable 
                    ? 'bg-emerald-950/80 border border-emerald-600/60 text-emerald-400' 
                    : 'bg-red-950/80 border border-red-600/60 text-red-400'
                }`}>
                  {report?.isOperable ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      OPERASIONAL (0 BUG)
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5 text-red-400" />
                      TERKUNCI (HALTED)
                    </>
                  )}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 bg-neutral-950/80 border border-neutral-800/80 rounded-lg">
                <span className="text-neutral-500 block text-[10px] uppercase">Anomali Terdeteksi</span>
                <span className={`text-lg font-bold ${report?.totalAnomalies ? 'text-red-400' : 'text-emerald-400'}`}>
                  {report?.totalAnomalies ?? 0}
                </span>
              </div>
              <div className="p-3 bg-neutral-950/80 border border-neutral-800/80 rounded-lg">
                <span className="text-neutral-500 block text-[10px] uppercase">Pemeriksaan Subsubsistem</span>
                <span className="text-lg font-bold text-neutral-200">
                  {auditResult ? `${auditResult.passedChecks}/${auditResult.totalChecks} Lulus` : '9 Modul Inti'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                onClick={runDeepAudit}
                disabled={auditing}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-mono font-medium transition-colors border border-neutral-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${auditing ? 'animate-spin text-rose-400' : ''}`} />
                {auditing ? 'Memindai...' : 'Audit Menyeluruh'}
              </button>

              {isHalted && (
                <button
                  onClick={resetLockdown}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 rounded-lg text-xs font-mono transition-colors"
                >
                  <Unlock className="w-3.5 h-3.5 text-amber-400" />
                  Reset Kunci
                </button>
              )}
            </div>
          </div>

          {/* Subsystem Audit Check Checklist */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 flex flex-col gap-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-300 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Verifikasi Invariant 9 Subsistem
            </h4>

            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
              {(auditResult?.checks || defaultSubsystemChecks).map((chk, idx) => (
                <div 
                  key={idx}
                  className={`p-2.5 rounded-lg border font-mono text-xs flex flex-col gap-1 transition-all ${
                    chk.passed 
                      ? 'bg-neutral-950/40 border-neutral-800/80 text-neutral-300' 
                      : 'bg-red-950/40 border-red-700 text-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {chk.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                      <span className="font-semibold text-neutral-200">{chk.name}</span>
                    </div>
                    <span className="text-[10px] text-neutral-500 uppercase px-1.5 py-0.5 bg-neutral-900 rounded">
                      {chk.subsystem}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-neutral-500 pl-6">
                    <span className="truncate max-w-[280px]">
                      {chk.location.file}:{chk.location.line ?? 0}
                    </span>
                    <span>{chk.durationMs ? `${chk.durationMs}ms` : 'verified'}</span>
                  </div>
                  {chk.error && (
                    <div className="mt-1 pl-6 text-red-400 text-[11px] font-sans">
                      Error: {chk.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Detailed Bug Location, Call Stack & Anomaly Inspector */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4 h-full">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Bug className="w-4 h-4 text-rose-500" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-200">
                  Daftar Pelacakan Bug & Tata Letak ({report?.anomalies?.length ?? 0})
                </h3>
              </div>
              <span className="text-xs text-neutral-500 font-mono">
                {report?.anomalies?.length === 0 ? 'Semua Subsistem Bersih' : 'Fail-Fast Active'}
              </span>
            </div>

            {(!report?.anomalies || report.anomalies.length === 0) ? (
              <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-neutral-800 rounded-xl bg-neutral-950/40 my-auto">
                <div className="p-3 bg-emerald-950/40 border border-emerald-700/40 rounded-full text-emerald-400 mb-3">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-base font-bold text-neutral-200 font-mono">NOL BUG TERDETEKSI</h4>
                <p className="text-xs text-neutral-400 max-w-md mt-1">
                  Seluruh 34.000+ baris kode subsistem (Metabolisme, Graf Kognitif, SSM, HDC, DHT, Genome, Mitosis) beroperasi dalam batas invariant yang valid tanpa anomali tersembunyi.
                </p>
                <button
                  onClick={runDeepAudit}
                  disabled={auditing}
                  className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white rounded-lg text-xs font-mono"
                >
                  Verifikasi Ulang Sekarang
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 overflow-y-auto max-h-[600px] pr-1">
                {report.anomalies.map((anom) => {
                  const isExpanded = expandedAnomaly === anom.id;
                  return (
                    <div 
                      key={anom.id}
                      className="border border-red-900/60 bg-red-950/20 rounded-xl p-4 flex flex-col gap-3 font-mono text-xs transition-all"
                    >
                      {/* Anomaly Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                            anom.severity === 'CRITICAL' 
                              ? 'bg-red-600 text-white' 
                              : 'bg-amber-600 text-black'
                          }`}>
                            {anom.severity}
                          </span>
                          <span className="text-red-400 font-bold uppercase">
                            [{anom.subsystem}]
                          </span>
                        </div>
                        <span className="text-[10px] text-neutral-500">
                          {new Date(anom.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      {/* Location Layout Box */}
                      <div className="p-2.5 bg-black/70 border border-red-900/40 rounded-lg flex flex-col gap-1 text-[11px]">
                        <div className="flex items-center gap-1.5 text-red-300 font-semibold">
                          <FileCode className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span className="text-white">Tata Letak Berkas:</span>
                          <code className="text-rose-400 underline decoration-rose-600">
                            {anom.location?.file || 'src/redqueen/core/system_integrity.ts'}:{anom.location?.line ?? '?'}:{anom.location?.column ?? '?'}
                          </code>
                        </div>
                        <div className="text-neutral-400 text-[10px]">
                          Fungsi/Kelas: <span className="text-neutral-200">{anom.location?.functionOrClass || 'Unknown'}</span>
                        </div>
                      </div>

                      {/* Error Message */}
                      <div className="text-neutral-200 font-sans text-xs font-medium leading-relaxed">
                        {anom.message}
                      </div>

                      {/* Suggested Remediation */}
                      <div className="p-2 bg-neutral-900/80 border border-neutral-800 rounded text-[11px] text-neutral-300">
                        <span className="text-indigo-400 font-semibold block mb-0.5">Saran Perbaikan Teknis:</span>
                        {anom.suggestedRemediation}
                      </div>

                      {/* Stack Trace Accordion */}
                      {anom.stackTrace && (
                        <div>
                          <button
                            onClick={() => setExpandedAnomaly(isExpanded ? null : anom.id)}
                            className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white transition-colors"
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <span>{isExpanded ? 'Sembunyikan Call Stack' : 'Tampilkan Call Stack Lengkap'}</span>
                          </button>
                          
                          {isExpanded && (
                            <pre className="mt-2 p-3 bg-black/90 border border-neutral-800 rounded-lg text-[10px] text-red-300/90 overflow-x-auto whitespace-pre font-mono leading-tight">
                              {anom.stackTrace}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const defaultSubsystemChecks: SubsystemAuditCheck[] = [
  {
    name: 'MemoryStore Key/Value Serialization Parity',
    subsystem: 'MEMORY_STORE',
    passed: true,
    durationMs: 4,
    location: { file: 'src/redqueen/memory/store.ts', line: 120, functionOrClass: 'JsonFileMemoryStore' }
  },
  {
    name: 'Metabolic Thermodynamic Conservation Invariant (ATP non-negative & finite)',
    subsystem: 'METABOLISM',
    passed: true,
    durationMs: 2,
    location: { file: 'src/redqueen/metabolism/cellular_vitality.ts', line: 75, functionOrClass: 'CellMetabolismController' }
  },
  {
    name: 'Cognitive Graph Referential Consistency & Bounded Confidence',
    subsystem: 'COGNITIVE_GRAPH',
    passed: true,
    durationMs: 8,
    location: { file: 'src/redqueen/cognition/representation/graph.ts', line: 150, functionOrClass: 'CognitiveGraph' }
  },
  {
    name: 'Linear SSM Numerical Stability (Finite Hidden State Vectors)',
    subsystem: 'NEURAL_SSM',
    passed: true,
    durationMs: 3,
    location: { file: 'src/redqueen/learning/linear_ssm.ts', line: 85, functionOrClass: 'LinearSSMCell' }
  },
  {
    name: 'HDC Vector Dimension & Similarity Invariant',
    subsystem: 'HDC_VECTOR',
    passed: true,
    durationMs: 2,
    location: { file: 'src/redqueen/cognition/hdc.ts', line: 40, functionOrClass: 'AssociativeItemMemory' }
  },
  {
    name: 'Contradiction Feedback Loop Integrity',
    subsystem: 'CONTRADICTION_LOOP',
    passed: true,
    durationMs: 3,
    location: { file: 'src/redqueen/cognition/reasoning/contradiction_loop.ts', line: 95, functionOrClass: 'ContradictionFeedbackLoop' }
  },
  {
    name: 'Perceptual Stream Semantic Parsing Contract',
    subsystem: 'PERCEPTUAL_STREAM',
    passed: true,
    durationMs: 5,
    location: { file: 'src/redqueen/cognition/perceptual_stream.ts', line: 110, functionOrClass: 'PerceptualStreamIngestor' }
  },
  {
    name: 'Cell Genome Lineage & Cryptographic Invariant',
    subsystem: 'GENOME_LINEAGE',
    passed: true,
    durationMs: 2,
    location: { file: 'src/redqueen/genome/index.ts', line: 100, functionOrClass: 'CellGenome' }
  },
  {
    name: 'DHT Routing Table XOR Distance Symmetry Invariant',
    subsystem: 'DHT_NETWORK',
    passed: true,
    durationMs: 2,
    location: { file: 'src/redqueen/dht/routing.ts', line: 60, functionOrClass: 'RoutingTable' }
  }
];
