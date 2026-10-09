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
import { EpistemicFusionEngine, EvidencePolarity, AttributedEvidence, calculateEffectiveEvidenceWeight } from '../epistemic/fusion';
import { EvidenceDependencyGraph } from '../evidence/graph';
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
    if (input.counterEvidences) {
      for (const item of input.counterEvidences) {
        if (typeof item !== 'string' && 'evidenceId' in item && 'provenance' in item) {
          const parsedEv = EvidenceSchema.parse(item);
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
      let epistemicStatus: EpistemicStatus | undefined = pInput.epistemicStatus;
      const premiseEvidences: string[] = [...(pInput.evidenceIds || [])];
      const premiseProvenance: string[] = [...(pInput.provenance || [])];

      let graphConcept: CognitiveConcept | undefined;
      let graphRelation: CognitiveRelation | undefined;

      if (pInput.concept) {
        sourceType = 'CONCEPT';
        if (typeof pInput.concept === 'string') {
          sourceId = pInput.concept;
          graphConcept = this.conceptCache.get(sourceId) || graph?.getConcept(sourceId);
          if (graphConcept) {
            this.conceptCache.set(graphConcept.conceptId, graphConcept);
            if (!statement) statement = graphConcept.description || graphConcept.canonicalName;
            if (graphConcept.evidenceIds) premiseEvidences.push(...graphConcept.evidenceIds);
            if (graphConcept.provenance) premiseProvenance.push(...graphConcept.provenance);
          }
        } else {
          const c = CognitiveConceptSchema.parse(pInput.concept);
          sourceId = c.conceptId;
          graphConcept = c;
          this.conceptCache.set(c.conceptId, c);
          if (!statement) statement = c.description || c.canonicalName;
          if (c.evidenceIds) premiseEvidences.push(...c.evidenceIds);
          if (c.provenance) premiseProvenance.push(...c.provenance);
        }
      } else if (pInput.relation) {
        sourceType = 'RELATION';
        if (typeof pInput.relation === 'string') {
          sourceId = pInput.relation;
          graphRelation = this.relationCache.get(sourceId) || graph?.getRelation(sourceId);
          if (graphRelation) {
            this.relationCache.set(graphRelation.relationId, graphRelation);
            if (!statement) statement = `${graphRelation.subjectConceptId} ${graphRelation.predicate} ${graphRelation.objectConceptId}`;
            if (graphRelation.evidenceIds) premiseEvidences.push(...graphRelation.evidenceIds);
            if (graphRelation.provenance) premiseProvenance.push(...graphRelation.provenance);
          }
        } else {
          const r = CognitiveRelationSchema.parse(pInput.relation);
          sourceId = r.relationId;
          graphRelation = r;
          this.relationCache.set(r.relationId, r);
          if (!statement) statement = `${r.subjectConceptId} ${r.predicate} ${r.objectConceptId}`;
          if (r.evidenceIds) premiseEvidences.push(...r.evidenceIds);
          if (r.provenance) premiseProvenance.push(...r.provenance);
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

      if (!graphConcept && sourceType === 'CONCEPT' && sourceId) {
        graphConcept = this.conceptCache.get(sourceId) || graph?.getConcept(sourceId);
        if (graphConcept) {
          if (!statement) statement = graphConcept.description || graphConcept.canonicalName;
          if (graphConcept.evidenceIds) premiseEvidences.push(...graphConcept.evidenceIds);
          if (graphConcept.provenance) premiseProvenance.push(...graphConcept.provenance);
        }
      }
      if (!graphRelation && sourceType === 'RELATION' && sourceId) {
        graphRelation = this.relationCache.get(sourceId) || graph?.getRelation(sourceId);
        if (graphRelation) {
          if (!statement) statement = `${graphRelation.subjectConceptId} ${graphRelation.predicate} ${graphRelation.objectConceptId}`;
          if (graphRelation.evidenceIds) premiseEvidences.push(...graphRelation.evidenceIds);
          if (graphRelation.provenance) premiseProvenance.push(...graphRelation.provenance);
        }
      }

      if (!sourceId) {
        sourceId = `obs_${createHash('sha256').update(statement).digest('hex').substring(0, 10)}`;
      }

      for (const p of premiseProvenance) provenanceSet.add(p);

      // Compute premise confidence and epistemic status purely from Graph state (never caller pInput.confidence)
      let internalPremiseConfidence: number;
      const deduplicatedEvIds = Array.from(new Set(premiseEvidences)).sort();
      const validEvidenceWeights: number[] = [];
      for (const evId of deduplicatedEvIds) {
        const ev = this.evidenceCache.get(evId) || graph?.getEvidence(evId);
        if (ev) {
          validEvidenceWeights.push(calculateEffectiveEvidenceWeight(ev));
        }
      }

      if (graphConcept) {
        internalPremiseConfidence = graphConcept.confidence;
        if (!epistemicStatus) {
          epistemicStatus =
            graphConcept.verificationStatus === RepresentationVerificationStatus.VERIFIED
              ? EpistemicStatus.VERIFIED
              : graphConcept.verificationStatus === RepresentationVerificationStatus.CONTRADICTED
              ? EpistemicStatus.CONTRADICTED
              : graphConcept.verificationStatus === RepresentationVerificationStatus.SUPPORTED
              ? EpistemicStatus.BELIEVED
              : EpistemicStatus.HYPOTHESIS;
        }
      } else if (graphRelation) {
        internalPremiseConfidence = graphRelation.confidence;
        if (!epistemicStatus) {
          epistemicStatus =
            graphRelation.verificationStatus === RepresentationVerificationStatus.VERIFIED
              ? EpistemicStatus.VERIFIED
              : graphRelation.verificationStatus === RepresentationVerificationStatus.CONTRADICTED
              ? EpistemicStatus.CONTRADICTED
              : EpistemicStatus.BELIEVED;
        }
      } else if (validEvidenceWeights.length > 0) {
        internalPremiseConfidence = Number(
          (validEvidenceWeights.reduce((sum, w) => sum + w, 0) / validEvidenceWeights.length).toFixed(4)
        );
        if (!epistemicStatus) {
          epistemicStatus = internalPremiseConfidence >= 0.8 ? EpistemicStatus.BELIEVED : EpistemicStatus.HYPOTHESIS;
        }
      } else {
        // Ungrounded premise: neutral prior base rate from graph state, status UNKNOWN
        internalPremiseConfidence = 0.5;
        if (!epistemicStatus) {
          epistemicStatus = EpistemicStatus.UNKNOWN;
        }
      }

      const premiseSignature = `${sourceType}:${sourceId}:${statement}`;
      const premiseId = `prm_${createHash('sha256').update(premiseSignature).digest('hex').substring(0, 12)}`;

      const premiseObj = ReasoningPremiseSchema.parse({
        premiseId,
        statement,
        sourceType,
        sourceId,
        confidence: internalPremiseConfidence,
        epistemicStatus,
        evidenceIds: deduplicatedEvIds,
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

    // Formulate hypotheses - identity/content reference only, confidence derived from Graph state
    if (input.hypotheses && input.hypotheses.length > 0) {
      for (const h of input.hypotheses) {
        const hypSignature = `${h.statement}:${h.targetConceptId || ''}:${h.targetRelationId || ''}:${h.predicate || ''}`;
        const hypothesisId = h.hypothesisId || `hyp_${createHash('sha256').update(hypSignature).digest('hex').substring(0, 12)}`;

        let initialHypConfidence: number;
        if (h.targetConceptId && graph) {
          const c = graph.getConcept(h.targetConceptId);
          initialHypConfidence = c ? c.confidence : 0.5;
        } else if (h.targetRelationId && graph) {
          const r = graph.getRelation(h.targetRelationId);
          initialHypConfidence = r ? r.confidence : 0.5;
        } else {
          initialHypConfidence = 0.5;
        }

        const hypObj = ReasoningHypothesisSchema.parse({
          hypothesisId,
          statement: h.statement,
          targetConceptId: h.targetConceptId,
          targetRelationId: h.targetRelationId,
          predicate: h.predicate,
          confidence: initialHypConfidence,
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
        confidence: primaryPremise?.confidence ?? 0.5,
        status: EpistemicStatus.HYPOTHESIS,
        rationale: 'Hypothesis formed automatically from reasoning premises.'
      });
      loadedHypotheses.push(hypObj);
    }

    // Construct or validate inference steps - intermediate confidence derived internally
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

        const stepPremises = loadedPremises.filter(p => premiseIds.includes(p.premiseId));
        const intermediateConfidence = Number(
          (stepPremises.length > 0
            ? stepPremises.reduce((acc, p) => acc * (p.confidence !== undefined ? p.confidence : 0.5), 1.0)
            : 0.5
          ).toFixed(4)
        );

        const stepObj = InferenceStepSchema.parse({
          stepId,
          rule,
          description,
          premiseIds,
          assumptions,
          derivedHypothesisId,
          intermediateConfidence,
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
        intermediateConfidence: Number(loadedPremises.reduce((acc, p) => acc * (p.confidence !== undefined ? p.confidence : 0.5), 1.0).toFixed(4))
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
          const cachedEv = this.evidenceCache.get(item) || graph?.getEvidence(item);
          const computedWeight = cachedEv ? calculateEffectiveEvidenceWeight(cachedEv) : 1.0;
          loadedCounterEvidences.push({
            evidenceId: item,
            reason: 'Counter-evidence observed',
            weight: computedWeight
          });
        } else if ('evidenceId' in item && 'reason' in item) {
          const parsed = CounterEvidenceItemSchema.parse(item);
          if (item.weight === undefined) {
            const cachedEv = this.evidenceCache.get(parsed.evidenceId) || graph?.getEvidence(parsed.evidenceId);
            if (cachedEv) {
              parsed.weight = calculateEffectiveEvidenceWeight(cachedEv);
            }
          }
          loadedCounterEvidences.push(parsed);
        } else if ('evidenceId' in item) {
          const evId = (item as any).evidenceId;
          const cachedEv = this.evidenceCache.get(evId) || graph?.getEvidence(evId);
          const computedWeight = cachedEv ? calculateEffectiveEvidenceWeight(cachedEv) : 1.0;
          loadedCounterEvidences.push({
            evidenceId: evId,
            reason: 'Counter-evidence record',
            weight: computedWeight,
            sourceId: (item as any).sourceId
          });
        }
      }
    }

    const targetHypothesis = loadedHypotheses[0];

    // Gather counter-evidences recorded in graph for target concept or its generalizations/parents
    if (graph && targetHypothesis?.targetConceptId) {
      const allGraphEvidences = graph.getAllEvidences();
      const relatedIdsToCheck = new Set<string>([targetHypothesis.targetConceptId]);
      const relations = graph.getRelationsForConcept(targetHypothesis.targetConceptId);
      for (const r of relations) {
        if (
          r.subjectConceptId === targetHypothesis.targetConceptId &&
          (r.predicate === CognitiveRelationPredicate.INSTANCE_OF ||
           r.predicate === CognitiveRelationPredicate.SPECIALIZES ||
           r.predicate === CognitiveRelationPredicate.IS_A)
        ) {
          relatedIdsToCheck.add(r.objectConceptId);
        }
      }

      for (const ev of allGraphEvidences) {
        const contradictingReps = ev.provenance?.contradictingRepresentationIds || [];
        if (contradictingReps.some(id => relatedIdsToCheck.has(id))) {
          if (!loadedCounterEvidences.some(c => c.evidenceId === ev.evidenceId)) {
            loadedCounterEvidences.push({
              evidenceId: ev.evidenceId,
              reason: `Empirical contradiction recorded in graph against ${contradictingReps.filter(id => relatedIdsToCheck.has(id)).join(', ')}`,
              weight: calculateEffectiveEvidenceWeight(ev)
            });
          }
        }
      }

      // Check generalizations relevant to target concept (direct, hierarchical, or structural)
      const relevantGens = graph.findGeneralizationsByConcept(targetHypothesis.targetConceptId);
      for (const gen of relevantGens) {
        const validatedGen = graph.validateGeneralizationInvariant(gen);
        if (validatedGen.verificationStatus === RepresentationVerificationStatus.CONTRADICTED && (validatedGen.supportingEvidence?.length || 0) >= 2) {
          const evIds = Array.from(new Set([...(validatedGen.evidenceIds || []), ...validatedGen.supportingEvidence]));
          for (const evId of evIds) {
            const ev = graph.getEvidence(evId);
            if (ev && !loadedCounterEvidences.some(c => c.evidenceId === evId)) {
              loadedCounterEvidences.push({
                evidenceId: evId,
                reason: `Inherited empirical contradiction from generalization ${validatedGen.generalizationId}: ${validatedGen.pattern}`,
                weight: calculateEffectiveEvidenceWeight(ev) * validatedGen.confidence,
                sourceId: ev.sourceId,
                generalizationId: validatedGen.generalizationId
              });
            }
          }
        } else if (validatedGen.verificationStatus === RepresentationVerificationStatus.SUPPORTED || validatedGen.verificationStatus === RepresentationVerificationStatus.VERIFIED) {
          const evIds = Array.from(new Set([...(validatedGen.evidenceIds || []), ...validatedGen.supportingEvidence]));
          for (const evId of evIds) {
            gatheredEvidenceIds.add(evId);
          }
        }
      }
    }

    // Alternative hypotheses parsing - uncommitted baseline prior 0.5, never caller-provided confidence
    const loadedAlternatives: AlternativeHypothesis[] = [];
    if (input.alternatives) {
      for (const alt of input.alternatives) {
        const hypothesisId = alt.hypothesisId || `alt_${createHash('sha256').update(alt.statement).digest('hex').substring(0, 10)}`;
        loadedAlternatives.push(
          AlternativeHypothesisSchema.parse({
            hypothesisId,
            statement: alt.statement,
            status: alt.status || EpistemicStatus.HYPOTHESIS,
            confidence: 0.5,
            reason: alt.reason || 'Candidate alternative hypothesis'
          })
        );
      }
    }

    // -------------------------------------------------------------
    // 4. PHASE 5: EPISTEMIC FUSION & ENDOGENOUS EVALUATION
    // -------------------------------------------------------------
    const minThreshold = input.minEvidenceThreshold !== undefined ? input.minEvidenceThreshold : 0.5;

    const supportingEvidenceArray = Array.from(gatheredEvidenceIds).sort();

    let fusionOpinion: SubjectiveOpinion | undefined;
    let effectiveSupportMass = 0;
    let effectiveConflictMass = 0;
    const attributedEvidences: AttributedEvidence[] = [];
    let validEvidencesCount = 0;

    const sanitizeEvidenceForFusion = (evidence: Evidence): Evidence => {
      if (!evidence.provenance?.derivedFrom || evidence.provenance.derivedFrom.length === 0) {
        return evidence;
      }
      // Preserve known upstream evidence identifiers, including opaque parent
      // IDs used by external producers, while excluding storage-only cell IDs.
      const realAncestors = evidence.provenance.derivedFrom.filter(id =>
        id.startsWith('ev_') || id.startsWith('obs_') || id.startsWith('info_') ||
        id.startsWith('exp_') || id.startsWith('kn_') || id.startsWith('parent_')
      );
      if (realAncestors.length === evidence.provenance.derivedFrom.length) return evidence;
      return { ...evidence, provenance: { ...evidence.provenance, derivedFrom: realAncestors } };
    };

    const counterEvidenceIds = new Set(loadedCounterEvidences.map(c => c.evidenceId));
    for (const evId of supportingEvidenceArray) {
      if (counterEvidenceIds.has(evId)) continue; // skip if it's a counter evidence
      let ev = this.evidenceCache.get(evId) || graph?.getEvidence(evId);
      if (!ev) {
        ev = {
          evidenceId: evId,
          sourceId: input.originatingCellId || 'cell_origin',
          timestamp: '2026-01-01T00:00:00.000Z',
          confidence: 0.8,
          provenance: {
            sourceId: input.originatingCellId || 'cell_origin',
            timestamp: '2026-01-01T00:00:00.000Z'
          },
          context: input.context
        };
        this.evidenceCache.set(evId, ev);
      }
      if (ev) {
        this.evidenceCache.set(evId, ev);
        const sanitized = sanitizeEvidenceForFusion(ev);
        attributedEvidences.push({ evidence: sanitized, polarity: EvidencePolarity.SUPPORTS, weight: calculateEffectiveEvidenceWeight(sanitized) });
        if (ev.provenance?.sourceId) provenanceSet.add(ev.provenance.sourceId);
        validEvidencesCount++;
      }
    }

    for (const counterEv of loadedCounterEvidences) {
      let ev = this.evidenceCache.get(counterEv.evidenceId) || graph?.getEvidence(counterEv.evidenceId);
      if (!ev) {
        ev = {
          evidenceId: counterEv.evidenceId,
          sourceId: counterEv.sourceId || input.originatingCellId || 'cell_origin',
          timestamp: '2026-01-01T00:00:00.000Z',
          confidence: counterEv.weight || 0.8,
          provenance: {
            sourceId: counterEv.sourceId || input.originatingCellId || 'cell_origin',
            timestamp: '2026-01-01T00:00:00.000Z'
          },
          context: input.context
        };
        this.evidenceCache.set(counterEv.evidenceId, ev);
      }
      if (ev) {
        this.evidenceCache.set(counterEv.evidenceId, ev);
        const sanitized = sanitizeEvidenceForFusion(ev);
        attributedEvidences.push({ evidence: sanitized, polarity: EvidencePolarity.CONTRADICTS, weight: counterEv.weight });
        if (ev.provenance?.sourceId) provenanceSet.add(ev.provenance.sourceId);
        validEvidencesCount++;
      }
    }

    if (attributedEvidences.length > 0) {
      try {
        const fusionEngine = new EpistemicFusionEngine();
        const edg = graph?.getEDG() || new EvidenceDependencyGraph();
        const fusionResult = fusionEngine.fuse(attributedEvidences, input.context, edg);
        if (fusionResult.fusedState && fusionResult.fusedState.opinion) {
          fusionOpinion = fusionResult.fusedState.opinion;
          effectiveSupportMass = fusionResult.effectiveSupportMass;
          effectiveConflictMass = fusionResult.effectiveConflictMass;
        }
      } catch {
        // Fallback to undefined opinion if fusion fails
      }
    }

    // Epistemic weighting: contradiction occurs only when counter-evidence mass and disbelief decisively outweigh support
    let hasContradiction = false;
    let contradictionReason = '';

    if (loadedCounterEvidences.length > 0) {
      const isConflictDecisive = fusionOpinion
        ? (fusionOpinion.disbelief > fusionOpinion.belief && (effectiveConflictMass >= minThreshold || loadedCounterEvidences.length >= 2))
        : (effectiveConflictMass >= minThreshold || loadedCounterEvidences.length >= 2);

      if (isConflictDecisive) {
        hasContradiction = true;
        contradictionReason = `Contradicted by ${loadedCounterEvidences.length} counter-evidence record(s) (effective conflict mass: ${effectiveConflictMass.toFixed(2)}${fusionOpinion ? `, disbelief: ${fusionOpinion.disbelief.toFixed(2)}` : ''}): ${loadedCounterEvidences.map(c => c.reason).join('; ')}`;
      }
    }

    // Check if target concept itself is marked as CONTRADICTED in CognitiveGraph with valid grounded evidence
    if (!hasContradiction && graph && targetHypothesis?.targetConceptId) {
      const targetConcept = graph.getConcept(targetHypothesis.targetConceptId);
      if (targetConcept && targetConcept.verificationStatus === RepresentationVerificationStatus.CONTRADICTED) {
        const conceptEvidences = graph.getAllEvidences().filter(ev =>
          ev.provenance?.contradictingRepresentationIds?.includes(targetConcept.conceptId) &&
          (ev.sourceId || ev.provenance?.sourceId)
        );
        if (conceptEvidences.length > 0) {
          hasContradiction = true;
          contradictionReason = `Target concept ${targetHypothesis.targetConceptId} (${targetConcept.canonicalName}) is marked as CONTRADICTED in CognitiveGraph with ${conceptEvidences.length} valid evidence record(s)`;
        }
      }
    }

    // Check if premises contain contradicted items
    if (!hasContradiction) {
      const contradictedPremise = loadedPremises.find(
        p => p.epistemicStatus === EpistemicStatus.CONTRADICTED
      );
      if (contradictedPremise) {
        hasContradiction = true;
        contradictionReason = `Premise "${contradictedPremise.statement}" is marked as CONTRADICTED.`;
      }
    }

    // Check if graph has contradicting relations
    if (!hasContradiction && graph && targetHypothesis?.targetConceptId) {
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

    if (hasContradiction) {
      finalEpistemicStatus = EpistemicStatus.CONTRADICTED;
      finalVerificationStatus = RepresentationVerificationStatus.CONTRADICTED;
      verificationConfidence = fusionOpinion ? fusionOpinion.disbelief : 0.0;
      verificationRationale = contradictionReason;
      
      if (fusionOpinion) {
        uncertainty = { ...fusionOpinion };
      } else {
        uncertainty = {
          belief: 0.0,
          disbelief: 0.0,
          uncertainty: 1.0,
          baseRate: 0.5
        };
      }
      if (targetHypothesis) {
        targetHypothesis.status = EpistemicStatus.CONTRADICTED;
        const targetConcept = graph && targetHypothesis.targetConceptId ? graph.getConcept(targetHypothesis.targetConceptId) : undefined;
        const priorH = targetConcept ? targetConcept.confidence : (fusionOpinion ? fusionOpinion.baseRate : 0.5);
        const d = fusionOpinion ? fusionOpinion.disbelief : 0.75;
        const relevantGens = graph && targetHypothesis.targetConceptId ? graph.findGeneralizationsByConcept(targetHypothesis.targetConceptId) : [];
        const genDampener = relevantGens
          .filter(g => g.verificationStatus === RepresentationVerificationStatus.CONTRADICTED && (g.supportingEvidence?.length || 0) >= 2)
          .reduce((acc, g) => acc * (1.0 - 0.25 * g.confidence), 1.0);

        const totalMass = effectiveConflictMass + effectiveSupportMass;
        const conflictRatio = totalMass > 0 ? effectiveConflictMass / (totalMass + 0.5) : 0.7;

        targetHypothesis.confidence = Number(Math.max(0.01, Math.min(1.0, priorH * (1.0 - d) * (1.0 - 0.2 * conflictRatio) * genDampener)).toFixed(4));
        targetHypothesis.rationale = contradictionReason;
      }
    } else if (!fusionOpinion || validEvidencesCount === 0 || fusionOpinion.belief < minThreshold) {
      finalEpistemicStatus = EpistemicStatus.UNKNOWN;
      finalVerificationStatus = RepresentationVerificationStatus.PENDING;
      verificationConfidence = fusionOpinion ? fusionOpinion.belief : 0.0;
      verificationRationale = `Insufficient or weak evidence: ${validEvidencesCount} items, belief ${fusionOpinion ? fusionOpinion.belief.toFixed(2) : 0.0}. Result is UNKNOWN.`;
      if (fusionOpinion) {
        uncertainty = { ...fusionOpinion };
      } else {
        uncertainty = {
          belief: 0.0,
          disbelief: 0.0,
          uncertainty: 1.0,
          baseRate: 0.5
        };
      }
      if (targetHypothesis) {
        targetHypothesis.status = EpistemicStatus.UNKNOWN;
        const targetConcept = graph && targetHypothesis.targetConceptId ? graph.getConcept(targetHypothesis.targetConceptId) : undefined;
        const priorH = targetConcept ? targetConcept.confidence : (fusionOpinion ? fusionOpinion.baseRate : 0.5);
        const projBelief = fusionOpinion
          ? (fusionOpinion.belief + fusionOpinion.baseRate * fusionOpinion.uncertainty * priorH)
          : (priorH * 0.5);
        targetHypothesis.confidence = Number(Math.max(0.01, Math.min(1.0, projBelief)).toFixed(4));
        targetHypothesis.rationale = verificationRationale;
      }
    } else {
      // High belief is NOT verification.
      finalEpistemicStatus =
        fusionOpinion.belief >= 0.9
          ? EpistemicStatus.BELIEVED
          : EpistemicStatus.HYPOTHESIS;

      finalVerificationStatus = RepresentationVerificationStatus.SUPPORTED;
      verificationConfidence = fusionOpinion.belief;
      verificationRationale = `Hypothesis supported with evidence (${validEvidencesCount} valid items, fused belief ${fusionOpinion.belief.toFixed(2)}).`;
      uncertainty = { ...fusionOpinion };
      if (targetHypothesis) {
        targetHypothesis.status = finalEpistemicStatus;
        const targetConcept = graph && targetHypothesis.targetConceptId ? graph.getConcept(targetHypothesis.targetConceptId) : undefined;
        const priorH = targetConcept ? targetConcept.confidence : 0.5;
        const relevantGens = graph && targetHypothesis.targetConceptId ? graph.findGeneralizationsByConcept(targetHypothesis.targetConceptId) : [];
        const genBoost = relevantGens
          .filter(g => g.verificationStatus === RepresentationVerificationStatus.SUPPORTED || g.verificationStatus === RepresentationVerificationStatus.VERIFIED)
          .reduce((max, g) => Math.max(max, g.confidence), 0);

        const fusedConfidence = Math.max(priorH, fusionOpinion.belief, genBoost > 0 ? (fusionOpinion.belief * 0.7 + genBoost * 0.3) : fusionOpinion.belief);
        targetHypothesis.confidence = Number(Math.min(0.99, Math.max(0.10, fusedConfidence)).toFixed(4));
        targetHypothesis.rationale = verificationRationale;
      }
    }

    // Evaluate remaining loaded hypotheses deterministically from Graph state
    for (let i = 1; i < loadedHypotheses.length; i++) {
      const h = loadedHypotheses[i];
      if (h.targetConceptId && graph) {
        const c = graph.getConcept(h.targetConceptId);
        if (c) {
          h.confidence = c.confidence;
          h.status = c.verificationStatus === RepresentationVerificationStatus.CONTRADICTED
            ? EpistemicStatus.CONTRADICTED
            : (c.verificationStatus === RepresentationVerificationStatus.VERIFIED
              ? EpistemicStatus.VERIFIED
              : (c.verificationStatus === RepresentationVerificationStatus.SUPPORTED
                ? EpistemicStatus.BELIEVED
                : EpistemicStatus.HYPOTHESIS));
        }
      }
    }

    // -------------------------------------------------------------
    // ENDOGENOUS ALTERNATIVE HYPOTHESES EVALUATION & RANKING
    // -------------------------------------------------------------
    let selectedAlternative: AlternativeHypothesis | undefined;
    const evaluatedAlternatives: AlternativeHypothesis[] = [];

    for (const alt of loadedAlternatives) {
      let altConfidence: number;
      let altStatus: EpistemicStatus;
      let altReason: string;

      if (hasContradiction) {
        // Epistemic reallocation driven entirely by contradiction in graph state
        const totalMass = effectiveConflictMass + effectiveSupportMass;
        const conflictRatio = totalMass > 0 ? effectiveConflictMass / (totalMass + 0.5) : 0.7;
        const disbelief = fusionOpinion ? fusionOpinion.disbelief : 0.75;

        // Baseline prior is uncommitted baseline (0.50), NEVER caller's alt.confidence.
        // Disbelief and conflict mass in the refuted primary hypothesis shift belief mass to alternative.
        const reallocatedBoost = conflictRatio * (1.0 - 0.50);
        const internalConfidence = 0.50 + reallocatedBoost * (0.8 + 0.2 * disbelief);

        altConfidence = Number(Math.min(0.95, Math.max(0.10, internalConfidence)).toFixed(4));
        altStatus = altConfidence >= 0.70 ? EpistemicStatus.BELIEVED : EpistemicStatus.HYPOTHESIS;

        // Reason generated by reasoning engine from graph state, NEVER from caller-supplied alt.reason
        altReason = `Promoted endogenously based on graph state: primary hypothesis contradicted with conflict ratio ${conflictRatio.toFixed(2)} and disbelief ${disbelief.toFixed(2)}`;
      } else {
        // When primary hypothesis is not contradicted, alternative remains at unevidenced baseline prior
        const fusedBelief = fusionOpinion ? fusionOpinion.belief : 0.5;
        altConfidence = Number(Math.max(0.05, Math.min(0.50, 0.50 * (1.0 - fusedBelief * 0.5))).toFixed(4));
        altStatus = EpistemicStatus.HYPOTHESIS;
        altReason = 'Secondary alternative retained without active contradiction';
      }

      evaluatedAlternatives.push({
        hypothesisId: alt.hypothesisId,
        statement: alt.statement,
        status: altStatus,
        confidence: altConfidence,
        reason: altReason
      });
    }

    // Rank alternatives strictly by confidence descending, then by canonical hypothesisId ascending.
    // NEVER uses alt.reason to determine choice!
    evaluatedAlternatives.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return a.hypothesisId.localeCompare(b.hypothesisId);
    });

    if (hasContradiction && evaluatedAlternatives.length > 0) {
      selectedAlternative = evaluatedAlternatives[0];
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
      alternatives: evaluatedAlternatives,
      selectedAlternative,
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
        status: h.status,
        confidence: h.confidence
      })),
      evidenceIds: supportingEvidenceArray,
      counterEvidenceIds: sortedCounterEvidence.map(c => c.evidenceId),
      assumptions: sortedAssumptions,
      alternatives: evaluatedAlternatives.map(a => ({
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
      const counterEvidences = chain.verification.counterEvidenceIds
        .map(id => this.evidenceCache.get(id) || graph?.getEvidence(id)!)
        .filter(Boolean);
      return {
        elementId,
        elementType: 'HYPOTHESIS',
        premises: chain.premises,
        inferenceSteps: chain.inferenceChain.filter(s => s.derivedHypothesisId === elementId),
        hypotheses: [hypothesis],
        evidences: [...supportingEvidences, ...counterEvidences],
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

    // 9. Is it a Generalization?
    const gen = graph?.getGeneralization(elementId);
    if (gen) {
      const evidences = (gen.supportingEvidence || [])
        .map(id => this.evidenceCache.get(id) || graph?.getEvidence(id)!)
        .filter(Boolean);
      return {
        elementId,
        elementType: 'GENERALIZATION',
        generalization: gen,
        premises: [],
        inferenceSteps: [],
        hypotheses: chain.hypotheses.filter(h => h.targetConceptId && gen.sourceConceptIds.includes(h.targetConceptId)),
        evidences,
        epistemicStatus: gen.verificationStatus === RepresentationVerificationStatus.VERIFIED
          ? EpistemicStatus.VERIFIED
          : (gen.verificationStatus === RepresentationVerificationStatus.CONTRADICTED ? EpistemicStatus.CONTRADICTED : EpistemicStatus.BELIEVED)
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

