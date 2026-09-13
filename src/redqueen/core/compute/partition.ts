import { createHash } from 'crypto';
import {
  CommunicationProfile,
  ComputePartition,
  ComputePartitionSchema,
  CreateComputePartitionInput,
  CreateComputePartitionInputSchema
} from './types';
import { CellComputationalCapability } from '../state/types';
import { logger } from '../logger';

/**
 * Deterministic canonical serialization:
 * Recursively sorts object keys so { a: 1, b: 2 } and { b: 2, a: 1 } yield identical strings.
 */
export function canonicalSerialize(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalSerialize).join(',')}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const parts = keys.map(k => `${JSON.stringify(k)}:${canonicalSerialize((obj as Record<string, unknown>)[k])}`);
  return `{${parts.join(',')}}`;
}

/**
 * 16-character SHA-256 hash digest.
 */
export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').substring(0, 16);
}

/**
 * Recursive deep freeze for strict immutability.
 */
export function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.keys(obj as Record<string, unknown>).forEach(prop => {
      deepFreeze((obj as Record<string, unknown>)[prop]);
    });
    Object.freeze(obj);
  }
  return obj;
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
 * Computes deterministic semantic partition ID.
 */
export function computePartitionId(input: CreateComputePartitionInput): string {
  const semanticPayload = generatePartitionSemanticPayload(input);
  return `part_${computeHash(canonicalSerialize(semanticPayload))}`;
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
        reliability: 1
      },
      partitions: []
    };
  }

  // Sort partitions canonically by partitionId
  const sortedPartitions = [...partitions].sort((a, b) => a.partitionId.localeCompare(b.partitionId));

  const totalCapacity = sortedPartitions.reduce((sum, p) => sum + p.capacity, 0);
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

  const communicationProfile: Record<string, unknown> = {
    bandwidth: totalBandwidth,
    latency: avgLatency,
    topology: topologies,
    reliability: avgReliability
  };

  return {
    architecture: overrides?.architecture ?? architecture,
    capacity: overrides?.capacity ?? totalCapacity,
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
