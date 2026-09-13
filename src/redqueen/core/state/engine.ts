import { createHash } from 'crypto';
import { CellState, StateTransition } from './types';
import { logger } from '../logger';

export function canonicalSerialize(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalSerialize).join(',')}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const parts = keys.map(k => `${JSON.stringify(k)}:${canonicalSerialize((obj as Record<string, unknown>)[k])}`);
  return `{${parts.join(',')}}`;
}

export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').substring(0, 16);
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.keys(obj as Record<string, unknown>).forEach(prop => {
      deepFreeze((obj as Record<string, unknown>)[prop]);
    });
    Object.freeze(obj);
  }
  return obj;
}

export class CellStateManager {
  
  public generateStateId(stateContent: Omit<CellState, 'stateId'>): string {
    const semanticPayload = {
      cellIdentity: stateContent.cellIdentity,
      genomeReference: stateContent.genomeReference,
      memoryState: stateContent.memoryState,
      knowledgeState: stateContent.knowledgeState,
      cognitiveState: stateContent.cognitiveState,
      reasoningState: stateContent.reasoningState,
      experienceState: stateContent.experienceState,
      computationalCapability: stateContent.computationalCapability,
      specializations: stateContent.specializations,
      lifecycle: stateContent.lifecycle,
      provenance: stateContent.provenance
    };
    return `state_${computeHash(canonicalSerialize(semanticPayload))}`;
  }

  public createInitialState(initialData: Omit<CellState, 'stateId'>): CellState {
    const safeData = structuredClone(initialData);
    const stateId = this.generateStateId(safeData);
    const state = { ...safeData, stateId };
    return deepFreeze(state);
  }

  public applyTransition(
    currentState: CellState,
    transitionType: string,
    updates: Partial<Omit<CellState, 'stateId' | 'cellIdentity' | 'genomeReference'>>,
    provenanceSource: string[],
    deterministicTimestamp?: string
  ): { newState: CellState; transition: StateTransition } {
    
    // Note: R2 architecture defines nested object updates as shallow replacement. 
    // Top-level properties are fully replaced by the contents of `updates`.
    const updatedData = {
      ...currentState,
      ...updates
    };

    const safeNewData: Partial<CellState> = structuredClone(updatedData);
    delete safeNewData.stateId; // ensure we generate a new one
    
    const combinedProvenance = new Set([...currentState.provenance, ...provenanceSource]);
    safeNewData.provenance = Array.from(combinedProvenance).sort();

    const targetStateId = this.generateStateId(safeNewData as Omit<CellState, 'stateId'>);
    
    const newState: CellState = deepFreeze({
      ...(safeNewData as Omit<CellState, 'stateId'>),
      stateId: targetStateId
    });

    const changedFields = Object.keys(updates).sort();
    const sortedProvenanceSource = Array.from(new Set(provenanceSource)).sort();
    
    const transitionSignature = canonicalSerialize({
      sourceStateId: currentState.stateId,
      targetStateId: targetStateId,
      transitionType,
      changedFields,
      provenance: sortedProvenanceSource
    });

    const transitionId = `trans_${computeHash(transitionSignature)}`;
    
    const transition: StateTransition = deepFreeze({
      transitionId,
      sourceStateId: currentState.stateId,
      targetStateId,
      transitionType,
      changedFields,
      provenance: Array.from(combinedProvenance).sort(),
      timestamp: deterministicTimestamp || new Date().toISOString()
    });

    logger.debug('CellStateManager', 'transition_applied', { 
      cellIdentity: currentState.cellIdentity,
      sourceState: currentState.stateId, 
      targetState: targetStateId, 
      transitionType 
    });

    return { newState, transition };
  }
}
