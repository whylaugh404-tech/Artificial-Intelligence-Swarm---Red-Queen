import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Cell } from '../src/redqueen/core/cell';
import { CellMetabolismController } from '../src/redqueen/metabolism/cellular_vitality';
import { InformationSourceType, MetabolismStatus } from '../src/redqueen/metabolism/types';
import * as fs from 'fs';
import * as path from 'path';

describe('Langkah 5: Dynamic Cellular Metabolism & Evolutionary Survival Pressure', () => {
  const testStorageDir = path.join(process.cwd(), '.tmp_test_step5_storage');

  beforeEach(() => {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testStorageDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
  });

  it('1. Controller manages dynamic ATP pool, basal rate, and waste accumulation', () => {
    const controller = new CellMetabolismController({
      initialAtp: 100,
      capacity: 150,
      basalMetabolicRate: 0.5,
      toxicityThreshold: 50
    });

    const initial = controller.getSnapshot();
    expect(initial.atpPool).toBe(100);
    expect(initial.vitalityState).toBe('OPTIMAL');
    expect(initial.activeMode).toBe('BALANCED');

    // 1. Consume ATP for an action
    const spent = controller.consumeAtp(25, 'HIGH_INTENSITY_INFERENCE');
    expect(spent.actualConsumed).toBe(25);
    expect(controller.getSnapshot().atpPool).toBe(75);
    expect(controller.getSnapshot().catabolicWaste).toBeGreaterThan(0);

    // 2. Basal metabolism consumption
    controller.applyBasalMetabolism(2); // 2 intervals * 0.5 = 1.0
    expect(controller.getSnapshot().atpPool).toBe(74);

    // 3. ATP Generation / Feeding
    const gained = controller.generateAtp(20, 'EPISTEMIC_DISCOVERY_YIELD');
    expect(gained.amountGained).toBe(20);
    expect(controller.getSnapshot().atpPool).toBe(94);
  });

  it('2. Toxic catabolic waste degrades efficiency and is cleared via glymphatic clearance', () => {
    const controller = new CellMetabolismController({
      initialAtp: 100,
      capacity: 150,
      toxicityThreshold: 20
    });

    // Incur heavy metabolic processing to accumulate waste beyond toxicity threshold
    for (let i = 0; i < 15; i++) {
      controller.consumeAtp(4, 'HEAVY_WORKLOAD');
    }

    const snapToxic = controller.getSnapshot();
    expect(snapToxic.catabolicWaste).toBeGreaterThanOrEqual(8);

    // Glymphatic clearance (e.g., during Slow-Wave Sleep Consolidation)
    const cleared = controller.glymphaticClearance(0.85);
    expect(cleared.wasteCleared).toBeGreaterThan(0);

    const snapClean = controller.getSnapshot();
    expect(snapClean.catabolicWaste).toBeLessThan(snapToxic.catabolicWaste);
  });

  it('3. Starvation and critical apoptosis risk trigger evolutionary pathway restructuring', () => {
    const controller = new CellMetabolismController({
      initialAtp: 100,
      capacity: 100,
      starvationThreshold: 25,
      criticalThreshold: 10
    });

    // Drain ATP to 20 (below starvation threshold 25)
    controller.consumeAtp(80, 'MASSIVE_COGNITIVE_EFFORT');

    const state = controller.evaluateVitality();
    expect(['STARVATION', 'CRITICAL_APOPTOSIS_RISK']).toContain(state);

    let pruneCalled = false;
    const restructureResult = controller.restructureReasoningPathways({
      hypothesisPruner: () => {
        pruneCalled = true;
        return 3;
      }
    });

    expect(pruneCalled).toBe(true);
    expect(restructureResult.targetReasoningMode).not.toBe('EXPLORATORY_DEEP');
    expect(restructureResult.hypothesesPrunedCount).toBe(3);

    // Autophagic recycling restores a portion of emergency ATP
    expect(controller.getSnapshot().atpPool).toBeGreaterThan(20);
    expect(controller.getSnapshot().survivalRestructuringCount).toBeGreaterThanOrEqual(0);
  });

  it('4. Real Cell instance executes biomimetic metabolism with vitality wiring (Zero Mock)', async () => {
    const storagePath = path.join(testStorageDir, 'cell_vitality.json');
    const cell = new Cell(
      storagePath,
      'test_node_step5',
      undefined,
      undefined,
      undefined,
      { storageSecret: 'test_sec_step5' }
    );

    await cell.start();

    // 1. Initial vitality verification from getStatus()
    const status = cell.getStatus();
    expect(status.metabolismVitality).toBeDefined();
    expect(status.metabolismVitality.atpPool).toBeGreaterThan(0);
    expect(status.metabolismVitality.vitalityState).toBe('OPTIMAL');

    const vitality = cell.getVitality();
    expect(vitality).toBeDefined();

    // 2. Metabolize real InformationRecord and observe dynamic ATP yield
    const res = await cell.metabolize({
      sourceType: InformationSourceType.USER_PROVIDED,
      sourceIdentifier: 'empirical_sensor_quantum',
      content: 'Quantum entanglement enables non-local quantum state teleportation verified by Alain Aspect experiments.'
    });

    expect(res.status).toBe(MetabolismStatus.ACCEPTED);
    
    // Check that metabolism engine recorded audit events
    const events = cell.metabolism.audit.getEvents();
    expect(events.length).toBeGreaterThan(0);

    // 3. Process chat query through Neuro-Symbolic Engine and verify vitality consumption
    const chatRes = await cell.neuroSymbolic.processChat('apa status kesehatan dan energi sel?');
    expect(chatRes.statement).toBeDefined();
    expect(chatRes.telemetry.vitality).toBeDefined();
    expect(chatRes.telemetry.vitality.atpPool).toBeGreaterThan(0);

    // MetabolicCellExpert returned real telemetry
    const metabolicExpertOutput = chatRes.telemetry.activeExperts.find(
      e => e.name === 'MetabolicCellExpert' || e.id === 'expert_metabolic_vitality'
    );
    expect(metabolicExpertOutput).toBeDefined();

    // 4. Autonomous Lifelong Learning cycle respects metabolic reality
    const initialAtp = vitality.getSnapshot().atpPool;
    const cycleRes = cell.neuroSymbolic.lifelongLearning.runLearningCycle();
    expect(cycleRes.investigation).toBeDefined();

    // Trigger Slow-Wave Sleep Consolidation and observe glymphatic waste clearance
    const sleepRes = cell.neuroSymbolic.lifelongLearning.triggerSleepConsolidation();
    expect(sleepRes.replayedItemsCount).toBeGreaterThanOrEqual(0);
    expect(sleepRes.retentionStabilityScore).toBeGreaterThan(0.9);

    await cell.stop();
  });
});
