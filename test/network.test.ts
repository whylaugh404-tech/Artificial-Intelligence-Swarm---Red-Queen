import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { MessageType } from '../src/redqueen/network/protocol';

describe('Real Two-Cell P2P Integration', () => {
  let cellA: Cell;
  let cellB: Cell;

  beforeAll(async () => {
    // Generate isolated instances
    cellA = new Cell('./data/memA.json', 'test_key_a');
    cellB = new Cell('./data/memB.json', 'test_key_b');

    await cellA.start(4001);
    await cellB.start(4002);
  });

  afterAll(async () => {
    await cellA.stop();
    await cellB.stop();
  });

  it('should authenticate and connect Cell A to Cell B via WebSockets', async () => {
    // A connects to B
    await cellA.connectToPeer('ws://localhost:4002');
    
    // Check that both cells register 1 active authenticated peer
    expect(cellA.transport.getActivePeerCount()).toBe(1);
    
    // B might take a few extra ms to finish the callback on its side
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(cellB.transport.getActivePeerCount()).toBe(1);
  });

  it('should allow authenticated message delivery', async () => {
    let receivedByB = false;

    cellB.transport.onMessage((msg) => {
      if (msg.type === MessageType.APPLICATION && msg.payload.hello === 'world') {
        receivedByB = true;
      }
    });

    cellA.transport.broadcast(MessageType.APPLICATION, { hello: 'world' });

    // Wait for network delivery
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    expect(receivedByB).toBe(true);
  });
  
  it('should fail closed for invalid signatures or malformed connections', async () => {
    const { WebSocket } = await import('ws');
    
    let wasClosed = false;
    const ws = new WebSocket('ws://localhost:4002');
    
    await new Promise<void>((resolve, reject) => {
       ws.on('close', () => { wasClosed = true; resolve(); });
       ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'HELLO', payload: { publicKey: 'fake' }}));
       });
       ws.on('error', (err) => reject(err));
       setTimeout(() => { if (!wasClosed) resolve(); }, 1000);
    });
    
    expect(wasClosed).toBe(true);
  });
});
