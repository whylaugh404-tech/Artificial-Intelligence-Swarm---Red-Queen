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
  confidence: z.number().min(0).max(1).optional(),
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

export enum EvidenceDependencyType {
  INDEPENDENT = 'INDEPENDENT',
  CORRELATED = 'CORRELATED',
  DEPENDENT = 'DEPENDENT',
  UNKNOWN = 'UNKNOWN'
}
export const EvidenceDependencyTypeSchema = z.nativeEnum(EvidenceDependencyType);

export const EvidenceDependencySchema = z.object({
  dependencyId: z.string().min(1),
  evidenceIdA: z.string().min(1),
  evidenceIdB: z.string().min(1),
  type: EvidenceDependencyTypeSchema,
  basis: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  provenance: z.array(z.string().min(1)).min(1),
  createdAt: z.string().datetime(),
});
export type EvidenceDependency = z.infer<typeof EvidenceDependencySchema>;

export function freezeEvidenceDependency(dep: EvidenceDependency): Readonly<EvidenceDependency> {
  const frozen = { ...dep };
  if (frozen.provenance) {
    frozen.provenance = Object.freeze([...frozen.provenance]) as any;
  }
  return Object.freeze(frozen);
}
