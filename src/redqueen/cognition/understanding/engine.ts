import { createHash } from 'crypto';
import { CognitiveUnderstanding, UnderstandingDependency } from './types';
import { 
  RepresentationVerificationStatus,
  CognitiveConcept,
  CognitiveRelation
} from '../representation/types';
import { Context } from '../epistemic/types';
import { Evidence } from '../evidence/types';

export interface UnderstandingCompositionInput {
  summary?: string;
  concepts?: CognitiveConcept[];
  relations?: CognitiveRelation[];
  evidences?: Evidence[];
  context: Context;
  originatingCellId: string;
}

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

export class UnderstandingEngine {
  /**
   * Composes a new Understanding Representation from given cognitive elements.
   * Assures deterministic ID, correct provenance, and combined epistemic validation.
   */
  public compose(input: UnderstandingCompositionInput): CognitiveUnderstanding {
    const dependencies: UnderstandingDependency[] = [];
    const provenanceSet = new Set<string>();
    const evidenceIdsSet = new Set<string>();
    
    let hasConflict = false;
    let hasSupported = false;

    // Process concepts
    if (input.concepts) {
      for (const concept of input.concepts) {
        dependencies.push({
          sourceId: concept.conceptId,
          sourceType: 'CONCEPT',
          role: 'COMPONENT'
        });
        concept.provenance.forEach(p => provenanceSet.add(p));
        if (concept.evidenceIds) {
          concept.evidenceIds.forEach(eid => evidenceIdsSet.add(eid));
        }
        
        if (concept.verificationStatus === RepresentationVerificationStatus.CONTRADICTED) {
          hasConflict = true;
        } else if (
          concept.verificationStatus === RepresentationVerificationStatus.SUPPORTED || 
          concept.verificationStatus === RepresentationVerificationStatus.VERIFIED
        ) {
          hasSupported = true;
        }
      }
    }

    // Process relations
    if (input.relations) {
      for (const relation of input.relations) {
        dependencies.push({
          sourceId: relation.relationId,
          sourceType: 'RELATION',
          role: 'CONNECTION'
        });
        relation.provenance.forEach(p => provenanceSet.add(p));
        if (relation.evidenceIds) {
          relation.evidenceIds.forEach(eid => evidenceIdsSet.add(eid));
        }
        
        if (relation.verificationStatus === RepresentationVerificationStatus.CONTRADICTED) {
          hasConflict = true;
        } else if (
          relation.verificationStatus === RepresentationVerificationStatus.SUPPORTED || 
          relation.verificationStatus === RepresentationVerificationStatus.VERIFIED
        ) {
          hasSupported = true;
        }
      }
    }

    // Process evidences
    if (input.evidences) {
      for (const evidence of input.evidences) {
        dependencies.push({
          sourceId: evidence.evidenceId,
          sourceType: 'EVIDENCE',
          role: 'SUPPORT'
        });
        if (evidence.provenance && evidence.provenance.sourceId) {
          provenanceSet.add(evidence.provenance.sourceId);
        }
        evidenceIdsSet.add(evidence.evidenceId);
      }
    }

    // Sort dependencies to ensure deterministic hashing
    dependencies.sort((a, b) => {
      const typeCmp = a.sourceType.localeCompare(b.sourceType);
      if (typeCmp !== 0) return typeCmp;
      return a.sourceId.localeCompare(b.sourceId);
    });

    // Hash to create deterministic ID
    // We hash semantic components and their canonical semantic representations
    // to remain deterministic across non-semantic changes.
    const semanticConcepts = (input.concepts || []).map(c => ({
      conceptId: c.conceptId,
      canonicalName: c.canonicalName,
      description: c.description,
      category: c.category,
      sourceKnowledgeIds: [...c.sourceKnowledgeIds].sort(),
      sourceExperienceIds: [...(c.sourceExperienceIds || [])].sort(),
      verificationStatus: c.verificationStatus
    })).sort((a, b) => a.conceptId.localeCompare(b.conceptId));

    const semanticRelations = (input.relations || []).map(r => ({
      relationId: r.relationId,
      subjectConceptId: r.subjectConceptId,
      predicate: r.predicate,
      objectConceptId: r.objectConceptId,
      verificationStatus: r.verificationStatus
    })).sort((a, b) => a.relationId.localeCompare(b.relationId));

    const semanticEvidences = (input.evidences || []).map(e => ({
      evidenceId: e.evidenceId,
      sourceId: e.sourceId,
      provenance: {
        sourceId: e.provenance.sourceId,
        derivedFrom: e.provenance.derivedFrom ? [...e.provenance.derivedFrom].sort() : undefined,
        supportingRepresentationIds: e.provenance.supportingRepresentationIds ? [...e.provenance.supportingRepresentationIds].sort() : undefined,
        contradictingRepresentationIds: e.provenance.contradictingRepresentationIds ? [...e.provenance.contradictingRepresentationIds].sort() : undefined
      }
    })).sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));

    const semanticPayload = {
      context: input.context,
      dependencies,
      semanticConcepts,
      semanticRelations,
      semanticEvidences
    };
    
    const hashInput = stringifyDeterministic(semanticPayload);
    const understandingId = `und_${createHash('sha256').update(hashInput).digest('hex').substring(0, 16)}`;

    // Determine verification status
    // Understanding is not automatically verified. 
    // It inherits PENDING or SUPPORTED depending on evidence availability,
    // or CONTRADICTED if sources are conflicting.
    let derivedStatus = RepresentationVerificationStatus.PENDING;
    if (hasConflict) {
      derivedStatus = RepresentationVerificationStatus.CONTRADICTED;
    } else if (evidenceIdsSet.size > 0 || hasSupported) {
      derivedStatus = RepresentationVerificationStatus.SUPPORTED;
    }

    const provenance = Array.from(provenanceSet).sort();
    if (provenance.length === 0) {
      provenance.push(input.originatingCellId);
    }

    const understanding: CognitiveUnderstanding = {
      understandingId,
      summary: input.summary,
      dependencies,
      evidenceIds: Array.from(evidenceIdsSet).sort(),
      context: input.context,
      provenance,
      verificationStatus: derivedStatus,
      originatingCellId: input.originatingCellId,
      createdAt: new Date().toISOString(),
      version: 1,
      metadata: {}
    };

    return Object.freeze(understanding) as CognitiveUnderstanding;
  }
}
