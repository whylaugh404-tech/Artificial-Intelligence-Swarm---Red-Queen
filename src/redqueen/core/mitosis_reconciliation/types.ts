import { z } from 'zod';
import { CellStateSchema, CellState, CellSpecializationSchema } from '../state/types';

export const PartitionDistributionSchema = z.object({
  childA: z.array(z.string()),
  childB: z.array(z.string())
});

export const MemoryDistributionSchema = z.object({
  childA: z.array(z.string()),
  childB: z.array(z.string())
});

export const MitosisSpecificationSchema = z.object({
  mitosisId: z.string().min(1),
  parentState: CellStateSchema,
  differentiationProfileA: z.array(CellSpecializationSchema),
  differentiationProfileB: z.array(CellSpecializationSchema),
  partitionDistribution: PartitionDistributionSchema,
  memoryDistribution: MemoryDistributionSchema,
  deterministicTimestamp: z.string().datetime().optional()
});

export type MitosisSpecification = z.infer<typeof MitosisSpecificationSchema>;

export const MitosisReconciliationResultSchema = z.object({
  mitosisId: z.string().min(1),
  parentStateId: z.string().min(1),
  childA: CellStateSchema,
  childB: CellStateSchema,
  differentiationMetadata: z.object({
    childA: z.record(z.string(), z.unknown()),
    childB: z.record(z.string(), z.unknown())
  }),
  provenance: z.array(z.string())
});

export type MitosisReconciliationResult = z.infer<typeof MitosisReconciliationResultSchema>;
