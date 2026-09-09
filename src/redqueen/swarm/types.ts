import { z } from 'zod';
import { NODE_ID_REGEX } from '../validation/validators';

export enum MembershipState {
  DISCOVERED = 'DISCOVERED',
  AUTHENTICATED = 'AUTHENTICATED',
  AUTHORIZED = 'AUTHORIZED',
  MEMBER = 'MEMBER',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
  DENIED = 'DENIED'
}

export const ALLOWED_CAPABILITIES = ['discovery', 'routing', 'computation', 'memory'] as const;
export type SwarmCapability = typeof ALLOWED_CAPABILITIES[number];

export const MAX_CERTIFICATE_BYTES = 8192;
export const DEFAULT_CERT_TTL_MS = 3600 * 1000; // 1 hour
export const CLOCK_SKEW_TOLERANCE_MS = 5000; // 5 seconds
export const CURRENT_PROTOCOL_VERSION = 1;
export const CURRENT_MEMBERSHIP_VERSION = 1;

export const MembershipCertificateSchema = z.object({
  certificateId: z.string().uuid(),
  swarmId: z.string().min(1).max(128),
  memberNodeId: z.string().regex(NODE_ID_REGEX, 'memberNodeId must be a valid 64-char hex string'),
  memberPublicKey: z.string().min(1).max(2048),
  issuerId: z.string().regex(NODE_ID_REGEX, 'issuerId must be a valid 64-char hex string'),
  issuerPublicKey: z.string().min(1).max(2048),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  membershipVersion: z.number().int().min(1).max(10),
  protocolVersion: z.number().int().min(1).max(10),
  capabilities: z.array(z.enum(ALLOWED_CAPABILITIES)).min(1).max(10),
  revocationEpoch: z.number().int().min(0).default(0),
  signature: z.string().regex(/^[0-9a-f]+$/i, 'signature must be a valid hex string').min(64).max(512)
});

export type MembershipCertificate = z.infer<typeof MembershipCertificateSchema>;

export const SwarmJoinRequestSchema = z.object({
  requestId: z.string().min(1).max(64),
  swarmId: z.string().min(1).max(128),
  nodeId: z.string().regex(NODE_ID_REGEX),
  publicKey: z.string().min(1).max(2048),
  capabilities: z.array(z.string().min(1).max(32)).min(1).max(10),
  protocolVersion: z.number().int().min(1).max(10),
  nonce: z.string().min(1).max(64),
  timestamp: z.number().int().positive()
});

export type SwarmJoinRequestPayload = z.infer<typeof SwarmJoinRequestSchema>;

export const SwarmJoinResponseSchema = z.object({
  requestId: z.string().min(1).max(64),
  swarmId: z.string().min(1).max(128),
  status: z.enum(['ACCEPTED', 'DENIED']),
  reason: z.string().max(256).optional(),
  certificate: MembershipCertificateSchema.optional()
});

export type SwarmJoinResponsePayload = z.infer<typeof SwarmJoinResponseSchema>;

export const SwarmCertAnnounceSchema = z.object({
  certificate: MembershipCertificateSchema
});

export type SwarmCertAnnouncePayload = z.infer<typeof SwarmCertAnnounceSchema>;

export interface SwarmIdentity {
  swarmId: string;
  protocolVersion: number;
  membershipVersion: number;
  issuerId: string;
  issuerPublicKey: string;
}

export interface PeerAuthorizationContext {
  nodeId: string;
  publicKey: string;
  swarmId: string;
  requestedCapabilities: string[];
  protocolVersion: number;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
  grantedCapabilities?: SwarmCapability[];
}

export interface AuthorizationPolicy {
  authorizeJoin(context: PeerAuthorizationContext): Promise<AuthorizationDecision> | AuthorizationDecision;
}

export interface PeerMembershipRecord {
  nodeId: string;
  publicKey?: string;
  state: MembershipState;
  certificate?: MembershipCertificate;
  updatedAt: number;
  reason?: string;
}
