import { CellState } from '../state/types';
import { CellStateManager } from '../state/engine';
import {
  canonicalSerialize,
  computeCanonicalHash,
  computeHash
} from '../canonical';
import { 
  MitosisSpecification, 
  MitosisReconciliationResult,
  MitosisSpecificationSchema
} from './types';
import { aggregateCapabilities, updateComputePartition } from '../compute/partition';

export { computeHash };

/**
 * Recursively rebinds representation ownership from parent to child cell.
 * Preserves the true originatingCellId while rebinding currentHolderCellId to target child.
 */
function recursivelyRebindOwnership(
  value: unknown,
  targetCellIdentity: string,
  parentCellIdentity: string
): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => recursivelyRebindOwnership(item, targetCellIdentity, parentCellIdentity));
  }
  const obj = value as Record<string, unknown>;
  const remapped: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(obj)) {
    remapped[k] = recursivelyRebindOwnership(v, targetCellIdentity, parentCellIdentity);
  }

  // Check if this object represents a cognitive concept, relation, or tracked representation
  const isRepresentation =
    ('originatingCellId' in obj) ||
    ('currentHolderCellId' in obj) ||
    ('conceptId' in obj) ||
    ('relationId' in obj);

  if (isRepresentation) {
    const existingOrigin = (typeof obj.originatingCellId === 'string' && obj.originatingCellId.trim() !== '')
      ? obj.originatingCellId
      : parentCellIdentity;
    
    remapped.originatingCellId = existingOrigin;
    remapped.currentHolderCellId = targetCellIdentity;
  }

  return remapped;
}

export class MitosisReconciler {
  private stateManager = new CellStateManager();

  public reconcile(spec: MitosisSpecification): MitosisReconciliationResult {
    MitosisSpecificationSchema.parse(spec);

    const { parentState, mitosisId } = spec;

    // STEP 1 & 2: Validate deterministic partition and state distribution
    const checkOverlap = (distA: string[], distB: string[], context: string) => {
      if (spec.allowSharedInheritance) return;
      const setA = new Set(distA);
      for (const key of distB) {
        if (setA.has(key)) {
          throw new Error(`Mitosis Reconciliation Failed: Overlapping inheritance in ${context} not allowed without explicit flag (Key: ${key})`);
        }
      }
    };

    checkOverlap(spec.partitionDistribution.childA, spec.partitionDistribution.childB, 'partitionDistribution');
    checkOverlap(spec.memoryDistribution.childA, spec.memoryDistribution.childB, 'memoryDistribution');
    checkOverlap(spec.knowledgeDistribution.childA, spec.knowledgeDistribution.childB, 'knowledgeDistribution');
    checkOverlap(spec.cognitiveDistribution.childA, spec.cognitiveDistribution.childB, 'cognitiveDistribution');
    checkOverlap(spec.reasoningDistribution.childA, spec.reasoningDistribution.childB, 'reasoningDistribution');
    checkOverlap(spec.experienceDistribution.childA, spec.experienceDistribution.childB, 'experienceDistribution');

    // STEP 3: Differentiation profiles
    const diffProfileA = spec.differentiationProfileA || [];
    const diffProfileB = spec.differentiationProfileB || [];

    // STEP 4: Deterministic child identity computation (must incorporate differentiation profile)
    const childASignature = computeCanonicalHash({
      mitosisId,
      parentStateId: parentState.stateId,
      parentCellIdentity: parentState.cellIdentity,
      branch: 'A',
      differentiationProfile: diffProfileA,
      partitionDistribution: [...spec.partitionDistribution.childA].sort(),
      memoryDistribution: [...spec.memoryDistribution.childA].sort(),
      knowledgeDistribution: [...spec.knowledgeDistribution.childA].sort(),
      cognitiveDistribution: [...spec.cognitiveDistribution.childA].sort(),
      reasoningDistribution: [...spec.reasoningDistribution.childA].sort(),
      experienceDistribution: [...spec.experienceDistribution.childA].sort()
    });

    const childBSignature = computeCanonicalHash({
      mitosisId,
      parentStateId: parentState.stateId,
      parentCellIdentity: parentState.cellIdentity,
      branch: 'B',
      differentiationProfile: diffProfileB,
      partitionDistribution: [...spec.partitionDistribution.childB].sort(),
      memoryDistribution: [...spec.memoryDistribution.childB].sort(),
      knowledgeDistribution: [...spec.knowledgeDistribution.childB].sort(),
      cognitiveDistribution: [...spec.cognitiveDistribution.childB].sort(),
      reasoningDistribution: [...spec.reasoningDistribution.childB].sort(),
      experienceDistribution: [...spec.experienceDistribution.childB].sort()
    });

    const childAIdentity = `${parentState.cellIdentity}_A_${childASignature}`;
    const childBIdentity = `${parentState.cellIdentity}_B_${childBSignature}`;

    // STEP 5: Ownership rebinding on distributed state sections and compute partitions
    const distributeState = (
      source: Record<string, unknown>, 
      distributionKeys: string[], 
      context: string,
      targetCellIdentity: string
    ) => {
      const result: Record<string, unknown> = {};
      for (const key of distributionKeys) {
        if (!(key in source)) {
          throw new Error(`Mitosis Reconciliation Failed: Key '${key}' not found in parent ${context}`);
        }
        const val = source[key];
        result[key] = recursivelyRebindOwnership(val, targetCellIdentity, parentState.cellIdentity);
      }
      return result;
    };

    const memoryA = distributeState(parentState.memoryState, spec.memoryDistribution.childA, 'memoryState', childAIdentity);
    const memoryB = distributeState(parentState.memoryState, spec.memoryDistribution.childB, 'memoryState', childBIdentity);

    const knowledgeA = distributeState(parentState.knowledgeState, spec.knowledgeDistribution.childA, 'knowledgeState', childAIdentity);
    const knowledgeB = distributeState(parentState.knowledgeState, spec.knowledgeDistribution.childB, 'knowledgeState', childBIdentity);

    const cognitiveA = distributeState(parentState.cognitiveState, spec.cognitiveDistribution.childA, 'cognitiveState', childAIdentity);
    const cognitiveB = distributeState(parentState.cognitiveState, spec.cognitiveDistribution.childB, 'cognitiveState', childBIdentity);

    const reasoningA = distributeState(parentState.reasoningState, spec.reasoningDistribution.childA, 'reasoningState', childAIdentity);
    const reasoningB = distributeState(parentState.reasoningState, spec.reasoningDistribution.childB, 'reasoningState', childBIdentity);

    const experienceA = distributeState(parentState.experienceState, spec.experienceDistribution.childA, 'experienceState', childAIdentity);
    const experienceB = distributeState(parentState.experienceState, spec.experienceDistribution.childB, 'experienceState', childBIdentity);

    // Compute partitions must be validated and re-bound to the child's identity to maintain ownership determinism
    const parentPartitions = parentState.computationalCapability.partitions || [];
    const partitionMap = new Map<string, typeof parentPartitions[0]>();
    for (const p of parentPartitions) {
      partitionMap.set(p.partitionId, p);
    }

    const distributePartitions = (partitionIds: string[], targetChildIdentity: string, childName: string) => {
      return partitionIds.map(partitionId => {
        const partition = partitionMap.get(partitionId);
        if (!partition) {
          throw new Error(`Mitosis Reconciliation Failed: Partition ID '${partitionId}' not found in parent compute partitions for ${childName}`);
        }
        return updateComputePartition(partition, { cellIdentity: targetChildIdentity });
      });
    };

    const childAPartitions = distributePartitions(spec.partitionDistribution.childA, childAIdentity, 'childA');
    const childBPartitions = distributePartitions(spec.partitionDistribution.childB, childBIdentity, 'childB');

    // STEP 6: Inherited states with complete provenance chain
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
      provenance: [`parent:${parentState.stateId}`, `mitosis:${mitosisId}`]
    };
  }
}
