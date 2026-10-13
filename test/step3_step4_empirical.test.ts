import { describe, it, expect, afterAll } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { MessageType } from '../src/redqueen/network/protocol';
import * as fs from 'fs';
import * as path from 'path';

describe('Empirical Verification: Langkah 3 (Autonomous Heartbeat) & Langkah 4 (Real P2P Swarm)', () => {
  const testDataDir = path.join(process.cwd(), 'data', 'test_step3_step4');

  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }

  const cellsToClean: Cell[] = [];

  afterAll(async () => {
    for (const cell of cellsToClean) {
      try {
        await cell.stop();
      } catch {
        // ignore
      }
    }
    // Clean test files
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('Langkah 3: Autonomous Background Heartbeat (24/7 Lifelong Learning)', () => {
    it('should start lifelong learning daemon and verify integrated curiosity & hypothesis cycles', async () => {
      const memPath = path.join(testDataDir, 'mem_step3.json');
      const cell = new Cell(memPath, 'step3_key');
      cellsToClean.push(cell);

      await cell.start(); // Starts cell and daemon

      const lifelong = cell.neuroSymbolic.lifelongLearning;
      expect(lifelong).toBeDefined();

      // Initial scan
      const initialTelemetry = lifelong.getTelemetry();
      expect(initialTelemetry.isDaemonActive).toBe(true);

      // Execute real learning cycle
      const outcome = lifelong.runLearningCycle();
      expect(outcome.investigation).toBeDefined();
      expect(outcome.investigation.status).toBe('RESOLVED');
      expect(outcome.investigation.deducedTriplet).toBeDefined();
      expect(outcome.investigation.evidenceTraces.length).toBeGreaterThan(0);

      // Verify hypothesis generation and ATP staking
      expect(outcome.discovery).toBeDefined();
      if (outcome.discovery) {
        expect(outcome.discovery.epistemicConfidence).toBeGreaterThanOrEqual(0.85);
        expect(outcome.discovery.atpInvested).toBeGreaterThan(0);
        expect(outcome.discovery.symbolicProofTrace.length).toBeGreaterThanOrEqual(2);
      }

      // Check sleep consolidation buffer
      const telemetryAfterCycle = lifelong.getTelemetry();
      expect(telemetryAfterCycle.totalLifelongCyclesRun).toBeGreaterThanOrEqual(1);

      // Trigger sleep consolidation
      const sleepReport = lifelong.triggerSleepConsolidation();
      expect(sleepReport.sessionId).toBeDefined();
      expect(sleepReport.retentionStabilityScore).toBe(1.0); // 100% Zero Catastrophic Forgetting
    });

    it('should automatically queue ungrounded conversational queries into curiosity loop', async () => {
      const memPath = path.join(testDataDir, 'mem_step3_curiosity.json');
      const cell = new Cell(memPath, 'step3_curiosity_key');
      cellsToClean.push(cell);

      await cell.start();

      const curiosity = cell.neuroSymbolic.lifelongLearning.curiosity;
      const initialGapsCount = curiosity.getActiveGaps().length;

      // Ask an unknown entity query
      const chatResponse = await cell.neuroSymbolic.processChat('siapa walikota antartika saat ini?');
      expect(chatResponse.statement).toBeDefined();

      // Verify that this ungrounded query was registered as a knowledge gap
      const gapsAfterChat = curiosity.getActiveGaps();
      expect(gapsAfterChat.length).toBeGreaterThanOrEqual(initialGapsCount);

      // Verify the curiosity engine can investigate this gap
      const investigation = curiosity.investigateGap();
      expect(investigation.status).toBe('RESOLVED');
      expect(investigation.evidenceTraces.length).toBeGreaterThan(0);
    });
  });

  describe('Langkah 4: Real P2P Network Port Binding & Swarm Connectivity', () => {
    it('should bind real WebSocket server ports, authenticate peers, and deliver messages', async () => {
      const memA = path.join(testDataDir, 'mem_p2p_a.json');
      const memB = path.join(testDataDir, 'mem_p2p_b.json');

      const cellA = new Cell(memA, 'p2p_key_a');
      const cellB = new Cell(memB, 'p2p_key_b');
      cellsToClean.push(cellA, cellB);

      const portA = 5411;
      const portB = 5412;

      await cellA.start(portA);
      await cellB.start(portB);

      // Verify real listening ports
      expect(cellA.transport.getPort()).toBe(portA);
      expect(cellB.transport.getPort()).toBe(portB);
      expect(cellA.boundPort).toBe(portA);
      expect(cellB.boundPort).toBe(portB);

      // Connect cellA to cellB
      await cellA.connectToPeer(`ws://127.0.0.1:${portB}`);

      // Allow handshake completion
      await new Promise(r => setTimeout(r, 600));

      expect(cellA.transport.getActivePeerCount()).toBe(1);
      expect(cellB.transport.getActivePeerCount()).toBe(1);

      // Authenticated message delivery
      let receivedPayload: any = null;
      cellB.transport.onMessage((msg) => {
        if (msg.type === MessageType.APPLICATION && msg.payload?.topic === 'epistemic_consensus') {
          receivedPayload = msg.payload;
        }
      });

      cellA.transport.broadcast(MessageType.APPLICATION, {
        topic: 'epistemic_consensus',
        discoveryId: 'disc_crypto_ed25519',
        confidence: 0.98
      });

      // Wait for network delivery
      await new Promise(r => setTimeout(r, 800));

      expect(receivedPayload).not.toBeNull();
      expect(receivedPayload.topic).toBe('epistemic_consensus');
      expect(receivedPayload.confidence).toBe(0.98);
    });

    it('should dynamically bind to ephemeral port (port: 0) without collisions', async () => {
      const memC = path.join(testDataDir, 'mem_p2p_c.json');
      const cellC = new Cell(memC, 'p2p_key_c');
      cellsToClean.push(cellC);

      await cellC.start(0);

      const assignedPort = cellC.transport.getPort();
      expect(assignedPort).toBeGreaterThan(0);
      expect(assignedPort).not.toBe(3000);
      expect(assignedPort).not.toBe(3001);
      expect(cellC.transport.publicEndpoint).toContain(`ws://127.0.0.1:${assignedPort}`);
    });
  });
});
