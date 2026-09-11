import { z } from 'zod';
import { CellLineage, CellGenome } from '../genome/types';

export const MitosisResultSchema = z.object({
  success: z.boolean(),
  parentCellId: z.string(),
  childCellId: z.string().optional(),
  eventId: z.string(),
  generation: z.number(),
  mutationSummary: z.record(z.string(), z.any()).optional(),
  differentiationSummary: z.record(z.string(), z.any()).optional(),
  inheritedMemorySummary: z.object({
    total: z.number(),
    semantic: z.number(),
    episodic: z.number(),
    procedural: z.number()
  }).optional(),
  lineageRecord: z.any().optional(), // Actually CellLineage
  errors: z.array(z.string()).optional()
});

export type MitosisResult = z.infer<typeof MitosisResultSchema>;

export const AuthorizationProofSchema = z.object({
  payload: z.object({
    action: z.string(),
    subject: z.string(),
    eventId: z.string(),
    exp: z.number(),
    issuer: z.string()
  }),
  signature: z.string(),
  issuerPublicKey: z.string()
});

export type AuthorizationProof = z.infer<typeof AuthorizationProofSchema>;

export const ReproductionPolicySchema = z.object({
  populationCeiling: z.number().int().min(1).default(10),
  cooldownMs: z.number().int().min(0).default(60000), // Minimum time between reproductions
  minMemoryPressure: z.number().min(0.0).max(1.0).default(0.7),
  requireAuthorization: z.boolean().default(true),
  allowDifferentiation: z.boolean().default(true),
  memoryCapacity: z.number().int().min(1).default(100) // Logical capacity for pressure calculation
});

export type ReproductionPolicy = z.infer<typeof ReproductionPolicySchema>;
