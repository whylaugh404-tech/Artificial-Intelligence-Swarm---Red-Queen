import { z } from 'zod';
import { Cell } from '../core/cell';
import { Context } from './epistemic/types';
import { CognitiveUnderstanding } from './understanding/types';
import { Evidence } from './evidence/types';
import { computeDeterministicHash } from './computation/canonical';
import { RepresentationVerificationStatus } from './representation/types';

export const CellContributionSchema = z.object({
  cellId: z.string().min(1),
  contributionType: z.enum(['CONCEPT', 'RELATION', 'EVIDENCE', 'EXPERIENCE', 'HYPOTHESIS']),
  content: z.any(),
  confidence: z.number().min(0).max(1)
});

export type CellContribution = z.infer<typeof CellContributionSchema>;

export const EmergentStructureSchema = z.object({
  emergentId: z.string().min(1),
  sourceCells: z.array(z.string()).min(1),
  sourceStructures: z.array(z.any()),
  transformation: z.string().min(1),
  resultingStructure: z.any(),
  confidence: z.number().min(0).max(1),
  provenance: z.array(z.string()).min(1),
  deterministicIdentity: z.string().min(1),
  verificationStatus: z.nativeEnum(RepresentationVerificationStatus)
});

export type EmergentStructure = z.infer<typeof EmergentStructureSchema>;

export const BeliefStateSchema = z.object({
  conceptId: z.string(),
  belief: z.number().min(0).max(1),
  supportingEvidence: z.array(z.string()),
  contradictingEvidence: z.array(z.string()),
  status: z.nativeEnum(RepresentationVerificationStatus)
});

export type BeliefState = z.infer<typeof BeliefStateSchema>;

export interface CollectiveRepresentation {
  emergentStructures: EmergentStructure[];
  hypotheses: any[];
  beliefs: BeliefState[];
  contradictions: any[];
  provenance: string[];
}

export class CollectiveCognitionEngine {
  public compose(
    understanding: CognitiveUnderstanding,
    contributions: CellContribution[],
    context: Context
  ): CollectiveRepresentation {
    const emergentStructures: EmergentStructure[] = [];
    const hypotheses: any[] = [];
    const beliefs: BeliefState[] = [];
    const contradictions: any[] = [];
    const provenance: string[] = ['collective_composition_started'];

    // Group contributions by type
    const concepts = contributions.filter(c => c.contributionType === 'CONCEPT');
    const relations = contributions.filter(c => c.contributionType === 'RELATION');
    const evidences = contributions.filter(c => c.contributionType === 'EVIDENCE');

    // Cross-Cell Interaction: Match concepts and relations
    for (const rel of relations) {
      const relatedConcepts = concepts.filter(c => 
        c.content.conceptId === rel.content.subjectConceptId || 
        c.content.conceptId === rel.content.objectConceptId
      );

      if (relatedConcepts.length > 0) {
        // Find evidence
        const supportingEvs = evidences.filter(e => e.content.supports === rel.content.relationId);
        const contradictingEvs = evidences.filter(e => e.content.contradicts === rel.content.relationId);

        let status = RepresentationVerificationStatus.PENDING;
        if (contradictingEvs.length > 0 && supportingEvs.length > 0) {
          status = RepresentationVerificationStatus.CONTRADICTED;
          contradictions.push({
            target: rel.content,
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

        // New Hypothesis or Structure
        const resultingStructure = {
          type: 'HYPOTHESIS',
          statement: `${rel.content.subjectConceptId} ${rel.content.predicate} ${rel.content.objectConceptId}`,
          context: context,
          status: 'HYPOTHESIS'
        };

        const hashPayload = {
          sources: sourceCells,
          relation: rel.content,
          concepts: relatedConcepts.map(c => c.content),
          resultingStructure
        };

        const deterministicIdentity = computeDeterministicHash(hashPayload);
        const emergentId = `emg_${deterministicIdentity.substring(0, 16)}`;

        const emergent: EmergentStructure = {
          emergentId,
          sourceCells,
          sourceStructures: [rel.content, ...relatedConcepts.map(c => c.content)],
          transformation: 'CROSS_CELL_RELATION_MATCH',
          resultingStructure,
          confidence: Math.max(rel.confidence, 0.1),
          provenance: [`interaction:${rel.cellId}_with_multiple_cells`],
          deterministicIdentity,
          verificationStatus: status
        };

        emergentStructures.push(emergent);
        hypotheses.push(resultingStructure);
        
        // Update Belief
        beliefs.push({
          conceptId: rel.content.relationId,
          belief: status === RepresentationVerificationStatus.SUPPORTED ? 0.9 : (status === RepresentationVerificationStatus.CONTRADICTED ? 0.5 : 0.1),
          supportingEvidence: supportingEvs.map(e => e.content.evidenceId),
          contradictingEvidence: contradictingEvs.map(e => e.content.evidenceId),
          status
        });
      }
    }

    // Emergence logic: Combine concepts that have no explicit relations to form a hypothesis
    if (concepts.length > 1 && relations.length === 0) {
      const sourceCells = Array.from(new Set(concepts.map(c => c.cellId))).sort();
      const resultingStructure = {
        type: 'HYPOTHESIS',
        statement: `Possible emergent link between ${concepts.map(c => c.content.canonicalName || c.content.conceptId).join(' and ')}`,
        context: context,
        status: 'HYPOTHESIS'
      };

      const deterministicIdentity = computeDeterministicHash({ concepts: concepts.map(c => c.content), resultingStructure });
      
      emergentStructures.push({
        emergentId: `emg_${deterministicIdentity.substring(0, 16)}`,
        sourceCells,
        sourceStructures: concepts.map(c => c.content),
        transformation: 'CONCEPTUAL_SYNTHESIS',
        resultingStructure,
        confidence: 0.5,
        provenance: ['conceptual_synthesis_without_relations'],
        deterministicIdentity,
        verificationStatus: RepresentationVerificationStatus.PENDING
      });
      hypotheses.push(resultingStructure);
    }

    provenance.push(`emergent_structures_generated:${emergentStructures.length}`);

    return {
      emergentStructures,
      hypotheses,
      beliefs,
      contradictions,
      provenance
    };
  }
}
