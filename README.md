# Red Queen
A modular, observable, testable distributed autonomous cyber-research agent framework.

<img width="640" height="427" alt="1000184119" src="https://github.com/user-attachments/assets/30ec4333-c21f-410a-af6b-2d2dd1eb20c6" />

## Project Principles
- **No Simulation**: All telemetry, peer counts, health statuses, and metrics are derived from real runtime state.
- **Untrusted AI by Default**: The LLM output is validated and authorized before execution.
- **Modular Architecture**: Built in phases, cleanly separated into core, crypto, cognition, memory, genome, and swarm modules.
- **Persistent Local Memory**: Real file-backed persistent memory out of the box with cell-scoped isolation.
- **Biological Cell Paradigm**: The fundamental unit of the organism is an individual cognitive **Cell**. Each Cell possesses its own identity, genome, logic version, memory, goals, lineage, and specialization. Cells are never assumed to be identical clones.

---

## Current Implementation Status

### IMPLEMENTED
- **Identity**: Cryptographic keypair generation (Ed25519) and deterministic stable Node ID derivation (SHA-256).
- **Crypto**: AES-256-GCM encryption, Ed25519 signing and verification wrappers with whitespace-normalized public key handling.
- **Configuration & Logging**: Structured JSON logging.
- **Lifecycle (P0 + P3)**: Strict state machine (`CREATED` -> `INITIALIZING` -> `ACTIVE` -> `SUSPENDED` -> `RETIRED` -> `SHUTTING_DOWN` -> `STOPPED`).
- **Persistent Memory (P0 + P3)**: Disk-backed JSON store with asynchronous read/write, cell-scoped isolation, and categorization into `EPISODIC`, `SEMANTIC`, and `PROCEDURAL`.
- **AI / OpenRouter**: Real integration with OpenRouter API, structured schema enforcement via Zod, and full Cognition Pipeline.
- **API & Dashboard**: Express.js server providing real-time data to a React dashboard.
- **Authenticated P2P Transport (P0)**: Fully functional cell-to-cell WebSocket communication with symmetric tie-breaking.
- **Peer Authentication (P0)**: Handshake (`HELLO` -> `CHALLENGE` -> `AUTH`) with strict cryptographic verification and Node ID bounds checking.
- **Replay Protection (P0)**: Strict cache window checking nonces, message IDs, and timestamps.
- **OSINT**: Basic scanner modules (TCP Port scanning, DNS evaluation).
- **Hardened Kademlia DHT Foundation (P1.5)**:
  - Canonical 32-byte numerical XOR distance comparison.
  - Strict Node ID validator (64-character lowercase hex) enforcing Ed25519 public key derivation.
  - Strict endpoint validator for `ws:` and `wss:` with port bounds, hostname validation, and traversal rejection.
  - Real K-bucket maintenance (K=20, 256 buckets, stale peer eviction, duplicate suppression, self-rejection).
  - Iterative `FIND_NODE` lookup with resource and payload bounds (max 64KB messages, max 20 peers per response).
- **Swarm Membership & Authority (P2 & P2.1 Hardened)**:
  - Strict separation of Transport Identity vs Membership Signing Authority.
  - Cryptographic membership certificates binding `swarmId`, `memberNodeId`, `memberPublicKey`, `issuerId`, `issuerPublicKey`, `issuedAt`, `expiresAt`, `revocationEpoch`, `capabilities`, `protocolVersion`, `membershipVersion`, and Ed25519 signature.
  - Configurable Trust Anchor (`trustedIssuerPublicKey`) enforcing that untrusted rogue authorities cannot join or announce certificates.
  - Canonical deterministic JSON serialization for signature verification.
  - Replay and clock skew protection (5s skew tolerance, TTL expiration, monotonic revocation epoch).
  - Authority keypair persistence to disk (`saveToFiles`/`fromFiles`) and non-enumerable private keys preventing secret leakage.
- **Cell Genome & Lineage System (P3)**:
  - `CellGenome`: Explicit schema encapsulating `genomeId`, `parentGenomeId`, `parentCellId`, `generation`, `lineageId`, `createdAt`, `logicVersion`, `traits`, `capabilities`, `specialization`, and `ancestorGenomeIds`.
  - Bounded behavioral traits: `mutationRate` [0, 1], `riskTolerance` [0, 1], `explorationVsExploitation` [0, 1], and `maxCognitiveCycleDepth` (int >= 1).
  - Strict capability bounding to `ALLOWED_CELL_CAPABILITIES` (`OSINT_SCAN`, `KNOWLEDGE_QUERY`, `PEER_REPLICATION`, `CODE_ANALYSIS`, `COGNITIVE_REASONING`, `SWARM_COORDINATION`, `MEMORY_MUTATION`).
  - Progeny derivation (`deriveProgenyGenome`): advancing generation counter, recording immutable ancestral lineage chains, and preventing multi-generational corruption.
  - Lineage tracking (`CellLineage`): recording genealogical trees without mutating parent states.
- **Cell Individual Cognitive State (P3)**:
  - `CognitiveStateManager`: Manages dynamic cell specialization, active goals, operational confidence, knowledge references, memory category statistics, and lifecycle synchronization.
  - Full persistence and restore across restarts via scoped `MemoryStore`.
  - Safe serialization (`toJSON()`): never exposes private transport keys or sensitive credentials.
- **Memory Isolation & Ownership (P3)**:
  - Cell-scoped memory enforcement preventing cross-cell data leakage.
  - Ownership validation on storage and retrieval.

### PARTIAL
- **Leader Election**: Logic for terms, voting, and candidate promotion implemented (`election.ts`), currently bound to the P2P transport.

### NOT IMPLEMENTED
- **Distributed Memory**
- **Data Replication / Erasure Coding**
- **Task Distribution**
- **Governance**

---

## Technical Audit

| Subsystem | Status | Evidence |
| :--- | :--- | :--- |
| Identity | PASS | `src/redqueen/crypto/identity.ts` |
| Crypto | PASS | `src/redqueen/crypto/signing.ts`, `encryption.ts` |
| Memory Isolation | PASS | `src/redqueen/memory/store.ts` (Cell-scoped, categorized) |
| Transport | PASS | `src/redqueen/network/transport.ts` (Real WebSockets) |
| Peer Auth | PASS | `src/redqueen/network/peer.ts` (HELLO/CHALLENGE/AUTH) |
| Kademlia / DHT | PASS | `src/redqueen/dht/routing.ts`, `src/redqueen/core/cell.ts` (P1.5 Hardened) |
| Swarm Membership | PASS | `src/redqueen/swarm/` (Authority, Verifier, Manager, Canonical) |
| Trust Anchor (P2.1) | PASS | `src/redqueen/swarm/membership.ts` (Configured trusted issuer anchor) |
| Genome & Lineage (P3) | PASS | `src/redqueen/genome/` (Genome, Lineage, Traits, Progeny) |
| Cognitive State (P3) | PASS | `src/redqueen/cognition/state.ts` (Dynamic goals, confidence, stats) |
| Lifecycle Transitions | PASS | `src/redqueen/core/lifecycle.ts` (CREATED, INITIALIZING, ACTIVE, SUSPENDED, RETIRED, STOPPED) |
| AI Reasoning | PASS | `src/redqueen/cognition/pipeline.ts` |
| Tests | PASS | 193 tests passing across 22 suites (100% pass rate) |

## Setup Instructions
1. Run `npm install`
2. Add your OpenRouter API key to `.env`
3. Optional: Add `P2P_PORT=4000` to your `.env` to enable inbound networking.
4. Run `npm run dev` to start the Node server and the React UI.
5. Run `npm test` to execute the full 193-test suite.
