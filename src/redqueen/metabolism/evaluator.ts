import {
  InformationCategory,
  InformationRecord,
  InformationSourceType,
  QualityEvaluation,
  RelevanceEvaluation
} from './types';
import { ClassificationResult } from './classifier';

export interface CellEvaluationContext {
  readonly cellId: string;
  readonly specialization?: string | null;
  readonly activeGoals?: readonly string[];
  readonly knownHashesCount?: number;
}

export class InformationEvaluator {
  private readonly sourceCredibilityMap: Record<InformationSourceType, number> = {
    [InformationSourceType.CELL_KNOWLEDGE]: 0.95,
    [InformationSourceType.DOCUMENT]: 0.85,
    [InformationSourceType.USER_PROVIDED]: 0.80,
    [InformationSourceType.LOCAL_DATA]: 0.75,
    [InformationSourceType.API]: 0.70,
    [InformationSourceType.PUBLIC_WEB]: 0.60
  };

  /**
   * Evaluates relevance of an information record relative to a Cell's individual specialization and active goals.
   */
  public evaluateRelevance(
    record: InformationRecord,
    classification: ClassificationResult,
    context?: CellEvaluationContext
  ): RelevanceEvaluation {
    const specialization = (context?.specialization || '').toUpperCase().trim();
    const activeGoals = context?.activeGoals || [];
    const matchedCategories: InformationCategory[] = [];

    let specializationScore = 0.3; // Baseline general relevance
    let matchReason = 'General baseline relevance';

    if (specialization) {
      // Map specialization to relevant categories
      const specCategoryMap: Record<string, InformationCategory[]> = {
        NETWORKING: [InformationCategory.NETWORKING, InformationCategory.CYBERSECURITY, InformationCategory.COMPUTER_SCIENCE],
        PROGRAMMING: [InformationCategory.PROGRAMMING, InformationCategory.SOFTWARE, InformationCategory.COMPUTER_SCIENCE],
        RECON: [InformationCategory.CYBERSECURITY, InformationCategory.NETWORKING, InformationCategory.GENERAL_TECHNOLOGY],
        PERIMETER_AUDIT: [InformationCategory.CYBERSECURITY, InformationCategory.NETWORKING],
        SECURITY: [InformationCategory.CYBERSECURITY, InformationCategory.OPERATING_SYSTEM, InformationCategory.NETWORKING],
        INCIDENT_RESPONSE: [InformationCategory.CYBERSECURITY, InformationCategory.OPERATING_SYSTEM],
        CRYPTO_ANALYSIS: [InformationCategory.CYBERSECURITY, InformationCategory.COMPUTER_SCIENCE, InformationCategory.PROGRAMMING],
        EXPLOIT_ANALYSIS: [InformationCategory.CYBERSECURITY, InformationCategory.OPERATING_SYSTEM, InformationCategory.PROGRAMMING],
        FORENSICS: [InformationCategory.CYBERSECURITY, InformationCategory.OPERATING_SYSTEM, InformationCategory.SOFTWARE],
        CORE_ORCHESTRATION: [InformationCategory.SOFTWARE, InformationCategory.COMPUTER_SCIENCE, InformationCategory.NETWORKING],
        AI_RESEARCH: [InformationCategory.AI, InformationCategory.COMPUTER_SCIENCE, InformationCategory.SOFTWARE]
      };

      const targetCategories = specCategoryMap[specialization] || [InformationCategory.GENERAL_TECHNOLOGY];

      if (targetCategories.includes(classification.primaryCategory)) {
        specializationScore = 0.85;
        matchReason = `Direct match between primary category (${classification.primaryCategory}) and specialization (${specialization})`;
        matchedCategories.push(classification.primaryCategory);
      } else {
        // Check secondary category matches
        const secondaryMatch = classification.allScores.find(s => targetCategories.includes(s.category));
        if (secondaryMatch) {
          specializationScore = 0.60;
          matchReason = `Secondary category (${secondaryMatch.category}) aligns with specialization (${specialization})`;
          matchedCategories.push(secondaryMatch.category);
        } else {
          // Weak alignment
          specializationScore = 0.25;
          matchReason = `Information category (${classification.primaryCategory}) is orthogonal to specialization (${specialization})`;
        }
      }
    }

    // Check goal alignment
    let goalBoost = 0.0;
    if (activeGoals.length > 0) {
      const lowerContent = record.content.toLowerCase();
      let matchedGoalCount = 0;
      for (const goal of activeGoals) {
        const goalTokens = goal.toLowerCase().split(/[_\s-]+/).filter(t => t.length > 2);
        const match = goalTokens.some(tok => lowerContent.includes(tok));
        if (match) matchedGoalCount++;
      }
      if (matchedGoalCount > 0) {
        goalBoost = Math.min(0.25, matchedGoalCount * 0.1);
        matchReason += ` (matched ${matchedGoalCount} active goals)`;
      }
    }

    const rawRelevance = Math.min(1.0, specializationScore + goalBoost);
    const relevanceScore = this.clampUnit(rawRelevance);
    const noveltyScore = 1.0; // Deterministic default novelty for un-indexed records

    return {
      relevanceScore,
      matchedSpecialization: specialization || null,
      noveltyScore,
      reason: matchReason,
      matchedCategories: Object.freeze(matchedCategories)
    };
  }

  /**
   * Evaluates quality and confidence of an incoming information record.
   */
  public evaluateQuality(
    record: InformationRecord,
    classification: ClassificationResult
  ): QualityEvaluation {
    // 1. Source Credibility
    const sourceCredibility = this.sourceCredibilityMap[record.sourceType] ?? 0.50;

    // 2. Content Completeness
    const length = record.content.length;
    let contentCompleteness = 0.5;
    if (length > 100 && length <= 50000) {
      contentCompleteness = 0.85;
    } else if (length > 50000) {
      contentCompleteness = 0.75;
    } else if (length < 30) {
      contentCompleteness = 0.30;
    }

    // 3. Structure Score
    let structureScore = 0.5;
    const hasCodeBlock = record.content.includes('```') || record.content.includes('{') || record.content.includes('function');
    const hasHeaders = record.content.includes('#') || record.content.includes('===');
    const hasLists = record.content.includes('\n- ') || record.content.includes('\n* ') || record.content.includes('\n1. ');
    const isJson = record.contentType === 'application/json';

    let structurePoints = 0;
    if (hasCodeBlock) structurePoints += 0.2;
    if (hasHeaders) structurePoints += 0.15;
    if (hasLists) structurePoints += 0.15;
    if (isJson) structurePoints += 0.25;
    structureScore = Math.min(1.0, 0.4 + structurePoints);

    // Weighted Quality Score
    const qualityScore = this.clampUnit(
      (sourceCredibility * 0.45) +
      (contentCompleteness * 0.35) +
      (structureScore * 0.20)
    );

    // Confidence is calculated from quality combined with classification certainty.
    // Quality is weighted more heavily so high-credibility sources (e.g. CELL_KNOWLEDGE)
    // yield confidence > 0.5 even when content is unclassifiable (classification.confidence = 0).
    const rawConfidence = (qualityScore * 0.7) + (classification.confidence * 0.3);
    const confidence = this.clampUnit(rawConfidence);

    return {
      qualityScore,
      confidence,
      factors: {
        sourceCredibility: this.clampUnit(sourceCredibility),
        contentCompleteness: this.clampUnit(contentCompleteness),
        structureScore: this.clampUnit(structureScore)
      },
      reason: `Quality score calculated from source credibility (${sourceCredibility.toFixed(2)}), completeness (${contentCompleteness.toFixed(2)}), and structural clarity (${structureScore.toFixed(2)})`
    };
  }

  /**
   * Strictly clamps a numeric value into [0.0, 1.0], rejecting NaN and Infinity.
   */
  private clampUnit(val: number): number {
    if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
      return 0.5;
    }
    return Math.max(0.0, Math.min(1.0, val));
  }
}
