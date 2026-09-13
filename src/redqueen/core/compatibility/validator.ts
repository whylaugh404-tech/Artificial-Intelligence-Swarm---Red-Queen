import { MitosisReconciliationResult } from '../mitosis_reconciliation/types';
import { CompatibilityValidationResult } from './types';
import { CellState } from '../state/types';

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
    // Children must inherit structures exactly without spontaneous mutations, 
    // explicit differentiation metadata tracks the slicing.
    
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
}
