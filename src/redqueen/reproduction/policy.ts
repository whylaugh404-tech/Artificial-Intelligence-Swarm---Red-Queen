import { ReproductionPolicy, ReproductionPolicySchema, AuthorizationProof } from './types';
import { CellState } from '../core/lifecycle';
import { identityCrypto } from '../crypto/identity';
import { logger } from '../core/logger';

export class GovernanceEnforcer {
  private policy: ReproductionPolicy;
  
  constructor(policyConfig?: Partial<ReproductionPolicy>) {
    this.policy = ReproductionPolicySchema.parse(policyConfig || {});
  }

  public get policyMemoryCapacity(): number {
    return this.policy.memoryCapacity;
  }

  public validateReproduction(
    parentState: CellState,
    parentMetadata: Record<string, string>,
    currentPopulation: number,
    memoryPressure: number,
    eventId: string,
    parentId: string,
    proof?: AuthorizationProof | any
  ): { allowed: boolean; reason?: string } {
    if (parentState !== CellState.ACTIVE) {
      return { allowed: false, reason: 'Parent cell is not ACTIVE' };
    }

    if (this.policy.requireAuthorization) {
      if (!proof) {
        return { allowed: false, reason: 'Reproduction lacks explicit creator authorization' };
      }
      if (!proof.payload || !proof.signature || !proof.issuerPublicKey) {
        return { allowed: false, reason: 'Invalid authorization proof format' };
      }
      
      const now = Date.now();
      if (proof.payload.exp < now) {
        return { allowed: false, reason: 'Authorization proof expired' };
      }
      if (proof.payload.action !== 'reproduce') {
        return { allowed: false, reason: 'Authorization proof action mismatch' };
      }
      if (proof.payload.subject !== parentId) {
        return { allowed: false, reason: 'Authorization proof subject mismatch' };
      }
      if (proof.payload.eventId !== eventId) {
        return { allowed: false, reason: 'Authorization proof eventId mismatch' };
      }
      
      const payloadString = JSON.stringify(proof.payload);
      const isVerified = identityCrypto.verifySignature(proof.issuerPublicKey, payloadString, proof.signature);
      if (!isVerified) {
        return { allowed: false, reason: 'Authorization proof signature verification failed' };
      }
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
