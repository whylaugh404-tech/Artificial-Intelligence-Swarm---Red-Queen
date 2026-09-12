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
  ReproductionCooldownRecord,
  ReproductionStage,
  FailureInjectionHook
} from './types';
import { GovernanceEnforcer } from './policy';
import { logger } from '../core/logger';
import { MemoryEntry, MemoryCategory } from '../memory/store';
import { identityCrypto } from '../crypto/identity';
import { CellState } from '../core/lifecycle';
import { validateChildIntegrity } from './consistency';

export interface MitosisOptions {
  authorizationProof?: AuthorizationProof | any;
  storageBasePath: string;
  currentPopulation: number;
  memoryPressure?: number;
  specializationBias?: string;
  openRouterApiKey: string;
  // Deterministic seed for reproducible mutations
  reproductionSeed?: string;
  failureInjectionHook?: FailureInjectionHook;
  simulateAbruptCrash?: boolean;
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

    // Cross-process locking (Global Swarm Reproduction Lock for Population Atomicity)
    const globalLockPath = path.join(options.storageBasePath, 'global_mitosis.lock');
    let crossProcessLockAcquired = false;
    let attempts = 0;
    while(attempts < 50) {
      try {
        await fs.mkdir(globalLockPath);
        crossProcessLockAcquired = true;
        break;
      } catch (err: any) {
        if (err.code === 'EEXIST') {
          // Check for stale lock (15 seconds)
          try {
             const stat = await fs.stat(globalLockPath);
             if (Date.now() - stat.mtimeMs > 15000) {
                 await fs.rm(globalLockPath, { recursive: true, force: true });
                 continue; // steal lock
             }
          } catch(e) {}
          await new Promise(r => setTimeout(r, 200));
          attempts++;
        } else {
          releaseLock();
          throw err;
        }
      }
    }

    if (!crossProcessLockAcquired) {
       releaseLock();
       return {
         result: { success: false, parentCellId: parent.nodeId, eventId, generation: parent.genome.generation, errors: ['Global cross-process reproduction lock timeout'] }
       };
    }

    let childStoragePath = '';
    let childNodeId = '';
    const eventKey = `reproduction_event_${eventId}`;

    try {
      // 1. Idempotency Check & Phase 2 Deterministic Recovery
      const existingEventEntry = await parent.memory.get(eventKey);
      if (existingEventEntry && existingEventEntry.content) {
        const record = existingEventEntry.content as ReproductionEventRecord;

        // R23: Malformed persisted event record
        if (typeof record !== 'object' || !record.status) {
          logger.warn(this.component, 'malformed_persisted_event_record', { eventId, parentCellId: parent.nodeId });
          return {
            result: {
              success: false,
              parentCellId: parent.nodeId,
              eventId,
              generation: parent.genome.generation,
              errors: [`Malformed reproduction event record in parent memory for event '${eventId}'`]
            }
          };
        }

        // Case D / Case E: Event is COMMITTED
        if (record.status === 'COMMITTED') {
          logger.info(this.component, 'reproduction_committed_replay', { parentCellId: parent.nodeId, eventId });

          const childPath = record.childStoragePath || (record.childCellId ? path.join(options.storageBasePath, `cell_${record.childCellId}.json`) : '');
          
          let childFileExists = false;
          if (childPath) {
            try {
              await fs.access(childPath);
              childFileExists = true;
            } catch {}
          }

          // Case E: COMMITTED + child missing
          // Report an explicit consistency failure. Do NOT silently create an unrelated replacement child.
          if (!childFileExists) {
            return {
              result: {
                success: false,
                parentCellId: parent.nodeId,
                childCellId: record.childCellId,
                eventId,
                generation: record.generation,
                errors: [`Population consistency failure: Committed child storage missing at '${childPath}'`]
              }
            };
          }

          // Case D: COMMITTED + child exists
          let child = this.committedChildrenByEvent.get(eventId);
          if (!child && childPath) {
            try {
              child = await Cell.loadFromStorage(
                childPath,
                options.openRouterApiKey,
                undefined,
                {
                  parentCellId: parent.nodeId,
                  generation: record.generation,
                  specialization: record.differentiationSummary?.specialization
                }
              );
              if (child) {
                this.committedChildrenByEvent.set(eventId, child);
              }
            } catch (loadErr: any) {
              logger.warn(this.component, 'failed_to_load_committed_child', { error: loadErr.message });
            }
          }

          if (!child) {
            return {
              child: undefined,
              result: {
                success: false,
                parentCellId: parent.nodeId,
                childCellId: record.childCellId,
                eventId,
                generation: record.generation,
                errors: ['Recovery failure: unable to reconstruct committed child cell from storage']
              }
            };
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

        // Case A / B / C: Event is PENDING
        if (record.status === 'PENDING') {
          logger.info(this.component, 'reproduction_pending_recovery', { parentCellId: parent.nodeId, eventId });

          const targetChildPath = record.childStoragePath || (record.childCellId ? path.join(options.storageBasePath, `cell_${record.childCellId}.json`) : '');

          let childFileExists = false;
          if (targetChildPath) {
            try {
              await fs.access(targetChildPath);
              childFileExists = true;
            } catch {}
          }

          if (childFileExists && targetChildPath) {
            // Case B & C: Child file exists on disk
            const integrity = await validateChildIntegrity(
              targetChildPath,
              parent.nodeId,
              record.generation || (parent.genome.generation + 1),
              eventId,
              record.lineageRecord?.lineageId
            );
            
            if (!integrity.valid) {
              // Case C: PENDING + malformed/inconsistent child
              // Quarantine or rollback inconsistent child state, mark event FAILED
              try {
                const quarantinePath = `${targetChildPath}.quarantine.${Date.now()}`;
                await fs.rename(targetChildPath, quarantinePath);
                logger.warn(this.component, 'quarantined_malformed_child', { targetChildPath, quarantinePath, reason: integrity.reason });
              } catch {
                try {
                  await fs.rm(targetChildPath, { force: true });
                } catch {}
              }

              record.status = 'FAILED';
              record.error = `Inconsistent child storage quarantined: ${integrity.reason}`;
              await parent.memory.put({
                id: eventKey,
                cellId: parent.nodeId,
                category: MemoryCategory.PROCEDURAL,
                content: record,
                source: 'mitosis_engine',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                confidence: 1.0,
                hash: '',
                provenance: [parent.nodeId]
              });

              return {
                result: {
                  success: false,
                  parentCellId: parent.nodeId,
                  eventId,
                  generation: parent.genome.generation,
                  errors: [record.error]
                }
              };
            }

            // Case B: PENDING + valid child exists on disk, finalize COMMITTED
            logger.info(this.component, 'recovering_valid_child_and_finalizing_commit', { eventId, childCellId: record.childCellId });
            let child = this.committedChildrenByEvent.get(eventId);
            if (!child) {
              try {
                child = await Cell.loadFromStorage(
                  targetChildPath,
                  options.openRouterApiKey,
                  undefined,
                  {
                    parentCellId: parent.nodeId,
                    generation: record.generation || (parent.genome.generation + 1),
                    specialization: record.differentiationSummary?.specialization
                  }
                );
              } catch (loadErr: any) {
                logger.warn(this.component, 'failed_to_load_child_for_commit_finalization', { error: loadErr.message });
              }
            }

            if (!child) {
              // Child cannot be reconstructed: MUST FAIL, NEVER COMMIT
              try {
                const quarantinePath = `${targetChildPath}.quarantine.${Date.now()}`;
                await fs.rename(targetChildPath, quarantinePath);
                logger.warn(this.component, 'quarantined_unreconstructible_child', { targetChildPath, quarantinePath });
              } catch {
                try {
                  await fs.rm(targetChildPath, { force: true });
                } catch {}
              }

              record.status = 'FAILED';
              record.error = 'Child reconstruction failed during recovery: unable to load Cell';
              await parent.memory.put({
                id: eventKey,
                cellId: parent.nodeId,
                category: MemoryCategory.PROCEDURAL,
                content: record,
                source: 'mitosis_engine',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                confidence: 1.0,
                hash: '',
                provenance: [parent.nodeId]
              });

              return {
                child: undefined,
                result: {
                  success: false,
                  parentCellId: parent.nodeId,
                  eventId,
                  generation: parent.genome.generation,
                  errors: [record.error]
                }
              };
            }

            const now = Date.now();
            const childId = record.childCellId || (child ? child.nodeId : integrity.childNodeId || '');
            parent.cognitiveState.setMetadata('lastReproductionEvent', eventId);
            parent.cognitiveState.setMetadata('lastReproductionTimestamp', now.toString());
            parent.cognitiveState.setMetadata(`reproduction_event_${eventId}`, childId);
            const parentMeta = parent.cognitiveState.getState().metadata || {};
            const curDesc = parseInt(parentMeta.descendantsCount || '0', 10);
            parent.cognitiveState.setMetadata('descendantsCount', (curDesc + 1).toString());
            await parent.cognitiveState.persist(parent.memory);

            // Persist cooldown
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

            // Persist COMMITTED record
            record.status = 'COMMITTED';
            record.committedAt = now;
            record.childCellId = childId;
            record.childStoragePath = targetChildPath;
            if (child) {
              record.lineageRecord = child.lineage;
            }

            await parent.memory.put({
              id: eventKey,
              cellId: parent.nodeId,
              category: MemoryCategory.PROCEDURAL,
              content: record,
              source: 'mitosis_engine',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              confidence: 1.0,
              hash: '',
              provenance: [parent.nodeId]
            });

            if (child) {
              this.committedChildrenByEvent.set(eventId, child);
            }

            return {
              child,
              result: {
                success: true,
                parentCellId: parent.nodeId,
                childCellId: childId,
                eventId,
                generation: record.generation || (parent.genome.generation + 1),
                mutationSummary: record.mutationSummary,
                differentiationSummary: record.differentiationSummary,
                inheritedMemorySummary: record.inheritedMemorySummary,
                lineageRecord: record.lineageRecord
              }
            };
          } else {
            // Case A: PENDING + child does not exist on disk
            // Safely resume reproduction or fail if policy rejects
            logger.info(this.component, 'resuming_pending_event_no_child', { eventId });
          }
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

      let realPopulation = options.currentPopulation;
      try {
        const files = await fs.readdir(options.storageBasePath);
        const diskCount = files.filter(f => f.startsWith('cell_') && f.endsWith('.json')).length;
        realPopulation = Math.max(options.currentPopulation ?? 0, diskCount);
      } catch (e) {
        logger.warn(this.component, 'failed_to_count_population_dynamically', { error: e });
      }

      const validation = this.governance.validateReproduction(
        parent.lifecycle.getState(),
        parentMetadata,
        realPopulation,
        realPressure,
        eventId,
        parent.nodeId,
        options.authorizationProof
      );

      if (!validation.allowed) {
        logger.warn(this.component, 'reproduction_denied', { parentCellId: parent.nodeId, reason: validation.reason });
        // If event was previously PENDING and cannot be resumed, mark FAILED
        if (existingEventEntry && (existingEventEntry.content as any).status === 'PENDING') {
          const failRecord = existingEventEntry.content as ReproductionEventRecord;
          failRecord.status = 'FAILED';
          failRecord.error = validation.reason || 'Denied by policy';
          await parent.memory.put({
            id: eventKey,
            cellId: parent.nodeId,
            category: MemoryCategory.PROCEDURAL,
            content: failRecord,
            source: 'mitosis_engine',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            confidence: 1.0,
            hash: '',
            provenance: [parent.nodeId]
          });
        }

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

      // 3. Durable Reservation: Mark PENDING before irreversible child creation
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
        provenance: [parent.nodeId]
      });

      logger.info(this.component, 'mitosis_started', { parentCellId: parent.nodeId, eventId });

      // Failure Hook 1: AFTER_PENDING_PERSISTENCE
      if (options.failureInjectionHook) {
        await options.failureInjectionHook(ReproductionStage.AFTER_PENDING_PERSISTENCE);
      }

      // 4. Identity Generation
      const keypair = identityCrypto.generateKeyPair();
      childNodeId = identityCrypto.deriveNodeId(keypair.publicKey);
      
      if (childNodeId === parent.nodeId) {
        throw new Error('Identity collision: Child cannot have same ID as parent');
      }

      childStoragePath = path.join(options.storageBasePath, `cell_${childNodeId}.json`);
      eventRecord.childCellId = childNodeId;
      eventRecord.childStoragePath = childStoragePath;
      eventRecord.childPublicKey = keypair.publicKey;

      // Persist child identity info in PENDING record before physical write
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
        provenance: [parent.nodeId]
      });

      // Failure Hook 2: AFTER_CHILD_IDENTITY
      if (options.failureInjectionHook) {
        await options.failureInjectionHook(ReproductionStage.AFTER_CHILD_IDENTITY);
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

      // Initialize child memory store and persist its identity and genome
      await child.memory.initialize();
      await child.restoreOrPersistIdentity(child.getStoragePath());
      await child.restoreOrPersistGenome();

      // Failure Hook 3: AFTER_CHILD_STORAGE
      if (options.failureInjectionHook) {
        await options.failureInjectionHook(ReproductionStage.AFTER_CHILD_STORAGE);
      }

      // Write inherited memories
      for (const entry of childMemories) {
        await child.memory.put(entry);
      }

      // Anchor reproduction origin record in child memory
      await child.memory.put({
        id: `cell_origin_${childNodeId}`,
        cellId: childNodeId,
        category: MemoryCategory.PROCEDURAL,
        type: 'CELL_ORIGIN',
        content: {
          eventId,
          parentCellId: parent.nodeId,
          generation: childGenome.generation,
          lineageId: childGenome.lineageId,
          bornAt: new Date().toISOString()
        },
        source: 'mitosis_engine',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        confidence: 1.0,
        hash: '',
        provenance: [parent.nodeId, eventId],
        version: 1
      });

      // Failure Hook 4: AFTER_MEMORY_INHERITANCE
      if (options.failureInjectionHook) {
        await options.failureInjectionHook(ReproductionStage.AFTER_MEMORY_INHERITANCE);
      }

      // STRICT VALIDATION: Validate child integrity across all invariants before committing
      const childIntegrityCheck = await validateChildIntegrity(
        childStoragePath,
        parent.nodeId,
        childGenome.generation,
        eventId,
        childGenome.lineageId
      );
      if (!childIntegrityCheck.valid) {
        throw new Error(`Child integrity check failed: ${childIntegrityCheck.reason}`);
      }

      // STRICT VALIDATION: Verify child is reconstructible from storage before committing
      let verifiedReconstructedChild: Cell;
      try {
        verifiedReconstructedChild = await Cell.loadFromStorage(
          childStoragePath,
          options.openRouterApiKey,
          undefined,
          {
            parentCellId: parent.nodeId,
            generation: childGenome.generation,
            lineageId: childGenome.lineageId,
            specialization: childSpecialization
          }
        );
      } catch (loadErr: any) {
        throw new Error(`Child reconstruction failed before commit: ${loadErr.message}`);
      }

      if (!verifiedReconstructedChild) {
        throw new Error('Child reconstruction returned null/undefined before commit');
      }

      // 8. Commit Protocol: Update parent state, cooldown, and event record
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

        // Failure Hook 5: AFTER_PARENT_STATE_UPDATE
        if (options.failureInjectionHook) {
          await options.failureInjectionHook(ReproductionStage.AFTER_PARENT_STATE_UPDATE);
        }

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
          provenance: [parent.nodeId]
        });

        // Failure Hook 6: AFTER_COOLDOWN_PERSISTENCE
        if (options.failureInjectionHook) {
          await options.failureInjectionHook(ReproductionStage.AFTER_COOLDOWN_PERSISTENCE);
        }

        // Failure Hook 7: BEFORE_COMMITTED_PERSISTENCE
        if (options.failureInjectionHook) {
          await options.failureInjectionHook(ReproductionStage.BEFORE_COMMITTED_PERSISTENCE);
        }

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

        // Failure Hook 8: DURING_COMMITTED_PERSISTENCE
        if (options.failureInjectionHook) {
          await options.failureInjectionHook(ReproductionStage.DURING_COMMITTED_PERSISTENCE);
        }

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
          provenance: [parent.nodeId]
        });

        // Failure Hook 9: AFTER_COMMITTED_PERSISTENCE
        if (options.failureInjectionHook) {
          await options.failureInjectionHook(ReproductionStage.AFTER_COMMITTED_PERSISTENCE);
        }

        this.committedChildrenByEvent.set(eventId, child);
      } catch (persistError: any) {
        // Cooldown or event persistence failed: rollback parent cognitive state and re-throw
        parent.cognitiveState.restoreFromSnapshot(cognitiveSnapshot);
        if (!options.simulateAbruptCrash) {
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
              provenance: [parent.nodeId]
            });
          } catch {}
        }
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
      // Compensating action: remove partially created child storage if it exists,
      // unless simulating an abrupt crash where uncommitted files are left behind
      if (childStoragePath && !options.simulateAbruptCrash) {
        try {
          await fs.rm(childStoragePath, { force: true });
        } catch (rmErr) {
          logger.warn(this.component, 'mitosis_rollback_failed', { path: childStoragePath, error: String(rmErr) });
        }
      }

      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
      logger.error(this.component, 'mitosis_failed', { parentCellId: parent.nodeId, error: errorMsg });

      // If not simulating abrupt crash and event is currently PENDING, mark FAILED
      if (!options.simulateAbruptCrash) {
        try {
          const rec = await parent.memory.get(eventKey);
          if (rec && rec.content && (rec.content as any).status === 'PENDING') {
            const updatedRec = rec.content as ReproductionEventRecord;
            updatedRec.status = 'FAILED';
            updatedRec.error = errorMsg;
            await parent.memory.put({
              id: eventKey,
              cellId: parent.nodeId,
              category: MemoryCategory.PROCEDURAL,
              content: updatedRec,
              source: 'mitosis_engine',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              confidence: 1.0,
              hash: '',
              provenance: [parent.nodeId]
            });
          }
        } catch {}
      }

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
      if (crossProcessLockAcquired) {
        try {
           await fs.rm(globalLockPath, { recursive: true, force: true });
        } catch(e) {}
      }
      releaseLock();
    }
  }
}

