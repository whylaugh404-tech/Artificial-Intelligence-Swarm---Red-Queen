import { createHash } from 'crypto';
import { canonicalSerialize } from '../composition/engine';
import { CognitiveCompositionResult } from '../cognitive_composition/types';
import {
  DetectEmergenceParams,
  EmergenceDependency,
  EmergenceDetectionResult,
  EmergentState,
  EmergentStateSchema,
  NoveltyRepresentation,
  StructuralDifference
} from './types';

/**
 * Deep freezes an object recursively.
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

function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').substring(0, 16);
}

/**
 * R5: Emergence Model & Detection Engine
 * Evaluates whether a composition produced a non-trivial emergent structure
 * that is not merely an identical copy, clone, or subset of inputs.
 */
export class EmergenceDetector {
  /**
   * Detects whether an emergent state has materialized from composition inputs and result.
   */
  public detect(params: DetectEmergenceParams): EmergenceDetectionResult {
    const inputEntries = Object.entries(params.inputStructures);
    const serializedResult = canonicalSerialize(params.resultingStructure);

    // 1. REJECT IF CLONE / IDENTICAL TO ANY INPUT
    for (const [inputId, inputStructure] of inputEntries) {
      const serializedInput = canonicalSerialize(inputStructure);
      if (serializedResult === serializedInput) {
        return {
          isEmergent: false,
          reason: `Resulting structure is structurally identical to input '${inputId}' (copy/clone). No emergence.`
        };
      }
    }

    // 2. DETECT NOVEL STRUCTURAL DIFFERENCES
    const differences: StructuralDifference[] = [];
    const novelStructures: Record<string, unknown> = {};

    this.findStructuralDifferences(
      '',
      params.resultingStructure,
      params.inputStructures,
      differences,
      novelStructures
    );

    // 3. REJECT IF NO NOVEL STRUCTURAL CAPABILITY
    if (differences.length === 0) {
      return {
        isEmergent: false,
        reason: 'No novel structural properties or operational capabilities detected. Simple aggregation without emergence.'
      };
    }

    // 4. CONSTRUCT AUDITABLE NOVELTY REPRESENTATION
    const explanatorySummary =
      `Identified ${differences.length} synthesized structural element(s) derived through rule ` +
      `'${params.transformation.rule}' from composition '${params.compositionId}'. ` +
      `Novel elements include: ${differences.slice(0, 3).map(d => d.path).join(', ')}` +
      `${differences.length > 3 ? '...' : ''}.`;

    const novelty: NoveltyRepresentation = {
      sourceCompositionId: params.compositionId,
      novelStructures,
      structuralDifferences: differences,
      explanatorySummary,
      isNovel: true
    };

    // 5. MAP INTER-DEPENDENCY AND DEPENDENCY GRAPH
    const inputDependencies = Object.keys(params.inputStructures).sort();
    const interDependencies = (params.relationships ?? []).map(r => ({
      source: r.sourceInputId,
      target: r.targetInputId,
      type: r.relationType
    }));

    const dependency: EmergenceDependency = {
      inputDependencies,
      interDependencies
    };

    // 6. COMPUTE DETERMINISTIC EMERGENCE IDENTITY (Excluding execution timestamp)
    const semanticPayload = {
      sourceCompositionIds: [params.compositionId],
      sourceStateIds: [...params.sourceStateIds].sort(),
      inputStructure: canonicalSerialize(params.inputStructures),
      resultingStructure: serializedResult,
      transformation: {
        transformationType: params.transformation.transformationType,
        rule: params.transformation.rule,
        traceId: params.transformation.traceId
      },
      novelty: {
        structuralDifferences: differences.map(d => ({
          path: d.path,
          changeType: d.changeType,
          newValue: canonicalSerialize(d.newValue)
        }))
      },
      dependency: {
        inputDependencies: dependency.inputDependencies,
        interDependencies: dependency.interDependencies
      }
    };

    const emergenceId = `emg_${computeHash(canonicalSerialize(semanticPayload))}`;

    // 7. ASSEMBLE COMPLETE PROVENANCE CHAIN
    const combinedProvenance = new Set<string>(params.provenance);
    combinedProvenance.add(params.transformation.traceId);
    combinedProvenance.add(params.compositionId);
    combinedProvenance.add(emergenceId);

    // 8. ASSEMBLE EMERGENT STATE
    const timestamp = params.deterministicTimestamp || new Date().toISOString();

    const rawEmergentState: EmergentState = {
      emergenceId,
      sourceCompositionIds: [params.compositionId],
      sourceStateIds: [...params.sourceStateIds].sort(),
      inputStructure: structuredClone(params.inputStructures),
      resultingStructure: structuredClone(params.resultingStructure),
      transformation: {
        transformationType: params.transformation.transformationType,
        rule: params.transformation.rule,
        traceId: params.transformation.traceId,
        reasoningTrace: params.transformation.reasoningTrace
      },
      novelty,
      dependency,
      provenance: Array.from(combinedProvenance).sort(),
      verificationStatus: 'UNVERIFIED', // Default to UNVERIFIED pending external verification mechanism
      metadata: {
        detectionTimestamp: timestamp,
        ruleApplied: params.transformation.rule
      }
    };

    const validatedState = EmergentStateSchema.parse(rawEmergentState);

    return {
      isEmergent: true,
      reason: 'Emergent structural properties successfully detected and verified.',
      emergentState: deepFreeze(validatedState),
      novelty: deepFreeze(novelty)
    };
  }

  /**
   * Recursively inspects the resulting structure against all input structures
   * to discover synthesized or added paths and capabilities.
   */
  private findStructuralDifferences(
    currentPath: string,
    resultObj: unknown,
    inputStructures: Record<string, Record<string, unknown>>,
    differences: StructuralDifference[],
    novelStructures: Record<string, unknown>
  ): void {
    if (resultObj === null || typeof resultObj !== 'object') {
      return;
    }

    const obj = resultObj as Record<string, unknown>;

    const EXCLUDED_KEYS = new Set([
      'metadata',
      'compositionTimestamp',
      'traceId',
      'compositionId',
      'operationalBounds', // simple aggregation summary from R4, not genuine synthesis
      'specializationAlignment',
      'relationGraph',
      'computeSummary'
    ]);

    for (const [key, value] of Object.entries(obj)) {
      if (EXCLUDED_KEYS.has(key)) {
        continue;
      }
      const fullPath = currentPath ? `${currentPath}.${key}` : key;

      // Check if this property exists in any input structure
      let foundInAnyInput = false;
      let matchedValue = false;

      for (const input of Object.values(inputStructures)) {
        if (this.hasPath(input, fullPath)) {
          foundInAnyInput = true;
          const inputVal = this.getPath(input, fullPath);
          if (canonicalSerialize(inputVal) === canonicalSerialize(value)) {
            matchedValue = true;
            break;
          }
        }
      }

      if (!foundInAnyInput) {
        // Property was not in any input -> Newly synthesized/added
        differences.push({
          path: fullPath,
          changeType: 'SYNTHESIZED',
          description: `Novel property '${fullPath}' materialized through composition.`,
          newValue: value
        });
        novelStructures[fullPath] = value;

        // If the newly synthesized structure is an object, also record its subproperties
        if (typeof value === 'object' && value !== null) {
          this.findStructuralDifferences(
            fullPath,
            value,
            inputStructures,
            differences,
            novelStructures
          );
        }
      } else if (!matchedValue && typeof value !== 'object') {
        // Property was present but value was modified/computed
        differences.push({
          path: fullPath,
          changeType: 'MODIFIED',
          description: `Synthesized new computed value at '${fullPath}'.`,
          newValue: value
        });
        novelStructures[fullPath] = value;
      } else if (typeof value === 'object' && value !== null) {
        // Recurse deeper into nested properties
        this.findStructuralDifferences(
          fullPath,
          value,
          inputStructures,
          differences,
          novelStructures
        );
      }
    }
  }

  private hasPath(obj: Record<string, unknown>, path: string): boolean {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || typeof current !== 'object') return false;
      if (!(part in (current as Record<string, unknown>))) return false;
      current = (current as Record<string, unknown>)[part];
    }
    return true;
  }

  private getPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}

/**
 * Convenient helper to detect emergence directly from an R4 CognitiveCompositionResult.
 */
export function detectCognitiveEmergence(
  cognitiveResult: CognitiveCompositionResult,
  options?: { deterministicTimestamp?: string }
): EmergenceDetectionResult {
  const detector = new EmergenceDetector();

  const inputStructures: Record<string, Record<string, unknown>> = {
    cognitive: cognitiveResult.inputStates.cognitiveState,
    knowledge: cognitiveResult.inputStates.knowledgeState,
    experience: cognitiveResult.inputStates.experienceState,
    reasoning: cognitiveResult.inputStates.reasoningState
  };

  // Add compute partitions to input structures
  for (const part of cognitiveResult.computeResources.partitions) {
    inputStructures[`compute_${part.partitionId}`] = {
      capacity: part.capacity,
      parallelism: part.parallelism,
      memory: part.memory,
      specialization: part.specialization,
      availability: part.availability,
      architecture: part.architecture
    };
  }

  return detector.detect({
    compositionId: cognitiveResult.compositionId,
    sourceStateIds: [cognitiveResult.cellIdentity],
    inputStructures,
    resultingStructure: {
      mode: cognitiveResult.resultingCognitiveState.mode,
      contextDomain: cognitiveResult.resultingCognitiveState.contextDomain,
      operationalBounds: cognitiveResult.resultingCognitiveState.operationalBounds,
      relationGraph: cognitiveResult.resultingCognitiveState.relationGraph,
      specializationAlignment: cognitiveResult.resultingCognitiveState.specializationAlignment
    },
    transformation: {
      transformationType: cognitiveResult.transformation.rule,
      rule: cognitiveResult.transformation.rule,
      traceId: cognitiveResult.transformation.traceId,
      reasoningTrace: cognitiveResult.transformation.reasoningTrace
    },
    relationships: cognitiveResult.relationships.map(r => ({
      sourceInputId: r.sourceInputId,
      targetInputId: r.targetInputId,
      relationType: r.relationType
    })),
    provenance: cognitiveResult.provenance,
    deterministicTimestamp: options?.deterministicTimestamp
  });
}
