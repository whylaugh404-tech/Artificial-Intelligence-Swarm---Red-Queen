import {
  InformationRecord,
  InformationRecordInput,
  InformationSourceType,
  SUPPORTED_CONTENT_TYPES,
  MetabolismBudget,
  DEFAULT_METABOLISM_BUDGET
} from './types';
import { normalizeInformation } from './normalizer';

export interface InformationValidationResult {
  readonly valid: boolean;
  readonly errors?: readonly string[];
  readonly record?: InformationRecord;
}

/**
 * Validates information IDs to prevent path traversal, null bytes, or malformed strings.
 */
export function validateInformationId(id: string): { valid: boolean; reason?: string } {
  if (!id || typeof id !== 'string') {
    return { valid: false, reason: 'Information ID must be a non-empty string' };
  }
  const trimmed = id.trim();
  if (trimmed.length < 1 || trimmed.length > 256) {
    return { valid: false, reason: 'Information ID length must be between 1 and 256 characters' };
  }
  if (
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0') ||
    /%2e|%2f|%5c/i.test(trimmed) ||
    trimmed.startsWith('.')
  ) {
    return { valid: false, reason: `Path traversal or invalid characters detected in information ID: '${id}'` };
  }
  return { valid: true };
}

/**
 * Deep validation of an incoming InformationRecordInput against schema, type safety, and budget rules.
 */
export function validateInformationRecord(
  input: unknown,
  budget: MetabolismBudget = DEFAULT_METABOLISM_BUDGET
): InformationValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      errors: ['Input must be a valid non-null object representing InformationRecordInput']
    };
  }

  const record = input as Partial<InformationRecordInput>;

  // 1. Content validation
  if (typeof record.content !== 'string') {
    errors.push('Content must be a string');
  } else if (record.content.trim().length === 0) {
    errors.push('Content cannot be empty or only whitespace');
  } else if (record.content.length > budget.maxInformationSize) {
    errors.push(`Content size (${record.content.length} chars) exceeds maximum allowed budget (${budget.maxInformationSize} chars)`);
  }

  // 2. Source type validation
  const validSourceTypes = Object.values(InformationSourceType);
  if (!record.sourceType || !validSourceTypes.includes(record.sourceType as InformationSourceType)) {
    errors.push(`Invalid sourceType: '${record.sourceType}'. Supported: ${validSourceTypes.join(', ')}`);
  }

  // 3. Information ID validation (if provided)
  if (record.informationId !== undefined) {
    const idCheck = validateInformationId(record.informationId);
    if (!idCheck.valid) {
      errors.push(idCheck.reason || 'Invalid information ID');
    }
  }

  // 4. Content Type validation (if provided)
  if (record.contentType !== undefined) {
    if (typeof record.contentType !== 'string') {
      errors.push('contentType must be a string');
    } else {
      const normalizedType = record.contentType.trim().toLowerCase();
      const isSupported = (SUPPORTED_CONTENT_TYPES as readonly string[]).includes(normalizedType);
      if (!isSupported) {
        errors.push(`Unsupported contentType: '${record.contentType}'. Supported: ${SUPPORTED_CONTENT_TYPES.join(', ')}`);
      }
    }
  }

  // 5. Timestamp validation (if provided)
  if (record.acquiredAt !== undefined) {
    if (typeof record.acquiredAt !== 'string') {
      errors.push('acquiredAt must be an ISO-8601 string');
    } else {
      const parsedTime = Date.parse(record.acquiredAt);
      if (Number.isNaN(parsedTime)) {
        errors.push(`Invalid acquiredAt timestamp: '${record.acquiredAt}'`);
      } else {
        const now = Date.now();
        // Disallow future timestamp beyond 1 minute skew tolerance
        if (parsedTime > now + 60000) {
          errors.push(`acquiredAt is set in the future (${record.acquiredAt})`);
        }
      }
    }
  }

  // 6. Metadata validation (if provided)
  if (record.metadata !== undefined) {
    if (typeof record.metadata !== 'object' || record.metadata === null || Array.isArray(record.metadata)) {
      errors.push('metadata must be a key-value object');
    } else {
      // Check for illegal float values (NaN, Infinity) inside metadata
      for (const [k, v] of Object.entries(record.metadata)) {
        if (typeof v === 'number' && (!Number.isFinite(v) || Number.isNaN(v))) {
          errors.push(`Metadata key '${k}' contains non-finite number (${v})`);
        }
      }
    }
  }

  // 7. Hash check (if provided by caller, ensure it matches content)
  if (record.contentHash !== undefined) {
    if (typeof record.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(record.contentHash)) {
      errors.push('Provided contentHash is not a valid 64-character lowercase hex string');
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors
    };
  }

  // Normalize valid input
  const { normalized, computedHash } = normalizeInformation(record as InformationRecordInput);

  if (record.contentHash && record.contentHash !== computedHash) {
    return {
      valid: false,
      errors: [`Provided contentHash '${record.contentHash}' does not match computed hash '${computedHash}'`]
    };
  }

  return {
    valid: true,
    record: normalized
  };
}
