import {
  Evidence,
  EvidenceSchema,
  EvidenceDependency,
  EvidenceDependencySchema,
  EvidenceDependencyType,
  freezeEvidence,
  freezeEvidenceDependency
} from './types';
import { logger } from '../../core/logger';

/**
 * Evidence Dependency Graph (EDG) Subsystem
 * 
 * Determines and maintains epistemic relationships between Evidence records:
 * - DEPENDENT: direct/indirect derivation or lineage
 * - CORRELATED: shared observation, common ancestors, or shared representation targets
 * - INDEPENDENT: distinct sources, distinct observations, no shared derivation
 * - UNKNOWN: insufficient metadata to confirm dependency
 */
export class EvidenceDependencyGraph {
  private readonly component = 'evidence_dependency_graph';
  private readonly evidences: Map<string, Evidence> = new Map();
  private readonly dependencies: Map<string, EvidenceDependency> = new Map();
  private readonly pairIndex: Map<string, string> = new Map(); // "minId:maxId" -> dependencyId

  /**
   * Registers an evidence record in the EDG.
   */
  public addEvidence(evidence: Evidence): Evidence {
    const validated = EvidenceSchema.parse(evidence);
    const frozen = freezeEvidence(validated);
    this.evidences.set(frozen.evidenceId, frozen);
    return frozen;
  }

  public getEvidence(evidenceId: string): Evidence | undefined {
    return this.evidences.get(evidenceId);
  }

  public hasEvidence(evidenceId: string): boolean {
    return this.evidences.has(evidenceId);
  }

  public getAllEvidences(): Evidence[] {
    return Array.from(this.evidences.values());
  }

  /**
   * Deterministically evaluates the dependency relationship between two Evidence instances.
   */
  public determineDependency(
    evA: Evidence,
    evB: Evidence
  ): { type: EvidenceDependencyType; basis: string; confidence?: number } {
    if (evA.evidenceId === evB.evidenceId) {
      return {
        type: EvidenceDependencyType.DEPENDENT,
        basis: 'Self-identity relationship',
        confidence: 1.0
      };
    }

    // 1. Lineage / Derivation Check -> DEPENDENT
    const aDerivesFromB = evA.provenance?.derivedFrom?.includes(evB.evidenceId);
    const bDerivesFromA = evB.provenance?.derivedFrom?.includes(evA.evidenceId);
    if (aDerivesFromB || bDerivesFromA) {
      const child = aDerivesFromB ? evA.evidenceId : evB.evidenceId;
      const parent = aDerivesFromB ? evB.evidenceId : evA.evidenceId;
      return {
        type: EvidenceDependencyType.DEPENDENT,
        basis: `Evidence ${child} is directly derived from parent ${parent}`,
        confidence: 1.0
      };
    }

    // Common ancestor in derivedFrom -> CORRELATED
    if (evA.provenance?.derivedFrom && evB.provenance?.derivedFrom) {
      const sharedAncestors = evA.provenance.derivedFrom.filter(id =>
        evB.provenance.derivedFrom!.includes(id)
      );
      if (sharedAncestors.length > 0) {
        return {
          type: EvidenceDependencyType.CORRELATED,
          basis: `Both evidences share common derivation ancestor(s): ${sharedAncestors.sort().join(', ')}`,
          confidence: 0.9
        };
      }
    }

    // 2. Correlated Check
    // A. Shared observationId
    if (evA.observationId && evB.observationId && evA.observationId === evB.observationId) {
      return {
        type: EvidenceDependencyType.CORRELATED,
        basis: `Shared observation ID: ${evA.observationId}`,
        confidence: Math.min(evA.confidence ?? 1.0, evB.confidence ?? 1.0)
      };
    }

    // B. Shared targeted representation IDs in provenance
    const aReps = new Set([
      ...(evA.provenance?.supportingRepresentationIds || []),
      ...(evA.provenance?.contradictingRepresentationIds || [])
    ]);
    const bReps = new Set([
      ...(evB.provenance?.supportingRepresentationIds || []),
      ...(evB.provenance?.contradictingRepresentationIds || [])
    ]);
    const sharedReps = [...aReps].filter(r => bReps.has(r));
    if (sharedReps.length > 0) {
      return {
        type: EvidenceDependencyType.CORRELATED,
        basis: `Shared targeted cognitive representation(s): ${sharedReps.sort().join(', ')}`,
        confidence: 0.75
      };
    }

    // C. Originating from the exact same source with distinct observations -> CORRELATED
    if (evA.sourceId === evB.sourceId && evA.observationId && evB.observationId && evA.observationId !== evB.observationId) {
      return {
        type: EvidenceDependencyType.CORRELATED,
        basis: `Common originating source (${evA.sourceId}) with different observations`,
        confidence: 0.7
      };
    }

    // 3. Independent Check
    // Strictly requires distinct sources AND distinct known observations AND disjoint lineage
    if (
      evA.sourceId !== evB.sourceId &&
      evA.observationId &&
      evB.observationId &&
      evA.observationId !== evB.observationId
    ) {
      return {
        type: EvidenceDependencyType.INDEPENDENT,
        basis: `Distinct sources (${evA.sourceId}, ${evB.sourceId}) and distinct observations (${evA.observationId}, ${evB.observationId}) with no shared lineage`,
        confidence: 0.95
      };
    }

    // 4. Insufficient Information -> UNKNOWN
    return {
      type: EvidenceDependencyType.UNKNOWN,
      basis: 'Insufficient observation or provenance metadata to determine epistemic relationship'
    };
  }

  /**
   * Helper to construct a deterministic dependency candidate from two evidence items.
   */
  public createDependency(
    evA: Evidence,
    evB: Evidence,
    overrideType?: EvidenceDependencyType,
    overrideBasis?: string,
    confidence?: number
  ): EvidenceDependency {
    const analysis = overrideType
      ? { type: overrideType, basis: overrideBasis || 'Explicitly specified dependency', confidence }
      : this.determineDependency(evA, evB);

    const [firstId, secondId] = [evA.evidenceId, evB.evidenceId].sort();
    const dependencyId = `edg_${firstId}_${secondId}`;

    return {
      dependencyId,
      evidenceIdA: evA.evidenceId,
      evidenceIdB: evB.evidenceId,
      type: analysis.type,
      basis: analysis.basis,
      confidence: confidence !== undefined ? confidence : analysis.confidence,
      provenance: ['edg'],
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Canonical pair key helper for pair indexing.
   */
  private getPairKey(idA: string, idB: string): string {
    return [idA, idB].sort().join('::');
  }

  /**
   * Inserts an EvidenceDependency into the EDG.
   * Throws if referenced evidence does not exist in graph.
   * Idempotent / does not duplicate records.
   */
  public insertDependency(candidate: EvidenceDependency): EvidenceDependency {
    const validated = EvidenceDependencySchema.parse(candidate);

    // Guard against dangling references
    if (!this.evidences.has(validated.evidenceIdA)) {
      throw new Error(
        `Cannot insert dependency: Evidence "${validated.evidenceIdA}" does not exist in graph.`
      );
    }
    if (!this.evidences.has(validated.evidenceIdB)) {
      throw new Error(
        `Cannot insert dependency: Evidence "${validated.evidenceIdB}" does not exist in graph.`
      );
    }

    const pairKey = this.getPairKey(validated.evidenceIdA, validated.evidenceIdB);

    // Check if identical dependencyId exists
    if (this.dependencies.has(validated.dependencyId)) {
      return this.dependencies.get(validated.dependencyId)!;
    }

    // Check if relationship for this pair already recorded
    const existingDepId = this.pairIndex.get(pairKey);
    if (existingDepId && this.dependencies.has(existingDepId)) {
      // Return existing without creating a duplicate record
      return this.dependencies.get(existingDepId)!;
    }

    const frozen = freezeEvidenceDependency(validated);
    this.dependencies.set(frozen.dependencyId, frozen);
    this.pairIndex.set(pairKey, frozen.dependencyId);

    logger.debug(this.component, 'dependency_inserted', {
      dependencyId: frozen.dependencyId,
      evidenceIdA: frozen.evidenceIdA,
      evidenceIdB: frozen.evidenceIdB,
      type: frozen.type
    });

    return frozen;
  }

  public getDependency(dependencyId: string): EvidenceDependency | undefined {
    return this.dependencies.get(dependencyId);
  }

  public getAllDependencies(): EvidenceDependency[] {
    return Array.from(this.dependencies.values());
  }

  public getDependencies(): EvidenceDependency[] {
    return this.getAllDependencies();
  }

  public getDependenciesForEvidence(evidenceId: string): EvidenceDependency[] {
    const results: EvidenceDependency[] = [];
    for (const dep of this.dependencies.values()) {
      if (dep.evidenceIdA === evidenceId || dep.evidenceIdB === evidenceId) {
        results.push(dep);
      }
    }
    return results;
  }

  public getDependencyBetween(evidenceIdA: string, evidenceIdB: string): EvidenceDependency | undefined {
    const pairKey = this.getPairKey(evidenceIdA, evidenceIdB);
    const depId = this.pairIndex.get(pairKey);
    if (depId) {
      return this.dependencies.get(depId);
    }
    return undefined;
  }

  public clear(): void {
    this.evidences.clear();
    this.dependencies.clear();
    this.pairIndex.clear();
  }
}
