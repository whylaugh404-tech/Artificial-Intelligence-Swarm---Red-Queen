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
  EpistemicStatus,
  SubjectiveOpinion,
  SubjectiveOpinionSchema,
  freezeContext
} from '../epistemic/types';
import {
  CompositionConstraint,
  CompositionConstraintSchema
} from '../../core/composition/types';
import { CognitiveUnderstanding, CognitiveUnderstandingSchema } from '../understanding/types';
import { Evidence } from '../evidence/types';
import { CognitiveGraph } from '../representation/graph';
import { EpistemicFusionEngine, EvidencePolarity, AttributedEvidence, calculateEffectiveEvidenceWeight } from '../epistemic/fusion';
import { EvidenceDependencyGraph } from '../evidence/graph';
import {
  WorldModel,
  WorldModelCompositionInput,
  WorldModelProcessRef,
  WorldModelSchema,
  WorldModelTrace
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


export function resolveEvidencePolarity(
  evidence: Evidence,
  target: CognitiveConcept | CognitiveRelation
): EvidencePolarity {
  const targetId = 'conceptId' in target ? target.conceptId : target.relationId;
  
  if (evidence.provenance?.supportingRepresentationIds?.includes(targetId)) {
    return EvidencePolarity.SUPPORTS;
  }
  
  if (evidence.provenance?.contradictingRepresentationIds?.includes(targetId)) {
    return EvidencePolarity.CONTRADICTS;
  }
  
  return EvidencePolarity.NEUTRAL;
}

export class WorldModelEngine {
  // Representation caches for traceability and lookups across composed models
  private readonly conceptCache = new Map<string, CognitiveConcept>();
  private readonly relationCache = new Map<string, CognitiveRelation>();
  private readonly understandingCache = new Map<string, CognitiveUnderstanding>();
  private readonly evidenceCache = new Map<string, Evidence>();

  constructor(private readonly defaultGraph?: CognitiveGraph) {}

  public compose(
    input: WorldModelCompositionInput,
    graphOverride?: CognitiveGraph
  ): WorldModel {
    const graph = graphOverride || input.graph || this.defaultGraph;

    const loadedConcepts = new Map<string, CognitiveConcept>();
    const loadedRelations = new Map<string, CognitiveRelation>();
    const loadedUnderstandings = new Map<string, CognitiveUnderstanding>();

    // 1. Process explicit CognitiveUnderstandings
    const inputUnderstandings = input.understandings || [];
    for (const rawUnd of inputUnderstandings) {
      const und = CognitiveUnderstandingSchema.parse(rawUnd);
      loadedUnderstandings.set(und.understandingId, und);
      this.understandingCache.set(und.understandingId, und);

      // Inspect dependencies
      for (const dep of und.dependencies) {
        if (dep.sourceType === 'CONCEPT') {
          let concept = loadedConcepts.get(dep.sourceId) || this.conceptCache.get(dep.sourceId);
          if (!concept && graph) {
            concept = graph.getConcept(dep.sourceId);
          }
          if (!concept) {
            // Check if passed in input.concepts
            const foundInInput = (input.concepts || []).find(c => c.conceptId === dep.sourceId);
            if (foundInInput) {
              concept = foundInInput;
            }
          }
          if (concept) {
            loadedConcepts.set(concept.conceptId, concept);
            this.conceptCache.set(concept.conceptId, concept);
          } else if (graph) {
            throw new Error(
              `Invalid reference: Concept "${dep.sourceId}" in understanding "${und.understandingId}" not found in CognitiveGraph`
            );
          }
        } else if (dep.sourceType === 'RELATION') {
          let rel = loadedRelations.get(dep.sourceId) || this.relationCache.get(dep.sourceId);
          if (!rel && graph) {
            rel = graph.getRelation(dep.sourceId);
          }
          if (!rel) {
            const foundInInput = (input.relations || []).find(
              r => typeof r !== 'string' && r.relationId === dep.sourceId
            ) as CognitiveRelation | undefined;
            if (foundInInput) {
              rel = foundInInput;
            }
          }
          if (rel) {
            loadedRelations.set(rel.relationId, rel);
            this.relationCache.set(rel.relationId, rel);
          } else if (graph) {
            throw new Error(
              `Invalid reference: Relation "${dep.sourceId}" in understanding "${und.understandingId}" not found in CognitiveGraph`
            );
          }
        } else if (dep.sourceType === 'EVIDENCE') {
          if (graph) {
            const ev = graph.getEvidence(dep.sourceId);
            if (ev) this.evidenceCache.set(ev.evidenceId, ev);
          }
        }
      }

      // Collect evidence objects if graph available
      if (graph && und.evidenceIds) {
        for (const eid of und.evidenceIds) {
          const ev = graph.getEvidence(eid);
          if (ev) this.evidenceCache.set(ev.evidenceId, ev);
        }
      }
    }

    // 2. Process explicit general concepts
    if (input.concepts) {
      for (const rawConcept of input.concepts) {
        const concept = CognitiveConceptSchema.parse(rawConcept);
        const existing = loadedConcepts.get(concept.conceptId);
        if (existing) {
          if (
            existing.canonicalName !== concept.canonicalName ||
            existing.description !== concept.description ||
            existing.category !== concept.category
          ) {
            throw new Error(
              `Duplicate representation with conflicting definition for concept "${concept.conceptId}"`
            );
          }
        }
        loadedConcepts.set(concept.conceptId, concept);
        this.conceptCache.set(concept.conceptId, concept);
      }
    }

    // Helper to resolve and cache concepts
    const resolveConcept = (item: string | CognitiveConcept): CognitiveConcept => {
      if (typeof item === 'string') {
        let concept = loadedConcepts.get(item) || this.conceptCache.get(item);
        if (!concept && graph) {
          concept = graph.getConcept(item);
        }
        if (!concept) {
          throw new Error(`Invalid reference: Concept "${item}" not found in CognitiveGraph or inputs`);
        }
        loadedConcepts.set(concept.conceptId, concept);
        this.conceptCache.set(concept.conceptId, concept);
        return concept;
      } else {
        const concept = CognitiveConceptSchema.parse(item);
        const existing = loadedConcepts.get(concept.conceptId);
        if (existing) {
          if (
            existing.canonicalName !== concept.canonicalName ||
            existing.description !== concept.description ||
            existing.category !== concept.category
          ) {
            throw new Error(
              `Duplicate representation with conflicting definition for concept "${concept.conceptId}"`
            );
          }
        }
        loadedConcepts.set(concept.conceptId, concept);
        this.conceptCache.set(concept.conceptId, concept);
        return concept;
      }
    };

    // 3. Track explicit role categorization
    const explicitEntities = new Set<string>();
    const explicitStates = new Set<string>();
    const explicitEvents = new Set<string>();
    const explicitProcesses = new Map<string, WorldModelProcessRef>();

    if (input.entities) {
      for (const item of input.entities) {
        const c = resolveConcept(item);
        explicitEntities.add(c.conceptId);
      }
    }

    if (input.states) {
      for (const item of input.states) {
        const c = resolveConcept(item);
        if (explicitEntities.has(c.conceptId)) {
          throw new Error(
            `Duplicate representation with conflicting roles: concept "${c.conceptId}" cannot be both ENTITY and STATE`
          );
        }
        explicitStates.add(c.conceptId);
      }
    }

    if (input.events) {
      for (const item of input.events) {
        const c = resolveConcept(item);
        if (explicitEntities.has(c.conceptId) || explicitStates.has(c.conceptId)) {
          throw new Error(
            `Duplicate representation with conflicting roles: concept "${c.conceptId}" cannot be assigned multiple conflicting roles`
          );
        }
        explicitEvents.add(c.conceptId);
      }
    }

    if (input.processes) {
      for (const item of input.processes) {
        let conceptId: string;
        let steps: string[] | undefined;
        if (typeof item === 'string' || 'canonicalName' in item) {
          const c = resolveConcept(item);
          conceptId = c.conceptId;
        } else {
          const c = resolveConcept(item.conceptId);
          conceptId = c.conceptId;
          steps = item.steps;
        }

        if (
          explicitEntities.has(conceptId) ||
          explicitStates.has(conceptId) ||
          explicitEvents.has(conceptId)
        ) {
          throw new Error(
            `Duplicate representation with conflicting roles: concept "${conceptId}" cannot be assigned multiple conflicting roles`
          );
        }
        explicitProcesses.set(conceptId, { conceptId, steps });
      }
    }

    // Any remaining concepts in loadedConcepts default to ENTITY
    for (const [cid] of loadedConcepts) {
      if (
        !explicitStates.has(cid) &&
        !explicitEvents.has(cid) &&
        !explicitProcesses.has(cid)
      ) {
        explicitEntities.add(cid);
      }
    }

    // 4. Process Relations
    const resolveRelation = (item: string | CognitiveRelation): CognitiveRelation => {
      if (typeof item === 'string') {
        let rel = loadedRelations.get(item) || this.relationCache.get(item);
        if (!rel && graph) {
          rel = graph.getRelation(item);
        }
        if (!rel) {
          throw new Error(`Invalid reference: Relation "${item}" not found in CognitiveGraph or inputs`);
        }
        loadedRelations.set(rel.relationId, rel);
        this.relationCache.set(rel.relationId, rel);
        return rel;
      } else {
        const rel = CognitiveRelationSchema.parse(item);
        const existing = loadedRelations.get(rel.relationId);
        if (existing) {
          if (
            existing.predicate !== rel.predicate ||
            existing.subjectConceptId !== rel.subjectConceptId ||
            existing.objectConceptId !== rel.objectConceptId
          ) {
            throw new Error(
              `Duplicate representation with conflicting definition for relation "${rel.relationId}"`
            );
          }
        }
        loadedRelations.set(rel.relationId, rel);
        this.relationCache.set(rel.relationId, rel);
        return rel;
      }
    };

    if (input.relations) {
      for (const item of input.relations) {
        resolveRelation(item);
      }
    }

    // Validate relation endpoints
    for (const rel of loadedRelations.values()) {
      let subj = loadedConcepts.get(rel.subjectConceptId);
      if (!subj && graph) {
        subj = graph.getConcept(rel.subjectConceptId);
        if (subj) {
          loadedConcepts.set(subj.conceptId, subj);
          this.conceptCache.set(subj.conceptId, subj);
          if (!explicitStates.has(subj.conceptId) && !explicitEvents.has(subj.conceptId) && !explicitProcesses.has(subj.conceptId)) {
            explicitEntities.add(subj.conceptId);
          }
        }
      }
      let obj = loadedConcepts.get(rel.objectConceptId);
      if (!obj && graph) {
        obj = graph.getConcept(rel.objectConceptId);
        if (obj) {
          loadedConcepts.set(obj.conceptId, obj);
          this.conceptCache.set(obj.conceptId, obj);
          if (!explicitStates.has(obj.conceptId) && !explicitEvents.has(obj.conceptId) && !explicitProcesses.has(obj.conceptId)) {
            explicitEntities.add(obj.conceptId);
          }
        }
      }

      if (!subj || !obj) {
        throw new Error(
          `Invalid reference: Relation "${rel.relationId}" references unknown endpoint "${rel.subjectConceptId}" or "${rel.objectConceptId}"`
        );
      }
    }

    // Categorize relations by semantic nature
    const causalRelationsSet = new Set<string>();
    const dependenciesSet = new Set<string>();
    const structuralRelationsSet = new Set<string>();

    for (const rel of loadedRelations.values()) {
      if (rel.predicate === CognitiveRelationPredicate.CAUSES) {
        causalRelationsSet.add(rel.relationId);
      } else if (
        rel.predicate === CognitiveRelationPredicate.DEPENDS_ON ||
        rel.predicate === CognitiveRelationPredicate.REQUIRES
      ) {
        dependenciesSet.add(rel.relationId);
      } else {
        structuralRelationsSet.add(rel.relationId);
      }
    }

    // 5. Process Constraints
    const constraintsMap = new Map<string, CompositionConstraint>();
    if (input.constraints) {
      for (const c of input.constraints) {
        const parsedConstraint = CompositionConstraintSchema.parse(c);
        constraintsMap.set(parsedConstraint.constraintId, parsedConstraint);
      }
    }

    // 6. Aggregate Evidence and Provenance
    const evidenceIdsSet = new Set<string>();
    const provenanceSet = new Set<string>();
    provenanceSet.add(input.originatingCellId);

    for (const und of loadedUnderstandings.values()) {
      for (const p of und.provenance) provenanceSet.add(p);
      for (const e of und.evidenceIds) evidenceIdsSet.add(e);
    }

    for (const c of loadedConcepts.values()) {
      for (const p of c.provenance) provenanceSet.add(p);
      if (c.evidenceIds) {
        for (const e of c.evidenceIds) evidenceIdsSet.add(e);
      }
    }

    for (const r of loadedRelations.values()) {
      for (const p of r.provenance) provenanceSet.add(p);
      if (r.evidenceIds) {
        for (const e of r.evidenceIds) evidenceIdsSet.add(e);
      }
    }

    // 7. Determine Epistemic Status & Conflicts
    let hasConflict = false;

    // Check concept statuses
    for (const c of loadedConcepts.values()) {
      if (c.verificationStatus === RepresentationVerificationStatus.CONTRADICTED) {
        hasConflict = true;
        break;
      }
    }

    // Check relation statuses and CONTRADICTS predicates
    if (!hasConflict) {
      for (const r of loadedRelations.values()) {
        if (
          r.verificationStatus === RepresentationVerificationStatus.CONTRADICTED ||
          r.predicate === CognitiveRelationPredicate.CONTRADICTS
        ) {
          hasConflict = true;
          break;
        }
      }
    }

    // Check understanding statuses
    if (!hasConflict) {
      for (const u of loadedUnderstandings.values()) {
        if (u.verificationStatus === RepresentationVerificationStatus.CONTRADICTED) {
          hasConflict = true;
          break;
        }
      }
    }

    let verificationStatus: RepresentationVerificationStatus;
    let epistemicStatus: EpistemicStatus;

    if (hasConflict) {
      verificationStatus = RepresentationVerificationStatus.CONTRADICTED;
      epistemicStatus = EpistemicStatus.CONTRADICTED;
    } else if (evidenceIdsSet.size > 0) {
      const allConceptsVerified = Array.from(loadedConcepts.values()).every(
        c => c.verificationStatus === RepresentationVerificationStatus.VERIFIED
      );
      const allRelationsVerified = Array.from(loadedRelations.values()).every(
        r => r.verificationStatus === RepresentationVerificationStatus.VERIFIED
      );
      const allUnderstandingsVerified = Array.from(loadedUnderstandings.values()).every(
        u => u.verificationStatus === RepresentationVerificationStatus.VERIFIED
      );

      if (
        loadedConcepts.size > 0 &&
        allConceptsVerified &&
        allRelationsVerified &&
        (loadedUnderstandings.size === 0 || allUnderstandingsVerified)
      ) {
        verificationStatus = RepresentationVerificationStatus.VERIFIED;
        epistemicStatus = EpistemicStatus.VERIFIED;
      } else {
        verificationStatus = RepresentationVerificationStatus.SUPPORTED;
        epistemicStatus = EpistemicStatus.BELIEVED;
      }
    } else {
      verificationStatus = RepresentationVerificationStatus.PENDING;
      epistemicStatus = EpistemicStatus.HYPOTHESIS;
    }

    // 8. Epistemic Uncertainty (Subjective Opinion)
    let uncertainty: SubjectiveOpinion;

    if (input.uncertainty) {
      uncertainty = SubjectiveOpinionSchema.parse(input.uncertainty);
    } else {
      let fusionOpinion: SubjectiveOpinion | undefined;
      
      try {
        const fusionEngine = new EpistemicFusionEngine();
        const edg = graph?.getEDG() || new EvidenceDependencyGraph();
        const attributedEvidences: AttributedEvidence[] = [];
        for (const c of loadedConcepts.values()) {
          for (const evId of c.evidenceIds || []) {
            const ev = graph?.getEvidence(evId);
            if (!ev) continue;
            const polarity = resolveEvidencePolarity(ev, c);
            attributedEvidences.push({
              evidence: ev,
              polarity,
              weight: calculateEffectiveEvidenceWeight(ev)
            });
          }
        }
        for (const r of loadedRelations.values()) {
          for (const evId of r.evidenceIds || []) {
            const ev = graph?.getEvidence(evId);
            if (!ev) continue;
            const polarity = resolveEvidencePolarity(ev, r);
            attributedEvidences.push({
              evidence: ev,
              polarity,
              weight: calculateEffectiveEvidenceWeight(ev)
            });
          }
        }
        
        if (attributedEvidences.length > 0) {
          const fusionResult = fusionEngine.fuse(attributedEvidences, input.context, edg);
          if (fusionResult.fusedState && fusionResult.fusedState.opinion) {
            fusionOpinion = fusionResult.fusedState.opinion;
          }
        }
      } catch (err) {
        console.error("FUSION ERROR:", err);
        // Keep undefined if fusion fails
      }

      if (fusionOpinion) {
        uncertainty = { ...fusionOpinion };
      } else {
        // Requirement 3: If evidence is unavailable or fusion yields no opinion, return UNKNOWN
        uncertainty = { belief: 0.0, disbelief: 0.0, uncertainty: 1.0, baseRate: 0.5 };
      }
    }

    // 9. Deterministic Semantic Payload Construction for ID
    // Maps semantic elements to canonical representation to ensure semantic determinism
    const canonicalSemanticConcept = (c: CognitiveConcept) => ({
      conceptId: c.conceptId,
      canonicalName: c.canonicalName,
      description: c.description,
      category: c.category,
      verificationStatus: c.verificationStatus
    });

    const canonicalSemanticRelation = (r: CognitiveRelation) => ({
      relationId: r.relationId,
      subjectConceptId: r.subjectConceptId,
      predicate: r.predicate,
      objectConceptId: r.objectConceptId,
      verificationStatus: r.verificationStatus
    });

    const canonicalSemanticUnderstanding = (u: CognitiveUnderstanding) => ({
      understandingId: u.understandingId,
      dependencies: (u.dependencies || [])
        .map(d => ({ sourceId: d.sourceId, sourceType: d.sourceType, role: d.role }))
        .sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
      context: u.context,
      verificationStatus: u.verificationStatus
    });

    const canonicalSemanticConstraint = (c: CompositionConstraint) => ({
      constraintId: c.constraintId,
      type: c.type,
      targetInputId: c.targetInputId,
      condition: c.condition
    });

    const sortedEntities = Array.from(explicitEntities)
      .map(id => loadedConcepts.get(id)!)
      .filter(Boolean)
      .map(canonicalSemanticConcept)
      .sort((a, b) => a.conceptId.localeCompare(b.conceptId));

    const sortedStates = Array.from(explicitStates)
      .map(id => loadedConcepts.get(id)!)
      .filter(Boolean)
      .map(canonicalSemanticConcept)
      .sort((a, b) => a.conceptId.localeCompare(b.conceptId));

    const sortedEvents = Array.from(explicitEvents)
      .map(id => loadedConcepts.get(id)!)
      .filter(Boolean)
      .map(canonicalSemanticConcept)
      .sort((a, b) => a.conceptId.localeCompare(b.conceptId));

    const sortedProcesses = Array.from(explicitProcesses.values())
      .map(p => ({
        conceptId: p.conceptId,
        steps: p.steps ? [...p.steps].sort() : []
      }))
      .sort((a, b) => a.conceptId.localeCompare(b.conceptId));

    const sortedCausalRelations = Array.from(causalRelationsSet)
      .map(id => loadedRelations.get(id)!)
      .filter(Boolean)
      .map(canonicalSemanticRelation)
      .sort((a, b) => a.relationId.localeCompare(b.relationId));

    const sortedDependencies = Array.from(dependenciesSet)
      .map(id => loadedRelations.get(id)!)
      .filter(Boolean)
      .map(canonicalSemanticRelation)
      .sort((a, b) => a.relationId.localeCompare(b.relationId));

    const sortedStructuralRelations = Array.from(structuralRelationsSet)
      .map(id => loadedRelations.get(id)!)
      .filter(Boolean)
      .map(canonicalSemanticRelation)
      .sort((a, b) => a.relationId.localeCompare(b.relationId));

    const sortedUnderstandings = Array.from(loadedUnderstandings.values())
      .map(canonicalSemanticUnderstanding)
      .sort((a, b) => a.understandingId.localeCompare(b.understandingId));

    const sortedConstraints = Array.from(constraintsMap.values())
      .map(canonicalSemanticConstraint)
      .sort((a, b) => a.constraintId.localeCompare(b.constraintId));

    const semanticPayload = {
      context: input.context,
      entities: sortedEntities,
      states: sortedStates,
      events: sortedEvents,
      processes: sortedProcesses,
      causalRelations: sortedCausalRelations,
      dependencies: sortedDependencies,
      structuralRelations: sortedStructuralRelations,
      understandings: sortedUnderstandings,
      constraints: sortedConstraints,
      uncertainty: {
        belief: uncertainty.belief,
        disbelief: uncertainty.disbelief,
        uncertainty: uncertainty.uncertainty,
        baseRate: uncertainty.baseRate
      }
    };

    const hashString = stringifyDeterministic(semanticPayload);
    const worldModelId = `wm_${createHash('sha256').update(hashString).digest('hex').substring(0, 16)}`;

    const entitiesArray = Array.from(explicitEntities).sort();
    const statesArray = Array.from(explicitStates).sort();
    const eventsArray = Array.from(explicitEvents).sort();
    const processesArray = Array.from(explicitProcesses.values()).sort((a, b) =>
      a.conceptId.localeCompare(b.conceptId)
    );
    const causalArray = Array.from(causalRelationsSet).sort();
    const dependenciesArray = Array.from(dependenciesSet).sort();
    const structuralArray = Array.from(structuralRelationsSet).sort();
    const understandingIdsArray = Array.from(loadedUnderstandings.keys()).sort();
    const constraintsArray = Array.from(constraintsMap.values()).sort((a, b) =>
      a.constraintId.localeCompare(b.constraintId)
    );
    const evidenceIdsArray = Array.from(evidenceIdsSet).sort();
    const provenanceArray = Array.from(provenanceSet).sort();

    const rawModel = {
      worldModelId,
      name: input.name,
      description: input.description,
      context: freezeContext(input.context),
      entities: entitiesArray,
      states: statesArray,
      events: eventsArray,
      processes: processesArray,
      causalRelations: causalArray,
      dependencies: dependenciesArray,
      structuralRelations: structuralArray,
      understandingIds: understandingIdsArray,
      constraints: constraintsArray,
      verificationStatus,
      epistemicStatus,
      uncertainty,
      evidenceIds: evidenceIdsArray,
      provenance: provenanceArray,
      originatingCellId: input.originatingCellId,
      createdAt: new Date().toISOString(),
      version: 1,
      metadata: input.metadata || {}
    };

    const validated = WorldModelSchema.parse(rawModel);

    // Bind trace helper to instance
    const boundModel: WorldModel = {
      ...validated,
      trace: (elementId: string) => this.trace(boundModel, elementId, graph, Array.from(loadedUnderstandings.values()))
    };

    return deepFreeze(boundModel);
  }

  public trace(
    model: WorldModel,
    elementId: string,
    graphOverride?: CognitiveGraph,
    understandingsOverride?: CognitiveUnderstanding[]
  ): WorldModelTrace {
    const isConcept =
      model.entities.includes(elementId) ||
      model.states.includes(elementId) ||
      model.events.includes(elementId) ||
      model.processes.some(p => p.conceptId === elementId);

    if (isConcept) {
      return this.traceConcept(model, elementId, graphOverride, understandingsOverride);
    }

    const isRelation =
      model.causalRelations.includes(elementId) ||
      model.dependencies.includes(elementId) ||
      model.structuralRelations.includes(elementId);

    if (isRelation) {
      return this.traceRelation(model, elementId, graphOverride, understandingsOverride);
    }

    if (model.understandingIds.includes(elementId)) {
      return this.traceUnderstanding(model, elementId, graphOverride, understandingsOverride);
    }

    if (model.evidenceIds.includes(elementId)) {
      return this.traceEvidence(model, elementId, graphOverride, understandingsOverride);
    }

    throw new Error(`Element "${elementId}" not found in WorldModel "${model.worldModelId}"`);
  }

  public traceConcept(
    model: WorldModel,
    conceptId: string,
    graphOverride?: CognitiveGraph,
    understandingsOverride?: CognitiveUnderstanding[]
  ): WorldModelTrace {
    const graph = graphOverride || this.defaultGraph;
    let concept = this.conceptCache.get(conceptId);
    if (!concept && graph) {
      concept = graph.getConcept(conceptId);
    }

    const matchingUnds: CognitiveUnderstanding[] = [];
    const unds = understandingsOverride || Array.from(this.understandingCache.values());

    for (const u of unds) {
      if (model.understandingIds.includes(u.understandingId)) {
        if (u.dependencies.some(d => d.sourceId === conceptId)) {
          matchingUnds.push(u);
        }
      }
    }

    const evIds = new Set<string>();
    if (concept && concept.evidenceIds) {
      for (const eid of concept.evidenceIds) evIds.add(eid);
    }
    for (const u of matchingUnds) {
      for (const eid of u.evidenceIds) evIds.add(eid);
    }

    const evidences: Evidence[] = [];
    for (const eid of evIds) {
      let ev = this.evidenceCache.get(eid);
      if (!ev && graph) {
        ev = graph.getEvidence(eid);
      }
      if (ev) evidences.push(ev);
    }

    return {
      elementId: conceptId,
      elementType: 'CONCEPT',
      representation: concept,
      understandings: matchingUnds,
      evidences,
      epistemicStatus: concept?.verificationStatus
    };
  }

  public traceRelation(
    model: WorldModel,
    relationId: string,
    graphOverride?: CognitiveGraph,
    understandingsOverride?: CognitiveUnderstanding[]
  ): WorldModelTrace {
    const graph = graphOverride || this.defaultGraph;
    let relation = this.relationCache.get(relationId);
    if (!relation && graph) {
      relation = graph.getRelation(relationId);
    }

    const matchingUnds: CognitiveUnderstanding[] = [];
    const unds = understandingsOverride || Array.from(this.understandingCache.values());

    for (const u of unds) {
      if (model.understandingIds.includes(u.understandingId)) {
        if (u.dependencies.some(d => d.sourceId === relationId)) {
          matchingUnds.push(u);
        }
      }
    }

    const evIds = new Set<string>();
    if (relation && relation.evidenceIds) {
      for (const eid of relation.evidenceIds) evIds.add(eid);
    }
    for (const u of matchingUnds) {
      for (const eid of u.evidenceIds) evIds.add(eid);
    }

    const evidences: Evidence[] = [];
    for (const eid of evIds) {
      let ev = this.evidenceCache.get(eid);
      if (!ev && graph) {
        ev = graph.getEvidence(eid);
      }
      if (ev) evidences.push(ev);
    }

    return {
      elementId: relationId,
      elementType: 'RELATION',
      representation: relation,
      understandings: matchingUnds,
      evidences,
      epistemicStatus: relation?.verificationStatus
    };
  }

  public traceUnderstanding(
    model: WorldModel,
    understandingId: string,
    graphOverride?: CognitiveGraph,
    understandingsOverride?: CognitiveUnderstanding[]
  ): WorldModelTrace {
    const graph = graphOverride || this.defaultGraph;
    const unds = understandingsOverride || Array.from(this.understandingCache.values());
    const und = unds.find(u => u.understandingId === understandingId) || this.understandingCache.get(understandingId);

    if (!und) {
      throw new Error(`Understanding "${understandingId}" not found in cache or overrides`);
    }

    const evidences: Evidence[] = [];
    for (const eid of und.evidenceIds) {
      let ev = this.evidenceCache.get(eid);
      if (!ev && graph) {
        ev = graph.getEvidence(eid);
      }
      if (ev) evidences.push(ev);
    }

    return {
      elementId: understandingId,
      elementType: 'UNDERSTANDING',
      understandings: [und],
      evidences,
      epistemicStatus: und.verificationStatus
    };
  }

  public traceEvidence(
    model: WorldModel,
    evidenceId: string,
    graphOverride?: CognitiveGraph,
    understandingsOverride?: CognitiveUnderstanding[]
  ): WorldModelTrace {
    const graph = graphOverride || this.defaultGraph;
    let ev = this.evidenceCache.get(evidenceId);
    if (!ev && graph) {
      ev = graph.getEvidence(evidenceId);
    }

    const matchingUnds: CognitiveUnderstanding[] = [];
    const unds = understandingsOverride || Array.from(this.understandingCache.values());

    for (const u of unds) {
      if (model.understandingIds.includes(u.understandingId)) {
        if (u.evidenceIds.includes(evidenceId) || u.dependencies.some(d => d.sourceId === evidenceId)) {
          matchingUnds.push(u);
        }
      }
    }

    return {
      elementId: evidenceId,
      elementType: 'EVIDENCE',
      understandings: matchingUnds,
      evidences: ev ? [ev] : []
    };
  }

  public getCausalStructure(model: WorldModel, graphOverride?: CognitiveGraph): CognitiveRelation[] {
    const graph = graphOverride || this.defaultGraph;
    const result: CognitiveRelation[] = [];
    for (const id of model.causalRelations) {
      let r = this.relationCache.get(id);
      if (!r && graph) {
        r = graph.getRelation(id);
      }
      if (r) result.push(r);
    }
    return result;
  }

  public getDependencyStructure(
    model: WorldModel,
    graphOverride?: CognitiveGraph
  ): { relations: CognitiveRelation[]; constraints: CompositionConstraint[] } {
    const graph = graphOverride || this.defaultGraph;
    const relations: CognitiveRelation[] = [];
    for (const id of model.dependencies) {
      let r = this.relationCache.get(id);
      if (!r && graph) {
        r = graph.getRelation(id);
      }
      if (r) relations.push(r);
    }
    return {
      relations,
      constraints: [...model.constraints]
    };
  }

  public getConstraintStructure(model: WorldModel): CompositionConstraint[] {
    return [...model.constraints];
  }
}
