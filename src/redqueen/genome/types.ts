import { z } from 'zod';

/**
 * Allowed, strongly typed and security-bounded capabilities for a Red Queen Cell.
 */
export const ALLOWED_CELL_CAPABILITIES = [
  'OSINT_SCAN',
  'KNOWLEDGE_QUERY',
  'PEER_REPLICATION',
  'CODE_ANALYSIS',
  'VULN_EXPLOIT',
  'COGNITIVE_REASONING',
  'SWARM_COORDINATION',
  'MEMORY_MUTATION'
] as const;

export type CellCapability = (typeof ALLOWED_CELL_CAPABILITIES)[number];

export const CellCapability = {
  OSINT_SCAN: 'OSINT_SCAN',
  KNOWLEDGE_QUERY: 'KNOWLEDGE_QUERY',
  PEER_REPLICATION: 'PEER_REPLICATION',
  CODE_ANALYSIS: 'CODE_ANALYSIS',
  VULN_EXPLOIT: 'VULN_EXPLOIT',
  COGNITIVE_REASONING: 'COGNITIVE_REASONING',
  SWARM_COORDINATION: 'SWARM_COORDINATION',
  MEMORY_MUTATION: 'MEMORY_MUTATION'
} as const;

/**
 * Structured, bounded behavioral traits of a Cell's cognitive lineage.
 */
export const CellTraitsSchema = z.object({
  mutationRate: z.number().min(0.0).max(1.0).default(0.05),
  riskTolerance: z.number().min(0.0).max(1.0).default(0.2),
  explorationVsExploitation: z.number().min(0.0).max(1.0).default(0.5),
  maxCognitiveCycleDepth: z.number().int().min(1).default(5)
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
