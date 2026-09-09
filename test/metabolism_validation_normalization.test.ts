import { describe, it, expect } from 'vitest';
import {
  normalizeContentText,
  stripControlCharacters,
  computeContentHash,
  normalizeInformation
} from '../src/redqueen/metabolism/normalizer';
import {
  validateInformationRecord,
  validateInformationId
} from '../src/redqueen/metabolism/validator';
import {
  InformationSourceType,
  DEFAULT_METABOLISM_BUDGET
} from '../src/redqueen/metabolism/types';

describe('P4 Metabolism: Normalization & Content Integrity', () => {
  it('strips non-printable ASCII control characters but preserves newlines and tabs', () => {
    const raw = 'Header\x00\x01\x02\nLine 1\twith tab\x0B\x0C\x0Eand controls\x7F';
    const cleaned = stripControlCharacters(raw);
    expect(cleaned).toBe('Header\nLine 1\twith taband controls');
  });

  it('normalizes CRLF and CR to standard LF and trims outer whitespace', () => {
    const raw = '  \r\n# Title\r\n\r\nFirst paragraph.\rSecond line.  \r\n';
    const normalized = normalizeContentText(raw);
    expect(normalized).toBe('# Title\n\nFirst paragraph.\nSecond line.');
  });

  it('computes deterministic SHA-256 hash', () => {
    const text = 'Deterministic content for metabolism testing';
    const hash1 = computeContentHash(text);
    const hash2 = computeContentHash(text);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces normalized record with valid computed hash and defaults', () => {
    const { normalized, computedHash } = normalizeInformation({
      sourceType: InformationSourceType.DOCUMENT,
      content: '  # RFC Sample\r\nTechnical notes on TCP/IP.  ',
      sourceUri: 'https://ietf.org/rfc/sample.txt'
    });

    expect(normalized.content).toBe('# RFC Sample\nTechnical notes on TCP/IP.');
    expect(normalized.contentHash).toBe(computedHash);
    expect(normalized.sourceIdentifier).toBe('https://ietf.org/rfc/sample.txt');
    expect(normalized.language).toBe('en');
    expect(normalized.contentType).toBe('text/plain');
  });
});

describe('P4 Metabolism: Input Validation & Safety Constraints', () => {
  it('validates legitimate InformationRecordInput successfully', () => {
    const result = validateInformationRecord({
      sourceType: InformationSourceType.PUBLIC_WEB,
      sourceUri: 'https://nvd.nist.gov/vuln/detail/CVE-2024-1234',
      content: '# CVE-2024-1234 Analysis\nBuffer overflow vulnerability in TCP packet parser.',
      contentType: 'text/markdown'
    });

    expect(result.valid).toBe(true);
    expect(result.record).toBeDefined();
    expect(result.record?.contentHash).toBeDefined();
  });

  it('rejects empty or whitespace-only content', () => {
    const result = validateInformationRecord({
      sourceType: InformationSourceType.DOCUMENT,
      content: '   \n\t  '
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Content cannot be empty or only whitespace');
  });

  it('rejects content exceeding budget size limits', () => {
    const hugeContent = 'A'.repeat(DEFAULT_METABOLISM_BUDGET.maxInformationSize + 10);
    const result = validateInformationRecord({
      sourceType: InformationSourceType.LOCAL_DATA,
      content: hugeContent
    });

    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain('exceeds maximum allowed budget');
  });

  it('rejects invalid or missing sourceType', () => {
    const result = validateInformationRecord({
      sourceType: 'UNRECOGNIZED_SOURCE_TYPE' as any,
      content: 'Valid content text'
    });

    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain('Invalid sourceType');
  });

  it('rejects path traversal and invalid characters in information IDs', () => {
    const invalidIds = [
      '../etc/passwd',
      'foo/bar',
      'foo\\bar',
      '.hidden',
      'id\0nullbyte',
      'id%2fencoded'
    ];

    for (const badId of invalidIds) {
      const check = validateInformationId(badId);
      expect(check.valid).toBe(false);

      const recordCheck = validateInformationRecord({
        informationId: badId,
        sourceType: InformationSourceType.DOCUMENT,
        content: 'Valid content'
      });
      expect(recordCheck.valid).toBe(false);
    }
  });

  it('rejects future timestamps exceeding tolerance', () => {
    const farFuture = new Date(Date.now() + 86400000).toISOString();
    const result = validateInformationRecord({
      sourceType: InformationSourceType.DOCUMENT,
      acquiredAt: farFuture,
      content: 'Valid content'
    });

    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain('acquiredAt is set in the future');
  });

  it('rejects metadata with NaN or Infinity values', () => {
    const result = validateInformationRecord({
      sourceType: InformationSourceType.DOCUMENT,
      content: 'Valid content',
      metadata: {
        normal: 10,
        corrupted: NaN
      }
    });

    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain("Metadata key 'corrupted' contains non-finite number");
  });

  it('rejects mismatched caller-supplied contentHash', () => {
    const result = validateInformationRecord({
      sourceType: InformationSourceType.DOCUMENT,
      content: 'Valid content',
      contentHash: '0000000000000000000000000000000000000000000000000000000000000000'
    });

    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain('does not match computed hash');
  });
});
