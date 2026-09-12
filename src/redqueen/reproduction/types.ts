import { z } from 'zod';
import { CellLineage, CellGenome } from '../genome/types';

export enum AuthorizationVerificationState {
  MISSING = 'MISSING',
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  UNTRUSTED_ISSUER = 'UNTRUSTED_ISSUER',
  EXPIRED = 'EXPIRED',
  WRONG_SUBJECT = 'WRONG_SUBJECT',
  WRONG_ACTION = 'WRONG_ACTION',
  WRONG_EVENT = 'WRONG_EVENT',
  VALID = 'VALID'
}

export interface AuthorizationTrustAnchor {
  isTrustedIssuer(publicKey: string, issuer: string): boolean;
}

export class StaticTrustAnchor implements AuthorizationTrustAnchor {
  private trustedMap = new Map<string, string>(); // publicKey -> issuer

  constructor(trustedIssuers?: Array<{ issuer: string; publicKey: string }>) {
    if (trustedIssuers) {
      for (const item of trustedIssuers) {
        this.addTrustedIssuer(item.issuer, item.publicKey);
      }
    }
  }

  public addTrustedIssuer(issuer: string, publicKey: string): void {
    this.trustedMap.set(publicKey.trim(), issuer.trim());
  }

  public isTrustedIssuer(publicKey: string, issuer: string): boolean {
    const expectedIssuer = this.trustedMap.get(publicKey.trim());
    return expectedIssuer !== undefined && expectedIssuer === issuer.trim();
  }
}

export enum ReproductionStage {
  AFTER_PENDING_PERSISTENCE = 'AFTER_PENDING_PERSISTENCE',
  AFTER_CHILD_IDENTITY = 'AFTER_CHILD_IDENTITY',
  AFTER_CHILD_STORAGE = 'AFTER_CHILD_STORAGE',
  AFTER_MEMORY_INHERITANCE = 'AFTER_MEMORY_INHERITANCE',
  AFTER_PARENT_STATE_UPDATE = 'AFTER_PARENT_STATE_UPDATE',
  AFTER_COOLDOWN_PERSISTENCE = 'AFTER_COOLDOWN_PERSISTENCE',
  BEFORE_COMMITTED_PERSISTENCE = 'BEFORE_COMMITTED_PERSISTENCE',
  DURING_COMMITTED_PERSISTENCE = 'DURING_COMMITTED_PERSISTENCE',
  AFTER_COMMITTED_PERSISTENCE = 'AFTER_COMMITTED_PERSISTENCE'
}

export type FailureInjectionHook = (stage: ReproductionStage) => Promise<void> | void;

export type PopulationAnomalyCode =
  | 'MISSING_CHILD_STORAGE'
  | 'ORPHAN_CHILD_STORAGE'
  | 'MALFORMED_CHILD_STORAGE'
  | 'DUPLICATE_CHILD_ID'
  | 'DUPLICATE_EVENT_MAPPING'
  | 'INVALID_LINEAGE'
  | 'INCONSISTENT_GENERATION'
  | 'GENERATION_MISMATCH'
  | 'MALFORMED_REPRODUCTION_RECORD'
  | 'INCOMPLETE_PENDING_EVENT'
  | 'INVALID_EVENT_CHILD_REFERENCE'
  | 'STALE_REPRODUCTION_LOCK';

export interface PopulationAnomaly {
  code: PopulationAnomalyCode;
  message: string;
  cellId?: string;
  eventId?: string;
  details?: any;
}

export interface PopulationConsistencyReport {
  consistent: boolean;
  anomalies: PopulationAnomaly[];
  scannedEvents: number;
  scannedChildren: number;
}

export interface ReproductionCooldownRecord {
  parentCellId: string;
  lastSuccessfulReproductionAt: number;
  cooldownMs: number;
}

export interface ReproductionEventRecord {
  eventId: string;
  parentCellId: string;
  status: 'PENDING' | 'COMMITTED' | 'FAILED';
  childCellId?: string;
  childStoragePath?: string;
  childPublicKey?: string;
  childPrivateKey?: string;
  createdAt: number;
  committedAt?: number;
  mutationSummary?: Record<string, any>;
  differentiationSummary?: Record<string, any>;
  inheritedMemorySummary?: {
    total: number;
    semantic: number;
    episodic: number;
    procedural: number;
  };
  lineageRecord?: any;
  generation: number;
  error?: string;
}

export const MitosisResultSchema = z.object({
  success: z.boolean(),
  parentCellId: z.string(),
  childCellId: z.string().optional(),
  eventId: z.string(),
  generation: z.number(),
  mutationSummary: z.record(z.string(), z.any()).optional(),
  differentiationSummary: z.record(z.string(), z.any()).optional(),
  inheritedMemorySummary: z.object({
    total: z.number(),
    semantic: z.number(),
    episodic: z.number(),
    procedural: z.number()
  }).optional(),
  lineageRecord: z.any().optional(), // Actually CellLineage
  errors: z.array(z.string()).optional()
});

export type MitosisResult = z.infer<typeof MitosisResultSchema>;

export const AuthorizationProofSchema = z.object({
  payload: z.object({
    action: z.string(),
    subject: z.string(),
    eventId: z.string(),
    exp: z.number(),
    issuer: z.string(),
    timestamp: z.number().optional(),
    issuedAt: z.number().optional()
  }),
  signature: z.string(),
  issuerPublicKey: z.string()
});

export type AuthorizationProof = z.infer<typeof AuthorizationProofSchema>;

export const ReproductionPolicySchema = z.object({
  populationCeiling: z.number().int().min(1).default(10),
  cooldownMs: z.number().int().min(0).default(60000), // Minimum time between reproductions
  minMemoryPressure: z.number().min(0.0).max(1.0).default(0.7),
  requireAuthorization: z.boolean().default(true),
  allowDifferentiation: z.boolean().default(true),
  memoryCapacity: z.number().int().min(1).default(100), // Logical capacity for pressure calculation
  trustedIssuers: z.array(z.object({
    issuer: z.string(),
    publicKey: z.string()
  })).optional()
});

export type ReproductionPolicy = z.infer<typeof ReproductionPolicySchema>;
