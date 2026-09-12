import { z } from 'zod';
import { ContextSchema, Context } from '../epistemic/types';

export const EvidenceProvenanceSchema = z.object({
  sourceId: z.string().min(1),
  observationId: z.string().optional(),
  timestamp: z.string().datetime(),
  derivedFrom: z.array(z.string()).optional(),
  supportingRepresentationIds: z.array(z.string()).optional(),
  contradictingRepresentationIds: z.array(z.string()).optional(),
});
export type EvidenceProvenance = z.infer<typeof EvidenceProvenanceSchema>;

export const EvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  sourceId: z.string().min(1),
  observationId: z.string().optional(),
  timestamp: z.string().datetime(),
  provenance: EvidenceProvenanceSchema,
  context: ContextSchema,
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export function freezeEvidence(evidence: Evidence): Readonly<Evidence> {
  const frozen = { ...evidence };
  frozen.provenance = Object.freeze({
    ...frozen.provenance,
    derivedFrom: frozen.provenance.derivedFrom ? [...frozen.provenance.derivedFrom] : undefined,
    supportingRepresentationIds: frozen.provenance.supportingRepresentationIds ? [...frozen.provenance.supportingRepresentationIds] : undefined,
    contradictingRepresentationIds: frozen.provenance.contradictingRepresentationIds ? [...frozen.provenance.contradictingRepresentationIds] : undefined,
  });
  
  if (frozen.context) {
    const frozenCtx = { ...frozen.context };
    if (frozenCtx.temporalBounds) {
      frozenCtx.temporalBounds = Object.freeze({ ...frozenCtx.temporalBounds });
    }
    frozen.context = Object.freeze(frozenCtx);
  }
  return Object.freeze(frozen);
}
