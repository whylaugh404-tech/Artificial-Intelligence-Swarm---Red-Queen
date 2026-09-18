import { MitosisReconciliationResult } from '../mitosis_reconciliation/types';
import { CompatibilityValidationResult } from './types';
import { CellState } from '../state/types';
import { CognitiveConceptSchema, CognitiveRelationSchema } from '../../cognition/representation/types';

export class ArchitecturalCompatibilityValidator {
  
  public validateMitosisResult(result: MitosisReconciliationResult): CompatibilityValidationResult {
    const anomalies: Array<{component: string, issue: string}> = [];

    // 1. Structural Identity Separation (R2 + R6)
    if (result.childA.stateId === result.childB.stateId) {
      anomalies.push({ component: 'R2_STATE', issue: 'Child A and Child B have identical stateIds' });
    }
    if (result.childA.cellIdentity === result.childB.cellIdentity) {
      anomalies.push({ component: 'R2_STATE', issue: 'Child A and Child B have identical cellIdentities' });
    }
    if (result.childA.stateId === result.parentStateId || result.childB.stateId === result.parentStateId) {
      anomalies.push({ component: 'R6_MITOSIS', issue: 'Child stateId matches parent stateId' });
    }

    // 2. Compute Partition Ownership (R3)
    this.validateComputeOwnership(result.childA, anomalies);
    this.validateComputeOwnership(result.childB, anomalies);

    // 3. Provenance Chain (R5 + P5)
    this.validateLineage(result, anomalies);

    // 4. Cognitive & Memory Structure Continuity (R4 / P5)
    this.validateCognitiveContinuity(result.childA, anomalies);
    this.validateCognitiveContinuity(result.childB, anomalies);

    return {
      status: anomalies.length === 0 ? 'COMPATIBLE' : 'INCOMPATIBLE',
      reasons: anomalies.map(a => `[${a.component}] ${a.issue}`),
      anomalies
    };
  }

  public validateP5Representation(payload: unknown, type: 'CONCEPT' | 'RELATION'): CompatibilityValidationResult {
    const anomalies: Array<{component: string, issue: string}> = [];
    
    try {
      if (type === 'CONCEPT') {
        CognitiveConceptSchema.parse(payload);
      } else if (type === 'RELATION') {
        CognitiveRelationSchema.parse(payload);
      } else {
        throw new Error('Unknown representation type');
      }
    } catch (error: unknown) {
      // Fail closed
      const msg = error instanceof Error ? error.message : String(error);
      anomalies.push({
        component: 'P5_REPRESENTATION',
        issue: `Schema validation failed: ${msg}`
      });
    }

    // Explicit checking for fail-closed requirements
    if (type === 'CONCEPT' && anomalies.length === 0) {
      const concept = payload as Record<string, unknown>;
      if (!concept.provenance || !Array.isArray(concept.provenance) || concept.provenance.length === 0) {
        anomalies.push({ component: 'P5_REPRESENTATION', issue: 'Concept missing provenance' });
      }
      if (!concept.originatingCellId || typeof concept.originatingCellId !== 'string' || concept.originatingCellId.trim() === '') {
        anomalies.push({ component: 'P5_REPRESENTATION', issue: 'Concept missing originatingCellId' });
      }
      if (!concept.currentHolderCellId || typeof concept.currentHolderCellId !== 'string' || concept.currentHolderCellId.trim() === '') {
        anomalies.push({ component: 'P5_REPRESENTATION', issue: 'Concept missing currentHolderCellId' });
      }
    }

    if (type === 'RELATION' && anomalies.length === 0) {
      const relation = payload as Record<string, unknown>;
      if (!relation.subjectConceptId || !relation.objectConceptId || typeof relation.subjectConceptId !== 'string' || typeof relation.objectConceptId !== 'string') {
        anomalies.push({ component: 'P5_REPRESENTATION', issue: 'Relation missing subject or object' });
      }
      if (!relation.originatingCellId || typeof relation.originatingCellId !== 'string' || relation.originatingCellId.trim() === '') {
        anomalies.push({ component: 'P5_REPRESENTATION', issue: 'Relation missing originatingCellId' });
      }
      if (!relation.currentHolderCellId || typeof relation.currentHolderCellId !== 'string' || relation.currentHolderCellId.trim() === '') {
        anomalies.push({ component: 'P5_REPRESENTATION', issue: 'Relation missing currentHolderCellId' });
      }
      if (!relation.provenance || !Array.isArray(relation.provenance) || relation.provenance.length === 0) {
        anomalies.push({ component: 'P5_REPRESENTATION', issue: 'Relation missing provenance' });
      }
    }

    return {
      status: anomalies.length === 0 ? 'COMPATIBLE' : 'INCOMPATIBLE',
      reasons: anomalies.map(a => `[${a.component}] ${a.issue}`),
      anomalies
    };
  }

  private validateComputeOwnership(child: CellState, anomalies: Array<{component: string, issue: string}>) {
    if (child.computationalCapability.partitions) {
      for (const part of child.computationalCapability.partitions) {
        if (!part.cellIdentity || typeof part.cellIdentity !== 'string' || part.cellIdentity.trim() === '') {
          anomalies.push({ 
            component: 'R3_COMPUTE', 
            issue: `Compute partition ${part.partitionId} has missing or empty cellIdentity` 
          });
        } else if (part.cellIdentity !== child.cellIdentity) {
          anomalies.push({ 
            component: 'R3_COMPUTE', 
            issue: `Compute partition ${part.partitionId} owned by ${part.cellIdentity}, but cell is ${child.cellIdentity}` 
          });
        }
      }
    }
  }

  private validateLineage(result: MitosisReconciliationResult, anomalies: Array<{component: string, issue: string}>) {
    if (!result.parentStateId || typeof result.parentStateId !== 'string' || result.parentStateId.trim() === '') {
      anomalies.push({
        component: 'R7_LINEAGE',
        issue: 'Mitosis result is missing parentStateId'
      });
      return;
    }

    if (!result.mitosisId || typeof result.mitosisId !== 'string' || result.mitosisId.trim() === '') {
      anomalies.push({
        component: 'R7_LINEAGE',
        issue: 'Mitosis result is missing mitosisId'
      });
      return;
    }

    const parentProv = result.provenance?.find(p => p.startsWith('parent:'));
    if (!parentProv || parentProv !== `parent:${result.parentStateId}`) {
      anomalies.push({
        component: 'R7_LINEAGE',
        issue: `Inconsistent parent lineage: result.parentStateId (${result.parentStateId}) does not match provenance (${parentProv})`
      });
    }

    const mitosisProv = result.provenance?.find(p => p.startsWith('mitosis:'));
    if (!mitosisProv || mitosisProv !== `mitosis:${result.mitosisId}`) {
      anomalies.push({
        component: 'R7_LINEAGE',
        issue: `Inconsistent mitosis lineage: result.mitosisId (${result.mitosisId}) does not match provenance (${mitosisProv})`
      });
    }

    const validateChildLineage = (child: CellState, childName: string) => {
      if (!child.provenance || !Array.isArray(child.provenance) || child.provenance.length === 0) {
        anomalies.push({
          component: 'R7_LINEAGE',
          issue: `Child ${child.cellIdentity} has empty provenance`
        });
        return;
      }

      const expectedChildMitosis = `mitosis:${result.mitosisId}:${childName}`;
      const lastProv = child.provenance[child.provenance.length - 1];
      if (lastProv !== expectedChildMitosis) {
        anomalies.push({
          component: 'R7_LINEAGE',
          issue: `Child ${child.cellIdentity} broken lineage: expected last provenance '${expectedChildMitosis}', got '${lastProv}'`
        });
      }
    };

    validateChildLineage(result.childA, 'childA');
    validateChildLineage(result.childB, 'childB');
  }

  /**
   * Recursively traverses nested structures (objects and arrays) to find
   * and visit cognitive representations, ensuring deep nested validation.
   */
  private scanRepresentations(
    root: unknown,
    basePath: string,
    onRepresentation: (obj: Record<string, unknown>, path: string) => void
  ): void {
    const visited = new Set<unknown>();

    const traverse = (current: unknown, path: string) => {
      if (current === null || typeof current !== 'object') {
        return;
      }
      if (visited.has(current)) {
        return;
      }
      visited.add(current);

      if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i++) {
          traverse(current[i], `${path}[${i}]`);
        }
        return;
      }

      const obj = current as Record<string, unknown>;

      const hasConceptMarker = typeof obj.conceptId === 'string' && obj.conceptId.trim() !== '';
      const hasRelationMarker = typeof obj.relationId === 'string' && obj.relationId.trim() !== '';
      const hasOwnershipMarker = ('originatingCellId' in obj) || ('currentHolderCellId' in obj);

      if (hasConceptMarker || hasRelationMarker || hasOwnershipMarker) {
        onRepresentation(obj, path);
      }

      for (const [k, v] of Object.entries(obj)) {
        if (v !== null && typeof v === 'object') {
          traverse(v, path ? `${path}.${k}` : k);
        }
      }
    };

    traverse(root, basePath);
  }

  private validateCognitiveContinuity(child: CellState, anomalies: Array<{component: string, issue: string}>) {
    if (!child.knowledgeState || !child.cognitiveState || !child.reasoningState || !child.experienceState) {
       anomalies.push({
         component: 'R4_COGNITIVE',
         issue: `Child ${child.cellIdentity} has missing cognitive structure sections`
       });
       return;
    }

    // P5 Validation integration and graph-level validation
    const concepts = new Set<string>();
    const relations: Array<{ relationId: string; subjectConceptId: string; objectConceptId: string; path: string }> = [];

    // Scan all state sections recursively for representations
    const sections: Array<{ name: string; data: Record<string, unknown> }> = [
      { name: 'knowledgeState', data: child.knowledgeState },
      { name: 'cognitiveState', data: child.cognitiveState },
      { name: 'reasoningState', data: child.reasoningState },
      { name: 'experienceState', data: child.experienceState }
    ];

    for (const section of sections) {
      this.scanRepresentations(section.data, section.name, (obj, path) => {
        const isConcept = typeof obj.conceptId === 'string' && obj.conceptId.trim() !== '';
        const isRelation = typeof obj.relationId === 'string' && obj.relationId.trim() !== '';

        if (isConcept) {
          const res = this.validateP5Representation(obj, 'CONCEPT');
          if (res.status === 'INCOMPATIBLE') {
            anomalies.push(...res.anomalies);
          } else {
            concepts.add(obj.conceptId as string);
          }
          this.validateInheritedRepresentationOwnership(obj, child, anomalies, path);
        } else if (isRelation) {
          const res = this.validateP5Representation(obj, 'RELATION');
          if (res.status === 'INCOMPATIBLE') {
            anomalies.push(...res.anomalies);
          } else {
            relations.push({
              relationId: obj.relationId as string,
              subjectConceptId: String(obj.subjectConceptId),
              objectConceptId: String(obj.objectConceptId),
              path
            });
          }
          this.validateInheritedRepresentationOwnership(obj, child, anomalies, path);
        } else {
          // Tracked representation with ownership fields but no conceptId/relationId
          this.validateInheritedRepresentationOwnership(obj, child, anomalies, path);
        }
      });
    }

    // Graph-level validation
    for (const relation of relations) {
      if (!concepts.has(relation.subjectConceptId)) {
        anomalies.push({
          component: 'P5_GRAPH',
          issue: `Relation ${relation.relationId} references missing subjectConceptId ${relation.subjectConceptId}`
        });
      }
      if (!concepts.has(relation.objectConceptId)) {
        anomalies.push({
          component: 'P5_GRAPH',
          issue: `Relation ${relation.relationId} references missing objectConceptId ${relation.objectConceptId}`
        });
      }
    }
  }

  private validateInheritedRepresentationOwnership(
    obj: Record<string, unknown>, 
    child: CellState, 
    anomalies: Array<{component: string, issue: string}>,
    path: string
  ) {
    const idLabel = (typeof obj.conceptId === 'string' && obj.conceptId)
      || (typeof obj.relationId === 'string' && obj.relationId)
      || path;

    // 1. Mandatory originatingCellId check (fail-closed: cannot be empty or skipped)
    if (!('originatingCellId' in obj) || typeof obj.originatingCellId !== 'string' || obj.originatingCellId.trim() === '') {
      anomalies.push({
        component: 'P5_REPRESENTATION',
        issue: `Representation ${idLabel} missing or empty originatingCellId at ${path}`
      });
    } else if (obj.originatingCellId === child.cellIdentity) {
      anomalies.push({
        component: 'P5_REPRESENTATION',
        issue: `Representation ${idLabel} originatingCellId incorrectly overwritten with child identity (${child.cellIdentity})`
      });
    }

    // 2. Mandatory currentHolderCellId check (fail-closed: cannot be empty or skipped)
    if (!('currentHolderCellId' in obj) || typeof obj.currentHolderCellId !== 'string' || obj.currentHolderCellId.trim() === '') {
      anomalies.push({
        component: 'P5_REPRESENTATION',
        issue: `Representation ${idLabel} missing or empty currentHolderCellId at ${path}`
      });
    } else if (obj.currentHolderCellId !== child.cellIdentity) {
      anomalies.push({
        component: 'P5_REPRESENTATION',
        issue: `Representation ${idLabel} currentHolderCellId (${obj.currentHolderCellId}) does not match child identity (${child.cellIdentity})`
      });
    }

    // 3. Mandatory provenance check (fail-closed: cannot be empty or skipped)
    if (!('provenance' in obj) || !Array.isArray(obj.provenance) || obj.provenance.length === 0 || obj.provenance.some(p => typeof p !== 'string' || p.trim() === '')) {
      anomalies.push({
        component: 'P5_REPRESENTATION',
        issue: `Representation ${idLabel} missing, empty, or invalid provenance at ${path}`
      });
    }
  }
}
