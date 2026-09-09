import {
  MetabolismEvent,
  MetabolismEventType,
  MetabolismBudget,
  DEFAULT_METABOLISM_BUDGET
} from './types';
import { logger } from '../core/logger';

export class MetabolismAuditTrail {
  private readonly component = 'metabolism_audit';
  private events: MetabolismEvent[] = [];

  constructor(
    private readonly cellId: string,
    private readonly budget: MetabolismBudget = DEFAULT_METABOLISM_BUDGET
  ) {}

  /**
   * Sanitizes details to ensure no private keys or credentials are recorded in audit logs.
   */
  private sanitizeDetails(details: Record<string, any>): Record<string, any> {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(details)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('privatekey') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey.includes('credential')
      ) {
        clean[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        clean[key] = this.sanitizeDetails(value);
      } else {
        clean[key] = value;
      }
    }
    return clean;
  }

  /**
   * Records a metabolism lifecycle event.
   */
  public recordEvent(
    eventType: MetabolismEventType,
    informationId: string,
    details: Record<string, any> = {},
    knowledgeId?: string
  ): MetabolismEvent {
    const sanitized = this.sanitizeDetails(details);
    const event: MetabolismEvent = {
      eventId: `event_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      eventType,
      cellId: this.cellId,
      informationId,
      knowledgeId,
      timestamp: new Date().toISOString(),
      details: Object.freeze(sanitized)
    };

    this.events.push(event);

    // Ring-buffer bounding
    if (this.events.length > this.budget.maxAuditEventsKept) {
      this.events.splice(0, this.events.length - this.budget.maxAuditEventsKept);
    }

    logger.debug(this.component, 'metabolism_event_recorded', {
      cellId: this.cellId,
      eventType,
      informationId,
      knowledgeId
    });

    return event;
  }

  public getEvents(limit: number = 100): readonly MetabolismEvent[] {
    return Object.freeze(this.events.slice(-limit));
  }

  public getEventsForInformation(informationId: string): readonly MetabolismEvent[] {
    return Object.freeze(this.events.filter(e => e.informationId === informationId));
  }

  public getEventsForKnowledge(knowledgeId: string): readonly MetabolismEvent[] {
    return Object.freeze(this.events.filter(e => e.knowledgeId === knowledgeId));
  }

  public clear(): void {
    this.events = [];
  }
}
