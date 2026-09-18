import { canonicalSerialize, computeCanonicalHash } from '../core/canonical';
import {
  DomainKind,
  FeedbackDomainObject,
  DomainComputationResultSchema,
  DomainObservationSchema,
  DomainExperienceSchema,
  DomainEvidenceSchema,
  DomainEpistemicTruthSchema,
  DomainLearningUpdateSchema,
  DomainEvolutionTelemetrySchema,
  DomainMitosisDecisionSchema
} from './types';
import { DomainSerializationError, SemanticBoundaryViolationError } from './errors';

/**
 * Deep freezes an object recursively to guarantee absolute immutability.
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const prop = (obj as any)[key];
    if (prop !== null && typeof prop === 'object' && !Object.isFrozen(prop)) {
      deepFreeze(prop);
    }
  }
  return obj;
}

/**
 * Serializes any Red Queen domain feedback contract using RFC 8785 canonical JSON.
 * Guarantees key ordering determinism and cryptographic reproducibility.
 */
export function serializeDomainContract(domainObj: FeedbackDomainObject): string {
  if (!domainObj || typeof domainObj !== 'object' || !domainObj.domainKind) {
    throw new DomainSerializationError(
      'UNKNOWN',
      'Cannot serialize invalid domain object: missing domainKind or payload'
    );
  }

  // Schema-specific validation prior to serialization
  try {
    switch (domainObj.domainKind) {
      case DomainKind.COMPUTATION_RESULT:
        DomainComputationResultSchema.parse(domainObj);
        break;
      case DomainKind.OBSERVATION:
        DomainObservationSchema.parse(domainObj);
        break;
      case DomainKind.EXPERIENCE:
        DomainExperienceSchema.parse(domainObj);
        break;
      case DomainKind.EVIDENCE:
        DomainEvidenceSchema.parse(domainObj);
        break;
      case DomainKind.EPISTEMIC_TRUTH:
        DomainEpistemicTruthSchema.parse(domainObj);
        break;
      case DomainKind.LEARNING_UPDATE:
        DomainLearningUpdateSchema.parse(domainObj);
        break;
      case DomainKind.EVOLUTION_TELEMETRY:
        DomainEvolutionTelemetrySchema.parse(domainObj);
        break;
      case DomainKind.MITOSIS_DECISION:
        DomainMitosisDecisionSchema.parse(domainObj);
        break;
      default:
        throw new DomainSerializationError(
          (domainObj as any).domainKind || 'UNKNOWN',
          `Unknown domainKind: ${(domainObj as any).domainKind}`
        );
    }
  } catch (err: any) {
    if (err instanceof DomainSerializationError) throw err;
    throw new DomainSerializationError(
      domainObj.domainKind,
      `Schema validation failed before serialization: ${err.message}`,
      err
    );
  }

  // Produce canonical RFC 8785 JSON representation
  return canonicalSerialize(domainObj);
}

/**
 * Deserializes a canonical JSON string into a validated, immutable domain object.
 * Optionally enforces the expected domainKind.
 */
export function deserializeDomainContract<T extends FeedbackDomainObject = FeedbackDomainObject>(
  serialized: string,
  expectedKind?: DomainKind
): Readonly<T> {
  if (!serialized || typeof serialized !== 'string') {
    throw new DomainSerializationError('UNKNOWN', 'Serialized input must be a non-empty string');
  }

  let rawParsed: any;
  try {
    rawParsed = JSON.parse(serialized);
  } catch (err: any) {
    throw new DomainSerializationError('UNKNOWN', `Malformed JSON: ${err.message}`);
  }

  // Prototype pollution guard
  if (
    rawParsed === null ||
    typeof rawParsed !== 'object' ||
    Array.isArray(rawParsed) ||
    Object.prototype.hasOwnProperty.call(rawParsed, '__proto__') ||
    Object.prototype.hasOwnProperty.call(rawParsed, 'prototype') ||
    (Object.prototype.hasOwnProperty.call(rawParsed, 'constructor') && rawParsed.constructor !== Object) ||
    serialized.includes('"__proto__"')
  ) {
    throw new DomainSerializationError('UNKNOWN', 'Security violation: prototype pollution attempt detected');
  }

  const domainKind = rawParsed.domainKind as DomainKind;
  if (!domainKind || !Object.values(DomainKind).includes(domainKind)) {
    throw new DomainSerializationError(
      domainKind || 'UNKNOWN',
      `Missing or invalid domainKind: ${domainKind}`
    );
  }

  // Enforce expected domain if specified
  if (expectedKind && domainKind !== expectedKind) {
    throw new SemanticBoundaryViolationError(
      expectedKind,
      domainKind,
      `Deserialization expected domain ${expectedKind} but received ${domainKind}`
    );
  }

  // Parse and validate strictly by domain schema
  let validated: FeedbackDomainObject;
  try {
    switch (domainKind) {
      case DomainKind.COMPUTATION_RESULT:
        validated = DomainComputationResultSchema.parse(rawParsed);
        break;
      case DomainKind.OBSERVATION:
        validated = DomainObservationSchema.parse(rawParsed);
        break;
      case DomainKind.EXPERIENCE:
        validated = DomainExperienceSchema.parse(rawParsed);
        break;
      case DomainKind.EVIDENCE:
        validated = DomainEvidenceSchema.parse(rawParsed);
        break;
      case DomainKind.EPISTEMIC_TRUTH:
        validated = DomainEpistemicTruthSchema.parse(rawParsed);
        break;
      case DomainKind.LEARNING_UPDATE:
        validated = DomainLearningUpdateSchema.parse(rawParsed);
        break;
      case DomainKind.EVOLUTION_TELEMETRY:
        validated = DomainEvolutionTelemetrySchema.parse(rawParsed);
        break;
      case DomainKind.MITOSIS_DECISION:
        validated = DomainMitosisDecisionSchema.parse(rawParsed);
        break;
      default:
        throw new DomainSerializationError(domainKind, `Unsupported domainKind: ${domainKind}`);
    }
  } catch (err: any) {
    if (err instanceof DomainSerializationError || err instanceof SemanticBoundaryViolationError) throw err;
    throw new DomainSerializationError(
      domainKind,
      `Schema validation failed during deserialization: ${err.message}`,
      err
    );
  }

  return deepFreeze(validated as T);
}
