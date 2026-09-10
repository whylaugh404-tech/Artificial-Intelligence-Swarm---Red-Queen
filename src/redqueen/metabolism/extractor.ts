import {
  InformationCategory,
  InformationRecord,
  KnowledgeRecord,
  QualityEvaluation,
  RelevanceEvaluation,
  SourceProvenance,
  MetabolismBudget,
  DEFAULT_METABOLISM_BUDGET
} from './types';

export class KnowledgeExtractor {
  /**
   * Extracts structured KnowledgeRecord from validated and evaluated information.
   */
  public extractKnowledge(
    record: InformationRecord,
    category: InformationCategory,
    relevance: RelevanceEvaluation,
    quality: QualityEvaluation,
    owningCellId: string,
    budget: MetabolismBudget = DEFAULT_METABOLISM_BUDGET
  ): KnowledgeRecord {
    const lines = record.content.split('\n').map(l => l.trim()).filter(Boolean);

    // 1. Extract Title
    let title = '';
    const headerLine = lines.find(l => l.startsWith('# '));
    if (headerLine) {
      title = headerLine.replace(/^#+\s*/, '').trim();
    } else if (lines.length > 0) {
      const firstLine = lines[0].replace(/^[-*#=>\s]+/, '').trim();
      title = firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
    }
    if (!title) {
      title = `Knowledge extracted from ${record.sourceIdentifier}`;
    }

    // 2. Extract Summary
    let summary = '';
    const nonHeaderLines = lines.filter(l => !l.startsWith('#'));
    if (nonHeaderLines.length > 0) {
      summary = nonHeaderLines.slice(0, 4).join(' ');
      if (summary.length > 500) {
        summary = `${summary.slice(0, 497)}...`;
      }
    } else {
      summary = title;
    }

    // 3. Extract Facts (propositions, bullet points, technical identifiers)
    const facts: string[] = [];

    // Extract bullet points
    for (const line of lines) {
      if (/^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
        const fact = line.replace(/^[-*•\d.]+\s*/, '').trim();
        if (fact.length > 5 && !facts.includes(fact)) {
          facts.push(fact);
          if (facts.length >= budget.maxFactsPerRecord) break;
        }
      }
    }

    // Extract CVE patterns (e.g. CVE-2024-1234)
    const cveMatches = record.content.match(/CVE-\d{4}-\d{4,7}/gi) || [];
    const uniqueCves = Array.from(new Set(cveMatches.map(c => c.toUpperCase())));
    for (const cve of uniqueCves) {
      const fact = `Identified vulnerability reference: ${cve}`;
      if (!facts.includes(fact) && facts.length < budget.maxFactsPerRecord) {
        facts.push(fact);
      }
    }

    // Extract IP patterns (e.g. 192.168.1.1)
    const ipMatches = record.content.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
    const uniqueIps = Array.from(new Set(ipMatches)).filter(ip => ip !== '0.0.0.0' && ip !== '127.0.0.1');
    for (const ip of uniqueIps.slice(0, 5)) {
      const fact = `Identified target/host address: ${ip}`;
      if (!facts.includes(fact) && facts.length < budget.maxFactsPerRecord) {
        facts.push(fact);
      }
    }

    // If no bullet points found, extract distinctive sentences
    if (facts.length === 0 && nonHeaderLines.length > 0) {
      const sentences = nonHeaderLines.join(' ').split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 15);
      for (const sentence of sentences.slice(0, Math.min(5, budget.maxFactsPerRecord))) {
        facts.push(sentence);
      }
    }

    // Fallback fact if still empty
    if (facts.length === 0) {
      facts.push(`Metabolized entry from source '${record.sourceIdentifier}' under category '${category}'`);
    }

    // 4. Extract Structured Entities & Metadata
    const structuredContent: Record<string, any> = {
      detectedCategory: category,
      sourceType: record.sourceType,
      cveReferences: uniqueCves,
      ipReferences: uniqueIps,
      contentType: record.contentType,
      contentLength: record.content.length,
      extractedFactsCount: facts.length,
      customMetadata: record.metadata
    };

    const now = new Date().toISOString();

    const provenanceEntry: SourceProvenance = {
      informationId: record.informationId,
      sourceIdentifier: record.sourceIdentifier,
      sourceUri: record.sourceUri,
      contentHash: record.contentHash,
      acquiredAt: record.acquiredAt,
      originatingCellId: record.originatingCellId,
      metabolizedAt: now
    };

    const knowledgeId = `know_${record.contentHash.slice(0, 16)}_${Date.now()}`;

    return {
      knowledgeId,
      owningCellId,
      category,
      title,
      summary,
      facts: Object.freeze(facts),
      relationships: Object.freeze([]),
      contradictions: Object.freeze([]),
      structuredContent: Object.freeze(structuredContent),
      sourceInformationIds: Object.freeze([record.informationId]),
      sourceContentHashes: Object.freeze([record.contentHash]),
      sourceProvenance: Object.freeze([provenanceEntry]),
      reinforcementCount: 0,
      confidence: quality.confidence,
      relevance: relevance.relevanceScore,
      createdAt: now,
      updatedAt: now,
      knowledgeVersion: 1
    };
  }
}
