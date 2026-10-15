/**
 * Red Queen Macro-Neural Inter-Cell Synaptic Network
 * 
 * Bridges autonomous P2P cells into a collective macro-neural network.
 * Each Cell operates as a macro-neuron with state trajectories (SSM hidden state & HDC activations).
 * Inter-cell synapses carry directed, plastic, conductile connections between cells in the swarm.
 * 
 * Biological & Mathematical Foundations:
 * 1. Spike-Timing-Dependent Plasticity (STDP):
 *    Delta_t = t_post - t_pre.
 *    If Delta_t > 0 (Causal): Long-Term Potentiation (LTP) -> Delta_w = A_+ * exp(-Delta_t / tau_+)
 *    If Delta_t < 0 (Acausal): Long-Term Depression (LTD) -> Delta_w = -A_- * exp(-|Delta_t| / tau_-)
 * 
 * 2. Oja's Anti-Runaway Hebbian Normalization:
 *    Delta_w = eta * (rho - w * rho^2)
 *    Prevents unbounded synaptic weight growth while reinforcing correlated multi-cell activations.
 * 
 * 3. Neuromodulatory Reinforcement (Dopaminergic Plasticity):
 *    Modulated by task success, epistemic proof-of-yield, and metabolic ATP outcomes.
 * 
 * 4. Thresholded Synaptic Signal Transmission:
 *    Transmitted signal s_j = w_ij * g_ij * a_i.
 *    If ||s_j||_2 >= theta_fire, post-synaptic action potential is triggered.
 */

import { logger } from '../core/logger';
import { systemIntegrity, SubsystemCategory } from '../core/system_integrity';

export interface InterCellSynapse {
  synapseId: string;
  sourceCellId: string;
  targetCellId: string;
  weight: number;                 // Bounded in [-1.0, 1.0]
  conductance: number;            // Gain multiplier in [0.1, 2.0]
  delayMs: number;                // Axonal/network latency
  lastPreSpikeTimestamp: number;
  lastPostSpikeTimestamp: number;
  potentiationCount: number;      // LTP events count
  depressionCount: number;        // LTD events count
  taskSuccessReinforcements: number;
  totalTransmissions: number;
  metadata?: Record<string, unknown>;
}

export interface STDPConfig {
  tauPlusMs: number;       // Time constant for LTP (default: 20ms)
  tauMinusMs: number;      // Time constant for LTD (default: 25ms)
  aPlus: number;           // Max LTP amplitude (default: 0.05)
  aMinus: number;          // Max LTD amplitude (default: 0.055)
  timeWindowMs: number;    // Max STDP window (default: 100ms)
}

export interface SynapticPulsePayload {
  sourceCellId: string;
  targetCellId: string;
  activationVector: number[];
  timestamp: number;
  pulseId: string;
  conductance: number;
}

export interface SynapticFeedbackPayload {
  pulseId: string;
  sourceCellId: string;
  targetCellId: string;
  deltaT: number;
  deltaWeight: number;
  newWeight: number;
  isPotentiated: boolean;
  timestamp: number;
}

export class InterCellSynapticNetwork {
  private readonly localCellId: string;
  private readonly synapses: Map<string, InterCellSynapse> = new Map();
  private readonly stdpConfig: STDPConfig;
  private readonly component = 'inter_cell_synapses';
  private fireThreshold: number = 0.20;

  constructor(localCellId: string, customSTDP?: Partial<STDPConfig>) {
    this.localCellId = localCellId;
    this.stdpConfig = {
      tauPlusMs: customSTDP?.tauPlusMs ?? 20,
      tauMinusMs: customSTDP?.tauMinusMs ?? 25,
      aPlus: customSTDP?.aPlus ?? 0.05,
      aMinus: customSTDP?.aMinus ?? 0.055,
      timeWindowMs: customSTDP?.timeWindowMs ?? 100
    };
  }

  /**
   * Generates canonical directed synapse ID: syn_{source}_to_{target}
   */
  public getSynapseId(targetCellId: string, sourceCellId: string = this.localCellId): string {
    return `syn_${sourceCellId}_to_${targetCellId}`;
  }

  /**
   * Registers or ensures an existing inter-cell synapse to a target peer cell
   */
  public registerSynapse(
    targetCellId: string,
    initialWeight: number = 0.5,
    conductance: number = 1.0,
    delayMs: number = 5
  ): InterCellSynapse {
    if (targetCellId === this.localCellId) {
      throw new Error('Self-synapse prohibited: a cell cannot form an external inter-cell synapse with itself');
    }

    const synId = this.getSynapseId(targetCellId);
    let syn = this.synapses.get(synId);
    if (!syn) {
      syn = {
        synapseId: synId,
        sourceCellId: this.localCellId,
        targetCellId,
        weight: Math.max(-1.0, Math.min(1.0, initialWeight)),
        conductance: Math.max(0.1, Math.min(2.0, conductance)),
        delayMs: Math.max(1, delayMs),
        lastPreSpikeTimestamp: 0,
        lastPostSpikeTimestamp: 0,
        potentiationCount: 0,
        depressionCount: 0,
        taskSuccessReinforcements: 0,
        totalTransmissions: 0
      };
      this.synapses.set(synId, syn);
      logger.info(this.component, 'synapse_registered', {
        synapseId: synId,
        targetCellId,
        initialWeight: syn.weight
      });
    }
    return syn;
  }

  /**
   * Retrieves a synapse to targetCellId
   */
  public getSynapse(targetCellId: string): InterCellSynapse | undefined {
    return this.synapses.get(this.getSynapseId(targetCellId));
  }

  /**
   * Returns all outgoing synapses from this cell
   */
  public getAllSynapses(): InterCellSynapse[] {
    return Array.from(this.synapses.values());
  }

  /**
   * 1. STDP LEARNING RULE:
   * Applies Spike-Timing-Dependent Plasticity given pre and post spike timestamps.
   * 
   * Delta_t = t_post - t_pre
   * If Delta_t in (0, timeWindow]: LTP (Long-Term Potentiation)
   * If Delta_t in [-timeWindow, 0): LTD (Long-Term Depression)
   */
  public applySTDP(targetCellId: string, tPre: number, tPost: number): { deltaWeight: number; newWeight: number } {
    const syn = this.registerSynapse(targetCellId);
    const deltaT = tPost - tPre;
    let deltaWeight = 0;

    if (deltaT > 0 && deltaT <= this.stdpConfig.timeWindowMs) {
      // Pre before Post (Causal connection) -> LTP
      deltaWeight = this.stdpConfig.aPlus * Math.exp(-deltaT / this.stdpConfig.tauPlusMs);
      syn.potentiationCount++;
    } else if (deltaT < 0 && Math.abs(deltaT) <= this.stdpConfig.timeWindowMs) {
      // Post before Pre (Acausal) -> LTD
      deltaWeight = -this.stdpConfig.aMinus * Math.exp(-Math.abs(deltaT) / this.stdpConfig.tauMinusMs);
      syn.depressionCount++;
    }

    syn.weight = Math.max(-1.0, Math.min(1.0, syn.weight + deltaWeight));
    syn.lastPreSpikeTimestamp = tPre;
    syn.lastPostSpikeTimestamp = tPost;

    logger.debug(this.component, 'stdp_plasticity_applied', {
      synapseId: syn.synapseId,
      deltaT,
      deltaWeight,
      newWeight: syn.weight
    });

    return { deltaWeight, newWeight: syn.weight };
  }

  /**
   * 2. ANTI-RUNAWAY HEBBIAN LEARNING (OJA'S RULE):
   * Modulates synaptic weight based on correlation between continuous pre and post activation vectors.
   * 
   * Delta_w = eta * (dot(a_pre, a_post) - w * ||a_post||^2)
   */
  public applyHebbianCoactivation(
    targetCellId: string,
    preVector: Float32Array | number[],
    postVector: Float32Array | number[],
    learningRate: number = 0.05
  ): { deltaWeight: number; newWeight: number } {
    const syn = this.registerSynapse(targetCellId);
    const pre = preVector instanceof Float32Array ? preVector : new Float32Array(preVector);
    const post = postVector instanceof Float32Array ? postVector : new Float32Array(postVector);

    const len = Math.min(pre.length, post.length);
    if (len === 0) return { deltaWeight: 0, newWeight: syn.weight };

    let dotProd = 0;
    let postNormSq = 0;
    let preNormSq = 0;

    for (let i = 0; i < len; i++) {
      dotProd += pre[i] * post[i];
      postNormSq += post[i] * post[i];
      preNormSq += pre[i] * pre[i];
    }

    // Normalized correlation
    const denom = Math.sqrt(preNormSq * postNormSq) + 1e-7;
    const normalizedCorr = dotProd / denom;

    // Oja's anti-runaway formulation
    const deltaWeight = learningRate * (normalizedCorr - syn.weight * normalizedCorr * normalizedCorr);

    syn.weight = Math.max(-1.0, Math.min(1.0, syn.weight + deltaWeight));
    if (deltaWeight >= 0) syn.potentiationCount++;
    else syn.depressionCount++;

    return { deltaWeight, newWeight: syn.weight };
  }

  /**
   * 3. NEUROMODULATORY REINFORCEMENT LEARNING:
   * Consolidates synapses that led to successful epistemic proofs / task execution,
   * or depresses synapses that caused contradiction / reasoning errors.
   */
  public applyTaskReinforcement(
    targetCellId: string,
    rewardOrPenalty: number,
    isSuccess: boolean
  ): { deltaWeight: number; newWeight: number; newConductance: number } {
    const syn = this.registerSynapse(targetCellId);
    const magnitude = Math.max(0, Math.min(1.0, Math.abs(rewardOrPenalty)));

    let deltaW: number;
    let deltaG: number;

    if (isSuccess) {
      // Long-term synaptic consolidation
      deltaW = 0.08 * magnitude;
      deltaG = 0.05 * magnitude;
      syn.taskSuccessReinforcements++;
    } else {
      // Synaptic depression on error
      deltaW = -0.10 * magnitude;
      deltaG = -0.08 * magnitude;
      syn.depressionCount++;
    }

    syn.weight = Math.max(-1.0, Math.min(1.0, syn.weight + deltaW));
    syn.conductance = Math.max(0.1, Math.min(2.0, syn.conductance + deltaG));

    logger.info(this.component, 'synaptic_reinforcement_applied', {
      synapseId: syn.synapseId,
      isSuccess,
      deltaW,
      newWeight: syn.weight,
      newConductance: syn.conductance
    });

    return { deltaWeight: deltaW, newWeight: syn.weight, newConductance: syn.conductance };
  }

  /**
   * 4. SYNAPTIC TRANSMISSION & ACTION POTENTIAL PROPAGATION:
   * Computes the transmitted signal vector across synapses: s_j = w_ij * conductance_ij * a_i
   * Checks firing threshold to determine if target cells should be excited.
   */
  public propagateActivationPulse(
    activationVector: Float32Array | number[]
  ): Array<{
    targetCellId: string;
    synapseId: string;
    weight: number;
    conductance: number;
    transmittedSignal: Float32Array;
    signalMagnitude: number;
    fired: boolean;
  }> {
    const act = activationVector instanceof Float32Array ? activationVector : new Float32Array(activationVector);
    const results: Array<{
      targetCellId: string;
      synapseId: string;
      weight: number;
      conductance: number;
      transmittedSignal: Float32Array;
      signalMagnitude: number;
      fired: boolean;
    }> = [];

    const now = Date.now();

    for (const syn of this.synapses.values()) {
      syn.totalTransmissions++;
      syn.lastPreSpikeTimestamp = now;

      // Effective transmission gain = weight * conductance
      const gain = syn.weight * syn.conductance;
      const transmitted = new Float32Array(act.length);
      let normSq = 0;

      for (let i = 0; i < act.length; i++) {
        const val = act[i] * gain;
        transmitted[i] = val;
        normSq += val * val;
      }

      const signalMagnitude = Math.sqrt(normSq) / Math.max(1, Math.sqrt(act.length));
      // Action potential fires if signal magnitude exceeds threshold and weight is excitatory (> 0)
      const fired = syn.weight > 0.05 && signalMagnitude >= this.fireThreshold;

      results.push({
        targetCellId: syn.targetCellId,
        synapseId: syn.synapseId,
        weight: syn.weight,
        conductance: syn.conductance,
        transmittedSignal: transmitted,
        signalMagnitude,
        fired
      });
    }

    return results;
  }

  /**
   * Handles an incoming neural synaptic pulse received from an external peer cell
   */
  public handleIncomingPulse(
    payload: SynapticPulsePayload,
    localPostActivation?: Float32Array | number[]
  ): SynapticFeedbackPayload {
    const senderId = payload.sourceCellId;
    const now = Date.now();
    const syn = this.registerSynapse(senderId);

    syn.lastPostSpikeTimestamp = now;

    // Evaluate STDP timing
    const deltaT = now - payload.timestamp;
    const stdpRes = this.applySTDP(senderId, payload.timestamp, now);

    // If local post-activation vector is provided, apply Hebbian update
    if (localPostActivation) {
      this.applyHebbianCoactivation(senderId, payload.activationVector, localPostActivation);
    }

    return {
      pulseId: payload.pulseId,
      sourceCellId: this.localCellId,
      targetCellId: senderId,
      deltaT,
      deltaWeight: stdpRes.deltaWeight,
      newWeight: syn.weight,
      isPotentiated: stdpRes.deltaWeight > 0,
      timestamp: now
    };
  }

  /**
   * Invariant integrity check for SystemIntegrityTracker
   */
  public assertInvariants(): { valid: boolean; totalSynapses: number; meanWeight: number; isBounded: boolean } {
    let weightSum = 0;
    let isBounded = true;

    for (const syn of this.synapses.values()) {
      if (isNaN(syn.weight) || !isFinite(syn.weight) || syn.weight < -1.01 || syn.weight > 1.01) {
        isBounded = false;
      }
      if (isNaN(syn.conductance) || !isFinite(syn.conductance) || syn.conductance < 0.05 || syn.conductance > 2.5) {
        isBounded = false;
      }
      weightSum += syn.weight;
    }

    const count = this.synapses.size;
    const meanWeight = count > 0 ? weightSum / count : 0;

    return {
      valid: isBounded,
      totalSynapses: count,
      meanWeight,
      isBounded
    };
  }

  /**
   * Exports full synaptic topology graph for inspection or UI visualization
   */
  public exportTopology(): {
    localCellId: string;
    synapsesCount: number;
    synapses: InterCellSynapse[];
    stdpConfig: STDPConfig;
  } {
    return {
      localCellId: this.localCellId,
      synapsesCount: this.synapses.size,
      synapses: this.getAllSynapses(),
      stdpConfig: this.stdpConfig
    };
  }
}
