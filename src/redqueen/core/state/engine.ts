import { CellState, StateTransition } from './types';
import { logger } from '../logger';
import {
  canonicalSerialize,
  computeCanonicalHash,
  computeHash,
  canonicalizeProvenance,
  deepFreeze
} from '../canonical';

export { canonicalSerialize, computeHash };

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
      provenance: canonicalizeProvenance(stateContent.provenance)
    };
    return `state_${computeCanonicalHash(semanticPayload)}`;
  }

  public createInitialState(initialData: Omit<CellState, 'stateId'>): CellState {
    const safeData = structuredClone(initialData);
    const stateId = this.generateStateId(safeData);
    const state = { ...safeData, stateId };
    return deepFreeze(state);
  }

  public syncWithGenome(
    currentState: CellState,
    newGenomeReference: string,
    newSpecializations: CellState['specializations'],
    newComputationalCapability: CellState['computationalCapability'],
    provenanceSource: string[],
    deterministicTimestamp?: string
  ): { newState: CellState; transition: StateTransition } {
    
    const safeNewData: Partial<CellState> = structuredClone(currentState);
    delete safeNewData.stateId;
    
    safeNewData.genomeReference = newGenomeReference;
    safeNewData.specializations = structuredClone(newSpecializations);
    safeNewData.computationalCapability = structuredClone(newComputationalCapability);
    
    safeNewData.provenance = canonicalizeProvenance([...currentState.provenance, ...provenanceSource]);

    const targetStateId = this.generateStateId(safeNewData as Omit<CellState, 'stateId'>);
    
    const newState: CellState = deepFreeze({
      ...(safeNewData as Omit<CellState, 'stateId'>),
      stateId: targetStateId
    });

    const changedFields = ['genomeReference', 'specializations', 'computationalCapability'].sort();
    const sortedProvenanceSource = canonicalizeProvenance(provenanceSource);
    
    const transitionSignature = canonicalSerialize({
      sourceStateId: currentState.stateId,
      targetStateId: targetStateId,
      transitionType: 'GENOME_SYNCHRONIZATION',
      changedFields,
      provenance: sortedProvenanceSource
    });

    const transitionId = `trans_${computeCanonicalHash(transitionSignature)}`;
    
    const transition: StateTransition = deepFreeze({
      transitionId,
      sourceStateId: currentState.stateId,
      targetStateId,
      transitionType: 'GENOME_SYNCHRONIZATION',
      changedFields,
      provenance: canonicalizeProvenance([...currentState.provenance, ...provenanceSource]),
      timestamp: deterministicTimestamp || new Date().toISOString()
    });

    logger.debug('CellStateManager', 'genome_synchronized', { 
      cellIdentity: currentState.cellIdentity,
      sourceState: currentState.stateId, 
      targetState: targetStateId, 
      genomeReference: newGenomeReference 
    });

    return { newState, transition };
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
    
    safeNewData.provenance = canonicalizeProvenance([...currentState.provenance, ...provenanceSource]);

    const targetStateId = this.generateStateId(safeNewData as Omit<CellState, 'stateId'>);
    
    const newState: CellState = deepFreeze({
      ...(safeNewData as Omit<CellState, 'stateId'>),
      stateId: targetStateId
    });

    const changedFields = Object.keys(updates).sort();
    const sortedProvenanceSource = canonicalizeProvenance(provenanceSource);
    
    const transitionSignature = canonicalSerialize({
      sourceStateId: currentState.stateId,
      targetStateId: targetStateId,
      transitionType,
      changedFields,
      provenance: sortedProvenanceSource
    });

    const transitionId = `trans_${computeCanonicalHash(transitionSignature)}`;
    
    const transition: StateTransition = deepFreeze({
      transitionId,
      sourceStateId: currentState.stateId,
      targetStateId,
      transitionType,
      changedFields,
      provenance: canonicalizeProvenance([...currentState.provenance, ...provenanceSource]),
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
