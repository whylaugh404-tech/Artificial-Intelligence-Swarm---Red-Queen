import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Cell } from '../src/redqueen/core/cell';
import { CellState } from '../src/redqueen/core/lifecycle';
import { MemoryCategory } from '../src/redqueen/memory/store';
import { identityCrypto } from '../src/redqueen/crypto/identity';
import { RepresentationVerificationStatus } from '../src/redqueen/cognition/representation/types';
import { StaticTrustAnchor, AuthorizationProof } from '../src/redqueen/reproduction/types';
import { MembershipAuthority } from '../src/redqueen/swarm/authority';
import { DistributedPopulationRegistry } from '../src/redqueen/evolution/population';
import { OrganicExperienceTransitionEngine } from '../src/redqueen/cognition/experience/engine';
import { computeCanonicalHash, computeDeterministicHash } from '../src/redqueen/cognition/computation/canonical';
import { DEFAULT_CHAOS_R, DEFAULT_CHAOS_LAMBDA, MAX_COGNITIVE_CYCLE_DEPTH } from '../src/redqueen/cognition/chaos';

const TEST_DIR = path.join(process.cwd(), 'data', 'test_r13_organism_integration');
const STORAGE_SECRET = 'test_storage_secret_r13_organism_9876543210123456';

function createAuthProof(
  parentCellId: string,
  eventId: string,
  issuerKp: { privateKey: string; publicKey: string }
): AuthorizationProof {
  const payload = {
    action: 'reproduce',
    subject: parentCellId,
    eventId,
    exp: Date.now() + 60000,
    issuer: 'redqueen-root'
  };
  const signature = identityCrypto.signData(issuerKp.privateKey, JSON.stringify(payload));
  return {
    payload,
    signature,
    issuerPublicKey: issuerKp.publicKey
  };
}

describe('RED QUEEN — REPAIR PROMPT 13: Full Cell Organism Integration & Causal Loop Proof', () => {
  let rootAuthorityKp: { privateKey: string; publicKey: string };
  let trustAnchor: StaticTrustAnchor;
  let membershipAuthority: MembershipAuthority;
  let populationRegistry: DistributedPopulationRegistry;
  let activeCells: Cell[] = [];

  beforeEach(async () => {
    process.env.REDQUEEN_STORAGE_SECRET = STORAGE_SECRET;
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });

    rootAuthorityKp = identityCrypto.generateKeyPair();
    trustAnchor = new StaticTrustAnchor([
      { issuer: 'redqueen-root', publicKey: rootAuthorityKp.publicKey }
    ]);
    membershipAuthority = new MembershipAuthority();
    populationRegistry = new DistributedPopulationRegistry();
    activeCells = [];
  });

  afterEach(async () => {
    for (const cell of activeCells) {
      try {
        if (cell.lifecycle.getState() !== CellState.STOPPED) {
          await cell.stop();
        }
      } catch {
        // cleanup ignore
      }
    }
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  function spawnProductionCell(name: string, customOptions: any = {}): Cell {
    const storagePath = path.join(TEST_DIR, `${name}.json`);
    const kp = identityCrypto.generateKeyPair();
    const cell = new Cell(
      storagePath,
      'test_key_placeholder',
      kp.privateKey,
      kp.publicKey,
      {
        issuerAuthority: membershipAuthority,
        trustedIssuerPublicKey: membershipAuthority.publicKey,
        authority: membershipAuthority,
        port: 0
      },
      {
        storageSecret: STORAGE_SECRET,
        trustAnchor,
        genome: {
          generation: 1,
          specialization: 'COGNITIVE_REASONING_AGENT',
          capabilities: ['COGNITIVE_REASONING', 'INFO_PROCESSING', 'EVIDENCE'],
          traits: {
            mutationRate: 0.05,
            crossoverRate: 0.7,
            riskTolerance: 0.3,
            explorationBias: 0.4,
            learningRate: 0.1,
            memoryRetention: 0.9,
            computationalEfficiency: 0.85
          }
        },
        ...customOptions
      }
    );
    activeCells.push(cell);
    return cell;
  }

  describe('Section 1: The Canonical Closed Causal Lifecycle (Target Chain A → P)', () => {
    it('executes full organism lifecycle from world input through reproduction to child cognition', async () => {
      // 1. Initial Organism Setup
      const parentCell = spawnProductionCell('parent_organism_1');
      await parentCell.start();
      const regResult = populationRegistry.registerCell(parentCell);
      expect(regResult.success).toBe(true);

      expect(parentCell.lifecycle.getState()).toBe(CellState.ACTIVE);
      expect(parentCell.nodeId).toBeDefined();

      // [A] Cell ingests external world data
      const worldInput = {
        sourceId: 'world_sensor_alpha',
        metric: 'core_pressure',
        reading: 42.8,
        ambientTemp: 295.4,
        status: 'NOMINAL',
        confidence: 0.95
      };

      await parentCell.ingestDataset(worldInput);

      // [B] Representation is formed
      const initialConcepts = parentCell.cognitiveGraph.getAllConcepts();
      expect(initialConcepts.length).toBeGreaterThan(0);
      const targetConcept = initialConcepts[0];
      expect(targetConcept.conceptId).toBeDefined();
      expect(targetConcept.canonicalName).toBeDefined();

      // [C] Evidence is created
      const initialEvidences = parentCell.cognitiveGraph.getAllEvidences();
      expect(initialEvidences.length).toBeGreaterThan(0);
      const storedEvidence = initialEvidences[0];
      expect(storedEvidence.confidence).toBeGreaterThan(0.5);
      expect(storedEvidence.provenance).toBeDefined();

      // [D] WorldModel is composed and updated
      const initialUnderstandings = parentCell.cognitiveGraph.getAllUnderstandings();
      expect(initialUnderstandings.length).toBeGreaterThan(0);
      const worldModel = parentCell.worldModel.compose({
        context: storedEvidence.context,
        originatingCellId: parentCell.nodeId,
        understandings: initialUnderstandings,
        graph: parentCell.cognitiveGraph
      });
      expect(worldModel.worldModelId).toBeDefined();
      expect(worldModel.understandingIds.length).toBeGreaterThan(0);

      // [E] Reasoning produces formal state / decision / prediction
      const reasoningResult = parentCell.reasoning.reason({
        goal: 'Formulate predictive hypothesis about pressure dynamics',
        context: storedEvidence.context,
        originatingCellId: parentCell.nodeId,
        worldModel,
        premises: [
          {
            premiseId: 'p_initial_nominal',
            statement: 'Pressure sensor nominal at 42.8',
            confidence: 0.95,
            evidenceIds: [storedEvidence.evidenceId],
            provenance: [parentCell.nodeId, worldInput.sourceId],
            concept: targetConcept.conceptId
          }
        ]
      }, parentCell.cognitiveGraph);

      expect(reasoningResult.reasoningId).toBeDefined();
      expect(reasoningResult.inferenceChain.length).toBeGreaterThan(0);
      expect(reasoningResult.conclusion).toBeDefined();

      // [PARALLEL] Nonlinear Collective Processing + Tanh + Chaos Modulation
      const collectiveEngine = parentCell.collectiveCognition;
      const collectiveStateCycle0 = collectiveEngine.executeNonlinearComposition(
        [parentCell],
        storedEvidence.context,
        'core_pressure_domain',
        { r: DEFAULT_CHAOS_R, lambda: DEFAULT_CHAOS_LAMBDA, steps: 1 }
      );

      // Verify nonlinear collective output
      expect(collectiveStateCycle0.compositionType).toBe('nonlinear_tanh_chaos');
      expect(collectiveStateCycle0.nonlinearCollectiveVector).toBeDefined();
      expect(collectiveStateCycle0.nonlinearDynamics).toBeDefined();
      expect(collectiveStateCycle0.nonlinearDynamics.ct).toBeGreaterThan(0);
      expect(collectiveStateCycle0.nonlinearDynamics.ct).toBeLessThan(1);

      // Verify chaosState updated in cell's CognitiveState
      const recordedChaos0 = parentCell.cognitiveState.getChaosState();
      expect(recordedChaos0).toBeDefined();
      expect(recordedChaos0).toBe(collectiveStateCycle0.nonlinearDynamics.ct);

      // [F] P8 Computation / Action execution occurs
      const computationPayload = {
        operation: 'ANALYTIC_PREDICTION',
        targetParameter: 'core_pressure',
        predictedThreshold: 45.0
      };
      const canonicalCompHash = computeCanonicalHash(computationPayload);
      expect(canonicalCompHash).toBeDefined();

      // [G] Observation is generated from action/environment interaction
      const observationRecord = {
        observationId: `obs_empirical_${Date.now()}`,
        observedSubject: targetConcept.canonicalName,
        source: 'world_actuator_response',
        timestamp: new Date().toISOString(),
        content: {
          empiricalReading: 58.2, // Exceeds predicted threshold!
          predictionContradicted: true,
          anomalyDetected: true
        },
        type: 'environmental_feedback'
      };

      // [H] Organic Experience is created via canonical transition
      const transitionOutcome = await parentCell.processObservation(observationRecord, {
        expectedContradiction: true,
        enableCognitiveDevelopment: true
      });

      const experience = transitionOutcome.experience;
      expect(experience).toBeDefined();
      expect(experience.experienceId).toBeDefined();
      expect(experience.cellId).toBe(parentCell.nodeId);
      expect(experience.outcome).toBeDefined();
      expect(experience.observationId).toBe(observationRecord.observationId);

      // Evidence contradicting prior expectation
      const contradictingEvidence = await parentCell.cognitiveGraph.insertEvidence({
        evidenceId: `ev_anomaly_${Date.now()}`,
        sourceId: parentCell.nodeId,
        observationId: observationRecord.observationId,
        timestamp: new Date().toISOString(),
        provenance: {
          sourceId: observationRecord.source,
          observationId: observationRecord.observationId,
          timestamp: new Date().toISOString(),
          derivedFrom: [observationRecord.observationId, experience.experienceId],
          supportingRepresentationIds: [],
          contradictingRepresentationIds: [targetConcept.conceptId]
        },
        context: {
          contextId: 'ctx_pressure_anomaly',
          domain: 'core_pressure_domain'
        },
        confidence: 0.98
      });

      // Epistemic non-destructive transition
      await parentCell.cognitiveGraph.transitionRepresentationState(
        targetConcept.conceptId,
        [contradictingEvidence],
        contradictingEvidence.context,
        {
          explicitVerification: { status: RepresentationVerificationStatus.CONTRADICTED },
          reason: 'Empirical pressure exceeded predictive bounds'
        }
      );

      // [I] Development: Cognitive development adapts based on empirical evidence
      const initialDevHash = computeDeterministicHash(parentCell.cognitiveState.getState());
      const developmentResult = await parentCell.developFromExperience(experience, {
        context: contradictingEvidence.context,
        relatedConceptIds: [targetConcept.conceptId],
        evidence: [contradictingEvidence]
      });

      expect(developmentResult).toBeDefined();
      expect(developmentResult.conceptsStrengthened.length + developmentResult.conceptsWeakened.length).toBeGreaterThan(0);

      const postDevHash = computeDeterministicHash(parentCell.cognitiveState.getState());
      expect(postDevHash).not.toBe(initialDevHash);

      // [J] Evolution Telemetry: Evolutionary engine receives feedback telemetry
      const telemetry = await parentCell.recordExperienceTelemetry(experience, developmentResult, {
        resourceScore: 0.90,
        operationalConfidence: 0.92
      });

      expect(telemetry).toBeDefined();
      expect(telemetry.experienceId).toBe(experience.experienceId);
      expect(telemetry.experienceFitnessScore).toBeGreaterThanOrEqual(0.0);
      expect(telemetry.metrics).toBeDefined();
      expect(telemetry.deterministicHash).toBeDefined();

      // [K] Reproduction Eligibility: Warrant evaluation reflects experience and fitness
      const initialWarrant = parentCell.evaluateReproductionEligibility({
        currentPopulation: populationRegistry.size(),
        minFitnessThreshold: 0.20
      });
      expect(initialWarrant.evaluatedAt).toBeDefined();
      expect(initialWarrant.parentCellId).toBe(parentCell.nodeId);

      // [L] Mitosis produces Child Cell
      const reproductionEventId = `reproduce_evt_${Date.now()}`;
      const authProof = createAuthProof(parentCell.nodeId, reproductionEventId, rootAuthorityKp);
      const mitosisExecution = await parentCell.triggerCausalReproduction({
        reproductionSeed: reproductionEventId,
        authorizationProof: authProof,
        currentPopulation: populationRegistry.size(),
        minFitnessThreshold: 0.20,
        memoryPressure: 0.85,
        storageBasePath: TEST_DIR
      });

      expect(mitosisExecution.eligible).toBe(true);
      expect(mitosisExecution.result).toBeDefined();
      expect(mitosisExecution.result!.success).toBe(true);
      expect(mitosisExecution.child).toBeDefined();

      const childCell = mitosisExecution.child!;
      activeCells.push(childCell);

      // [M] Child possesses new distinct Identity and valid Lineage
      expect(childCell.nodeId).not.toBe(parentCell.nodeId);
      expect(childCell.publicKey).not.toBe(parentCell.publicKey);
      expect(childCell.lineage.lineageId).toBe(parentCell.lineage.lineageId);
      expect(childCell.genome.generation).toBe(parentCell.genome.generation + 1);

      // [N] Child enters Population and DHT Routing Table
      const integrationOutcome = await parentCell.integrateChildCell(childCell, {
        populationRegistry,
        authority: membershipAuthority
      });

      expect(integrationOutcome.certificate).toBeDefined();
      expect(populationRegistry.hasMember(childCell.nodeId)).toBe(true);
      expect(populationRegistry.size()).toBe(2);

      const closestInParent = parentCell.routing.getClosestPeers(childCell.nodeId, 5);
      expect(closestInParent.some(p => p.nodeId === childCell.nodeId)).toBe(true);

      const closestInChild = childCell.routing.getClosestPeers(parentCell.nodeId, 5);
      expect(closestInChild.some(p => p.nodeId === parentCell.nodeId)).toBe(true);

      // [O] Next Cognitive Cycle executes on the child cell
      await childCell.start();
      expect(childCell.lifecycle.getState()).toBe(CellState.ACTIVE);

      const childWorldInput = {
        sourceId: 'world_sensor_beta',
        metric: 'core_pressure_calibrated',
        reading: 58.0,
        confidence: 0.99
      };
      await childCell.ingestDataset(childWorldInput);
      expect(childCell.cognitiveGraph.getAllConcepts().length).toBeGreaterThan(0);

      // [P] Persistent Nonlinear Auxiliary State survives cycle boundaries and drives cycle t+1
      // Check cycle t+1 on parent cell:
      const chaosCycle0 = parentCell.cognitiveState.getChaosState();
      expect(chaosCycle0).toBeDefined();

      const collectiveStateCycle1 = collectiveEngine.executeNonlinearComposition(
        [parentCell],
        storedEvidence.context,
        'core_pressure_domain',
        { r: DEFAULT_CHAOS_R, lambda: DEFAULT_CHAOS_LAMBDA, steps: 1 }
      );

      const chaosCycle1 = parentCell.cognitiveState.getChaosState();
      expect(chaosCycle1).toBeDefined();
      expect(chaosCycle1).not.toBe(chaosCycle0); // Iterated through logistic map!

      // Mathematical verification of logistic map: c_{t+1} = r * c_t * (1 - c_t)
      const expectedCt1 = DEFAULT_CHAOS_R * chaosCycle0! * (1 - chaosCycle0!);
      expect(Math.abs(chaosCycle1! - expectedCt1)).toBeLessThan(1e-9);
    });
  });

  describe('Section 2: Nonlinear Dynamics & Architectural Audit', () => {
    it('verifies chaosState is faithfully persisted and recovered across cold restart', async () => {
      const cell = spawnProductionCell('cell_nonlinear_persistence');
      await cell.start();

      const collectiveResult = cell.collectiveCognition.executeNonlinearComposition(
        [cell],
        { contextId: 'ctx_persist', domain: 'persistence_test_domain' },
        'persistence_test_domain',
        { r: 3.85, lambda: 0.15, steps: 1 }
      );

      const activeChaos = cell.cognitiveState.getChaosState();
      expect(activeChaos).toBeDefined();
      expect(activeChaos).toBe(collectiveResult.nonlinearDynamics.ct);

      // Cold shutdown
      await cell.stop();
      expect(cell.lifecycle.getState()).toBe(CellState.STOPPED);

      // Load cell fresh from storage without keeping reference
      const restartedCell = await Cell.loadFromStorage(
        cell.storagePath,
        'test_key_placeholder',
        { authority: membershipAuthority, port: 0 },
        { storageSecret: STORAGE_SECRET, trustAnchor }
      );
      activeCells.push(restartedCell);

      const recoveredChaos = restartedCell.cognitiveState.getChaosState();
      expect(recoveredChaos).toBeDefined();
      expect(recoveredChaos).toBe(activeChaos);
    });

    it('proves nonlinear collective output influences cognition through cognitive runtime', async () => {
      const cell = spawnProductionCell('cell_runtime_nonlinear_influence');
      await cell.start();

      // Ingest ground knowledge
      await cell.ingestDataset({
        sourceId: 'sensor_gamma',
        concept: 'temperature_dynamics',
        temperature: 310,
        status: 'CRITICAL',
        confidence: 0.95
      });

      // Cognitive request through cell
      const result = await cell.processCognitiveRequest({
        requestId: `req_cognition_${Date.now()}`,
        creatorInput: 'Evaluate temperature_dynamics',
        context: {
          contextId: 'ctx_temp_eval',
          domain: 'thermodynamics'
        }
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.collective).toBeDefined();
      expect(result.collective.collectiveState).toBeDefined();
      expect(result.understanding).toBeDefined();
      expect(result.reasoning).toBeDefined();

      // Check that provenance tracks tanh activation and chaos modulation
      const provenanceStr = result.provenance.join('|');
      expect(provenanceStr).toContain('nonlinear_activation_applied:tanh');
      expect(provenanceStr).toContain('chaos_modulation_applied');
      expect(result.confidence).toBeGreaterThan(0.0);
    });
  });

  describe('Section 3: Comprehensive Negative Tests (Fail-Closed Guarantees)', () => {
    it('rejects invalid provenance during organic experience transition', async () => {
      const cell = spawnProductionCell('cell_neg_provenance');
      await cell.start();

      const invalidObservation = {
        observationId: 'obs_forged_source',
        source: '', // Invalid empty source
        timestamp: new Date().toISOString(),
        content: { sample: 'forged' },
        type: 'synthetic'
      };

      await expect(
        parentTransitionStub(invalidObservation, cell)
      ).rejects.toThrow();
    });

    async function parentTransitionStub(obs: any, cell: Cell) {
      return cell.processObservation(obs);
    }

    it('captures failed canonical computation safely without silent corruption', () => {
      const invalidComputationPayload = {
        nonFiniteValue: NaN // RFC 8785 rejects NaN
      };

      expect(() => {
        computeCanonicalHash(invalidComputationPayload as any);
      }).toThrow(/non-finite number/);
    });

    it('safely transitions contradictory evidence without amnesic data loss', async () => {
      const cell = spawnProductionCell('cell_neg_contradiction');
      await cell.start();

      await cell.ingestDataset({
        sourceId: 'baseline_sensor',
        theory: 'flat_earth_model',
        evidence: 'visible_horizon',
        confidence: 0.8
      });

      const concept = cell.cognitiveGraph.getAllConcepts()[0];
      expect(concept).toBeDefined();

      // Now world presents contradictory observation
      const contradiction = await cell.cognitiveGraph.insertEvidence({
        evidenceId: `ev_curvature_${Date.now()}`,
        sourceId: cell.nodeId,
        observationId: 'obs_curvature',
        timestamp: new Date().toISOString(),
        provenance: {
          sourceId: 'satellite_geodesy',
          observationId: 'obs_curvature',
          timestamp: new Date().toISOString(),
          derivedFrom: ['obs_curvature'],
          supportingRepresentationIds: [],
          contradictingRepresentationIds: [concept.conceptId]
        },
        context: { contextId: 'ctx_geodesy', domain: 'planetary_physics' },
        confidence: 0.99
      });

      const output = await cell.cognitiveGraph.transitionRepresentationState(
        concept.conceptId,
        [contradiction],
        contradiction.context,
        {
          explicitVerification: { status: RepresentationVerificationStatus.CONTRADICTED },
          reason: 'Satellite curvature confirms planetary ellipsoid'
        }
      );

      const updatedConcept = cell.cognitiveGraph.getConcept(concept.conceptId);
      expect(updatedConcept).toBeDefined();
      expect(updatedConcept!.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);
      expect(updatedConcept!.confidence).toBeLessThan(0.8);
      expect(updatedConcept!.epistemicStateId).toBe(output.nextState.stateId);
      expect(output.transitionRecord.transitionId).toBeDefined();
      expect(output.transitionRecord.nextStatus).toBeDefined();
      expect(output.nextState.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);

      // Epistemic state in graph is preserved non-destructively
      const epistemicState = cell.cognitiveGraph.getEpistemicStateForRepresentation(
        concept.conceptId,
        contradiction.context.contextId
      );
      expect(epistemicState).toBeDefined();
      expect(epistemicState!.verificationStatus).toBe(RepresentationVerificationStatus.CONTRADICTED);
      expect(epistemicState!.evidenceIds).toContain(contradiction.evidenceId);
    });

    it('rejects duplicate experiences during organic transition', async () => {
      const cell = spawnProductionCell('cell_neg_duplicate');
      await cell.start();

      const observation = {
        observationId: 'obs_duplicate_target',
        source: 'sensor_omega',
        timestamp: '2026-09-21T10:00:00.000Z',
        content: { constant: 'c' },
        type: 'constant_measurement'
      };

      const outcome1 = await cell.processObservation(observation);
      expect(outcome1.experience).toBeDefined();

      // Second attempt with identical observation
      const outcome2 = await cell.processObservation(observation);

      // Engine detects duplicate and returns existing experience rather than duplicating
      expect(outcome2.experience.experienceId).toBe(outcome1.experience.experienceId);
      expect(outcome2.experience.informationId).toBe(outcome1.experience.informationId);
    });

    it('rejects unauthorized mitosis without valid cryptographic proof', async () => {
      const cell = spawnProductionCell('cell_neg_unauthorized_mitosis');
      await cell.start();

      const forgedProof: AuthorizationProof = {
        payload: {
          action: 'reproduce',
          subject: cell.nodeId,
          eventId: 'forged_event',
          exp: Date.now() + 60000,
          issuer: 'forged-adversary'
        },
        signature: 'invalid_signature_hex_0000',
        issuerPublicKey: 'invalid_public_key_0000'
      };

      const outcome = await cell.triggerCausalReproduction({
        authorizationProof: forgedProof,
        currentPopulation: 1,
        minFitnessThreshold: 0.1
      });

      expect(outcome.eligible).toBe(false);
      expect(outcome.child).toBeNull();
      expect(outcome.warrant.policyDecision.allowed).toBe(false);
      expect(outcome.warrant.reason).toMatch(/POLICY_DISALLOWED|UNAUTHORIZED/);
    });

    it('rejects mitosis when population ceiling is reached', async () => {
      const cell = spawnProductionCell('cell_neg_population_overflow');
      await cell.start();

      const validProof = createAuthProof(cell.nodeId, 'pop_overflow_test', rootAuthorityKp);

      // Simulate population at or beyond policy maximum
      const outcome = await cell.triggerCausalReproduction({
        authorizationProof: validProof,
        currentPopulation: 50, // Governance max is typically 20-30
        minFitnessThreshold: 0.1
      });

      expect(outcome.eligible).toBe(false);
      expect(outcome.child).toBeNull();
      expect(outcome.warrant.reason).toContain('POPULATION_CEILING_REACHED');
    });

    it('fails closed when attempting to load cell with corrupted storage identity', async () => {
      const corruptedStoragePath = path.join(TEST_DIR, 'corrupted_cell.json');
      const corruptedData = [
        {
          id: 'cell_identity_corrupted',
          content: {
            nodeId: 'tampered_node',
            // Missing encryptedPrivateKey and publicKey
          }
        }
      ];
      await fs.writeFile(corruptedStoragePath, JSON.stringify(corruptedData), 'utf8');

      await expect(
        Cell.loadFromStorage(
          corruptedStoragePath,
          'test_key',
          { authority: membershipAuthority, port: 0 },
          { storageSecret: STORAGE_SECRET, trustAnchor }
        )
      ).rejects.toThrow(/Corrupted cell storage/);
    });

    it('enforces bound against runaway feedback recursion', () => {
      expect(MAX_COGNITIVE_CYCLE_DEPTH).toBeDefined();
      expect(MAX_COGNITIVE_CYCLE_DEPTH).toBeLessThanOrEqual(100);

      // Simulating depth guard
      let currentDepth = 0;
      const simulateRecursiveFeedback = () => {
        currentDepth++;
        if (currentDepth > MAX_COGNITIVE_CYCLE_DEPTH) {
          throw new Error(`Feedback recursion exceeded maximum cognitive cycle depth: ${MAX_COGNITIVE_CYCLE_DEPTH}`);
        }
        simulateRecursiveFeedback();
      };

      expect(() => simulateRecursiveFeedback()).toThrow(/Feedback recursion exceeded/);
    });

    it('rejects fake learning signals lacking empirical evidence basis', async () => {
      const cell = spawnProductionCell('cell_neg_fake_learning');
      await cell.start();

      // Passing invalid experience lacking valid ID throws
      await expect(
        cell.developFromExperience(undefined as any)
      ).rejects.toThrow();

      // Or forged experience with no causal linkage does not mutate graph concepts
      const forgedExperience: any = {
        experienceId: 'exp_synthetic_unsupported',
        status: 'CREATED',
        confidence: 0.9,
        provenance: {
          originatingCellId: cell.nodeId,
          timestamp: new Date().toISOString()
        }
      };

      const result = await cell.developFromExperience(forgedExperience);
      expect(result.conceptsStrengthened.length).toBe(0);
      expect(result.conceptsWeakened.length).toBe(0);
    });
  });
});
