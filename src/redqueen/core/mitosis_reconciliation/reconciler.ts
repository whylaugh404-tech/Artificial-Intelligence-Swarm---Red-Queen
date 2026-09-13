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
       memDist: spec.memoryDistribution,
       knowDist: spec.knowledgeDistribution,
       cogDist: spec.cognitiveDistribution,
       reasonDist: spec.reasoningDistribution,
       expDist: spec.experienceDistribution
    }));

    const childAIdentity = `${parentState.cellIdentity}_A_${specSignature}`;
    const childBIdentity = `${parentState.cellIdentity}_B_${specSignature}`;

    // Rule: Check overlapping distributions
    const checkOverlap = (distA: string[], distB: string[], context: string) => {
      if (spec.allowSharedInheritance) return;
      const setA = new Set(distA);
      for (const key of distB) {
        if (setA.has(key)) {
          throw new Error(`Mitosis Reconciliation Failed: Overlapping inheritance in ${context} not allowed without explicit flag (Key: ${key})`);
        }
      }
    };

    checkOverlap(spec.memoryDistribution.childA, spec.memoryDistribution.childB, 'memoryDistribution');
    checkOverlap(spec.knowledgeDistribution.childA, spec.knowledgeDistribution.childB, 'knowledgeDistribution');
    checkOverlap(spec.cognitiveDistribution.childA, spec.cognitiveDistribution.childB, 'cognitiveDistribution');
    checkOverlap(spec.reasoningDistribution.childA, spec.reasoningDistribution.childB, 'reasoningDistribution');
    checkOverlap(spec.experienceDistribution.childA, spec.experienceDistribution.childB, 'experienceDistribution');

    // Distribution helper for shallow state sections
    const distributeState = (source: Record<string, unknown>, distributionKeys: string[], context: string) => {
      const result: Record<string, unknown> = {};
      for (const key of distributionKeys) {
        if (!(key in source)) {
          throw new Error(`Mitosis Reconciliation Failed: Key '${key}' not found in parent ${context}`);
        }
        result[key] = source[key];
      }
      return result;
    };

    const memoryA = distributeState(parentState.memoryState, spec.memoryDistribution.childA, 'memoryState');
    const memoryB = distributeState(parentState.memoryState, spec.memoryDistribution.childB, 'memoryState');

    const knowledgeA = distributeState(parentState.knowledgeState, spec.knowledgeDistribution.childA, 'knowledgeState');
    const knowledgeB = distributeState(parentState.knowledgeState, spec.knowledgeDistribution.childB, 'knowledgeState');

    const cognitiveA = distributeState(parentState.cognitiveState, spec.cognitiveDistribution.childA, 'cognitiveState');
    const cognitiveB = distributeState(parentState.cognitiveState, spec.cognitiveDistribution.childB, 'cognitiveState');

    const reasoningA = distributeState(parentState.reasoningState, spec.reasoningDistribution.childA, 'reasoningState');
    const reasoningB = distributeState(parentState.reasoningState, spec.reasoningDistribution.childB, 'reasoningState');

    const experienceA = distributeState(parentState.experienceState, spec.experienceDistribution.childA, 'experienceState');
    const experienceB = distributeState(parentState.experienceState, spec.experienceDistribution.childB, 'experienceState');

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
      knowledgeState: knowledgeA, 
      cognitiveState: cognitiveA,
      reasoningState: reasoningA,
      experienceState: experienceA,
      computationalCapability: aggregateCapabilities(childAPartitions),
      specializations: spec.differentiationProfileA,
      lifecycle: parentState.lifecycle,
      provenance: [...parentState.provenance, `mitosis:${mitosisId}:childA`]
    };

    const childBData: Omit<CellState, 'stateId'> = {
      cellIdentity: childBIdentity,
      genomeReference: parentState.genomeReference,
      memoryState: memoryB,
      knowledgeState: knowledgeB, 
      cognitiveState: cognitiveB,
      reasoningState: reasoningB,
      experienceState: experienceB,
      computationalCapability: aggregateCapabilities(childBPartitions),
      specializations: spec.differentiationProfileB,
      lifecycle: parentState.lifecycle,
      provenance: [...parentState.provenance, `mitosis:${mitosisId}:childB`]
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
          inheritedKnowledgeKeys: Object.keys(knowledgeA).length,
          inheritedCognitiveKeys: Object.keys(cognitiveA).length,
          inheritedReasoningKeys: Object.keys(reasoningA).length,
          inheritedExperienceKeys: Object.keys(experienceA).length,
          specializationFocus: spec.differentiationProfileA.map(s => s.domain)
        },
        childB: { 
          inheritedPartitions: childBPartitions.length, 
          inheritedMemoryKeys: Object.keys(memoryB).length,
          inheritedKnowledgeKeys: Object.keys(knowledgeB).length,
          inheritedCognitiveKeys: Object.keys(cognitiveB).length,
          inheritedReasoningKeys: Object.keys(reasoningB).length,
          inheritedExperienceKeys: Object.keys(experienceB).length,
          specializationFocus: spec.differentiationProfileB.map(s => s.domain)
        }
      },
      provenance: [`mitosis:${mitosisId}`, `parent:${parentState.stateId}`].sort()
    };
  }
}
