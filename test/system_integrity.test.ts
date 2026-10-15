import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { 
  SystemIntegrityTracker, 
  AnomalySeverity, 
  SubsystemCategory,
  SystemIntegrityLockdownError
} from '../src/redqueen/core/system_integrity';
import { Cell } from '../src/redqueen/core/cell';

describe('Red Queen Deep System Integrity Sentry & Fail-Fast Tracker', () => {
  let integrity: SystemIntegrityTracker;
  const tmpDir = path.join(process.cwd(), '.tmp_test_system_integrity');

  beforeEach(() => {
    integrity = new SystemIntegrityTracker();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Safe cleanup
      }
    }
  });

  it('initializes in 100% OPERABLE state with zero anomalies', () => {
    expect(integrity.isSystemOperable()).toBe(true);
    const report = integrity.getLockdownReport();
    expect(report.isOperable).toBe(true);
    expect(report.activeAnomaliesCount).toBe(0);
    expect(report.lockdownReason).toBeNull();
    expect(() => integrity.assertOperable('test.op')).not.toThrow();
  });

  it('triggers immediate fail-fast LOCKDOWN on invariant breach and records exact bug location', () => {
    integrity.registerAnomaly({
      severity: AnomalySeverity.CRITICAL,
      subsystem: SubsystemCategory.METABOLISM,
      location: {
        file: 'src/redqueen/metabolism/cellular_vitality.ts',
        line: 142,
        functionOrClass: 'CellMetabolismController.burnATP'
      },
      message: 'Thermodynamic Invariant Breach: ATP energy went negative (-1.5)',
      suggestedRemediation: 'Ensure Math.max(0, atp) clamp is active'
    });

    expect(integrity.isSystemOperable()).toBe(false);
    const report = integrity.getLockdownReport();
    expect(report.isOperable).toBe(false);
    expect(report.activeAnomaliesCount).toBe(1);
    expect(report.lockdownReason).toContain('Thermodynamic Invariant Breach');

    const anomaly = report.activeAnomalies[0];
    expect(anomaly.location.file).toBe('src/redqueen/metabolism/cellular_vitality.ts');
    expect(anomaly.location.line).toBe(142);
    expect(anomaly.location.functionOrClass).toBe('CellMetabolismController.burnATP');
    expect(anomaly.stackTrace).toBeTruthy();

    expect(() => integrity.assertOperable('cell.metabolize')).toThrow(SystemIntegrityLockdownError);
  });

  it('runs deep system audit verifying multi-subsystem invariants', async () => {
    const cellStateFile = path.join(tmpDir, 'cell_audit.json');
    const cell = new Cell(cellStateFile, 'secret_audit');

    const auditReport = await integrity.runDeepSystemAudit(cell);
    expect(auditReport.totalChecks).toBeGreaterThanOrEqual(8);
    expect(auditReport.passedChecks).toBe(auditReport.totalChecks);
    expect(auditReport.failedChecks).toBe(0);
    expect(auditReport.passed).toBe(true);

    const metabolismCheck = auditReport.checks.find(c => c.subsystem === SubsystemCategory.METABOLISM);
    expect(metabolismCheck).toBeDefined();
    expect(metabolismCheck?.passed).toBe(true);
    expect(metabolismCheck?.location.file).toBe('src/redqueen/metabolism/cellular_vitality.ts');

    const graphCheck = auditReport.checks.find(c => c.subsystem === SubsystemCategory.COGNITIVE_GRAPH);
    expect(graphCheck).toBeDefined();
    expect(graphCheck?.passed).toBe(true);
    expect(graphCheck?.location.file).toBe('src/redqueen/cognition/representation/graph.ts');
  });

  it('restores operability when anomalies are remediated and lockdown is reset', () => {
    const anomalyId = integrity.registerAnomaly({
      severity: AnomalySeverity.MAJOR,
      subsystem: SubsystemCategory.HDC_VECTOR,
      location: {
        file: 'src/redqueen/cognition/hdc.ts',
        line: 88,
        functionOrClass: 'AssociativeItemMemory.probe'
      },
      message: 'Vector Dimension Inconsistency: Expected 4096, found 2048'
    });

    expect(integrity.isSystemOperable()).toBe(false);

    // Remediate the anomaly
    const resolved = integrity.remediateAnomaly(anomalyId, 'Rescaled memory vector to 4096-bit slab');
    expect(resolved).toBe(true);

    // Reset lockdown
    integrity.resetLockdownAfterRepair();
    expect(integrity.isSystemOperable()).toBe(true);
    expect(() => integrity.assertOperable('hdc.query')).not.toThrow();
  });

  it('guards cell operations and denies execution under lockdown', async () => {
    const cellStateFile = path.join(tmpDir, 'cell_locked.json');
    const cell = new Cell(cellStateFile, 'secret_locked');

    // Trigger lockdown on cell integrity
    cell.integrity.registerAnomaly({
      severity: AnomalySeverity.CRITICAL,
      subsystem: SubsystemCategory.MEMORY_STORE,
      location: {
        file: 'src/redqueen/memory/json_file_store.ts',
        line: 45,
        functionOrClass: 'JsonFileMemoryStore'
      },
      message: 'Memory referential integrity failure'
    });

    // metabolize must fail fast
    await expect(cell.metabolize({
      sourceType: 'LOCAL_DATA',
      content: 'test observation'
    })).rejects.toThrow(SystemIntegrityLockdownError);

    // Clean up
    cell.integrity.resetLockdownAfterRepair();
  });

  it('guarantees cognitive graph referential consistency and zero orphaned relations under repeated stream ingestions', async () => {
    const cellStateFile = path.join(tmpDir, 'cell_stream_integrity.json');
    const cell = new Cell(cellStateFile, 'secret_stream_integrity');

    // Run repeated ingestions with duplicate subjects and concepts
    const stream = cell.neuroSymbolic.perceptualStream;
    await stream.ingestRawStream('Integritas sistem memverifikasi validitas data secara real-time', { domain: 'SYSTEM_AUDIT' });
    await stream.ingestRawStream('Integritas sistem memverifikasi validitas data secara real-time', { domain: 'SYSTEM_AUDIT' });
    await stream.ingestRawStream('Sistem kognitif menjaga kestabilan memori tanpa kompromi', { domain: 'SYSTEM_AUDIT' });

    // Referential consistency audit must pass with 0 errors
    const auditReport = await cell.integrity.runDeepSystemAudit(cell);
    expect(auditReport.failedChecks).toBe(0);
    expect(auditReport.passed).toBe(true);

    const graphCheck = auditReport.checks.find(c => c.subsystem === SubsystemCategory.COGNITIVE_GRAPH);
    expect(graphCheck?.passed).toBe(true);
    expect(graphCheck?.error).toBeUndefined();

    // Verify all relations in graph have valid subject and object
    const graph = cell.cognitiveGraph;
    const concepts = new Set(graph.getAllConcepts().map(c => c.conceptId));
    for (const rel of graph.getAllRelations()) {
      expect(concepts.has(rel.subjectConceptId)).toBe(true);
      expect(concepts.has(rel.objectConceptId)).toBe(true);
    }
  });
});

