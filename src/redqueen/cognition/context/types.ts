import { z } from 'zod';
import { createHash } from 'crypto';

export const FormalContextSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  scope: z.string().min(1),
  temporalScope: z.string().optional(),
  assumptions: z.array(z.string()).default([]),
  qualifiers: z.record(z.string(), z.string()).default({}),
  parentContextId: z.string().optional(),
  provenance: z.array(z.string()).default([])
});

export type FormalContext = z.infer<typeof FormalContextSchema>;

export function createFormalContext(params: Partial<Omit<FormalContext, 'id'>> & { domain: string, scope: string }): FormalContext {
  // Create a deterministic representation for hashing
  const dataToHash = {
    domain: params.domain,
    scope: params.scope,
    temporalScope: params.temporalScope || null,
    assumptions: [...(params.assumptions || [])].sort(),
    qualifiers: Object.fromEntries(Object.entries(params.qualifiers || {}).sort()),
    parentContextId: params.parentContextId || null,
  };
  
  const hash = createHash('sha256').update(JSON.stringify(dataToHash)).digest('hex');
  const id = `ctx_${hash}`;
  
  return {
    ...params,
    id,
    assumptions: params.assumptions || [],
    qualifiers: params.qualifiers || {},
    provenance: params.provenance || []
  };
}

export function areContextsEqual(a: FormalContext, b: FormalContext): boolean {
  return a.id === b.id;
}
