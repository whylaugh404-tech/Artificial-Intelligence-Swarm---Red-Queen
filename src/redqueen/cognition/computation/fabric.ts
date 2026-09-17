import { Cell } from '../../core/cell';
import { CellState } from '../../core/lifecycle';
import { MessageType, NetworkMessage } from '../../network/protocol';
import { PeerState } from '../../network/peer';
import { ComputationSubtask, SubtaskResult, ComputationStatus } from './types';
import { computeDeterministicHash } from './canonical';
import { logger } from '../../core/logger';
import { CollectiveComputationEngine, SubtaskExecutor } from './engine';

export interface RemoteCellCapabilityAdvertisement {
  nodeId: string;
  capabilities: string[];
  specialization?: string | null;
  traits?: {
    maxCognitiveCycleDepth?: number;
  };
  advertisedAt?: string;
}

interface PendingTaskEntry {
  requestId: string;
  taskId: string;
  subtaskId: string;
  targetCellId: string;
  timeout: NodeJS.Timeout;
  resolve: (res: any) => void;
  reject: (err: any) => void;
  createdAt: number;
}

/**
 * Creates a Cell candidate surrogate for the computation scheduler
 * representing a remote discovered peer.
 */
export function createRemoteCellCandidate(
  nodeId: string,
  advertisement?: Partial<RemoteCellCapabilityAdvertisement>
): Cell {
  const capabilities = advertisement?.capabilities || [];
  const specialization = advertisement?.specialization || null;
  const traits = advertisement?.traits || { maxCognitiveCycleDepth: 4 };

  return {
    nodeId,
    genome: {
      capabilities,
      specialization,
      traits
    },
    cognitiveState: {
      getSpecialization: () => specialization
    },
    cognitiveGraph: {
      getAllConcepts: () => []
    },
    lifecycle: {
      getState: () => CellState.ACTIVE
    },
    isRemoteCandidate: true
  } as unknown as Cell;
}

/**
 * P8.2 — Distributed Computation Fabric
 * 
 * End-to-end distributed execution pipeline:
 * DHT Discovery → Remote Cell Resolution → Scheduler → Remote Dispatch → Execution → Verified Result → Composition
 */
export class DistributedComputationFabric {
  private readonly component = 'computation_fabric';
  private pendingRequests = new Map<string, PendingTaskEntry>(); // requestId -> entry
  private activeSubtaskRequests = new Map<string, string>(); // subtaskId -> requestId
  private capabilityStore = new Map<string, Set<string>>(); // capHash -> Set<nodeId>
  private candidateMetadataStore = new Map<string, RemoteCellCapabilityAdvertisement>(); // nodeId -> advertisement
  private announceInterval: NodeJS.Timeout | null = null;
  private requestCounter = 0;

  constructor(private cell: Cell, private engine: CollectiveComputationEngine) {
    this.setupListeners();
  }

  /**
   * Starts periodic capability announcements and triggers initial announcement.
   */
  public start(): void {
    if (this.announceInterval) return;
    this.announceCapabilities();
    this.announceInterval = setInterval(() => this.announceCapabilities(), 10000);
  }

  /**
   * Stops periodic capability announcements and cleans up in-flight pending tasks.
   */
  public stop(): void {
    if (this.announceInterval) {
      clearInterval(this.announceInterval);
      this.announceInterval = null;
    }
    for (const [reqId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`DistributedComputationFabric stopped while task ${pending.subtaskId} (req: ${reqId}) was pending`));
    }
    this.pendingRequests.clear();
    this.activeSubtaskRequests.clear();
  }

  private setupListeners(): void {
    this.cell.transport.onMessage(async (msg) => {
      try {
        if (msg.type === MessageType.TASK) {
          await this.handleTask(msg);
        } else if (msg.type === MessageType.TASK_RESULT) {
          this.handleTaskResult(msg);
        } else if (msg.type === MessageType.STORE) {
          this.handleStore(msg);
        } else if (msg.type === MessageType.FIND_VALUE) {
          this.handleFindValue(msg);
        }
      } catch (err: any) {
        logger.error(this.component, `error_handling_${msg.type}`, err);
      }
    });
  }

  // 1. Task -> Capability Discovery & Remote Cell Resolution
  public async discoverCapableCells(capabilities: string[]): Promise<Cell[]> {
    const discoveredCandidates = new Map<string, RemoteCellCapabilityAdvertisement>();

    // 1a. Check local capability store
    for (const cap of capabilities) {
      const capHash = computeDeterministicHash({ capability: cap });
      const ids = this.capabilityStore.get(capHash);
      if (ids) {
        for (const id of ids) {
          const adv = this.candidateMetadataStore.get(id) || {
            nodeId: id,
            capabilities: [cap]
          };
          discoveredCandidates.set(id, adv);
        }
      }
    }

    // 1b. Check all authenticated peers in transport
    for (const peer of this.cell.transport.getPeers()) {
      if (peer.getState() === PeerState.AUTHENTICATED && peer.remoteNodeId) {
        const adv = this.candidateMetadataStore.get(peer.remoteNodeId);
        if (adv) {
          discoveredCandidates.set(peer.remoteNodeId, adv);
        }
      }
    }

    // 1c. DHT FIND_VALUE lookup across closest routing peers
    for (const cap of capabilities) {
      const capHash = computeDeterministicHash({ capability: cap });
      const closest = this.cell.routing.getClosestPeers(capHash, 5);
      for (const peer of closest) {
        try {
          const res = await this.cell.transport.requestFromPeer(
            peer.nodeId,
            MessageType.FIND_VALUE,
            { key: capHash },
            2000
          );
          if (res && res.payload) {
            if (Array.isArray(res.payload.advertisements)) {
              for (const adv of res.payload.advertisements) {
                if (adv && adv.nodeId) {
                  this.candidateMetadataStore.set(adv.nodeId, adv);
                  discoveredCandidates.set(adv.nodeId, adv);
                  if (!this.capabilityStore.has(capHash)) {
                    this.capabilityStore.set(capHash, new Set());
                  }
                  this.capabilityStore.get(capHash)!.add(adv.nodeId);
                }
              }
            } else if (Array.isArray(res.payload.nodeIds)) {
              for (const id of res.payload.nodeIds) {
                if (!discoveredCandidates.has(id)) {
                  discoveredCandidates.set(id, {
                    nodeId: id,
                    capabilities: [cap]
                  });
                }
              }
            }
          }
        } catch {
          // Peer may not have responded or timed out
        }
      }
    }

    // 1d. Convert discovered nodeIds and advertisements into Cell execution candidate representations
    const candidates: Cell[] = [];
    for (const [id, adv] of discoveredCandidates.entries()) {
      if (id === this.cell.nodeId) {
        candidates.push(this.cell);
      } else {
        candidates.push(createRemoteCellCandidate(id, adv));
      }
    }

    return candidates;
  }

  // 2. Remote Dispatch with Concurrency Control & Anti-Collision
  public getRemoteExecutor(localExecutor: SubtaskExecutor): SubtaskExecutor {
    return async (subtask, resolvedInputs, targetCell) => {
      if (targetCell.nodeId === this.cell.nodeId) {
        return localExecutor(subtask, resolvedInputs, targetCell);
      }

      // Security: verify targetCell has an AUTHENTICATED P2P transport connection
      const peer = this.cell.transport.getPeer(targetCell.nodeId);
      const isConnectedRemotePeer = peer && peer.getState() === PeerState.AUTHENTICATED;

      if (!isConnectedRemotePeer) {
        logger.warn(this.component, 'target_peer_not_authenticated_fallback_local', { targetId: targetCell.nodeId });
        const result = await localExecutor(subtask, resolvedInputs, targetCell) as any;
        result.originatingCellId = this.cell.nodeId;
        result.requestedCellId = targetCell.nodeId;
        result.allocatedCellId = targetCell.nodeId;
        result.actualExecutorCellId = this.cell.nodeId;
        result.fallbackUsed = true;
        return result;
      }

      logger.info(this.component, 'dispatching_remote_task', {
        subtaskId: subtask.subtaskId,
        targetId: targetCell.nodeId
      });

      // Anti-collision: prevent clobbering an existing in-flight request for the same subtask
      if (this.activeSubtaskRequests.has(subtask.subtaskId)) {
        const existingReqId = this.activeSubtaskRequests.get(subtask.subtaskId)!;
        const existing = this.pendingRequests.get(existingReqId);
        if (existing) {
          clearTimeout(existing.timeout);
          this.pendingRequests.delete(existingReqId);
          existing.reject(new Error(`Subtask ${subtask.subtaskId} re-dispatched; superseding in-flight request ${existingReqId}`));
        }
        this.activeSubtaskRequests.delete(subtask.subtaskId);
      }

      const requestId = `req_${subtask.parentTaskId}_${subtask.subtaskId}_${targetCell.nodeId}_${++this.requestCounter}_${Date.now()}`;

      return new Promise((resolve, reject) => {
        const timeoutMs = subtask.timeoutMs + 3000; // Network roundtrip buffer
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          if (this.activeSubtaskRequests.get(subtask.subtaskId) === requestId) {
            this.activeSubtaskRequests.delete(subtask.subtaskId);
          }
          reject(new Error(`Remote task ${subtask.subtaskId} (req: ${requestId}) timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        const entry: PendingTaskEntry = {
          requestId,
          taskId: subtask.parentTaskId,
          subtaskId: subtask.subtaskId,
          targetCellId: targetCell.nodeId,
          timeout,
          resolve,
          reject,
          createdAt: Date.now()
        };

        this.pendingRequests.set(requestId, entry);
        this.activeSubtaskRequests.set(subtask.subtaskId, requestId);

        const sent = this.cell.transport.sendTo(targetCell.nodeId, MessageType.TASK, {
          subtask,
          resolvedInputs,
          originatingCellId: this.cell.nodeId,
          requestId
        });

        if (!sent) {
          clearTimeout(timeout);
          this.pendingRequests.delete(requestId);
          this.activeSubtaskRequests.delete(subtask.subtaskId);
          resolve(localExecutor(subtask, resolvedInputs, targetCell));
        }
      });
    };
  }

  // 3. Remote Execution (Receiving side) with Security & Authentication Enforcement
  private async handleTask(msg: NetworkMessage): Promise<void> {
    // Security check 1: ensure sender is an authenticated peer
    const peer = this.cell.transport.getPeer(msg.senderId);
    if (!peer || peer.getState() !== PeerState.AUTHENTICATED) {
      logger.warn(this.component, 'unauthenticated_peer_task_rejected', { senderId: msg.senderId });
      return;
    }

    const { subtask, resolvedInputs, originatingCellId, requestId } = msg.payload as {
      subtask: ComputationSubtask;
      resolvedInputs: Record<string, unknown>;
      originatingCellId: string;
      requestId?: string;
    };

    if (!subtask || !subtask.subtaskId || !subtask.type) {
      logger.warn(this.component, 'malformed_task_payload_rejected', { senderId: msg.senderId });
      return;
    }

    // Security check 2: prevent arbitrary endpoint access; only execute registered engines
    const executor = (this.engine as any).defaultExecutors.get(subtask.type);
    if (!executor) {
      logger.warn(this.component, 'unsupported_task_type_rejected', { type: subtask.type, senderId: msg.senderId });
      const errorMsg = `Unsupported computation type: ${subtask.type}`;
      const result: SubtaskResult = {
        subtaskId: subtask.subtaskId,
        taskId: subtask.parentTaskId,
        executingCellId: this.cell.nodeId,
        originatingCellId,
        status: ComputationStatus.FAILED,
        output: {},
        error: errorMsg,
        attempts: 1,
        executionDurationMs: 0,
        provenance: [originatingCellId, this.cell.nodeId],
        resultHash: computeDeterministicHash({ subtaskId: subtask.subtaskId, error: errorMsg })
      };
      this.cell.transport.sendTo(msg.senderId, MessageType.TASK_RESULT, { result, requestId }, msg.messageId);
      return;
    }

    logger.info(this.component, 'executing_remote_task', { subtaskId: subtask.subtaskId, originatingCellId });

    try {
      const startTime = Date.now();
      const output = await executor(subtask, resolvedInputs, this.cell);
      const duration = Date.now() - startTime;

      const resultHash = computeDeterministicHash({
        subtaskId: subtask.subtaskId,
        output,
        executingCellId: this.cell.nodeId
      });

      const result: SubtaskResult = {
        subtaskId: subtask.subtaskId,
        taskId: subtask.parentTaskId,
        executingCellId: this.cell.nodeId,
        originatingCellId,
        status: ComputationStatus.COMPLETED,
        output,
        attempts: 1,
        executionDurationMs: duration,
        provenance: [originatingCellId, this.cell.nodeId],
        resultHash
      };

      this.cell.transport.sendTo(msg.senderId, MessageType.TASK_RESULT, { result, requestId }, msg.messageId);
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      const resultHash = computeDeterministicHash({
        subtaskId: subtask.subtaskId,
        error: errorMsg
      });

      const result: SubtaskResult = {
        subtaskId: subtask.subtaskId,
        taskId: subtask.parentTaskId,
        executingCellId: this.cell.nodeId,
        originatingCellId,
        status: ComputationStatus.FAILED,
        output: {},
        error: errorMsg,
        attempts: 1,
        executionDurationMs: 0,
        provenance: [originatingCellId, this.cell.nodeId],
        resultHash
      };

      this.cell.transport.sendTo(msg.senderId, MessageType.TASK_RESULT, { result, requestId }, msg.messageId);
    }
  }

  // 4. Remote Result Verification & Resolution
  private handleTaskResult(msg: NetworkMessage): void {
    // Security check: ensure sender is an authenticated peer
    const peer = this.cell.transport.getPeer(msg.senderId);
    if (!peer || peer.getState() !== PeerState.AUTHENTICATED) {
      logger.warn(this.component, 'unauthenticated_peer_result_rejected', { senderId: msg.senderId });
      return;
    }

    const { result, requestId } = msg.payload as { result: SubtaskResult; requestId?: string };
    if (!result || !result.subtaskId) {
      logger.warn(this.component, 'malformed_task_result_received', { senderId: msg.senderId });
      return;
    }

    // Lookup pending task entry
    let pending: PendingTaskEntry | undefined;
    if (requestId && this.pendingRequests.has(requestId)) {
      pending = this.pendingRequests.get(requestId);
    } else if (this.activeSubtaskRequests.has(result.subtaskId)) {
      const activeReqId = this.activeSubtaskRequests.get(result.subtaskId)!;
      pending = this.pendingRequests.get(activeReqId);
    }

    if (!pending) {
      logger.warn(this.component, 'unsolicited_or_expired_task_result', { subtaskId: result.subtaskId, requestId });
      return;
    }

    // Strict Remote Result Verification:
    // 1. Task ID match
    if (result.taskId !== pending.taskId) {
      pending.reject(new Error(`Remote result verification failed: taskId mismatch (expected ${pending.taskId}, got ${result.taskId})`));
      this.cleanupPending(pending);
      return;
    }

    // 2. Subtask ID match
    if (result.subtaskId !== pending.subtaskId) {
      pending.reject(new Error(`Remote result verification failed: subtaskId mismatch (expected ${pending.subtaskId}, got ${result.subtaskId})`));
      this.cleanupPending(pending);
      return;
    }

    // 3. Executing Cell ID match
    if (result.executingCellId !== pending.targetCellId || msg.senderId !== pending.targetCellId) {
      pending.reject(new Error(`Remote result verification failed: executingCellId mismatch (expected ${pending.targetCellId}, got ${result.executingCellId})`));
      this.cleanupPending(pending);
      return;
    }

    // 4. Originating Cell ID match
    const originCellId = result.originatingCellId || (Array.isArray(result.provenance) ? result.provenance[0] : null);
    if (originCellId !== this.cell.nodeId) {
      pending.reject(new Error(`Remote result verification failed: originatingCellId mismatch (expected ${this.cell.nodeId}, got ${originCellId})`));
      this.cleanupPending(pending);
      return;
    }

    // 5. Provenance integrity
    if (!Array.isArray(result.provenance) || result.provenance.length < 2 || result.provenance[0] !== this.cell.nodeId || !result.provenance.includes(result.executingCellId)) {
      pending.reject(new Error(`Remote result verification failed: invalid provenance chain [${(result.provenance || []).join(', ')}]`));
      this.cleanupPending(pending);
      return;
    }

    // 6. Deterministic resultHash verification
    if (result.status === ComputationStatus.COMPLETED) {
      const expectedHash = computeDeterministicHash({
        subtaskId: result.subtaskId,
        output: result.output,
        executingCellId: result.executingCellId
      });
      if (result.resultHash !== expectedHash) {
        pending.reject(new Error(`Remote result verification failed: deterministic resultHash mismatch (expected ${expectedHash}, got ${result.resultHash})`));
        this.cleanupPending(pending);
        return;
      }
    } else {
      const expectedHash = computeDeterministicHash({
        subtaskId: result.subtaskId,
        error: result.error
      });
      if (result.resultHash !== expectedHash) {
        pending.reject(new Error(`Remote result verification failed: failure resultHash mismatch (expected ${expectedHash}, got ${result.resultHash})`));
        this.cleanupPending(pending);
        return;
      }
    }

    // Verified! Clean up pending state
    this.cleanupPending(pending);

    if (result.status === ComputationStatus.COMPLETED) {
      // Resolve with output carrying verified remote metadata for the computation engine
      pending.resolve({
        ...result.output,
        __isRemoteResult: true,
        __remoteSubtaskResult: result
      });
    } else {
      pending.reject(new Error(result.error || 'Remote task execution failed'));
    }
  }

  private cleanupPending(pending: PendingTaskEntry): void {
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(pending.requestId);
    if (this.activeSubtaskRequests.get(pending.subtaskId) === pending.requestId) {
      this.activeSubtaskRequests.delete(pending.subtaskId);
    }
  }

  // 5. DHT STORE Handler
  private handleStore(msg: NetworkMessage): void {
    const peer = this.cell.transport.getPeer(msg.senderId);
    if (!peer || peer.getState() !== PeerState.AUTHENTICATED) {
      return;
    }

    const { key, advertisement } = msg.payload as {
      key: string;
      advertisement?: RemoteCellCapabilityAdvertisement;
    };

    if (typeof key === 'string' && advertisement && advertisement.nodeId) {
      if (!this.capabilityStore.has(key)) {
        this.capabilityStore.set(key, new Set());
      }
      this.capabilityStore.get(key)!.add(advertisement.nodeId);
      this.candidateMetadataStore.set(advertisement.nodeId, advertisement);
    }
  }

  // 6. DHT FIND_VALUE Handler
  private handleFindValue(msg: NetworkMessage): void {
    const peer = this.cell.transport.getPeer(msg.senderId);
    if (!peer || peer.getState() !== PeerState.AUTHENTICATED) {
      return;
    }

    const { key } = msg.payload;
    if (typeof key === 'string' && this.capabilityStore.has(key)) {
      const nodeIds = Array.from(this.capabilityStore.get(key)!);
      const advertisements = nodeIds.map(id => this.candidateMetadataStore.get(id)).filter(Boolean);
      this.cell.transport.sendTo(msg.senderId, MessageType.FIND_NODE_RESPONSE, {
        key,
        nodeIds,
        advertisements
      }, msg.messageId);
    } else {
      this.cell.transport.sendTo(msg.senderId, MessageType.FIND_NODE_RESPONSE, {
        key,
        nodeIds: [],
        advertisements: []
      }, msg.messageId);
    }
  }

  // 7. Capability Advertisement Broadcast
  public announceCapabilities(): void {
    const caps = this.cell.genome?.capabilities || [];
    const specialization = this.cell.cognitiveState?.getSpecialization() || this.cell.genome?.specialization || null;
    const traits = this.cell.genome?.traits;

    const advertisement: RemoteCellCapabilityAdvertisement = {
      nodeId: this.cell.nodeId,
      capabilities: caps,
      specialization,
      traits: traits ? { maxCognitiveCycleDepth: traits.maxCognitiveCycleDepth } : undefined,
      advertisedAt: new Date().toISOString()
    };

    this.candidateMetadataStore.set(this.cell.nodeId, advertisement);

    for (const cap of caps) {
      const capHash = computeDeterministicHash({ capability: cap });
      if (!this.capabilityStore.has(capHash)) {
        this.capabilityStore.set(capHash, new Set());
      }
      this.capabilityStore.get(capHash)!.add(this.cell.nodeId);

      // Distribute to closest DHT peers
      const closest = this.cell.routing.getClosestPeers(capHash, 5);
      for (const peer of closest) {
        this.cell.transport.sendTo(peer.nodeId, MessageType.STORE, {
          key: capHash,
          capability: cap,
          advertisement
        });
      }

      // Also announce directly to all currently connected peers
      for (const peer of this.cell.transport.getPeers()) {
        if (peer.getState() === PeerState.AUTHENTICATED && peer.remoteNodeId) {
          this.cell.transport.sendTo(peer.remoteNodeId, MessageType.STORE, {
            key: capHash,
            capability: cap,
            advertisement
          });
        }
      }
    }
  }
}
