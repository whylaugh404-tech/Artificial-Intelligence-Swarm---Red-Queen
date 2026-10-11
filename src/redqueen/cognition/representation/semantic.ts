import { computeDeterministicHash } from '../computation/canonical';
import { InformationCategory } from '../../metabolism/types';

/**
 * Ephemeral keys: runtime instance identifiers, timestamps, hashes, or transport metadata.
 * These are not intrinsic semantic attributes of an entity or phenomenon.
 */
export const EPHEMERAL_KEYS = new Set([
  'id',
  'uuid',
  'observationid',
  'experienceid',
  'transactionid',
  'sourceid',
  'source',
  'sourceidentifier',
  'timestamp',
  'createdat',
  'updatedat',
  'time',
  'cycle',
  'cyclenumber',
  'nodeid',
  'cellid',
  'deterministicid',
  'hash',
  'sourceuri',
  'signature',
  'proof',
  'version',
  'domainkind',
  'type',
  'actioncomputationid',
  'entityid',
  'callerid',
  'clientid',
  'tag',
  'assettag'
]);

/**
 * Ontology hint keys: user-provided or proposal fields that must NOT be treated
 * as ground truth ontology. They are retained only as proposed metadata.
 */
export const ONTOLOGY_HINT_KEYS = new Set([
  'parent',
  'instanceof',
  'isa',
  'taxonomy',
  'conceptid',
  'canonicalname',
  'nameorid',
  'targetconceptid',
  'proposedrelation',
  'proposedconcept',
  'observedsubject',
  'subject',
  'name',
  'title',
  'label',
  'devicename',
  'entityname'
]);

/**
 * Keys representing leaf/instance-specific parameter dimensions (numerical metrics, local zones, telemetry details)
 * that should be abstracted away when inferring higher-order invariant classes.
 */
export const LEAF_PARAM_REGEX = /^(?:rpm|operatingrpm|speed|temperature|pressure|voltage|frequency|flux|radiationflux|reading|value|count|threshold|level|metric|sector|gridsector|location|zone|rack|slot|channel|unitnumber|unitid|details|description|summary|anomaly|error|failuremode|status|operationalstatus|flowrate|coolantflowrate|contradicts|isfalse|outcome|result|alert)$/i;

export interface ExtractedSemanticProfile {
  /** Complete normalized non-ephemeral semantic attributes */
  readonly attributes: Record<string, string | number | boolean>;
  /** Core systemic/functional invariant attributes (leaf instance parameters abstracted) */
  readonly invariantAttributes: Record<string, string | number | boolean>;
  /** Ephemeral runtime metadata */
  readonly ephemeralValues: Record<string, any>;
  /** Proposed hints from caller */
  readonly proposedHints: Record<string, any>;
  /** Mathematical semantic hash of the concrete instance */
  readonly semanticHash: string;
  /** Mathematical hash of the abstract invariant class */
  readonly invariantHash: string;
  /** Autonomous deterministic concept ID */
  readonly conceptId: string;
  /** Autonomous deterministic abstract parent concept ID */
  readonly abstractConceptId: string;
  /** Autonomous canonical name derived from semantic attributes */
  readonly canonicalName: string;
  /** Autonomous abstract class canonical name */
  readonly abstractCanonicalName: string;
  /** Inferred or fallback information category */
  readonly category: InformationCategory;
}

function capitalizeToken(s: string): string {
  if (!s || s.length === 0) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function formatSemanticName(tokens: Array<string | number | boolean>): string {
  const parts: string[] = [];
  for (const t of tokens) {
    if (typeof t === 'string') {
      const sub = t.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(capitalizeToken).join('');
      if (sub) parts.push(sub);
    } else if (typeof t === 'number' || typeof t === 'boolean') {
      parts.push(String(t));
    }
  }
  return parts.join('_');
}

/**
 * Extracts pure semantic features and deterministic ontology identities from raw inputs.
 * Excludes caller identity hints and ephemeral fields, guaranteeing:
 * 1. Identity-invariance: Same semantic features with different caller names/IDs produce identical ontology.
 * 2. Semantic-sensitivity: Altering semantic features deterministically alters the resulting concept.
 * 3. Autonomous abstraction: Invariant operational characteristics yield an abstract class concept.
 */
export function extractSemanticProfile(raw: any, fallbackCategory = InformationCategory.OPERATING_SYSTEM): ExtractedSemanticProfile {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      const trimmed = raw.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        obj = JSON.parse(trimmed);
      }
    } catch {}
  }

  // Handle nested content or payload structures
  if (obj && typeof obj === 'object') {
    if (obj.content && typeof obj.content === 'object') {
      obj = { ...obj, ...obj.content };
    }
    if (obj.payload && typeof obj.payload === 'object') {
      obj = { ...obj, ...obj.payload };
    }
    if (obj.raw && typeof obj.raw === 'object') {
      obj = { ...obj, ...obj.raw };
    }
  }

  const attributes: Record<string, string | number | boolean> = {};
  const invariantAttributes: Record<string, string | number | boolean> = {};
  const ephemeralValues: Record<string, any> = {};
  const proposedHints: Record<string, any> = {};

  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      const lowerKey = key.toLowerCase().trim();

      if (EPHEMERAL_KEYS.has(lowerKey)) {
        ephemeralValues[key] = value;
        continue;
      }

      if (ONTOLOGY_HINT_KEYS.has(lowerKey)) {
        proposedHints[key] = value;
        continue;
      }

      // Handle primitive semantic values
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        const normKey = key.trim();
        const normVal = typeof value === 'string' ? value.trim().toLowerCase() : value;
        attributes[normKey] = normVal;

        // Abstract away leaf instance parameters (numeric metrics, localized sectors)
        const isNumeric = typeof value === 'number';
        const isLeaf = isNumeric || LEAF_PARAM_REGEX.test(normKey);
        if (!isLeaf) {
          invariantAttributes[normKey] = normVal;
        }
      }
    }
  }

  // If invariantAttributes ended up empty (e.g., all fields were numeric or single field),
  // fall back to string-valued attributes as invariants
  if (Object.keys(invariantAttributes).length === 0 && Object.keys(attributes).length > 0) {
    for (const [k, v] of Object.entries(attributes)) {
      if (typeof v === 'string') {
        invariantAttributes[k] = v;
      }
    }
  }

  // Deterministic serialization of semantic attributes
  const sortedPairs = Object.keys(attributes)
    .sort()
    .map(k => `${k}=${attributes[k]}`)
    .join(';');

  const semanticHash = computeDeterministicHash(
    sortedPairs.length > 0 ? sortedPairs : (obj ? JSON.stringify(obj) : 'empty_semantic')
  );

  const sortedInvariantPairs = Object.keys(invariantAttributes)
    .sort()
    .map(k => `${k}=${invariantAttributes[k]}`)
    .join(';');

  const invariantHash = computeDeterministicHash(
    sortedInvariantPairs.length > 0 ? sortedInvariantPairs : semanticHash
  );

  const conceptId = `concept_${semanticHash.substring(0, 16)}`;
  const abstractConceptId = `concept_abstract_${invariantHash.substring(0, 16)}`;

  // Synthesize canonical names based on salient semantic features
  const invariantTokens = Object.values(invariantAttributes).slice(0, 3);
  const abstractNameBase = formatSemanticName(invariantTokens);
  const abstractCanonicalName = abstractNameBase
    ? `${abstractNameBase}_Class`
    : `AbstractInvariant_${invariantHash.substring(0, 8)}`;

  const concreteTokens = Object.values(attributes).filter(v => typeof v === 'string' || typeof v === 'number').slice(0, 8);
  const concreteNameBase = formatSemanticName(concreteTokens);
  const canonicalName = concreteNameBase
    ? concreteNameBase
    : `SemanticConcept_${semanticHash.substring(0, 8)}`;

  let category = fallbackCategory;
  if (obj?.category && Object.values(InformationCategory).includes(obj.category)) {
    category = obj.category;
  } else if (obj?.detectedCategory && Object.values(InformationCategory).includes(obj.detectedCategory)) {
    category = obj.detectedCategory;
  }

  return {
    attributes,
    invariantAttributes,
    ephemeralValues,
    proposedHints,
    semanticHash,
    invariantHash,
    conceptId,
    abstractConceptId,
    canonicalName,
    abstractCanonicalName,
    category
  };
}
