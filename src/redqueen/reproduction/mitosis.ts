import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Cell } from '../core/cell';
import { deriveProgenyGenome } from '../genome/genome';
import { CellCapability } from '../genome/types';
import {
  MitosisResult,
  AuthorizationProof,
  ReproductionEventRecord,
  ReproductionCooldownRecord
} from './types';
import { GovernanceEnforcer } from './policy';
import { logger } from '../core/logger';
import { MemoryEntry, MemoryCategory } from '../memory/store';
import { identityCrypto } from '../crypto/identity';
import { CellState } from '../core/lifecycle';

export interface MitosisOptions {
  authorizationProof?: AuthorizationProof | any;
  storageBasePath: string;
  currentPopulation: number;
  memoryPressure?: number;
  specializationBias?: string;
  openRouterApiKey: string;
  // Deterministic seed for reproducible mutations
  reproductionSeed?: string; 
}

function deterministicRandom(seed: string, sequence: number): number {
  let hash = 0;
  const input = `${seed}_${sequence}`;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(31, hash) + input.charCodeAt(i) | 0;
  }
  const x = Math.sin(hash++) * 10000;
  return x - Math.floor(x);
}

function computeRelevance(entry: MemoryEntry, specialization: string): number {
  let score = 0;
  const contentStr = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content || '');
  const contentLower = contentStr.toLowerCase();
  const specLower = specialization.toLowerCase();
  
  if (contentLower.includes(specLower)) score += 0.5;
  if (entry.id.toLowerCase().includes(specLower)) score += 0.3;
  if (entry.provenance?.some(p => p.toLowerCase().includes(specLower))) score += 0.2;
  
  // High score if it has a core tag
  if (contentLower.includes('[core]') || entry.id.includes('core')) {
    score += 1.0;
  }

  return score;
}

export class MitosisEngine {
  private readonly component = 'mitosis';
  private inFlightReproductions = new Map<string, Promise<{ result: MitosisResult; child?: Cell }>>();
  private committedChildrenByEvent = new Map<string, Cell>();
  private parentQueues = new Map<string, Promise<void>>();
  
  constructor(private governance: GovernanceEnforcer) {}

  public getGovernance(): GovernanceEnforcer {
    return this.governance;
  }

  public async reproduce(
    parent: Cell,
    options: MitosisOptions
  ): Promise<{ result: MitosisResult; child?: Cell }> {
    const eventId = options.reproductionSeed || `mitosis_${randomUUID()}`;
    const flightKey = `${parent.nodeId}:${eventId}`;

    // Deduplicate in-flight reproduction requests for the exact same parent and eventId
    const existingInFlight = this.inFlightReproductions.get(flightKey);
    if (existingInFlight) {
      logger.info(this.component, 'reproduction_in_flight_joined', { parentCellId: parent.nodeId, eventId });
      return await existingInFlight;
    }

    const executionPromise = this.executeReproduction(parent, options, eventId);
    this.inFlightReproductions.set(flightKey, executionPromise);

    try {
      return await executionPromise;
    } finally {
      this.inFlightReproductions.delete(flightKey);
    }
  }

  private async executeReproduction(
    parent: Cell,
    options: MitosisOptions,
    eventId: string
  ): Promise<{ result: MitosisResult; child?: Cell }> {
    // Serialize operations per parent to prevent memory/state write races
    const prevParentQueue = this.parentQueues.get(parent.nodeId) || Promise.resolve();
    let releaseLock: () => void = () => {};
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.parentQueues.set(parent.nodeId, prevParentQueue.then(() => currentLock).catch(() => currentLock));

    await prevParentQueue;

    let childStoragePath = '';
    let childNodeId = '';
    const eventKey = `reproduction_event_${eventId}`;

    try {
      // 1. Idempotency Check: check if event has already been COMMITTED
      const existingEventEntry = await parent.memory.get(eventKey);
      if (existingEventEntry && existingEventEntry.content) {
        const record = existingEventEntry.content as ReproductionEventRecord;
        if (record.status === 'COMMITTED') {
          logger.info(this.component, 'reproduction_idempotent_replay', { parentCellId: parent.nodeId, eventId });
          
          let child = this.committedChildrenByEvent.get(eventId);
          if (!child && record.childStoragePath) {
            try {
              child = new Cell(
                record.childStoragePath,
                options.openRouterApiKey,
                undefined,
                undefined,
                undefined,
                {
                  parentCellId: parent.nodeId,
                  generation: record.generation,
                  specialization: record.differentiationSummary?.specialization
                }
              );
              await child.memory.initialize();
              this.committedChildrenByEvent.set(eventId, child);
            } catch {
              // If child instance cannot be reloaded, still return success result
            }
          }

          return {
            child,
            result: {
              success: true,
              parentCellId: parent.nodeId,
              childCellId: record.childCellId,
              eventId,
              generation: record.generation,
              mutationSummary: record.mutationSummary,
              differentiationSummary: record.differentiationSummary,
              inheritedMemorySummary: record.inheritedMemorySummary,
              lineageRecord: record.lineageRecord
            }
          };
        }
      }

      // Also check in-memory cognitive state metadata fallback
      const parentMetadata = parent.cognitiveState.getState().metadata || {};
      if (parentMetadata[eventKey] && !existingEventEntry) {
        const cachedChildId = parentMetadata[eventKey];
        return {
          child: this.committedChildrenByEvent.get(eventId),
          result: {
            success: true,
            parentCellId: parent.nodeId,
            childCellId: cachedChildId,
            eventId,
            generation: parent.genome.generation + 1
          }
        };
      }

      // 2. Governance Validation
      const memoryStats = parent.memory.getStats ? parent.memory.getStats() : { total: 0 };
      const logicalCapacity = this.governance.policyMemoryCapacity || 100;
      let realPressure = memoryStats.total / logicalCapacity;
      if (options.memoryPressure !== undefined && process.env.NODE_ENV === 'test') {
        realPressure = options.memoryPressure; // testing override
      }

      const validation = this.governance.validateReproduction(
        parent.lifecycle.getState(),
        parentMetadata,
        options.currentPopulation,
        realPressure,
        eventId,
        parent.nodeId,
        options.authorizationProof
      );

      if (!validation.allowed) {
        logger.warn(this.component, 'reproduction_denied', { parentCellId: parent.nodeId, reason: validation.reason });
        return {
          result: {
            success: false,
            parentCellId: parent.nodeId,
            eventId,
            generation: parent.genome.generation,
            errors: [validation.reason || 'Denied by policy']
          }
        };
      }

      // 3. Event Reservation: Mark PENDING before irreversible child creation
      const eventRecord: ReproductionEventRecord = {
        eventId,
        parentCellId: parent.nodeId,
        status: 'PENDING',
        createdAt: Date.now(),
        generation: parent.genome.generation + 1
      };

      await parent.memory.put({
        id: eventKey,
        cellId: parent.nodeId,
        category: MemoryCategory.PROCEDURAL,
        content: eventRecord,
        source: 'mitosis_engine',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1.0,
        hash: '',
        provenance: [parent.nodeId],
        version: 1
      });

      logger.info(this.component, 'mitosis_started', { parentCellId: parent.nodeId, eventId });

      // 4. Identity Generation
      const keypair = identityCrypto.generateKeyPair();
      childNodeId = identityCrypto.deriveNodeId(keypair.publicKey);
      
      if (childNodeId === parent.nodeId) {
        throw new Error('Identity collision: Child cannot have same ID as parent');
      }

      // 5. Genome Derivation & Mutation (Bounded)
      const childSpecialization = options.specializationBias || 
        (parent.genome.specialization ? `${parent.genome.specialization}_evolved` : 'specialized');

      // Deterministic bounded mutation based on eventId
      const r1 = deterministicRandom(eventId, 1) * 0.2 - 0.1; // -0.1 to 0.1
      const r2 = deterministicRandom(eventId, 2) * 0.2 - 0.1;

      const mutatedTraits = {
        mutationRate: Math.max(0, Math.min(1.0, parent.genome.traits.mutationRate * (1 + r1))),
        riskTolerance: Math.max(0, Math.min(1.0, parent.genome.traits.riskTolerance * (1 + r2))),
      };

      const childGenome = deriveProgenyGenome(parent.genome, parent.nodeId, {
        specialization: childSpecialization,
        traits: mutatedTraits,
      });

      // 6. Memory Partitioning
      const parentMemories = await parent.memory.search({});
      const childMemories: MemoryEntry[] = [];
      let semanticCount = 0;
      let episodicCount = 0;
      let proceduralCount = 0;

      const seenHashes = new Set<string>();

      for (const entry of parentMemories) {
        if (entry.hash && seenHashes.has(entry.hash)) {
          continue; // Deduplicate
        }
        if (entry.hash) seenHashes.add(entry.hash);

        let shouldInherit = false;
        const relevance = computeRelevance(entry, childSpecialization);
        const isCore = relevance >= 1.0;
        
        if (entry.category === MemoryCategory.SEMANTIC) {
          if (isCore || (entry.confidence >= 0.7 && relevance >= 0.3)) {
            shouldInherit = true;
          }
        } else if (entry.category === MemoryCategory.PROCEDURAL) {
          if (isCore || relevance >= 0.3) {
            shouldInherit = true;
          }
        } else if (entry.category === MemoryCategory.EPISODIC) {
          if (isCore || (entry.confidence >= 0.8 && relevance >= 0.5)) {
            shouldInherit = true;
          }
        }

        if (shouldInherit) {
          childMemories.push({
            ...entry,
            cellId: childNodeId, // Assign ownership to child
            provenance: [...(entry.provenance || []), `inherited_from_${parent.nodeId}_via_${eventId}`]
          });
          
          if (entry.category === MemoryCategory.SEMANTIC) semanticCount++;
          if (entry.category === MemoryCategory.EPISODIC) episodicCount++;
          if (entry.category === MemoryCategory.PROCEDURAL) proceduralCount++;
        }
      }

      // 7. Child Instantiation
      childStoragePath = path.join(options.storageBasePath, `cell_${childNodeId}.json`);
      
      const child = new Cell(
        childStoragePath,
        options.openRouterApiKey,
        keypair.privateKey,
        keypair.publicKey,
        undefined,
        {
          genome: childGenome,
          parentCellId: parent.nodeId,
          generation: childGenome.generation,
          lineageId: childGenome.lineageId,
          specialization: childSpecialization
        }
      );

      // Initialize child memory store
      await child.memory.initialize();

      // Write inherited memories
      for (const entry of childMemories) {
        await child.memory.put(entry);
      }

      // 8. Atomic Commit: Update parent state, cooldown, and event record
      const cognitiveSnapshot = parent.cognitiveState.toJSON();

      try {
        const now = Date.now();
        const currentDescendants = parseInt(parentMetadata.descendantsCount || '0', 10);
        
        parent.cognitiveState.setMetadata('lastReproductionEvent', eventId);
        parent.cognitiveState.setMetadata('lastReproductionTimestamp', now.toString());
        parent.cognitiveState.setMetadata('descendantsCount', (currentDescendants + 1).toString());
        parent.cognitiveState.setMetadata(`reproduction_event_${eventId}`, childNodeId);

        // Durably persist parent cognitive state (survives restart)
        await parent.cognitiveState.persist(parent.memory);

        // Durably persist parent cooldown record
        const cooldownRecord: ReproductionCooldownRecord = {
          parentCellId: parent.nodeId,
          lastSuccessfulReproductionAt: now,
          cooldownMs: this.governance.cooldownMs
        };
        await parent.memory.put({
          id: `reproduction_cooldown_${parent.nodeId}`,
          cellId: parent.nodeId,
          category: MemoryCategory.PROCEDURAL,
          content: cooldownRecord,
          source: 'mitosis_engine',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          confidence: 1.0,
          hash: '',
          provenance: [parent.nodeId],
          version: 1
        });

        // Durably persist COMMITTED event record
        eventRecord.status = 'COMMITTED';
        eventRecord.committedAt = now;
        eventRecord.childCellId = childNodeId;
        eventRecord.childStoragePath = childStoragePath;
        eventRecord.mutationSummary = mutatedTraits;
        eventRecord.differentiationSummary = { specialization: childSpecialization };
        eventRecord.inheritedMemorySummary = {
          total: childMemories.length,
          semantic: semanticCount,
          episodic: episodicCount,
          procedural: proceduralCount
        };
        eventRecord.lineageRecord = child.lineage;

        await parent.memory.put({
          id: eventKey,
          cellId: parent.nodeId,
          category: MemoryCategory.PROCEDURAL,
          content: eventRecord,
          source: 'mitosis_engine',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          confidence: 1.0,
          hash: '',
          provenance: [parent.nodeId],
          version: 1
        });

        this.committedChildrenByEvent.set(eventId, child);
      } catch (persistError: any) {
        // Cooldown or event persistence failed: rollback parent cognitive state and re-throw
        parent.cognitiveState.restoreFromSnapshot(cognitiveSnapshot);
        try {
          eventRecord.status = 'FAILED';
          eventRecord.error = persistError.message;
          await parent.memory.put({
            id: eventKey,
            cellId: parent.nodeId,
            category: MemoryCategory.PROCEDURAL,
            content: eventRecord,
            source: 'mitosis_engine',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            confidence: 1.0,
            hash: '',
            provenance: [parent.nodeId],
            version: 1
          });
        } catch {}
        throw persistError;
      }

      logger.info(this.component, 'mitosis_completed', { 
        parentCellId: parent.nodeId, 
        childCellId: child.nodeId,
        inheritedMemories: childMemories.length 
      });

      return {
        child,
        result: {
          success: true,
          parentCellId: parent.nodeId,
          childCellId: child.nodeId,
          eventId,
          generation: childGenome.generation,
          mutationSummary: mutatedTraits,
          differentiationSummary: { specialization: childSpecialization },
          inheritedMemorySummary: {
            total: childMemories.length,
            semantic: semanticCount,
            episodic: episodicCount,
            procedural: proceduralCount
          },
          lineageRecord: child.lineage
        }
      };
    } catch (error: any) {
      console.error("MITOSIS CATCH ERROR", error);
      
      // Compensating action: remove partially created child storage if it exists
      if (childStoragePath) {
        try {
          await fs.rm(childStoragePath, { force: true });
        } catch (rmErr) {
          logger.warn(this.component, 'mitosis_rollback_failed', { path: childStoragePath, error: String(rmErr) });
        }
      }

      const errorMsg = error instanceof Error ? error.stack || error.message : JSON.stringify(error);
      logger.error(this.component, 'mitosis_failed', { parentCellId: parent.nodeId, error: errorMsg });

      return {
        result: {
          success: false,
          parentCellId: parent.nodeId,
          eventId,
          generation: parent.genome.generation,
          errors: [errorMsg]
        }
      };
    } finally {
      releaseLock();
    }
  }
}

