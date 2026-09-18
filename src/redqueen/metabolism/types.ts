import { z } from 'zod';

/**
 * Standard Information Source Types
 */
export enum InformationSourceType {
  PUBLIC_WEB = 'PUBLIC_WEB',
  DOCUMENT = 'DOCUMENT',
  USER_PROVIDED = 'USER_PROVIDED',
  CELL_KNOWLEDGE = 'CELL_KNOWLEDGE',
  API = 'API',
  LOCAL_DATA = 'LOCAL_DATA'
}

export const InformationSourceTypeSchema = z.nativeEnum(InformationSourceType);

/**
 * Standard Information Categories
 */
export enum InformationCategory {
  CYBERSECURITY = 'CYBERSECURITY',
  PROGRAMMING = 'PROGRAMMING',
  OPERATING_SYSTEM = 'OPERATING_SYSTEM',
  NETWORKING = 'NETWORKING',
  SOFTWARE = 'SOFTWARE',
  HARDWARE = 'HARDWARE',
  AI = 'AI',
  COMPUTER_SCIENCE = 'COMPUTER_SCIENCE',
  GENERAL_TECHNOLOGY = 'GENERAL_TECHNOLOGY',
  UNKNOWN = 'UNKNOWN'
}

export const InformationCategorySchema = z.nativeEnum(InformationCategory);

export enum NoveltyClassification {
  EXACT_DUPLICATE = 'EXACT_DUPLICATE',
  SEMANTIC_OVERLAP = 'SEMANTIC_OVERLAP',
  NOVEL = 'NOVEL',
  REINFORCEMENT = 'REINFORCEMENT',
  CONTRADICTION = 'CONTRADICTION'
}

export const NoveltyClassificationSchema = z.nativeEnum(NoveltyClassification);

/**
 * Supported Content Types
 */
export const SUPPORTED_CONTENT_TYPES = [
  'text/plain',
  'text/markdown',
  'text/html',
  'application/json',
  'application/xml',
  'text/csv'
] as const;

export type SupportedContentType = typeof SUPPORTED_CONTENT_TYPES[number];

/**
 * Raw input allowed to be passed into ingestion before full validation/normalization
 */
export interface InformationRecordInput {
  informationId?: string;
  sourceType: InformationSourceType | keyof typeof InformationSourceType;
  sourceUri?: string;
  sourceIdentifier?: string;
  acquiredAt?: string;
  content: string;
  contentType?: string;
  language?: string;
  contentHash?: string;
  metadata?: Record<string, any>;
  originatingCellId?: string;
}

/**
 * Validated, immutable Information Record representing incoming data for metabolism.
 */
export interface InformationRecord {
  readonly informationId: string;
  readonly sourceType: InformationSourceType;
  readonly sourceIdentifier: string;
  readonly sourceUri?: string;
  readonly acquiredAt: string;
  readonly content: string;
  readonly contentType: string;
  readonly language: string;
  readonly contentHash: string;
  readonly metadata: Readonly<Record<string, any>>;
  readonly originatingCellId?: string;
}

export const InformationRecordSchema = z.object({
  informationId: z.string().min(1).max(256),
  sourceType: InformationSourceTypeSchema,
  sourceIdentifier: z.string().min(1).max(1024),
  sourceUri: z.string().max(2048).optional(),
  acquiredAt: z.string().datetime(),
  content: z.string().min(1),
  contentType: z.string().min(1).max(128),
  language: z.string().min(2).max(16).default('en'),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/, 'Must be a 64-character lowercase hex SHA-256 hash'),
  metadata: z.record(z.string(), z.any()).default({}),
  originatingCellId: z.string().max(256).optional()
});

/**
 * Structured Relevance Evaluation Result
 */
export interface RelevanceEvaluation {
  readonly relevanceScore: number; // [0.0, 1.0]
  readonly matchedSpecialization: string | null;
  readonly noveltyScore: number; // [0.0, 1.0]
  readonly reason: string;
  readonly matchedCategories: readonly InformationCategory[];
}

/**
 * Structured Quality & Confidence Evaluation Result
 */
export interface QualityEvaluation {
  readonly qualityScore: number; // [0.0, 1.0]
  readonly confidence: number; // [0.0, 1.0]
  readonly factors: {
    readonly sourceCredibility: number;
    readonly contentCompleteness: number;
    readonly structureScore: number;
  };
  readonly reason: string;
}

/**
 * Structured Source Provenance entry
 */
export interface SourceProvenance {
  readonly informationId: string;
  readonly sourceIdentifier: string;
  readonly sourceUri?: string;
  readonly contentHash: string;
  readonly acquiredAt: string;
  readonly originatingCellId?: string;
  readonly metabolizedAt: string;
}

export const SourceProvenanceSchema = z.object({
  informationId: z.string(),
  sourceIdentifier: z.string(),
  sourceUri: z.string().optional(),
  contentHash: z.string(),
  acquiredAt: z.string(),
  originatingCellId: z.string().optional(),
  metabolizedAt: z.string()
});

/**
 * Concept Relationship
 */
export interface ConceptRelation {
  readonly subject: string;
  readonly predicate: string;
  readonly object: string;
  readonly confidence: number;
  readonly provenance: string;
}

export const ConceptRelationSchema = z.object({
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  confidence: z.number().min(0).max(1),
  provenance: z.string()
});

/**
 * Structured Knowledge Record formed through metabolism and stored in memory.
 */
export interface KnowledgeRecord {
  readonly knowledgeId: string;
  readonly owningCellId: string;
  readonly category: InformationCategory;
  readonly title: string;
  readonly summary: string;
  readonly facts: readonly string[];
  readonly relationships: readonly ConceptRelation[];
  readonly contradictions: readonly string[];
  readonly structuredContent: Readonly<Record<string, any>>;
  readonly sourceInformationIds: readonly string[];
  readonly sourceContentHashes: readonly string[];
  readonly sourceProvenance: readonly SourceProvenance[];
  readonly reinforcementCount: number;
  readonly confidence: number; // [0.0, 1.0]
  readonly relevance: number; // [0.0, 1.0]
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly knowledgeVersion: number;
}

export const KnowledgeRecordSchema = z.object({
  knowledgeId: z.string().min(1).max(256),
  owningCellId: z.string().min(1).max(256),
  category: InformationCategorySchema,
  title: z.string().min(1).max(512),
  summary: z.string().min(1).max(4096),
  facts: z.array(z.string().min(1)),
  relationships: z.array(ConceptRelationSchema).default([]),
  contradictions: z.array(z.string()).default([]),
  structuredContent: z.record(z.string(), z.any()),
  sourceInformationIds: z.array(z.string().min(1)),
  sourceContentHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
  sourceProvenance: z.array(SourceProvenanceSchema),
  reinforcementCount: z.number().int().min(0).default(0),
  confidence: z.number().min(0).max(1),
  relevance: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  knowledgeVersion: z.number().int().min(1)
});

/**
 * Lightweight Cell-Scoped Knowledge Gap
 */
export interface KnowledgeGap {
  readonly gapId: string;
  readonly cellId: string;
  readonly topic: string;
  readonly category: InformationCategory;
  readonly reason: string;
  readonly priority: number; // [0.0, 1.0]
  readonly createdAt: string;
}

export const KnowledgeGapSchema = z.object({
  gapId: z.string().min(1),
  cellId: z.string().min(1),
  topic: z.string().min(1),
  category: InformationCategorySchema,
  reason: z.string().min(1),
  priority: z.number().min(0).max(1),
  createdAt: z.string().datetime()
});

/**
 * Outcome status of a metabolism cycle
 */
export enum MetabolismStatus {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  DUPLICATE = 'DUPLICATE',
  LOW_RELEVANCE = 'LOW_RELEVANCE',
  INVALID = 'INVALID',
  FAILED = 'FAILED'
}

export const MetabolismStatusSchema = z.nativeEnum(MetabolismStatus);

/**
 * Lightweight Cell-Scoped Experience Record
 */
export interface Experience {
  readonly experienceId: string;
  readonly transactionId: string;
  readonly cellId: string;
  readonly timestamp: string;
  readonly informationId: string;
  readonly knowledgeIds: readonly string[];
  readonly category: InformationCategory;
  readonly outcome: MetabolismStatus;
  readonly noveltyClassification: NoveltyClassification;
  readonly noveltyScore: number;
  readonly source: string;
  readonly confidence: number;
  readonly verificationStatus?: string;
  readonly lessonsDerived?: readonly string[];
}

export const ExperienceSchema = z.object({
  experienceId: z.string().min(1),
  transactionId: z.string().min(1),
  cellId: z.string().min(1),
  timestamp: z.string().datetime(),
  informationId: z.string().min(1),
  knowledgeIds: z.array(z.string()),
  category: InformationCategorySchema,
  outcome: MetabolismStatusSchema,
  noveltyClassification: NoveltyClassificationSchema,
  noveltyScore: z.number().min(0).max(1),
  source: z.string().min(1),
  confidence: z.number().min(0).max(1),
  verificationStatus: z.string().optional(),
  lessonsDerived: z.array(z.string()).optional()
});

/**
 * Structured Metabolism Result
 */
export interface MetabolismResult {
  readonly status: MetabolismStatus;
  readonly informationId: string;
  readonly knowledgeId?: string;
  readonly experienceId?: string;
  readonly representationIds?: string[];
  readonly cellId: string;
  readonly classification?: InformationCategory;
  readonly relevance?: RelevanceEvaluation;
  readonly quality?: QualityEvaluation;
  readonly reason: string;
  readonly receivedAt: string;
  readonly processedAt: string;
  readonly processingDurationMs: number;
}

/**
 * Metabolism Audit Trail Event Types
 */
export enum MetabolismEventType {
  INFORMATION_RECEIVED = 'INFORMATION_RECEIVED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  NORMALIZED = 'NORMALIZED',
  CLASSIFIED = 'CLASSIFIED',
  EVALUATED = 'EVALUATED',
  DUPLICATE_DETECTED = 'DUPLICATE_DETECTED',
  LOW_RELEVANCE_DROPPED = 'LOW_RELEVANCE_DROPPED',
  KNOWLEDGE_CREATED = 'KNOWLEDGE_CREATED',
  KNOWLEDGE_REINFORCED = 'KNOWLEDGE_REINFORCED',
  KNOWLEDGE_CONFLICT_DETECTED = 'KNOWLEDGE_CONFLICT_DETECTED',
  KNOWLEDGE_STORED = 'KNOWLEDGE_STORED',
  EXPERIENCE_CREATED = 'EXPERIENCE_CREATED',
  KNOWLEDGE_GAP_CREATED = 'KNOWLEDGE_GAP_CREATED',
  COGNITIVE_STATE_UPDATED = 'COGNITIVE_STATE_UPDATED',
  REPRESENTATION_EXTRACTED = 'REPRESENTATION_EXTRACTED',
  REPRESENTATION_STORED = 'REPRESENTATION_STORED',
  METABOLISM_FAILED = 'METABOLISM_FAILED',
  METABOLISM_FAILED_ROLLED_BACK = 'METABOLISM_FAILED_ROLLED_BACK'
}

/**
 * Metabolism Audit Event
 */
export interface MetabolismEvent {
  readonly eventId: string;
  readonly eventType: MetabolismEventType;
  readonly cellId: string;
  readonly informationId: string;
  readonly knowledgeId?: string;
  readonly timestamp: string;
  readonly details: Readonly<Record<string, any>>;
}

/**
 * Defensive Resource Limits & Budget Configuration for Information Metabolism
 */
export interface MetabolismBudget {
  readonly maxInformationSize: number; // Max characters in raw content (default 512 KB)
  readonly maxKnowledgeRecordSize: number; // Max characters in generated knowledge
  readonly minRelevanceThreshold: number; // Min relevance to proceed to knowledge extraction (0.0 - 1.0)
  readonly minQualityThreshold: number; // Min quality to proceed (0.0 - 1.0)
  readonly minConfidenceThreshold: number; // Min confidence to accept (0.0 - 1.0)
  readonly maxFactsPerRecord: number; // Maximum facts extracted per knowledge record
  readonly maxAuditEventsKept: number; // Ring buffer size for audit events
  readonly maxProcessingTimeMs: number; // Timeout limit for metabolism cycle
}

export const DEFAULT_METABOLISM_BUDGET: MetabolismBudget = {
  maxInformationSize: 524288, // 512 KB
  maxKnowledgeRecordSize: 65536, // 64 KB
  minRelevanceThreshold: 0.15,
  minQualityThreshold: 0.15,
  minConfidenceThreshold: 0.15,
  maxFactsPerRecord: 50,
  maxAuditEventsKept: 500,
  maxProcessingTimeMs: 10000
};
