import { describe, it, expect } from 'vitest';
import {
  InformationClassifier
} from '../src/redqueen/metabolism/classifier';
import {
  InformationEvaluator
} from '../src/redqueen/metabolism/evaluator';
import {
  InformationCategory,
  InformationSourceType,
  InformationRecord
} from '../src/redqueen/metabolism/types';
import { normalizeInformation } from '../src/redqueen/metabolism/normalizer';

describe('P4 Metabolism: Information Classification', () => {
  const classifier = new InformationClassifier();

  it('classifies cybersecurity content correctly', () => {
    const { normalized } = normalizeInformation({
      sourceType: InformationSourceType.PUBLIC_WEB,
      sourceUri: 'https://security.advisories/cve-2024-9999',
      content: 'Critical vulnerability detected: CVE-2024-9999 remote code execution via buffer overflow in authentication firewall.'
    });

    const result = classifier.classify(normalized);
    expect(result.primaryCategory).toBe(InformationCategory.CYBERSECURITY);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('classifies networking content correctly', () => {
    const { normalized } = normalizeInformation({
      sourceType: InformationSourceType.DOCUMENT,
      sourceUri: 'https://protocols.org/kademlia',
      content: 'Kademlia distributed hash table uses 160-bit XOR distance metrics across k-buckets for routing peer packets over UDP and TCP sockets.'
    });

    const result = classifier.classify(normalized);
    expect(result.primaryCategory).toBe(InformationCategory.NETWORKING);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('classifies programming and software content correctly', () => {
    const { normalized } = normalizeInformation({
      sourceType: InformationSourceType.DOCUMENT,
      content: 'TypeScript function refactoring with async promises, closures, interfaces, and compiler typing algorithms in a git repository.'
    });

    const result = classifier.classify(normalized);
    expect(result.primaryCategory).toBe(InformationCategory.PROGRAMMING);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('classifies artificial intelligence content correctly', () => {
    const { normalized } = normalizeInformation({
      sourceType: InformationSourceType.DOCUMENT,
      content: 'Neural network training with transformer embeddings, LLM inference prompt engineering, and cognitive agents reasoning pipelines.'
    });

    const result = classifier.classify(normalized);
    expect(result.primaryCategory).toBe(InformationCategory.AI);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('falls back to UNKNOWN for unclassifiable text', () => {
    const { normalized } = normalizeInformation({
      sourceType: InformationSourceType.LOCAL_DATA,
      content: 'The quick brown fox jumps over the lazy dog in the sunny meadow.'
    });

    const result = classifier.classify(normalized);
    expect(result.primaryCategory).toBe(InformationCategory.UNKNOWN);
    expect(result.confidence).toBeLessThanOrEqual(0.3);
  });
});

describe('P4 Metabolism: Relevance & Quality Evaluation', () => {
  const evaluator = new InformationEvaluator();
  const classifier = new InformationClassifier();

  it('scores high relevance for aligned cell specialization', () => {
    const { normalized } = normalizeInformation({
      sourceType: InformationSourceType.DOCUMENT,
      content: 'Routing table packet latency optimization in Kademlia DHT p2p mesh.'
    });
    const classification = classifier.classify(normalized);

    const evaluation = evaluator.evaluateRelevance(normalized, classification, {
      cellId: 'node_test_1',
      specialization: 'NETWORKING'
    });

    expect(evaluation.relevanceScore).toBeGreaterThanOrEqual(0.7);
    expect(evaluation.matchedSpecialization).toBe('NETWORKING');
  });

  it('scores lower relevance for orthogonal cell specialization', () => {
    const { normalized } = normalizeInformation({
      sourceType: InformationSourceType.DOCUMENT,
      content: 'Microservice container deployment with Kubernetes and Docker.'
    });
    const classification = classifier.classify(normalized);

    const evaluation = evaluator.evaluateRelevance(normalized, classification, {
      cellId: 'node_test_1',
      specialization: 'CRYPTO_ANALYSIS'
    });

    expect(evaluation.relevanceScore).toBeLessThan(0.5);
  });

  it('boosts relevance when matching active Cell goals', () => {
    const { normalized } = normalizeInformation({
      sourceType: InformationSourceType.DOCUMENT,
      content: 'Detailed analysis of zero-day vulnerabilities in enterprise firmware.'
    });
    const classification = classifier.classify(normalized);

    const withoutGoals = evaluator.evaluateRelevance(normalized, classification, {
      cellId: 'node_test_1',
      specialization: 'NETWORKING',
      activeGoals: []
    });

    const withGoals = evaluator.evaluateRelevance(normalized, classification, {
      cellId: 'node_test_1',
      specialization: 'NETWORKING',
      activeGoals: ['analyze_vulnerabilities', 'audit_firmware']
    });

    expect(withGoals.relevanceScore).toBeGreaterThan(withoutGoals.relevanceScore);
  });

  it('evaluates quality and confidence with source credibility differences', () => {
    const { normalized: cellRecord } = normalizeInformation({
      sourceType: InformationSourceType.CELL_KNOWLEDGE,
      content: '# Verified Knowledge\nStructured analysis with ```code``` blocks.\n- Fact 1\n- Fact 2'
    });
    const classCell = classifier.classify(cellRecord);
    const qualCell = evaluator.evaluateQuality(cellRecord, classCell);

    const { normalized: webRecord } = normalizeInformation({
      sourceType: InformationSourceType.PUBLIC_WEB,
      content: '# Web Knowledge\nStructured analysis with ```code``` blocks.\n- Fact 1\n- Fact 2'
    });
    const classWeb = classifier.classify(webRecord);
    const qualWeb = evaluator.evaluateQuality(webRecord, classWeb);

    expect(qualCell.factors.sourceCredibility).toBeGreaterThan(qualWeb.factors.sourceCredibility);
    expect(qualCell.qualityScore).toBeGreaterThan(qualWeb.qualityScore);
    expect(qualCell.confidence).toBeGreaterThan(0.5);
    expect(qualCell.confidence).toBeLessThanOrEqual(1.0);
  });

  it('never outputs NaN or Infinity in quality or relevance evaluations', () => {
    const { normalized } = normalizeInformation({
      sourceType: InformationSourceType.LOCAL_DATA,
      content: 'Short content'
    });
    const classification = classifier.classify(normalized);
    const relevance = evaluator.evaluateRelevance(normalized, classification, {
      cellId: 'node_1',
      specialization: null
    });
    const quality = evaluator.evaluateQuality(normalized, classification);

    expect(Number.isFinite(relevance.relevanceScore)).toBe(true);
    expect(Number.isNaN(relevance.relevanceScore)).toBe(false);
    expect(Number.isFinite(quality.qualityScore)).toBe(true);
    expect(Number.isNaN(quality.qualityScore)).toBe(false);
    expect(Number.isFinite(quality.confidence)).toBe(true);
    expect(Number.isNaN(quality.confidence)).toBe(false);
  });
});
