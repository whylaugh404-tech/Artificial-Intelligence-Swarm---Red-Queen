import { Cell } from '../../core/cell';
import { CognitiveRelationPredicate, RepresentationVerificationStatus } from '../representation/types';
import { ConflictType, ConflictResolutionDecision } from '../verification/types';
import { Context, EpistemicTransitionTrigger } from '../epistemic/types';
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
  applyLinearTransformation,
  generateDeterministicMatrixAndBias,
  vectorToArray,
  arrayToVector,
  clamp01,
  validateFeatureVector,
  FEATURE_VECTOR_KEYS
} from '../types';

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
    statuses: Record<keyof CognitiveFeatureVector, 'KNOWN' | 'UNKNOWN'>;
    provenance: string[];
  } {
    const statuses: Record<keyof CognitiveFeatureVector, 'KNOWN' | 'UNKNOWN'> = {
      computation: 'UNKNOWN',
      reliability: 'UNKNOWN',
      cognition: 'UNKNOWN',
      knowledge: 'UNKNOWN',
      specialization: 'UNKNOWN',
      experience: 'UNKNOWN',
      resourceEfficiency: 'UNKNOWN'
    };
    const provenance: string[] = [];

    // 1. Computation
    let computation = 0.5;
    const caps = cell.genome?.capabilities ?? [];
    if (caps.includes('INFO_PROCESSING') || caps.includes('CODE_ANALYSIS')) {
      computation = 0.8;
      statuses.computation = 'KNOWN';
      provenance.push(`computation:KNOWN(capabilities:${caps.filter(c => c === 'INFO_PROCESSING' || c === 'CODE_ANALYSIS').join(',')})`);
    } else if (caps.includes('COGNITIVE_REASONING')) {
      computation = 0.6;
      statuses.computation = 'KNOWN';
      provenance.push('computation:KNOWN(cognitive_reasoning_baseline)');
    } else if (caps.length > 0) {
      computation = 0.4;
      statuses.computation = 'KNOWN';
      provenance.push('computation:KNOWN(generic_capabilities)');
    } else {
      computation = 0.5;
      statuses.computation = 'UNKNOWN';
      provenance.push('computation:UNKNOWN(uninformative_prior)');
    }

    // 2. Reliability
    let reliability = 0.5;
    const stateObj = (cell as any).getState ? (cell as any).getState() : null;
    if (stateObj && typeof stateObj.reliability === 'number') {
      reliability = clamp01(stateObj.reliability);
      statuses.reliability = 'KNOWN';
      provenance.push(`reliability:KNOWN(cell_state:${reliability})`);
    } else if (cell.genome?.traits?.riskTolerance !== undefined) {
      reliability = clamp01(1.0 - cell.genome.traits.riskTolerance);
      statuses.reliability = 'KNOWN';
      provenance.push(`reliability:KNOWN(derived_from_risk_tolerance:${cell.genome.traits.riskTolerance})`);
    } else {
      reliability = 0.5;
      statuses.reliability = 'UNKNOWN';
      provenance.push('reliability:UNKNOWN(uninformative_prior)');
    }

    // 3. Cognition
    let cognition = 0.5;
    if (caps.includes('COGNITIVE_REASONING')) {
      cognition = 1.0;
      statuses.cognition = 'KNOWN';
      provenance.push('cognition:KNOWN(COGNITIVE_REASONING_capability)');
    } else if (caps.length > 0) {
      cognition = 0.3;
      statuses.cognition = 'KNOWN';
      provenance.push('cognition:KNOWN(non_reasoning_capability)');
    } else {
      cognition = 0.5;
      statuses.cognition = 'UNKNOWN';
      provenance.push('cognition:UNKNOWN(uninformative_prior)');
    }

    // 4. Knowledge
    let knowledge = 0.5;
    if (caps.includes('KNOWLEDGE_QUERY')) {
      knowledge = 1.0;
      statuses.knowledge = 'KNOWN';
      provenance.push('knowledge:KNOWN(KNOWLEDGE_QUERY_capability)');
    } else if (caps.includes('INFO_PROCESSING')) {
      knowledge = 0.7;
      statuses.knowledge = 'KNOWN';
      provenance.push('knowledge:KNOWN(INFO_PROCESSING_capability)');
    } else if (caps.length > 0) {
      knowledge = 0.4;
      statuses.knowledge = 'KNOWN';
      provenance.push('knowledge:KNOWN(general_capabilities)');
    } else {
      knowledge = 0.5;
      statuses.knowledge = 'UNKNOWN';
      provenance.push('knowledge:UNKNOWN(uninformative_prior)');
    }

    // 5. Specialization
    let specialization = 0.5;
    if (cell.genome?.specialization) {
      if (targetDomain && cell.genome.specialization.toUpperCase().includes(targetDomain.toUpperCase())) {
        specialization = 1.0;
        statuses.specialization = 'KNOWN';
        provenance.push(`specialization:KNOWN(domain_match:${cell.genome.specialization}_matches_${targetDomain})`);
      } else {
        specialization = 0.3;
        statuses.specialization = 'KNOWN';
        provenance.push(`specialization:KNOWN(non_matching:${cell.genome.specialization})`);
      }
    } else {
      specialization = 0.0;
      statuses.specialization = 'UNKNOWN';
      provenance.push('specialization:UNKNOWN(none_declared)');
    }

    // 6. Experience
    let experience = 0.5;
    if (typeof (cell.genome as any)?.generation === 'number') {
      const gen = (cell.genome as any).generation;
      experience = clamp01(gen * 0.1);
      statuses.experience = 'KNOWN';
      provenance.push(`experience:KNOWN(generation:${gen})`);
    } else {
      experience = 0.5;
      statuses.experience = 'UNKNOWN';
      provenance.push('experience:UNKNOWN(uninformative_prior)');
    }

    // 7. Resource Efficiency
    let resourceEfficiency = 0.5;
    if (cell.genome?.traits?.explorationVsExploitation !== undefined) {
      resourceEfficiency = clamp01(cell.genome.traits.explorationVsExploitation);
      statuses.resourceEfficiency = 'KNOWN';
      provenance.push(`resourceEfficiency:KNOWN(traits:${resourceEfficiency})`);
    } else {
      resourceEfficiency = 0.5;
      statuses.resourceEfficiency = 'UNKNOWN';
      provenance.push('resourceEfficiency:UNKNOWN(uninformative_prior)');
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
    return { vector, statuses, provenance };
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
      const x_i = this.extractFeatureVector(cell, targetDomain);
      const fitness = (cell.genome as any)?.fitness ?? 0.8;
      const specBonus = (cell.genome?.specialization && targetDomain && cell.genome.specialization.toUpperCase().includes(targetDomain.toUpperCase())) ? 0.35 : (cell.genome?.specialization ? 0.15 : 0.0);
      const rawScore = Math.max(0.01, (fitness * 0.4) + (x_i.reliability * 0.3) + specBonus + (x_i.cognition * 0.2));
      rawScores[cell.nodeId] = rawScore;
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

    // Step 1: Feature Extraction, Affine Transformation, and Tanh Activation for each Cell
    for (const cell of sortedCells) {
      const { vector: x_i, statuses, provenance: featProv } = this.extractFeatureVectorWithStatus(cell, targetDomain);
      inputVectors[cell.nodeId] = x_i;
      featureProvenances.push(`${cell.nodeId}:${featProv.join(';')}`);

      const { matrix, bias } = generateDeterministicMatrixAndBias(
        x_i,
        cell.genome?.capabilities ?? []
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

      const c0Override = options?.cellC0?.[cell.nodeId] ?? (sortedCells.length === 1 ? options?.c0 : undefined);

      const cellChaos = computeCellChaosDynamics({
        seedInput,
        steps: chaosSteps,
        r,
        lambda,
        initialC0: c0Override
      });

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
    const rawScores: Record<string, number> = {};
    const steps: string[] = [];

    // Step 1 & 2: Feature extraction and linear transformation for each Cell
    for (const cell of sortedCells) {
      const x_i = this.extractFeatureVector(cell, targetDomain);
      inputVectors[cell.nodeId] = x_i;

      const { matrix, bias } = generateDeterministicMatrixAndBias(
        x_i,
        cell.genome?.capabilities ?? []
      );

      const trans = applyLinearTransformation(
        x_i,
        matrix,
        bias,
        `Linear transformation for Cell ${cell.nodeId}`
      );
      transformations[cell.nodeId] = trans;

      // Calculate state/fitness/relevance raw score s_i > 0
      const fitness = (cell.genome as any)?.fitness ?? 0.8;
      const specBonus = (cell.genome?.specialization && targetDomain && cell.genome.specialization.toUpperCase().includes(targetDomain.toUpperCase())) ? 0.35 : (cell.genome?.specialization ? 0.15 : 0.0);
      const rawScore = Math.max(0.01, (fitness * 0.4) + (x_i.reliability * 0.3) + specBonus + (x_i.cognition * 0.2));
      rawScores[cell.nodeId] = rawScore;

      steps.push(`Cell ${cell.nodeId} transformed: x_i -> z_i`);
    }

    // Step 3: Compute normalized weights α_i >= 0, Σ α_i = 1
    const totalScore = Object.values(rawScores).reduce((sum, s) => sum + s, 0) || 1.0;
    const weights: Record<string, number> = {};
    const cellIds = Object.keys(rawScores);

    for (const id of cellIds) {
      weights[id] = Number((rawScores[id] / totalScore).toFixed(6));
    }

    // Adjust last weight to ensure mathematically exact sum = 1.0
    if (cellIds.length > 0) {
      const sumExceptLast = cellIds.slice(0, -1).reduce((s, id) => s + weights[id], 0);
      weights[cellIds[cellIds.length - 1]] = Number((1.0 - sumExceptLast).toFixed(6));
    }
    steps.push(`Normalized composition weights calculated across ${cellIds.length} cells`);

    // Step 4: Weighted composition C = Σ α_i z_i
    const cArr = new Array(7).fill(0);
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
      `weights_assigned:${Object.entries(weights).map(([k, v]) => `${k}=${v}`).join(';')}`,
      `collective_state_formed:${collectiveId}`
    ];

    return {
      collectiveId,
      sourceCellIds,
      inputVectors,
      weights,
      transformations,
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
    
    // Perform linear mathematical composition
    let collectiveState: CollectiveCognitiveState;
    if (activeCells.length > 0) {
      collectiveState = this.executeLinearComposition(activeCells, context, context.domain);
    } else {
      // Construct from contributions metadata
      const uniqueCellIds = Array.from(new Set(contributions.map(c => c.cellId))).sort();
      const mockCells: any[] = uniqueCellIds.map(id => ({
        nodeId: id,
        genome: {
          genomeId: `gen_${id}`,
          generation: 1,
          fitness: 0.9,
          capabilities: ['COGNITIVE_REASONING'],
          specialization: 'LOGIC'
        }
      }));
      collectiveState = this.executeLinearComposition(mockCells, context, context.domain);
    }

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
          type: 'HYPOTHESIS',
          statement: `${relContent.subjectConceptId} ${relContent.predicate} ${relContent.objectConceptId}`,
          context: {
            contextId: context.contextId,
            domain: context.domain
          },
          status: 'HYPOTHESIS',
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
          confidence: Math.max(rel.confidence ?? 0.8, 0.1),
          provenance: [`interaction:${rel.cellId}_with_multiple_cells`, `collective_state:${collectiveState.collectiveId}`],
          deterministicIdentity,
          verificationStatus: status
        };

        emergentStructures.push(emergent);
        hypotheses.push(resultingStructure);

        beliefs.push({
          conceptId: relContent.relationId ?? 'rel_unknown',
          belief: status === RepresentationVerificationStatus.SUPPORTED ? 0.9 : (status === RepresentationVerificationStatus.CONTRADICTED ? 0.5 : 0.1),
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

    provenance.push(`emergent_structures_generated:${emergentStructures.length}`);

    const representation: CollectiveRepresentation = {
      emergentStructures,
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
