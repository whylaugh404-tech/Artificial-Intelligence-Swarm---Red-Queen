import { z } from 'zod';
import { identityCrypto } from '../crypto/identity';

export const NODE_ID_REGEX = /^[0-9a-f]{64}$/;
export const MAX_MESSAGE_BYTES = 65536; // 64 KB max message payload
export const MAX_PEERS_PER_RESPONSE = 20;

/**
 * Checks if a value is a strictly valid canonical Node ID.
 * Must be a 64-character lowercase hexadecimal string.
 */
export function isValidNodeId(nodeId: unknown): nodeId is string {
  return typeof nodeId === 'string' && nodeId.length === 64 && NODE_ID_REGEX.test(nodeId);
}

/**
 * Validates a Node ID and returns a descriptive error reason if invalid.
 */
export function validateNodeId(nodeId: unknown, context: string = 'nodeId'): { valid: boolean; reason?: string } {
  if (typeof nodeId !== 'string') {
    return { valid: false, reason: `${context} must be a string` };
  }
  if (nodeId.length === 0) {
    return { valid: false, reason: `${context} cannot be empty` };
  }
  if (nodeId.length !== 64) {
    return { valid: false, reason: `${context} must be exactly 64 characters (received ${nodeId.length})` };
  }
  if (/[A-F]/.test(nodeId)) {
    return { valid: false, reason: `${context} must be lowercase hexadecimal` };
  }
  if (!NODE_ID_REGEX.test(nodeId)) {
    return { valid: false, reason: `${context} contains invalid non-hexadecimal characters` };
  }
  return { valid: true };
}

/**
 * Strict endpoint validator for Red Queen P2P WebSockets.
 * Requires:
 * - string, 1..256 characters
 * - ws: or wss: protocol
 * - valid hostname
 * - valid port 1..65535
 * - no credentials (user:pass@)
 * - no directory traversal in path
 */
export function validateEndpoint(endpoint: unknown): { valid: boolean; reason?: string; normalizedUrl?: string } {
  if (typeof endpoint !== 'string') {
    return { valid: false, reason: 'Endpoint must be a string' };
  }
  const trimmed = endpoint.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: 'Endpoint cannot be empty' };
  }
  if (trimmed.length > 256) {
    return { valid: false, reason: 'Endpoint exceeds maximum length of 256 characters' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (err: any) {
    return { valid: false, reason: `Malformed endpoint URL: ${err.message}` };
  }

  // Protocol check
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    return { valid: false, reason: `Invalid protocol '${parsed.protocol}'. Only ws: and wss: are permitted` };
  }

  // Credentials check
  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'Authentication credentials in endpoint URLs are strictly forbidden' };
  }

  // Hostname check
  if (!parsed.hostname || parsed.hostname.length === 0) {
    return { valid: false, reason: 'Endpoint hostname cannot be empty' };
  }

  // Port check
  let portNum: number;
  if (parsed.port) {
    portNum = parseInt(parsed.port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return { valid: false, reason: `Invalid port '${parsed.port}'. Must be an integer between 1 and 65535` };
    }
  } else {
    // Default ports for ws/wss
    portNum = parsed.protocol === 'wss:' ? 443 : 80;
  }

  // Path traversal check on input string
  if (trimmed.includes('..') || trimmed.includes('\\')) {
    return { valid: false, reason: 'Endpoint path contains illegal traversal characters' };
  }

  // Path check
  if (parsed.pathname.includes('//')) {
    return { valid: false, reason: 'Endpoint path contains illegal characters' };
  }

  // Query parameters or hash fragments check - DHT endpoints should be clean origins or simple paths
  if (parsed.search || parsed.hash) {
    return { valid: false, reason: 'Query parameters and fragments are not allowed in DHT endpoint URLs' };
  }

  const normalized = `${parsed.protocol}//${parsed.hostname}:${portNum}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  return { valid: true, normalizedUrl: normalized };
}

/**
 * Validates that a Node ID matches an Ed25519 Public Key.
 */
export function validatePeerIdentity(nodeId: unknown, publicKeyPem: unknown): { valid: boolean; reason?: string } {
  const idCheck = validateNodeId(nodeId, 'peerNodeId');
  if (!idCheck.valid) {
    return idCheck;
  }

  if (typeof publicKeyPem !== 'string' || publicKeyPem.length === 0) {
    return { valid: false, reason: 'publicKey must be a non-empty string' };
  }

  if (publicKeyPem.length > 2048) {
    return { valid: false, reason: 'publicKey exceeds maximum length of 2048 bytes' };
  }

  if (!identityCrypto.isValidPublicKey(publicKeyPem)) {
    return { valid: false, reason: 'Invalid Ed25519 public key format' };
  }

  const expectedNodeId = identityCrypto.deriveNodeId(publicKeyPem);
  if (expectedNodeId !== nodeId) {
    return {
      valid: false,
      reason: `Node ID mismatch: expected ${expectedNodeId} derived from public key, but received ${nodeId}`
    };
  }

  return { valid: true };
}

// Zod schemas for DHT messages
export const FindNodePayloadSchema = z.object({
  targetNodeId: z.string().regex(NODE_ID_REGEX, 'targetNodeId must be a valid 64-character lowercase hex string')
});

export const FindNodeResponsePeerSchema = z.object({
  nodeId: z.string().regex(NODE_ID_REGEX, 'nodeId must be a valid 64-character lowercase hex string'),
  publicKey: z.string().min(1).max(2048),
  endpoint: z.string().min(1).max(256).optional()
});

export const FindNodeResponsePayloadSchema = z.object({
  targetNodeId: z.string().regex(NODE_ID_REGEX, 'targetNodeId must be a valid 64-character lowercase hex string'),
  peers: z.array(FindNodeResponsePeerSchema).max(MAX_PEERS_PER_RESPONSE, 'Cannot return more than 20 peers in FIND_NODE_RESPONSE')
});
