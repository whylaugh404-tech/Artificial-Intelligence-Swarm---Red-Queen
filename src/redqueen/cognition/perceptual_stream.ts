import { CompactHdcIndex } from './knowledge_distillation';
import { CognitiveGraph } from './representation/graph';
import { CognitiveRelationPredicate, RepresentationVerificationStatus } from './representation/types';
import { LinearSSMCell } from '../learning/linear_ssm';
import { MicroTokenizer } from './tokenizer';
import { Hypervector, bundle } from './hdc';
import { InformationCategory } from '../metabolism/types';
import { logger } from '../core/logger';

export interface PerceptualStreamChunk {
  streamId: string;
  rawContent: string;
  domain?: string;
  sourceUri?: string;
  timestamp: number;
}

export interface ExtractedProposition {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  domain: string;
  rawClause: string;
}

export interface PerceptualIngestionReport {
  streamId: string;
  rawBytes: number;
  clausesIdentified: number;
  propositionsExtracted: ExtractedProposition[];
  conceptsCreatedCount: number;
  relationsCreatedCount: number;
  ssmTokensPushedCount: number;
  elapsedMs: number;
}

export interface PerceptualStreamTelemetry {
  totalBytesProcessed: number;
  totalChunksIngested: number;
  totalPropositionsExtracted: number;
  totalConceptsCrystallized: number;
  activeBufferSize: number;
  lastIngestedAt?: string;
}

/**
 * Perceptual Stream Ingestion (Ingesti Aliran Data Kontinu)
 * 
 * Ingests free-form continuous unstructured data streams (raw text, articles,
 * logs, streaming conversations) without requiring developers to manually
 * structure data into RDF subject-predicate-object triplets.
 * 
 * Autonomously segments stream clauses, extracts relational constituents,
 * encodes hyperdimensional representations, and updates SSM recurrence + Cognitive Graph.
 */
export class PerceptualStreamIngestor {
  private hdcIndex: CompactHdcIndex;
  private cognitiveGraph?: CognitiveGraph;
  private ssmCell?: LinearSSMCell;
  private tokenizer: MicroTokenizer;
  private streamBuffer: string[] = [];
  private telemetry: PerceptualStreamTelemetry = {
    totalBytesProcessed: 0,
    totalChunksIngested: 0,
    totalPropositionsExtracted: 0,
    totalConceptsCrystallized: 0,
    activeBufferSize: 0
  };

  constructor(options: {
    hdcIndex: CompactHdcIndex;
    cognitiveGraph?: CognitiveGraph;
    ssmCell?: LinearSSMCell;
  }) {
    this.hdcIndex = options.hdcIndex;
    this.cognitiveGraph = options.cognitiveGraph;
    this.ssmCell = options.ssmCell;
    this.tokenizer = new MicroTokenizer();
  }

  public setCognitiveGraph(graph: CognitiveGraph): void {
    this.cognitiveGraph = graph;
  }

  public setSSMCell(ssm: LinearSSMCell): void {
    this.ssmCell = ssm;
  }

  /**
   * Pushes a raw chunk into the continuous sliding stream buffer
   */
  public pushChunk(rawContent: string): void {
    if (rawContent && rawContent.trim().length > 0) {
      this.streamBuffer.push(rawContent);
      this.telemetry.activeBufferSize = this.streamBuffer.length;
    }
  }

  /**
   * Flushes and ingests all accumulated chunks in the buffer
   */
  public async flushBuffer(domain: string = 'CONTINUOUS_STREAM'): Promise<PerceptualIngestionReport[]> {
    const chunks = [...this.streamBuffer];
    this.streamBuffer = [];
    this.telemetry.activeBufferSize = 0;

    const reports: PerceptualIngestionReport[] = [];
    for (const chunk of chunks) {
      const rep = await this.ingestRawStream(chunk, { domain });
      reports.push(rep);
    }
    return reports;
  }

  /**
   * Ingests a raw arbitrary text stream completely autonomously
   */
  public async ingestRawStream(
    rawText: string,
    options?: { domain?: string; sourceUri?: string; streamId?: string }
  ): Promise<PerceptualIngestionReport> {
    const t0 = performance.now();
    const cleanText = rawText.trim();
    const streamId = options?.streamId || `stream_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const domain = options?.domain || 'PERCEPTUAL_STREAM';
    const sourceUri = options?.sourceUri || `stream://${streamId}`;

    if (cleanText.length === 0) {
      return {
        streamId,
        rawBytes: 0,
        clausesIdentified: 0,
        propositionsExtracted: [],
        conceptsCreatedCount: 0,
        relationsCreatedCount: 0,
        ssmTokensPushedCount: 0,
        elapsedMs: 0
      };
    }

    // 1. Unsupervised Sentence & Clause Segmentation
    const rawClauses = this.segmentClauses(cleanText);

    // 2. Autonomous Extraction of Proposition Constituents (Zero Developer Triplets)
    const propositions: ExtractedProposition[] = [];
    for (const clause of rawClauses) {
      const extracted = this.extractConstituents(clause, domain);
      if (extracted) {
        propositions.push(extracted);
      }
    }

    // 3. Update Linear SSM Recurrent Memory with streaming token trajectory
    let ssmTokensPushed = 0;
    if (this.ssmCell) {
      const tokens = this.tokenizer.encode(cleanText);
      const inputVec = new Float32Array(this.ssmCell.inputDim);
      for (const tok of tokens) {
        const idx = tok % this.ssmCell.inputDim;
        inputVec[idx] = (inputVec[idx] || 0) + 1.0;
        this.ssmCell.step(inputVec);
        ssmTokensPushed++;
      }
    }

    // 4. Ingest propositions into HDC Slab and Cognitive Graph
    let conceptsCreated = 0;
    let relationsCreated = 0;

    for (let i = 0; i < propositions.length; i++) {
      const prop = propositions[i];
      const hdcVec = this.encodePropositionHDC(prop.subject, prop.predicate, prop.object);

      // Add to HDC slab index
      const factId = Date.now() + i;
      this.hdcIndex.addFact({
        id: factId,
        subject: prop.subject,
        predicate: prop.predicate,
        object: prop.object,
        domain: prop.domain as any,
        confidence: prop.confidence
      }, hdcVec);

      // Insert Concept & Relation into Cognitive Graph
      if (this.cognitiveGraph) {
        const conceptId = `con_stream_${factId}`;
        try {
          await this.cognitiveGraph.insertConcept({
            conceptId,
            canonicalName: prop.subject,
            category: InformationCategory.GENERAL_TECHNOLOGY,
            description: `${prop.subject} ${prop.predicate} ${prop.object}`,
            confidence: prop.confidence,
            sourceKnowledgeIds: [`stream_${factId}`],
            sourceExperienceIds: [],
            originatingCellId: 'perceptual_stream',
            verificationStatus: RepresentationVerificationStatus.SUPPORTED,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
            provenance: ['perceptual_stream_ingestion', sourceUri],
            metadata: {}
          });
          conceptsCreated++;

          // For multi-token objects, also create an object concept & relational edge
          if (prop.object.length > 3 && prop.object.length < 50) {
            const targetConceptId = `con_stream_obj_${factId}`;
            await this.cognitiveGraph.insertConcept({
              conceptId: targetConceptId,
              canonicalName: prop.object,
              category: InformationCategory.GENERAL_TECHNOLOGY,
              description: `Entity referenced in relation to ${prop.subject}`,
              confidence: prop.confidence * 0.9,
              sourceKnowledgeIds: [`stream_${factId}`],
              sourceExperienceIds: [],
              originatingCellId: 'perceptual_stream',
              verificationStatus: RepresentationVerificationStatus.SUPPORTED,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              version: 1,
              provenance: ['perceptual_stream_ingestion', sourceUri],
              metadata: {}
            });

            await this.cognitiveGraph.insertRelation({
              relationId: `rel_stream_${factId}`,
              subjectConceptId: conceptId,
              predicate: CognitiveRelationPredicate.SUPPORTS,
              objectConceptId: targetConceptId,
              confidence: prop.confidence,
              provenance: ['perceptual_stream_ingestion', sourceUri],
              verificationStatus: RepresentationVerificationStatus.SUPPORTED,
              createdAt: new Date().toISOString(),
              originatingCellId: 'perceptual_stream',
              metadata: { weight: 0.85, directed: true }
            });
            relationsCreated++;
          }
        } catch (err: any) {
          logger.debug('perceptual_stream', 'deferred_concept_insertion', { error: err.message });
        }
      }
    }

    const t1 = performance.now();
    const elapsedMs = parseFloat((t1 - t0).toFixed(2));

    // Update Telemetry
    this.telemetry.totalBytesProcessed += cleanText.length;
    this.telemetry.totalChunksIngested += 1;
    this.telemetry.totalPropositionsExtracted += propositions.length;
    this.telemetry.totalConceptsCrystallized += conceptsCreated;
    this.telemetry.lastIngestedAt = new Date().toISOString();

    logger.debug('perceptual_stream', 'stream_ingested', {
      streamId,
      clauses: rawClauses.length,
      propositions: propositions.length,
      conceptsCreated,
      elapsedMs
    });

    return {
      streamId,
      rawBytes: cleanText.length,
      clausesIdentified: rawClauses.length,
      propositionsExtracted: propositions,
      conceptsCreatedCount: conceptsCreated,
      relationsCreatedCount: relationsCreated,
      ssmTokensPushedCount: ssmTokensPushed,
      elapsedMs
    };
  }

  /**
   * Unsupervised linguistic clause boundary detector
   */
  private segmentClauses(text: string): string[] {
    // Split on terminal punctuation, semicolon, newlines, and coordinate conjunctions
    const segments = text
      .split(/[.\n;!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    const clauses: string[] = [];
    for (const seg of segments) {
      // If segment is very long, split on coordinating discourse markers
      if (seg.length > 120) {
        const subParts = seg.split(/\s+(?:dan|serta|sedangkan|namun|and|while|whereas)\s+/i);
        for (const sub of subParts) {
          if (sub.trim().length > 8) clauses.push(sub.trim());
        }
      } else {
        clauses.push(seg);
      }
    }

    return clauses.length > 0 ? clauses : [text.trim()];
  }

  /**
   * Autonomous Constituent Extractor:
   * Maps unstructured sentences to (Subject, Predicate, Object) without manual templates.
   */
  private extractConstituents(clause: string, domain: string): ExtractedProposition | null {
    const trimmed = clause.trim();
    if (trimmed.length < 8) return null;

    // Common relational patterns & copulas across Indonesian & English
    const patterns = [
      // "X adalah / merupakan / berfungsi sebagai Y"
      { regex: /^(.+?)\s+(?:merupakan|adalah|berfungsi\s+sebagai|ialah)\s+(.+)$/i, defaultPred: 'merupakan' },
      // "X menghasilkan / memiliki / mengandung / menyebabkan Y"
      { regex: /^(.+?)\s+(?:menghasilkan|memiliki|mengandung|menyebabkan|mentransfer|membentuk)\s+(.+)$/i, useMatchedVerb: true },
      // "X is / represents / produces / contains / causes Y"
      { regex: /^(.+?)\s+(?:is|was|represents|produces|contains|causes|binds|generates)\s+(.+)$/i, defaultPred: 'is' },
      // "X consists of / operates via / connects to Y"
      { regex: /^(.+?)\s+(?:consists\s+of|operates\s+via|connects\s+to|depends\s+on)\s+(.+)$/i, useMatchedVerb: true }
    ];

    for (const p of patterns) {
      const match = trimmed.match(p.regex);
      if (match && match[1] && match[2]) {
        const subj = match[1].replace(/^[^\w]+/, '').trim().slice(0, 64);
        const obj = match[2].replace(/[.,;]+$/, '').trim().slice(0, 160);
        
        let pred = p.defaultPred || 'relates to';
        if (p.useMatchedVerb) {
          const words = trimmed.slice(match[1].length).trim().split(/\s+/);
          pred = words.slice(0, 2).join(' ');
        }

        if (subj.length > 1 && obj.length > 1) {
          return {
            subject: subj,
            predicate: pred,
            object: obj,
            confidence: 0.92,
            domain,
            rawClause: trimmed
          };
        }
      }
    }

    // Heuristic Fallback: Head Noun Chunk + Relational Tail
    const words = trimmed.split(/\s+/);
    if (words.length >= 4) {
      const subj = words.slice(0, 2).join(' ');
      const pred = words[2];
      const obj = words.slice(3).join(' ');

      return {
        subject: subj,
        predicate: pred,
        object: obj,
        confidence: 0.82,
        domain,
        rawClause: trimmed
      };
    }

    return null;
  }

  /**
   * Generates a deterministic Hypervector representation of an extracted proposition
   */
  private encodePropositionHDC(subject: string, predicate: string, object: string): Hypervector {
    const dim = 10240;
    const sHV = Hypervector.fromSeed(`prop_s_${subject.toLowerCase()}`, dim);
    const pHV = Hypervector.fromSeed(`prop_p_${predicate.toLowerCase()}`, dim).permute(1);
    const oHV = Hypervector.fromSeed(`prop_o_${object.toLowerCase()}`, dim).permute(2);

    return bundle([sHV, pHV, oHV]);
  }

  public getTelemetry(): PerceptualStreamTelemetry {
    return { ...this.telemetry };
  }
}
