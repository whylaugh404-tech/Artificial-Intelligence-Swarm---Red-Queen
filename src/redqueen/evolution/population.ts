import type { Cell } from '../core/cell';
import type { MembershipCertificate } from '../swarm/types';
import { MembershipState } from '../swarm/types';
import type { RoutingTable } from '../dht/routing';
import type { SwarmMembershipManager } from '../swarm/membership';
import { logger } from '../core/logger';

export * from './selection';

const COMPONENT = 'distributed_population_registry';

export interface PopulationMember {
  nodeId: string;
  publicKey: string;
  generation: number;
  lineageId: string;
  parentCellId?: string;
  specialization?: string;
  capabilities: string[];
  joinedAt: number;
  lastActive: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'RETIRED';
  cellInstance?: Cell;
  certificate?: MembershipCertificate;
  metadata?: Record<string, unknown>;
}

export interface RegisterCellResult {
  success: boolean;
  isDuplicate: boolean;
  member?: PopulationMember;
  error?: string;
}

/**
 * P10: Distributed Population Registry
 * 
 * Decentralized member directory tracking population membership across the overlay.
 * Rules:
 * - NO global singleton: instantiated per cell, local cluster, or runtime context.
 * - Deduplication: prevents multiple entries for the same Node ID.
 * - Bridges Cell, Lineage, DHT routing, and Swarm authorization certificates.
 * - Resilient: supports recovery from failed joins and updates active presence.
 */
export class DistributedPopulationRegistry {
  private members = new Map<string, PopulationMember>();

  constructor(public readonly localNodeId?: string) {}

  /**
   * Registers a Cell into the population registry.
   * If already registered, updates active timestamp and prevents duplicate entries.
   */
  public registerCell(cell: Cell, certificate?: MembershipCertificate): RegisterCellResult {
    if (!cell || !cell.nodeId || !cell.publicKey) {
      return { success: false, isDuplicate: false, error: 'Invalid cell instance: missing identity' };
    }

    const existing = this.members.get(cell.nodeId);
    if (existing) {
      existing.lastActive = Date.now();
      existing.cellInstance = cell;
      if (certificate) {
        existing.certificate = certificate;
      }
      logger.debug(COMPONENT, 'cell_already_registered_deduplicated', { nodeId: cell.nodeId });
      return {
        success: true,
        isDuplicate: true,
        member: existing
      };
    }

    const cert = certificate || cell.swarm?.getMyCertificate();
    const member: PopulationMember = {
      nodeId: cell.nodeId,
      publicKey: cell.publicKey,
      generation: cell.genome?.generation ?? 0,
      lineageId: cell.genome?.lineageId ?? cell.nodeId,
      parentCellId: cell.genome?.parentCellId,
      specialization: cell.genome?.specialization,
      capabilities: (cell.genome?.capabilities as string[]) || [],
      joinedAt: Date.now(),
      lastActive: Date.now(),
      status: 'ACTIVE',
      cellInstance: cell,
      certificate: cert
    };

    this.members.set(cell.nodeId, member);

    logger.info(COMPONENT, 'cell_registered_in_population', {
      nodeId: cell.nodeId,
      generation: member.generation,
      parentCellId: member.parentCellId,
      specialization: member.specialization,
      totalPopulation: this.members.size
    });

    return {
      success: true,
      isDuplicate: false,
      member
    };
  }

  /**
   * Deregisters a member by Node ID.
   */
  public deregisterCell(nodeId: string): boolean {
    const deleted = this.members.delete(nodeId);
    if (deleted) {
      logger.info(COMPONENT, 'cell_deregistered_from_population', { nodeId, remaining: this.members.size });
    }
    return deleted;
  }

  /**
   * Retrieves a population member record by Node ID.
   */
  public getMember(nodeId: string): PopulationMember | undefined {
    return this.members.get(nodeId);
  }

  /**
   * Retrieves a live Cell instance if held locally in memory.
   */
  public getCell(nodeId: string): Cell | undefined {
    return this.members.get(nodeId)?.cellInstance;
  }

  /**
   * Checks if a Node ID is currently registered.
   */
  public hasMember(nodeId: string): boolean {
    return this.members.has(nodeId);
  }

  /**
   * Returns all registered population member records.
   */
  public getAllMembers(): PopulationMember[] {
    return Array.from(this.members.values());
  }

  /**
   * Returns all active local Cell instances.
   */
  public getAllCells(): Cell[] {
    const cells: Cell[] = [];
    for (const m of this.members.values()) {
      if (m.cellInstance) {
        cells.push(m.cellInstance);
      }
    }
    return cells;
  }

  /**
   * Returns current population count.
   */
  public size(): number {
    return this.members.size;
  }

  /**
   * Resets the registry.
   */
  public clear(): void {
    this.members.clear();
  }

  /**
   * Synchronizes known population members into a DHT RoutingTable.
   */
  public syncWithDHT(routingTable: RoutingTable): void {
    for (const member of this.members.values()) {
      if (routingTable.localNodeId !== member.nodeId) {
        routingTable.addPeer({
          nodeId: member.nodeId,
          publicKey: member.publicKey,
          endpoint: member.cellInstance?.transport?.publicEndpoint,
          lastSeen: member.lastActive
        });
      }
    }
  }

  /**
   * Synchronizes verified members into a SwarmMembershipManager.
   */
  public syncWithSwarm(swarm: SwarmMembershipManager): void {
    for (const member of this.members.values()) {
      if (member.certificate) {
        swarm.transitionPeerState(member.nodeId, MembershipState.AUTHENTICATED);
        const record = swarm.getPeerRecord(member.nodeId) || {
          nodeId: member.nodeId,
          publicKey: member.publicKey,
          state: MembershipState.MEMBER,
          updatedAt: Date.now()
        };
        record.certificate = member.certificate;
        record.state = MembershipState.MEMBER;
        record.updatedAt = Date.now();
      }
    }
  }

  /**
   * Recovers from a failed registration or join attempt, clearing corrupted partial state if requested.
   */
  public async recoverFailedJoin(cell: Cell, options?: { clearPartialState?: boolean }): Promise<RegisterCellResult> {
    if (options?.clearPartialState) {
      this.members.delete(cell.nodeId);
    }
    logger.info(COMPONENT, 'recovering_failed_join', { nodeId: cell.nodeId });
    return this.registerCell(cell);
  }
}
