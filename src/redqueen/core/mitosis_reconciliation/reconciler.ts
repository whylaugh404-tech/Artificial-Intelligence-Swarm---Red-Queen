import { createHash } from 'crypto';
import { CellState } from '../state/types';
import { CellStateManager, canonicalSerialize } from '../state/engine';
import { 
  MitosisSpecification, 
  MitosisReconciliationResult,
  MitosisSpecificationSchema
} from './types';
import { aggregateCapabilities, updateComputePartition } from '../compute/partition';

export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').substring(0, 16);
}

export class MitosisReconciler {
  private stateManager = new CellStateManager();

  public reconcile(spec: MitosisSpecification): MitosisReconciliationResult {
    MitosisSpecificationSchema.parse(spec);

    const { parentState, mitosisId } = spec;

    // Deterministic identity base for children
    const specSignature = computeHash(canonicalSerialize({
       mitosisId,
       parentId: parentState.stateId,
       partDist: spec.partitionDistribution,
       memDist: spec.memoryDistribution
    }));

    const childAIdentity = `${parentState.cellIdentity}_A_${specSignature}`;
    const childBIdentity = `${parentState.cellIdentity}_B_${specSignature}`;

    // Distribution helper for shallow state sections (Memory, Knowledge)
    const distributeState = (source: Record<string, unknown>, distributionKeys: string[]) => {
      const result: Record<string, unknown> = {};
      const keySet = new Set(distributionKeys);
      for (const [key, val] of Object.entries(source)) {
        if (keySet.has(key)) {
          result[key] = val; 
        }
      }
      return result;
    };

    const memoryA = distributeState(parentState.memoryState, spec.memoryDistribution.childA);
    const memoryB = distributeState(parentState.memoryState, spec.memoryDistribution.childB);

    // Compute partitions must be re-bound to the child's identity to maintain ownership determinism
    const parentPartitions = parentState.computationalCapability.partitions || [];
    
    const rawPartitionsA = parentPartitions.filter(p => spec.partitionDistribution.childA.includes(p.partitionId));
    const rawPartitionsB = parentPartitions.filter(p => spec.partitionDistribution.childB.includes(p.partitionId));

    const childAPartitions = rawPartitionsA.map(p => updateComputePartition(p, { cellIdentity: childAIdentity }));
    const childBPartitions = rawPartitionsB.map(p => updateComputePartition(p, { cellIdentity: childBIdentity }));

    // Inherited states
    const childAData: Omit<CellState, 'stateId'> = {
      cellIdentity: childAIdentity,
      genomeReference: parentState.genomeReference,
      memoryState: memoryA,
      knowledgeState: parentState.knowledgeState, 
      cognitiveState: parentState.cognitiveState,
      reasoningState: parentState.reasoningState,
      experienceState: parentState.experienceState,
      computationalCapability: aggregateCapabilities(childAPartitions),
      specializations: spec.differentiationProfileA,
      lifecycle: parentState.lifecycle,
      provenance: [...parentState.provenance, `mitosis:${mitosisId}:childA`].sort()
    };

    const childBData: Omit<CellState, 'stateId'> = {
      cellIdentity: childBIdentity,
      genomeReference: parentState.genomeReference,
      memoryState: memoryB,
      knowledgeState: parentState.knowledgeState, 
      cognitiveState: parentState.cognitiveState,
      reasoningState: parentState.reasoningState,
      experienceState: parentState.experienceState,
      computationalCapability: aggregateCapabilities(childBPartitions),
      specializations: spec.differentiationProfileB,
      lifecycle: parentState.lifecycle,
      provenance: [...parentState.provenance, `mitosis:${mitosisId}:childB`].sort()
    };

    const childA = this.stateManager.createInitialState(childAData);
    const childB = this.stateManager.createInitialState(childBData);

    // Rule Verification: Child A != Child B, Parent != Child
    if (childA.stateId === parentState.stateId || childB.stateId === parentState.stateId || childA.stateId === childB.stateId) {
       throw new Error("Mitosis Reconciliation Failed: Child identity collision detected.");
    }

    return {
      mitosisId,
      parentStateId: parentState.stateId,
      childA,
      childB,
      differentiationMetadata: {
        childA: { 
          inheritedPartitions: childAPartitions.length, 
          inheritedMemoryKeys: Object.keys(memoryA).length,
          specializationFocus: spec.differentiationProfileA.map(s => s.domain)
        },
        childB: { 
          inheritedPartitions: childBPartitions.length, 
          inheritedMemoryKeys: Object.keys(memoryB).length,
          specializationFocus: spec.differentiationProfileB.map(s => s.domain)
        }
      },
      provenance: [`mitosis:${mitosisId}`, `parent:${parentState.stateId}`].sort()
    };
  }
}
