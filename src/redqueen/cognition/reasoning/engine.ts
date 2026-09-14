import { v4 as uuidv4 } from 'uuid';
import { CognitiveGraph } from '../representation/graph';
import {
  ReasoningChain,
  Premise,
  InferenceStep,
  Hypothesis,
  HypothesisStatus,
  ReasoningStepType,
  VerificationProcess
} from './types';

export class ReasoningEngine {
  private chains: Map<string, ReasoningChain> = new Map();
  private graph: CognitiveGraph;

  constructor(graph: CognitiveGraph) {
    this.graph = graph;
  }

  public initiateChain(goal: string, provenance: string): ReasoningChain {
    const chain: ReasoningChain = {
      chainId: `chain_${uuidv4()}`,
      goal,
      premises: [],
      inferenceSteps: [],
      verifications: [],
      uncertainty: 1.0,
      provenance
    };
    this.chains.set(chain.chainId, chain);
    return chain;
  }

  public getChain(chainId: string): ReasoningChain | undefined {
    return this.chains.get(chainId);
  }

  public addPremise(chainId: string, premise: Omit<Premise, 'id'>): Premise {
    const chain = this.chains.get(chainId);
    if (!chain) throw new Error(`Chain ${chainId} not found`);

    const newPremise: Premise = {
      id: `premise_${uuidv4()}`,
      ...premise
    };
    chain.premises.push(newPremise);
    return newPremise;
  }

  public addInferenceStep(
    chainId: string,
    type: ReasoningStepType,
    description: string,
    premises: string[],
    assumptions: string[]
  ): InferenceStep {
    const chain = this.chains.get(chainId);
    if (!chain) throw new Error(`Chain ${chainId} not found`);

    const step: InferenceStep = {
      id: `inf_${uuidv4()}`,
      type,
      description,
      premises,
      hypotheses: [],
      assumptions
    };
    chain.inferenceSteps.push(step);
    return step;
  }

  public proposeHypothesis(
    chainId: string,
    inferenceStepId: string,
    hypothesisData: Omit<Hypothesis, 'id' | 'status'>
  ): Hypothesis {
    const chain = this.chains.get(chainId);
    if (!chain) throw new Error(`Chain ${chainId} not found`);

    const step = chain.inferenceSteps.find(s => s.id === inferenceStepId);
    if (!step) throw new Error(`Inference step ${inferenceStepId} not found`);

    const hypothesis: Hypothesis = {
      id: `hyp_${uuidv4()}`,
      status: HypothesisStatus.PROPOSED,
      ...hypothesisData
    };
    step.hypotheses.push(hypothesis);
    return hypothesis;
  }

  public verifyHypothesis(
    chainId: string,
    hypothesisId: string,
    evidenceId: string[],
    counterEvidenceId: string[],
    conclusionDescription: string,
    finalStatus: HypothesisStatus,
    updatedConfidence: number
  ): VerificationProcess {
    const chain = this.chains.get(chainId);
    if (!chain) throw new Error(`Chain ${chainId} not found`);

    // Find and update the hypothesis status
    let hypothesisFound = false;
    for (const step of chain.inferenceSteps) {
      const hyp = step.hypotheses.find(h => h.id === hypothesisId);
      if (hyp) {
        hyp.status = finalStatus;
        hyp.confidence = updatedConfidence;
        hypothesisFound = true;
        break;
      }
    }

    if (!hypothesisFound) throw new Error(`Hypothesis ${hypothesisId} not found in chain ${chainId}`);

    const verification: VerificationProcess = {
      hypothesisId,
      evidenceId,
      counterEvidenceId,
      conclusionDescription,
      finalStatus,
      updatedConfidence
    };

    chain.verifications.push(verification);
    this.updateChainUncertainty(chain);
    return verification;
  }

  private updateChainUncertainty(chain: ReasoningChain) {
    if (chain.inferenceSteps.length === 0) {
      chain.uncertainty = 1.0;
      return;
    }
    
    let totalConfidence = 0;
    let count = 0;
    
    for (const step of chain.inferenceSteps) {
      for (const hyp of step.hypotheses) {
        if (hyp.status !== HypothesisStatus.PROPOSED && hyp.status !== HypothesisStatus.UNDECIDED) {
          totalConfidence += hyp.confidence;
          count++;
        }
      }
    }
    
    if (count > 0) {
      const avgConfidence = totalConfidence / count;
      chain.uncertainty = 1.0 - avgConfidence;
    }
  }
}
