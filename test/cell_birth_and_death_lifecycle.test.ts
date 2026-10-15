import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Cell } from '../src/redqueen/core/cell';
import { CellState } from '../src/redqueen/core/lifecycle';
import { CellVitalityState } from '../src/redqueen/metabolism/types';
import { MemoryCategory } from '../src/redqueen/memory/store';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import { AuthorizationProof, StaticTrustAnchor } from '../src/redqueen/reproduction/types';
import { populationCycleEngine } from '../src/redqueen/evolution/population-cycle';

const TEST_DIR = path.join(process.cwd(), 'data', 'test_cell_birth_death_empirical');

function createAuthProof(parentCellId: string, eventId: string, issuerKp: { privateKey: string; publicKey: string }): AuthorizationProof {
  const payload = {
    action: 'reproduce',
    subject: parentCellId,
    eventId,
    exp: Date.now() + 60000,
    issuer: 'redqueen-root'
  };
  const signature = identityCrypto.signData(issuerKp.privateKey, JSON.stringify(payload));
  return {
    payload,
    signature,
    issuerPublicKey: issuerKp.publicKey
  };
}

describe('Empirical Verification: Cell Birth (Mitosis) and Cell Death (Apoptosis & Lifecycle Termination)', () => {
  let rootAuthorityKp: { privateKey: string; publicKey: string };
  let trustAnchor: StaticTrustAnchor;
  let parentCell: Cell;
  let childCell: Cell | undefined;

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });

    rootAuthorityKp = identityCrypto.generateKeyPair();
    trustAnchor = new StaticTrustAnchor([
      { issuer: 'redqueen-root', publicKey: rootAuthorityKp.publicKey }
    ]);

    parentCell = new Cell(
      path.join(TEST_DIR, 'parent_cell.json'),
      'test-api-key',
      undefined,
      undefined,
      undefined,
      {
        specialization: 'cognitive_adaptation',
        capabilities: ['INFO_PROCESSING', 'KNOWLEDGE_QUERY'],
        reproductionPolicy: {
          populationCeiling: 10,
          cooldownMs: 0,
          requireAuthorization: true,
          minMemoryPressure: 0.0
        },
        trustAnchor
      }
    );

    await parentCell.memory.initialize();

    // Berikan memori awal pada sel induk (berbobot tinggi dan berbobot rendah)
    await parentCell.memory.put({
      id: 'core_concept_emergence',
      cellId: parentCell.nodeId,
      category: MemoryCategory.SEMANTIC,
      type: 'COGNITIVE_CONCEPT',
      content: {
        conceptId: 'concept_emergence',
        name: 'Autonomous Cognitive Emergence',
        originatingCellId: parentCell.nodeId,
        currentHolderCellId: parentCell.nodeId,
        confidence: 0.98
      },
      confidence: 0.98,
      hash: 'hash_core_emergence',
      provenance: [parentCell.nodeId],
      source: 'evolution',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await parentCell.memory.put({
      id: 'transient_noise',
      cellId: parentCell.nodeId,
      category: MemoryCategory.EPISODIC,
      content: 'Unconfirmed sensory noise',
      confidence: 0.15,
      hash: 'hash_noise',
      provenance: [parentCell.nodeId],
      source: 'sensor_raw',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await parentCell.start();
  });

  afterEach(async () => {
    try {
      if (childCell && childCell.lifecycle.getState() !== CellState.STOPPED) {
        await childCell.stop();
      }
      if (parentCell && parentCell.lifecycle.getState() !== CellState.STOPPED) {
        await parentCell.stop();
      }
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  it('Fase 1: KELAHIRAN SEL (Cell Birth / Mitosis) - Isolasi Identitas, Pewarisan Memori, dan Silsilah', async () => {
    expect(parentCell.lifecycle.getState()).toBe(CellState.ACTIVE);
    const parentNodeIdBefore = parentCell.nodeId;
    const parentGenBefore = parentCell.genome.generation;

    const eventId = `mitosis_birth_${Date.now()}`;
    const proof = createAuthProof(parentCell.nodeId, eventId, rootAuthorityKp);

    // Eksekusi kelahiran sel anak
    const { result, child } = await parentCell.reproduce({
      authorizationProof: proof,
      reproductionSeed: eventId,
      specializationBias: 'neural_specialist'
    });

    expect(result.success).toBe(true);
    expect(child).toBeDefined();
    childCell = child!;

    // 1. Identitas Sel Anak Benar-Benar Baru dan Terisolasi secara Kriptografis
    expect(childCell.nodeId).not.toBe(parentNodeIdBefore);
    expect(childCell.publicKey).not.toBe(parentCell.publicKey);

    // 2. Garis Keturunan (Lineage) Terhubung dengan Valid
    expect(childCell.lineage.parentCellId).toBe(parentNodeIdBefore);
    expect(childCell.genome.parentCellId).toBe(parentNodeIdBefore);
    expect(childCell.genome.generation).toBe(parentGenBefore + 1);
    expect(childCell.lineage.lineageId).toBe(parentCell.lineage.lineageId);

    // 3. Pewarisan Memori Selektif: Memori inti diwariskan, memori sampah/rendah ditinggalkan
    const childMemories = await childCell.memory.search({});
    const inheritedCore = childMemories.find(m => m.id === 'core_concept_emergence');
    const abandonedNoise = childMemories.find(m => m.id === 'transient_noise');

    expect(inheritedCore).toBeDefined();
    expect(inheritedCore?.cellId).toBe(childCell.nodeId);
    expect(inheritedCore?.content.originatingCellId).toBe(parentNodeIdBefore);
    expect(abandonedNoise).toBeUndefined(); // Noise berbobot 0.15 tereliminasi

    // 4. Sel Anak Lahir dengan Metabolisme Vitality Utuh (ATP Pool Optimal)
    const childVitality = childCell.neuroSymbolic.vitality;
    expect(childVitality).toBeDefined();
    expect(childVitality.getState().state).toBe(CellVitalityState.OPTIMAL);
    expect(childVitality.getState().atp).toBeGreaterThanOrEqual(100);

    // 5. Sel Induk Mencatat Kelahiran dan Menambah Keturunan
    const parentStatus = parentCell.getStatus();
    expect(parentStatus.mitosis.descendantsCount).toBe(1);
    expect(parentStatus.mitosis.lastReproductionEvent).toBe(eventId);
  });

  it('Fase 2: INTERAKSI SINAPTIK - Koneksi Saraf Makro Terbentuk Saat Sel Anak Hidup', async () => {
    const eventId = `mitosis_conn_${Date.now()}`;
    const proof = createAuthProof(parentCell.nodeId, eventId, rootAuthorityKp);
    const { child } = await parentCell.reproduce({
      authorizationProof: proof,
      reproductionSeed: eventId
    });
    childCell = child!;
    await childCell.start();

    // Daftarkan sinapsis makro antarsel (Parent <-> Child)
    const synToChild = parentCell.synapticNetwork.registerSynapse(childCell.nodeId, 0.5, 1.0);
    const synToParent = childCell.synapticNetwork.registerSynapse(parentCell.nodeId, 0.5, 1.0);

    expect(synToChild.weight).toBe(0.5);
    expect(synToParent.weight).toBe(0.5);

    // Transmisi pulsa aktivasi dari Parent ke Child
    const testPulse = new Float32Array([0.8, -0.4, 0.6, 0.1]);
    const pulses = parentCell.synapticNetwork.propagateActivationPulse(testPulse);
    const pulseForChild = pulses.find(p => p.targetCellId === childCell!.nodeId);

    expect(pulseForChild).toBeDefined();
    expect(pulseForChild?.signalMagnitude).toBeGreaterThan(0);

    // Child merespon balik pulsa dengan umpan balik STDP
    const feedback = childCell.synapticNetwork.handleIncomingPulse({
      pulseId: 'test_pulse_01',
      sourceCellId: parentCell.nodeId,
      targetCellId: childCell.nodeId,
      activationVector: Array.from(testPulse),
      timestamp: Date.now() - 5, // Selang kausal 5ms
      conductance: 1.0
    });

    expect(feedback.sourceCellId).toBe(childCell.nodeId);
    expect(feedback.isPotentiated).toBe(true);
    expect(feedback.deltaWeight).toBeGreaterThan(0); // Long-Term Potentiation (LTP)
  });

  it('Fase 3: KEMATIAN SEL (Cell Starvation & Apoptosis Risk) - Respon Proteksi Internal', async () => {
    const eventId = `mitosis_starve_${Date.now()}`;
    const proof = createAuthProof(parentCell.nodeId, eventId, rootAuthorityKp);
    const { child } = await parentCell.reproduce({
      authorizationProof: proof,
      reproductionSeed: eventId
    });
    childCell = child!;
    await childCell.start();

    const childVitality = childCell.neuroSymbolic.vitality;

    // 1. Konsumsi ATP secara drastis hingga mendekati kematian energi (Starvation & Critical Apoptosis)
    // Habiskan 90 ATP dari total 100 ATP
    childVitality.consumeAtp(90, 'EXTREME_COGNITIVE_OVEREXERTION');
    const snapshotAfterDrain = childVitality.getSnapshot();

    expect(snapshotAfterDrain.atpPool).toBeLessThanOrEqual(15);
    expect(['STARVATION', 'CRITICAL_APOPTOSIS_RISK']).toContain(snapshotAfterDrain.vitalityState);

    // 2. Mekanisme Bertahan Hidup Biologis (Survival Restructuring):
    // Mode penalaran beralih dari eksploratif menjadi EMERGENCY_MINIMAL untuk mencegah kematian
    const restructureReport = childVitality.restructureReasoningPathways({
      hypothesisPruner: () => 2
    });

    expect(restructureReport.targetReasoningMode).toBe('EMERGENCY_MINIMAL');
    expect(restructureReport.hypothesesPrunedCount).toBe(2);

    // Daur ulang limbah katabolik (Autophagy) otomatis menyumbang ATP darurat
    expect(childVitality.getSnapshot().atpPool).toBeGreaterThanOrEqual(snapshotAfterDrain.atpPool);
  });

  it('Fase 4: KEMATIAN TOTAL & PENGARUH PADA JARINGAN / POPULASI (Natural Selection & Synaptic Depression)', async () => {
    const eventId = `mitosis_death_${Date.now()}`;
    const proof = createAuthProof(parentCell.nodeId, eventId, rootAuthorityKp);
    const { child } = await parentCell.reproduce({
      authorizationProof: proof,
      reproductionSeed: eventId
    });
    childCell = child!;
    await childCell.start();

    // 1. Sel Anak mengalami Kematian Fisik / Penghentian Siklus Hidup (Cell Termination)
    expect(childCell.lifecycle.getState()).toBe(CellState.ACTIVE);
    await childCell.stop();
    expect(childCell.lifecycle.getState()).toBe(CellState.STOPPED);

    // 2. Hubungan Sinapsis ke Sel Mati Mengalami Depresi & Pelemahan
    // Parent mendaftarkan sinapsis ke sel anak yang telah mati
    const syn = parentCell.synapticNetwork.registerSynapse(childCell.nodeId, 0.5, 1.0);
    const weightBefore = syn.weight;

    // Ketika sinyal dikirimkan ke sel yang mati atau tugas gagal, koneksi didepresiasi (penalti)
    parentCell.synapticNetwork.applyTaskReinforcement(childCell.nodeId, 0.8, false);
    expect(syn.weight).toBeLessThan(weightBefore); // Bobot melemah ke sel yang tidak responsif

    // 3. Seleksi Alam Generasi Evolusi (Population Selection Culling)
    // Sel mati / sel berkinerja rendah dieliminasi dari penyintas populasi
    const cycleResult = populationCycleEngine.executeCycle([parentCell, childCell], {
      currentGeneration: 0,
      selectionCount: 1, // Hanya 1 sel terkuat yang bertahan
      evaluationInputs: {
        [parentCell.nodeId]: { operationalConfidence: 0.95, reliabilityScore: 0.92, conceptCount: 15 },
        [childCell.nodeId]: { operationalConfidence: 0.05, reliabilityScore: 0.02, conceptCount: 0 } // Sel mati
      }
    });

    // Sel Induk yang sehat dan hidup terpilih sebagai penyintas
    expect(cycleResult.survivingCellIds.length).toBe(1);
    expect(cycleResult.survivingCellIds[0]).toBe(parentCell.nodeId);
    // Sel Anak yang mati tereliminasi dari survivingCells
    expect(cycleResult.survivingCellIds).not.toContain(childCell.nodeId);
  });
});
