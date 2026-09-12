import * as fs from 'fs/promises';
import * as path from 'path';
import { Cell } from '../core/cell';
import { MemoryCategory } from '../memory/store';
import { identityCrypto } from '../crypto/identity';
import { validateGenome } from '../genome/genome';
import {
  PopulationConsistencyReport,
  PopulationAnomaly,
  ReproductionEventRecord
} from './types';

/**
 * Validates the physical and structural integrity of a child cell storage file.
 * Validates:
 * - Physical storage existence and valid entries format.
 * - Cryptographic identity file (.identity) existence.
 * - publicKey <-> nodeId derivation via deriveNodeId().
 * - publicKey <-> privateKey validity via isValidKeyPair().
 * - Full genome schema validation via validateGenome().
 * - parentCellId, generation, and lineageId consistency.
 * - Reproduction eventId anchoring.
 */
export async function validateChildIntegrity(
  childStoragePath: string,
  parentCellId: string,
  expectedGeneration: number,
  expectedEventId?: string,
  expectedLineageId?: string
): Promise<{ valid: boolean; reason?: string; childNodeId?: string; childGenome?: any }> {
  try {
    const raw = await fs.readFile(childStoragePath, 'utf8');
    if (!raw || raw.trim().length === 0) {
      return { valid: false, reason: 'Child storage file is empty (0 bytes)' };
    }

    let entries: any[];
    try {
      entries = JSON.parse(raw);
    } catch (parseErr: any) {
      return { valid: false, reason: `Child storage JSON is malformed: ${parseErr.message}` };
    }

    if (!Array.isArray(entries)) {
      return { valid: false, reason: 'Child storage root is not a memory entries array' };
    }

    // 1. Validate identity file and cryptographic invariants
    const identityPath = `${childStoragePath}.identity`;
    let identityRaw: string;
    try {
      identityRaw = await fs.readFile(identityPath, 'utf8');
    } catch (idErr: any) {
      return { valid: false, reason: `Child identity file missing or unreadable: ${idErr.message}` };
    }

    let identity: any;
    try {
      identity = JSON.parse(identityRaw);
    } catch (parseErr: any) {
      return { valid: false, reason: `Child identity JSON is malformed: ${parseErr.message}` };
    }

    if (!identity || typeof identity !== 'object') {
      return { valid: false, reason: 'Child identity is not an object' };
    }

    if (!identity.publicKey || typeof identity.publicKey !== 'string' || !identityCrypto.isValidPublicKey(identity.publicKey)) {
      return { valid: false, reason: 'Child identity has invalid or missing publicKey' };
    }

    if (!identity.nodeId || typeof identity.nodeId !== 'string') {
      return { valid: false, reason: 'Child identity has invalid or missing nodeId' };
    }

    // Invariant: publicKey <-> nodeId using deriveNodeId()
    const derivedNodeId = identityCrypto.deriveNodeId(identity.publicKey);
    if (derivedNodeId !== identity.nodeId) {
      return {
        valid: false,
        reason: `Child nodeId derivation mismatch: derived '${derivedNodeId}' from publicKey, but identity has '${identity.nodeId}'`,
        childNodeId: identity.nodeId
      };
    }

    // Invariant: publicKey <-> privateKey
    if (!identity.privateKey || typeof identity.privateKey !== 'string') {
      return { valid: false, reason: 'Child identity missing privateKey', childNodeId: identity.nodeId };
    }
    if (!identityCrypto.isValidKeyPair(identity.publicKey, identity.privateKey)) {
      return {
        valid: false,
        reason: 'Child publicKey and privateKey do not form a valid cryptographic keypair',
        childNodeId: identity.nodeId
      };
    }

    const childNodeId = identity.nodeId;

    // 2. Locate and fully validate genome entry
    const genomeEntry = entries.find((e: any) => e.id && typeof e.id === 'string' && e.id.startsWith('cell_genome_'));
    if (!genomeEntry || !genomeEntry.content) {
      return { valid: false, reason: 'Child storage lacks valid cell_genome memory entry', childNodeId };
    }

    if (genomeEntry.cellId && genomeEntry.cellId !== childNodeId) {
      return {
        valid: false,
        reason: `Child genome entry cellId '${genomeEntry.cellId}' does not match child nodeId '${childNodeId}'`,
        childNodeId
      };
    }

    // Full schema validation of genome
    const genomeValidation = validateGenome(genomeEntry.content);
    if (!genomeValidation.valid || !genomeValidation.genome) {
      return {
        valid: false,
        reason: `Child genome schema validation failed: ${genomeValidation.errors.join('; ')}`,
        childNodeId
      };
    }

    const genome = genomeValidation.genome;

    // Invariant: parentCellId validation
    if (genome.parentCellId !== parentCellId) {
      return {
        valid: false,
        reason: `Child genome parentCellId mismatch: expected '${parentCellId}', found '${genome.parentCellId}'`,
        childNodeId,
        childGenome: genome
      };
    }

    // Invariant: generation validation
    if (genome.generation !== expectedGeneration) {
      return {
        valid: false,
        reason: `Child genome generation mismatch: expected ${expectedGeneration}, found ${genome.generation}`,
        childNodeId,
        childGenome: genome
      };
    }

    // Invariant: lineageId validation
    if (!genome.lineageId || typeof genome.lineageId !== 'string' || genome.lineageId.trim().length === 0) {
      return { valid: false, reason: 'Child genome lacks valid lineageId', childNodeId, childGenome: genome };
    }
    if (expectedLineageId && genome.lineageId !== expectedLineageId) {
      return {
        valid: false,
        reason: `Child genome lineageId mismatch: expected '${expectedLineageId}', found '${genome.lineageId}'`,
        childNodeId,
        childGenome: genome
      };
    }

    // Invariant: reproduction eventId validation
    if (expectedEventId) {
      const originEntry = entries.find((e: any) => e.id === `cell_origin_${childNodeId}`);
      const matchesOrigin = originEntry && originEntry.content && originEntry.content.eventId === expectedEventId;
      const matchesProvenance = entries.some((e: any) => {
        if (Array.isArray(e.provenance)) {
          return e.provenance.some((p: any) =>
            typeof p === 'string' && (p === expectedEventId || p.includes(`via_${expectedEventId}`) || p.includes(expectedEventId))
          );
        }
        return false;
      });

      if (!matchesOrigin && !matchesProvenance) {
        return {
          valid: false,
          reason: `Child storage does not anchor expected reproduction eventId '${expectedEventId}'`,
          childNodeId,
          childGenome: genome
        };
      }
    }

    return { valid: true, childNodeId, childGenome: genome };
  } catch (err: any) {
    return { valid: false, reason: `Child storage file access failed: ${err.message}` };
  }
}

export interface ChildEventValidationOptions {
  childStoragePath: string;
  expectedChildId?: string;
  parentCellId: string;
  parentGeneration: number;
  eventId: string;
  openRouterApiKey?: string;
}

export interface ChildEventValidationResult {
  valid: boolean;
  errors: string[];
  childNodeId?: string;
  reconstructedChild?: Cell;
}

/**
 * Validates a persisted child cell storage against a specific reproduction event.
 */
export async function validatePersistedChildForEvent(
  options: ChildEventValidationOptions
): Promise<ChildEventValidationResult> {
  const errors: string[] = [];
  try {
    const raw = await fs.readFile(options.childStoragePath, 'utf8');
    if (!raw || raw.trim().length === 0) {
      return { valid: false, errors: ['Child storage file is empty (0 bytes)'] };
    }

    let entries: any[];
    try {
      entries = JSON.parse(raw);
    } catch (parseErr: any) {
      return { valid: false, errors: [`Child storage JSON is malformed: ${parseErr.message}`] };
    }

    if (!Array.isArray(entries)) {
      return { valid: false, errors: ['Child storage root is not a memory entries array'] };
    }

    // 1. Locate identity entry
    const identityEntry = entries.find((e: any) => e.id && typeof e.id === 'string' && e.id.startsWith('cell_identity_'));
    // Legacy support for fallback
    let hasIdentity = !!identityEntry;
    if (!hasIdentity) {
      try {
        await fs.access(`${options.childStoragePath}.identity`);
        hasIdentity = true;
      } catch {}
    }
    if (!hasIdentity) {
      errors.push('Child storage lacks valid cell_identity memory entry');
    } else if (identityEntry && identityEntry.content) {
      const idContent = identityEntry.content;
      if (!idContent.publicKey || typeof idContent.publicKey !== 'string') {
        errors.push('Child identity lacks publicKey');
      }
    }

    // 2. Locate genome entry
    const genomeEntry = entries.find((e: any) => e.id && typeof e.id === 'string' && e.id.startsWith('cell_genome_'));
    if (!genomeEntry || !genomeEntry.content) {
      errors.push('Child storage lacks valid cell_genome memory entry');
    } else {
      const genome = genomeEntry.content;
      const childNodeId = genomeEntry.cellId || genome.nodeId;
      if (options.expectedChildId && childNodeId !== options.expectedChildId) {
        errors.push(`Child node ID mismatch: expected '${options.expectedChildId}', found '${childNodeId}'`);
      }
      if (genome.parentCellId !== options.parentCellId) {
        errors.push(`Child genome parentCellId mismatch: expected '${options.parentCellId}', found '${genome.parentCellId}'`);
      }
      if (genome.generation !== options.parentGeneration + 1) {
        errors.push(`Child genome generation mismatch: expected ${options.parentGeneration + 1}, found ${genome.generation}`);
      }
      if (!genome.lineageId) {
        errors.push('Child genome lacks lineageId');
      }
    }

    // 3. Attempt clean reconstruction via Cell.loadFromStorage if openRouterApiKey is provided
    let reconstructedChild: Cell | undefined;
    if (errors.length === 0 && options.openRouterApiKey) {
      try {
        reconstructedChild = await Cell.loadFromStorage(
          options.childStoragePath,
          options.openRouterApiKey,
          undefined,
          {
            parentCellId: options.parentCellId,
            generation: options.parentGeneration + 1
          }
        );
      } catch (loadErr: any) {
        errors.push(`Child cell reconstruction from storage failed: ${loadErr.message}`);
      }
    }

    const childNodeId = options.expectedChildId || (genomeEntry ? (genomeEntry.cellId || genomeEntry.content?.nodeId) : undefined);

    return {
      valid: errors.length === 0,
      errors,
      childNodeId,
      reconstructedChild
    };
  } catch (err: any) {
    return {
      valid: false,
      errors: [`Child storage file access failed: ${err.message}`]
    };
  }
}

/**
 * Audits reproduction consistency for an individual parent cell.
 * Detects:
 * - parent says child committed but child storage missing
 * - duplicate child IDs across events
 * - duplicate event-to-child mappings
 * - invalid lineage
 * - inconsistent generation
 * - malformed reproduction records
 */
export async function auditParentReproductionConsistency(
  parent: Cell
): Promise<PopulationConsistencyReport> {
  const anomalies: PopulationAnomaly[] = [];
  let scannedEvents = 0;
  let scannedChildren = 0;

  const childIdToEvents = new Map<string, string[]>();

  // Fetch all procedural memories
  const entries = await parent.memory.search({ category: MemoryCategory.PROCEDURAL });
  const eventEntries = entries.filter(e => e.id && e.id.startsWith('reproduction_event_'));

  for (const entry of eventEntries) {
    scannedEvents++;
    const content = entry.content as Partial<ReproductionEventRecord> | undefined;

    // Check malformed reproduction record
    if (!content || typeof content !== 'object' || !content.eventId || !content.status) {
      anomalies.push({
        code: 'MALFORMED_REPRODUCTION_RECORD',
        message: `Event entry '${entry.id}' contains malformed or unparseable reproduction record`,
        eventId: entry.id,
        cellId: parent.nodeId
      });
      continue;
    }

    if (content.status !== 'PENDING' && content.status !== 'COMMITTED' && content.status !== 'FAILED') {
      anomalies.push({
        code: 'MALFORMED_REPRODUCTION_RECORD',
        message: `Event record '${content.eventId}' has unrecognized status '${content.status}'`,
        eventId: content.eventId,
        cellId: parent.nodeId
      });
      continue;
    }

    if (content.status === 'COMMITTED') {
      scannedChildren++;
      const childId = content.childCellId;
      const childPath = content.childStoragePath;

      if (!childId || !childPath) {
        anomalies.push({
          code: 'MALFORMED_REPRODUCTION_RECORD',
          message: `Committed event record '${content.eventId}' missing childCellId or childStoragePath`,
          eventId: content.eventId,
          cellId: parent.nodeId
        });
        continue;
      }

      // Track duplicate event-to-child mapping
      const existingEvents = childIdToEvents.get(childId) || [];
      existingEvents.push(content.eventId);
      childIdToEvents.set(childId, existingEvents);

      // Verify physical child storage existence and integrity
      const childCheck = await validateChildIntegrity(
        childPath,
        parent.nodeId,
        content.generation || (parent.genome.generation + 1),
        content.eventId,
        content.lineageRecord?.lineageId
      );
      if (!childCheck.valid) {
        try {
          await fs.access(childPath);
          // File exists but is corrupt or has invalid lineage/generation
          if (childCheck.reason?.includes('mismatch')) {
            if (childCheck.reason.includes('generation')) {
              anomalies.push({
                code: 'INCONSISTENT_GENERATION',
                message: childCheck.reason,
                cellId: childId,
                eventId: content.eventId
              });
            } else {
              anomalies.push({
                code: 'INVALID_LINEAGE',
                message: childCheck.reason,
                cellId: childId,
                eventId: content.eventId
              });
            }
          } else {
            anomalies.push({
              code: 'MALFORMED_CHILD_STORAGE',
              message: `Child storage at '${childPath}' is corrupt: ${childCheck.reason}`,
              cellId: childId,
              eventId: content.eventId
            });
          }
        } catch {
          // File does not exist on disk!
          anomalies.push({
            code: 'MISSING_CHILD_STORAGE',
            message: `Parent committed event '${content.eventId}' references non-existent child storage '${childPath}'`,
            cellId: childId,
            eventId: content.eventId
          });
        }
      }
    }
  }

  // Check for duplicate child IDs
  for (const [childId, events] of childIdToEvents.entries()) {
    if (events.length > 1) {
      anomalies.push({
        code: 'DUPLICATE_EVENT_MAPPING',
        message: `Child ID '${childId}' is mapped to multiple reproduction events: ${events.join(', ')}`,
        cellId: childId,
        details: { events }
      });
    }
  }

  return {
    consistent: anomalies.length === 0,
    anomalies,
    scannedEvents,
    scannedChildren
  };
}

/**
 * Audits an entire population storage directory against a set of known parents.
 * Detects orphan children, missing storages, and cross-cell collisions.
 */
export async function auditPopulationDirectory(
  storageDir: string,
  parents: Cell[]
): Promise<PopulationConsistencyReport> {
  const anomalies: PopulationAnomaly[] = [];
  let totalScannedEvents = 0;
  let totalScannedChildren = 0;

  const parentMap = new Map<string, Cell>();
  const parentCommittedChildIds = new Map<string, Set<string>>();

  for (const parent of parents) {
    parentMap.set(parent.nodeId, parent);
    const parentAudit = await auditParentReproductionConsistency(parent);
    totalScannedEvents += parentAudit.scannedEvents;
    totalScannedChildren += parentAudit.scannedChildren;
    anomalies.push(...parentAudit.anomalies);

    // Collect all child IDs committed by this parent
    const committed = new Set<string>();
    const entries = await parent.memory.search({ category: MemoryCategory.PROCEDURAL });
    for (const e of entries) {
      if (e.id.startsWith('reproduction_event_')) {
        const record = e.content as ReproductionEventRecord;
        if (record && record.status === 'COMMITTED' && record.childCellId) {
          committed.add(record.childCellId);
        }
      }
    }
    parentCommittedChildIds.set(parent.nodeId, committed);
  }

  // Scan storage directory files
  try {
    const files = await fs.readdir(storageDir);
    const cellFiles = files.filter(f => f.startsWith('cell_') && f.endsWith('.json'));

    const seenChildIds = new Set<string>();

    for (const file of cellFiles) {
      const fullPath = path.join(storageDir, file);
      try {
        const raw = await fs.readFile(fullPath, 'utf8');
        const entries = JSON.parse(raw);
        if (!Array.isArray(entries)) continue;

        const genomeEntry = entries.find((e: any) => e.id && typeof e.id === 'string' && e.id.startsWith('cell_genome_'));
        if (!genomeEntry || !genomeEntry.content) continue;

        const genome = genomeEntry.content;
        const cellId = genomeEntry.cellId || genome.nodeId;

        // Skip parent cells themselves
        if (parentMap.has(cellId)) continue;

        // Check for duplicate child IDs across files
        if (seenChildIds.has(cellId)) {
          anomalies.push({
            code: 'DUPLICATE_CHILD_ID',
            message: `Child cell ID '${cellId}' found in multiple storage files`,
            cellId
          });
        }
        seenChildIds.add(cellId);

        // Check if child claims a parent that does not have a committed record for it
        if (genome.parentCellId && parentMap.has(genome.parentCellId)) {
          const parentSet = parentCommittedChildIds.get(genome.parentCellId);
          if (!parentSet || !parentSet.has(cellId)) {
            anomalies.push({
              code: 'ORPHAN_CHILD_STORAGE',
              message: `Child storage '${file}' claims parent '${genome.parentCellId}', but parent has no COMMITTED reproduction record for it`,
              cellId
            });
          }
        }
      } catch {
        // Ignored or handled during individual file audit
      }
    }
  } catch (err: any) {
    anomalies.push({
      code: 'MALFORMED_REPRODUCTION_RECORD',
      message: `Failed to read population storage directory: ${err.message}`
    });
  }

  return {
    consistent: anomalies.length === 0,
    anomalies,
    scannedEvents: totalScannedEvents,
    scannedChildren: totalScannedChildren
  };
}
