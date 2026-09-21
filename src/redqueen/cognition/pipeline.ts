import { z } from 'zod';
import { AIProvider } from './ai-provider';
import { MemoryStore, MemoryEntry, MemoryCategory } from '../memory/store';
import { logger } from '../core/logger';
import { randomUUID } from 'crypto';
import { computeDeterministicHash } from '../core/canonical';

export const AIReasoningSchema = z.object({
  goal: z.string(),
  hypotheses: z.array(z.string()),
  evidence: z.array(z.string()),
  actions: z.array(z.object({
    type: z.string(),
    payload: z.any()
  })),
  confidence: z.number(),
  verification: z.array(z.string())
});

export type AIReasoning = z.infer<typeof AIReasoningSchema>;

/**
 * Explicit contract for legacy cognition adapters.
 * Ensures caller acknowledges legacy status and cannot accidentally bypass epistemic/evidence controls.
 */
export interface LegacyCognitionAdapter {
  readonly isLegacy: boolean;
  readonly cellId: string;
  executeCycle(observation: string, options?: { allowLegacyUnsafeExecution?: boolean }): Promise<void>;
}

/**
 * @deprecated LEGACY SUBSYSTEM / ADAPTER:
 * CognitionPipeline represents the early, non-canonical LLM direct-prompting prototype.
 *
 * CANONICAL ARCHITECTURE:
 * The single canonical production cognitive orchestrator is `CognitiveRuntime`.
 * Production flow topology:
 * Cell -> CognitiveRuntime -> cognition organs (Understanding / Reasoning / Collective) -> WorldModel -> Action/Feedback.
 *
 * This class is retained strictly as an isolated legacy adapter and MUST NOT be activated
 * as a secondary autonomous brain in production. Accidental production execution is prevented
 * unless explicitly allowed via `allowLegacyUnsafeExecution: true`.
 */
export class CognitionPipeline implements LegacyCognitionAdapter {
  public readonly isLegacy = true;
  private readonly component = 'cognition_pipeline';

  constructor(
    private readonly ai: AIProvider,
    private readonly memory: MemoryStore,
    public readonly cellId: string
  ) {}

  /**
   * Executes the legacy non-canonical cognition cycle.
   * Blocked by default to prevent accidental production activation and bypass of epistemic controls.
   */
  async executeCycle(observation: string, options?: { allowLegacyUnsafeExecution?: boolean }): Promise<void> {
    if (!options?.allowLegacyUnsafeExecution) {
      logger.warn(this.component, 'legacy_execution_prevented', {
        cellId: this.cellId,
        reason: 'Direct invocation of legacy CognitionPipeline is blocked. Use CognitiveRuntime canonical orchestrator.'
      });
      throw new Error(
        `LEGACY_PIPELINE_ACTIVATION_BLOCKED: CognitionPipeline.executeCycle() is an isolated legacy subsystem and cannot bypass epistemic controls. Use CognitiveRuntime as the canonical production cognitive orchestrator (or pass allowLegacyUnsafeExecution: true for legacy testing).`
      );
    }

    logger.warn(this.component, 'legacy_cycle_started_unsafe_mode', { cellId: this.cellId, observation });

    // 1. OBSERVE & NORMALIZE (In a fuller implementation, normalizers clean the input)
    const normalizedObservation = observation.trim().toLowerCase();

    // 2. RETRIEVE MEMORY
    // Simple mock retrieval for now - could use embeddings in real life
    const recentMemories = await this.memory.search({}); 
    const context = recentMemories.slice(-5).map(m => m.content).join('\n');

    // 3. REASON & 4. PLAN
    const prompt = `
Observation: ${normalizedObservation}
Context: ${context}
Analyze the observation and form a structured plan.
Respond ONLY with a valid JSON matching the exact schema.`;

    const aiResult = await this.ai.generate<AIReasoning>({
      systemPrompt: `You are an autonomous research agent. You must respond ONLY in structured JSON format matching this exact schema:
{
  "goal": "string",
  "hypotheses": ["string"],
  "evidence": ["string"],
  "actions": [{"type": "string", "payload": {}}],
  "confidence": 0.95,
  "verification": ["string"]
}
Allowed action types are: 'query_dht', 'log', 'store_memory', 'noop'.`,
      userPrompt: prompt,
      schema: AIReasoningSchema
    });

    if (!aiResult.success || !aiResult.data) {
      logger.warn(this.component, 'reasoning_failed', { error: aiResult.error });
      return;
    }

    const plan = aiResult.data;
    logger.info(this.component, 'plan_generated', { confidence: plan.confidence, actionCount: plan.actions.length });

    // 5. AUTHORIZE
    // AI is untrusted. We must validate policy.
    for (const action of plan.actions) {
      if (!this.isAuthorized(action)) {
        logger.warn(this.component, 'action_denied', { action });
        return; // Halt on unauthorized action
      }
    }

    // 6. ACTION & 7. OBSERVE RESULT
    const results = [];
    for (const action of plan.actions) {
      try {
        const res = await this.executeActionSafely(action);
        results.push(res);
      } catch (err: any) {
        results.push({ status: 'failed', error: err.message, type: action.type });
      }
    }

    // 8. VERIFY
    const verified = this.verifyResults(results, plan.verification);
    if (!verified) {
      logger.warn(this.component, 'verification_failed', { results });
      return;
    }

    // 9. STORE
    const content = { observation, plan, results };
    const entry: MemoryEntry = {
      id: randomUUID(),
      cellId: this.cellId,
      category: MemoryCategory.EPISODIC,
      content,
      source: 'cognition_pipeline',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confidence: plan.confidence,
      hash: computeDeterministicHash(content),
      provenance: [this.cellId]
    };
    
    await this.memory.put(entry);
    logger.info(this.component, 'cycle_completed', { memoryId: entry.id });
  }

  private isAuthorized(action: any): boolean {
    // Policy validator
    const allowedActions = ['query_dht', 'log', 'store_memory', 'noop'];
    return allowedActions.includes(action.type);
  }

  private async executeActionSafely(action: any): Promise<any> {
    // Action Executor must NOT pretend to succeed if it didn't run.
    logger.debug(this.component, 'executing_action', { type: action.type });
    
    if (action.type === 'log') {
      logger.info('action_executor', 'log_action', { payload: action.payload });
      return { status: 'executed', type: 'log' };
    }
    
    if (action.type === 'noop') {
      return { status: 'executed', type: 'noop' };
    }
    
    // Explicitly flag missing implementations instead of faking them.
    logger.warn(this.component, 'action_not_implemented', { type: action.type });
    throw new Error(`ACTION_NOT_IMPLEMENTED: ${action.type}`);
  }

  private verifyResults(results: any[], criteria: string[]): boolean {
    // Check if the results meet the verification criteria
    // Explicitly fail if we encounter unimplemented actions that threw an error.
    return results.every(r => r.status === 'executed');
  }
}
