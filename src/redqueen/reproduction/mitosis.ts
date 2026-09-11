import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Cell } from '../core/cell';
import { deriveProgenyGenome } from '../genome/genome';
import { CellCapability } from '../genome/types';
import { MitosisResult } from './types';
import { GovernanceEnforcer } from './policy';
import { logger } from '../core/logger';
import { MemoryEntry, MemoryCategory } from '../memory/store';
import { identityCrypto } from '../crypto/identity';

export interface MitosisOptions {
  authorizationProof?: string;
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
  
  constructor(private governance: GovernanceEnforcer) {}

  public async reproduce(
    parent: Cell,
    options: MitosisOptions
  ): Promise<{ result: MitosisResult; child?: Cell }> {
    const eventId = options.reproductionSeed || `mitosis_${randomUUID()}`;
    const pressure = options.memoryPressure ?? 0.8;
    const isAuthorized = !!options.authorizationProof;

    const parentMetadata = parent.cognitiveState.getState().metadata || {};

    // 1. Governance Validation
    const validation = this.governance.validateReproduction(
      parent.lifecycle.getState(),
      parentMetadata,
      options.currentPopulation,
      pressure,
      isAuthorized
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

    logger.info(this.component, 'mitosis_started', { parentCellId: parent.nodeId, eventId });

    let childStoragePath = '';
    let childNodeId = '';

    try {
      // 2. Identity Generation
      const keypair = identityCrypto.generateKeyPair();
      childNodeId = identityCrypto.deriveNodeId(keypair.publicKey);
      
      if (childNodeId === parent.nodeId) {
        throw new Error('Identity collision: Child cannot have same ID as parent');
      }

      // 3. Genome Derivation & Mutation (Bounded)
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
        // Preserve parent capabilities, reproduction doesn't magically add restricted capabilities
      });

      // 4. Memory Partitioning
      // We partition memory: copy lineage and high-confidence semantic memory
      const parentMemories = await parent.memory.search({});
      const childMemories: MemoryEntry[] = [];
      let semanticCount = 0;
      let episodicCount = 0;
      let proceduralCount = 0;

      // Deduplication map
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
          // Procedural memories are structural, usually inherited
          shouldInherit = true;
        } else if (entry.category === MemoryCategory.EPISODIC) {
          // Episodic memories are conditionally inherited if highly relevant or core
          if (isCore || (entry.confidence >= 0.8 && relevance >= 0.5)) {
            shouldInherit = true;
          }
        }

        // We MUST preserve provenance. We copy the entry but update its ownership to the child.
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

      // 5. Child Instantiation
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

      // 6. Finalize & Record
      
      // Update parent cognitive state to reflect it reproduced
      const currentState = parent.cognitiveState.getState();
      const currentDescendants = parseInt(currentState.metadata?.descendantsCount || '0', 10);
      
      parent.cognitiveState.setMetadata('lastReproductionEvent', eventId);
      parent.cognitiveState.setMetadata('lastReproductionTimestamp', Date.now().toString());
      parent.cognitiveState.setMetadata('descendantsCount', (currentDescendants + 1).toString());

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
    }
  }
}
