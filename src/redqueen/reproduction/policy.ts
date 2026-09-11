import { ReproductionPolicy, ReproductionPolicySchema } from './types';
import { CellState } from '../core/lifecycle';
import { logger } from '../core/logger';

export class GovernanceEnforcer {
  private policy: ReproductionPolicy;
  
  constructor(policyConfig?: Partial<ReproductionPolicy>) {
    this.policy = ReproductionPolicySchema.parse(policyConfig || {});
  }

  public validateReproduction(
    parentState: CellState,
    parentMetadata: Record<string, string>,
    currentPopulation: number,
    memoryPressure: number,
    isAuthorized: boolean
  ): { allowed: boolean; reason?: string } {
    if (parentState !== CellState.ACTIVE) {
      return { allowed: false, reason: 'Parent cell is not ACTIVE' };
    }

    if (this.policy.requireAuthorization && !isAuthorized) {
      return { allowed: false, reason: 'Reproduction lacks explicit creator authorization' };
    }

    if (currentPopulation >= this.policy.populationCeiling) {
      return { allowed: false, reason: 'Population ceiling reached' };
    }

    const now = Date.now();
    const lastReproStr = parentMetadata['lastReproductionTimestamp'];
    if (lastReproStr) {
      const lastRepro = parseInt(lastReproStr, 10);
      if (!isNaN(lastRepro) && (now - lastRepro < this.policy.cooldownMs)) {
        return { allowed: false, reason: 'Reproduction cooldown active' };
      }
    }

    if (memoryPressure < this.policy.minMemoryPressure) {
      return { allowed: false, reason: 'Insufficient memory pressure for reproduction' };
    }

    return { allowed: true };
  }
}
