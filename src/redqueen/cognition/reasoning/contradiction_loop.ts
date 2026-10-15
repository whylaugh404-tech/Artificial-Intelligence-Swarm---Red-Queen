import { CognitiveGraph } from '../representation/graph';
import { CellMetabolismController } from '../../metabolism/cellular_vitality';
import { MetabolismEventType, CellVitalityState } from '../../metabolism/types';
import { logger } from '../../core/logger';

export interface ReasoningEpisode {
  episodeId: string;
  prompt: string;
  statement: string;
  activatedConceptIds: string[];
  activatedRelationIds: string[];
  groundedFacts: Array<{ subject: string; predicate: string; object: string }>;
  timestamp: number;
  confidence: number;
  ssmNorm?: number;
}

export interface ContradictionAuditEntry {
  auditId: string;
  timestamp: string;
  triggeringInput: string;
  correctionSignal: string;
  penalizedEpisodeId: string;
  penalizedConcepts: string[];
  penalizedConceptIds?: string[];
  penalizedRelations: string[];
  synapticConfidenceCut: number;
  atpDrained: number;
  resultingAtpPool: number;
  resultingVitalityState: CellVitalityState | string;
  correctiveActionSummary: string;
}

export interface ContradictionDetectionResult {
  isContradiction: boolean;
  confidence: number;
  detectedSignal: string;
  inferredCorrection?: string;
}

/**
 * Contradiction Feedback Loop (Mekanisme Umpan Balik Negatif & Koreksi Mandiri)
 * 
 * Autonomously intercepts negative feedback and contradiction cues ("bukan, jawabanmu salah"),
 * punishes erroneous reasoning pathways by slashing synaptic confidence in CognitiveGraph,
 * drains cellular ATP reserves to reflect the metabolic penalty of false hypotheses,
 * and maintains an immutable audit trail of epistemic corrections.
 */
export class ContradictionFeedbackLoop {
  private cognitiveGraph?: CognitiveGraph;
  private vitality?: CellMetabolismController;
  private recentEpisodes: ReasoningEpisode[] = [];
  private auditTrail: ContradictionAuditEntry[] = [];
  private readonly defaultAtpPenalty: number;
  private readonly synapticSlashFactor: number;

  constructor(
    optionsOrGraph?: CognitiveGraph | {
      cognitiveGraph?: CognitiveGraph;
      vitality?: CellMetabolismController;
      defaultAtpPenalty?: number;
      synapticSlashFactor?: number;
    },
    vitality?: CellMetabolismController,
    defaultAtpPenalty?: number,
    synapticSlashFactor?: number
  ) {
    if (optionsOrGraph && 'getConcept' in optionsOrGraph) {
      this.cognitiveGraph = optionsOrGraph as CognitiveGraph;
      this.vitality = vitality;
      this.defaultAtpPenalty = defaultAtpPenalty ?? 12.0;
      this.synapticSlashFactor = synapticSlashFactor ?? 0.60;
    } else {
      const opts = optionsOrGraph as any;
      this.cognitiveGraph = opts?.cognitiveGraph;
      this.vitality = opts?.vitality;
      this.defaultAtpPenalty = opts?.defaultAtpPenalty ?? 12.0;
      this.synapticSlashFactor = opts?.synapticSlashFactor ?? 0.60;
    }
  }

  public setCognitiveGraph(graph: CognitiveGraph): void {
    this.cognitiveGraph = graph;
  }

  public setVitality(vitality: CellMetabolismController): void {
    this.vitality = vitality;
  }

  /**
   * Records a reasoning episode to enable targeted retroactive penalty if contradicted
   */
  public recordEpisode(episode: ReasoningEpisode): void {
    this.recentEpisodes.unshift(episode);
    if (this.recentEpisodes.length > 20) {
      this.recentEpisodes.pop();
    }
  }

  /**
   * Retrieves the most recent reasoning episode
   */
  public getLatestEpisode(): ReasoningEpisode | undefined {
    return this.recentEpisodes[0];
  }

  /**
   * Detects whether an incoming input is a negative feedback / contradiction signal
   */
  public detectContradiction(input: string): ContradictionDetectionResult {
    const raw = input.trim().toLowerCase();

    // High-confidence contradiction patterns in Indonesian and English
    const patterns = [
      { regex: /(?:^|\s)(?:bukan,?\s+jawabanmu\s+salah|jawabanmu\s+salah|kamu\s+salah|itu\s+salah)(?:$|\s|[.!?])/i, signal: 'JAWABAN_SALAH', conf: 0.98 },
      { regex: /(?:^|\s)(?:bukan\s+begitu|bukan\s+itu|keliru|tidak\s+benar|jawaban\s+salah|kamu\s+keliru)(?:$|\s|[.!?])/i, signal: 'PERNYATAAN_KELIRU', conf: 0.95 },
      { regex: /(?:^|\s)(?:no,?\s+you(?:'re|\s+are)\s+wrong|that(?:'s|\s+is)\s+wrong|you\s+are\s+wrong)(?:$|\s|[.!?])/i, signal: 'WRONG_STATEMENT', conf: 0.98 },
      { regex: /(?:^|\s)(?:incorrect|that\s+is\s+false|false\s+answer|not\s+true|you(?:'re|\s+are)\s+mistaken)(?:$|\s|[.!?])/i, signal: 'INCORRECT_ASSERTION', conf: 0.95 },
      { regex: /(?:^|\s)(?:bukan|salah|wrong)(?:$|[.!?])/i, signal: 'TERSE_DENIAL', conf: 0.85 }
    ];

    for (const p of patterns) {
      if (p.regex.test(raw)) {
        // Extract optional trailing correction: e.g. "bukan, jawabanmu salah, yang benar bumi itu bulat"
        let inferredCorrection: string | undefined;
        const correctionSplit = raw.split(/(?:yang\s+benar|seharusnya|the\s+truth\s+is|correct\s+is|actually)\s+/i);
        if (correctionSplit.length > 1) {
          inferredCorrection = correctionSplit[1].trim();
        }

        return {
          isContradiction: true,
          confidence: p.conf,
          detectedSignal: p.signal,
          inferredCorrection
        };
      }
    }

    return {
      isContradiction: false,
      confidence: 0.0,
      detectedSignal: 'NONE'
    };
  }

  /**
   * Executes the full autonomous contradiction correction:
   * 1. Slashes synaptic weights in CognitiveGraph
   * 2. Drains ATP and accumulates catabolic penalty in CellMetabolismController
   * 3. Records immutable correction audit entry
   */
  public async executeContradictionCorrection(
    input: string,
    detection: ContradictionDetectionResult
  ): Promise<{
    audit: ContradictionAuditEntry;
    penalizedConceptsCount: number;
    penalizedRelationsCount: number;
    atpDrained: number;
    resultingAtpPool: number;
    resultingVitalityState: string;
    correctiveResponseText: string;
  }> {
    const targetEpisode = this.getLatestEpisode();
    const now = new Date().toISOString();
    const auditId = `audit_contra_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const penalizedConcepts: string[] = [];
    const penalizedRelations: string[] = [];

    // 1. Slash Synaptic Weights in Cognitive Graph
    if (this.cognitiveGraph && targetEpisode) {
      // Slash activated concepts
      for (const conceptId of targetEpisode.activatedConceptIds) {
        const concept = this.cognitiveGraph.getConcept(conceptId);
        if (concept) {
          const oldConf = concept.confidence;
          const newConf = parseFloat((oldConf * (1.0 - this.synapticSlashFactor)).toFixed(3));
          
          await this.cognitiveGraph.updateConcept({
            ...concept,
            confidence: Math.max(0.10, newConf),
            verificationStatus: 'CONTRADICTED' as any,
            updatedAt: now,
            provenance: [...concept.provenance, `contradiction_slashed:${auditId}`]
          });
          penalizedConcepts.push(`${concept.canonicalName} (${oldConf.toFixed(2)} -> ${newConf.toFixed(2)})`);
        }
      }

      // Slash activated relations
      for (const relId of targetEpisode.activatedRelationIds) {
        const rel = this.cognitiveGraph.getRelation(relId);
        if (rel) {
          const oldWeight = rel.confidence;
          const newWeight = parseFloat((oldWeight * (1.0 - this.synapticSlashFactor)).toFixed(3));
          
          await this.cognitiveGraph.insertRelation({
            ...rel,
            confidence: Math.max(0.10, newWeight),
            provenance: [...rel.provenance, `contradiction_slashed:${auditId}`],
            metadata: { ...rel.metadata, updatedAt: now }
          });
          penalizedRelations.push(`${relId} (${oldWeight.toFixed(2)} -> ${newWeight.toFixed(2)})`);
        }
      }

      // If concepts fell below atrophy threshold, prune them
      await this.cognitiveGraph.pruneAtrophiedSynapses({
        confidenceThreshold: 0.25,
        maxPruneCount: 5
      });
    }

    // 2. Drain ATP and Register Metabolic Toxicity Penalty
    let atpDrained = this.defaultAtpPenalty;
    let resultingAtp = 100.0;
    let resultingVitality: CellVitalityState | string = CellVitalityState.OPTIMAL;

    if (this.vitality) {
      const drainResult = this.vitality.consumeAtp(atpDrained, 'CONTRADICTION_CORRECTION_PENALTY', {
        auditId,
        triggeringInput: input,
        penalizedEpisodeId: targetEpisode?.episodeId
      });
      atpDrained = drainResult.actualConsumed;
      resultingAtp = drainResult.remainingAtp;
      resultingVitality = drainResult.vitalityState;
    }

    // 3. Assemble Audit Entry
    const summary = `Penalized ${penalizedConcepts.length} concepts and ${penalizedRelations.length} relations from episode ${targetEpisode?.episodeId || 'unknown'}. Drained ${atpDrained} ATP.`;
    const audit: ContradictionAuditEntry = {
      auditId,
      timestamp: now,
      triggeringInput: input,
      correctionSignal: detection.detectedSignal,
      penalizedEpisodeId: targetEpisode?.episodeId || 'none',
      penalizedConcepts,
      penalizedConceptIds: targetEpisode?.activatedConceptIds ?? [],
      penalizedRelations,
      synapticConfidenceCut: this.synapticSlashFactor,
      atpDrained,
      resultingAtpPool: resultingAtp,
      resultingVitalityState: resultingVitality,
      correctiveActionSummary: summary
    };

    this.auditTrail.unshift(audit);
    if (this.auditTrail.length > 50) this.auditTrail.pop();

    logger.warn('contradiction_loop', 'negative_feedback_intercepted', {
      auditId,
      signal: detection.detectedSignal,
      atpDrained,
      penalizedConcepts: penalizedConcepts.length
    });

    // 4. Zero-Template Transparent Autonomous Response
    const correctiveResponseText = (
      `[Koreksi Mandiri: Kontradiksi Terdeteksi]\n` +
      `Sinyal Koreksi: "${detection.detectedSignal}" terpicu dari input pengguna.\n` +
      `Hukuman Sinaptik: Memotong bobot ${penalizedConcepts.length} simpul konsep yang keliru (${penalizedConcepts.join(', ') || 'jalur nalar aktif'}).\n` +
      `Konsumsi Energi: Cadangan ATP dikuras (-${atpDrained.toFixed(1)} ATP). Kolam tersisa: ${resultingAtp.toFixed(2)} [Vitalitas: ${resultingVitality}].\n` +
      `Audit Rekam: Peristiwa dicatat permanen pada Audit #${auditId}. Jalur nalar salah telah dipangkas.`
    );

    return {
      audit,
      penalizedConceptsCount: penalizedConcepts.length,
      penalizedRelationsCount: penalizedRelations.length,
      atpDrained,
      resultingAtpPool: resultingAtp,
      resultingVitalityState: String(resultingVitality),
      correctiveResponseText
    };
  }

  public applyContradictionCorrection(input: string): ContradictionAuditEntry | null {
    const detection = this.detectContradiction(input);
    if (!detection.isContradiction) {
      return null;
    }

    const targetEpisode = this.getLatestEpisode();
    const now = new Date().toISOString();
    const auditId = `audit_contra_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const penalizedConcepts: string[] = [];
    const penalizedConceptIds: string[] = targetEpisode?.activatedConceptIds ?? [];
    const penalizedRelations: string[] = [];

    if (this.cognitiveGraph && targetEpisode) {
      for (const conceptId of targetEpisode.activatedConceptIds) {
        const concept = this.cognitiveGraph.getConcept(conceptId);
        if (concept) {
          const oldConf = concept.confidence;
          const newConf = parseFloat((oldConf * (1.0 - this.synapticSlashFactor)).toFixed(3));
          
          this.cognitiveGraph.updateConcept({
            ...concept,
            confidence: Math.max(0.10, newConf),
            verificationStatus: 'CONTRADICTED' as any,
            updatedAt: now,
            provenance: [...concept.provenance, `contradiction_slashed:${auditId}`]
          }).catch(() => undefined);
          penalizedConcepts.push(`${concept.canonicalName} (${oldConf.toFixed(2)} -> ${newConf.toFixed(2)})`);
        }
      }

      for (const relId of targetEpisode.activatedRelationIds || []) {
        const rel = this.cognitiveGraph.getRelation(relId);
        if (rel) {
          const oldWeight = rel.confidence;
          const newWeight = parseFloat((oldWeight * (1.0 - this.synapticSlashFactor)).toFixed(3));
          
          this.cognitiveGraph.insertRelation({
            ...rel,
            confidence: Math.max(0.10, newWeight),
            provenance: [...rel.provenance, `contradiction_slashed:${auditId}`],
            metadata: { ...rel.metadata, updatedAt: now }
          }).catch(() => undefined);
          penalizedRelations.push(`${relId} (${oldWeight.toFixed(2)} -> ${newWeight.toFixed(2)})`);
        }
      }
    }

    let atpDrained = this.defaultAtpPenalty;
    let resultingAtp = 100.0;
    let resultingVitality: CellVitalityState | string = CellVitalityState.OPTIMAL;

    if (this.vitality) {
      const drainResult = this.vitality.consumeAtp(atpDrained, 'CONTRADICTION_CORRECTION_PENALTY', {
        auditId,
        triggeringInput: input,
        penalizedEpisodeId: targetEpisode?.episodeId
      });
      atpDrained = drainResult.actualConsumed;
      resultingAtp = drainResult.remainingAtp;
      resultingVitality = drainResult.vitalityState;
    }

    const summary = `Penalized ${penalizedConcepts.length} concepts and ${penalizedRelations.length} relations from episode ${targetEpisode?.episodeId || 'unknown'}. Drained ${atpDrained} ATP.`;
    const audit: ContradictionAuditEntry = {
      auditId,
      timestamp: now,
      triggeringInput: input,
      correctionSignal: detection.detectedSignal,
      penalizedEpisodeId: targetEpisode?.episodeId || 'none',
      penalizedConcepts,
      penalizedConceptIds,
      penalizedRelations,
      synapticConfidenceCut: this.synapticSlashFactor,
      atpDrained,
      resultingAtpPool: resultingAtp,
      resultingVitalityState: resultingVitality,
      correctiveActionSummary: summary
    };

    this.auditTrail.unshift(audit);
    if (this.auditTrail.length > 50) this.auditTrail.pop();

    return audit;
  }

  public getAuditTrail(): ContradictionAuditEntry[] {
    return [...this.auditTrail];
  }

  public getAuditHistory(): ContradictionAuditEntry[] {
    return this.getAuditTrail();
  }

  public getAuditById(auditId: string): ContradictionAuditEntry | undefined {
    return this.auditTrail.find(a => a.auditId === auditId);
  }
}
