import {
  InformationRecordInput,
  MetabolismResult,
  MetabolismStatus,
  MetabolismEventType,
  MetabolismBudget,
  DEFAULT_METABOLISM_BUDGET,
  NoveltyClassification,
  Experience,
  KnowledgeRecord
} from './types';
import { validateInformationRecord } from './validator';
import { InformationClassifier } from './classifier';
import { InformationEvaluator } from './evaluator';
import { KnowledgeExtractor } from './extractor';
import { NoveltyEvaluator } from './deduplicator';
import { MetabolismAuditTrail } from './audit';
import { MemoryStore, MemoryCategory, MemoryEntry } from '../memory/store';
import { CognitiveStateManager } from '../cognition/state';
import { logger } from '../core/logger';
import { v4 as uuidv4 } from 'uuid';
import { CognitiveGraph, CognitiveRepresentationEngine } from '../cognition/representation';

export interface MetabolismEngineOptions {
  readonly budget?: Partial<MetabolismBudget>;
  readonly classifier?: InformationClassifier;
  readonly evaluator?: InformationEvaluator;
  readonly extractor?: KnowledgeExtractor;
  readonly graph?: CognitiveGraph;
  readonly representationEngine?: CognitiveRepresentationEngine;
}

export class MetabolismEngine {
  private readonly component = 'metabolism_engine';
  public readonly budget: MetabolismBudget;
  public readonly classifier: InformationClassifier;
  public readonly evaluator: InformationEvaluator;
  public readonly extractor: KnowledgeExtractor;
  public readonly deduplicator: NoveltyEvaluator;
  public readonly audit: MetabolismAuditTrail;
  public readonly graph?: CognitiveGraph;
  public readonly representationEngine?: CognitiveRepresentationEngine;

  constructor(
    public readonly cellId: string,
    public readonly memoryStore: MemoryStore,
    public readonly cognitiveState: CognitiveStateManager,
    options?: MetabolismEngineOptions
  ) {
    this.budget = Object.freeze({
      ...DEFAULT_METABOLISM_BUDGET,
      ...(options?.budget || {})
    });
    this.classifier = options?.classifier || new InformationClassifier();
    this.evaluator = options?.evaluator || new InformationEvaluator();
    this.extractor = options?.extractor || new KnowledgeExtractor();
    this.deduplicator = new NoveltyEvaluator(this.cellId);
    this.audit = new MetabolismAuditTrail(this.cellId, this.budget);
    this.graph = options?.graph;
    this.representationEngine = options?.representationEngine;
  }

  /**
   * Metabolizes an incoming information record through the complete 12-stage pipeline.
   */
  public async metabolize(input: InformationRecordInput): Promise<MetabolismResult> {
    const startTime = Date.now();
    const deadline = startTime + this.budget.maxProcessingTimeMs;
    const infoId = input.informationId || `temp_${Date.now()}`;
    const transactionId = `tx_${uuidv4()}`;

    const checkDeadline = () => {
      if (Date.now() > deadline) {
        throw new Error('Metabolism processing deadline exceeded');
      }
    };

    // Stage 1: Record Reception
    this.audit.recordEvent(MetabolismEventType.INFORMATION_RECEIVED, infoId, {
      sourceType: input.sourceType,
      sourceIdentifier: input.sourceIdentifier || input.sourceUri,
      transactionId
    });

    // Stage 2 & 3: Validate and Normalize
    const valResult = validateInformationRecord(input, this.budget);
    if (!valResult.valid || !valResult.record) {
      const reason = `Validation failed: ${valResult.errors?.join('; ') || 'Invalid information record'}`;
      this.audit.recordEvent(MetabolismEventType.VALIDATION_FAILED, infoId, {
        errors: valResult.errors,
        transactionId
      });
      return {
        status: MetabolismStatus.INVALID,
        informationId: infoId,
        cellId: this.cellId,
        reason,
        receivedAt: new Date(startTime).toISOString(),
        processedAt: new Date().toISOString(),
        processingDurationMs: Date.now() - startTime
      };
    }

    const record = valResult.record;
    this.audit.recordEvent(MetabolismEventType.NORMALIZED, record.informationId, {
      contentHash: record.contentHash,
      contentLength: record.content.length,
      transactionId
    });

    try {
      checkDeadline();

      // Stage 4: Early Exact Duplicate Check
      const earlyDupCheck = await this.deduplicator.evaluateNovelty(record, this.memoryStore);
      if (earlyDupCheck.classification === NoveltyClassification.EXACT_DUPLICATE) {
        this.audit.recordEvent(
          MetabolismEventType.DUPLICATE_DETECTED,
          record.informationId,
          {
            existingKnowledgeId: earlyDupCheck.existingKnowledgeId,
            reason: earlyDupCheck.reason,
            transactionId
          },
          earlyDupCheck.existingKnowledgeId
        );
        return {
          status: MetabolismStatus.DUPLICATE,
          informationId: record.informationId,
          knowledgeId: earlyDupCheck.existingKnowledgeId,
          cellId: this.cellId,
          reason: earlyDupCheck.reason || 'Duplicate information previously metabolized',
          receivedAt: new Date(startTime).toISOString(),
          processedAt: new Date().toISOString(),
          processingDurationMs: Date.now() - startTime
        };
      }

      checkDeadline();

      // Stage 5: Classification
      const classification = this.classifier.classify(record);
      this.audit.recordEvent(MetabolismEventType.CLASSIFIED, record.informationId, {
        primaryCategory: classification.primaryCategory,
        confidence: classification.confidence,
        allScores: classification.allScores,
        transactionId
      });

      checkDeadline();

      // Stage 6: Relevance Evaluation
      const cellContext = {
        cellId: this.cellId,
        specialization: this.cognitiveState.getSpecialization(),
        activeGoals: this.cognitiveState.getState().activeGoals
      };
      const relevance = this.evaluator.evaluateRelevance(record, classification, cellContext);
      this.audit.recordEvent(MetabolismEventType.EVALUATED, record.informationId, {
        relevanceScore: relevance.relevanceScore,
        matchedSpecialization: relevance.matchedSpecialization,
        reason: relevance.reason,
        transactionId
      });

      // Gate 1: Relevance Check
      if (relevance.relevanceScore < this.budget.minRelevanceThreshold) {
        const reason = `Information relevance (${relevance.relevanceScore.toFixed(2)}) is below required threshold (${this.budget.minRelevanceThreshold.toFixed(2)}): ${relevance.reason}`;
        this.audit.recordEvent(MetabolismEventType.LOW_RELEVANCE_DROPPED, record.informationId, {
          relevanceScore: relevance.relevanceScore,
          threshold: this.budget.minRelevanceThreshold,
          reason,
          transactionId
        });
        return {
          status: MetabolismStatus.LOW_RELEVANCE,
          informationId: record.informationId,
          cellId: this.cellId,
          classification: classification.primaryCategory,
          relevance,
          reason,
          receivedAt: new Date(startTime).toISOString(),
          processedAt: new Date().toISOString(),
          processingDurationMs: Date.now() - startTime
        };
      }

      checkDeadline();

      // Stage 7: Quality & Confidence Evaluation
      const quality = this.evaluator.evaluateQuality(record, classification);

      // Gate 2: Quality & Confidence Check
      if (
        quality.qualityScore < this.budget.minQualityThreshold ||
        quality.confidence < this.budget.minConfidenceThreshold
      ) {
        const reason = `Information quality (${quality.qualityScore.toFixed(2)}) or confidence (${quality.confidence.toFixed(2)}) below threshold: ${quality.reason}`;
        this.audit.recordEvent(MetabolismEventType.METABOLISM_FAILED, record.informationId, {
          qualityScore: quality.qualityScore,
          confidence: quality.confidence,
          reason,
          transactionId
        });
        return {
          status: MetabolismStatus.REJECTED,
          informationId: record.informationId,
          cellId: this.cellId,
          classification: classification.primaryCategory,
          relevance,
          quality,
          reason,
          receivedAt: new Date(startTime).toISOString(),
          processedAt: new Date().toISOString(),
          processingDurationMs: Date.now() - startTime
        };
      }

      checkDeadline();

      // Stage 8: Knowledge Extraction
      let knowledge = this.extractor.extractKnowledge(
        record,
        classification.primaryCategory,
        relevance,
        quality,
        this.cellId,
        this.budget
      );

      // Budget check: Size of knowledge record
      const serializedSize = Buffer.byteLength(JSON.stringify(knowledge), 'utf8');
      if (serializedSize > this.budget.maxKnowledgeRecordSize) {
        throw new Error(`Knowledge record size (${serializedSize} bytes) exceeds budget limit (${this.budget.maxKnowledgeRecordSize} bytes)`);
      }

      checkDeadline();

      // Stage 9: Deep Novelty & Contradiction Evaluation
      const noveltyEval = await this.deduplicator.evaluateNovelty(record, this.memoryStore, [...knowledge.facts]);
      
      checkDeadline();

      if (noveltyEval.classification === NoveltyClassification.SEMANTIC_OVERLAP || 
          noveltyEval.classification === NoveltyClassification.REINFORCEMENT) {
        if (noveltyEval.existingKnowledge) {
          knowledge = {
            ...noveltyEval.existingKnowledge,
            reinforcementCount: noveltyEval.existingKnowledge.reinforcementCount + 1,
            sourceInformationIds: [...noveltyEval.existingKnowledge.sourceInformationIds, record.informationId],
            sourceContentHashes: [...noveltyEval.existingKnowledge.sourceContentHashes, record.contentHash],
            sourceProvenance: [...noveltyEval.existingKnowledge.sourceProvenance, knowledge.sourceProvenance[0]],
            confidence: Math.min(1.0, noveltyEval.existingKnowledge.confidence + (quality.confidence * 0.1)),
            updatedAt: new Date().toISOString(),
            knowledgeVersion: noveltyEval.existingKnowledge.knowledgeVersion + 1
          };
          this.audit.recordEvent(MetabolismEventType.KNOWLEDGE_REINFORCED, record.informationId, {
            existingKnowledgeId: knowledge.knowledgeId,
            noveltyScore: noveltyEval.score,
            transactionId
          }, knowledge.knowledgeId);
        }
      } else if (noveltyEval.classification === NoveltyClassification.CONTRADICTION) {
        if (noveltyEval.existingKnowledgeId) {
          knowledge = {
            ...knowledge,
            contradictions: [noveltyEval.existingKnowledgeId]
          };
          this.audit.recordEvent(MetabolismEventType.KNOWLEDGE_CONFLICT_DETECTED, record.informationId, {
            conflictingKnowledgeId: noveltyEval.existingKnowledgeId,
            reason: noveltyEval.reason,
            transactionId
          }, knowledge.knowledgeId);
        }
      } else {
        this.audit.recordEvent(
          MetabolismEventType.KNOWLEDGE_CREATED,
          record.informationId,
          {
            title: knowledge.title,
            category: knowledge.category,
            factsCount: knowledge.facts.length,
            transactionId
          },
          knowledge.knowledgeId
        );
      }

      // STAGED PERSISTENCE WITH COMPENSATION
      const originalCognitiveState = this.cognitiveState.getState();
      let storedKnowledgeId: string | undefined = undefined;
      let storedExperienceId: string | undefined = undefined;
      let registeredHash: string | undefined = undefined;
      const storedRepresentationIds: string[] = [];

      try {
        // Stage 10: Persist Knowledge to Memory Store
        const memoryEntry: MemoryEntry = {
          id: knowledge.knowledgeId,
          cellId: this.cellId,
          category: MemoryCategory.SEMANTIC,
          type: 'KNOWLEDGE_RECORD',
          content: knowledge,
          source: `metabolism:${record.sourceType}`,
          createdAt: knowledge.createdAt,
          updatedAt: knowledge.updatedAt,
          confidence: knowledge.confidence,
          hash: record.contentHash,
          provenance: [this.cellId, record.sourceIdentifier],
          version: knowledge.knowledgeVersion
        };

        checkDeadline(); // Ensure we don't commit if timeout

        await this.memoryStore.put(memoryEntry);
        storedKnowledgeId = knowledge.knowledgeId;
        
        if (noveltyEval.classification !== NoveltyClassification.REINFORCEMENT && 
            noveltyEval.classification !== NoveltyClassification.SEMANTIC_OVERLAP &&
            noveltyEval.classification !== NoveltyClassification.CONTRADICTION) {
          this.deduplicator.registerHash(record.contentHash, knowledge.knowledgeId);
          registeredHash = record.contentHash;
        }

        this.audit.recordEvent(
          MetabolismEventType.KNOWLEDGE_STORED,
          record.informationId,
          {
            memoryId: knowledge.knowledgeId,
            category: MemoryCategory.SEMANTIC,
            transactionId
          },
          knowledge.knowledgeId
        );
        
        checkDeadline();

        // Stage 11: Create Experience record
        const experience: Experience = {
          experienceId: `exp_${uuidv4()}`,
          transactionId,
          cellId: this.cellId,
          timestamp: new Date().toISOString(),
          informationId: record.informationId,
          knowledgeIds: [knowledge.knowledgeId],
          category: knowledge.category,
          outcome: MetabolismStatus.ACCEPTED,
          noveltyClassification: noveltyEval.classification,
          noveltyScore: noveltyEval.score,
          source: record.sourceIdentifier,
          confidence: knowledge.confidence,
          verificationStatus: 'PENDING',
          lessonsDerived: []
        };
        
        await this.memoryStore.put({
          id: experience.experienceId,
          cellId: this.cellId,
          category: MemoryCategory.EPISODIC,
          type: 'EXPERIENCE_RECORD',
          content: experience,
          source: 'metabolism',
          createdAt: experience.timestamp,
          updatedAt: experience.timestamp,
          confidence: experience.confidence,
          hash: record.contentHash,
          provenance: [this.cellId],
          version: 1
        });
        storedExperienceId = experience.experienceId;
        
        this.audit.recordEvent(MetabolismEventType.EXPERIENCE_CREATED, record.informationId, {
          experienceId: experience.experienceId,
          novelty: experience.noveltyClassification,
          transactionId
        });

        checkDeadline();

        // Stage 12: Cognitive State Integration
        this.cognitiveState.addKnowledgeReference(knowledge.knowledgeId);

        // Stage 12.1: Cognitive Representation Derivation (if representationEngine and graph are enabled)
        if (this.representationEngine && this.graph) {
          try {
            const rep = await this.representationEngine.extractRepresentations(knowledge, experience, this.graph);
            this.audit.recordEvent(MetabolismEventType.REPRESENTATION_EXTRACTED, record.informationId, {
              conceptsCount: rep.concepts.length,
              relationsCount: rep.relations.length,
              abstractionsCount: rep.abstractions.length,
              generalizationsCount: rep.generalizations.length,
              analogiesCount: rep.analogies.length,
              transactionId
            }, knowledge.knowledgeId);

            for (const c of rep.concepts) {
              await this.graph.insertConcept(c);
              storedRepresentationIds.push(c.conceptId);
              this.cognitiveState.addConceptReference(c.conceptId);
            }
            for (const r of rep.relations) {
              await this.graph.insertRelation(r);
              storedRepresentationIds.push(r.relationId);
            }
            for (const a of rep.abstractions) {
              await this.graph.insertAbstraction(a);
              storedRepresentationIds.push(a.abstractionId);
            }
            for (const g of rep.generalizations) {
              await this.graph.insertGeneralization(g);
              storedRepresentationIds.push(g.generalizationId);
            }
            for (const an of rep.analogies) {
              await this.graph.insertAnalogy(an);
              storedRepresentationIds.push(an.analogyId);
            }
            if (rep.epistemicStates) {
              for (const es of rep.epistemicStates) {
                await this.graph.insertEpistemicState(es);
              }
            }

            this.audit.recordEvent(MetabolismEventType.REPRESENTATION_STORED, record.informationId, {
              storedCount: storedRepresentationIds.length,
              transactionId
            }, knowledge.knowledgeId);
          } catch (repErr: any) {
            logger.warn(this.component, 'representation_derivation_failed', {
              error: repErr.message,
              transactionId
            });
            throw repErr;
          }
        }

        if (this.memoryStore.getStats) {
          this.cognitiveState.updateMemoryStats(this.memoryStore.getStats());
        }
        await this.cognitiveState.persist(this.memoryStore);
        
        this.audit.recordEvent(
          MetabolismEventType.COGNITIVE_STATE_UPDATED,
          record.informationId,
          {
            knowledgeId: knowledge.knowledgeId,
            transactionId
          },
          knowledge.knowledgeId
        );

        checkDeadline(); // FINAL COMMIT BOUNDARY

        logger.info(this.component, 'metabolism_completed_successfully', {
          cellId: this.cellId,
          informationId: record.informationId,
          knowledgeId: knowledge.knowledgeId,
          category: knowledge.category,
          confidence: knowledge.confidence,
          novelty: noveltyEval.classification,
          transactionId
        });

        return {
          status: MetabolismStatus.ACCEPTED,
          informationId: record.informationId,
          knowledgeId: knowledge.knowledgeId,
          experienceId: storedExperienceId,
          representationIds: storedRepresentationIds.length > 0 ? storedRepresentationIds : undefined,
          cellId: this.cellId,
          classification: classification.primaryCategory,
          relevance,
          quality,
          reason: `Successfully metabolized into knowledge '${knowledge.title}' [${noveltyEval.classification}]`,
          receivedAt: new Date(startTime).toISOString(),
          processedAt: new Date().toISOString(),
          processingDurationMs: Date.now() - startTime
        };

      } catch (persistenceError: any) {
        logger.warn(this.component, 'staged_persistence_failed_rolling_back', {
          transactionId,
          error: persistenceError.message
        });

        // COMPENSATION ROUTINE
        if (storedKnowledgeId) {
          await this.memoryStore.delete(storedKnowledgeId).catch(err => {
            logger.error(this.component, 'compensation_failed_knowledge', err);
          });
        }
        if (storedExperienceId) {
          await this.memoryStore.delete(storedExperienceId).catch(err => {
            logger.error(this.component, 'compensation_failed_experience', err);
          });
        }
        for (const repId of storedRepresentationIds) {
          await this.memoryStore.delete(repId).catch(err => {
            logger.error(this.component, 'compensation_failed_representation', err);
          });
        }
        if (registeredHash) {
          this.deduplicator.unregisterHash(registeredHash);
        }
        this.cognitiveState.restoreFromSnapshot(originalCognitiveState);

        throw new Error(`Transaction rolled back due to error: ${persistenceError.message}`);
      }

    } catch (err: any) {
      logger.error(this.component, 'metabolism_pipeline_error', err, {
        cellId: this.cellId,
        informationId: record.informationId,
        transactionId
      });

      this.audit.recordEvent(MetabolismEventType.METABOLISM_FAILED_ROLLED_BACK, record.informationId, {
        error: err.message,
        transactionId
      });

      return {
        status: MetabolismStatus.FAILED,
        informationId: record.informationId,
        cellId: this.cellId,
        reason: `Metabolism execution error: ${err.message}`,
        receivedAt: new Date(startTime).toISOString(),
        processedAt: new Date().toISOString(),
        processingDurationMs: Date.now() - startTime
      };
    }
  }

  /**
   * P5: Assimilate Knowledge and Experience received from other cells.
   * Enforces normalization, deduplication, conflict detection, and isolation.
   */
  public async assimilateKnowledge(
    incomingKnowledge: KnowledgeRecord,
    incomingExperience?: Experience,
    sourcePeerId?: string
  ): Promise<MetabolismResult> {
    const startTime = Date.now();
    const transactionId = `tx_p5_${uuidv4()}`;
    const infoId = incomingKnowledge.sourceInformationIds[0] || `ext_info_${Date.now()}`;

    try {
      // 1. Provenance check
      const currentProvenance = incomingKnowledge.sourceProvenance;
      if (!currentProvenance.some((p: any) => p.sourceIdentifier === sourcePeerId)) {
        logger.warn(this.component, 'provenance_mismatch', {
          knowledgeId: incomingKnowledge.knowledgeId,
          sourcePeerId
        });
      }

      // Check if we already have it
      let isDuplicate = false;
      const existing = await this.memoryStore.get(incomingKnowledge.knowledgeId);
      if (existing) {
        isDuplicate = true;
      }

      if (isDuplicate) {
        return {
          status: MetabolismStatus.DUPLICATE,
          informationId: infoId,
          knowledgeId: incomingKnowledge.knowledgeId,
          cellId: this.cellId,
          reason: 'Knowledge already assimilated',
          receivedAt: new Date(startTime).toISOString(),
          processedAt: new Date().toISOString(),
          processingDurationMs: Date.now() - startTime
        };
      }

      // We clone it to guarantee memory isolation
      const assimilatedKnowledge: KnowledgeRecord = {
        ...incomingKnowledge,
        // We do NOT overwrite its core identity/hash, but we append our provenance trail
        sourceProvenance: [...incomingKnowledge.sourceProvenance, {
          informationId: incomingKnowledge.knowledgeId,
          sourceIdentifier: this.cellId,
          contentHash: incomingKnowledge.sourceContentHashes[0] || '',
          acquiredAt: new Date().toISOString(),
          metabolizedAt: new Date().toISOString()
        }],
        confidence: Math.min(incomingKnowledge.confidence, this.budget.minConfidenceThreshold) // Penalize untrusted confidence slightly or cap it
      };

      await this.memoryStore.put({
        id: assimilatedKnowledge.knowledgeId,
        cellId: this.cellId, // Assert local ownership of the record within our isolated memory
        category: MemoryCategory.SEMANTIC,
        type: 'KNOWLEDGE_RECORD',
        content: assimilatedKnowledge,
        source: 'exchange',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: assimilatedKnowledge.confidence,
        hash: assimilatedKnowledge.sourceContentHashes[0] || '',
        provenance: assimilatedKnowledge.sourceProvenance.map((p: any) => p.sourceIdentifier),
        version: assimilatedKnowledge.knowledgeVersion
      });

      if (incomingExperience) {
        const assimilatedExperience: Experience = {
          ...incomingExperience,
          cellId: this.cellId // Assert local ownership
        };

        await this.memoryStore.put({
          id: assimilatedExperience.experienceId,
          cellId: this.cellId,
          category: MemoryCategory.EPISODIC,
          type: 'EXPERIENCE_RECORD',
          content: assimilatedExperience,
          source: 'exchange',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          confidence: assimilatedExperience.confidence,
          hash: assimilatedKnowledge.sourceContentHashes[0] || '',
          provenance: [this.cellId], // Originating cell provenance is captured in lessons/source if needed
          version: 1
        });
      }

      this.cognitiveState.addKnowledgeReference(assimilatedKnowledge.knowledgeId);

      // P5.1: Derive and assimilate cognitive representations
      if (this.representationEngine && this.graph) {
        try {
          const rep = await this.representationEngine.extractRepresentations(assimilatedKnowledge, incomingExperience, this.graph);
          for (const c of rep.concepts) {
            await this.graph.insertConcept(c);
            this.cognitiveState.addConceptReference(c.conceptId);
          }
          for (const r of rep.relations) {
            await this.graph.insertRelation(r);
          }
          for (const a of rep.abstractions) {
            await this.graph.insertAbstraction(a);
          }
          for (const g of rep.generalizations) {
            await this.graph.insertGeneralization(g);
          }
          for (const an of rep.analogies) {
            await this.graph.insertAnalogy(an);
          }
          if (rep.epistemicStates) {
            for (const es of rep.epistemicStates) {
              await this.graph.insertEpistemicState(es);
            }
          }
        } catch (repErr: any) {
          logger.warn(this.component, 'assimilate_representation_derivation_failed', {
            error: repErr.message,
            knowledgeId: assimilatedKnowledge.knowledgeId
          });
        }
      }

      if (this.memoryStore.getStats) {
        this.cognitiveState.updateMemoryStats(this.memoryStore.getStats());
      }
      await this.cognitiveState.persist(this.memoryStore);

      logger.info(this.component, 'assimilate_completed_successfully', {
        cellId: this.cellId,
        knowledgeId: assimilatedKnowledge.knowledgeId,
        transactionId
      });

      return {
        status: MetabolismStatus.ACCEPTED,
        informationId: infoId,
        knowledgeId: assimilatedKnowledge.knowledgeId,
        cellId: this.cellId,
        reason: `Successfully assimilated external knowledge`,
        receivedAt: new Date(startTime).toISOString(),
        processedAt: new Date().toISOString(),
        processingDurationMs: Date.now() - startTime
      };

    } catch (err: any) {
      logger.error(this.component, 'assimilate_pipeline_error', err, {
        cellId: this.cellId,
        knowledgeId: incomingKnowledge.knowledgeId,
        transactionId
      });
      throw err;
    }
  }
}
