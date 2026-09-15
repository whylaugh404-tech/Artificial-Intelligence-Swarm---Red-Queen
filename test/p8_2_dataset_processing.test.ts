import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Cell } from '../src/redqueen/core/cell';
import { ComputationStatus } from '../src/redqueen/cognition/computation/types';

describe('P8.2 - Real Dataset Processing via Distributed Computation Fabric', () => {
  let orchestrator: Cell;
  let worker1: Cell;
  let worker2: Cell;
  let worker3: Cell;
  const ports = [31901, 31902, 31903, 31904];

  beforeEach(async () => {
    orchestrator = new Cell(':memory:', 'dummy_orch', undefined, undefined, undefined, {
      capabilities: ['SWARM_COORDINATION'] as any,
      specialization: 'ORCHESTRATOR'
    });

    worker1 = new Cell(':memory:', 'dummy_w1', undefined, undefined, undefined, {
      capabilities: ['INFO_PROCESSING'] as any,
      specialization: 'WORKER_ALPHA'
    });
    
    worker2 = new Cell(':memory:', 'dummy_w2', undefined, undefined, undefined, {
      capabilities: ['INFO_PROCESSING'] as any,
      specialization: 'WORKER_BETA'
    });

    worker3 = new Cell(':memory:', 'dummy_w3', undefined, undefined, undefined, {
      capabilities: ['INFO_PROCESSING'] as any,
      specialization: 'WORKER_GAMMA'
    });

    await orchestrator.start(ports[0]);
    await worker1.start(ports[1]);
    await worker2.start(ports[2]);
    await worker3.start(ports[3]);

    // Connect peers to form a P2P network
    await orchestrator.connectToPeer(`ws://localhost:${ports[1]}`);
    await orchestrator.connectToPeer(`ws://localhost:${ports[2]}`);
    await orchestrator.connectToPeer(`ws://localhost:${ports[3]}`);

    // Wait for handshake, authentication, and capability exchange
    await new Promise(r => setTimeout(r, 2000));
  });

  afterEach(async () => {
    await orchestrator.stop();
    await worker1.stop();
    await worker2.stop();
    await worker3.stop();
    await new Promise(r => setTimeout(r, 200));
  });

  it('Processes a CSV dataset in parallel using multiple Cells', async () => {
    console.log('--- BEGIN P8.2 BENCHMARK ---');
    const startTime = Date.now();
    
    // 1. Load Real Dataset
    const csvPath = path.join(__dirname, 'fixtures', 'input_dataset.csv');
    const csvData = fs.readFileSync(csvPath, 'utf-8');
    
    // Robust RFC-compliant CSV line parser to handle multi-line quotes and commas
    const rows: string[][] = [];
    let curRow: string[] = [];
    let curCell = '';
    let inQuotes = false;
    for (let i = 0; i < csvData.length; i++) {
      const ch = csvData[i];
      const next = csvData[i + 1];
      if (ch === '"') {
        if (inQuotes && next === '"') {
          curCell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        curRow.push(curCell);
        curCell = '';
      } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
        if (ch === '\r' && next === '\n') i++;
        curRow.push(curCell);
        if (curRow.length > 0 && (curRow.length > 1 || curRow[0] !== '')) {
          rows.push(curRow);
        }
        curRow = [];
        curCell = '';
      } else {
        curCell += ch;
      }
    }
    if (curCell || curRow.length > 0) {
      curRow.push(curCell);
      rows.push(curRow);
    }

    const headers = rows[0];
    const records = rows.slice(1).map((parts, idx) => {
      return { id: idx + 1, kalimat: parts[0], sentiment: parseInt(parts[1], 10) || 0 };
    });
    const datasetSize = records.length;
    
    // 2. Partitioning / Decomposition
    // We partition the real dataset into 3 chunks for our 3 distributed workers
    const numPartitions = 3;
    const chunkSize = Math.ceil(records.length / numPartitions);
    const subtasks = [];
    const workerSpecializations = ['WORKER_ALPHA', 'WORKER_BETA', 'WORKER_GAMMA'];
    
    for (let i = 0; i < numPartitions; i++) {
      const chunk = records.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length > 0) {
        subtasks.push({
          type: 'DATA_TRANSFORMATION',
          payload: { items: chunk, transformation: 'SENTIMENT_FREQUENCY_AGGREGATION' },
          requiredCapabilities: ['INFO_PROCESSING'],
          requiredSpecialization: workerSpecializations[i]
        });
      }
    }

    const task = orchestrator.collectiveComputation.createTask({
      goal: 'Process Dataset Remotely via Fabric Discovery',
      computationType: 'DATA_TRANSFORMATION',
      payload: {
        subtasks
      }
    });

    const memBefore = process.memoryUsage().heapUsed;
    const dispatchStartTime = Date.now();

    // 3. Capability Discovery & Remote Dispatch & Parallel Execution
    // `executeTask` automatically handles the fabric discovery via DHT since we don't pass `availableCells`.
    const res = await orchestrator.collectiveComputation.executeTask(task);

    const executionTime = Date.now() - dispatchStartTime;
    const memAfter = process.memoryUsage().heapUsed;
    const memOverhead = memAfter - memBefore;

    // 4. Verification and Results
    expect(res.status).toBe('COMPLETED');
    expect(res.taskId).toBe(task.taskId);

    const subtaskIds = Object.keys(res.finalOutput.aggregatedOutputs);
    const executingCells = new Set();
    
    let totalHashVerificationTime = 0; // We'll estimate this from the tracing
    
    for (const subtaskId of subtaskIds) {
      const out = res.finalOutput.aggregatedOutputs[subtaskId] as any;
      executingCells.add(out.executingCell);
      
      const partialRes = res.partialResults[subtaskId];
      expect(partialRes.status).toBe(ComputationStatus.COMPLETED);
      
      // Verify Provenance
      expect(partialRes.provenance.length).toBeGreaterThanOrEqual(2);
      expect(partialRes.provenance[0]).toBe(orchestrator.nodeId);
      
      // Check execution was remote
      expect(partialRes.executingCellId).not.toBe(orchestrator.nodeId);
    }

    const totalRoundTrip = Date.now() - startTime;

    // Log the requested metrics
    console.log(`- Ukuran dataset: ${datasetSize} records`);
    console.log(`- Jumlah partition: ${numPartitions}`);
    console.log(`- Jumlah Cell yang digunakan: ${executingCells.size + 1} (1 Orchestrator, ${executingCells.size} Workers)`);
    
    console.log(`- Cell yang mengerjakan setiap partition:`);
    for (const subtaskId of subtaskIds) {
      const out = res.finalOutput.aggregatedOutputs[subtaskId] as any;
      console.log(`    Partition ${subtaskId.substring(0,8)} -> Cell ${out.executingCell.substring(0,8)}`);
    }

    // Since dispatch is handled internally by executeTask, executionTime represents (dispatch + execution + network overhead)
    // The composition result gives us the calculated overheads.
    const costs = (res.finalOutput as any).costs;
    console.log(`- Waktu dispatch & execution parallel (roundtrip internal): ${executionTime} ms`);
    console.log(`- Overhead komunikasi (estimated in cost model): ${costs.communicationCost}`);
    console.log(`- Overhead sinkronisasi: ${costs.synchronizationCost}`);
    console.log(`- Waktu validasi hash & provenance (cost model): ${costs.verificationCost}`);
    console.log(`- Total waktu round-trip: ${totalRoundTrip} ms`);
    console.log(`- Memory overhead: ${(memOverhead / 1024 / 1024).toFixed(2)} MB`);

    console.log('--- END P8.2 BENCHMARK ---');

  }, 30000); // 30s timeout for complex DHT setup and execution
});
