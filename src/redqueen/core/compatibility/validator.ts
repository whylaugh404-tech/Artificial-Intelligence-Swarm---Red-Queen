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
    } catch (error: any) {
      // Fail closed
      anomalies.push({
        component: 'P5_REPRESENTATION',
        issue: `Schema validation failed: ${error.message}`
      });
    }

    // Explicit checking for fail-closed requirements
    if (type === 'CONCEPT' && anomalies.length === 0) {
      const concept = payload as any;
      if (!concept.provenance || concept.provenance.length === 0) {
         anomalies.push({ component: 'P5_REPRESENTATION', issue: 'Concept missing provenance' });
      }
      if (!concept.currentHolderCellId) {
         anomalies.push({ component: 'P5_REPRESENTATION', issue: 'Concept missing currentHolderCellId' });
      }
    }

    if (type === 'RELATION' && anomalies.length === 0) {
      const relation = payload as any;
      if (!relation.subjectConceptId || !relation.objectConceptId) {
         anomalies.push({ component: 'P5_REPRESENTATION', issue: 'Relation missing subject or object' });
      }
      if (!relation.currentHolderCellId) {
         anomalies.push({ component: 'P5_REPRESENTATION', issue: 'Relation missing currentHolderCellId' });
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
        if (part.cellIdentity !== child.cellIdentity) {
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
      if (!child.provenance || child.provenance.length === 0) {
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
    const relations: any[] = [];

    // Scan all state sections for concepts and relations
    const sections = [child.knowledgeState, child.cognitiveState, child.reasoningState, child.experienceState];
    for (const section of sections) {
      for (const [key, value] of Object.entries(section)) {
        if (!value || typeof value !== 'object') continue;
        const obj = value as any;
        
        if (obj.conceptId) {
          const res = this.validateP5Representation(obj, 'CONCEPT');
          if (res.status === 'INCOMPATIBLE') {
            anomalies.push(...res.anomalies);
          } else {
            concepts.add(obj.conceptId);
          }
          this.validateInheritedRepresentationOwnership(obj, child, anomalies);
        } else if (obj.relationId) {
          const res = this.validateP5Representation(obj, 'RELATION');
          if (res.status === 'INCOMPATIBLE') {
            anomalies.push(...res.anomalies);
          } else {
            relations.push(obj);
          }
          this.validateInheritedRepresentationOwnership(obj, child, anomalies);
        }
      }
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
    obj: any, 
    child: CellState, 
    anomalies: Array<{component: string, issue: string}>
  ) {
    if (obj.originatingCellId) {
      if (obj.originatingCellId === child.cellIdentity) {
        anomalies.push({
          component: 'P5_REPRESENTATION',
          issue: `Representation ${obj.conceptId || obj.relationId} originatingCellId incorrectly overwritten with child identity (${child.cellIdentity})`
        });
      }
      if (obj.currentHolderCellId !== child.cellIdentity) {
        anomalies.push({
          component: 'P5_REPRESENTATION',
          issue: `Representation ${obj.conceptId || obj.relationId} currentHolderCellId (${obj.currentHolderCellId}) does not match child identity (${child.cellIdentity})`
        });
      }
    }
  }
}
