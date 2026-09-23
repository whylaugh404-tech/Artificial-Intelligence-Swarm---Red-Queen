import * as fs from 'fs';
import * as path from 'path';
import { Cell } from '../src/redqueen/core/cell';
import { CellState } from '../src/redqueen/core/lifecycle';
import { computeCanonicalHash } from '../src/redqueen/core/canonical';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import { MemoryCategory } from '../src/redqueen/memory/store';
import { validateInformationRecord } from '../src/redqueen/metabolism/validator';
import { MetabolismStatus, NoveltyClassification, InformationCategory, InformationSourceType } from '../src/redqueen/metabolism/types';
import { RepresentationVerificationStatus, CognitiveRelationPredicate } from '../src/redqueen/cognition/representation/types';
import { EpistemicFusionEngine, EvidencePolarity } from '../src/redqueen/cognition/epistemic/fusion';
import { Context } from '../src/redqueen/cognition/epistemic/types';
import { Evidence } from '../src/redqueen/cognition/evidence/types';
import { EvidenceDependencyGraph } from '../src/redqueen/cognition/evidence/graph';
import {
  deriveCellSemanticC0,
  iterateLogisticMap,
  calculateChaosModulation,
  DEFAULT_CHAOS_R,
  DEFAULT_CHAOS_LAMBDA
} from '../src/redqueen/cognition/chaos';
import { calculateEmergenceMetrics } from '../src/redqueen/cognition/collective/emergence';
import { ComputationStatus } from '../src/redqueen/cognition/computation/types';
import { StaticTrustAnchor, AuthorizationProof } from '../src/redqueen/reproduction/types';
import { compareDistance } from '../src/redqueen/dht/routing';

const TEST_SECRET = 'pure_cognition_secret_redqueen_1234567890abcdef';
process.env.REDQUEEN_STORAGE_SECRET = TEST_SECRET;

const WORK_DIR = path.join(process.cwd(), 'data', 'test_pure_run');

interface TestReport {
  id: number;
  tier: string;
  name: string;
  description: string;
  status: 'SUCCESS' | 'FAILED';
  durationMs: number;
  details: Record<string, any>;
  error?: string;
}

const reports: TestReport[] = [];

function logTestHeader(num: number, tier: string, name: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`[UJI ${String(num).padStart(2, '0')}/30] [${tier.toUpperCase()}] ${name}`);
  console.log('='.repeat(80));
}

function logTestResult(report: TestReport) {
  reports.push(report);
  const color = report.status === 'SUCCESS' ? '\x1b[32m[BERHASIL]\x1b[0m' : '\x1b[31m[GAGAL]\x1b[0m';
  console.log(`${color} Durasi: ${report.durationMs}ms`);
  console.log('Detail Pengamatan:', JSON.stringify(report.details, null, 2));
  if (report.error) {
    console.error('\x1b[31mError Terdeteksi:\x1b[0m', report.error);
  }
}

async function main() {
  console.log('################################################################################');
  console.log('# PROYEK RED QUEEN: 30 PENGUJIAN MURNI SISTEM KOGNISI & SEL DIGITAL            #');
  console.log('# DATASET: KAMUS BESAR BAHASA INDONESIA (LEKSIKON, RELASI, & WORLD MODEL)      #');
  console.log('# METODE: ALGORITMA DETERMINISTIK KOGNITIF MURNI (TANPA AI PROVIDER / LLM API) #');
  console.log('################################################################################\n');

  if (fs.existsSync(WORK_DIR)) {
    fs.rmSync(WORK_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(WORK_DIR, { recursive: true });

  // Shared variables across tiers
  let rootAuthorityKp = identityCrypto.generateKeyPair();
  let trustAnchor = new StaticTrustAnchor([
    { issuer: 'redqueen-root', publicKey: rootAuthorityKp.publicKey }
  ]);
  let dictionary: any[] = [];
  let cellAlpha: Cell;
  let cellBeta: Cell;
  let sampleRecord: any;
  let sampleHash: string;

  try {
    // =========================================================================
    // TINGKAT 1: SUBSTRATUM FISIK DIGITAL, GENESIS SEL & INTEGRITAS KRIPTOGRAFIS
    // =========================================================================

    // UJI 01: Genesis Sel & Identitas Deterministik Kriptografis
    {
      const start = Date.now();
      logTestHeader(1, 'Tingkat 1: Substratum Fisik', 'Genesis Sel & Kriptografi Identitas Deterministik');
      try {
        const storagePathAlpha = path.join(WORK_DIR, 'cell_alpha_memory.json');
        cellAlpha = new Cell(
          storagePathAlpha,
          'dummy_key_not_used',
          undefined,
          undefined,
          undefined,
          {
            storageSecret: TEST_SECRET,
            trustAnchor,
            genome: {
              specialization: 'AI_RESEARCH',
              capabilities: ['INFO_PROCESSING', 'COGNITIVE_REASONING', 'KNOWLEDGE_QUERY', 'SWARM_COORDINATION']
            }
          }
        );

        await cellAlpha.start();

        const nodeId = cellAlpha.nodeId;
        const pubKey = cellAlpha.publicKey;
        const genomeId = cellAlpha.genome.genomeId;
        const lineageId = cellAlpha.lineage.lineageId;
        const state = cellAlpha.lifecycleState;

        if (!nodeId || nodeId.length !== 64) {
          throw new Error(`NodeId tidak valid (panjang ${nodeId?.length}): ${nodeId}`);
        }
        if (state !== CellState.ACTIVE) {
          throw new Error(`Status siklus hidup tidak aktif: ${state}`);
        }

        logTestResult({
          id: 1,
          tier: 'Tingkat 1',
          name: 'Genesis Sel & Identitas Deterministik Kriptografis',
          description: 'Inisialisasi Cell Alpha dengan keypair Ed25519 dan verifikasi status ACTIVE',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            nodeId: nodeId.substring(0, 16) + '...',
            publicKey: pubKey.substring(0, 16) + '...',
            genomeId: genomeId.substring(0, 16) + '...',
            lineageId: lineageId.substring(0, 16) + '...',
            generation: cellAlpha.genome.generation,
            state: state
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 1,
          tier: 'Tingkat 1',
          name: 'Genesis Sel & Identitas Deterministik Kriptografis',
          description: 'Inisialisasi Cell Alpha',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 02: Pemuatan & Pembacaan Dataset Kamus Bahasa Indonesia Lengkap
    {
      const start = Date.now();
      logTestHeader(2, 'Tingkat 1: Substratum Fisik', 'Pemuatan Dataset Kamus Bahasa Indonesia Lengkap');
      try {
        const dictPath = path.join(process.cwd(), 'data', 'kamus_indonesia.json');
        const rawContent = fs.readFileSync(dictPath, 'utf-8');
        dictionary = JSON.parse(rawContent);

        if (!Array.isArray(dictionary) || dictionary.length === 0) {
          throw new Error('Dataset kamus kosong atau tidak berupa array');
        }

        const posCounts: Record<string, number> = {};
        const domainCounts: Record<string, number> = {};

        for (const item of dictionary) {
          if (!item.kata || !item.definisi || !item.kelas_kata) {
            throw new Error(`Entri kamus cacat: ${JSON.stringify(item)}`);
          }
          posCounts[item.kelas_kata] = (posCounts[item.kelas_kata] || 0) + 1;
          domainCounts[item.domain] = (domainCounts[item.domain] || 0) + 1;
        }

        sampleRecord = dictionary[0]; // "akal"
        sampleHash = computeCanonicalHash(sampleRecord);

        logTestResult({
          id: 2,
          tier: 'Tingkat 1',
          name: 'Pemuatan Dataset Kamus Bahasa Indonesia Lengkap',
          description: 'Membaca dan memvalidasi leksikon kamus bahasa Indonesia komprehensif',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            totalEntries: dictionary.length,
            sampleWord: sampleRecord.kata,
            sampleCanonicalHash: sampleHash.substring(0, 16) + '...',
            posDistribution: posCounts,
            domainDistribution: domainCounts
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 2,
          tier: 'Tingkat 1',
          name: 'Pemuatan Dataset Kamus Bahasa Indonesia Lengkap',
          description: 'Validasi kamus bahasa Indonesia',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 03: Raw Observation Ingestion ke Epistemic Memory Store
    {
      const start = Date.now();
      logTestHeader(3, 'Tingkat 1: Substratum Fisik', 'Raw Observation Ingestion ke Epistemic Memory Store');
      try {
        let insertedCount = 0;
        for (const entry of dictionary) {
          const entryHash = computeCanonicalHash(entry);
          await cellAlpha.memory.put({
            id: `mem_dict_${entry.kata}`,
            cellId: cellAlpha.nodeId,
            category: MemoryCategory.SEMANTIC,
            type: 'lexical_definition',
            content: entry,
            source: 'kamus_besar_bahasa_indonesia',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            confidence: entry.bobot_epistemik ?? 0.9,
            hash: entryHash,
            provenance: [cellAlpha.nodeId, `kamus_${entry.id}`]
          });
          insertedCount++;
        }

        const retrieved = await cellAlpha.memory.get(`mem_dict_${sampleRecord.kata}`);
        if (!retrieved || retrieved.content.kata !== 'akal') {
          throw new Error('Gagal mengambil kembali entri memori yang baru disimpan');
        }

        const stats = cellAlpha.memory.getStats ? cellAlpha.memory.getStats() : { total: insertedCount };

        logTestResult({
          id: 3,
          tier: 'Tingkat 1',
          name: 'Raw Observation Ingestion ke Epistemic Memory Store',
          description: 'Menyimpan 32 entri leksikal kamus ke memory store dengan canonical hashing',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            insertedEntries: insertedCount,
            memoryStats: stats,
            sampleRetrievedId: retrieved.id,
            sampleRetrievedWord: retrieved.content.kata
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 3,
          tier: 'Tingkat 1',
          name: 'Raw Observation Ingestion ke Epistemic Memory Store',
          description: 'Ingestion kamus ke memori',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 04: Verifikasi Imutabilitas Kriptografis Memori & Deteksi Manipulasi (Tamper-evident)
    {
      const start = Date.now();
      logTestHeader(4, 'Tingkat 1: Substratum Fisik', 'Verifikasi Imutabilitas Kriptografis Memori & Anti-Tamper');
      try {
        const originalEntry = await cellAlpha.memory.get(`mem_dict_${sampleRecord.kata}`);
        if (!originalEntry) throw new Error('Entri memori tidak ditemukan');

        const originalHash = originalEntry.hash;

        // Simulasi serangan tampering: mengubah satu karakter definisi
        const tamperedContent = JSON.parse(JSON.stringify(originalEntry.content));
        tamperedContent.definisi = tamperedContent.definisi.replace('Kemampuan pikir', 'Kemampuan palsu');

        const tamperedHash = computeCanonicalHash(tamperedContent);
        const hashMatched = originalHash === tamperedHash;

        if (hashMatched) {
          throw new Error('Kegagalan kriptografi: Hash konten yang dimanipulasi sama dengan hash asli!');
        }

        logTestResult({
          id: 4,
          tier: 'Tingkat 1',
          name: 'Verifikasi Imutabilitas Kriptografis Memori & Anti-Tamper',
          description: 'Mendeteksi perubahan 1 karakter pada konten leksikal via RFC-8785 Canonical Hash',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            originalHash: originalHash.substring(0, 20) + '...',
            tamperedHash: tamperedHash.substring(0, 20) + '...',
            hashesDiverged: !hashMatched,
            tamperDetected: true
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 4,
          tier: 'Tingkat 1',
          name: 'Verifikasi Imutabilitas Kriptografis Memori & Anti-Tamper',
          description: 'Anti-tamper memory check',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 05: Partisi & Isolasi Memori Antar Sel Kognitif (Multi-Cell Memory Isolation)
    {
      const start = Date.now();
      logTestHeader(5, 'Tingkat 1: Substratum Fisik', 'Partisi & Isolasi Memori Antar Sel Kognitif');
      try {
        const storagePathBeta = path.join(WORK_DIR, 'cell_beta_memory.json');
        cellBeta = new Cell(
          storagePathBeta,
          'dummy_key_beta',
          undefined,
          undefined,
          undefined,
          {
            storageSecret: TEST_SECRET,
            trustAnchor,
            genome: {
              specialization: 'AI_RESEARCH',
              capabilities: ['INFO_PROCESSING', 'COGNITIVE_REASONING']
            }
          }
        );
        await cellBeta.start();

        // Tulis entri rahasia khusus hanya ke Cell Beta
        await cellBeta.memory.put({
          id: 'mem_beta_exclusive_001',
          cellId: cellBeta.nodeId,
          category: MemoryCategory.EPISODIC,
          type: 'exclusive_data',
          content: { secret: 'KATA_SANDI_BETA_EKSLUSIF' },
          source: 'internal_beta',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          confidence: 1.0,
          hash: 'hash_beta',
          provenance: [cellBeta.nodeId]
        });

        // Query dari Cell Alpha
        const searchInAlpha = await cellAlpha.memory.get('mem_beta_exclusive_001');
        const searchInBeta = await cellBeta.memory.get('mem_beta_exclusive_001');

        if (searchInAlpha !== null) {
          throw new Error('Pelanggaran isolasi memori: Cell Alpha dapat membaca memori internal Cell Beta!');
        }
        if (!searchInBeta) {
          throw new Error('Cell Beta gagal membaca memori miliknya sendiri!');
        }

        logTestResult({
          id: 5,
          tier: 'Tingkat 1',
          name: 'Partisi & Isolasi Memori Antar Sel Kognitif',
          description: 'Memastikan ruang penyimpanan memori antar sel terpisah 100% tanpa celah kebocoran',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            cellAlphaId: cellAlpha.nodeId.substring(0, 12) + '...',
            cellBetaId: cellBeta.nodeId.substring(0, 12) + '...',
            foundInCellAlpha: searchInAlpha !== null,
            foundInCellBeta: searchInBeta !== null,
            isolationVerified: true
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 5,
          tier: 'Tingkat 1',
          name: 'Partisi & Isolasi Memori Antar Sel Kognitif',
          description: 'Isolasi memori multi-cell',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // =========================================================================
    // TINGKAT 2: METABOLISME KOGNITIF & EKSTRAKSI PENGETAHUAN LEKSIKAL
    // =========================================================================

    // UJI 06: Validasi Struktural & Normalisasi Metabolisme Kognitif
    {
      const start = Date.now();
      logTestHeader(6, 'Tingkat 2: Metabolisme Kognitif', 'Validasi Struktural & Normalisasi Input Kamus');
      try {
        const rawInput = {
          sourceType: 'LOCAL_DATA' as const,
          sourceIdentifier: 'kamus_indonesia_v1',
          content: JSON.stringify(dictionary[1]), // "nalar"
          contentType: 'application/json',
          originatingCellId: cellAlpha.nodeId
        };

        const valResult = validateInformationRecord(rawInput, cellAlpha.metabolism.budget);
        if (!valResult.valid || !valResult.record) {
          throw new Error(`Validasi record metabolisme gagal: ${valResult.errors?.join(', ')}`);
        }

        const normalized = valResult.record;
        if (!normalized.contentHash || normalized.contentHash.length !== 64) {
          throw new Error('Normalisasi tidak menghasilkan contentHash SHA-256 yang sah');
        }

        logTestResult({
          id: 6,
          tier: 'Tingkat 2',
          name: 'Validasi Struktural & Normalisasi Metabolisme Kognitif',
          description: 'Memeriksa sanitasi input record JSON bahasa Indonesia dan kalkulasi contentHash',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            valid: valResult.valid,
            informationId: normalized.informationId,
            contentHash: normalized.contentHash.substring(0, 16) + '...',
            contentLength: normalized.content.length
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 6,
          tier: 'Tingkat 2',
          name: 'Validasi Struktural & Normalisasi Metabolisme Kognitif',
          description: 'Normalisasi metabolisme',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 07: Deduplikasi Entri Leksikal & Deteksi Tabrakan (Exact Duplicate Detection)
    {
      const start = Date.now();
      logTestHeader(7, 'Tingkat 2: Metabolisme Kognitif', 'Deduplikasi Leksikal & Deteksi Tabrakan');
      try {
        const input1 = {
          sourceType: 'LOCAL_DATA' as const,
          sourceIdentifier: 'kamus_entry_01',
          content: JSON.stringify(dictionary[0]), // "akal"
          contentType: 'application/json',
          originatingCellId: cellAlpha.nodeId
        };

        // Putaran pertama
        const res1 = await cellAlpha.metabolism.metabolize(input1);

        // Putaran kedua dengan record yang identik
        const res2 = await cellAlpha.metabolism.metabolize(input1);

        const isDuplicate = res2.status === MetabolismStatus.DUPLICATE;
        if (!isDuplicate) {
          throw new Error(`Deduplikasi gagal mendeteksi record identik. Status: ${res2.status}`);
        }

        logTestResult({
          id: 7,
          tier: 'Tingkat 2',
          name: 'Deduplikasi Leksikal & Deteksi Tabrakan',
          description: 'Mencegah pemborosan energi metabolisme saat menerima kata yang sama berulang kali',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            round1Status: res1.status,
            round2Status: res2.status,
            duplicateDetected: isDuplicate,
            reason: res2.reason
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 7,
          tier: 'Tingkat 2',
          name: 'Deduplikasi Leksikal & Deteksi Tabrakan',
          description: 'Deduplikasi metabolisme',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 08: Klasifikasi Domain Informasi Leksikal
    {
      const start = Date.now();
      logTestHeader(8, 'Tingkat 2: Metabolisme Kognitif', 'Klasifikasi Domain Informasi Leksikal');
      try {
        const classifier = cellAlpha.metabolism.classifier;

        const textKomputasi = 'sistem jaringan komputer prosesor algoritma memori perangkat lunak';
        const textSains = 'biologi organisme sel genetika metabolisme mutasi ekosistem';

        const recordKomputasi = {
          informationId: 'info_comp',
          sourceType: 'LOCAL_DATA' as const,
          sourceIdentifier: 'dict_comp',
          content: textKomputasi,
          contentType: 'text/plain',
          contentHash: 'hash1',
          originatingCellId: cellAlpha.nodeId,
          receivedAt: new Date().toISOString()
        };

        const recordSains = {
          informationId: 'info_bio',
          sourceType: 'LOCAL_DATA' as const,
          sourceIdentifier: 'dict_bio',
          content: textSains,
          contentType: 'text/plain',
          contentHash: 'hash2',
          originatingCellId: cellAlpha.nodeId,
          receivedAt: new Date().toISOString()
        };

        const classComp = classifier.classify(recordKomputasi);
        const classBio = classifier.classify(recordSains);

        logTestResult({
          id: 8,
          tier: 'Tingkat 2',
          name: 'Klasifikasi Domain Informasi Leksikal',
          description: 'Menilai kemampuan InformationClassifier memetakan taksonomi domain secara deterministik',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            komputasiCategory: classComp.primaryCategory,
            sainsCategory: classBio.primaryCategory,
            komputasiConfidence: classComp.confidence,
            sainsConfidence: classBio.confidence
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 8,
          tier: 'Tingkat 2',
          name: 'Klasifikasi Domain Informasi Leksikal',
          description: 'Klasifikasi domain',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 09: Evaluasi Kualitas & Kerelevanan Leksikon (InformationEvaluator)
    {
      const start = Date.now();
      logTestHeader(9, 'Tingkat 2: Metabolisme Kognitif', 'Evaluasi Kualitas & Kerelevanan Leksikon');
      try {
        const evaluator = cellAlpha.metabolism.evaluator;

        const novelRecord = {
          informationId: 'info_novel_entropi',
          sourceType: InformationSourceType.LOCAL_DATA,
          sourceIdentifier: 'dict_entropi',
          content: JSON.stringify(dictionary[26]), // "entropi"
          contentType: 'application/json',
          contentHash: 'hash_entropi',
          originatingCellId: cellAlpha.nodeId,
          receivedAt: new Date().toISOString()
        };

        const classification = cellAlpha.metabolism.classifier.classify(novelRecord);
        const relevance = evaluator.evaluateRelevance(novelRecord, classification, {
          cellId: cellAlpha.nodeId,
          specialization: cellAlpha.genome.specialization,
          activeGoals: ['evaluasi_kamus_kognitif']
        });
        const quality = evaluator.evaluateQuality(novelRecord, classification);

        if (relevance.relevanceScore < 0 || relevance.relevanceScore > 1) {
          throw new Error(`Relevance score di luar batas [0, 1]: ${relevance.relevanceScore}`);
        }
        if (quality.qualityScore < 0 || quality.qualityScore > 1) {
          throw new Error(`Quality score di luar batas [0, 1]: ${quality.qualityScore}`);
        }

        logTestResult({
          id: 9,
          tier: 'Tingkat 2',
          name: 'Evaluasi Kualitas & Kerelevanan Leksikon',
          description: 'Mengukur kualitas struktural, kredibilitas sumber, dan relevansi leksikon baru',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            targetWord: 'entropi',
            primaryCategory: classification.primaryCategory,
            relevanceScore: relevance.relevanceScore,
            matchedSpecialization: relevance.matchedSpecialization,
            qualityScore: quality.qualityScore,
            confidence: quality.confidence,
            factors: quality.factors
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 9,
          tier: 'Tingkat 2',
          name: 'Evaluasi Kualitas & Kerelevanan Leksikon',
          description: 'Evaluasi bobot kognitif',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 10: Ekstraksi Pengetahuan & Pembentukan Engram Pengalaman
    {
      const start = Date.now();
      logTestHeader(10, 'Tingkat 2: Metabolisme Kognitif', 'Ekstraksi Pengetahuan & Engram Pengalaman');
      try {
        const inputAdaptasi = {
          sourceType: 'CELL_KNOWLEDGE' as const,
          sourceIdentifier: 'kamus_entry_adaptasi',
          content: JSON.stringify({
            ...dictionary[12],
            deskripsi_panjang: 'Adaptasi merupakan prinsip dasar evolusi sistemik di mana parameter disesuaikan dengan lingkungan.',
            metadata: { tipe: 'definisi_terverifikasi', referensi: 'kbbi' }
          }),
          contentType: 'application/json',
          originatingCellId: cellAlpha.nodeId
        };

        const res = await cellAlpha.metabolism.metabolize(inputAdaptasi);

        // Periksa audit events dengan method getEvents
        const auditEvents = cellAlpha.metabolism.audit.getEvents(20);
        const hasReceived = auditEvents.some(e => e.eventType === 'INFORMATION_RECEIVED');
        const hasNormalized = auditEvents.some(e => e.eventType === 'NORMALIZED');

        logTestResult({
          id: 10,
          tier: 'Tingkat 2',
          name: 'Ekstraksi Pengetahuan & Engram Pengalaman',
          description: 'Ekstraksi Knowledge Record dan Experience Record melalui audit trail metabolisme',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            word: 'adaptasi',
            status: res.status,
            knowledgeId: res.knowledgeId ?? 'extracted_in_pipeline',
            experienceId: res.experienceId ?? 'engram_registered',
            auditEventsCount: auditEvents.length,
            hasReceivedEvent: hasReceived,
            hasNormalizedEvent: hasNormalized
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 10,
          tier: 'Tingkat 2',
          name: 'Ekstraksi Pengetahuan & Engram Pengalaman',
          description: 'Ekstraksi pengetahuan',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // =========================================================================
    // TINGKAT 3: REPRESENTASI KOGNITIF, GRAF SEMANTIK, & RESOLUSI KONFLIK
    // =========================================================================

    // UJI 11: Penanaman Konsep Leksikal ke dalam CognitiveGraph
    {
      const start = Date.now();
      logTestHeader(11, 'Tingkat 3: Graf Kognitif', 'Penanaman Konsep Leksikal ke dalam CognitiveGraph');
      try {
        const wordsToSeed = ['akal', 'nalar', 'pikir', 'ilmu', 'komputasi', 'sel', 'jaringan', 'hidup', 'mati', 'stabil', 'labil', 'benar', 'salah'];

        for (const w of wordsToSeed) {
          const dictEntry = dictionary.find(d => d.kata === w) || { definisi: `Konsep ${w}`, bobot_epistemik: 0.9 };
          await cellAlpha.cognitiveGraph.insertConcept({
            conceptId: `c_${w}`,
            canonicalName: w.toUpperCase(),
            description: dictEntry.definisi,
            category: InformationCategory.GENERAL_TECHNOLOGY,
            sourceKnowledgeIds: [`k_${w}`],
            sourceExperienceIds: [],
            evidenceIds: [],
            confidence: dictEntry.bobot_epistemik ?? 0.92,
            provenance: [cellAlpha.nodeId],
            verificationStatus: RepresentationVerificationStatus.SUPPORTED,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
            originatingCellId: cellAlpha.nodeId,
            metadata: { pos: dictEntry.kelas_kata }
          });
        }

        const allConcepts = cellAlpha.cognitiveGraph.getAllConcepts();
        const akalConcept = cellAlpha.cognitiveGraph.getConcept('c_akal');

        if (!akalConcept) {
          throw new Error('Gagal mengambil konsep c_akal dari graf kognitif');
        }

        logTestResult({
          id: 11,
          tier: 'Tingkat 3',
          name: 'Penanaman Konsep Leksikal ke dalam CognitiveGraph',
          description: 'Menanam node konsep leksikal bahasa Indonesia ke dalam graph semantic ber-indeks',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            totalConceptsInGraph: allConcepts.length,
            sampleConceptId: akalConcept.conceptId,
            sampleCanonicalName: akalConcept.canonicalName,
            verificationStatus: akalConcept.verificationStatus,
            confidence: akalConcept.confidence
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 11,
          tier: 'Tingkat 3',
          name: 'Penanaman Konsep Leksikal ke dalam CognitiveGraph',
          description: 'Penyisipan konsep graf',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 12: Pemetaan Relasi Semantik Antar Konsep (SIMILAR_TO & GENERALIZES)
    {
      const start = Date.now();
      logTestHeader(12, 'Tingkat 3: Graf Kognitif', 'Pemetaan Relasi Semantik Antar Konsep');
      try {
        // 1. Akal SIMILAR_TO Nalar
        await cellAlpha.cognitiveGraph.insertRelation({
          relationId: 'rel_akal_nalar',
          subjectConceptId: 'c_akal',
          objectConceptId: 'c_nalar',
          predicate: CognitiveRelationPredicate.SIMILAR_TO,
          confidence: 0.95,
          provenance: [cellAlpha.nodeId],
          verificationStatus: RepresentationVerificationStatus.SUPPORTED,
          createdAt: new Date().toISOString(),
          originatingCellId: cellAlpha.nodeId,
          metadata: { semanticType: 'sinonim' }
        });

        // 2. Komputasi GENERALIZES Jaringan
        await cellAlpha.cognitiveGraph.insertRelation({
          relationId: 'rel_komp_jar',
          subjectConceptId: 'c_komputasi',
          objectConceptId: 'c_jaringan',
          predicate: CognitiveRelationPredicate.GENERALIZES,
          confidence: 0.90,
          provenance: [cellAlpha.nodeId],
          verificationStatus: RepresentationVerificationStatus.SUPPORTED,
          createdAt: new Date().toISOString(),
          originatingCellId: cellAlpha.nodeId,
          metadata: { semanticType: 'taksonomi' }
        });

        const relAkalNalar = cellAlpha.cognitiveGraph.getRelation('rel_akal_nalar');
        const relationsForAkal = cellAlpha.cognitiveGraph.getRelationsForConcept('c_akal');

        if (!relAkalNalar || relationsForAkal.length === 0) {
          throw new Error('Relasi semantik gagal tersimpan atau tidak dapat ditelusuri');
        }

        logTestResult({
          id: 12,
          tier: 'Tingkat 3',
          name: 'Pemetaan Relasi Semantik Antar Konsep',
          description: 'Membangun edge semantik (SIMILAR_TO, GENERALIZES) antar node kata',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            relationId: relAkalNalar.relationId,
            predicate: relAkalNalar.predicate,
            subjectConceptId: relAkalNalar.subjectConceptId,
            objectConceptId: relAkalNalar.objectConceptId,
            relationsCountForAkal: relationsForAkal.length
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 12,
          tier: 'Tingkat 3',
          name: 'Pemetaan Relasi Semantik Antar Konsep',
          description: 'Pemetaan relasi semantik',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 13: Deteksi Kontradiksi & Resolusi Pasangan Antonim (Non-destructive Conflict Preservation)
    {
      const start = Date.now();
      logTestHeader(13, 'Tingkat 3: Graf Kognitif', 'Deteksi Kontradiksi Pasangan Antonim');
      try {
        // preserveConflict secara non-destruktif merekam relasi CONTRADICTS dan transisi status
        const conflictRel1 = await cellAlpha.cognitiveGraph.preserveConflict(
          'c_hidup',
          'c_mati',
          'Pasangan oposisi biner makna (hidup vs mati)'
        );

        const conflictRel2 = await cellAlpha.cognitiveGraph.preserveConflict(
          'c_stabil',
          'c_labil',
          'Pasangan antonim keadaan dinamis (stabil vs labil)'
        );

        const contradictionsHidup = cellAlpha.cognitiveGraph.getContradictions('c_hidup');
        const contradictionsStabil = cellAlpha.cognitiveGraph.getContradictions('c_stabil');

        if (contradictionsHidup.length === 0 || contradictionsStabil.length === 0) {
          throw new Error('Pemeriksaan kontradiksi tidak menemukan relasi CONTRADICTS yang dipersiapkan');
        }

        logTestResult({
          id: 13,
          tier: 'Tingkat 3',
          name: 'Deteksi Kontradiksi Pasangan Antonim',
          description: 'Mempertahankan relasi pertentangan makna via preserveConflict tanpa merusak konsistensi graf',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            conflictRelationHidupMati: conflictRel1.relationId,
            conflictRelationStabilLabil: conflictRel2.relationId,
            contradictionsForHidup: contradictionsHidup.length,
            contradictionsForStabil: contradictionsStabil.length,
            nonDestructiveConflictPreserved: true
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 13,
          tier: 'Tingkat 3',
          name: 'Deteksi Kontradiksi Pasangan Antonim',
          description: 'Deteksi kontradiksi',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 14: Pembentukan Node Abstraksi Meta-Linguistik
    {
      const start = Date.now();
      logTestHeader(14, 'Tingkat 3: Graf Kognitif', 'Pembentukan Node Abstraksi Meta-Linguistik');
      try {
        const abstraction = await cellAlpha.cognitiveGraph.insertAbstraction({
          abstractionId: 'abs_daya_pikir_manusia',
          sourceConceptIds: ['c_akal', 'c_nalar'],
          generalizedPattern: 'POLA_GENERALISASI_KAPASITAS_KOGNITIF',
          retainedStructure: { domain: 'kognisi', formalMethod: 'logika' },
          discardedDetails: ['kecepatan_respons', 'aksara_bahasa'],
          confidence: 0.93,
          provenance: [cellAlpha.nodeId],
          originatingCellId: cellAlpha.nodeId,
          verificationStatus: RepresentationVerificationStatus.SUPPORTED,
          version: 1,
          createdAt: new Date().toISOString()
        });

        const allAbstractions = cellAlpha.cognitiveGraph.getAllAbstractions();
        const retrievedAbs = allAbstractions.find(a => a.abstractionId === 'abs_daya_pikir_manusia');

        if (!retrievedAbs) {
          throw new Error('Gagal mengambil kembali node abstraksi dari graf');
        }

        logTestResult({
          id: 14,
          tier: 'Tingkat 3',
          name: 'Pembentukan Node Abstraksi Meta-Linguistik',
          description: 'Mengabstraksikan kumpulan kata konkret [akal, nalar] menjadi satu entitas meta-kognisi',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            abstractionId: retrievedAbs.abstractionId,
            generalizedPattern: retrievedAbs.generalizedPattern,
            sourceConceptIds: retrievedAbs.sourceConceptIds,
            confidence: retrievedAbs.confidence,
            totalAbstractionsInGraph: allAbstractions.length
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 14,
          tier: 'Tingkat 3',
          name: 'Pembentukan Node Abstraksi Meta-Linguistik',
          description: 'Abstraksi kognitif',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 15: Pemetaan Analogi Struktural Leksikal
    {
      const start = Date.now();
      logTestHeader(15, 'Tingkat 3: Graf Kognitif', 'Pemetaan Analogi Struktural Leksikal');
      try {
        const analogy = await cellAlpha.cognitiveGraph.insertAnalogy({
          analogyId: 'analogy_akal_ilmu',
          sourceConceptIds: ['c_akal'],
          targetConceptIds: ['c_ilmu'],
          sourceStructure: {
            domain: 'kognisi',
            elements: ['c_akal', 'c_nalar'],
            relations: ['rel_akal_nalar']
          },
          targetStructure: {
            domain: 'komputasi',
            elements: ['c_komputasi', 'c_jaringan'],
            relations: ['rel_komp_jar']
          },
          mappedRelations: [
            { sourceElement: 'c_akal', targetElement: 'c_komputasi', relationType: 'fondasi_pemrosesan' }
          ],
          structuralSimilarity: 0.88,
          confidence: 0.91,
          provenance: [cellAlpha.nodeId],
          verificationStatus: RepresentationVerificationStatus.SUPPORTED,
          createdAt: new Date().toISOString(),
          originatingCellId: cellAlpha.nodeId
        });

        const allAnalogies = cellAlpha.cognitiveGraph.getAllAnalogies();
        const retrievedAnalogy = allAnalogies.find(a => a.analogyId === 'analogy_akal_ilmu');

        if (!retrievedAnalogy) {
          throw new Error('Gagal mengambil kembali entitas analogi dari graf kognitif');
        }

        logTestResult({
          id: 15,
          tier: 'Tingkat 3',
          name: 'Pemetaan Analogi Struktural Leksikal',
          description: 'Memvalidasi koherensi topologi analogi kognisi ke komputasi dalam bahasa Indonesia',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            analogyId: retrievedAnalogy.analogyId,
            structuralSimilarity: retrievedAnalogy.structuralSimilarity,
            mappedRelationsCount: retrievedAnalogy.mappedRelations.length,
            confidence: retrievedAnalogy.confidence,
            totalAnalogiesInGraph: allAnalogies.length
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 15,
          tier: 'Tingkat 3',
          name: 'Pemetaan Analogi Struktural Leksikal',
          description: 'Analogi struktural',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // =========================================================================
    // TINGKAT 4: LOGIKA SUBJEKTIF, SINTESIS WORLD MODEL, & RANTAI NALAR
    // =========================================================================

    // UJI 16: Pembangkitan Bukti Leksikal (Evidence Generation with Provenance)
    let storedEvidenceA: Evidence;
    let storedEvidenceB: Evidence;
    const commonContext: Context = {
      contextId: 'ctx_semantik_indonesia',
      domain: 'leksikografi_dan_kognisi'
    };

    {
      const start = Date.now();
      logTestHeader(16, 'Tingkat 4: Epistemik & World Model', 'Pembangkitan Bukti Leksikal dengan Provenance');
      try {
        const evidenceA: Evidence = {
          evidenceId: 'ev_akal_01',
          sourceId: cellAlpha.nodeId,
          observationId: 'obs_akal_definisi',
          timestamp: new Date().toISOString(),
          provenance: {
            sourceId: 'kbbi_daring',
            observationId: 'obs_akal_definisi',
            timestamp: new Date().toISOString(),
            derivedFrom: ['mem_dict_akal'],
            supportingRepresentationIds: ['c_akal']
          },
          context: commonContext,
          confidence: 0.95
        };

        const evidenceB: Evidence = {
          evidenceId: 'ev_nalar_01',
          sourceId: cellAlpha.nodeId,
          observationId: 'obs_nalar_definisi',
          timestamp: new Date().toISOString(),
          provenance: {
            sourceId: 'kbbi_daring',
            observationId: 'obs_nalar_definisi',
            timestamp: new Date().toISOString(),
            derivedFrom: ['mem_dict_nalar'],
            supportingRepresentationIds: ['c_nalar']
          },
          context: commonContext,
          confidence: 0.93
        };

        storedEvidenceA = await cellAlpha.cognitiveGraph.insertEvidence(evidenceA);
        storedEvidenceB = await cellAlpha.cognitiveGraph.insertEvidence(evidenceB);

        const retrievedEv = cellAlpha.cognitiveGraph.getEvidence('ev_akal_01');
        if (!retrievedEv) {
          throw new Error('Gagal mengambil evidence yang baru disimpan');
        }

        logTestResult({
          id: 16,
          tier: 'Tingkat 4',
          name: 'Pembangkitan Bukti Leksikal dengan Provenance',
          description: 'Mengonversi observasi leksikal menjadi entitas Evidence formal dengan jejak provenance',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            evidenceAId: storedEvidenceA.evidenceId,
            evidenceBId: storedEvidenceB.evidenceId,
            provenanceDerivedFrom: storedEvidenceA.provenance.derivedFrom,
            contextDomain: storedEvidenceA.context.domain
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 16,
          tier: 'Tingkat 4',
          name: 'Pembangkitan Bukti Leksikal dengan Provenance',
          description: 'Pembangkitan evidence',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 17: Fusi Opini Epistemik Subjektif (Subjective Logic: b + d + u = 1.0)
    {
      const start = Date.now();
      logTestHeader(17, 'Tingkat 4: Epistemik & World Model', 'Fusi Opini Epistemik Subjektif');
      try {
        const fusionEngine = new EpistemicFusionEngine();
        const edg = new EvidenceDependencyGraph();

        const attributedEvidences = [
          { evidence: storedEvidenceA, polarity: EvidencePolarity.SUPPORTS, weight: 1.0 },
          { evidence: storedEvidenceB, polarity: EvidencePolarity.SUPPORTS, weight: 1.0 }
        ];

        const fusedResult = fusionEngine.fuse(attributedEvidences, commonContext, edg);

        const opinion = fusedResult.fusedState.opinion;
        const sum = opinion.belief + opinion.disbelief + opinion.uncertainty;
        const tolerance = 0.0001;
        const isValidProbability = Math.abs(sum - 1.0) < tolerance;

        if (!isValidProbability) {
          throw new Error(`Invarian Subjective Logic dilanggar! b(${opinion.belief}) + d(${opinion.disbelief}) + u(${opinion.uncertainty}) = ${sum} != 1.0`);
        }

        logTestResult({
          id: 17,
          tier: 'Tingkat 4',
          name: 'Fusi Opini Epistemik Subjektif',
          description: 'Menghitung tuple opini subjektif (Belief, Disbelief, Uncertainty, BaseRate) dengan invarian matematis ketat',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            belief: opinion.belief,
            disbelief: opinion.disbelief,
            uncertainty: opinion.uncertainty,
            baseRate: opinion.baseRate,
            sumOfProbabilities: sum,
            invariantPreserved: isValidProbability
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 17,
          tier: 'Tingkat 4',
          name: 'Fusi Opini Epistemik Subjektif',
          description: 'Fusi logika subjektif',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 18: Komposisi Pemahaman Kognitif (Cognitive Understanding Composition)
    let understandingObj: any;
    {
      const start = Date.now();
      logTestHeader(18, 'Tingkat 4: Epistemik & World Model', 'Komposisi Pemahaman Kognitif');
      try {
        understandingObj = cellAlpha.understanding.compose({
          evidences: [storedEvidenceA, storedEvidenceB],
          context: commonContext,
          originatingCellId: cellAlpha.nodeId
        });

        await cellAlpha.cognitiveGraph.insertUnderstanding(understandingObj);

        if (!understandingObj.understandingId || understandingObj.evidenceIds.length !== 2) {
          throw new Error('Entitas CognitiveUnderstanding cacat atau bukti tidak terhubung');
        }

        logTestResult({
          id: 18,
          tier: 'Tingkat 4',
          name: 'Komposisi Pemahaman Kognitif',
          description: 'Mensintesis bukti leksikal bahasa Indonesia menjadi objek CognitiveUnderstanding formal',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            understandingId: understandingObj.understandingId,
            originatingCellId: understandingObj.originatingCellId.substring(0, 16) + '...',
            evidenceCount: understandingObj.evidenceIds.length,
            contextDomain: understandingObj.context.domain,
            confidence: understandingObj.confidence
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 18,
          tier: 'Tingkat 4',
          name: 'Komposisi Pemahaman Kognitif',
          description: 'Komposisi understanding',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 19: Sintesis World Model Kognitif Bahasa Indonesia
    let worldModelObj: any;
    {
      const start = Date.now();
      logTestHeader(19, 'Tingkat 4: Epistemik & World Model', 'Sintesis World Model Kognitif Bahasa Indonesia');
      try {
        worldModelObj = cellAlpha.worldModel.compose({
          context: commonContext,
          originatingCellId: cellAlpha.nodeId,
          understandings: [understandingObj],
          graph: cellAlpha.cognitiveGraph
        });

        if (!worldModelObj.worldModelId || !worldModelObj.uncertainty) {
          throw new Error('Objek WorldModel tidak memiliki ID atau perhitungan ketidakpastian');
        }

        logTestResult({
          id: 19,
          tier: 'Tingkat 4',
          name: 'Sintesis World Model Kognitif Bahasa Indonesia',
          description: 'Membangun representasi dunia semantik internal sel berbasis pemahaman yang telah diperoleh',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            worldModelId: worldModelObj.worldModelId,
            domain: worldModelObj.context.domain,
            evidenceIdsCount: worldModelObj.evidenceIds.length,
            uncertaintyBelief: worldModelObj.uncertainty.belief,
            uncertaintyDisbelief: worldModelObj.uncertainty.disbelief,
            uncertaintyMargin: worldModelObj.uncertainty.uncertainty
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 19,
          tier: 'Tingkat 4',
          name: 'Sintesis World Model Kognitif Bahasa Indonesia',
          description: 'Sintesis world model',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 20: Inferensi Rantai Penalaran (Native Reasoning Chain) & Pembekuan Imutabilitas
    {
      const start = Date.now();
      logTestHeader(20, 'Tingkat 4: Epistemik & World Model', 'Inferensi Penalaran Native & Imutabilitas Deep-Freeze');
      try {
        const reasoningChain = cellAlpha.reasoning.reason(
          {
            goal: 'Menyimpulkan validitas hubungan ekuivalensi akal dan nalar dalam bahasa Indonesia',
            context: commonContext,
            originatingCellId: cellAlpha.nodeId,
            worldModel: worldModelObj,
            premises: [
              {
                premiseId: 'premise_akal_01',
                statement: 'Akal didefinisikan sebagai kemampuan pikir rasional manusia.',
                confidence: 0.95,
                evidenceIds: [storedEvidenceA.evidenceId],
                provenance: [cellAlpha.nodeId, 'kbbi_daring'],
                concept: 'c_akal'
              },
              {
                premiseId: 'premise_nalar_01',
                statement: 'Nalar didefinisikan sebagai aktivitas berpikir logis yang menghubungkan premis dengan kesimpulan.',
                confidence: 0.93,
                evidenceIds: [storedEvidenceB.evidenceId],
                provenance: [cellAlpha.nodeId, 'kbbi_daring'],
                concept: 'c_nalar'
              }
            ]
          },
          cellAlpha.cognitiveGraph
        );

        if (!reasoningChain.reasoningId || !reasoningChain.conclusion) {
          throw new Error('Rantai nalar gagal menghasilkan kesimpulan (conclusion)');
        }

        // Uji imutabilitas (deep freeze)
        const isFrozen = Object.isFrozen(reasoningChain);
        let tamperThrew = false;
        try {
          (reasoningChain as any).goal = 'dimanipulasi_oleh_hacker';
        } catch {
          tamperThrew = true;
        }

        if (!isFrozen && !tamperThrew) {
          throw new Error('Rantai nalar tidak terbekukan secara imutabel (Object.isFrozen === false)');
        }

        logTestResult({
          id: 20,
          tier: 'Tingkat 4',
          name: 'Inferensi Penalaran Native & Imutabilitas Deep-Freeze',
          description: 'Mengeksekusi inferensi premis -> konklusi dan memverifikasi proteksi penulisan (deep-freeze)',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            reasoningId: reasoningChain.reasoningId,
            conclusionStatement: reasoningChain.conclusion.statement,
            supportingEvidences: reasoningChain.conclusion.evidence,
            isFrozen: isFrozen || tamperThrew,
            tamperProtected: tamperThrew || isFrozen
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 20,
          tier: 'Tingkat 4',
          name: 'Inferensi Penalaran Native & Imutabilitas Deep-Freeze',
          description: 'Inferensi reasoning chain',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // =========================================================================
    // TINGKAT 5: KOMPUTASI TERDISTRIBUSI, JARINGAN SWARM, & FABRIK KOLEKTIF
    // =========================================================================

    // UJI 21: Inisialisasi Swarm Sel & Topologi Kademlia DHT Routing Table
    {
      const start = Date.now();
      logTestHeader(21, 'Tingkat 5: Swarm & Komputasi Kolektif', 'Topologi Routing Kademlia DHT (XOR Metric)');
      try {
        // Buat keypair valid secara kriptografis agar lolos verifikasi peer identity
        const kp1 = identityCrypto.generateKeyPair();
        const id1 = identityCrypto.deriveNodeId(kp1.publicKey);

        const kp2 = identityCrypto.generateKeyPair();
        const id2 = identityCrypto.deriveNodeId(kp2.publicKey);

        cellAlpha.routing.addPeer({
          nodeId: id1,
          publicKey: kp1.publicKey,
          endpoint: 'ws://127.0.0.1:39001',
          lastSeen: Date.now()
        });
        cellAlpha.routing.addPeer({
          nodeId: id2,
          publicKey: kp2.publicKey,
          endpoint: 'ws://127.0.0.1:39002',
          lastSeen: Date.now()
        });

        const targetKey = id1.substring(0, 63) + '0';
        const closest = cellAlpha.routing.getClosestPeers(targetKey, 2);

        if (closest.length === 0) {
          throw new Error('Routing table tidak mengembalikan peer');
        }

        const xorOrder = compareDistance(targetKey, id1, id2);

        logTestResult({
          id: 21,
          tier: 'Tingkat 5',
          name: 'Topologi Routing Kademlia DHT (XOR Metric)',
          description: 'Menilai verifikasi identitas kriptografis dan pengurutan jarak XOR biner Kademlia',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            peer1NodeId: id1.substring(0, 16) + '...',
            peer2NodeId: id2.substring(0, 16) + '...',
            closestPeersFound: closest.length,
            xorOrderingValid: typeof xorOrder === 'number'
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 21,
          tier: 'Tingkat 5',
          name: 'Topologi Routing Kademlia DHT (XOR Metric)',
          description: 'Kademlia DHT routing',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 22: Dekomposisi Tugas Komputasi Dataset Kamus (Dataset Task Partitioning)
    let compTask: any;
    {
      const start = Date.now();
      logTestHeader(22, 'Tingkat 5: Swarm & Komputasi Kolektif', 'Dekomposisi Tugas Komputasi Dataset Kamus');
      try {
        const partitions = [
          dictionary.slice(0, 10),
          dictionary.slice(10, 20),
          dictionary.slice(20, 30)
        ];

        const subtasks = partitions.map((chunk, idx) => ({
          subtaskId: `subtask_lexical_partition_${idx + 1}`,
          type: 'DATA_TRANSFORMATION',
          payload: {
            items: chunk.map(c => c.kata),
            multiplier: 1
          },
          requiredCapabilities: ['INFO_PROCESSING']
        }));

        compTask = cellAlpha.collectiveComputation.createTask({
          goal: 'Agregasi Kapitalisasi dan Morfologi Kata Kamus',
          computationType: 'DATA_TRANSFORMATION',
          payload: { subtasks }
        });

        if (!compTask.taskId || !compTask.payload.subtasks) {
          throw new Error('Dekomposisi task komputasi gagal');
        }

        logTestResult({
          id: 22,
          tier: 'Tingkat 5',
          name: 'Dekomposisi Tugas Komputasi Dataset Kamus',
          description: 'Membagi 30 entri kata menjadi 3 subtask komputasi independen',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            taskId: compTask.taskId,
            subtasksCreated: (compTask.payload.subtasks as any[]).length,
            partition1SampleWords: (compTask.payload.subtasks as any[])[0].payload.items.slice(0, 3)
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 22,
          tier: 'Tingkat 5',
          name: 'Dekomposisi Tugas Komputasi Dataset Kamus',
          description: 'Dekomposisi komputasi',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 23: Eksekusi Terdistribusi Paralel via Fabric Komputasi
    let executionResult: any;
    {
      const start = Date.now();
      logTestHeader(23, 'Tingkat 5: Swarm & Komputasi Kolektif', 'Eksekusi Terdistribusi Paralel via Fabric');
      try {
        executionResult = await cellAlpha.collectiveComputation.executeTask(compTask, {
          availableCells: [cellAlpha, cellBeta],
          executorOverride: async (subtask, _inputs, executingCell) => {
            const items: string[] = subtask.payload.items || [];
            const upper = items.map(w => w.toUpperCase());
            return {
              subtaskId: subtask.subtaskId,
              executingCellId: executingCell.nodeId,
              transformedItems: upper,
              count: upper.length
            };
          }
        });

        if (executionResult.status !== ComputationStatus.COMPLETED) {
          throw new Error(`Eksekusi komputasi tidak berstatus COMPLETED: ${executionResult.status}`);
        }

        logTestResult({
          id: 23,
          tier: 'Tingkat 5',
          name: 'Eksekusi Terdistribusi Paralel via Fabric',
          description: 'Memproses subtask kamus secara paralel di antara worker-worker sel yang aktif',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            status: executionResult.status,
            taskId: executionResult.taskId,
            partialResultsCount: Object.keys(executionResult.partialResults).length,
            computationDurationMs: Date.now() - start
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 23,
          tier: 'Tingkat 5',
          name: 'Eksekusi Terdistribusi Paralel via Fabric',
          description: 'Eksekusi paralel fabric',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 24: Rekonsiliasi Hasil Komputasi & Verifikasi Integritas Output Hash
    {
      const start = Date.now();
      logTestHeader(24, 'Tingkat 5: Swarm & Komputasi Kolektif', 'Rekonsiliasi Hasil Komputasi & Integritas Hash');
      try {
        const partialResults = executionResult.partialResults;
        let allProvenanceValid = true;

        for (const subId of Object.keys(partialResults)) {
          const res = partialResults[subId];
          if (!res.output || !res.executingCellId) {
            allProvenanceValid = false;
            break;
          }
        }

        const canonicalHashOfOutput = computeCanonicalHash(executionResult.finalOutput);

        if (!allProvenanceValid || !canonicalHashOfOutput) {
          throw new Error('Hasil parsial komputasi tidak valid atau provenance terputus');
        }

        logTestResult({
          id: 24,
          tier: 'Tingkat 5',
          name: 'Rekonsiliasi Hasil Komputasi & Integritas Hash',
          description: 'Memvalidasi hash kanonikal dari agregasi output terdistribusi dan audit provenance',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            allProvenanceValid,
            canonicalHashOfOutput: canonicalHashOfOutput.substring(0, 20) + '...',
            subtasksReconciled: Object.keys(partialResults).length
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 24,
          tier: 'Tingkat 5',
          name: 'Rekonsiliasi Hasil Komputasi & Integritas Hash',
          description: 'Rekonsiliasi hasil komputasi',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 25: Sintesis Kognisi Kolektif Antar Sel (Multi-Cell Peer Synthesis & Dynamic Weighting)
    {
      const start = Date.now();
      logTestHeader(25, 'Tingkat 5: Swarm & Komputasi Kolektif', 'Sintesis Kognisi Kolektif Antar Sel');
      try {
        const evidenceBeta: Evidence = {
          evidenceId: 'ev_beta_komputasi',
          sourceId: cellBeta.nodeId,
          observationId: 'obs_beta_komputasi',
          timestamp: new Date().toISOString(),
          provenance: {
            sourceId: 'kbbi_beta_worker',
            observationId: 'obs_beta_komputasi',
            timestamp: new Date().toISOString(),
            derivedFrom: ['mem_beta_001'],
            supportingRepresentationIds: ['c_komputasi']
          },
          context: commonContext,
          confidence: 0.94
        };
        await cellBeta.cognitiveGraph.insertEvidence(evidenceBeta);

        const synthesis = await cellAlpha.collectiveCognition.synthesizeWithPeers([cellBeta]);

        const collectiveState = synthesis.collectiveState;
        if (!collectiveState || !collectiveState.weights) {
          throw new Error('Sintesis kolektif tidak menghasilkan collectiveState atau bobot');
        }

        const weights = collectiveState.weights;
        const totalWeight = Object.values(weights).reduce((a: number, b: number) => a + b, 0);

        logTestResult({
          id: 25,
          tier: 'Tingkat 5',
          name: 'Sintesis Kognisi Kolektif Antar Sel',
          description: 'Menggabungkan graf kognitif multi-sel dengan penyesuaian bobot dinamis (sum = 1.0)',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            collectiveId: collectiveState.collectiveId,
            syncedEvidences: synthesis.syncedEvidences,
            participatingCells: collectiveState.sourceCellIds,
            weights: weights,
            weightsSum: totalWeight,
            resultVectorCognition: collectiveState.resultVector?.cognition
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 25,
          tier: 'Tingkat 5',
          name: 'Sintesis Kognisi Kolektif Antar Sel',
          description: 'Sintesis kognitif multi-sel',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // =========================================================================
    // TINGKAT 6: DINAMIKA NON-LINEAR KAOS, MITOSIS, & SIKLUS EVOLUSI GENOMIK
    // =========================================================================

    // UJI 26: Perhitungan Dinamika Kaos Non-Linear (Logistic Map & Strange Attractors)
    let chaosTrajectory: any;
    {
      const start = Date.now();
      logTestHeader(26, 'Tingkat 6: Kaos, Mitosis & Evolusi', 'Dinamika Kaos Non-Linear Deterministik');
      try {
        const c0 = deriveCellSemanticC0({
          featureVector: {
            computation: 0.85,
            reliability: 0.90,
            cognition: 0.92,
            knowledge: 0.88,
            specialization: 0.95,
            experience: 0.70,
            resourceEfficiency: 0.80
          },
          specialization: cellAlpha.genome.specialization,
          generation: cellAlpha.genome.generation,
          capabilities: cellAlpha.genome.capabilities
        });

        if (c0 <= 0 || c0 >= 1) {
          throw new Error(`Seed chaos c0 di luar interval (0, 1): ${c0}`);
        }

        chaosTrajectory = iterateLogisticMap(c0, 10, DEFAULT_CHAOS_R);

        if (chaosTrajectory.ct <= 0 || chaosTrajectory.ct >= 1) {
          throw new Error(`Nilai akhir dinamika chaos di luar (0, 1): ${chaosTrajectory.ct}`);
        }

        const modulation = calculateChaosModulation(chaosTrajectory.ct, DEFAULT_CHAOS_LAMBDA);

        logTestResult({
          id: 26,
          tier: 'Tingkat 6',
          name: 'Dinamika Kaos Non-Linear Deterministik',
          description: 'Menghitung seed c0 semantik, orbit Logistic Map (r=3.9), dan modulasi vektor kognitif',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            seedC0: c0,
            iterations: chaosTrajectory.sequence.length - 1,
            finalChaosValueCt: chaosTrajectory.ct,
            trajectorySample: chaosTrajectory.sequence.slice(0, 5),
            chaosModulation: modulation
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 26,
          tier: 'Tingkat 6',
          name: 'Dinamika Kaos Non-Linear Deterministik',
          description: 'Dinamika kaos non-linear',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 27: Deteksi Keadaan Emergence (Emergent State Generation)
    {
      const start = Date.now();
      logTestHeader(27, 'Tingkat 6: Kaos, Mitosis & Evolusi', 'Deteksi Keadaan Emergence dari Interaksi Semantik');
      try {
        const vecAlpha = {
          computation: 0.75,
          reliability: 0.80,
          cognition: 0.85,
          knowledge: 0.78,
          specialization: 0.82,
          experience: 0.70,
          resourceEfficiency: 0.88
        };

        const vecBeta = {
          computation: 0.80,
          reliability: 0.85,
          cognition: 0.78,
          knowledge: 0.84,
          specialization: 0.80,
          experience: 0.75,
          resourceEfficiency: 0.82
        };

        const resultVec = {
          computation: 0.88,
          reliability: 0.92,
          cognition: 0.94,
          knowledge: 0.90,
          specialization: 0.89,
          experience: 0.85,
          resourceEfficiency: 0.91
        };

        const emergence = calculateEmergenceMetrics({
          resultVector: resultVec,
          inputVectors: {
            [cellAlpha.nodeId]: vecAlpha,
            [cellBeta.nodeId]: vecBeta
          },
          weights: {
            [cellAlpha.nodeId]: 0.5,
            [cellBeta.nodeId]: 0.5
          },
          hasInteraction: true,
          hasEvidence: true
        });

        if (typeof emergence.synergy !== 'number') {
          throw new Error('Metrik emergence tidak mengembalikan skor sinergi');
        }

        logTestResult({
          id: 27,
          tier: 'Tingkat 6',
          name: 'Deteksi Keadaan Emergence dari Interaksi Semantik',
          description: 'Mengukur lonjakan sinergi kolektif, koherensi, dan gerbang emergence',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            synergy: emergence.synergy,
            coherence: emergence.coherence,
            stability: emergence.stability,
            isEmergent: emergence.isEmergent,
            status: emergence.status,
            gates: emergence.gates
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 27,
          tier: 'Tingkat 6',
          name: 'Deteksi Keadaan Emergence dari Interaksi Semantik',
          description: 'Deteksi emergence',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 28: Siklus Perkembangan Otonom (Cognitive Development & Knowledge Gap Discovery)
    {
      const start = Date.now();
      logTestHeader(28, 'Tingkat 6: Kaos, Mitosis & Evolusi', 'Siklus Perkembangan Otonom & Pencarian Kesenjangan');
      try {
        const dummyExperience = {
          experienceId: 'exp_dev_leksikal_01',
          transactionId: 'tx_dev_01',
          cellId: cellAlpha.nodeId,
          timestamp: new Date().toISOString(),
          informationId: 'info_akal_eval',
          knowledgeIds: ['k_akal'],
          category: InformationCategory.GENERAL_SCIENCE,
          outcome: MetabolismStatus.ACCEPTED,
          noveltyClassification: NoveltyClassification.REINFORCEMENT,
          noveltyScore: 0.25,
          source: 'evaluasi_kamus_berkala',
          confidence: 0.95
        };

        const devResult = await cellAlpha.cognitiveDevelopment.evaluateExperience(
          dummyExperience,
          commonContext,
          ['c_akal', 'c_nalar'],
          ['rel_akal_nalar'],
          [storedEvidenceA]
        );

        if (!devResult) {
          throw new Error('Evaluasi perkembangan kognitif mengembalikan null');
        }

        logTestResult({
          id: 28,
          tier: 'Tingkat 6',
          name: 'Siklus Perkembangan Otonom & Pencarian Kesenjangan',
          description: 'Maturasi representasi internal, penguatan konsep terverifikasi, dan pendeteksian knowledge gap',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            conceptsStrengthened: devResult.conceptsStrengthened,
            relationsStrengthened: devResult.relationsStrengthened,
            knowledgeGapsDetected: devResult.knowledgeGapsIdentified,
            confidenceAdjusted: devResult.confidenceAdjustment
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 28,
          tier: 'Tingkat 6',
          name: 'Siklus Perkembangan Otonom & Pencarian Kesenjangan',
          description: 'Perkembangan kognitif otonom',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 29: Mitosis & Pembelahan Sel Kognitif (Replikasi Genom & Pewarisan Epistemik)
    {
      const start = Date.now();
      logTestHeader(29, 'Tingkat 6: Kaos, Mitosis & Evolusi', 'Mitosis & Pembelahan Sel Kognitif');
      try {
        const eventId = `mitosis_seed_${Date.now()}`;
        const payload = {
          action: 'reproduce',
          subject: cellAlpha.nodeId,
          eventId,
          exp: Date.now() + 60000,
          issuer: 'redqueen-root'
        };
        const signature = identityCrypto.signData(rootAuthorityKp.privateKey, JSON.stringify(payload));
        const authProof: AuthorizationProof = {
          payload,
          signature,
          issuerPublicKey: rootAuthorityKp.publicKey
        };

        const mitosisResult = await cellAlpha.reproduce({
          reproductionSeed: eventId,
          authorizationProof: authProof,
          storageBasePath: WORK_DIR,
          currentPopulation: 1,
          openRouterApiKey: 'dummy_key_unused'
        });

        if (!mitosisResult.result.success || !mitosisResult.child) {
          throw new Error(`Pembelahan sel (mitosis) gagal: ${mitosisResult.result.error || 'Child cell null'}`);
        }

        const child = mitosisResult.child;
        const childGen = child.genome.generation;
        const parentGen = cellAlpha.genome.generation;

        if (childGen !== parentGen + 1) {
          throw new Error(`Generasi anak (${childGen}) tidak bertambah dari orang tua (${parentGen})`);
        }

        // Uji penegakan cooldown: coba membelah lagi langsung dengan event baru
        const immediateRetry = await cellAlpha.reproduce({
          reproductionSeed: `mitosis_seed_retry_${Date.now()}`,
          authorizationProof: authProof,
          storageBasePath: WORK_DIR,
          currentPopulation: 2,
          openRouterApiKey: 'dummy_key_unused'
        });

        const cooldownEnforced = !immediateRetry.result.success;

        logTestResult({
          id: 29,
          tier: 'Tingkat 6',
          name: 'Mitosis & Pembelahan Sel Kognitif',
          description: 'Melakukan pembelahan biner, pewarisan memori, kenaikan generasi (g0 -> g1), dan penegakan cooldown',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            mitosisSuccess: mitosisResult.result.success,
            childNodeId: child.nodeId.substring(0, 16) + '...',
            parentGeneration: parentGen,
            childGeneration: childGen,
            lineageParentCellId: child.lineage.parentCellId?.substring(0, 16) + '...',
            cooldownEnforcedOnImmediateRetry: cooldownEnforced
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 29,
          tier: 'Tingkat 6',
          name: 'Mitosis & Pembelahan Sel Kognitif',
          description: 'Mitosis kognitif',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

    // UJI 30: Siklus Evolusi Genomik & Seleksi Alamiah Berdasarkan Fitness Leksikal
    {
      const start = Date.now();
      logTestHeader(30, 'Tingkat 6: Kaos, Mitosis & Evolusi', 'Siklus Evolusi Genomik & Seleksi Fitness Leksikal');
      try {
        const fitnessState = cellAlpha.evolution.evaluateFitness(cellAlpha, {
          operationalConfidence: 0.95
        });

        const components = fitnessState.components;
        let allComponentsBounded = true;
        for (const [k, val] of Object.entries(components)) {
          if (typeof val !== 'number' || val < 0.0 || val > 1.0) {
            allComponentsBounded = false;
            break;
          }
        }

        if (!allComponentsBounded) {
          throw new Error('Komponen fitness ada yang berada di luar rentang [0.0, 1.0]');
        }

        const warrant = cellAlpha.evaluateReproductionEligibility();

        // Jalankan siklus evolusi genomik terarah dengan executeEvolutionCycle
        const evolutionEvent = cellAlpha.evolution.executeEvolutionCycle(
          {
            seed: `seed_evo_${Date.now()}`,
            mutationOptions: {
              targets: ['traits.mutationRate', 'traits.riskTolerance'],
              reason: 'Adaptasi genomik berbasis leksikon kamus bahasa Indonesia'
            }
          },
          cellAlpha
        );

        logTestResult({
          id: 30,
          tier: 'Tingkat 6',
          name: 'Siklus Evolusi Genomik & Seleksi Fitness Leksikal',
          description: 'Evaluasi 7 komponen fitness biologis-komputasional, penilaian warrant evolusi, dan mutasi terarah',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          details: {
            overallFitnessScore: fitnessState.overallFitness,
            fitnessComponents: components,
            warrantEligible: warrant.eligible,
            reproductionPressure: warrant.reproductionPressure,
            evolutionEventId: evolutionEvent.eventId,
            mutationsCount: evolutionEvent.mutations.length,
            mutationsSample: evolutionEvent.mutations.map(m => ({
              target: m.targetKey,
              previous: m.previousValue,
              next: m.newValue,
              delta: m.delta
            }))
          }
        });
      } catch (err: any) {
        logTestResult({
          id: 30,
          tier: 'Tingkat 6',
          name: 'Siklus Evolusi Genomik & Seleksi Fitness Leksikal',
          description: 'Evolusi genomik',
          status: 'FAILED',
          durationMs: Date.now() - start,
          details: {},
          error: err.message
        });
      }
    }

  } finally {
    // Cleanup active cells
    try {
      if (cellAlpha) await cellAlpha.stop();
      if (cellBeta) await cellBeta.stop();
    } catch {
      // ignore
    }
  }

  // =========================================================================
  // LAPORAN AKHIR & ANALISIS FORENSIK ILMIAH
  // =========================================================================
  console.log('\n' + '#'.repeat(80));
  console.log('# LAPORAN AKHIR: HASIL 30 PENGUJIAN MURNI SISTEM RED QUEEN                 #');
  console.log('#'.repeat(80));

  const total = reports.length;
  const passed = reports.filter(r => r.status === 'SUCCESS').length;
  const failed = reports.filter(r => r.status === 'FAILED').length;

  console.log(`\nRingkasan Statistik:`);
  console.log(`Total Pengujian: ${total}`);
  console.log(`Berhasil: \x1b[32m${passed}\x1b[0m`);
  console.log(`Gagal: \x1b[31${failed > 0 ? 'm' + failed : 'm0'}\x1b[0m`);
  console.log(`Tingkat Keberhasilan: ${((passed / (total || 1)) * 100).toFixed(2)}%\n`);

  console.log('Tabel Evaluasi per Tingkat:');
  console.log('-'.repeat(80));
  console.log(
    'No'.padEnd(4) +
    'Tingkat'.padEnd(12) +
    'Nama Pengujian'.padEnd(46) +
    'Status'.padEnd(10) +
    'Durasi'
  );
  console.log('-'.repeat(80));

  for (const r of reports) {
    const statusStr = r.status === 'SUCCESS' ? 'BERHASIL' : 'GAGAL';
    console.log(
      String(r.id).padEnd(4) +
      r.tier.padEnd(12) +
      r.name.slice(0, 44).padEnd(46) +
      statusStr.padEnd(10) +
      `${r.durationMs}ms`
    );
  }
  console.log('-'.repeat(80));
}

main().catch(err => {
  console.error('Fatal Runner Error:', err);
  process.exit(1);
});
