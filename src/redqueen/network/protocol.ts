import { z } from 'zod';
import { signingCrypto } from '../crypto/signing';

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
  TASK_RESULT = 'TASK_RESULT'
}

export const MessageSchema = z.object({
  version: z.number().int().min(1),
  type: z.nativeEnum(MessageType),
  messageId: z.string(),
  senderId: z.string(), // Derived Node ID
  timestamp: z.number(),
  nonce: z.string(),
  payload: z.any(),
  signature: z.string().optional()
});

export type NetworkMessage = z.infer<typeof MessageSchema>;

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

  const payloadToSign = `${msg.messageId}:${msg.senderId}:${msg.timestamp}:${msg.nonce}:${JSON.stringify(msg.payload)}`;
  msg.signature = signingCrypto.sign(payloadToSign, privateKeyPem);
  
  return msg;
}

export function verifyMessageSignature(msg: NetworkMessage, publicKeyPem: string): boolean {
  if (!msg.signature) return false;
  const payloadToSign = `${msg.messageId}:${msg.senderId}:${msg.timestamp}:${msg.nonce}:${JSON.stringify(msg.payload)}`;
  return signingCrypto.verify(payloadToSign, msg.signature, publicKeyPem);
}
