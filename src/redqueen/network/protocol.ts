import { z } from 'zod';
import { signingCrypto } from '../crypto/signing';
import * as crypto from 'crypto';

export enum MessageType {
  HELLO = 'HELLO',
  CHALLENGE = 'CHALLENGE',
  AUTH = 'AUTH',
  PING = 'PING',
  PONG = 'PONG',
  FIND_NODE = 'FIND_NODE',
  FIND_VALUE = 'FIND_VALUE',
  STORE = 'STORE',
  HEARTBEAT = 'HEARTBEAT',
  TASK = 'TASK',
  TASK_RESULT = 'TASK_RESULT',
  APPLICATION = 'APPLICATION' // General application messages
}

export const MessageSchema = z.object({
  version: z.number().int().min(1),
  type: z.nativeEnum(MessageType),
  messageId: z.string(),
  senderId: z.string(), 
  timestamp: z.number(),
  nonce: z.string(),
  payload: z.any(),
  signature: z.string().optional()
});

export type NetworkMessage = z.infer<typeof MessageSchema>;

/**
 * Deterministic canonical serialization.
 * version:type:messageId:senderId:timestamp:nonce:stringify(payload)
 */
export function getCanonicalString(msg: NetworkMessage): string {
  // We stringify payload deterministically if possible, but standard JSON.stringify 
  // is fine as long as the sender creates the signature immediately after stringifying 
  // the exact same object they attach to the message.
  return `${msg.version}:${msg.type}:${msg.messageId}:${msg.senderId}:${msg.timestamp}:${msg.nonce}:${JSON.stringify(msg.payload)}`;
}

export function createMessage(type: MessageType, senderId: string, payload: any, privateKeyPem: string): NetworkMessage {
  const msg: NetworkMessage = {
    version: 1,
    type,
    messageId: crypto.randomUUID(),
    senderId,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
    payload
  };

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
 * Replay protection cache
 */
export class ReplayCache {
  private seenMessages: Map<string, number> = new Map();
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

    // Check duplicate nonce/messageId
    const cacheKey = `${msg.messageId}:${msg.nonce}`;
    if (this.seenMessages.has(cacheKey)) {
      return true;
    }

    // Add to cache
    this.seenMessages.set(cacheKey, msg.timestamp);
    
    // Cleanup periodically
    this.cleanup(now);
    return false;
  }

  private cleanup(now: number) {
    // Basic cleanup: if map gets too large, sweep expired entries
    if (this.seenMessages.size > 1000) {
      for (const [key, ts] of this.seenMessages.entries()) {
        if (now - ts > this.maxAgeMs) {
          this.seenMessages.delete(key);
        }
      }
    }
  }
}
