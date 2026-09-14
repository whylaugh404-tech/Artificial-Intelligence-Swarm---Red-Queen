import { v4 as uuidv4 } from 'uuid';
import { CognitiveGraph } from '../representation/graph';
import { ConflictRecord, ConflictType, ResolutionStrategy, ResolutionRecord, BeliefUpdateTask } from './types';

export class VerificationEngine {
  private conflicts: Map<string, ConflictRecord> = new Map();
  private graph: CognitiveGraph;

  constructor(graph: CognitiveGraph) {
    this.graph = graph;
  }

  public registerConflict(
    type: ConflictType,
    entityId: string,
    claimA: string,
    claimB: string,
    evidenceA: string[],
    evidenceB: string[]
  ): ConflictRecord {
    const conflict: ConflictRecord = {
      id: `conf_${uuidv4()}`,
      type,
      entityId,
      claimA,
      claimB,
      evidenceA,
      evidenceB,
      status: 'OPEN',
      discoveryTime: Date.now()
    };
    this.conflicts.set(conflict.id, conflict);
    return conflict;
  }

  public getConflict(conflictId: string): ConflictRecord | undefined {
    return this.conflicts.get(conflictId);
  }

  public getAllOpenConflicts(): ConflictRecord[] {
    return Array.from(this.conflicts.values()).filter(c => c.status === 'OPEN');
  }

  public resolveConflict(
    conflictId: string,
    strategy: ResolutionStrategy,
    rationale: string,
    resultingBeliefId?: string
  ): ConflictRecord {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) throw new Error(`Conflict ${conflictId} not found`);
    if (conflict.status === 'RESOLVED') throw new Error(`Conflict ${conflictId} is already resolved`);

    const resolution: ResolutionRecord = {
      strategy,
      rationale,
      resultingBeliefId,
      resolutionTime: Date.now()
    };

    conflict.status = 'RESOLVED';
    conflict.resolution = resolution;
    
    return conflict;
  }

  public initiateBeliefUpdate(targetEntityId: string, newEvidenceIds: string[], proposedState: string): BeliefUpdateTask {
    return {
      id: `bu_${uuidv4()}`,
      targetEntityId,
      newEvidenceIds,
      proposedState
    };
  }
}
