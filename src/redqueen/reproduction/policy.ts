import {
  ReproductionPolicy,
  ReproductionPolicySchema,
  AuthorizationProof,
  AuthorizationVerificationState,
  AuthorizationTrustAnchor,
  StaticTrustAnchor
} from './types';
import { CellState } from '../core/lifecycle';
import { identityCrypto } from '../crypto/identity';
import { logger } from '../core/logger';

export class GovernanceEnforcer {
  private policy: ReproductionPolicy;
  private trustAnchor?: AuthorizationTrustAnchor;
  
  constructor(
    policyConfig?: Partial<ReproductionPolicy>,
    trustAnchor?: AuthorizationTrustAnchor
  ) {
    this.policy = ReproductionPolicySchema.parse(policyConfig || {});
    if (trustAnchor) {
      this.trustAnchor = trustAnchor;
    } else if (this.policy.trustedIssuers && this.policy.trustedIssuers.length > 0) {
      this.trustAnchor = new StaticTrustAnchor(this.policy.trustedIssuers);
    }
  }

  public get policyMemoryCapacity(): number {
    return this.policy.memoryCapacity;
  }

  public get cooldownMs(): number {
    return this.policy.cooldownMs;
  }

  public get populationCeiling(): number {
    return this.policy.populationCeiling;
  }

  public get minMemoryPressure(): number {
    return this.policy.minMemoryPressure;
  }

  public get requireAuthorization(): boolean {
    return this.policy.requireAuthorization;
  }

  public setTrustAnchor(anchor: AuthorizationTrustAnchor): void {
    this.trustAnchor = anchor;
  }

  public getTrustAnchor(): AuthorizationTrustAnchor | undefined {
    return this.trustAnchor;
  }

  public verifyAuthorizationProof(
    proof: unknown,
    expectedSubject: string,
    expectedEventId: string,
    now: number = Date.now()
  ): { valid: boolean; state: AuthorizationVerificationState; reason?: string } {
    if (!proof) {
      return {
        valid: false,
        state: AuthorizationVerificationState.MISSING,
        reason: 'Reproduction lacks explicit creator authorization'
      };
    }

    const p = proof as any;
    if (
      !p ||
      typeof p !== 'object' ||
      !p.payload ||
      typeof p.payload !== 'object' ||
      !p.signature ||
      typeof p.signature !== 'string' ||
      !p.issuerPublicKey ||
      typeof p.issuerPublicKey !== 'string' ||
      typeof p.payload.action !== 'string' ||
      typeof p.payload.subject !== 'string' ||
      typeof p.payload.eventId !== 'string' ||
      typeof p.payload.issuer !== 'string' ||
      typeof p.payload.exp !== 'number'
    ) {
      return {
        valid: false,
        state: AuthorizationVerificationState.INVALID_FORMAT,
        reason: 'Invalid authorization proof format'
      };
    }

    // Check trust anchor if configured
    if (this.trustAnchor) {
      if (!this.trustAnchor.isTrustedIssuer(p.issuerPublicKey, p.payload.issuer)) {
        return {
          valid: false,
          state: AuthorizationVerificationState.UNTRUSTED_ISSUER,
          reason: 'Authorization proof issuer is not a trusted authority'
        };
      }
    }

    // Verify cryptographic signature of the payload
    const payloadString = typeof p.payload === 'string' ? p.payload : JSON.stringify(p.payload);
    const isVerified = identityCrypto.verifySignature(p.issuerPublicKey, payloadString, p.signature);
    if (!isVerified) {
      return {
        valid: false,
        state: AuthorizationVerificationState.INVALID_SIGNATURE,
        reason: 'Authorization proof signature verification failed'
      };
    }

    // Expiration check
    if (p.payload.exp < now) {
      return {
        valid: false,
        state: AuthorizationVerificationState.EXPIRED,
        reason: 'Authorization proof expired'
      };
    }

    // Action check
    if (p.payload.action !== 'reproduce') {
      return {
        valid: false,
        state: AuthorizationVerificationState.WRONG_ACTION,
        reason: 'Authorization proof action mismatch'
      };
    }

    // Subject check (must match parentId)
    if (p.payload.subject !== expectedSubject) {
      return {
        valid: false,
        state: AuthorizationVerificationState.WRONG_SUBJECT,
        reason: 'Authorization proof subject mismatch'
      };
    }

    // EventId check
    if (p.payload.eventId !== expectedEventId) {
      return {
        valid: false,
        state: AuthorizationVerificationState.WRONG_EVENT,
        reason: 'Authorization proof eventId mismatch'
      };
    }

    return {
      valid: true,
      state: AuthorizationVerificationState.VALID
    };
  }

  public validateReproduction(
    parentState: CellState,
    parentMetadata: Record<string, string>,
    currentPopulation: number,
    memoryPressure: number,
    eventId: string,
    parentId: string,
    proof?: AuthorizationProof | any,
    requestTimestamp?: number
  ): { allowed: boolean; reason?: string; verificationState?: AuthorizationVerificationState } {
    if (parentState !== CellState.ACTIVE) {
      return { allowed: false, reason: 'Parent cell is not ACTIVE' };
    }

    if (this.policy.requireAuthorization) {
      const auth = this.verifyAuthorizationProof(proof, parentId, eventId);
      if (!auth.valid) {
        return {
          allowed: false,
          reason: auth.reason,
          verificationState: auth.state
        };
      }
    }

    if (currentPopulation >= this.policy.populationCeiling) {
      return { allowed: false, reason: 'Population ceiling reached' };
    }

    const now = Date.now();
    const reqTime = requestTimestamp || (proof && (proof as any).payload && typeof (proof as any).payload.timestamp === 'number' ? (proof as any).payload.timestamp : now);
    const lastReproStr = parentMetadata['lastReproductionTimestamp'];
    if (lastReproStr) {
      const lastRepro = parseInt(lastReproStr, 10);
      if (!isNaN(lastRepro)) {
        if ((reqTime - lastRepro < this.policy.cooldownMs) || (now - lastRepro < this.policy.cooldownMs)) {
          return { allowed: false, reason: 'Reproduction cooldown active' };
        }
      }
    }

    if (memoryPressure < this.policy.minMemoryPressure) {
      return { allowed: false, reason: 'Insufficient memory pressure for reproduction' };
    }

    return {
      allowed: true,
      verificationState: this.policy.requireAuthorization ? AuthorizationVerificationState.VALID : undefined
    };
  }
}

