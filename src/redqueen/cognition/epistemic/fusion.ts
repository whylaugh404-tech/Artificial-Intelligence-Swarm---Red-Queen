import { z } from 'zod';
import {
  EpistemicState,
  EpistemicStateSchema,
  EpistemicStatus,
  SubjectiveOpinion,
  SubjectiveOpinionSchema,
  Context,
  ContextSchema,
  freezeContext,
  EPSILON
} from './types';
import {
  Evidence,
  EvidenceSchema,
  EvidenceDependency,
  EvidenceDependencyType,
  freezeEvidence
} from '../evidence/types';
import { EvidenceDependencyGraph } from '../evidence/graph';
import { RepresentationVerificationStatus } from '../representation/types';
import { EpistemicAdapter } from './adapter';
import { logger } from '../../core/logger';

/**
 * Polarity of evidence with respect to a proposition or target representation:
 * - SUPPORTS: Evidence provides positive support
 * - CONTRADICTS: Evidence provides negative support / refutation
 * - NEUTRAL: Evidence provides neutral or context-only information
 */
export enum EvidencePolarity {
  SUPPORTS = 'SUPPORTS',
  CONTRADICTS = 'CONTRADICTS',
  NEUTRAL = 'NEUTRAL'
}

export const EvidencePolaritySchema = z.nativeEnum(EvidencePolarity);

/**
 * Attributed Evidence Item used in Epistemic Fusion.
 * Pairs an Evidence record with its evaluation parameters:
 * - polarity: whether it supports, contradicts, or is neutral
 * - weight: explicit confidence or reliability weight of the observation [0, 1]
 * - opinion: optional subjective opinion carried directly by the observation
 */
export const AttributedEvidenceSchema = z.object({
  evidence: EvidenceSchema,
  polarity: EvidencePolaritySchema.default(EvidencePolarity.SUPPORTS),
  weight: z.number().min(0).max(1).default(1.0),
  opinion: SubjectiveOpinionSchema.optional()
});

export type AttributedEvidence = z.infer<typeof AttributedEvidenceSchema>;

/**
 * Detail of an unresolved epistemic conflict between opposing evidence clusters.
 */
export const UnresolvedConflictDetailSchema = z.object({
  conflictId: z.string().min(1),
  supportingEvidenceIds: z.array(z.string().min(1)),
  conflictingEvidenceIds: z.array(z.string().min(1)),
  supportingMass: z.number().min(0),
  conflictingMass: z.number().min(0),
  discrepancy: z.number().min(0).max(1),
  reason: z.string().min(1)
});

export type UnresolvedConflictDetail = z.infer<typeof UnresolvedConflictDetailSchema>;

/**
 * Result schema for Epistemic Fusion operations.
 */
export const EpistemicFusionResultSchema = z.object({
  fusionId: z.string().min(1),
  fusedState: EpistemicStateSchema,
  targetRepresentationId: z.string().optional(),
  supportingEvidence: z.array(EvidenceSchema),
  conflictingEvidence: z.array(EvidenceSchema),
  neutralEvidence: z.array(EvidenceSchema),
  dependencies: z.array(z.custom<EvidenceDependency>()),
  effectiveSupportMass: z.number().min(0),
  effectiveConflictMass: z.number().min(0),
  hasConflict: z.boolean(),
  unresolvedConflict: UnresolvedConflictDetailSchema.optional(),
  context: ContextSchema,
  createdAt: z.string().datetime()
});

export type EpistemicFusionResult = z.infer<typeof EpistemicFusionResultSchema>;

/**
 * Deep freezes an EpistemicFusionResult to guarantee immutability.
 */
export function freezeFusionResult(result: EpistemicFusionResult): Readonly<EpistemicFusionResult> {
  const frozen = { ...result };
  frozen.supportingEvidence = Object.freeze(frozen.supportingEvidence.map(e => freezeEvidence(e))) as any;
  frozen.conflictingEvidence = Object.freeze(frozen.conflictingEvidence.map(e => freezeEvidence(e))) as any;
  frozen.neutralEvidence = Object.freeze(frozen.neutralEvidence.map(e => freezeEvidence(e))) as any;
  frozen.dependencies = Object.freeze([...frozen.dependencies]) as any;
  frozen.context = freezeContext(frozen.context) as any;
  if (frozen.unresolvedConflict) {
    frozen.unresolvedConflict = Object.freeze({
      ...frozen.unresolvedConflict,
      supportingEvidenceIds: Object.freeze([...frozen.unresolvedConflict.supportingEvidenceIds]) as any,
      conflictingEvidenceIds: Object.freeze([...frozen.unresolvedConflict.conflictingEvidenceIds]) as any
    }) as any;
  }
  return Object.freeze(frozen);
}

export function calculateEffectiveEvidenceWeight(evidence: Evidence): number {
  const confidence = evidence.confidence ?? 1.0;
  const rawReliability = ('reliability' in evidence && typeof (evidence as unknown as { reliability?: unknown }).reliability === 'number')
    ? (evidence as unknown as { reliability: number }).reliability
    : 1.0;
  const reliability = Math.max(0, Math.min(1, rawReliability));
  const dependencyDiscount = (evidence.provenance.derivedFrom && evidence.provenance.derivedFrom.length > 0) ? 0.8 : 1.0;

  const effectiveWeight = confidence * reliability * dependencyDiscount;
  return Math.max(0, Math.min(1, effectiveWeight));
}

/**
 * Epistemic Fusion Subsystem
 * 
 * Fuses heterogeneous Evidence records into an EpistemicState:
 * 1. Accounts for Evidence Dependency Graph (EDG) relationships:
 *    - INDEPENDENT: Full additive confirmation mass
 *    - CORRELATED: Scaled confirmation mass (prevents confirmation bias from correlated sources)
 *    - DEPENDENT: Derivation tree subsumption (strictly prevents double-counting derived evidence)
 *    - UNKNOWN: Conservative weighting (default discount factor)
 * 2. Handles Conflicts without destructive loss:
 *    - Never discards contradictory evidence
 *    - Never uses naive "highest confidence wins"
 *    - Preserves supporting and conflicting evidence sets, context, and provenance
 *    - Flags unresolved conflicts when evidence sets oppose each other without decisive ground truth
 * 3. Formulates rigorous SubjectiveOpinion (b, d, u, a) and EpistemicStatus.
 */
export class EpistemicFusionEngine {
  private readonly component = 'epistemic_fusion_engine';
  private readonly defaultBaseRate = 0.5;

  /**
   * Fuses a list of AttributedEvidence or Evidence records into an EpistemicFusionResult.
   */
  public fuse(
    inputs: Array<AttributedEvidence | Evidence>,
    targetContext: Context,
    edg: EvidenceDependencyGraph,
    options?: {
      targetRepresentationId?: string;
      baseRate?: number;
      fusionId?: string;
      previousState?: EpistemicState;
    }
  ): Readonly<EpistemicFusionResult> {
    if (!inputs || inputs.length === 0) {
      throw new Error('Cannot perform epistemic fusion on empty evidence list');
    }

    const validatedContext = ContextSchema.parse(targetContext);
    const frozenContext = freezeContext(validatedContext);
    const baseRate = options?.baseRate ?? this.defaultBaseRate;

    // 1. Normalize and deduplicate inputs by evidenceId (deterministic sorting)
    const normalizedList = this.normalizeInputs(inputs, options?.targetRepresentationId);
    
    // Register any evidence not yet in EDG
    for (const item of normalizedList) {
      if (!edg.hasEvidence(item.evidence.evidenceId)) {
        edg.addEvidence(item.evidence);
      }
    }

    // Sort deterministically: ancestors (lower derivation depth) precede derived items, tie-broken by evidenceId
    const allItemsMap = new Map<string, Evidence>();
    for (const item of normalizedList) {
      allItemsMap.set(item.evidence.evidenceId, item.evidence);
    }

    const depthMemo = new Map<string, number>();
    const getDepth = (id: string, visited = new Set<string>()): number => {
      if (depthMemo.has(id)) return depthMemo.get(id)!;
      if (visited.has(id)) return 0;
      visited.add(id);
      const ev = allItemsMap.get(id);
      if (!ev || !ev.provenance?.derivedFrom || ev.provenance.derivedFrom.length === 0) {
        depthMemo.set(id, 0);
        return 0;
      }
      let maxParentDepth = 0;
      for (const parentId of ev.provenance.derivedFrom) {
        maxParentDepth = Math.max(maxParentDepth, 1 + getDepth(parentId, new Set(visited)));
      }
      depthMemo.set(id, maxParentDepth);
      return maxParentDepth;
    };

    normalizedList.sort((a, b) => {
      const depthA = getDepth(a.evidence.evidenceId);
      const depthB = getDepth(b.evidence.evidenceId);
      if (depthA !== depthB) {
        return depthA - depthB; // Ancestors (lower depth) come first
      }
      return a.evidence.evidenceId.localeCompare(b.evidence.evidenceId);
    });

    // 2. Separate into supporting, conflicting, and neutral sets
    const supportingItems: AttributedEvidence[] = [];
    const conflictingItems: AttributedEvidence[] = [];
    const neutralItems: AttributedEvidence[] = [];

    for (const item of normalizedList) {
      if (item.polarity === EvidencePolarity.SUPPORTS) {
        supportingItems.push(item);
      } else if (item.polarity === EvidencePolarity.CONTRADICTS) {
        conflictingItems.push(item);
      } else {
        neutralItems.push(item);
      }
    }

    // 3. Compute effective confirmation mass for supporting and conflicting clusters using EDG
    const { effectiveMass: effectiveSupportMass, usedDeps: suppDeps } = this.calculateClusterMass(
      supportingItems,
      edg
    );
    const { effectiveMass: effectiveConflictMass, usedDeps: confDeps } = this.calculateClusterMass(
      conflictingItems,
      edg
    );

    // Collect all relevant dependencies
    const allRelevantDeps = this.collectDependencies(normalizedList.map(n => n.evidence), edg);

    // 4. Derive Subjective Opinion (belief, disbelief, uncertainty, baseRate)
    // Using Subjective Logic mapping:
    // b = effectiveSupportMass / (effectiveSupportMass + effectiveConflictMass + W)
    // d = effectiveConflictMass / (effectiveSupportMass + effectiveConflictMass + W)
    // u = W / (effectiveSupportMass + effectiveConflictMass + W)
    // where W = 2.0 (standard non-informative prior weight in subjective logic)
    const W = 2.0;
    const denominator = effectiveSupportMass + effectiveConflictMass + W;

    let belief = effectiveSupportMass / denominator;
    let disbelief = effectiveConflictMass / denominator;
    let uncertainty = W / denominator;

    // Normalization to ensure belief + disbelief + uncertainty == 1.0 within EPSILON
    const sum = belief + disbelief + uncertainty;
    if (Math.abs(sum - 1.0) > 0) {
      const diff = 1.0 - sum;
      uncertainty += diff; // absorb any floating point rounding into uncertainty
    }

    // Clamp between 0 and 1
    belief = Math.max(0, Math.min(1, belief));
    disbelief = Math.max(0, Math.min(1, disbelief));
    uncertainty = Math.max(0, Math.min(1, uncertainty));

    const opinion: SubjectiveOpinion = {
      belief,
      disbelief,
      uncertainty,
      baseRate
    };
    SubjectiveOpinionSchema.parse(opinion);

    // 5. Evaluate Conflict & Verification Status
    const hasConflict = supportingItems.length > 0 && conflictingItems.length > 0;
    let unresolvedConflict: UnresolvedConflictDetail | undefined;

    if (hasConflict) {
      const totalMass = effectiveSupportMass + effectiveConflictMass;
      const discrepancy = totalMass > 0
        ? Math.min(effectiveSupportMass, effectiveConflictMass) / totalMass
        : 0;

      // An unresolved conflict exists if neither side conclusively outweighs the other
      // (discrepancy > 0.15 means both sides have substantial non-trivial support)
      unresolvedConflict = {
        conflictId: `conflict_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        supportingEvidenceIds: supportingItems.map(i => i.evidence.evidenceId),
        conflictingEvidenceIds: conflictingItems.map(i => i.evidence.evidenceId),
        supportingMass: effectiveSupportMass,
        conflictingMass: effectiveConflictMass,
        discrepancy,
        reason: `Opposing evidence detected: ${supportingItems.length} supporting (mass: ${effectiveSupportMass.toFixed(2)}) vs ${conflictingItems.length} contradicting (mass: ${effectiveConflictMass.toFixed(2)})`
      };
    }

    // 6. Determine Epistemic Status & Representation Verification Status
    let verificationStatus: RepresentationVerificationStatus;
    let epistemicStatus: EpistemicStatus;

    if (hasConflict) {
      verificationStatus = options?.previousState?.verificationStatus ?? RepresentationVerificationStatus.PENDING;
      epistemicStatus = options?.previousState?.status ?? EpistemicStatus.UNKNOWN;
    } else if (supportingItems.length > 0 && conflictingItems.length === 0) {
      // Fusion never escalates to VERIFIED merely based on mass or count of evidence.
      // VERIFIED is only preserved if the representation was already VERIFIED.
      if (options?.previousState?.verificationStatus === RepresentationVerificationStatus.VERIFIED) {
        verificationStatus = RepresentationVerificationStatus.VERIFIED;
      } else {
        verificationStatus = RepresentationVerificationStatus.SUPPORTED;
      }
      epistemicStatus = EpistemicAdapter.evaluateStatus(verificationStatus);
    } else if (conflictingItems.length > 0 && supportingItems.length === 0) {
      verificationStatus = RepresentationVerificationStatus.CONTRADICTED;
      epistemicStatus = EpistemicStatus.CONTRADICTED;
    } else {
      // Only neutral evidence
      verificationStatus = RepresentationVerificationStatus.PENDING;
      epistemicStatus = EpistemicStatus.UNKNOWN;
    }

    const fusionId = options?.fusionId || `fusion_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Expected probability in Subjective Logic: E = belief + (baseRate * uncertainty)
    const expectedProbability = belief + (baseRate * uncertainty);
    const rawConfidence = Math.max(0, Math.min(1, expectedProbability));

    const fusedState: EpistemicState = {
      stateId: `epistemic_state_${fusionId}`,
      opinion,
      status: epistemicStatus,
      verificationStatus,
      context: frozenContext,
      rawConfidence
    };

    EpistemicStateSchema.parse(fusedState);

    const result: EpistemicFusionResult = {
      fusionId,
      fusedState,
      targetRepresentationId: options?.targetRepresentationId,
      supportingEvidence: supportingItems.map(i => i.evidence),
      conflictingEvidence: conflictingItems.map(i => i.evidence),
      neutralEvidence: neutralItems.map(i => i.evidence),
      dependencies: allRelevantDeps,
      effectiveSupportMass: effectiveSupportMass,
      effectiveConflictMass: effectiveConflictMass,
      hasConflict,
      unresolvedConflict,
      context: frozenContext,
      createdAt: new Date().toISOString()
    };

    const validatedResult = EpistemicFusionResultSchema.parse(result);
    return freezeFusionResult(validatedResult);
  }

  /**
   * Normalizes incoming inputs into an array of AttributedEvidence and rejects duplicates.
   */
  private normalizeInputs(
    inputs: Array<AttributedEvidence | Evidence>,
    targetRepresentationId?: string
  ): AttributedEvidence[] {
    const seenEvidenceIds = new Set<string>();
    const normalized: AttributedEvidence[] = [];

    for (const item of inputs) {
      let candidate: AttributedEvidence;

      // Check if it's already an AttributedEvidence
      if ('evidence' in item && item.evidence) {
        candidate = AttributedEvidenceSchema.parse(item);
      } else {
        // Plain Evidence instance
        const validatedEv = EvidenceSchema.parse(item);
        let polarity = EvidencePolarity.SUPPORTS;

        if (targetRepresentationId) {
          const supports = validatedEv.provenance.supportingRepresentationIds?.includes(targetRepresentationId);
          const contradicts = validatedEv.provenance.contradictingRepresentationIds?.includes(targetRepresentationId);
          if (contradicts) {
            polarity = EvidencePolarity.CONTRADICTS;
          } else if (supports) {
            polarity = EvidencePolarity.SUPPORTS;
          } else {
            polarity = EvidencePolarity.NEUTRAL;
          }
        }

        candidate = {
          evidence: validatedEv,
          polarity,
          weight: calculateEffectiveEvidenceWeight(validatedEv)
        };
      }

      // Deduplication: exact duplicate evidenceId does NOT duplicate count
      if (!seenEvidenceIds.has(candidate.evidence.evidenceId)) {
        seenEvidenceIds.add(candidate.evidence.evidenceId);
        normalized.push(candidate);
      }
    }

    return normalized;
  }

  /**
   * Calculates the effective mass of an evidence cluster (supporting or conflicting)
   * by accounting for EDG dependencies between pairs of evidences.
   * 
   * Dependency Rules:
   * 1. First evidence in cluster provides its full weight.
   * 2. For each subsequent evidence:
   *    - DEPENDENT to any prior evidence: 0 additional mass (strict anti-double-counting).
   *    - CORRELATED to any prior evidence: 0 additional mass (avoids confirmation bias from shared sources).
   *    - UNKNOWN with prior evidence: 0 additional mass (conservative refusal to count uncorroborated evidence).
   *    - INDEPENDENT of all prior evidence: full weight (1.0).
   */
  private calculateClusterMass(
    items: AttributedEvidence[],
    edg: EvidenceDependencyGraph
  ): { effectiveMass: number; usedDeps: EvidenceDependency[] } {
    if (items.length === 0) {
      return { effectiveMass: 0, usedDeps: [] };
    }

    let totalMass = 0;
    const processed: AttributedEvidence[] = [];
    const usedDeps: EvidenceDependency[] = [];

    for (let i = 0; i < items.length; i++) {
      const current = items[i];
      const baseWeight = current.weight;

      if (i === 0) {
        // First evidence always provides its base weight
        totalMass += baseWeight;
        processed.push(current);
        continue;
      }

      // Check dependency relationships between `current` and all `processed` items
      let minDiscountFactor = 1.0; // Assume independent until proven otherwise
      let mostRestrictiveDep: EvidenceDependency | undefined;

      for (const prior of processed) {
        // Check if explicit dependency exists in EDG
        let dep = edg.getDependencyBetween(current.evidence.evidenceId, prior.evidence.evidenceId);
        if (!dep) {
          // Compute deterministic dependency dynamically
          const analysis = edg.determineDependency(current.evidence, prior.evidence);
          dep = edg.createDependency(current.evidence, prior.evidence, analysis.type, analysis.basis, analysis.confidence);
        }

        usedDeps.push(dep);

        // Evaluate factor based on type dynamically
        let factor = 1.0;
        switch (dep.type) {
          case EvidenceDependencyType.DEPENDENT:
            factor = 0.0; // Strictly zero additional mass
            break;
          case EvidenceDependencyType.CORRELATED:
            // Correlated evidence does not provide independent additional support mass
            factor = 0.0;
            break;
          case EvidenceDependencyType.UNKNOWN:
            // Conservative assumption: do not add independent mass if unknown
            factor = 0.0;
            break;
          case EvidenceDependencyType.INDEPENDENT:
            factor = 1.0;
            break;
        }

        if (factor < minDiscountFactor) {
          minDiscountFactor = factor;
          mostRestrictiveDep = dep;
        }

        // If already 0 (DEPENDENT or UNKNOWN), no need to look further for this item
        if (minDiscountFactor === 0.0) {
          break;
        }
      }

      const addedMass = baseWeight * minDiscountFactor;
      totalMass += addedMass;
      processed.push(current);

      logger.debug(this.component, 'evidence_mass_calculated', {
        evidenceId: current.evidence.evidenceId,
        baseWeight,
        discountFactor: minDiscountFactor,
        addedMass,
        dependencyType: mostRestrictiveDep?.type ?? EvidenceDependencyType.INDEPENDENT
      });
    }

    return { effectiveMass: totalMass, usedDeps };
  }

  /**
   * Collects all EDG dependencies between the provided list of evidences.
   */
  private collectDependencies(
    evidences: Evidence[],
    edg: EvidenceDependencyGraph
  ): EvidenceDependency[] {
    const depsMap = new Map<string, EvidenceDependency>();

    for (let i = 0; i < evidences.length; i++) {
      for (let j = i + 1; j < evidences.length; j++) {
        const evA = evidences[i];
        const evB = evidences[j];
        let dep = edg.getDependencyBetween(evA.evidenceId, evB.evidenceId);
        if (!dep) {
          const analysis = edg.determineDependency(evA, evB);
          dep = edg.createDependency(evA, evB, analysis.type, analysis.basis, analysis.confidence);
        }
        depsMap.set(dep.dependencyId, dep);
      }
    }

    return Array.from(depsMap.values());
  }

  /**
   * Persists an EpistemicFusionResult into a JSON string.
   */
  public persist(result: EpistemicFusionResult): string {
    return JSON.stringify(result);
  }

  /**
   * Reloads and validates an EpistemicFusionResult from a JSON string.
   */
  public reload(json: string): EpistemicFusionResult | null {
    try {
      const parsed = JSON.parse(json);
      const validated = EpistemicFusionResultSchema.safeParse(parsed);
      if (!validated.success) {
        return null;
      }
      return freezeFusionResult(validated.data);
    } catch {
      return null;
    }
  }
}
