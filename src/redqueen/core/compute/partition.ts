import {
  CommunicationProfile,
  ComputePartition,
  ComputePartitionSchema,
  CreateComputePartitionInput,
  CreateComputePartitionInputSchema
} from './types';
import { CellComputationalCapability } from '../state/types';
import { logger } from '../logger';
import {
  canonicalSerialize,
  computeCanonicalHash,
  computeHash,
  deepFreeze
} from '../canonical';

export { canonicalSerialize, computeHash, deepFreeze };

/**
 * Detailed breakdown of collective capacity metrics.
 */
export interface CollectiveCapacityDetails {
  nominalCapacity: number;
  effectiveCapacity: number;
  coordinationEfficiency: number;
  latencyPenalty: number;
  heterogeneityPenalty: number;
  concurrencyScalingFactor: number;
}

/**
 * Calculates effective collective capacity for a set of compute partitions.
 * Refuses the naive assumption that sum(capacity) equals effective collective capacity.
 * Attenuation model accounts for:
 * 1. Concurrency coordination overhead across N partitions (Universal Scalability Law / Amdahl).
 * 2. Communication latency and reliability overhead.
 * 3. Heterogeneous architecture translation overhead.
 * 4. Partition availability boundaries.
 */
export function calculateEffectiveCollectiveCapacity(
  partitions: readonly ComputePartition[]
): CollectiveCapacityDetails {
  if (partitions.length === 0) {
    return {
      nominalCapacity: 0,
      effectiveCapacity: 0,
      coordinationEfficiency: 1,
      latencyPenalty: 0,
      heterogeneityPenalty: 0,
      concurrencyScalingFactor: 1
    };
  }

  const nominalCapacity = partitions.reduce((sum, p) => sum + p.capacity, 0);

  if (partitions.length === 1) {
    const p = partitions[0];
    const reliability = p.communicationProfile.reliability;
    const availability = p.availability;
    const efficiency = availability * reliability;
    const effective = Math.round(p.capacity * efficiency * 100) / 100;
    return {
      nominalCapacity,
      effectiveCapacity: effective,
      coordinationEfficiency: Math.round(efficiency * 10000) / 10000,
      latencyPenalty: 0,
      heterogeneityPenalty: 0,
      concurrencyScalingFactor: 1
    };
  }

  // 1. Concurrency coordination overhead: E_scale = 1 / (1 + beta * (N - 1))
  const n = partitions.length;
  const beta = 0.04; // 4% coordination overhead per additional partition
  const concurrencyScalingFactor = 1 / (1 + beta * (n - 1));

  // 2. Communication Latency & Reliability factor
  const avgLatency = partitions.reduce((sum, p) => sum + p.communicationProfile.latency, 0) / n;
  const avgReliability = partitions.reduce((sum, p) => sum + p.communicationProfile.reliability, 0) / n;
  const latencyFactor = 1 / (1 + 0.005 * avgLatency);
  const commFactor = latencyFactor * avgReliability;
  const latencyPenalty = Math.round((1 - latencyFactor) * 10000) / 10000;

  // 3. Heterogeneity penalty: heterogeneous architectures require translation / dispatch overhead
  const architectures = new Set(partitions.map(p => p.architecture));
  const heterogeneityPenalty = architectures.size > 1 ? 0.08 : 0; // 8% penalty if mixed architectures
  const heterogeneityFactor = 1 - heterogeneityPenalty;

  // 4. Availability factor: effective throughput is governed by collective availability
  const avgAvailability = partitions.reduce((sum, p) => sum + p.availability, 0) / n;

  // Total coordination efficiency
  const totalEfficiency = concurrencyScalingFactor * commFactor * heterogeneityFactor * avgAvailability;
  const effectiveCapacity = Math.round(nominalCapacity * totalEfficiency * 100) / 100;

  return {
    nominalCapacity,
    effectiveCapacity,
    coordinationEfficiency: Math.round(totalEfficiency * 10000) / 10000,
    latencyPenalty,
    heterogeneityPenalty,
    concurrencyScalingFactor: Math.round(concurrencyScalingFactor * 10000) / 10000
  };
}

/**
 * Generates the semantic payload of a ComputePartition.
 * Runtime metadata and execution details are strictly excluded.
 */
export function generatePartitionSemanticPayload(input: CreateComputePartitionInput): Record<string, unknown> {
  return {
    cellIdentity: input.cellIdentity,
    name: input.name,
    architecture: input.architecture,
    capacity: input.capacity,
    parallelism: input.parallelism,
    memory: input.memory,
    specialization: input.specialization,
    availability: input.availability,
    communicationProfile: {
      bandwidth: input.communicationProfile.bandwidth,
      latency: input.communicationProfile.latency,
      topology: input.communicationProfile.topology,
      reliability: input.communicationProfile.reliability
    }
  };
}

/**
 * Computes deterministic semantic partition ID with full 256-bit SHA-256 hash.
 */
export function computePartitionId(input: CreateComputePartitionInput): string {
  const semanticPayload = generatePartitionSemanticPayload(input);
  return `part_${computeCanonicalHash(semanticPayload)}`;
}

/**
 * Creates an immutable, canonical ComputePartition with deterministic identity.
 */
export function createComputePartition(input: CreateComputePartitionInput): ComputePartition {
  const validated = CreateComputePartitionInputSchema.parse(input);
  const partitionId = computePartitionId(validated);
  const partition: ComputePartition = {
    ...validated,
    runtimeMetadata: validated.runtimeMetadata ? structuredClone(validated.runtimeMetadata) : {},
    partitionId
  };
  return deepFreeze(partition);
}

/**
 * Creates a new ComputePartition reflecting changes without mutating the existing partition.
 */
export function updateComputePartition(
  current: ComputePartition,
  updates: Partial<CreateComputePartitionInput>
): ComputePartition {
  const updatedInput: CreateComputePartitionInput = {
    cellIdentity: updates.cellIdentity ?? current.cellIdentity,
    name: updates.name ?? current.name,
    architecture: updates.architecture ?? current.architecture,
    capacity: updates.capacity ?? current.capacity,
    parallelism: updates.parallelism ?? current.parallelism,
    memory: updates.memory ?? current.memory,
    specialization: updates.specialization ?? current.specialization,
    availability: updates.availability ?? current.availability,
    communicationProfile: updates.communicationProfile
      ? { ...current.communicationProfile, ...updates.communicationProfile }
      : current.communicationProfile,
    runtimeMetadata: updates.runtimeMetadata ?? current.runtimeMetadata
  };
  return createComputePartition(updatedInput);
}

/**
 * Integrates multiple ComputePartitions into a canonical CellComputationalCapability (R2 compatible).
 * Calculates realistic effective collective capacity rather than assuming sum(capacity).
 */
export function aggregateCapabilities(
  partitions: ComputePartition[],
  overrides?: Partial<Omit<CellComputationalCapability, 'partitions'>>
): CellComputationalCapability {
  if (partitions.length === 0) {
    return {
      architecture: overrides?.architecture ?? 'generic',
      capacity: overrides?.capacity ?? 0,
      parallelism: overrides?.parallelism ?? 1,
      memoryLimit: overrides?.memoryLimit ?? 0,
      availability: overrides?.availability ?? 1,
      communicationProfile: overrides?.communicationProfile ?? {
        bandwidth: 0,
        latency: 0,
        topology: 'none',
        reliability: 1,
        nominalCapacity: 0,
        effectiveCollectiveCapacity: 0,
        coordinationEfficiency: 1,
        isDerivedSummary: true
      },
      partitions: []
    };
  }

  // Sort partitions canonically by partitionId
  const sortedPartitions = [...partitions].sort((a, b) => a.partitionId.localeCompare(b.partitionId));

  const totalParallelism = sortedPartitions.reduce((sum, p) => sum + p.parallelism, 0);
  const totalMemory = sortedPartitions.reduce((sum, p) => sum + p.memory, 0);
  const avgAvailability = sortedPartitions.reduce((sum, p) => sum + p.availability, 0) / sortedPartitions.length;

  const architectures = new Set(sortedPartitions.map(p => p.architecture));
  const architecture = architectures.size === 1
    ? sortedPartitions[0].architecture
    : 'heterogeneous';

  const totalBandwidth = sortedPartitions.reduce((sum, p) => sum + p.communicationProfile.bandwidth, 0);
  const avgLatency = sortedPartitions.reduce((sum, p) => sum + p.communicationProfile.latency, 0) / sortedPartitions.length;
  const avgReliability = sortedPartitions.reduce((sum, p) => sum + p.communicationProfile.reliability, 0) / sortedPartitions.length;
  const topologies = Array.from(new Set(sortedPartitions.map(p => p.communicationProfile.topology))).sort().join('+');

  // Compute realistic collective capacity
  const capacityDetails = calculateEffectiveCollectiveCapacity(sortedPartitions);

  // Aggregate representasi adalah 'derived operational summary', 
  // bukan jaminan 'actual composed performance' layaknya super CPU fisik.
  const communicationProfile: Record<string, unknown> = {
    bandwidth: totalBandwidth,
    latency: avgLatency,
    topology: topologies,
    reliability: avgReliability,
    nominalCapacity: capacityDetails.nominalCapacity,
    effectiveCollectiveCapacity: capacityDetails.effectiveCapacity,
    coordinationEfficiency: capacityDetails.coordinationEfficiency,
    latencyPenalty: capacityDetails.latencyPenalty,
    heterogeneityPenalty: capacityDetails.heterogeneityPenalty,
    concurrencyScalingFactor: capacityDetails.concurrencyScalingFactor,
    isDerivedSummary: true
  };

  return {
    architecture: overrides?.architecture ?? architecture,
    capacity: overrides?.capacity ?? capacityDetails.effectiveCapacity,
    parallelism: overrides?.parallelism ?? totalParallelism,
    memoryLimit: overrides?.memoryLimit ?? totalMemory,
    availability: overrides?.availability ?? avgAvailability,
    communicationProfile: overrides?.communicationProfile ?? communicationProfile,
    partitions: sortedPartitions
  };
}

/**
 * Manager class providing high-level management of compute partitions.
 */
export class ComputePartitionManager {
  public createPartition(input: CreateComputePartitionInput): ComputePartition {
    const partition = createComputePartition(input);
    logger.debug('ComputePartitionManager', 'partition_created', {
      cellIdentity: partition.cellIdentity,
      partitionId: partition.partitionId,
      name: partition.name
    });
    return partition;
  }

  public updatePartition(
    current: ComputePartition,
    updates: Partial<CreateComputePartitionInput>
  ): ComputePartition {
    const updated = updateComputePartition(current, updates);
    logger.debug('ComputePartitionManager', 'partition_updated', {
      cellIdentity: current.cellIdentity,
      oldPartitionId: current.partitionId,
      newPartitionId: updated.partitionId
    });
    return updated;
  }

  public generatePartitionId(input: CreateComputePartitionInput): string {
    return computePartitionId(input);
  }

  public aggregate(
    partitions: ComputePartition[],
    overrides?: Partial<Omit<CellComputationalCapability, 'partitions'>>
  ): CellComputationalCapability {
    return aggregateCapabilities(partitions, overrides);
  }
}
