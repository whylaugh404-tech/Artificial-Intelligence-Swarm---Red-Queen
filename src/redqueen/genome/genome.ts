import { randomUUID } from 'crypto';
import {
  CellGenome,
  CellGenomeSchema,
  CellLineage,
  CellLineageSchema,
  CreateGenomeParams,
  DeriveGenomeOptions,
  ALLOWED_CELL_CAPABILITIES,
  CellCapability
} from './types';
import { logger } from '../core/logger';

const COMPONENT = 'genome';

/**
 * Recursively freezes an object and its nested properties to guarantee runtime immutability.
 */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as any)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * Creates a Genesis (Generation 0) Genome for a new Cell lineage.
 */
export function createGenesisGenome(params?: CreateGenomeParams): CellGenome {
  const now = new Date().toISOString();
  const lineageId = params?.lineageId || randomUUID().replace(/-/g, '');
  const genomeId = params?.genomeId || randomUUID().replace(/-/g, '');

  const raw = {
    genomeId,
    parentGenomeId: params?.parentGenomeId ?? null,
    parentCellId: params?.parentCellId ?? null,
    generation: params?.generation ?? 0,
    lineageId,
    createdAt: params?.createdAt || now,
    logicVersion: params?.logicVersion || '1.0.0',
    traits: {
      mutationRate: 0.05,
      riskTolerance: 0.2,
      explorationVsExploitation: 0.5,
      maxCognitiveCycleDepth: 5,
      ...params?.traits
    },
    capabilities: params?.capabilities || [
      'OSINT_SCAN',
      'INFO_PROCESSING',
      'KNOWLEDGE_QUERY',
      'COGNITIVE_REASONING',
      'SWARM_COORDINATION'
    ],
    specialization: params?.specialization ?? null,
    genomeVersion: params?.genomeVersion ?? 1,
    ancestorGenomeIds: params?.ancestorGenomeIds ?? [],
    ancestorCellIds: params?.ancestorCellIds ?? []
  };

  const parsed = CellGenomeSchema.parse(raw);
  logger.info(COMPONENT, 'genesis_genome_created', { genomeId: parsed.genomeId, lineageId: parsed.lineageId });
  return deepFreeze(parsed);
}

/**
 * Derives a progeny Genome from a parent Cell's genome.
 * Advances generation counter and chains lineage records immutably.
 */
export function deriveProgenyGenome(
  parentGenome: CellGenome,
  parentCellId: string,
  options?: DeriveGenomeOptions
): CellGenome {
  const now = new Date().toISOString();
  const progenyGenomeId = options?.genomeId || randomUUID().replace(/-/g, '');

  // Lineage Invariant 1: Progeny cannot equal parent or any ancestor genome ID (prevents cycle)
  if (progenyGenomeId === parentGenome.genomeId || (parentGenome.ancestorGenomeIds && parentGenome.ancestorGenomeIds.includes(progenyGenomeId))) {
    throw new Error(`Cyclic lineage detected: progeny genomeId '${progenyGenomeId}' is already an ancestor`);
  }

  // Lineage Invariant 2: Cannot self-derive in a loop if parentCellId already exists in ancestor chains
  if (parentGenome.ancestorCellIds && parentGenome.ancestorCellIds.includes(parentCellId)) {
    throw new Error(`Cyclic lineage detected: parentCellId '${parentCellId}' is already in ancestor cell chain`);
  }

  // Inherit or selectively restrict capabilities
  const capabilities = options?.capabilities ? [...options.capabilities] : [...parentGenome.capabilities];
  for (const cap of capabilities) {
    if (!ALLOWED_CELL_CAPABILITIES.includes(cap)) {
      throw new Error(`Invalid capability: ${cap}`);
    }
  }

  const raw = {
    genomeId: progenyGenomeId,
    parentGenomeId: parentGenome.genomeId,
    parentCellId: parentCellId,
    generation: parentGenome.generation + 1,
    lineageId: parentGenome.lineageId,
    createdAt: now,
    logicVersion: options?.logicVersion || parentGenome.logicVersion,
    traits: {
      ...parentGenome.traits,
      ...options?.traits
    },
    capabilities,
    specialization: options?.specialization !== undefined ? options.specialization : parentGenome.specialization,
    genomeVersion: options?.genomeVersion || (parentGenome.genomeVersion + 1),
    ancestorGenomeIds: [...(parentGenome.ancestorGenomeIds || []), parentGenome.genomeId],
    ancestorCellIds: [...(parentGenome.ancestorCellIds || []), parentCellId]
  };

  const parsed = CellGenomeSchema.parse(raw);
  logger.info(COMPONENT, 'progeny_genome_derived', {
    parentGenomeId: parentGenome.genomeId,
    progenyGenomeId: parsed.genomeId,
    generation: parsed.generation
  });
  return deepFreeze(parsed);
}

/**
 * Constructs a genealogical Lineage view from a Cell's Genome.
 */
export function constructLineage(genome: CellGenome): CellLineage {
  const raw = {
    lineageId: genome.lineageId,
    generation: genome.generation,
    parentGenomeId: genome.parentGenomeId,
    parentCellId: genome.parentCellId,
    ancestorGenomeIds: genome.ancestorGenomeIds || [],
    ancestorCellIds: genome.ancestorCellIds || []
  };

  return deepFreeze(CellLineageSchema.parse(raw));
}

/**
 * Validates a candidate genome object against schema and behavioral constraints.
 */
export function validateGenome(candidate: unknown): {
  valid: boolean;
  genome?: CellGenome;
  errors?: string[];
} {
  const result = CellGenomeSchema.safeParse(candidate);
  if (!result.success) {
    const issues = result.error.issues || (result.error as any).errors || [];
    return {
      valid: false,
      errors: issues.map(e => `${e.path.join('.')}: ${e.message}`)
    };
  }

  return {
    valid: true,
    genome: result.data
  };
}
