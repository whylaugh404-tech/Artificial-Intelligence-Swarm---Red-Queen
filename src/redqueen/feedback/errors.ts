import { DomainKind } from './types';

/**
 * Thrown when code attempts an illegal conversion or cross-contamination
 * between strictly separated domain objects.
 */
export class SemanticBoundaryViolationError extends Error {
  public readonly name = 'SemanticBoundaryViolationError';

  constructor(
    public readonly expectedDomain: DomainKind | string,
    public readonly receivedDomain: DomainKind | string,
    public readonly reason: string,
    public readonly violationContext?: Record<string, unknown>
  ) {
    super(
      `[RedQueen Semantic Boundary Violation] Cannot treat ${receivedDomain} as ${expectedDomain}: ${reason}`
    );
    Object.setPrototypeOf(this, SemanticBoundaryViolationError.prototype);
  }
}

/**
 * Thrown when an inter-domain transition violates causal constraints,
 * missing references, or unauthorized transition logic.
 */
export class InvalidDomainTransitionError extends Error {
  public readonly name = 'InvalidDomainTransitionError';

  constructor(
    public readonly sourceDomain: DomainKind,
    public readonly targetDomain: DomainKind,
    public readonly reason: string,
    public readonly transitionContext?: Record<string, unknown>
  ) {
    super(
      `[RedQueen Invalid Domain Transition] Transition from ${sourceDomain} to ${targetDomain} failed: ${reason}`
    );
    Object.setPrototypeOf(this, InvalidDomainTransitionError.prototype);
  }
}

/**
 * Thrown when serialization/deserialization fails integrity, schema,
 * or cryptographic checksum validation.
 */
export class DomainSerializationError extends Error {
  public readonly name = 'DomainSerializationError';

  constructor(
    public readonly domainKind: DomainKind | 'UNKNOWN',
    public readonly reason: string,
    public readonly details?: unknown
  ) {
    super(
      `[RedQueen Domain Serialization Error] Domain ${domainKind} serialization/deserialization failed: ${reason}`
    );
    Object.setPrototypeOf(this, DomainSerializationError.prototype);
  }
}
