import { describe, it, expect } from 'vitest';
import {
  createComputePartition,
  updateComputePartition,
  aggregateCapabilities,
  computePartitionId,
  ComputePartitionManager
} from '../src/redqueen/core/compute/partition';
import {
  CreateComputePartitionInput,
  ComputePartitionSchema
} from '../src/redqueen/core/compute/types';
import { CellStateManager } from '../src/redqueen/core/state/engine';
import { LifecycleState } from '../src/redqueen/core/state/types';

describe('R3: Digital Compute Partition', () => {
  const manager = new ComputePartitionManager();

  const validPartitionInput: CreateComputePartitionInput = {
    cellIdentity: 'cell-alpha',
    name: 'Partition 1',
    architecture: 'neural-symbolic',
    capacity: 1000,
    parallelism: 4,
    memory: 8192,
    specialization: 'general',
    availability: 0.95,
    communicationProfile: {
      bandwidth: 1200,
      latency: 2.5,
      topology: 'direct',
      reliability: 0.99
    },
    runtimeMetadata: {
      bootedAt: '2026-09-13T06:00:00Z',
      nodeHost: 'host-worker-1'
    }
  };

  it('1. ComputePartition valid: should construct a valid partition with all fields', () => {
    const partition = createComputePartition(validPartitionInput);

    expect(partition.partitionId).toMatch(/^part_[a-f0-9]{16}$/);
    expect(partition.cellIdentity).toBe('cell-alpha');
    expect(partition.name).toBe('Partition 1');
    expect(partition.architecture).toBe('neural-symbolic');
    expect(partition.capacity).toBe(1000);
    expect(partition.parallelism).toBe(4);
    expect(partition.memory).toBe(8192);
    expect(partition.specialization).toBe('general');
    expect(partition.availability).toBe(0.95);
    expect(partition.communicationProfile).toEqual({
      bandwidth: 1200,
      latency: 2.5,
      topology: 'direct',
      reliability: 0.99
    });

    // Validates against Zod schema
    const parsed = ComputePartitionSchema.parse(partition);
    expect(parsed.partitionId).toBe(partition.partitionId);
  });

  it('2. invalid numeric values ditolak: rejects negative or nonsensical numeric values', () => {
    // Negative capacity
    expect(() => createComputePartition({
      ...validPartitionInput,
      capacity: -10
    })).toThrow();

    // Zero capacity
    expect(() => createComputePartition({
      ...validPartitionInput,
      capacity: 0
    })).toThrow();

    // Non-integer parallelism
    expect(() => createComputePartition({
      ...validPartitionInput,
      parallelism: 2.5
    })).toThrow();

    // Parallelism <= 0
    expect(() => createComputePartition({
      ...validPartitionInput,
      parallelism: 0
    })).toThrow();

    // Negative memory
    expect(() => createComputePartition({
      ...validPartitionInput,
      memory: -512
    })).toThrow();

    // Negative bandwidth
    expect(() => createComputePartition({
      ...validPartitionInput,
      communicationProfile: {
        ...validPartitionInput.communicationProfile,
        bandwidth: -100
      }
    })).toThrow();

    // Zero bandwidth
    expect(() => createComputePartition({
      ...validPartitionInput,
      communicationProfile: {
        ...validPartitionInput.communicationProfile,
        bandwidth: 0
      }
    })).toThrow();

    // Negative latency
    expect(() => createComputePartition({
      ...validPartitionInput,
      communicationProfile: {
        ...validPartitionInput.communicationProfile,
        latency: -1
      }
    })).toThrow();

    // Reliability < 0 or > 1
    expect(() => createComputePartition({
      ...validPartitionInput,
      communicationProfile: {
        ...validPartitionInput.communicationProfile,
        reliability: -0.1
      }
    })).toThrow();
    expect(() => createComputePartition({
      ...validPartitionInput,
      communicationProfile: {
        ...validPartitionInput.communicationProfile,
        reliability: 1.1
      }
    })).toThrow();

    // Availability < 0 or > 1
    expect(() => createComputePartition({
      ...validPartitionInput,
      availability: -0.01
    })).toThrow();
    expect(() => createComputePartition({
      ...validPartitionInput,
      availability: 1.05
    })).toThrow();

    // Empty strings
    expect(() => createComputePartition({
      ...validPartitionInput,
      cellIdentity: '   '
    })).toThrow();
    expect(() => createComputePartition({
      ...validPartitionInput,
      architecture: ''
    })).toThrow();
    expect(() => createComputePartition({
      ...validPartitionInput,
      specialization: ''
    })).toThrow();
  });

  it('3. deterministic identity: computes deterministic partitionId', () => {
    const id1 = manager.generatePartitionId(validPartitionInput);
    const id2 = computePartitionId(validPartitionInput);
    const partition = manager.createPartition(validPartitionInput);

    expect(id1).toBe(id2);
    expect(partition.partitionId).toBe(id1);
    expect(partition.partitionId).toMatch(/^part_[a-f0-9]{16}$/);
  });

  it('4. semantic change → identity berubah: modifies identity upon any semantic modification', () => {
    const base = createComputePartition(validPartitionInput);

    const withDifferentCapacity = updateComputePartition(base, { capacity: 1500 });
    expect(withDifferentCapacity.partitionId).not.toBe(base.partitionId);

    const withDifferentMemory = updateComputePartition(base, { memory: 16384 });
    expect(withDifferentMemory.partitionId).not.toBe(base.partitionId);

    const withDifferentParallelism = updateComputePartition(base, { parallelism: 8 });
    expect(withDifferentParallelism.partitionId).not.toBe(base.partitionId);

    const withDifferentAvailability = updateComputePartition(base, { availability: 0.5 });
    expect(withDifferentAvailability.partitionId).not.toBe(base.partitionId);

    const withDifferentSpecialization = updateComputePartition(base, { specialization: 'parallel-vector' });
    expect(withDifferentSpecialization.partitionId).not.toBe(base.partitionId);

    const withDifferentArchitecture = updateComputePartition(base, { architecture: 'arm64' });
    expect(withDifferentArchitecture.partitionId).not.toBe(base.partitionId);

    const withDifferentBandwidth = updateComputePartition(base, {
      communicationProfile: { ...base.communicationProfile, bandwidth: 5000 }
    });
    expect(withDifferentBandwidth.partitionId).not.toBe(base.partitionId);

    const withDifferentLatency = updateComputePartition(base, {
      communicationProfile: { ...base.communicationProfile, latency: 10.0 }
    });
    expect(withDifferentLatency.partitionId).not.toBe(base.partitionId);

    const withDifferentTopology = updateComputePartition(base, {
      communicationProfile: { ...base.communicationProfile, topology: 'mesh' }
    });
    expect(withDifferentTopology.partitionId).not.toBe(base.partitionId);

    const withDifferentReliability = updateComputePartition(base, {
      communicationProfile: { ...base.communicationProfile, reliability: 0.85 }
    });
    expect(withDifferentReliability.partitionId).not.toBe(base.partitionId);

    const withDifferentName = updateComputePartition(base, { name: 'Partition Beta' });
    expect(withDifferentName.partitionId).not.toBe(base.partitionId);
  });

  it('5. same semantic partition → identity sama: produces identical id regardless of key order', () => {
    const partition1 = createComputePartition({
      ...validPartitionInput,
      communicationProfile: {
        bandwidth: 1200,
        latency: 2.5,
        topology: 'direct',
        reliability: 0.99
      }
    });

    const partition2 = createComputePartition({
      ...validPartitionInput,
      communicationProfile: {
        reliability: 0.99,
        topology: 'direct',
        latency: 2.5,
        bandwidth: 1200
      }
    });

    expect(partition1.partitionId).toBe(partition2.partitionId);
  });

  it('6. runtime metadata tidak memengaruhi identity: runtime metadata separation', () => {
    const partition1 = createComputePartition({
      ...validPartitionInput,
      runtimeMetadata: {
        timestamp: '2026-01-01T00:00:00Z',
        pid: 101,
        host: 'worker-A'
      }
    });

    const partition2 = createComputePartition({
      ...validPartitionInput,
      runtimeMetadata: {
        timestamp: '2026-12-31T23:59:59Z',
        pid: 999,
        host: 'worker-Z',
        randomExecMetric: 42
      }
    });

    expect(partition1.runtimeMetadata).not.toEqual(partition2.runtimeMetadata);
    expect(partition1.partitionId).toBe(partition2.partitionId);
  });

  it('7. partition immutable: enforces deep freeze and non-mutating updates', () => {
    const partition = createComputePartition(validPartitionInput);

    expect(() => {
      (partition as any).capacity = 9999;
    }).toThrow();

    expect(() => {
      (partition.communicationProfile as any).bandwidth = 9999;
    }).toThrow();

    // Non-mutating update
    const updated = updateComputePartition(partition, { capacity: 2000 });
    expect(partition.capacity).toBe(1000);
    expect(updated.capacity).toBe(2000);
    expect(updated.partitionId).not.toBe(partition.partitionId);
  });

  it('8. multiple partitions dapat dimiliki satu Cell: allows multiple logical compute partitions per Cell', () => {
    const partition1 = createComputePartition({
      cellIdentity: 'cell-A',
      name: 'Partition 1',
      architecture: 'x86_64',
      capacity: 500,
      parallelism: 2,
      memory: 4096,
      specialization: 'general computation',
      availability: 1.0,
      communicationProfile: {
        bandwidth: 1000,
        latency: 2,
        topology: 'direct',
        reliability: 0.99
      }
    });

    const partition2 = createComputePartition({
      cellIdentity: 'cell-A',
      name: 'Partition 2',
      architecture: 'neural-vector',
      capacity: 2000,
      parallelism: 16,
      memory: 16384,
      specialization: 'parallel computation',
      availability: 0.8,
      communicationProfile: {
        bandwidth: 5000,
        latency: 1,
        topology: 'mesh',
        reliability: 0.999
      }
    });

    const partition3 = createComputePartition({
      cellIdentity: 'cell-A',
      name: 'Partition 3',
      architecture: 'symbolic',
      capacity: 300,
      parallelism: 1,
      memory: 2048,
      specialization: 'specialized computation',
      availability: 0.95,
      communicationProfile: {
        bandwidth: 500,
        latency: 5,
        topology: 'p2p',
        reliability: 0.98
      }
    });

    expect(partition1.cellIdentity).toBe('cell-A');
    expect(partition2.cellIdentity).toBe('cell-A');
    expect(partition3.cellIdentity).toBe('cell-A');

    expect(partition1.specialization).toBe('general computation');
    expect(partition2.specialization).toBe('parallel computation');
    expect(partition3.specialization).toBe('specialized computation');

    // All distinct identities
    const idSet = new Set([partition1.partitionId, partition2.partitionId, partition3.partitionId]);
    expect(idSet.size).toBe(3);
  });

  it('9. partition tetap memiliki Cell association and aggregates into Cell capability', () => {
    const p1 = createComputePartition({
      ...validPartitionInput,
      cellIdentity: 'cell-omega',
      name: 'P1',
      capacity: 1000,
      parallelism: 4,
      memory: 4096
    });

    const p2 = createComputePartition({
      ...validPartitionInput,
      cellIdentity: 'cell-omega',
      name: 'P2',
      capacity: 2000,
      parallelism: 8,
      memory: 8192
    });

    const capability = aggregateCapabilities([p1, p2]);

    expect(capability.capacity).toBe(3000);
    expect(capability.parallelism).toBe(12);
    expect(capability.memoryLimit).toBe(12288);
    expect(capability.partitions).toHaveLength(2);
    expect(capability.partitions?.[0].cellIdentity).toBe('cell-omega');
    expect(capability.partitions?.[1].cellIdentity).toBe('cell-omega');

    // Changing cellIdentity results in different partitionId
    const pAnotherCell = createComputePartition({
      ...validPartitionInput,
      cellIdentity: 'cell-beta'
    });
    expect(pAnotherCell.partitionId).not.toBe(p1.partitionId);
  });

  it('10. R2 integration: CellStateManager seamlessly operates with R3 partitions', () => {
    const stateManager = new CellStateManager();

    const p1 = createComputePartition({
      ...validPartitionInput,
      cellIdentity: 'cell-alpha',
      name: 'P1'
    });

    const capWithPartitions = aggregateCapabilities([p1]);

    const state = stateManager.createInitialState({
      cellIdentity: 'cell-alpha',
      genomeReference: 'genome-v1',
      memoryState: { capacity: 100 },
      knowledgeState: { core: 'math' },
      cognitiveState: { mode: 'analytical' },
      reasoningState: { depth: 5 },
      experienceState: { encounters: 10 },
      computationalCapability: capWithPartitions,
      specializations: [
        { domain: 'programming', focusAreas: ['typescript'], level: 0.8 }
      ],
      lifecycle: LifecycleState.ACTIVE,
      provenance: ['genesis']
    });

    expect(state.stateId).toMatch(/^state_[a-f0-9]{16}$/);
    expect(state.computationalCapability.partitions).toHaveLength(1);
    expect(state.computationalCapability.partitions?.[0].partitionId).toBe(p1.partitionId);

    // Apply state transition with an updated partition
    const p2 = createComputePartition({
      ...validPartitionInput,
      cellIdentity: 'cell-alpha',
      name: 'P2',
      capacity: 500
    });
    const updatedCap = aggregateCapabilities([p1, p2]);

    const { newState, transition } = stateManager.applyTransition(
      state,
      'PARTITION_EXPANDED',
      { computationalCapability: updatedCap },
      ['r3-partition-event']
    );

    expect(newState.stateId).not.toBe(state.stateId);
    expect(newState.computationalCapability.partitions).toHaveLength(2);
    expect(transition.changedFields).toEqual(['computationalCapability']);
  });
});
