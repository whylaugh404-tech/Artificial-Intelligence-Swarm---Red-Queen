import { z } from 'zod';
import { signingCrypto } from '../crypto/signing';
import * as crypto from 'crypto';
import { canonicalizeJson } from '../cognition/computation/canonical';

export enum MessageType {
  HELLO = 'HELLO',
  CHALLENGE = 'CHALLENGE',
  AUTH = 'AUTH',
  PING = 'PING',
  PONG = 'PONG',
  FIND_NODE = 'FIND_NODE',
  FIND_NODE_RESPONSE = 'FIND_NODE_RESPONSE',
  FIND_VALUE = 'FIND_VALUE',
  STORE = 'STORE',
  HEARTBEAT = 'HEARTBEAT',
  TASK = 'TASK',
  TASK_RESULT = 'TASK_RESULT',
  APPLICATION = 'APPLICATION', // General application messages
  SWARM_JOIN_REQUEST = 'SWARM_JOIN_REQUEST',
  SWARM_JOIN_RESPONSE = 'SWARM_JOIN_RESPONSE',
  SWARM_CERT_ANNOUNCE = 'SWARM_CERT_ANNOUNCE',
  
  // P5: Distributed Knowledge & Experience Exchange
  KNOWLEDGE_QUERY = 'KNOWLEDGE_QUERY',
  KNOWLEDGE_RESPONSE = 'KNOWLEDGE_RESPONSE',
  KNOWLEDGE_OFFER = 'KNOWLEDGE_OFFER',
  KNOWLEDGE_ACCEPT = 'KNOWLEDGE_ACCEPT',
  KNOWLEDGE_REJECT = 'KNOWLEDGE_REJECT',
  
  EXPERIENCE_QUERY = 'EXPERIENCE_QUERY',
  EXPERIENCE_RESPONSE = 'EXPERIENCE_RESPONSE',
  EXPERIENCE_OFFER = 'EXPERIENCE_OFFER',
  EXPERIENCE_ACCEPT = 'EXPERIENCE_ACCEPT',
  EXPERIENCE_REJECT = 'EXPERIENCE_REJECT',

  // P5.1: Cognitive Representation Exchange
  REPRESENTATION_QUERY = 'REPRESENTATION_QUERY',
  REPRESENTATION_RESPONSE = 'REPRESENTATION_RESPONSE',
  REPRESENTATION_OFFER = 'REPRESENTATION_OFFER',
  REPRESENTATION_ACCEPT = 'REPRESENTATION_ACCEPT',
  REPRESENTATION_REJECT = 'REPRESENTATION_REJECT'
}

export const MessageSchema = z.object({
  version: z.number().int().min(1),
  type: z.nativeEnum(MessageType),
  messageId: z.string(),
  senderId: z.string(), 
  timestamp: z.number(),
  nonce: z.string(),
  payload: z.any(),
  signature: z.string().optional(),
  replyToId: z.string().optional()
});

export type NetworkMessage = z.infer<typeof MessageSchema>;

/**
 * Deterministic canonical serialization (RFC 8785).
 * version:type:messageId:senderId:timestamp:nonce:canonicalizeJson(payload):replyToId
 */
export function getCanonicalString(msg: NetworkMessage): string {
  const canonicalPayload = canonicalizeJson(msg.payload);
  return `${msg.version}:${msg.type}:${msg.messageId}:${msg.senderId}:${msg.timestamp}:${msg.nonce}:${canonicalPayload}${msg.replyToId ? ':' + msg.replyToId : ''}`;
}

export function createMessage(type: MessageType, senderId: string, payload: any, privateKeyPem: string, replyToId?: string): NetworkMessage {
  const msg: NetworkMessage = {
    version: 1,
    type,
    messageId: crypto.randomUUID(),
    senderId,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
    payload
  };

  if (replyToId) {
    msg.replyToId = replyToId;
  }

  const payloadToSign = getCanonicalString(msg);
  msg.signature = signingCrypto.sign(payloadToSign, privateKeyPem);
  
  return msg;
}

export function verifyMessageSignature(msg: NetworkMessage, publicKeyPem: string): boolean {
  if (!msg.signature) return false;
  const payloadToSign = getCanonicalString(msg);
  return signingCrypto.verify(payloadToSign, msg.signature, publicKeyPem);
}

/**
 * Replay protection cache with per-sender messageId and nonce isolation.
 */
export class ReplayCache {
  private seenMessageIds: Map<string, number> = new Map();
  private seenNonces: Map<string, number> = new Map();
  private readonly maxAgeMs = 60000; // 60 seconds TTL

  isDuplicateOrExpired(msg: NetworkMessage): boolean {
    const now = Date.now();
    
    // Check expiration
    if (now - msg.timestamp > this.maxAgeMs) {
      return true; // Expired
    }
    if (msg.timestamp > now + 5000) {
      return true; // From the future (allow 5s clock skew)
    }

    const sender = msg.senderId || 'unknown';
    const msgKey = `${sender}:${msg.messageId}`;
    const nonceKey = `${sender}:${msg.nonce}`;

    // Reject if either messageId has been seen OR nonce has been reused
    if (this.seenMessageIds.has(msgKey) || this.seenNonces.has(nonceKey)) {
      return true;
    }

    // Add to cache
    this.seenMessageIds.set(msgKey, msg.timestamp);
    this.seenNonces.set(nonceKey, msg.timestamp);
    
    // Cleanup periodically
    this.cleanup(now);
    return false;
  }

  private cleanup(now: number) {
    if (this.seenMessageIds.size > 1000) {
      for (const [key, ts] of this.seenMessageIds.entries()) {
        if (now - ts > this.maxAgeMs) {
          this.seenMessageIds.delete(key);
        }
      }
    }
    if (this.seenNonces.size > 1000) {
      for (const [key, ts] of this.seenNonces.entries()) {
        if (now - ts > this.maxAgeMs) {
          this.seenNonces.delete(key);
        }
      }
    }
  }

  public clear(): void {
    this.seenMessageIds.clear();
    this.seenNonces.clear();
  }
}
