import { Cell } from '../../core/cell';
import { CognitiveRelationPredicate, RepresentationVerificationStatus } from '../representation/types';
import { ConflictType, ConflictResolutionDecision } from '../verification/types';
import { Context, EpistemicTransitionTrigger, EpistemicStatus } from '../epistemic/types';
import { CognitiveUnderstanding } from '../understanding/types';
import { deepFreeze } from '../../genome/genome';
import { logger } from '../../core/logger';
import { computeDeterministicHash } from '../computation/canonical';
import { applyTanhVector } from '../activation';
import {
  DEFAULT_CHAOS_R,
  DEFAULT_CHAOS_LAMBDA,
  deriveDeterministicC0,
  deriveCellSemanticC0,
  computeCellChaosDynamics,
  iterateLogisticMap,
  calculateChaosModulation,
  modulateActivatedVector,
  CellSemanticChaosSeedInput,
  CellChaosState,
  NonlinearDynamicsState
} from '../chaos';
import {
  CognitiveFeatureVector,
  LinearTransformation,
  CompositionWeight,
  CompositionTrace,
  CollectiveCognitiveState,
  NonlinearCompositionOptions,
  EpistemicFeatureRecord,
  EpistemicFeatureValue,
  FeatureStatus,
  applyLinearTransformation,
  generateDeterministicMatrixAndBias,
  getEpistemicVector,
  arrayToVector,
  clamp01,
  validateFeatureVector,
  FEATURE_VECTOR_KEYS
} from '../types';
import { calculateEmergenceMetrics, EmergenceMetrics } from './emergence';

export interface PeerSelectionCriteria {
  requiredCapabilities?: string[];
  targetCategory?: string;
  targetDomain?: string;
  minKnowledgeOverlap?: string[];
}

export interface CellContribution {
  cellId: string;
  contributionType?: 'CONCEPT' | 'RELATION' | 'EVIDENCE' | 'EXPERIENCE' | 'HYPOTHESIS';
  content?: any;
  confidence?: number;
  concepts?: string[];
  relations?: string[];
  evidences?: string[];
  abstractions?: string[];
  generalizations?: string[];
  analogies?: string[];
}

export interface CollectiveSynthesisOptions {
  criteria?: PeerSelectionCriteria;
  context?: Context;
  summary?: string;
  intent?: any;
}

export interface EmergentStructure {
  emergentId: string;
  sourceCells: string[];
  sourceStructures: any[];
  transformation: string;
  resultingStructure: any;
  confidence: number;
  provenance: string[];
  deterministicIdentity: string;
  verificationStatus: RepresentationVerificationStatus;
}

export interface BeliefState {
  conceptId: string;
  belief: number;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  status: RepresentationVerificationStatus;
}

export interface CollectiveRepresentation {
  emergentStructures: EmergentStructure[];
  emergenceMetrics?: EmergenceMetrics;
  hypotheses: any[];
  beliefs: BeliefState[];
  contradictions: any[];
  provenance: string[];
  collectiveState: CollectiveCognitiveState;
  sourceCellIds: string[];
  featureVectors: Record<string, CognitiveFeatureVector>;
  weights: Record<string, number>;
  transformations: Record<string, LinearTransformation>;
  resultVector: CognitiveFeatureVector;
  deterministicIdentity: string;
}

export interface CollectiveSynthesisResult {
  collectiveId: string;
  syncedConcepts: number;
  syncedRelations: number;
  syncedEvidences: number;
  syncedAbstractions: number;
  syncedGeneralizations: number;
  syncedAnalogies: number;
  conflictsDetected: number;
  conflictsResolved: number;
  provenanceCells: string[];
  contributions: Record<string, CellContribution>;
  collectiveUnderstanding?: CognitiveUnderstanding;
  failedPeers: string[];
  timestamp: string;
  collectiveState?: CollectiveCognitiveState;
  sourceCellIds?: string[];
  featureVectors?: Record<string, CognitiveFeatureVector>;
  weights?: Record<string, number>;
  transformations?: Record<string, LinearTransformation>;
  resultVector?: CognitiveFeatureVector;
  deterministicIdentity?: string;
}

/**
 * P9.5: Collective Cognition Engine
 * 
 * Orchestrates distributed linear mathematical cognitive composition across Cells:
 * Cell states -> Feature extraction (x_i) -> Linear transformation (z_i = W_i x_i + b_i)
 * -> Weighted composition (C = Σ α_i z_i) -> CollectiveCognitiveState -> New Cognitive Representation
 */
export class CollectiveCognitionEngine {
  private readonly component = 'collective_cognition';

  constructor(private localCell?: Cell) {}

  /**
   * Extracts a normalized CognitiveFeatureVector x_i ∈ [0, 1]^7 from a Cell,
   * tracking explicit knowledge/capability provenance without fabricating intelligence.
   * If a metric is unavailable, it is explicitly classified as UNKNOWN with an uninformative prior.
   */
  public extractFeatureVectorWithStatus(
    cell: Cell,
    targetDomain?: string
  ): {
    vector: CognitiveFeatureVector;
    statuses: Record<keyof CognitiveFeatureVector, FeatureStatus>;
    provenance: string[];
    details: EpistemicFeatureRecord;
  } {
    const statuses: Record<keyof CognitiveFeatureVector, FeatureStatus> = {
      computation: 'UNKNOWN',
      reliability: 'UNKNOWN',
      cognition: 'UNKNOWN',
      knowledge: 'UNKNOWN',
      specialization: 'UNKNOWN',
      experience: 'UNKNOWN',
      resourceEfficiency: 'UNKNOWN'
    };
    const provenance: string[] = [];

    // Access actual cell operational state and cognitive state if available
    const cellState = typeof (cell as any).getState === 'function' ? (cell as any).getState() : null;
    const cogState = (cell as any).cognitiveState && typeof (cell as any).cognitiveState.getState === 'function'
      ? (cell as any).cognitiveState.getState()
      : null;

    // 1. Computation
    // Derived strictly from actual recorded computational metrics or procedural execution
    let computation: number | undefined = undefined;
    if (cellState && typeof cellState.computation === 'number' && Number.isFinite(cellState.computation)) {
      const cVal = clamp01(cellState.computation);
      if (cVal === 0.0) {
        computation = 0.0;
        statuses.computation = 'KNOWN_ZERO';
        provenance.push(`computation:KNOWN_ZERO(cell_state:0)`);
      } else {
        computation = cVal;
        statuses.computation = 'KNOWN_VALUE';
        provenance.push(`computation:KNOWN_VALUE(cell_state:${computation})`);
      }
    } else if (cogState?.memoryStats && typeof cogState.memoryStats.procedural === 'number') {
      const procCount = cogState.memoryStats.procedural;
      if (procCount === 0) {
        computation = 0.0;
        statuses.computation = 'KNOWN_ZERO';
        provenance.push(`computation:KNOWN_ZERO(procedural_memories:0)`);
      } else {
        computation = clamp01(procCount / 10);
        statuses.computation = 'KNOWN_VALUE';
        provenance.push(`computation:KNOWN_VALUE(procedural_memories:${procCount})`);
      }
    } else {
      computation = undefined;
      statuses.computation = 'UNKNOWN';
      provenance.push('computation:UNKNOWN(no_actual_state)');
    }

    // 2. Reliability
    // Derived strictly from actual operational reliability or operational confidence
    let reliability: number | undefined = undefined;
    if (cellState && typeof cellState.reliability === 'number' && Number.isFinite(cellState.reliability)) {
      const rVal = clamp01(cellState.reliability);
      if (rVal === 0.0) {
        reliability = 0.0;
        statuses.reliability = 'KNOWN_ZERO';
        provenance.push(`reliability:KNOWN_ZERO(cell_state:0)`);
      } else {
        reliability = rVal;
        statuses.reliability = 'KNOWN_VALUE';
        provenance.push(`reliability:KNOWN_VALUE(cell_state:${reliability})`);
      }
    } else if (cogState && typeof cogState.operationalConfidence === 'number' && Number.isFinite(cogState.operationalConfidence)) {
      const confVal = clamp01(cogState.operationalConfidence);
      if (confVal === 0.0) {
        reliability = 0.0;
        statuses.reliability = 'KNOWN_ZERO';
        provenance.push(`reliability:KNOWN_ZERO(operational_confidence:0)`);
      } else {
        reliability = confVal;
        statuses.reliability = 'KNOWN_VALUE';
        provenance.push(`reliability:KNOWN_VALUE(operational_confidence:${reliability})`);
      }
    } else {
      reliability = undefined;
      statuses.reliability = 'UNKNOWN';
      provenance.push('reliability:UNKNOWN(no_actual_state)');
    }

    // 3. Cognition
    // Derived strictly from actual active cognitive state (operationalConfidence, active reasoning state)
    let cognition: number | undefined = undefined;
    if (cogState && typeof cogState.operationalConfidence === 'number' && Number.isFinite(cogState.operationalConfidence)) {
      const cogVal = clamp01(cogState.operationalConfidence);
      if (cogVal === 0.0) {
        cognition = 0.0;
        statuses.cognition = 'KNOWN_ZERO';
        provenance.push(`cognition:KNOWN_ZERO(operational_confidence:0)`);
      } else {
        cognition = cogVal;
        statuses.cognition = 'KNOWN_VALUE';
        provenance.push(`cognition:KNOWN_VALUE(operational_confidence:${cognition})`);
      }
    } else if (cellState && typeof cellState.cognition === 'number' && Number.isFinite(cellState.cognition)) {
      const cogVal = clamp01(cellState.cognition);
      if (cogVal === 0.0) {
        cognition = 0.0;
        statuses.cognition = 'KNOWN_ZERO';
        provenance.push(`cognition:KNOWN_ZERO(cell_state:0)`);
      } else {
        cognition = cogVal;
        statuses.cognition = 'KNOWN_VALUE';
        provenance.push(`cognition:KNOWN_VALUE(cell_state:${cognition})`);
      }
    } else {
      cognition = undefined;
      statuses.cognition = 'UNKNOWN';
      provenance.push('cognition:UNKNOWN(no_actual_state)');
    }

    // 4. Knowledge
    // Derived strictly from verified knowledge references, concepts, or semantic memory count
    const MAX_KNOWLEDGE_COUNT = 10;
    let knowledge: number | undefined = undefined;
    const hasKnowledgeData = cogState && (
      (cogState.knowledgeReferences && cogState.knowledgeReferences.length > 0) ||
      (cogState.conceptReferences && cogState.conceptReferences.length > 0) ||
      (cogState.memoryStats && typeof cogState.memoryStats.semantic === 'number')
    );

    if (hasKnowledgeData) {
      const kCount = (cogState?.knowledgeReferences?.length ?? 0) +
                     (cogState?.conceptReferences?.length ?? 0) +
                     (cogState?.memoryStats?.semantic ?? 0);
      if (kCount === 0) {
        knowledge = 0.0;
        statuses.knowledge = 'KNOWN_ZERO';
        provenance.push(`knowledge:KNOWN_ZERO(references_and_concepts:0)`);
      } else {
        knowledge = clamp01(kCount / MAX_KNOWLEDGE_COUNT);
        statuses.knowledge = 'KNOWN_VALUE';
        provenance.push(`knowledge:KNOWN_VALUE(references_and_concepts:${kCount})`);
      }
    } else if (cellState && typeof cellState.knowledge === 'number' && Number.isFinite(cellState.knowledge)) {
      const kVal = clamp01(cellState.knowledge);
      if (kVal === 0.0) {
        knowledge = 0.0;
        statuses.knowledge = 'KNOWN_ZERO';
        provenance.push(`knowledge:KNOWN_ZERO(cell_state:0)`);
      } else {
        knowledge = kVal;
        statuses.knowledge = 'KNOWN_VALUE';
        provenance.push(`knowledge:KNOWN_VALUE(cell_state:${knowledge})`);
      }
    } else {
      knowledge = undefined;
      statuses.knowledge = 'UNKNOWN';
      provenance.push('knowledge:UNKNOWN(no_actual_state)');
    }

    // 5. Specialization
    // Derived from declared domain specialization (domain alignment check, NOT intelligence)
    let specialization: number | undefined = undefined;
    const declaredSpec = ((cell as any).cognitiveState && typeof (cell as any).cognitiveState.getSpecialization === 'function'
      ? (cell as any).cognitiveState.getSpecialization()
      : null) ?? cell.genome?.specialization ?? null;

    if (declaredSpec && typeof declaredSpec === 'string' && declaredSpec.trim().length > 0) {
      const trimmedSpec = declaredSpec.trim();
      if (targetDomain && targetDomain.trim().length > 0) {
        if (trimmedSpec.toUpperCase().includes(targetDomain.trim().toUpperCase())) {
          specialization = 1.0;
          statuses.specialization = 'KNOWN_VALUE';
          provenance.push(`specialization:KNOWN_VALUE(domain_match:${trimmedSpec}_matches_${targetDomain})`);
        } else {
          specialization = 0.0;
          statuses.specialization = 'KNOWN_ZERO';
          provenance.push(`specialization:KNOWN_ZERO(domain_mismatch:${trimmedSpec})`);
        }
      } else {
        specialization = 1.0;
        statuses.specialization = 'KNOWN_VALUE';
        provenance.push(`specialization:KNOWN_VALUE(declared:${trimmedSpec})`);
      }
    } else {
      specialization = undefined;
      statuses.specialization = 'UNKNOWN';
      provenance.push('specialization:UNKNOWN(no_specialization_declared)');
    }

    // 6. Experience
    // Derived strictly from actual accumulated memories, completed goals, or task executions (NOT generation metadata)
    const MAX_EXPERIENCE_EVENTS = 50;
    let experience: number | undefined = undefined;
    const hasExpData = cogState && (
      (cogState.memoryStats && typeof cogState.memoryStats.total === 'number') ||
      ((cogState as any).completedGoals && Array.isArray((cogState as any).completedGoals))
    );

    if (hasExpData) {
      const totalMem = cogState?.memoryStats?.total ?? 0;
      const completedGoals = (cogState as any)?.completedGoals?.length ?? 0;
      const taskCount = typeof (cell as any).getCompletedTaskCount === 'function'
        ? (cell as any).getCompletedTaskCount()
        : 0;
      const totalExpEvents = totalMem + completedGoals + taskCount;
      if (totalExpEvents === 0) {
        experience = 0.0;
        statuses.experience = 'KNOWN_ZERO';
        provenance.push(`experience:KNOWN_ZERO(memory_and_goals:0)`);
      } else {
        experience = clamp01(totalExpEvents / MAX_EXPERIENCE_EVENTS);
        statuses.experience = 'KNOWN_VALUE';
        provenance.push(`experience:KNOWN_VALUE(memory_and_goals:${totalExpEvents})`);
      }
    } else if (cellState && typeof cellState.experience === 'number' && Number.isFinite(cellState.experience)) {
      const eVal = clamp01(cellState.experience);
      if (eVal === 0.0) {
        experience = 0.0;
        statuses.experience = 'KNOWN_ZERO';
        provenance.push(`experience:KNOWN_ZERO(cell_state:0)`);
      } else {
        experience = eVal;
        statuses.experience = 'KNOWN_VALUE';
        provenance.push(`experience:KNOWN_VALUE(cell_state:${experience})`);
      }
    } else {
      experience = undefined;
      statuses.experience = 'UNKNOWN';
      provenance.push('experience:UNKNOWN(no_actual_state)');
    }

    // 7. Resource Efficiency
    // Derived strictly from actual resource efficiency telemetry
    let resourceEfficiency: number | undefined = undefined;
    if (cellState && typeof cellState.resourceEfficiency === 'number' && Number.isFinite(cellState.resourceEfficiency)) {
      const effVal = clamp01(cellState.resourceEfficiency);
      if (effVal === 0.0) {
        resourceEfficiency = 0.0;
        statuses.resourceEfficiency = 'KNOWN_ZERO';
        provenance.push(`resourceEfficiency:KNOWN_ZERO(cell_state:0)`);
      } else {
        resourceEfficiency = effVal;
        statuses.resourceEfficiency = 'KNOWN_VALUE';
        provenance.push(`resourceEfficiency:KNOWN_VALUE(cell_state:${resourceEfficiency})`);
      }
    } else if (cogState?.metadata && typeof cogState.metadata['resourceEfficiency'] === 'string') {
      const parsed = parseFloat(cogState.metadata['resourceEfficiency']);
      if (Number.isFinite(parsed)) {
        const effVal = clamp01(parsed);
        if (effVal === 0.0) {
          resourceEfficiency = 0.0;
          statuses.resourceEfficiency = 'KNOWN_ZERO';
          provenance.push(`resourceEfficiency:KNOWN_ZERO(metadata:0)`);
        } else {
          resourceEfficiency = effVal;
          statuses.resourceEfficiency = 'KNOWN_VALUE';
          provenance.push(`resourceEfficiency:KNOWN_VALUE(metadata:${resourceEfficiency})`);
        }
      } else {
        resourceEfficiency = undefined;
        statuses.resourceEfficiency = 'UNKNOWN';
        provenance.push('resourceEfficiency:UNKNOWN(invalid_telemetry)');
      }
    } else {
      resourceEfficiency = undefined;
      statuses.resourceEfficiency = 'UNKNOWN';
      provenance.push('resourceEfficiency:UNKNOWN(no_actual_state)');
    }

    const vector: CognitiveFeatureVector = {
      computation,
      reliability,
      cognition,
      knowledge,
      specialization,
      experience,
      resourceEfficiency
    };

    validateFeatureVector(vector);

    const details: EpistemicFeatureRecord = {
      computation: {
        value: computation,
        status: statuses.computation,
        provenance: provenance.find(p => p.startsWith('computation:')) ?? 'computation:UNKNOWN'
      },
      reliability: {
        value: reliability,
        status: statuses.reliability,
        provenance: provenance.find(p => p.startsWith('reliability:')) ?? 'reliability:UNKNOWN'
      },
      cognition: {
        value: cognition,
        status: statuses.cognition,
        provenance: provenance.find(p => p.startsWith('cognition:')) ?? 'cognition:UNKNOWN'
      },
      knowledge: {
        value: knowledge,
        status: statuses.knowledge,
        provenance: provenance.find(p => p.startsWith('knowledge:')) ?? 'knowledge:UNKNOWN'
      },
      specialization: {
        value: specialization,
        status: statuses.specialization,
        provenance: provenance.find(p => p.startsWith('specialization:')) ?? 'specialization:UNKNOWN'
      },
      experience: {
        value: experience,
        status: statuses.experience,
        provenance: provenance.find(p => p.startsWith('experience:')) ?? 'experience:UNKNOWN'
      },
      resourceEfficiency: {
        value: resourceEfficiency,
        status: statuses.resourceEfficiency,
        provenance: provenance.find(p => p.startsWith('resourceEfficiency:')) ?? 'resourceEfficiency:UNKNOWN'
      }
    };

    return { vector, statuses, provenance, details };
  }

  /**
   * Extracts a normalized CognitiveFeatureVector x_i ∈ [0, 1]^7 from a Cell.
   * Minimal fields: [computation, reliability, cognition, knowledge, specialization, experience, resourceEfficiency].
   */
  public extractFeatureVector(cell: Cell, targetDomain?: string): CognitiveFeatureVector {
    return this.extractFeatureVectorWithStatus(cell, targetDomain).vector;
  }

  /**
   * Calculates normalized composition weights α_i >= 0, Σ α_i = 1 for a set of cells.
   * Based on cell state, fitness, reliability, and domain specialization.
   */
  public calculateCompositionWeights(
    cells: Cell[],
    targetDomain?: string
  ): Record<string, { weight: number; normalizedWeight: number }> {
    const rawScores: Record<string, number> = {};
    for (const cell of cells) {
      const extracted = this.extractFeatureVectorWithStatus(cell, targetDomain);
      const details = extracted.details;
      
      let rawScore = 0.0;
      let totalWeight = 0.0;

      // Reliability component
      if (details.reliability.status !== 'UNKNOWN' && details.reliability.value !== undefined) {
        rawScore += details.reliability.value * 0.4;
        totalWeight += 0.4;
      }

      // Cognition component
      if (details.cognition.status !== 'UNKNOWN' && details.cognition.value !== undefined) {
        rawScore += details.cognition.value * 0.4;
        totalWeight += 0.4;
      }

      // Specialization component
      if (details.specialization.status !== 'UNKNOWN' && details.specialization.value !== undefined) {
        rawScore += details.specialization.value * 0.2;
        totalWeight += 0.2;
      }

      // Normalize raw score
      if (totalWeight > 0) {
        rawScore = rawScore / totalWeight;
        rawScores[cell.nodeId] = Math.max(0.01, rawScore);
      } else {
        // Fallback for completely unknown cell (excluded)
        rawScores[cell.nodeId] = 0.0;
      }
    }

    const totalScore = Object.values(rawScores).reduce((sum, s) => sum + s, 0) || 1.0;
    const weights: Record<string, { weight: number; normalizedWeight: number }> = {};
    const cellIds = Object.keys(rawScores);

    for (const id of cellIds) {
      const normalized = Number((rawScores[id] / totalScore).toFixed(6));
      weights[id] = {
        weight: rawScores[id],
        normalizedWeight: normalized
      };
    }

    // Ensure sum equals 1.0 within numerical precision
    if (cellIds.length > 0) {
      const sumExceptLast = cellIds.slice(0, -1).reduce((s, id) => s + weights[id].normalizedWeight, 0);
      weights[cellIds[cellIds.length - 1]].normalizedWeight = Number((1.0 - sumExceptLast).toFixed(6));
    }

    return weights;
  }

  /**
   * P9.6 — Nonlinear Cognitive Dynamics Composition:
   * Cell Cognitive State
   *  ↓
   * Feature Vector x_i
   *  ↓
   * Affine Transformation: z_i = W_i x_i + b_i
   *  ↓
   * Tanh Activation: h_i = tanh(z_i)
   *  ↓
   * Deterministic Chaos: c_{t+1} = r c_t (1 - c_t)
   *  ↓
   * Bounded Modulation: m_t = 1 + lambda * (c_t - 0.5)  ->  h_tilde_i = h_i * m_t
   *  ↓
   * Normalized weights: alpha_i >= 0, sum alpha_i = 1
   *  ↓
   * Weighted Collective Composition: C_t = sum_i alpha_i [ h_i (1 + lambda(c_t - 0.5)) ]
   */
  public executeNonlinearComposition(
    cells: Cell[],
    context?: Context,
    targetDomain?: string,
    options?: NonlinearCompositionOptions
  ): CollectiveCognitiveState {
    if (!cells || cells.length === 0) {
      throw new Error('Collective nonlinear composition requires at least one cell.');
    }

    const sortedCells = [...cells].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
    const sourceCellIds = sortedCells.map(c => c.nodeId);

    const inputVectors: Record<string, CognitiveFeatureVector> = {};
    const transformations: Record<string, LinearTransformation> = {};
    const activatedVectors: Record<string, Record<string, number>> = {};
    const modulatedVectors: Record<string, Record<string, number>> = {};
    const steps: string[] = [];
    const featureProvenances: string[] = [];
    const featureStatuses: Record<string, any> = {};
    const featureDetails: Record<string, EpistemicFeatureRecord> = {};

    // Step 1: Feature Extraction, Affine Transformation, and Tanh Activation for each Cell
    for (const cell of sortedCells) {
      const { vector: x_i, statuses, provenance: featProv, details } = this.extractFeatureVectorWithStatus(cell, targetDomain);
      inputVectors[cell.nodeId] = x_i;
      featureStatuses[cell.nodeId] = statuses;
      featureDetails[cell.nodeId] = details;
      featureProvenances.push(`${cell.nodeId}:${featProv.join(';')}`);

      const { matrix, bias } = generateDeterministicMatrixAndBias(
        x_i,
        cell.genome?.capabilities ?? [],
        cell.genome?.specialization ?? null
      );

      const trans = applyLinearTransformation(
        x_i,
        matrix,
        bias,
        `Affine transformation for Cell ${cell.nodeId}`
      );
      transformations[cell.nodeId] = trans;

      // Tanh activation h_i = tanh(z_i)
      const h_i = applyTanhVector(trans.transformedVector);
      activatedVectors[cell.nodeId] = h_i;

      steps.push(`Cell ${cell.nodeId}: x_i -> affine z_i -> tanh h_i`);
    }

    // Step 2 & 3: Cell-Specific Deterministic Chaos Dynamics & Bounded Modulation
    // c_{i,t+1} = r c_{i,t} (1 - c_{i,t})
    // m_{i,t} = 1 + lambda * (c_{i,t} - 0.5)
    // h_tilde_i = h_i * m_{i,t}
    const r = options?.r ?? DEFAULT_CHAOS_R;
    const lambda = options?.lambda ?? DEFAULT_CHAOS_LAMBDA;
    const chaosSteps = options?.steps ?? 1;

    const cellChaosStates: Record<string, CellChaosState> = {};
    const chaosProvenances: string[] = [];

    for (const cell of sortedCells) {
      const x_i = inputVectors[cell.nodeId];
      const seedInput: CellSemanticChaosSeedInput = {
        featureVector: x_i,
        specialization: cell.genome?.specialization ?? null,
        traits: cell.genome?.traits ? { ...cell.genome.traits } : null,
        generation: (cell.genome as any)?.generation ?? 1,
        capabilities: cell.genome?.capabilities ? [...cell.genome.capabilities] : [],
        domain: targetDomain
      };

      let c0Override = options?.cellC0?.[cell.nodeId] ?? (sortedCells.length === 1 ? options?.c0 : undefined);
      if (c0Override === undefined && cell.cognitiveState && typeof cell.cognitiveState.getChaosState === 'function') {
        c0Override = cell.cognitiveState.getChaosState();
      }

      const cellChaos = computeCellChaosDynamics({
        seedInput,
        steps: chaosSteps,
        r,
        lambda,
        initialC0: c0Override
      });
      
      if (cell.cognitiveState && typeof cell.cognitiveState.updateChaosState === 'function') {
        cell.cognitiveState.updateChaosState(cellChaos.ct);
      }

      cellChaosStates[cell.nodeId] = cellChaos;

      // Modulate activated vector with cell-specific m_{i,t}: h_tilde_i = h_i * m_{i,t}
      modulatedVectors[cell.nodeId] = modulateActivatedVector(
        activatedVectors[cell.nodeId],
        cellChaos.modulationFactor
      );

      steps.push(
        `Cell ${cell.nodeId} chaos: c0=${cellChaos.c0.toFixed(6)}, ct=${cellChaos.ct.toFixed(6)}, mt=${cellChaos.mt.toFixed(6)}`
      );
      chaosProvenances.push(
        `cell_chaos:${cell.nodeId}:c0=${cellChaos.c0.toFixed(6)},ct=${cellChaos.ct.toFixed(6)},mt=${cellChaos.mt.toFixed(6)},steps=${chaosSteps}`
      );
    }

    // Step 4: Normalized Composition Weights (alpha_i >= 0, sum alpha_i = 1)
    const weightsRecord = this.calculateCompositionWeights(sortedCells, targetDomain);
    const weights: Record<string, number> = {};
    for (const id of sourceCellIds) {
      weights[id] = weightsRecord[id].normalizedWeight;
    }
    steps.push(`Normalized weights alpha_i assigned`);

    // Step 5: Weighted Collective Composition: C_t = sum_i alpha_i * h_tilde_i
    const cArr = new Array(7).fill(0);
    for (const id of sourceCellIds) {
      const alpha = weights[id];
      const hMod = modulatedVectors[id];
      for (let j = 0; j < 7; j++) {
        const key = FEATURE_VECTOR_KEYS[j];
        cArr[j] += alpha * (hMod[key] ?? 0);
      }
    }

    // Preservation of un-clamped non-linear spectrum [-1.2, 1.2]
    const nonlinearCollectiveVector: Record<string, number> = {};
    for (let j = 0; j < 7; j++) {
      const key = FEATURE_VECTOR_KEYS[j];
      nonlinearCollectiveVector[key] = Number(cArr[j].toFixed(6));
    }

    // Normalized projection bounded in [0, 1] for downstream compatibility
    const resultVector = arrayToVector(cArr);
    steps.push(`Collective state C_t = sum_i alpha_i [ h_i * m_{i,t} ] composed`);

    const cellStateList = Object.values(cellChaosStates);
    const avgC0 = cellStateList.reduce((s, c) => s + c.c0, 0) / cellStateList.length;
    const avgCt = cellStateList.reduce((s, c) => s + c.ct, 0) / cellStateList.length;
    const avgMt = cellStateList.reduce((s, c) => s + c.mt, 0) / cellStateList.length;

    const nonlinearDynamics: NonlinearDynamicsState = {
      r,
      lambda,
      steps: chaosSteps,
      cellStates: cellChaosStates,
      c0: avgC0,
      ct: avgCt,
      mt: avgMt
    };

    // Semantic payload for deterministic identity (timestamp isolated)
    const semanticPayload = {
      sourceCellIds,
      inputVectors,
      weights,
      transformedVectors: Object.fromEntries(
        Object.entries(transformations).map(([k, v]) => [k, v.transformedVector])
      ),
      activatedVectors,
      modulatedVectors,
      nonlinearDynamics: {
        r: nonlinearDynamics.r,
        lambda: nonlinearDynamics.lambda,
        steps: nonlinearDynamics.steps,
        cellDynamics: Object.fromEntries(
          Object.entries(cellChaosStates).map(([k, v]) => [
            k,
            { c0: v.c0, ct: v.ct, mt: v.mt, steps: v.steps, r: v.r, lambda: v.lambda }
          ])
        )
      },
      nonlinearCollectiveVector,
      resultVector
    };
    const deterministicIdentity = computeDeterministicHash(semanticPayload);
    const collectiveId = `coll_${deterministicIdentity.substring(0, 16)}`;

    const trace: CompositionTrace = {
      traceId: `trace_${deterministicIdentity.substring(0, 16)}`,
      steps,
      timestamp: new Date().toISOString(),
      inputVectors,
      transformedVectors: Object.fromEntries(
        Object.entries(transformations).map(([k, v]) => [k, v.transformedVector])
      ),
      weights,
      resultVector
    };

    const provenance = [
      `collective_composition_initiated:${sourceCellIds.join(',')}`,
      `feature_provenance:${featureProvenances.join('|')}`,
      `linear_composition_computed:weights=${Object.keys(weights).length}`,
      `nonlinear_activation:tanh`,
      `cell_specific_chaos:${chaosProvenances.join(';')}`,
      `deterministic_chaos_collective:cells=${sourceCellIds.length},r=${r},lambda=${lambda},steps=${chaosSteps}`,
      `weights_assigned:${Object.entries(weights).map(([k, v]) => `${k}=${v}`).join(';')}`,
      `nonlinear_spectrum_preserved:full_range`,
      `collective_state_formed:${collectiveId}`
    ];

    return {
      collectiveId,
      sourceCellIds,
      inputVectors,
      weights,
      transformations,
      activatedVectors,
      modulatedVectors,
      nonlinearDynamics,
      compositionType: 'nonlinear_tanh_chaos',
      nonlinearCollectiveVector,
      featureStatuses,
      featureDetails,
      resultVector,
      provenance,
      deterministicIdentity,
      trace
    };
  }

  /**
   * Computes the linear mathematical composition over a set of relevant cells:
   * 1. x_i = extractFeatureVector(cell_i)
   * 2. z_i = W_i x_i + b_i
   * 3. α_i >= 0, Σ α_i = 1 derived from cell state/fitness/relevance
   * 4. C = Σ α_i z_i
   * 
   * If options.enableNonlinear === true, delegates to executeNonlinearComposition.
   */
  public executeLinearComposition(
    cells: Cell[],
    context?: Context,
    targetDomain?: string,
    options?: NonlinearCompositionOptions
  ): CollectiveCognitiveState {
    if (options?.enableNonlinear === true) {
      return this.executeNonlinearComposition(cells, context, targetDomain, options);
    }

    if (!cells || cells.length === 0) {
      throw new Error('Collective linear composition requires at least one cell.');
    }

    // Sort cells deterministically by nodeId
    const sortedCells = [...cells].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
    const sourceCellIds = sortedCells.map(c => c.nodeId);

    const inputVectors: Record<string, CognitiveFeatureVector> = {};
    const transformations: Record<string, LinearTransformation> = {};
    const steps: string[] = [];
    const featureProvenances: string[] = [];
    const featureStatuses: Record<string, any> = {};
    const featureDetails: Record<string, EpistemicFeatureRecord> = {};

    // Step 1: Feature extraction with epistemic status and linear transformation for each Cell
    for (const cell of sortedCells) {
      const { vector: x_i, statuses, provenance: featProv, details } = this.extractFeatureVectorWithStatus(cell, targetDomain);
      inputVectors[cell.nodeId] = x_i;
      featureStatuses[cell.nodeId] = statuses;
      featureDetails[cell.nodeId] = details;
      featureProvenances.push(`${cell.nodeId}:${featProv.join(';')}`);

      const { matrix, bias } = generateDeterministicMatrixAndBias(
        x_i,
        cell.genome?.capabilities ?? [],
        cell.genome?.specialization ?? null
      );

      const trans = applyLinearTransformation(
        x_i,
        matrix,
        bias,
        `Linear transformation for Cell ${cell.nodeId}`
      );
      transformations[cell.nodeId] = trans;

      steps.push(`Cell ${cell.nodeId} transformed: x_i -> z_i`);
    }

    // Step 2: Unified authoritative weight calculation across all cells (no fake fitness priors)
    const calculatedWeights = this.calculateCompositionWeights(sortedCells, targetDomain);
    const weights: Record<string, number> = {};
    for (const cell of sortedCells) {
      weights[cell.nodeId] = calculatedWeights[cell.nodeId].normalizedWeight;
    }
    steps.push(`Normalized composition weights calculated across ${sortedCells.length} cells`);

    // Step 3: Weighted composition C = Σ α_i z_i
    const cArr = new Array(7).fill(0);
    const cellIds = Object.keys(weights);
    for (const id of cellIds) {
      const alpha = weights[id];
      const zRecord = transformations[id].transformedVector;
      for (let j = 0; j < 7; j++) {
        const key = FEATURE_VECTOR_KEYS[j];
        cArr[j] += alpha * (zRecord[key] ?? 0);
      }
    }
    const resultVector = arrayToVector(cArr);
    steps.push(`Collective vector C = Σ α_i z_i composed`);

    // Deterministic identity isolated from timestamps (semantic equivalence)
    const semanticPayload = {
      sourceCellIds,
      inputVectors,
      weights,
      transformedVectors: Object.fromEntries(
        Object.entries(transformations).map(([k, v]) => [k, v.transformedVector])
      ),
      resultVector
    };
    const deterministicIdentity = computeDeterministicHash(semanticPayload);
    const collectiveId = `coll_${deterministicIdentity.substring(0, 16)}`;

    const trace: CompositionTrace = {
      traceId: `trace_${deterministicIdentity.substring(0, 16)}`,
      steps,
      timestamp: new Date().toISOString(),
      inputVectors,
      transformedVectors: Object.fromEntries(
        Object.entries(transformations).map(([k, v]) => [k, v.transformedVector])
      ),
      weights,
      resultVector
    };

    const provenance = [
      `collective_linear_composition_initiated:${sourceCellIds.join(',')}`,
      `feature_provenance:${featureProvenances.join('|')}`,
      `weights_assigned:${Object.entries(weights).map(([k, v]) => `${k}=${v}`).join(';')}`,
      `collective_state_formed:${collectiveId}`
    ];

    return {
      collectiveId,
      sourceCellIds,
      inputVectors,
      weights,
      transformations,
      featureStatuses,
      featureDetails,
      resultVector,
      provenance,
      deterministicIdentity,
      trace
    };
  }

  /**
   * Relevance-based peer selection to avoid unneeded broadcasting.
   */
  public selectRelevantPeers(peers: Cell[], criteria?: PeerSelectionCriteria): Cell[] {
    if (!peers || peers.length === 0) return [];

    return peers.filter(peer => {
      // Must not be self if localCell is defined
      if (this.localCell && peer.nodeId === this.localCell.nodeId) return false;

      if (!criteria) return true;

      // Capability check
      if (criteria.requiredCapabilities && criteria.requiredCapabilities.length > 0) {
        const peerCaps = peer.genome?.capabilities || [];
        const hasCaps = criteria.requiredCapabilities.every(cap => peerCaps.includes(cap as any));
        if (!hasCaps) return false;
      }

      // Category check
      if (criteria.targetCategory) {
        try {
          const peerConcepts = peer.cognitiveGraph.getAllConcepts();
          const hasCategory = peerConcepts.some(c => c.category === criteria.targetCategory);
          if (!hasCategory) return false;
        } catch {
          return false;
        }
      }

      // Domain check
      if (criteria.targetDomain) {
        const spec = peer.genome?.specialization?.toUpperCase() ?? '';
        if (!spec.includes(criteria.targetDomain.toUpperCase())) {
          return false;
        }
      }

      // Knowledge overlap check
      if (criteria.minKnowledgeOverlap && criteria.minKnowledgeOverlap.length > 0) {
        try {
          const peerConcepts = peer.cognitiveGraph.getAllConcepts();
          const peerConceptIds = new Set(peerConcepts.map(c => c.conceptId));
          const hasOverlap = criteria.minKnowledgeOverlap.some(id => peerConceptIds.has(id));
          if (!hasOverlap) return false;
        } catch {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * High-level composition method called by CognitiveRuntime or directly.
   * Transforms Cell contributions and states through the linear mathematical model.
   */
  public compose(
    understanding: CognitiveUnderstanding,
    contributions: CellContribution[],
    context: Context,
    cells?: Cell[]
  ): CollectiveRepresentation {
    const activeCells = cells ?? (this.localCell ? [this.localCell] : []);
    
    if (activeCells.length === 0) {
      throw new Error('Collective composition requires at least one active real Cell. Cannot compose from empty population.');
    }

    // Perform linear mathematical composition
    let collectiveState: CollectiveCognitiveState = this.executeLinearComposition(activeCells, context, context?.domain);

    const emergentStructures: EmergentStructure[] = [];
    const hypotheses: any[] = [];
    const beliefs: BeliefState[] = [];
    const contradictions: any[] = [];
    const provenance: string[] = [
      'collective_composition_started',
      ...collectiveState.provenance
    ];

    // Group contributions by type
    const concepts = contributions.filter(c => c.contributionType === 'CONCEPT');
    const relations = contributions.filter(c => c.contributionType === 'RELATION');
    const evidences = contributions.filter(c => c.contributionType === 'EVIDENCE');

    // Helper to strip non-semantic timestamps from hash payloads ensuring time-isolated determinism
    const sanitizeForSemanticHash = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(sanitizeForSemanticHash);
      const { createdAt, updatedAt, timestamp, ...rest } = obj;
      const cleaned: any = {};
      for (const [k, v] of Object.entries(rest)) {
        cleaned[k] = sanitizeForSemanticHash(v);
      }
      return cleaned;
    };

    // Cross-Cell Interaction: Match concepts and relations
    for (const rel of relations) {
      const relContent = rel.content ?? {};
      const relatedConcepts = concepts.filter(c => 
        (c.content?.conceptId && (c.content.conceptId === relContent.subjectConceptId || c.content.conceptId === relContent.objectConceptId))
      );

      if (relatedConcepts.length > 0) {
        const supportingEvs = evidences.filter(e => e.content?.supports === relContent.relationId);
        const contradictingEvs = evidences.filter(e => e.content?.contradicts === relContent.relationId);

        let status = RepresentationVerificationStatus.PENDING;
        if (contradictingEvs.length > 0 && supportingEvs.length > 0) {
          status = RepresentationVerificationStatus.CONTRADICTED;
          contradictions.push({
            target: relContent,
            supporters: supportingEvs.map(e => e.cellId),
            contradictors: contradictingEvs.map(e => e.cellId)
          });
        } else if (supportingEvs.length > 0) {
          status = RepresentationVerificationStatus.SUPPORTED;
        } else if (contradictingEvs.length > 0) {
          status = RepresentationVerificationStatus.REJECTED;
        }

        const sourceCells = Array.from(new Set([
          rel.cellId,
          ...relatedConcepts.map(c => c.cellId),
          ...supportingEvs.map(e => e.cellId),
          ...contradictingEvs.map(e => e.cellId)
        ])).sort();

        const resultingStructure = {
          type: status === RepresentationVerificationStatus.SUPPORTED ? 'EMERGENT_STRUCTURE' : 'HYPOTHESIS',
          statement: `${relContent.subjectConceptId} ${relContent.predicate} ${relContent.objectConceptId}`,
          context: {
            contextId: context.contextId,
            domain: context.domain
          },
          status: status === RepresentationVerificationStatus.SUPPORTED ? EpistemicStatus.BELIEVED : EpistemicStatus.HYPOTHESIS,
          linearConfidence: collectiveState.resultVector.cognition
        };

        const hashPayload = sanitizeForSemanticHash({
          sources: sourceCells,
          relation: relContent,
          concepts: relatedConcepts.map(c => c.content),
          resultingStructure
        });

        const deterministicIdentity = computeDeterministicHash(hashPayload);
        const emergentId = `emg_${deterministicIdentity.substring(0, 16)}`;

        const emergent: EmergentStructure = {
          emergentId,
          sourceCells,
          sourceStructures: [relContent, ...relatedConcepts.map(c => c.content)],
          transformation: 'CROSS_CELL_RELATION_MATCH',
          resultingStructure,
          confidence: Math.max(typeof rel.confidence === 'number' && Number.isFinite(rel.confidence) ? rel.confidence : 0.6, 0.1),
          provenance: [`interaction:${rel.cellId}_with_multiple_cells`, `collective_state:${collectiveState.collectiveId}`],
          deterministicIdentity,
          verificationStatus: status
        };

        emergentStructures.push(emergent);
        hypotheses.push(resultingStructure);

        beliefs.push({
          conceptId: relContent.relationId ?? 'rel_unknown',
          belief: status === RepresentationVerificationStatus.SUPPORTED ? 0.9 : (status === RepresentationVerificationStatus.CONTRADICTED ? 0.1 : 0.5),
          supportingEvidence: supportingEvs.map(e => e.content?.evidenceId ?? 'ev_unknown'),
          contradictingEvidence: contradictingEvs.map(e => e.content?.evidenceId ?? 'ev_unknown'),
          status
        });
      }
    }

    // Emergence logic: Combine concepts that have no explicit relations to form an emergent hypothesis
    if (concepts.length > 1 && relations.length === 0) {
      const sourceCells = Array.from(new Set(concepts.map(c => c.cellId))).sort();
      const resultingStructure = {
        type: 'HYPOTHESIS',
        statement: `Possible emergent link between ${concepts.map(c => c.content?.canonicalName || c.content?.conceptId).join(' and ')}`,
        context: {
          contextId: context.contextId,
          domain: context.domain
        },
        status: 'HYPOTHESIS',
        linearConfidence: collectiveState.resultVector.cognition
      };

      const deterministicIdentity = computeDeterministicHash(sanitizeForSemanticHash({
        concepts: concepts.map(c => c.content),
        resultingStructure
      }));

      emergentStructures.push({
        emergentId: `emg_${deterministicIdentity.substring(0, 16)}`,
        sourceCells,
        sourceStructures: concepts.map(c => c.content),
        transformation: 'CONCEPTUAL_SYNTHESIS',
        resultingStructure,
        confidence: collectiveState.resultVector.cognition,
        provenance: ['conceptual_synthesis_without_relations', `collective_state:${collectiveState.collectiveId}`],
        deterministicIdentity,
        verificationStatus: RepresentationVerificationStatus.PENDING
      });
      hypotheses.push(resultingStructure);
    }

    // Calculate genuine mathematical emergence metrics across constituent cells
    const cellStates = collectiveState.nonlinearDynamics?.cellStates;
    const modulationFactors = cellStates
      ? Object.fromEntries(Object.entries(cellStates).map(([k, v]) => [k, v.modulationFactor]))
      : undefined;

    const emergenceMetrics = calculateEmergenceMetrics({
      resultVector: collectiveState.resultVector,
      inputVectors: collectiveState.inputVectors,
      weights: collectiveState.weights,
      transformations: collectiveState.transformations,
      modulatedVectors: collectiveState.modulatedVectors,
      modulationFactors,
      emergentStructuresCount: emergentStructures.length,
      evidenceCount: evidences.length,
      hasEvidence: evidences.length > 0
    });

    provenance.push(`emergent_structures_generated:${emergentStructures.length}`);
    provenance.push(`emergence_metrics_computed:${emergenceMetrics.metricSummary}`);

    const representation: CollectiveRepresentation = {
      emergentStructures,
      emergenceMetrics,
      hypotheses,
      beliefs,
      contradictions,
      provenance,
      collectiveState,
      sourceCellIds: collectiveState.sourceCellIds,
      featureVectors: collectiveState.inputVectors,
      weights: collectiveState.weights,
      transformations: collectiveState.transformations,
      resultVector: collectiveState.resultVector,
      deterministicIdentity: collectiveState.deterministicIdentity
    };

    return representation;
  }

  /**
   * Synthesizes collective cognition across selected peers via semantic composition and linear mathematical model.
   * Full backward compatibility with P7.5 and Cell.
   */
  public async synthesizeWithPeers(
    peers: Cell[],
    options?: CollectiveSynthesisOptions
  ): Promise<CollectiveSynthesisResult> {
    if (!this.localCell) {
      throw new Error('synthesizeWithPeers requires localCell in constructor.');
    }

    const selectedPeers = this.selectRelevantPeers(peers, options?.criteria);
    const contributions: Record<string, CellContribution> = {};
    const failedPeers: string[] = [];

    let syncedConcepts = 0;
    let syncedRelations = 0;
    let syncedEvidences = 0;
    let syncedAbstractions = 0;
    let syncedGeneralizations = 0;
    let syncedAnalogies = 0;
    let conflictsDetected = 0;
    let conflictsResolved = 0;

    const allInvolvedConceptIds = new Set<string>();
    const allInvolvedRelationIds = new Set<string>();
    const allInvolvedEvidenceIds = new Set<string>();

    const synthesisContext: Context = options?.context || {
      contextId: `ctx_collective_${Date.now()}`,
      domain: 'COLLECTIVE_SYNTHESIS'
    };

    for (const peer of selectedPeers) {
      const contribution: CellContribution = {
        cellId: peer.nodeId,
        concepts: [],
        relations: [],
        evidences: [],
        abstractions: [],
        generalizations: [],
        analogies: []
      };

      try {
        const peerGraph = peer.cognitiveGraph;
        if (!peerGraph) {
          throw new Error(`Peer ${peer.nodeId} cognitiveGraph unavailable`);
        }

        // 1. Evidence Synthesis
        for (const ev of peerGraph.getAllEvidences()) {
          const localEv = this.localCell.cognitiveGraph.getEvidence(ev.evidenceId);
          if (!localEv) {
            const clone = { ...ev };
            if (!clone.provenance) {
              clone.provenance = {
                sourceId: peer.nodeId,
                timestamp: new Date().toISOString()
              };
            }
            await this.localCell.cognitiveGraph.insertEvidence(clone);
            syncedEvidences++;
            contribution.evidences!.push(ev.evidenceId);
            allInvolvedEvidenceIds.add(ev.evidenceId);
          } else {
            allInvolvedEvidenceIds.add(ev.evidenceId);
          }
        }

        // 2. Concept Composition
        for (const concept of peerGraph.getAllConcepts()) {
          const localConcept = this.localCell.cognitiveGraph.getConcept(concept.conceptId);
          if (!localConcept) {
            const inserted = await this.localCell.cognitiveGraph.insertConcept({
              ...concept,
              provenance: Array.from(new Set([...concept.provenance, peer.nodeId]))
            });
            syncedConcepts++;
            contribution.concepts!.push(inserted.conceptId);
            allInvolvedConceptIds.add(inserted.conceptId);
          } else {
            const mergedProvenance = Array.from(new Set([...localConcept.provenance, peer.nodeId]));
            if (mergedProvenance.length > localConcept.provenance.length) {
              await this.localCell.cognitiveGraph.updateConcept({
                ...localConcept,
                provenance: mergedProvenance,
                version: localConcept.version + 1,
                updatedAt: new Date().toISOString()
              });
            }
            contribution.concepts!.push(localConcept.conceptId);
            allInvolvedConceptIds.add(localConcept.conceptId);
          }
        }

        // 3. Relations & Verification/Conflict Resolution
        for (const rel of peerGraph.getAllRelations()) {
          const localRel = this.localCell.cognitiveGraph.getRelation(rel.relationId);
          if (!localRel) {
            const conflictingLocal = this.localCell.cognitiveGraph.getAllRelations().find(
              lr =>
                lr.subjectConceptId === rel.subjectConceptId &&
                lr.objectConceptId === rel.objectConceptId &&
                lr.predicate !== rel.predicate &&
                lr.predicate !== CognitiveRelationPredicate.RELATED_TO &&
                rel.predicate !== CognitiveRelationPredicate.RELATED_TO
            );

            const clonedRel = {
              ...rel,
              provenance: Array.from(new Set([...rel.provenance, peer.nodeId]))
            };
            const insertedRel = await this.localCell.cognitiveGraph.insertRelation(clonedRel);
            syncedRelations++;
            contribution.relations!.push(insertedRel.relationId);
            allInvolvedRelationIds.add(insertedRel.relationId);
            allInvolvedConceptIds.add(rel.subjectConceptId);
            allInvolvedConceptIds.add(rel.objectConceptId);

            if (conflictingLocal) {
              conflictsDetected++;
              allInvolvedRelationIds.add(conflictingLocal.relationId);

              const conflict = this.localCell.verification.detectAndResolveConflict({
                type: ConflictType.DIRECT_CONTRADICTION,
                claimAId: conflictingLocal.relationId,
                claimBId: clonedRel.relationId,
                description: `Collective peer divergence between local ${conflictingLocal.predicate} and peer ${clonedRel.predicate}`
              });

              if (conflict.resolutionDecision === ConflictResolutionDecision.REJECT_CLAIM_B) {
                conflictsResolved++;
                await this.localCell.cognitiveGraph.transitionRepresentationState(
                  clonedRel.relationId,
                  [],
                  synthesisContext,
                  {
                    trigger: EpistemicTransitionTrigger.CONTRADICTION_DETECTED,
                    explicitVerification: {
                      status: RepresentationVerificationStatus.CONTRADICTED,
                      verifiedBy: this.localCell.nodeId,
                      proof: conflict.resolutionReason
                    },
                    reason: `Demoted peer relation by verification: ${conflict.resolutionReason}`
                  }
                );
              } else if (conflict.resolutionDecision === ConflictResolutionDecision.REJECT_CLAIM_A) {
                conflictsResolved++;
                await this.localCell.cognitiveGraph.transitionRepresentationState(
                  conflictingLocal.relationId,
                  [],
                  synthesisContext,
                  {
                    trigger: EpistemicTransitionTrigger.CONTRADICTION_DETECTED,
                    explicitVerification: {
                      status: RepresentationVerificationStatus.CONTRADICTED,
                      verifiedBy: this.localCell.nodeId,
                      proof: conflict.resolutionReason
                    },
                    reason: `Demoted local relation by verification: ${conflict.resolutionReason}`
                  }
                );
              } else {
                await this.localCell.cognitiveGraph.preserveConflict(
                  conflictingLocal.subjectConceptId,
                  conflictingLocal.objectConceptId,
                  `Preserved peer divergence via verification: ${conflict.resolutionDecision}`
                );
              }
            }
          } else {
            contribution.relations!.push(localRel.relationId);
            allInvolvedRelationIds.add(localRel.relationId);
          }
        }

        // 4. Abstractions
        for (const abs of peerGraph.getAllAbstractions()) {
          if (!this.localCell.cognitiveGraph.getAllAbstractions().find(a => a.abstractionId === abs.abstractionId)) {
            await this.localCell.cognitiveGraph.insertAbstraction({
              ...abs,
              provenance: Array.from(new Set([...abs.provenance, peer.nodeId]))
            });
            syncedAbstractions++;
            contribution.abstractions!.push(abs.abstractionId);
          }
        }

        // 5. Generalizations
        for (const gen of peerGraph.getAllGeneralizations()) {
          if (!this.localCell.cognitiveGraph.getAllGeneralizations().find(a => a.generalizationId === gen.generalizationId)) {
            await this.localCell.cognitiveGraph.insertGeneralization({
              ...gen,
              provenance: Array.from(new Set([...gen.provenance, peer.nodeId]))
            });
            syncedGeneralizations++;
            contribution.generalizations!.push(gen.generalizationId);
          }
        }

        // 6. Analogies
        for (const ana of peerGraph.getAllAnalogies()) {
          if (!this.localCell.cognitiveGraph.getAllAnalogies().find(a => a.analogyId === ana.analogyId)) {
            await this.localCell.cognitiveGraph.insertAnalogy({
              ...ana,
              provenance: Array.from(new Set([...ana.provenance, peer.nodeId]))
            });
            syncedAnalogies++;
            contribution.analogies!.push(ana.analogyId);
          }
        }

        contributions[peer.nodeId] = contribution;
      } catch (peerErr) {
        logger.warn(this.component, 'peer_synthesis_failed_safely_ignored', {
          peerId: peer.nodeId,
          error: peerErr
        });
        failedPeers.push(peer.nodeId);
      }
    }

    // Execute linear mathematical composition across local cell + responding peers
    const participatingCells = [this.localCell, ...selectedPeers.filter(p => !failedPeers.includes(p.nodeId))];
    const collectiveState = this.executeLinearComposition(
      participatingCells,
      synthesisContext,
      synthesisContext.domain
    );

    // Semantic Composition into a unified CognitiveUnderstanding
    const contributingConcepts = this.localCell.cognitiveGraph
      .getAllConcepts()
      .filter(c => allInvolvedConceptIds.has(c.conceptId));
    const contributingRelations = this.localCell.cognitiveGraph
      .getAllRelations()
      .filter(r => allInvolvedRelationIds.has(r.relationId));
    const contributingEvidences = this.localCell.cognitiveGraph
      .getAllEvidences()
      .filter(e => allInvolvedEvidenceIds.has(e.evidenceId));

    let collectiveUnderstanding: CognitiveUnderstanding | undefined;
    if (contributingConcepts.length > 0 || contributingRelations.length > 0) {
      collectiveUnderstanding = this.localCell.understanding.compose({
        summary: options?.summary || `Collective synthesis with peers: ${Object.keys(contributions).join(', ')}`,
        concepts: contributingConcepts,
        relations: contributingRelations,
        evidences: contributingEvidences,
        context: synthesisContext,
        originatingCellId: this.localCell.nodeId
      });
      await this.localCell.cognitiveGraph.insertUnderstanding(collectiveUnderstanding);
    }

    const collectiveId = collectiveState.collectiveId;

    const result: CollectiveSynthesisResult = {
      collectiveId,
      syncedConcepts,
      syncedRelations,
      syncedEvidences,
      syncedAbstractions,
      syncedGeneralizations,
      syncedAnalogies,
      conflictsDetected,
      conflictsResolved,
      provenanceCells: Array.from(new Set(selectedPeers.map(p => p.nodeId))),
      contributions,
      collectiveUnderstanding,
      failedPeers,
      timestamp: new Date().toISOString(),
      collectiveState,
      sourceCellIds: collectiveState.sourceCellIds,
      featureVectors: collectiveState.inputVectors,
      weights: collectiveState.weights,
      transformations: collectiveState.transformations,
      resultVector: collectiveState.resultVector,
      deterministicIdentity: collectiveState.deterministicIdentity
    };

    return deepFreeze(result);
  }
}
