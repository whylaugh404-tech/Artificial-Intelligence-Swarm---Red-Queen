import { CompositionEngine } from '../composition/engine';
import {
  CompositionConstraint,
  CompositionContext,
  CompositionInput,
  CompositionRelation,
  CompositionTopology,
  CompositionType
} from '../composition/types';
import { ComputePartition } from '../compute/types';
import { CellState } from '../state/types';
import { CognitiveCompositionRule } from './rule';
import {
  CognitiveCompositionResult,
  CognitiveCompositionResultSchema,
  ComposeCognitiveStateParams,
  ResultingCognitiveState
} from './types';

/**
 * Deep-freezes an object recursively for strict immutability.
 */
function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.keys(obj as Record<string, unknown>).forEach(prop => {
      deepFreeze((obj as Record<string, unknown>)[prop]);
    });
    Object.freeze(obj);
  }
  return obj;
}

/**
 * R4: High-level Cognitive State Composition
 * Combines Cognitive State + Compute Partition + Knowledge/Experience
 * into a structured compositional result using R1 primitive composition.
 */
export function composeCognitiveState(
  params: ComposeCognitiveStateParams
): CognitiveCompositionResult {
  // Guarantee input immutability by cloning inputs before processing
  const safeCognitive = structuredClone(params.cognitiveState);
  const safeKnowledge = structuredClone(params.knowledgeState);
  const safeExperience = structuredClone(params.experienceState);
  const safeReasoning = structuredClone(params.reasoningState);
  const safeEpistemic = params.epistemicState ? structuredClone(params.epistemicState) : undefined;
  const safeSpecialization = params.specialization ? structuredClone(params.specialization) : undefined;

  const rawPartitions = Array.isArray(params.computePartitions)
    ? params.computePartitions
    : [params.computePartitions];

  if (rawPartitions.length === 0) {
    throw new Error('Cognitive composition requires at least one ComputePartition.');
  }

  // Sort partitions canonically by partitionId
  const sortedPartitions = [...rawPartitions].sort((a, b) =>
    a.partitionId.localeCompare(b.partitionId)
  );

  const cellId = params.cellIdentity;
  const cognitionInputId = `input_cognition_${cellId}`;
  const knowledgeInputId = `input_knowledge_${cellId}`;
  const experienceInputId = `input_experience_${cellId}`;
  const reasoningInputId = `input_reasoning_${cellId}`;

  // 1. Build canonical CompositionInputs for R1 engine
  const compositionInputs: CompositionInput[] = [
    {
      inputId: cognitionInputId,
      type: CompositionType.UNDERSTANDING,
      structure: safeCognitive,
      provenance: params.provenance ?? [`cell:${cellId}:cognition`]
    },
    {
      inputId: knowledgeInputId,
      type: CompositionType.KNOWLEDGE,
      structure: safeKnowledge,
      provenance: params.provenance ?? [`cell:${cellId}:knowledge`]
    },
    {
      inputId: experienceInputId,
      type: CompositionType.EXPERIENCE,
      structure: safeExperience,
      provenance: params.provenance ?? [`cell:${cellId}:experience`]
    },
    {
      inputId: reasoningInputId,
      type: CompositionType.REASONING,
      structure: safeReasoning,
      provenance: params.provenance ?? [`cell:${cellId}:reasoning`]
    }
  ];

  if (safeEpistemic) {
    compositionInputs.push({
      inputId: `input_epistemic_${cellId}`,
      type: CompositionType.CELL_STATE,
      structure: safeEpistemic,
      provenance: params.provenance ? [...params.provenance, `cell:${cellId}:epistemic`] : [`cell:${cellId}:epistemic`]
    });
  }

  if (safeSpecialization) {
    compositionInputs.push({
      inputId: `input_specialization_${cellId}`,
      type: CompositionType.GENERIC_STRUCTURE,
      structure: typeof safeSpecialization === 'object' && !Array.isArray(safeSpecialization)
        ? (safeSpecialization as Record<string, unknown>)
        : { value: safeSpecialization },
      provenance: params.provenance ? [...params.provenance, `cell:${cellId}:specialization`] : [`cell:${cellId}:specialization`]
    });
  }

  for (const part of sortedPartitions) {
    compositionInputs.push({
      inputId: `input_compute_${part.partitionId}`,
      type: CompositionType.COMPUTE,
      structure: {
        partitionId: part.partitionId,
        name: part.name,
        architecture: part.architecture,
        capacity: part.capacity,
        parallelism: part.parallelism,
        memory: part.memory,
        specialization: part.specialization,
        availability: part.availability,
        communicationProfile: {
          bandwidth: part.communicationProfile.bandwidth,
          latency: part.communicationProfile.latency,
          topology: part.communicationProfile.topology,
          reliability: part.communicationProfile.reliability
        }
      },
      provenance: [part.partitionId]
    });
  }

  // Sort inputs canonically by inputId
  compositionInputs.sort((a, b) => a.inputId.localeCompare(b.inputId));

  // 2. Build or sort relations
  let relations: CompositionRelation[];
  if (params.relations && params.relations.length > 0) {
    relations = [...params.relations].sort((a, b) => a.relationId.localeCompare(b.relationId));
  } else {
    // Default canonical relations linking knowledge, experience, reasoning, compute to cognition
    relations = [
      {
        relationId: `rel_know_reason_${cellId}`,
        sourceInputId: knowledgeInputId,
        targetInputId: reasoningInputId,
        relationType: 'INFORMS',
        semantics: { role: 'epistemic_grounding' }
      },
      {
        relationId: `rel_exp_reason_${cellId}`,
        sourceInputId: experienceInputId,
        targetInputId: reasoningInputId,
        relationType: 'CALIBRATES',
        semantics: { role: 'empirical_calibration' }
      },
      {
        relationId: `rel_reason_cog_${cellId}`,
        sourceInputId: reasoningInputId,
        targetInputId: cognitionInputId,
        relationType: 'MODULATES',
        semantics: { role: 'deliberative_control' }
      },
      {
        relationId: `rel_comp_cog_${cellId}`,
        sourceInputId: `input_compute_${sortedPartitions[0].partitionId}`,
        targetInputId: cognitionInputId,
        relationType: 'ENERGIZES',
        semantics: { role: 'computational_substrate' }
      }
    ].sort((a, b) => a.relationId.localeCompare(b.relationId));
  }

  // 3. Constraints sorting
  const constraints = params.constraints
    ? [...params.constraints].sort((a, b) => a.constraintId.localeCompare(b.constraintId))
    : [];

  // 4. Initialize R1 CompositionEngine with CognitiveCompositionRule
  const engine = new CompositionEngine();
  const rule = new CognitiveCompositionRule();
  engine.registerRule(rule);

  // 5. Execute R1 primitive composition
  const r1Result = engine.compose(
    rule.transformationType,
    compositionInputs,
    relations,
    params.topology,
    constraints,
    params.context,
    params.deterministicTimestamp
  );

  const derived = r1Result.derivedStructure as {
    resultingCognitiveState: ResultingCognitiveState;
    computeSummary: {
      totalCapacity: number;
      totalParallelism: number;
      totalMemory: number;
      partitionCount: number;
    };
  };

  const aggregateCap = {
    capacity: derived.computeSummary.totalCapacity,
    parallelism: derived.computeSummary.totalParallelism,
    memoryLimit: derived.computeSummary.totalMemory,
    architecture: sortedPartitions[0]?.architecture ?? 'generic'
  };

  // 6. Assemble Structured Cognitive Composition Result
  const rawResult: CognitiveCompositionResult = {
    compositionId: r1Result.resultId,
    cellIdentity: cellId,
    transformation: {
      rule: rule.transformationType,
      traceId: r1Result.trace.traceId,
      reasoningTrace: r1Result.trace.reasoningTrace
    },
    inputStates: {
      cognitiveState: safeCognitive,
      knowledgeState: safeKnowledge,
      experienceState: safeExperience,
      reasoningState: safeReasoning,
      ...(safeEpistemic ? { epistemicState: safeEpistemic } : {}),
      ...(safeSpecialization ? { specialization: safeSpecialization } : {})
    },
    relationships: relations,
    topology: params.topology,
    computeResources: {
      partitions: sortedPartitions,
      aggregateCapability: aggregateCap
    },
    resultingCognitiveState: derived.resultingCognitiveState,
    resultVector: derived.resultingCognitiveState.linearComposition?.resultVector,
    featureProvenance: derived.resultingCognitiveState.linearComposition?.featureProvenance,
    provenance: r1Result.provenance,
    metadata: {
      compositionTimestamp: r1Result.trace.timestamp,
      traceId: r1Result.trace.traceId
    }
  };

  // Validate output against Zod schema
  const validated = CognitiveCompositionResultSchema.parse(rawResult);

  return deepFreeze(validated);
}

/**
 * Convenient composition helper directly accepting a CellState (R2) and ComputePartition(s) (R3).
 */
export function composeFromCellState(
  cellState: CellState,
  options: {
    computePartitions?: ComputePartition | ComputePartition[];
    relations?: CompositionRelation[];
    topology?: CompositionTopology;
    constraints?: CompositionConstraint[];
    context: CompositionContext;
    deterministicTimestamp?: string;
  }
): CognitiveCompositionResult {
  const partitions = options.computePartitions
    ?? cellState.computationalCapability.partitions;

  if (!partitions || (Array.isArray(partitions) && partitions.length === 0)) {
    throw new Error('CellState does not contain partitions and no partitions were provided.');
  }

  return composeCognitiveState({
    cellIdentity: cellState.cellIdentity,
    cognitiveState: cellState.cognitiveState,
    knowledgeState: cellState.knowledgeState,
    experienceState: cellState.experienceState,
    reasoningState: cellState.reasoningState,
    epistemicState: (cellState.cognitiveState as Record<string, unknown>)?.epistemicState as Record<string, unknown> | undefined,
    specialization: cellState.specializations,
    computePartitions: partitions,
    relations: options.relations,
    topology: options.topology,
    constraints: options.constraints,
    context: options.context,
    provenance: cellState.provenance,
    deterministicTimestamp: options.deterministicTimestamp
  });
}
