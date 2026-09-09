import { createHash } from 'crypto';
import {
  InformationRecord,
  InformationRecordInput,
  InformationSourceType
} from './types';

/**
 * Computes deterministic SHA-256 hash of UTF-8 content string.
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Strips non-printable ASCII control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F)
 * while preserving newlines (\n, 0x0A) and tabs (\t, 0x09).
 */
export function stripControlCharacters(text: string): string {
  if (!text) return '';
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Normalizes line endings to standard LF (\n), trims leading/trailing whitespace,
 * while preserving internal structural indentation.
 */
export function normalizeContentText(rawContent: string): string {
  if (typeof rawContent !== 'string') return '';
  const cleaned = stripControlCharacters(rawContent);
  // Normalize \r\n and \r to \n
  const uniformLines = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return uniformLines.trim();
}

/**
 * Normalizes an identifier string (URI or source tag).
 */
export function normalizeSourceIdentifier(source: string, uri?: string): string {
  if (uri && typeof uri === 'string' && uri.trim().length > 0) {
    return uri.trim();
  }
  if (source && typeof source === 'string' && source.trim().length > 0) {
    return source.trim();
  }
  return 'unknown_source';
}

/**
 * Produces a normalized, deterministic InformationRecord from raw input.
 */
export function normalizeInformation(input: InformationRecordInput): {
  normalized: InformationRecord;
  computedHash: string;
} {
  const normalizedContent = normalizeContentText(input.content);
  const computedHash = computeContentHash(normalizedContent);

  const sourceIdentifier = normalizeSourceIdentifier(
    input.sourceIdentifier || input.sourceType,
    input.sourceUri
  );

  const normalized: InformationRecord = {
    informationId: (input.informationId || `info_${computedHash.slice(0, 16)}_${Date.now()}`).trim(),
    sourceType: input.sourceType as InformationSourceType,
    sourceIdentifier,
    sourceUri: input.sourceUri?.trim(),
    acquiredAt: input.acquiredAt ? new Date(input.acquiredAt).toISOString() : new Date().toISOString(),
    content: normalizedContent,
    contentType: (input.contentType || 'text/plain').trim().toLowerCase(),
    language: (input.language || 'en').trim().toLowerCase(),
    contentHash: computedHash,
    metadata: Object.freeze({ ...(input.metadata || {}) }),
    originatingCellId: input.originatingCellId?.trim()
  };

  return {
    normalized,
    computedHash
  };
}
