import {
  AuthorizationPolicy,
  PeerAuthorizationContext,
  AuthorizationDecision,
  ALLOWED_CAPABILITIES,
  SwarmCapability,
  CURRENT_PROTOCOL_VERSION
} from './types';

export interface AllowlistPolicyOptions {
  allowedNodeIds?: string[];
  allowedPublicKeys?: string[];
  allowedCapabilities?: SwarmCapability[];
  expectedSwarmId?: string;
  allowAllForTesting?: boolean;
}

/**
 * Strict allowlist-based Swarm Authorization Policy.
 * 
 * Default behavior: Denies any peer not explicitly allowlisted.
 */
export class AllowlistAuthorizationPolicy implements AuthorizationPolicy {
  private allowedNodeIds: Set<string>;
  private allowedPublicKeys: Set<string>;
  private allowedCapabilities: Set<SwarmCapability>;
  private expectedSwarmId?: string;
  private allowAllForTesting: boolean;

  constructor(options: AllowlistPolicyOptions = {}) {
    this.allowedNodeIds = new Set(options.allowedNodeIds || []);
    this.allowedPublicKeys = new Set((options.allowedPublicKeys || []).map(k => k.trim()));
    this.allowedCapabilities = new Set(options.allowedCapabilities || ALLOWED_CAPABILITIES);
    this.expectedSwarmId = options.expectedSwarmId;
    this.allowAllForTesting = options.allowAllForTesting ?? false;
  }

  allowNode(nodeId: string): void {
    this.allowedNodeIds.add(nodeId);
  }

  removeNode(nodeId: string): void {
    this.allowedNodeIds.delete(nodeId);
  }

  isNodeAllowed(nodeId: string): boolean {
    if (this.allowAllForTesting) return true;
    return this.allowedNodeIds.has(nodeId);
  }

  authorizeJoin(context: PeerAuthorizationContext): AuthorizationDecision {
    // 1. Swarm ID check
    if (this.expectedSwarmId && context.swarmId !== this.expectedSwarmId) {
      return {
        allowed: false,
        reason: `Swarm ID mismatch: expected '${this.expectedSwarmId}', got '${context.swarmId}'`
      };
    }

    // 2. Protocol version check
    if (context.protocolVersion !== CURRENT_PROTOCOL_VERSION) {
      return {
        allowed: false,
        reason: `Incompatible protocol version: ${context.protocolVersion}`
      };
    }

    // 3. Allowlist validation
    if (!this.allowAllForTesting) {
      const idAllowed = this.allowedNodeIds.has(context.nodeId);
      const keyAllowed = this.allowedPublicKeys.has(context.publicKey.trim());

      if (!idAllowed && !keyAllowed) {
        return {
          allowed: false,
          reason: `Node '${context.nodeId}' is not authorized to join this swarm`
        };
      }
    }

    // 4. Capabilities filtration
    const granted: SwarmCapability[] = [];
    for (const reqCap of context.requestedCapabilities) {
      if ((ALLOWED_CAPABILITIES as readonly string[]).includes(reqCap)) {
        const typedCap = reqCap as SwarmCapability;
        if (this.allowedCapabilities.has(typedCap) && !granted.includes(typedCap)) {
          granted.push(typedCap);
        }
      }
    }

    if (granted.length === 0) {
      return {
        allowed: false,
        reason: 'No requested capabilities authorized by policy'
      };
    }

    return {
      allowed: true,
      grantedCapabilities: granted
    };
  }
}
