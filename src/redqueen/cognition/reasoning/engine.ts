import { createHash } from 'crypto';
import {
  CognitiveConcept,
  CognitiveConceptSchema,
  CognitiveRelation,
  CognitiveRelationPredicate,
  CognitiveRelationSchema,
  RepresentationVerificationStatus
} from '../representation/types';
import {
  Context,
  ContextSchema,
  EpistemicStatus,
  SubjectiveOpinion,
  SubjectiveOpinionSchema,
  freezeContext,
  EPSILON
} from '../epistemic/types';
import { CognitiveUnderstanding, CognitiveUnderstandingSchema } from '../understanding/types';
import { WorldModel, WorldModelSchema } from '../worldmodel/types';
import { Evidence, EvidenceSchema } from '../evidence/types';
import { CognitiveGraph } from '../representation/graph';
import { UnderstandingEngine } from '../understanding/engine';
import { WorldModelEngine } from '../worldmodel/engine';
import {
  AlternativeHypothesis,
  AlternativeHypothesisSchema,
  CounterEvidenceItem,
  CounterEvidenceItemSchema,
  InferenceRuleType,
  InferenceStep,
  InferenceStepInput,
  InferenceStepSchema,
  PremiseSourceType,
  ReasoningChain,
  ReasoningChainSchema,
  ReasoningConclusion,
  ReasoningConclusionSchema,
  ReasoningHypothesis,
  ReasoningHypothesisInput,
  ReasoningHypothesisSchema,
  ReasoningInput,
  ReasoningPremise,
  ReasoningPremiseInput,
  ReasoningPremiseSchema,
  ReasoningTrace,
  ReasoningVerification,
  ReasoningVerificationSchema
} from './types';

function stringifyDeterministic(obj: any): string {
  if (Array.isArray(obj)) {
    return `[${obj.map(stringifyDeterministic).join(',')}]`;
  }
  if (typeof obj === 'object' && obj !== null) {
    const keys = Object.keys(obj).sort();
    const props = keys.map(k => `"${k}":${stringifyDeterministic(obj[k])}`);
    return `{${props.join(',')}}`;
  }
  return JSON.stringify(obj);
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const value = (obj as any)[key];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

export class ReasoningEngine {
  private readonly chains = new Map<string, ReasoningChain>();
  private readonly conceptCache = new Map<string, CognitiveConcept>();
  private readonly relationCache = new Map<string, CognitiveRelation>();
  private readonly understandingCache = new Map<string, CognitiveUnderstanding>();
  private readonly worldModelCache = new Map<string, WorldModel>();
  private readonly evidenceCache = new Map<string, Evidence>();

  constructor(
    private readonly defaultGraph?: CognitiveGraph,
    private readonly defaultWorldModelEngine?: WorldModelEngine,
    private readonly defaultUnderstandingEngine?: UnderstandingEngine
  ) {}

  public getChain(reasoningId: string): ReasoningChain | undefined {
    return this.chains.get(reasoningId);
  }

  public getAllChains(): ReasoningChain[] {
    return Array.from(this.chains.values());
  }

  /**
   * Primary deterministic native reasoning pipeline:
   * Premise → Inference → Hypothesis → Evidence → Verification → Conclusion
   */
  public reason(
    input: ReasoningInput,
    graphOverride?: CognitiveGraph
  ): ReasoningChain {
    const graph = graphOverride || this.defaultGraph;

    // -------------------------------------------------------------
    // 0. Cache & Ingest Contextual Subsystems (World Model, Understandings)
    // -------------------------------------------------------------
    let worldModelId: string | undefined;
    if (input.worldModel) {
      if (typeof input.worldModel === 'string') {
        worldModelId = input.worldModel;
      } else {
        const parsedWM = WorldModelSchema.parse(input.worldModel);
        worldModelId = parsedWM.worldModelId;
        this.worldModelCache.set(parsedWM.worldModelId, input.worldModel);
      }
    }

    const understandingIdsSet = new Set<string>();
    if (input.understandings) {
      for (const rawUnd of input.understandings) {
        const und = CognitiveUnderstandingSchema.parse(rawUnd);
        understandingIdsSet.add(und.understandingId);
        this.understandingCache.set(und.understandingId, und);
        for (const dep of und.dependencies) {
          if (dep.sourceType === 'CONCEPT' && graph) {
            const c = graph.getConcept(dep.sourceId);
            if (c) this.conceptCache.set(c.conceptId, c);
          } else if (dep.sourceType === 'RELATION' && graph) {
            const r = graph.getRelation(dep.sourceId);
            if (r) this.relationCache.set(r.relationId, r);
          }
        }
      }
    }

    // Cache explicit evidences
    if (input.evidences) {
      for (const ev of input.evidences) {
        if (typeof ev !== 'string') {
          const parsedEv = EvidenceSchema.parse(ev);
          this.evidenceCache.set(parsedEv.evidenceId, parsedEv);
        }
      }
    }

    // -------------------------------------------------------------
    // 1. PHASE 1: PREMISE RESOLUTION
    // -------------------------------------------------------------
    const loadedPremises: ReasoningPremise[] = [];
    const provenanceSet = new Set<string>();
    provenanceSet.add(input.originatingCellId);

    for (const rawPremise of input.premises) {
      const pInput = rawPremise as any;
      let statement = pInput.statement;
      let sourceType: PremiseSourceType = pInput.sourceType || 'OBSERVATION';
      let sourceId = pInput.sourceId || '';
      let confidence = pInput.confidence !== undefined ? pInput.confidence : 1.0;
      let epistemicStatus = pInput.epistemicStatus;
      const premiseEvidences: string[] = [...(pInput.evidenceIds || [])];
      const premiseProvenance: string[] = [...(pInput.provenance || [])];

      if (pInput.concept) {
        sourceType = 'CONCEPT';
        if (typeof pInput.concept === 'string') {
          sourceId = pInput.concept;
          const c = this.conceptCache.get(sourceId) || graph?.getConcept(sourceId);
          if (c) {
            this.conceptCache.set(c.conceptId, c);
            if (!statement) statement = c.description || c.canonicalName;
            if (c.evidenceIds) premiseEvidences.push(...c.evidenceIds);
            if (c.provenance) premiseProvenance.push(...c.provenance);
            confidence = c.confidence;
            if (!epistemicStatus) {
              epistemicStatus =
                c.verificationStatus === RepresentationVerificationStatus.VERIFIED
                  ? EpistemicStatus.VERIFIED
                  : c.verificationStatus === RepresentationVerificationStatus.CONTRADICTED
                  ? EpistemicStatus.CONTRADICTED
                  : EpistemicStatus.BELIEVED;
            }
          }
        } else {
          const c = CognitiveConceptSchema.parse(pInput.concept);
          sourceId = c.conceptId;
          this.conceptCache.set(c.conceptId, c);
          if (!statement) statement = c.description || c.canonicalName;
          if (c.evidenceIds) premiseEvidences.push(...c.evidenceIds);
          if (c.provenance) premiseProvenance.push(...c.provenance);
          confidence = c.confidence;
        }
      } else if (pInput.relation) {
        sourceType = 'RELATION';
        if (typeof pInput.relation === 'string') {
          sourceId = pInput.relation;
          const r = this.relationCache.get(sourceId) || graph?.getRelation(sourceId);
          if (r) {
            this.relationCache.set(r.relationId, r);
            if (!statement) statement = `${r.subjectConceptId} ${r.predicate} ${r.objectConceptId}`;
            if (r.evidenceIds) premiseEvidences.push(...r.evidenceIds);
            if (r.provenance) premiseProvenance.push(...r.provenance);
            confidence = r.confidence;
          }
        } else {
          const r = CognitiveRelationSchema.parse(pInput.relation);
          sourceId = r.relationId;
          this.relationCache.set(r.relationId, r);
          if (!statement) statement = `${r.subjectConceptId} ${r.predicate} ${r.objectConceptId}`;
          if (r.evidenceIds) premiseEvidences.push(...r.evidenceIds);
          if (r.provenance) premiseProvenance.push(...r.provenance);
          confidence = r.confidence;
        }
      } else if (pInput.understanding) {
        sourceType = 'UNDERSTANDING';
        if (typeof pInput.understanding === 'string') {
          sourceId = pInput.understanding;
          const u = this.understandingCache.get(sourceId);
          if (u) {
            if (!statement) statement = u.summary || `Understanding ${u.understandingId}`;
            premiseEvidences.push(...u.evidenceIds);
            premiseProvenance.push(...u.provenance);
          }
        } else {
          const u = CognitiveUnderstandingSchema.parse(pInput.understanding);
          sourceId = u.understandingId;
          this.understandingCache.set(u.understandingId, u);
          if (!statement) statement = u.summary || `Understanding ${u.understandingId}`;
          premiseEvidences.push(...u.evidenceIds);
          premiseProvenance.push(...u.provenance);
        }
      } else if (pInput.worldModel) {
        sourceType = 'WORLD_MODEL';
        sourceId = typeof pInput.worldModel === 'string' ? pInput.worldModel : pInput.worldModel.worldModelId;
      }

      if (!sourceId) {
        sourceId = `obs_${createHash('sha256').update(statement).digest('hex').substring(0, 10)}`;
      }

      for (const p of premiseProvenance) provenanceSet.add(p);

      const premiseSignature = `${sourceType}:${sourceId}:${statement}`;
      const premiseId = `prm_${createHash('sha256').update(premiseSignature).digest('hex').substring(0, 12)}`;

      const premiseObj = ReasoningPremiseSchema.parse({
        premiseId,
        statement,
        sourceType,
        sourceId,
        confidence,
        epistemicStatus,
        evidenceIds: Array.from(new Set(premiseEvidences)).sort(),
        provenance: Array.from(new Set(premiseProvenance)).sort(),
        metadata: rawPremise.metadata || {}
      });

      loadedPremises.push(premiseObj);
    }

    // Sort premises canonically right away to guarantee input-order independence
    loadedPremises.sort((a, b) => a.premiseId.localeCompare(b.premiseId));

    // -------------------------------------------------------------
    // 2. PHASE 2 & 3: INFERENCE & HYPOTHESIS FORMULATION
    // -------------------------------------------------------------
    const loadedHypotheses: ReasoningHypothesis[] = [];
    const loadedInferenceSteps: InferenceStep[] = [];

    // Formulate hypotheses
    if (input.hypotheses && input.hypotheses.length > 0) {
      for (const h of input.hypotheses) {
        const hypSignature = `${h.statement}:${h.targetConceptId || ''}:${h.targetRelationId || ''}:${h.predicate || ''}`;
        const hypothesisId = h.hypothesisId || `hyp_${createHash('sha256').update(hypSignature).digest('hex').substring(0, 12)}`;
        const hypObj = ReasoningHypothesisSchema.parse({
          hypothesisId,
          statement: h.statement,
          targetConceptId: h.targetConceptId,
          targetRelationId: h.targetRelationId,
          predicate: h.predicate,
          confidence: h.confidence !== undefined ? h.confidence : 0.5,
          status: h.status || EpistemicStatus.HYPOTHESIS,
          rationale: h.rationale || ''
        });
        loadedHypotheses.push(hypObj);
      }
    } else {
      // Automatic hypothesis derivation from goal and premises
      const primaryPremise = loadedPremises[0];
      const statement = `Inferred consequence for goal "${input.goal}" based on ${primaryPremise?.statement || 'premises'}`;
      const hypSignature = `${statement}:${input.goal}`;
      const hypothesisId = `hyp_${createHash('sha256').update(hypSignature).digest('hex').substring(0, 12)}`;
      const hypObj = ReasoningHypothesisSchema.parse({
        hypothesisId,
        statement,
        confidence: primaryPremise ? primaryPremise.confidence : 0.5,
        status: EpistemicStatus.HYPOTHESIS,
        rationale: 'Hypothesis formed automatically from reasoning premises.'
      });
      loadedHypotheses.push(hypObj);
    }

    // Construct or validate inference steps
    if (input.inferenceSteps && input.inferenceSteps.length > 0) {
      for (const stepInput of input.inferenceSteps) {
        const rule = stepInput.rule;
        const description = stepInput.description;
        const premiseIds = (stepInput.premiseIds && stepInput.premiseIds.length > 0)
          ? [...stepInput.premiseIds].sort()
          : loadedPremises.map(p => p.premiseId).sort();
        const assumptions = [...(stepInput.assumptions || input.assumptions || [])].sort();
        const derivedHypothesisId = stepInput.derivedHypothesisId || loadedHypotheses[0].hypothesisId;
        const stepSig = `${rule}:${description}:${premiseIds.join(',')}:${assumptions.join(',')}:${derivedHypothesisId}`;
        const stepId = stepInput.stepId || `inf_${createHash('sha256').update(stepSig).digest('hex').substring(0, 12)}`;

        const stepObj = InferenceStepSchema.parse({
          stepId,
          rule,
          description,
          premiseIds,
          assumptions,
          derivedHypothesisId,
          intermediateConfidence: stepInput.intermediateConfidence !== undefined ? stepInput.intermediateConfidence : 1.0
        });
        loadedInferenceSteps.push(stepObj);
      }
    } else {
      // Default deductive inference step
      const premiseIds = loadedPremises.map(p => p.premiseId).sort();
      const assumptions = [...(input.assumptions || [])].sort();
      const derivedHypothesisId = loadedHypotheses[0].hypothesisId;
      const rule = InferenceRuleType.DEDUCTION;
      const description = `Deductive derivation of "${loadedHypotheses[0].statement}" from premises`;
      const stepSig = `${rule}:${description}:${premiseIds.join(',')}:${assumptions.join(',')}:${derivedHypothesisId}`;
      const stepId = `inf_${createHash('sha256').update(stepSig).digest('hex').substring(0, 12)}`;

      const stepObj = InferenceStepSchema.parse({
        stepId,
        rule,
        description,
        premiseIds,
        assumptions,
        derivedHypothesisId,
        intermediateConfidence: loadedPremises.reduce((acc, p) => acc * p.confidence, 1.0)
      });
      loadedInferenceSteps.push(stepObj);
    }

    // -------------------------------------------------------------
    // 3. PHASE 4: EVIDENCE ACCUMULATION & COUNTER-EVIDENCE
    // -------------------------------------------------------------
    const gatheredEvidenceIds = new Set<string>();

    // From explicit evidences
    if (input.evidences) {
      for (const ev of input.evidences) {
        if (typeof ev === 'string') {
          gatheredEvidenceIds.add(ev);
        } else {
          gatheredEvidenceIds.add(ev.evidenceId);
        }
      }
    }

    // From premises
    for (const p of loadedPremises) {
      for (const e of p.evidenceIds) {
        gatheredEvidenceIds.add(e);
      }
    }

    // Counter evidence parsing
    const loadedCounterEvidences: CounterEvidenceItem[] = [];
    if (input.counterEvidences) {
      for (const item of input.counterEvidences) {
        if (typeof item === 'string') {
          loadedCounterEvidences.push({
            evidenceId: item,
            reason: 'Counter-evidence observed',
            weight: 1.0
          });
        } else if ('evidenceId' in item && 'reason' in item) {
          loadedCounterEvidences.push(CounterEvidenceItemSchema.parse(item));
        } else if ('evidenceId' in item) {
          loadedCounterEvidences.push({
            evidenceId: (item as any).evidenceId,
            reason: 'Counter-evidence record',
            weight: 1.0,
            sourceId: (item as any).sourceId
          });
        }
      }
    }

    // Alternative hypotheses parsing
    const loadedAlternatives: AlternativeHypothesis[] = [];
    if (input.alternatives) {
      for (const alt of input.alternatives) {
        const hypothesisId = alt.hypothesisId || `alt_${createHash('sha256').update(alt.statement).digest('hex').substring(0, 10)}`;
        loadedAlternatives.push(
          AlternativeHypothesisSchema.parse({
            hypothesisId,
            statement: alt.statement,
            status: alt.status || EpistemicStatus.HYPOTHESIS,
            confidence: alt.confidence,
            reason: alt.reason
          })
        );
      }
    }

    // -------------------------------------------------------------
    // 4. PHASE 5: VERIFICATION & EPISTEMIC STATUS EVALUATION
    // -------------------------------------------------------------
    const minThreshold = input.minEvidenceThreshold !== undefined ? input.minEvidenceThreshold : 0.5;
    const targetHypothesis = loadedHypotheses[0];

    // Check for contradiction
    let hasContradiction = false;
    let contradictionReason = '';

    if (loadedCounterEvidences.length > 0) {
      hasContradiction = true;
      contradictionReason = `Contradicted by ${loadedCounterEvidences.length} counter-evidence record(s): ${loadedCounterEvidences.map(c => c.reason).join('; ')}`;
    }

    // Check if premises contain contradicted items
    if (!hasContradiction) {
      const contradictedPremise = loadedPremises.find(
        p => p.epistemicStatus === EpistemicStatus.CONTRADICTED || p.confidence === 0
      );
      if (contradictedPremise) {
        hasContradiction = true;
        contradictionReason = `Premise "${contradictedPremise.statement}" is marked as CONTRADICTED.`;
      }
    }

    // Check if graph has contradicting relations
    if (!hasContradiction && graph && targetHypothesis.targetConceptId) {
      const contradictions = graph.getContradictions(targetHypothesis.targetConceptId);
      if (contradictions.length > 0) {
        hasContradiction = true;
        contradictionReason = `CognitiveGraph contains contradiction relation for target ${targetHypothesis.targetConceptId}`;
      } else {
        const relations = graph.getRelationsForConcept(targetHypothesis.targetConceptId);
        for (const r of relations) {
          if (
            r.predicate === CognitiveRelationPredicate.CONTRADICTS ||
            r.verificationStatus === RepresentationVerificationStatus.CONTRADICTED
          ) {
            hasContradiction = true;
            contradictionReason = `CognitiveGraph contains contradiction relation ${r.relationId} for target ${targetHypothesis.targetConceptId}`;
            break;
          }
        }
      }
    }

    let finalEpistemicStatus: EpistemicStatus;
    let finalVerificationStatus: RepresentationVerificationStatus;
    let uncertainty: SubjectiveOpinion;
    let verificationConfidence: number;
    let verificationRationale: string;

    const supportingEvidenceArray = Array.from(gatheredEvidenceIds).sort();

    if (hasContradiction) {
      finalEpistemicStatus = EpistemicStatus.CONTRADICTED;
      finalVerificationStatus = RepresentationVerificationStatus.CONTRADICTED;
      verificationConfidence = 0.05;
      verificationRationale = contradictionReason;
      uncertainty = {
        belief: 0.0,
        disbelief: 0.95,
        uncertainty: 0.05,
        baseRate: 0.5
      };
      targetHypothesis.status = EpistemicStatus.CONTRADICTED;
    } else if (supportingEvidenceArray.length === 0) {
      // Requirement 7: "Reasoning harus bisa berhenti dan menghasilkan 'UNKNOWN' jika bukti tidak cukup."
      finalEpistemicStatus = EpistemicStatus.UNKNOWN;
      finalVerificationStatus = RepresentationVerificationStatus.PENDING;
      verificationConfidence = 0.0;
      verificationRationale = `Insufficient evidence: 0 supporting evidence items found (threshold: ${minThreshold}). Reasoning halted with UNKNOWN status.`;
      uncertainty = {
        belief: 0.0,
        disbelief: 0.0,
        uncertainty: 1.0,
        baseRate: 0.5
      };
      targetHypothesis.status = EpistemicStatus.UNKNOWN;
    } else {
      // Evaluate quality and confidence of supporting evidence
      let verifiedCount = 0;
      let totalEvidenceConfidence = 0;

      for (const evId of supportingEvidenceArray) {
        const ev = this.evidenceCache.get(evId) || graph?.getEvidence(evId);
        if (ev) {
          this.evidenceCache.set(evId, ev);
          if (ev.provenance?.sourceId) provenanceSet.add(ev.provenance.sourceId);
          verifiedCount++;
          // Use real evidence confidence if available, otherwise default to a high but non-perfect value
          totalEvidenceConfidence += ev.confidence !== undefined ? ev.confidence : 0.85;
        } else {
          // Id reference without full cached object
          totalEvidenceConfidence += 0.8;
        }
      }

      const avgEvidenceConfidence = totalEvidenceConfidence / supportingEvidenceArray.length;
      const combinedConfidence = Math.min(1.0, (targetHypothesis.confidence * 0.4) + (avgEvidenceConfidence * 0.6));

      if (combinedConfidence < minThreshold) {
        // Insufficient confidence threshold -> UNKNOWN
        finalEpistemicStatus = EpistemicStatus.UNKNOWN;
        finalVerificationStatus = RepresentationVerificationStatus.PENDING;
        verificationConfidence = combinedConfidence;
        verificationRationale = `Evidence confidence (${combinedConfidence.toFixed(2)}) below minimum required threshold (${minThreshold}). Result is UNKNOWN.`;
        uncertainty = {
          belief: 0.0,
          disbelief: 0.0,
          uncertainty: 1.0,
          baseRate: 0.5
        };
        targetHypothesis.status = EpistemicStatus.UNKNOWN;
      } else if (combinedConfidence >= 0.9 && supportingEvidenceArray.length >= 1) {
        finalEpistemicStatus = EpistemicStatus.VERIFIED;
        finalVerificationStatus = RepresentationVerificationStatus.VERIFIED;
        verificationConfidence = combinedConfidence;
        verificationRationale = `Hypothesis verified with conclusive evidence (${supportingEvidenceArray.length} items, confidence ${combinedConfidence.toFixed(2)}).`;
        const belief = Math.min(0.95, Number((combinedConfidence * 0.95).toFixed(4)));
        const unc = Number((1.0 - belief).toFixed(4));
        uncertainty = {
          belief,
          disbelief: 0.0,
          uncertainty: unc,
          baseRate: 0.5
        };
        targetHypothesis.status = EpistemicStatus.VERIFIED;
      } else {
        finalEpistemicStatus = EpistemicStatus.BELIEVED;
        finalVerificationStatus = RepresentationVerificationStatus.SUPPORTED;
        verificationConfidence = combinedConfidence;
        verificationRationale = `Hypothesis supported with moderate evidence (${supportingEvidenceArray.length} items, confidence ${combinedConfidence.toFixed(2)}).`;
        const belief = Math.min(0.80, Number((combinedConfidence * 0.80).toFixed(4)));
        const unc = Number((1.0 - belief).toFixed(4));
        uncertainty = {
          belief,
          disbelief: 0.0,
          uncertainty: unc,
          baseRate: 0.5
        };
        targetHypothesis.status = EpistemicStatus.BELIEVED;
      }
    }

    const verificationSig = `${targetHypothesis.hypothesisId}:${finalEpistemicStatus}:${verificationConfidence}:${verificationRationale}`;
    const verificationId = `vrf_${createHash('sha256').update(verificationSig).digest('hex').substring(0, 12)}`;

    const verificationObj = ReasoningVerificationSchema.parse({
      verificationId,
      hypothesisId: targetHypothesis.hypothesisId,
      supportingEvidenceIds: supportingEvidenceArray,
      counterEvidenceIds: loadedCounterEvidences.map(c => c.evidenceId).sort(),
      hasContradiction,
      verificationStatus: finalVerificationStatus,
      epistemicStatus: finalEpistemicStatus,
      confidence: verificationConfidence,
      rationale: verificationRationale
    });

    // -------------------------------------------------------------
    // 5. PHASE 6: CONCLUSION SYNTHESIS
    // -------------------------------------------------------------
    const sortedPremises = [...loadedPremises].sort((a, b) => a.premiseId.localeCompare(b.premiseId));
    const sortedInferenceSteps = [...loadedInferenceSteps].sort((a, b) => a.stepId.localeCompare(b.stepId));
    const sortedHypotheses = [...loadedHypotheses].sort((a, b) => a.hypothesisId.localeCompare(b.hypothesisId));
    const sortedCounterEvidence = [...loadedCounterEvidences].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
    const sortedAssumptions = Array.from(new Set(input.assumptions || [])).sort();
    const sortedAlternatives = [...loadedAlternatives].sort((a, b) => a.hypothesisId.localeCompare(b.hypothesisId));
    const provenanceArray = Array.from(provenanceSet).sort();

    const conclusionStatement = targetHypothesis.statement;
    const conclusionSig = `${conclusionStatement}:${finalEpistemicStatus}:${sortedPremises.map(p => p.premiseId).join(',')}:${sortedInferenceSteps.map(s => s.stepId).join(',')}`;
    const conclusionId = `ccl_${createHash('sha256').update(conclusionSig).digest('hex').substring(0, 12)}`;

    const conclusionObj = ReasoningConclusionSchema.parse({
      conclusionId,
      statement: conclusionStatement,
      status: finalEpistemicStatus,
      premises: sortedPremises,
      inferenceChain: sortedInferenceSteps,
      evidence: supportingEvidenceArray,
      counterEvidence: sortedCounterEvidence,
      assumptions: sortedAssumptions,
      uncertainty,
      alternatives: sortedAlternatives,
      provenance: provenanceArray,
      originatingCellId: input.originatingCellId,
      createdAt: new Date().toISOString()
    });

    // -------------------------------------------------------------
    // 6. DETERMINISTIC IDENTITY HASHING & IMMUTABILITY
    // -------------------------------------------------------------
    // Canonical payload strictly excludes non-semantic metadata, ensuring input-order independence!
    const canonicalPayload = {
      goal: input.goal,
      context: {
        domain: input.context.domain,
        contextId: input.context.contextId,
        temporalBounds: input.context.temporalBounds
      },
      status: finalEpistemicStatus,
      premises: sortedPremises.map(p => ({
        sourceType: p.sourceType,
        sourceId: p.sourceId,
        statement: p.statement,
        confidence: p.confidence
      })),
      inferenceChain: sortedInferenceSteps.map(s => ({
        rule: s.rule,
        description: s.description,
        premiseIds: s.premiseIds,
        assumptions: s.assumptions
      })),
      hypotheses: sortedHypotheses.map(h => ({
        statement: h.statement,
        targetConceptId: h.targetConceptId,
        targetRelationId: h.targetRelationId,
        predicate: h.predicate,
        status: h.status
      })),
      evidenceIds: supportingEvidenceArray,
      counterEvidenceIds: sortedCounterEvidence.map(c => c.evidenceId),
      assumptions: sortedAssumptions,
      alternatives: sortedAlternatives.map(a => ({
        statement: a.statement,
        status: a.status,
        confidence: a.confidence
      })),
      uncertainty: {
        belief: uncertainty.belief,
        disbelief: uncertainty.disbelief,
        uncertainty: uncertainty.uncertainty,
        baseRate: uncertainty.baseRate
      }
    };

    const hashString = stringifyDeterministic(canonicalPayload);
    const reasoningId = `rsn_${createHash('sha256').update(hashString).digest('hex').substring(0, 16)}`;

    const rawChain = {
      reasoningId,
      goal: input.goal,
      context: freezeContext(input.context),
      status: finalEpistemicStatus,
      worldModelId,
      understandingIds: Array.from(understandingIdsSet).sort(),
      premises: sortedPremises,
      inferenceChain: sortedInferenceSteps,
      hypotheses: sortedHypotheses,
      verification: verificationObj,
      conclusion: conclusionObj,
      provenance: provenanceArray,
      originatingCellId: input.originatingCellId,
      createdAt: new Date().toISOString(),
      version: 1,
      metadata: input.metadata || {}
    };

    const validatedChain = ReasoningChainSchema.parse(rawChain);

    const boundChain: ReasoningChain = {
      ...validatedChain,
      trace: (elementId: string) => this.trace(boundChain, elementId, graph)
    };

    const frozen = deepFreeze(boundChain);
    this.chains.set(frozen.reasoningId, frozen);
    return frozen;
  }

  /**
   * Traceable provenance: CognitiveGraph → Understanding → WorldModel → Evidence
   */
  public trace(
    chain: ReasoningChain,
    elementId: string,
    graphOverride?: CognitiveGraph
  ): ReasoningTrace {
    const graph = graphOverride || this.defaultGraph;

    // 1. Is it a Premise?
    const premise = chain.premises.find(p => p.premiseId === elementId);
    if (premise) {
      let rep: CognitiveConcept | CognitiveRelation | undefined;
      if (premise.sourceType === 'CONCEPT') {
        rep = this.conceptCache.get(premise.sourceId) || graph?.getConcept(premise.sourceId);
      } else if (premise.sourceType === 'RELATION') {
        rep = this.relationCache.get(premise.sourceId) || graph?.getRelation(premise.sourceId);
      }

      const understandings = chain.understandingIds
        .map(id => this.understandingCache.get(id)!)
        .filter(Boolean);

      const evidences = premise.evidenceIds
        .map(id => this.evidenceCache.get(id) || graph?.getEvidence(id)!)
        .filter(Boolean);

      return {
        elementId,
        elementType: 'PREMISE',
        representation: rep,
        premises: [premise],
        inferenceSteps: chain.inferenceChain.filter(s => s.premiseIds.includes(elementId)),
        hypotheses: [],
        evidences,
        epistemicStatus: premise.epistemicStatus
      };
    }

    // 2. Is it an Inference Step?
    const step = chain.inferenceChain.find(s => s.stepId === elementId);
    if (step) {
      const stepPremises = chain.premises.filter(p => step.premiseIds.includes(p.premiseId));
      const stepHypotheses = chain.hypotheses.filter(h => h.hypothesisId === step.derivedHypothesisId);
      return {
        elementId,
        elementType: 'INFERENCE_STEP',
        premises: stepPremises,
        inferenceSteps: [step],
        hypotheses: stepHypotheses,
        evidences: []
      };
    }

    // 3. Is it a Hypothesis?
    const hypothesis = chain.hypotheses.find(h => h.hypothesisId === elementId);
    if (hypothesis) {
      const supportingEvidences = chain.verification.supportingEvidenceIds
        .map(id => this.evidenceCache.get(id) || graph?.getEvidence(id)!)
        .filter(Boolean);
      return {
        elementId,
        elementType: 'HYPOTHESIS',
        premises: chain.premises,
        inferenceSteps: chain.inferenceChain.filter(s => s.derivedHypothesisId === elementId),
        hypotheses: [hypothesis],
        evidences: supportingEvidences,
        epistemicStatus: hypothesis.status
      };
    }

    // 4. Is it a Concept?
    let concept = this.conceptCache.get(elementId) || graph?.getConcept(elementId);
    if (concept) {
      const understandings = Array.from(this.understandingCache.values()).filter(u =>
        u.dependencies.some(d => d.sourceId === elementId)
      );
      const evidences = (concept.evidenceIds || [])
        .map(id => this.evidenceCache.get(id) || graph?.getEvidence(id)!)
        .filter(Boolean);
      return {
        elementId,
        elementType: 'CONCEPT',
        representation: concept,
        premises: chain.premises.filter(p => p.sourceId === elementId),
        inferenceSteps: [],
        hypotheses: chain.hypotheses.filter(h => h.targetConceptId === elementId),
        evidences,
        epistemicStatus: concept.verificationStatus === RepresentationVerificationStatus.VERIFIED
          ? EpistemicStatus.VERIFIED
          : EpistemicStatus.BELIEVED
      };
    }

    // 5. Is it a Relation?
    let relation = this.relationCache.get(elementId) || graph?.getRelation(elementId);
    if (relation) {
      const understandings = Array.from(this.understandingCache.values()).filter(u =>
        u.dependencies.some(d => d.sourceId === elementId)
      );
      const evidences = (relation.evidenceIds || [])
        .map(id => this.evidenceCache.get(id) || graph?.getEvidence(id)!)
        .filter(Boolean);
      return {
        elementId,
        elementType: 'RELATION',
        representation: relation,
        premises: chain.premises.filter(p => p.sourceId === elementId),
        inferenceSteps: [],
        hypotheses: chain.hypotheses.filter(h => h.targetRelationId === elementId),
        evidences,
        epistemicStatus: relation.verificationStatus === RepresentationVerificationStatus.VERIFIED
          ? EpistemicStatus.VERIFIED
          : EpistemicStatus.BELIEVED
      };
    }

    // 6. Is it an Understanding?
    const und = this.understandingCache.get(elementId);
    if (und) {
      const evidences = und.evidenceIds
        .map(id => this.evidenceCache.get(id) || graph?.getEvidence(id)!)
        .filter(Boolean);
      return {
        elementId,
        elementType: 'UNDERSTANDING',
        understanding: und,
        premises: chain.premises.filter(p => p.sourceId === elementId),
        inferenceSteps: [],
        hypotheses: [],
        evidences,
        epistemicStatus: und.verificationStatus === RepresentationVerificationStatus.VERIFIED
          ? EpistemicStatus.VERIFIED
          : EpistemicStatus.BELIEVED
      };
    }

    // 7. Is it Evidence?
    const ev = this.evidenceCache.get(elementId) || graph?.getEvidence(elementId);
    if (ev) {
      return {
        elementId,
        elementType: 'EVIDENCE',
        evidence: ev,
        premises: chain.premises.filter(p => p.evidenceIds.includes(elementId)),
        inferenceSteps: [],
        hypotheses: [],
        evidences: [ev]
      };
    }

    // 8. Is it a WorldModel?
    const wm = this.worldModelCache.get(elementId);
    if (wm) {
      return {
        elementId,
        elementType: 'WORLD_MODEL',
        worldModel: wm,
        premises: chain.premises.filter(p => p.sourceId === elementId),
        inferenceSteps: [],
        hypotheses: [],
        evidences: [],
        epistemicStatus: wm.epistemicStatus
      };
    }

    throw new Error(`Element "${elementId}" not found in ReasoningChain "${chain.reasoningId}" or underlying graph`);
  }

  /**
   * Causal reasoning helper: Traverses CAUSES relations in WorldModel / CognitiveGraph
   */
  public inferCausalChain(params: {
    triggerEventConceptId: string;
    worldModel?: WorldModel;
    context: Context;
    originatingCellId: string;
    goal?: string;
  }): ReasoningChain {
    const graph = this.defaultGraph;
    const triggerConcept = this.conceptCache.get(params.triggerEventConceptId) || graph?.getConcept(params.triggerEventConceptId);
    if (!triggerConcept) {
      throw new Error(`Trigger concept "${params.triggerEventConceptId}" not found`);
    }

    // Find outgoing CAUSES relations
    const relations = graph?.getRelationsForConcept(params.triggerEventConceptId) || [];
    const causalRelations = relations.filter(
      r => r.subjectConceptId === params.triggerEventConceptId && r.predicate === CognitiveRelationPredicate.CAUSES
    );

    const premises: ReasoningPremiseInput[] = [
      {
        concept: triggerConcept,
        statement: `Observed trigger event: ${triggerConcept.canonicalName} (${triggerConcept.description})`
      }
    ];

    for (const cr of causalRelations) {
      premises.push({
        relation: cr,
        statement: `Causal mechanism: ${cr.subjectConceptId} CAUSES ${cr.objectConceptId}`
      });
    }

    const hypotheses: ReasoningHypothesisInput[] = [];
    for (const cr of causalRelations) {
      const target = graph?.getConcept(cr.objectConceptId);
      hypotheses.push({
        statement: `Consequence state: ${target?.canonicalName || cr.objectConceptId} is induced by ${triggerConcept.canonicalName}`,
        targetConceptId: cr.objectConceptId,
        predicate: CognitiveRelationPredicate.CAUSES,
        confidence: cr.confidence
      });
    }

    return this.reason({
      goal: params.goal || `Deduce causal cascade from trigger ${triggerConcept.canonicalName}`,
      context: params.context,
      originatingCellId: params.originatingCellId,
      worldModel: params.worldModel,
      premises,
      hypotheses
    });
  }
}
