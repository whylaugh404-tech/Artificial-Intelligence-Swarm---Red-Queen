import { z } from 'zod';

/**
 * Allowed, strongly typed and security-bounded capabilities for a Red Queen Cell.
 * Note: Offensive exploitation capabilities (VULN_EXPLOIT) are strictly forbidden and excluded.
 */
export const ALLOWED_CELL_CAPABILITIES = [
  'OSINT_SCAN',
  'INFO_PROCESSING',
  'KNOWLEDGE_QUERY',
  'CODE_ANALYSIS',
  'COGNITIVE_REASONING',
  'SWARM_COORDINATION',
  'AUTHORIZED_MEMORY_OPS',
  'PEER_REPLICATION',
  'MEMORY_MUTATION'
] as const;

export type CellCapability = (typeof ALLOWED_CELL_CAPABILITIES)[number];

export const CellCapability = {
  OSINT_SCAN: 'OSINT_SCAN',
  INFO_PROCESSING: 'INFO_PROCESSING',
  KNOWLEDGE_QUERY: 'KNOWLEDGE_QUERY',
  CODE_ANALYSIS: 'CODE_ANALYSIS',
  COGNITIVE_REASONING: 'COGNITIVE_REASONING',
  SWARM_COORDINATION: 'SWARM_COORDINATION',
  AUTHORIZED_MEMORY_OPS: 'AUTHORIZED_MEMORY_OPS',
  PEER_REPLICATION: 'PEER_REPLICATION', // Reserved metadata for P6 Mitosis (non-executable in P3/P4)
  MEMORY_MUTATION: 'MEMORY_MUTATION'   // Reserved metadata for P4 Information Metabolism (non-executable in P3)
} as const;

/**
 * Milestone-gated capabilities that exist as lineage metadata only and are
 * explicitly forbidden from autonomous execution in current architecture.
 */
export const MILESTONE_RESERVED_CAPABILITIES = [
  'PEER_REPLICATION', // P6 Mitosis milestone
  'MEMORY_MUTATION'   // P4 Information Metabolism milestone
] as const;

/**
 * Verifies if a given capability is authorized and executable in the current Cell architecture.
 */
export function isCapabilityExecutable(capability: string): boolean {
  if (capability === 'VULN_EXPLOIT') return false;
  if (MILESTONE_RESERVED_CAPABILITIES.includes(capability as any)) {
    return false;
  }
  return ALLOWED_CELL_CAPABILITIES.includes(capability as any);
}

/**
 * Asserts that a capability is active and executable, throwing a security error if attempted prematurely.
 */
export function assertCapabilityExecutable(capability: string): void {
  if (capability === 'VULN_EXPLOIT') {
    throw new Error('Security Violation: Offensive exploitation capabilities (VULN_EXPLOIT) are strictly forbidden.');
  }
  if (capability === 'PEER_REPLICATION') {
    throw new Error('Execution Gate: PEER_REPLICATION is reserved for P6 Mitosis and cannot be autonomously executed.');
  }
  if (capability === 'MEMORY_MUTATION') {
    throw new Error('Execution Gate: MEMORY_MUTATION is reserved for P4 Information Metabolism and cannot be autonomously executed.');
  }
  if (!ALLOWED_CELL_CAPABILITIES.includes(capability as any)) {
    throw new Error(`Security Violation: Unauthorized capability '${capability}'.`);
  }
}

/**
 * Structured, bounded behavioral traits of a Cell's cognitive lineage.
 */
export const CellTraitsSchema = z.object({
  mutationRate: z.number().min(0.0).max(1.0).default(0.05),
  riskTolerance: z.number().min(0.0).max(1.0).default(0.2),
  explorationVsExploitation: z.number().min(0.0).max(1.0).default(0.5),
  maxCognitiveCycleDepth: z.number().int().min(1).default(5),
  executionParallelism: z.number().int().min(1).default(1)
});

export type CellTraits = z.infer<typeof CellTraitsSchema>;

/**
 * Cell Lineage representation for genealogical tracking across generations.
 */
export const CellLineageSchema = z.object({
  lineageId: z.string().min(1, 'lineageId cannot be empty'),
  generation: z.number().int().min(0, 'generation must be a non-negative integer'),
  parentGenomeId: z.string().nullable(),
  parentCellId: z.string().nullable(),
  ancestorGenomeIds: z.array(z.string()).default([]),
  ancestorCellIds: z.array(z.string()).default([])
});

export type CellLineage = z.infer<typeof CellLineageSchema>;

/**
 * Strongly typed Cell Genome schema.
 * Represents the inheritable cognitive substrate and configuration of a Cell.
 */
export const CellGenomeSchema = z.object({
  genomeId: z.string().min(1, 'genomeId cannot be empty'),
  parentGenomeId: z.string().nullable(),
  parentCellId: z.string().nullable(),
  generation: z.number().int().min(0, 'generation must be a non-negative integer'),
  lineageId: z.string().min(1, 'lineageId must be non-empty'),
  createdAt: z.string().datetime({ message: 'createdAt must be an ISO 8601 date string' }),
  logicVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'logicVersion must follow semver format (e.g. 1.0.0)'),
  traits: CellTraitsSchema,
  capabilities: z.array(z.enum(ALLOWED_CELL_CAPABILITIES)).min(1, 'Cell must have at least one capability'),
  specialization: z.string().nullable(),
  genomeVersion: z.number().int().min(1, 'genomeVersion must be >= 1').default(1),
  ancestorGenomeIds: z.array(z.string()).default([]),
  ancestorCellIds: z.array(z.string()).default([])
});

export type CellGenome = z.infer<typeof CellGenomeSchema>;

export interface CreateGenomeParams {
  genomeId?: string;
  parentGenomeId?: string | null;
  parentCellId?: string | null;
  generation?: number;
  lineageId?: string;
  createdAt?: string;
  logicVersion?: string;
  traits?: Partial<CellTraits>;
  capabilities?: CellCapability[];
  specialization?: string | null;
  genomeVersion?: number;
  ancestorGenomeIds?: string[];
  ancestorCellIds?: string[];
}

export interface DeriveGenomeOptions {
  genomeId?: string;
  specialization?: string | null;
  traits?: Partial<CellTraits>;
  capabilities?: CellCapability[];
  logicVersion?: string;
  genomeVersion?: number;
}
