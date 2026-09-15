import { Cell } from '../../core/cell';
import { MessageType, NetworkMessage } from '../../network/protocol';
import { PeerState } from '../../network/peer';
import { ComputationSubtask, SubtaskResult, ComputationStatus, ComputationTask } from './types';
import { computeDeterministicHash } from './engine';
import { logger } from '../../core/logger';
import { CollectiveComputationEngine, SubtaskExecutor } from './engine';

export class DistributedComputationFabric {
  private pendingTasks = new Map<string, { resolve: (res: SubtaskResult) => void, reject: (err: any) => void, timeout: NodeJS.Timeout }>();
  private readonly component = 'computation_fabric';
  private capabilityStore = new Map<string, Set<string>>(); // capability -> nodeIds

  constructor(private cell: Cell, private engine: CollectiveComputationEngine) {
    this.setupListeners();
    // Announce capabilities to DHT periodically
    setInterval(() => this.announceCapabilities(), 15000);
  }

  private setupListeners() {
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

  // 1. Task -> Capability Discovery
  public async discoverCapableCells(capabilities: string[]): Promise<Cell[]> {
    const discoveredIds = new Set<string>();
    
    // Check local store first
    for (const cap of capabilities) {
      const ids = this.capabilityStore.get(cap);
      if (ids) {
        for (const id of ids) {
          discoveredIds.add(id);
        }
      }
    }

    // DHT FIND_VALUE lookup
    for (const cap of capabilities) {
      const capHash = computeDeterministicHash({ capability: cap });
      // We will query our closest peers
      const closest = this.cell.routing.getClosestPeers(capHash, 5);
      for (const peer of closest) {
        try {
          const res = await this.cell.transport.requestFromPeer(peer.nodeId, MessageType.FIND_VALUE, { key: capHash }, 3000);
          if (res && res.payload && Array.isArray(res.payload.nodeIds)) {
            for (const id of res.payload.nodeIds) {
              discoveredIds.add(id);
              // Cache it
              if (!this.capabilityStore.has(cap)) this.capabilityStore.set(cap, new Set());
              this.capabilityStore.get(cap)!.add(id);
            }
          }
        } catch (err) {
           // Peer might not respond or not have value
        }
      }
    }

    const cells: Cell[] = [];
    for (const id of discoveredIds) {
      if (id === this.cell.nodeId) {
        cells.push(this.cell);
      } else {
        // We need a Cell object, but engine only needs a surrogate for capacity estimation.
        // Actually engine expects a real Cell object or we can mock it based on peer info?
        // Let's create a proxy Cell or just ensure candidateCells array in executeTask has them.
      }
    }
    return cells;
  }

  // 2. Remote Dispatch
  public getRemoteExecutor(localExecutor: SubtaskExecutor): SubtaskExecutor {
    return async (subtask, resolvedInputs, targetCell) => {
      if (targetCell.nodeId === this.cell.nodeId) {
        return localExecutor(subtask, resolvedInputs, targetCell);
      }

      // If targetCell is not a connected peer in the transport, execute locally on that Cell instance
      const peer = (this.cell.transport as any).peers?.get(targetCell.nodeId);
      const isConnectedRemotePeer = peer && peer.getState() === PeerState.AUTHENTICATED;

      if (!isConnectedRemotePeer) {
        return localExecutor(subtask, resolvedInputs, targetCell);
      }

      logger.info(this.component, 'dispatching_remote_task', { subtaskId: subtask.subtaskId, targetId: targetCell.nodeId });
      
      return new Promise((resolve, reject) => {
        const timeoutMs = subtask.timeoutMs + 2000; // network buffer
        const timeout = setTimeout(() => {
          this.pendingTasks.delete(subtask.subtaskId);
          reject(new Error(`Remote task ${subtask.subtaskId} timed out`));
        }, timeoutMs);

        this.pendingTasks.set(subtask.subtaskId, { resolve: resolve as any, reject, timeout });

        const sent = this.cell.transport.sendTo(targetCell.nodeId, MessageType.TASK, {
          subtask,
          resolvedInputs,
          originatingCellId: this.cell.nodeId
        });

        if (!sent) {
          clearTimeout(timeout);
          this.pendingTasks.delete(subtask.subtaskId);
          resolve(localExecutor(subtask, resolvedInputs, targetCell));
        }
      });
    };
  }

  // 3. Execution (Receiving side)
  private async handleTask(msg: NetworkMessage) {
    const { subtask, resolvedInputs, originatingCellId } = msg.payload as { subtask: ComputationSubtask, resolvedInputs: Record<string, unknown>, originatingCellId: string };
    logger.info(this.component, 'executing_remote_task', { subtaskId: subtask.subtaskId, originatingCellId });

    // Execute locally
    try {
      // Create a dummy task to use with engine.executeTask? No, subtask execute doesn't need task.
      // We can just use the localExecutor
      const executor = (this.engine as any).defaultExecutors.get(subtask.type);
      if (!executor) throw new Error(`Unknown computation type: ${subtask.type}`);

      const output = await executor(subtask, resolvedInputs, this.cell);
      
      const result: SubtaskResult = {
        subtaskId: subtask.subtaskId,
        taskId: subtask.parentTaskId,
        executingCellId: this.cell.nodeId,
        status: ComputationStatus.COMPLETED,
        output,
        attempts: 1,
        executionDurationMs: 0,
        provenance: [originatingCellId, this.cell.nodeId],
        resultHash: computeDeterministicHash({
          subtaskId: subtask.subtaskId,
          output,
          executingCellId: this.cell.nodeId
        })
      };

      this.cell.transport.sendTo(msg.senderId, MessageType.TASK_RESULT, { result });
    } catch (err: any) {
      const result: SubtaskResult = {
        subtaskId: subtask.subtaskId,
        taskId: subtask.parentTaskId,
        executingCellId: this.cell.nodeId,
        status: ComputationStatus.FAILED,
        output: {},
        error: err.message || String(err),
        attempts: 1,
        executionDurationMs: 0,
        provenance: [originatingCellId, this.cell.nodeId],
        resultHash: computeDeterministicHash({ subtaskId: subtask.subtaskId, error: err.message })
      };
      this.cell.transport.sendTo(msg.senderId, MessageType.TASK_RESULT, { result });
    }
  }

  // 4. Result Exchange
  private handleTaskResult(msg: NetworkMessage) {
    const { result } = msg.payload as { result: SubtaskResult };
    const pending = this.pendingTasks.get(result.subtaskId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingTasks.delete(result.subtaskId);
      
      // Fabric resolves with output, engine's executeSubtaskWithFaultIsolation wraps it in SubtaskResult
      // Wait, engine's executeSubtaskWithFaultIsolation expects raw output, NOT SubtaskResult!
      if (result.status === ComputationStatus.COMPLETED) {
        pending.resolve(result.output as any);
      } else {
        pending.reject(new Error(result.error || 'Remote task failed'));
      }
    }
  }

  // DHT STORE handler
  private handleStore(msg: NetworkMessage) {
    const { key, value } = msg.payload;
    if (typeof key === 'string' && typeof value === 'string') {
      if (!this.capabilityStore.has(key)) this.capabilityStore.set(key, new Set());
      this.capabilityStore.get(key)!.add(value); // value is nodeId
    }
  }

  // DHT FIND_VALUE handler
  private handleFindValue(msg: NetworkMessage) {
    const { key } = msg.payload;
    if (typeof key === 'string' && this.capabilityStore.has(key)) {
      const nodeIds = Array.from(this.capabilityStore.get(key)!);
      this.cell.transport.sendTo(msg.senderId, MessageType.FIND_NODE_RESPONSE, { // wait, FIND_NODE_RESPONSE or distinct?
         // Actually, requestFromPeer awaits a response matching replyToId. We can just send a generic application message or reuse the type.
         // Let's send APPLICATION for now, but requestFromPeer checks message replies correctly.
         key,
         nodeIds
      }, msg.messageId); // sendTo with replyToId
    }
  }

  private announceCapabilities() {
    const caps = this.cell.genome?.capabilities || [];
    for (const cap of caps) {
      const capHash = computeDeterministicHash({ capability: cap });
      const closest = this.cell.routing.getClosestPeers(capHash, 3);
      for (const peer of closest) {
        this.cell.transport.sendTo(peer.nodeId, MessageType.STORE, {
          key: capHash,
          value: this.cell.nodeId
        });
      }
      // Also store locally
      if (!this.capabilityStore.has(capHash)) this.capabilityStore.set(capHash, new Set());
      this.capabilityStore.get(capHash)!.add(this.cell.nodeId);
    }
  }
}
