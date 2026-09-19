import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Cell } from '../src/redqueen/core/cell';
import { CellState } from '../src/redqueen/core/lifecycle';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import {
  ReproductionTriggerReason,
  ReproductionWarrantSchema,
  EvolutionTriggerType
} from '../src/redqueen/evolution/types';
import { MetabolismStatus, InformationCategory, NoveltyClassification } from '../src/redqueen/metabolism/types';
import { CognitiveDevelopmentResult } from '../src/redqueen/cognition/development/engine';
import { MemoryCategory } from '../src/redqueen/memory/store';

describe('RED QUEEN P09: Evolution -> Mitosis Causal Bridge', () => {
  let tmpDir: string;
  let creatorKeys: { publicKey: string; privateKey: string };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rq_p09_test_'));
    process.env.REDQUEEN_STORAGE_SECRET = 'p09_storage_verification_secret_32bytes!!';
    creatorKeys = identityCrypto.generateKeyPair();
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  function createSignedProof(parentCellId: string, eventId: string, action: string = 'reproduce', expOffsetMs: number = 60000) {
    const payload = {
      action,
      subject: parentCellId,
      eventId,
      issuer: 'redqueen_genesis_authority',
      exp: Date.now() + expOffsetMs,
      timestamp: Date.now()
    };
    const payloadStr = JSON.stringify(payload);
    const signature = identityCrypto.signData(creatorKeys.privateKey, payloadStr);
    return {
      payload,
      issuerPublicKey: creatorKeys.publicKey,
      signature
    };
  }

  it('1. Evaluates eligible parent and executes causal reproduction with lineage and memory partition', async () => {
    const storagePath = path.join(tmpDir, 'parent_cell_1.json');
    const parent = new Cell(
      storagePath,
      'test-api-key',
      undefined,
      undefined,
      undefined,
      {
        storageSecret: 'p09_storage_verification_secret_32bytes!!',
        capabilities: ['COGNITIVE_REASONING', 'INFO_PROCESSING'],
        specialization: 'cyber_intelligence',
        reproductionPolicy: {
          requireAuthorization: false,
          populationCeiling: 10,
          cooldownMs: 60000,
          minMemoryPressure: 0.5,
          allowDifferentiation: true
        }
      }
    );

    await parent.start();

    // Populate experience & feedback telemetry to build evolutionary fitness evidence
    const exp = {
      experienceId: `exp_p09_01`,
      transactionId: 'tx_p09_01',
      cellId: parent.nodeId,
      timestamp: new Date().toISOString(),
      informationId: 'info_p09_01',
      knowledgeIds: [],
      category: InformationCategory.AI,
      outcome: MetabolismStatus.ACCEPTED,
      noveltyClassification: NoveltyClassification.NOVEL,
      noveltyScore: 0.2,
      source: 'test_telemetry_source',
      confidence: 0.95,
      verificationStatus: 'CONFIRMED_BY_WORLD',
      lessonsDerived: ['Verified epistemic alignment']
    };

    const devResult: CognitiveDevelopmentResult = {
      conceptsStrengthened: ['cyber_defense', 'neural_routing'],
      conceptsWeakened: [],
      relationsStrengthened: ['defense_route'],
      relationsWeakened: [],
      conflictsDetected: 0
    };

    parent.evolution.extractTelemetryFromExperience(
      exp as any,
      devResult,
      { resourceScore: 0.9, operationalConfidence: 0.95 },
      parent
    );

    // Evaluate eligibility warrant
    const warrant = parent.evaluateReproductionEligibility({
      currentPopulation: 3,
      memoryPressure: 0.85,
      minFitnessThreshold: 0.4
    });

    expect(() => ReproductionWarrantSchema.parse(warrant)).not.toThrow();
    expect(warrant.isEligible).toBe(true);
    expect(warrant.parentCellId).toBe(parent.nodeId);
    expect(warrant.parentGenomeId).toBe(parent.genome.genomeId);
    expect(warrant.lineageId).toBe(parent.genome.lineageId);
    expect(warrant.generation).toBe(0);
    expect(warrant.reason).toBe(ReproductionTriggerReason.REPRODUCTION_ELIGIBLE_FITNESS_AND_PRESSURE_MET);
    expect(warrant.evidence.overallFitness).toBeGreaterThan(0.4);
    expect(warrant.policyDecision.allowed).toBe(true);
    expect(warrant.policyDecision.conditions.populationWithinCeiling).toBe(true);

    // Trigger causal reproduction
    const causalResult = await parent.triggerCausalReproduction({
      currentPopulation: 3,
      memoryPressure: 0.85,
      minFitnessThreshold: 0.4,
      storageBasePath: tmpDir
    });

    expect(causalResult.eligible).toBe(true);
    expect(causalResult.warrant.isEligible).toBe(true);
    expect(causalResult.result).toBeDefined();
    expect(causalResult.result.success).toBe(true);
    expect(causalResult.child).toBeDefined();

    const child = causalResult.child!;
    // Child has distinct identity
    expect(child.nodeId).not.toBe(parent.nodeId);
    expect(child.publicKey).not.toBe(parent.publicKey);

    // Lineage is strictly maintained
    expect(child.genome.lineageId).toBe(parent.genome.lineageId);
    expect(child.genome.generation).toBe(parent.genome.generation + 1);
    expect(child.genome.parentCellId).toBe(parent.nodeId);
    expect(child.genome.ancestorCellIds).toContain(parent.nodeId);

    // Warrant is recorded in procedural memory
    const storedWarrant = await parent.memory.get(`reproduction_warrant_${warrant.warrantId}`);
    expect(storedWarrant).toBeDefined();

    await child.stop();
    await parent.stop();
  });

  it('2. Evaluates and rejects ineligible parent (inactive state, low fitness, low memory pressure, unauthorized)', async () => {
    const storagePath = path.join(tmpDir, 'parent_cell_2.json');
    const parent = new Cell(
      storagePath,
      'test-api-key',
      undefined,
      undefined,
      undefined,
      {
        storageSecret: 'p09_storage_verification_secret_32bytes!!',
        reproductionPolicy: {
          requireAuthorization: true,
          trustedIssuers: [{ issuer: 'redqueen_genesis_authority', publicKey: creatorKeys.publicKey }],
          populationCeiling: 10,
          cooldownMs: 60000,
          minMemoryPressure: 0.7
        }
      }
    );

    // Case 2a: Inactive cell (before start)
    const warrantInactive = parent.evaluateReproductionEligibility();
    expect(warrantInactive.isEligible).toBe(false);
    expect(warrantInactive.reason).toBe(ReproductionTriggerReason.PARENT_INACTIVE);

    await parent.start();

    // Case 2b: Missing authorization proof when required
    const warrantNoAuth = parent.evaluateReproductionEligibility({
      currentPopulation: 1,
      memoryPressure: 0.8
    });
    expect(warrantNoAuth.isEligible).toBe(false);
    expect(warrantNoAuth.reason).toBe(ReproductionTriggerReason.UNAUTHORIZED);

    // Case 2c: Insufficient memory pressure
    const authProof = createSignedProof(parent.nodeId, 'evt_test_mem');
    const warrantLowMem = parent.evaluateReproductionEligibility({
      currentPopulation: 1,
      memoryPressure: 0.2,
      authorizationProof: authProof
    });
    expect(warrantLowMem.isEligible).toBe(false);
    expect(warrantLowMem.reason).toBe(ReproductionTriggerReason.MEMORY_PRESSURE_REPRODUCTION_THRESHOLD);

    // Case 2d: Insufficient fitness threshold
    const warrantLowFit = parent.evaluateReproductionEligibility({
      currentPopulation: 1,
      memoryPressure: 0.9,
      minFitnessThreshold: 0.99, // Unreachable
      authorizationProof: authProof
    });
    expect(warrantLowFit.isEligible).toBe(false);
    expect(warrantLowFit.reason).toBe(ReproductionTriggerReason.INSUFFICIENT_FITNESS);

    // Triggering causal reproduction on ineligible parent returns eligible: false and null result
    const rejectedCausal = await parent.triggerCausalReproduction({
      currentPopulation: 1,
      memoryPressure: 0.2, // Low memory pressure
      authorizationProof: authProof
    });
    expect(rejectedCausal.eligible).toBe(false);
    expect(rejectedCausal.result).toBeNull();
    expect(rejectedCausal.child).toBeNull();

    await parent.stop();
  });

  it('3. Enforces reproduction cooldown to prevent repeated/burst reproduction', async () => {
    const storagePath = path.join(tmpDir, 'parent_cell_3.json');
    const parent = new Cell(
      storagePath,
      'test-api-key',
      undefined,
      undefined,
      undefined,
      {
        storageSecret: 'p09_storage_verification_secret_32bytes!!',
        reproductionPolicy: {
          requireAuthorization: false,
          populationCeiling: 10,
          cooldownMs: 60000, // 60 seconds cooldown
          minMemoryPressure: 0.5
        }
      }
    );

    await parent.start();

    // First reproduction succeeds
    const firstRepro = await parent.triggerCausalReproduction({
      currentPopulation: 1,
      memoryPressure: 0.8,
      storageBasePath: tmpDir
    });

    expect(firstRepro.eligible).toBe(true);
    expect(firstRepro.result.success).toBe(true);
    if (firstRepro.child) await firstRepro.child.stop();

    // Immediate second reproduction attempt must be blocked by cooldown
    const secondReproWarrant = parent.evaluateReproductionEligibility({
      currentPopulation: 2,
      memoryPressure: 0.8
    });

    expect(secondReproWarrant.isEligible).toBe(false);
    expect(secondReproWarrant.reason).toBe(ReproductionTriggerReason.REPRODUCTION_COOLDOWN_ACTIVE);
    expect(secondReproWarrant.policyDecision.conditions.cooldownPassed).toBe(false);
    expect(secondReproWarrant.policyDecision.conditions.cooldownRemainingMs).toBeGreaterThan(0);

    const secondReproOutcome = await parent.triggerCausalReproduction({
      currentPopulation: 2,
      memoryPressure: 0.8,
      storageBasePath: tmpDir
    });

    expect(secondReproOutcome.eligible).toBe(false);
    expect(secondReproOutcome.result).toBeNull();

    await parent.stop();
  });

  it('4. Enforces population ceiling bounds to prevent infinite growth', async () => {
    const storagePath = path.join(tmpDir, 'parent_cell_4.json');
    const parent = new Cell(
      storagePath,
      'test-api-key',
      undefined,
      undefined,
      undefined,
      {
        storageSecret: 'p09_storage_verification_secret_32bytes!!',
        reproductionPolicy: {
          requireAuthorization: false,
          populationCeiling: 5,
          cooldownMs: 1000,
          minMemoryPressure: 0.5
        }
      }
    );

    await parent.start();

    // Population at ceiling (5 >= 5)
    const warrantAtCeiling = parent.evaluateReproductionEligibility({
      currentPopulation: 5,
      memoryPressure: 0.8
    });

    expect(warrantAtCeiling.isEligible).toBe(false);
    expect(warrantAtCeiling.reason).toBe(ReproductionTriggerReason.POPULATION_CEILING_REACHED);
    expect(warrantAtCeiling.policyDecision.conditions.populationWithinCeiling).toBe(false);

    // Population exceeding ceiling (6 > 5)
    const warrantExceeding = parent.evaluateReproductionEligibility({
      currentPopulation: 6,
      memoryPressure: 0.8
    });

    expect(warrantExceeding.isEligible).toBe(false);
    expect(warrantExceeding.reason).toBe(ReproductionTriggerReason.POPULATION_CEILING_REACHED);

    const outcomeAtCeiling = await parent.triggerCausalReproduction({
      currentPopulation: 5,
      memoryPressure: 0.8,
      storageBasePath: tmpDir
    });

    expect(outcomeAtCeiling.eligible).toBe(false);
    expect(outcomeAtCeiling.result).toBeNull();

    await parent.stop();
  });

  it('5. Verifies deterministic bounded mutation during differentiation and lineage continuity', async () => {
    const storagePath = path.join(tmpDir, 'parent_cell_5.json');
    const parent = new Cell(
      storagePath,
      'test-api-key',
      undefined,
      undefined,
      undefined,
      {
        storageSecret: 'p09_storage_verification_secret_32bytes!!',
        capabilities: ['COGNITIVE_REASONING', 'SWARM_COORDINATION'],
        specialization: 'cyber_intelligence',
        customTraits: {
          mutationRate: 0.1,
          riskTolerance: 0.5,
          explorationVsExploitation: 0.5,
          maxCognitiveCycleDepth: 5
        },
        reproductionPolicy: {
          requireAuthorization: false,
          populationCeiling: 10,
          cooldownMs: 1000,
          minMemoryPressure: 0.5,
          allowDifferentiation: true
        }
      }
    );

    await parent.start();

    const result = await parent.triggerCausalReproduction({
      currentPopulation: 2,
      memoryPressure: 0.8,
      specializationBias: 'knowledge_synthesis',
      storageBasePath: tmpDir
    });

    expect(result.eligible).toBe(true);
    expect(result.result.success).toBe(true);
    const child = result.child!;

    // Specialization differentiated
    expect(child.genome.specialization).toBe('knowledge_synthesis');
    expect(child.genome.generation).toBe(1);
    expect(child.genome.lineageId).toBe(parent.genome.lineageId);

    // Mutation is bounded: traits remain within [0.0, 1.0] and within valid schemas
    expect(child.genome.traits.mutationRate).toBeGreaterThanOrEqual(0.0);
    expect(child.genome.traits.mutationRate).toBeLessThanOrEqual(1.0);
    expect(child.genome.traits.riskTolerance).toBeGreaterThanOrEqual(0.0);
    expect(child.genome.traits.riskTolerance).toBeLessThanOrEqual(1.0);

    // Capabilities remain authorized
    expect(child.genome.capabilities).toContain('COGNITIVE_REASONING');

    await child.stop();
    await parent.stop();
  });
});
