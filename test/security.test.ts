import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { MessageType, createMessage, getCanonicalString, MessageSchema } from '../src/redqueen/network/protocol';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import { signingCrypto } from '../src/redqueen/crypto/signing';
import { WebSocket } from 'ws';

describe('P2P Security Negative Tests', () => {
  let cellB: Cell;
  let attackerKeys: { publicKey: string, privateKey: string };
  let attackerNodeId: string;

  beforeAll(async () => {
    cellB = new Cell('./data/memSecurity.json', 'test_key_b');
    await cellB.start(4005); // Use isolated port
    attackerKeys = identityCrypto.generateKeyPair();
    attackerNodeId = identityCrypto.deriveNodeId(attackerKeys.publicKey);
  });

  afterAll(async () => {
    await cellB.stop();
  });

  async function doHandshakeAndGetSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:4005');
      
      ws.on('open', () => {
        const helloMsg = createMessage(MessageType.HELLO, attackerNodeId, { publicKey: attackerKeys.publicKey }, attackerKeys.privateKey);
        ws.send(JSON.stringify(helloMsg));
      });
      
      ws.on('message', (data) => {
        try {
          const msg = MessageSchema.parse(JSON.parse(data.toString()));
          if (msg.type === MessageType.CHALLENGE) {
            const authMsg = createMessage(MessageType.AUTH, attackerNodeId, { response: msg.payload.challenge }, attackerKeys.privateKey);
            ws.send(JSON.stringify(authMsg));
            
            // Wait a beat for the Cell to process our AUTH message and transition state
            setTimeout(() => resolve(ws), 100);
          }
        } catch (e) {
          // ignore parsing errors on our end during setup
        }
      });
      
      ws.on('error', reject);
    });
  }

  it('1. should reject a message with an invalid signature (tampered payload)', async () => {
    const ws = await doHandshakeAndGetSocket();
    let messageProcessed = false;
    
    cellB.transport.onMessage((msg) => {
      if (msg.payload.test === 'tampered') messageProcessed = true;
    });

    const validMsg = createMessage(MessageType.APPLICATION, attackerNodeId, { test: 'tampered' }, attackerKeys.privateKey);
    // Tamper with the payload AFTER signing
    validMsg.payload = { test: 'tampered_malicious_change' };
    
    ws.send(JSON.stringify(validMsg));

    await new Promise(r => setTimeout(r, 200));
    expect(messageProcessed).toBe(false);
    ws.terminate();
  });

  it('2. should reject a replayed message', async () => {
    const ws = await doHandshakeAndGetSocket();
    let processedCount = 0;
    
    cellB.transport.onMessage((msg) => {
      if (msg.payload.test === 'replay') processedCount++;
    });

    const msg = createMessage(MessageType.APPLICATION, attackerNodeId, { test: 'replay' }, attackerKeys.privateKey);
    const rawMsg = JSON.stringify(msg);
    
    ws.send(rawMsg); // First attempt
    await new Promise(r => setTimeout(r, 100));
    
    ws.send(rawMsg); // Replay attempt
    await new Promise(r => setTimeout(r, 200));

    expect(processedCount).toBe(1); // Should only be processed once
    ws.terminate();
  });

  it('3. should reject an expired message', async () => {
    const ws = await doHandshakeAndGetSocket();
    let messageProcessed = false;
    
    cellB.transport.onMessage((msg) => {
      if (msg.payload.test === 'expired') messageProcessed = true;
    });

    const msg = createMessage(MessageType.APPLICATION, attackerNodeId, { test: 'expired' }, attackerKeys.privateKey);
    // Force timestamp to be outside the 60 second replay window (e.g. 2 minutes old)
    msg.timestamp = Date.now() - 120000;
    // Resign the canonical string because we modified the timestamp
    msg.signature = signingCrypto.sign(getCanonicalString(msg), attackerKeys.privateKey);
    
    ws.send(JSON.stringify(msg));

    await new Promise(r => setTimeout(r, 200));
    expect(messageProcessed).toBe(false);
    ws.terminate();
  });

  it('4. should reject a future message', async () => {
    const ws = await doHandshakeAndGetSocket();
    let messageProcessed = false;
    
    cellB.transport.onMessage((msg) => {
      if (msg.payload.test === 'future') messageProcessed = true;
    });

    const msg = createMessage(MessageType.APPLICATION, attackerNodeId, { test: 'future' }, attackerKeys.privateKey);
    // Force timestamp to be too far in the future (>5s clock skew allowed)
    msg.timestamp = Date.now() + 10000;
    msg.signature = signingCrypto.sign(getCanonicalString(msg), attackerKeys.privateKey);
    
    ws.send(JSON.stringify(msg));

    await new Promise(r => setTimeout(r, 200));
    expect(messageProcessed).toBe(false);
    ws.terminate();
  });

  it('5. should reject message with spoofed Node ID', async () => {
    const ws = await doHandshakeAndGetSocket();
    let messageProcessed = false;
    
    cellB.transport.onMessage((msg) => {
      if (msg.payload.test === 'wrong_id') messageProcessed = true;
    });

    const msg = createMessage(MessageType.APPLICATION, attackerNodeId, { test: 'wrong_id' }, attackerKeys.privateKey);
    // Change senderId to something else, but sign the modified payload so signature matches public key,
    // but the senderId inside the message will mismatch the remoteNodeId registered for this WebSocket connection.
    msg.senderId = 'spoofed_fake_node_id';
    msg.signature = signingCrypto.sign(getCanonicalString(msg), attackerKeys.privateKey);
    
    ws.send(JSON.stringify(msg));

    await new Promise(r => setTimeout(r, 200));
    expect(messageProcessed).toBe(false);
    ws.terminate();
  });
});
