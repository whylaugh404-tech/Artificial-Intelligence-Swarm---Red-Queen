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
    this.validateProvenance(result.childA, result.mitosisId, anomalies);
    this.validateProvenance(result.childB, result.mitosisId, anomalies);

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
    }

    if (type === 'RELATION' && anomalies.length === 0) {
      const relation = payload as any;
      if (!relation.subjectConceptId || !relation.objectConceptId) {
         anomalies.push({ component: 'P5_REPRESENTATION', issue: 'Relation missing subject or object' });
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

  private validateProvenance(child: CellState, mitosisId: string, anomalies: Array<{component: string, issue: string}>) {
    const hasMitosisProvenance = child.provenance.some(p => p.includes(`mitosis:${mitosisId}`));
    if (!hasMitosisProvenance) {
      anomalies.push({
        component: 'R5_EMERGENCE',
        issue: `Child ${child.cellIdentity} is missing mitosis provenance trace`
      });
    }
  }

  private validateCognitiveContinuity(child: CellState, anomalies: Array<{component: string, issue: string}>) {
    // If the child has any cognitive/knowledge keys, we assume they are valid if they exist, 
    // but we want to ensure basic continuity (e.g., state objects are defined)
    if (!child.knowledgeState || !child.cognitiveState || !child.reasoningState || !child.experienceState) {
       anomalies.push({
         component: 'R4_COGNITIVE',
         issue: `Child ${child.cellIdentity} has missing cognitive structure sections`
       });
    }
  }
}
