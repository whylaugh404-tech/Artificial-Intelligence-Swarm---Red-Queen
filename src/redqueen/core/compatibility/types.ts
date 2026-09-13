import { z } from 'zod';

export type CompatibilityStatus = 'COMPATIBLE' | 'INCOMPATIBLE';

export interface CompatibilityValidationResult {
  status: CompatibilityStatus;
  reasons: string[];
  anomalies: Array<{
    component: string;
    issue: string;
  }>;
}

export const ValidationScopeSchema = z.enum([
  'R1_COMPOSITION',
  'R2_STATE',
  'R3_COMPUTE',
  'R4_COGNITIVE',
  'R5_EMERGENCE',
  'P5_REPRESENTATION'
]);

export type ValidationScope = z.infer<typeof ValidationScopeSchema>;

