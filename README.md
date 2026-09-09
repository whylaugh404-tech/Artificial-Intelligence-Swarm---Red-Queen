# Red Queen
A modular, observable, testable distributed autonomous cyber-research agent framework.

## Project Principles
- **No Simulation**: All telemetry, peer counts, health statuses, and metrics are derived from real runtime state.
- **Untrusted AI by Default**: The LLM output is validated and authorized before execution.
- **Modular Architecture**: Built in phases, cleanly separated into core, crypto, cognition, memory, and swarm modules.
- **Persistent Local Memory**: Real file-backed persistent memory out of the box.

## Current Implementation Status

### IMPLEMENTED
- **Identity**: Cryptographic keypair generation (Ed25519) and deterministic stable Node ID derivation (SHA-256).
- **Crypto**: AES-256-GCM encryption, Ed25519 signing and verification wrappers.
- **Configuration & Logging**: Structured JSON logging.
- **Lifecycle**: Strict state machine (CREATED -> INITIALIZING -> ACTIVE -> DEGRADED -> STOPPED).
- **Persistent Memory**: Disk-backed JSON store with asynchronous read/write and metadata tagging.
- **AI / OpenRouter**: Real integration with OpenRouter API, structured schema enforcement via Zod, and full Cognition Pipeline.
- **API & Dashboard**: Express.js server providing real-time data to a React dashboard.
- **Authenticated P2P Transport**: Fully functional two-cell WebSocket communication.
- **Peer Authentication**: Handshake (HELLO -> CHALLENGE -> AUTH) with strict cryptographic verification and Node-ID bounds checking.
- **Replay Protection**: Strict cache window checking nonces, message IDs, and timestamps.
- **OSINT**: Basic scanner modules (TCP Port scanning, DNS evaluation).
- **Hardened Kademlia DHT Foundation (P1.5)**:
  - Canonical 32-byte numerical XOR distance comparison (no `localeCompare` or lexicographical comparisons).
  - Strict Node ID validator (64-character lowercase hex) enforcing Ed25519 public key derivation.
  - Strict endpoint validator for `ws:` and `wss:` with port bounds, hostname validation, and traversal rejection.
  - Real K-bucket maintenance (K=20, 256 buckets, stale peer eviction, duplicate suppression, self-rejection).
  - Deterministic duplicate connection handling with symmetric tie-breaking policy.
  - Connection concurrency limiting (ALPHA=3 lookup queries, MAX_CONCURRENT_PEER_CONNECTIONS=3).
  - Iterative FIND_NODE lookup with untrusted payload parsing, validation, and deterministic termination.
  - Resource and payload bounds (max 64KB messages, max 20 peers per FIND_NODE_RESPONSE).
  - Comprehensive negative test suite covering 25+ DHT and security scenarios with clean timer lifecycle teardown.

### PARTIAL
- **Leader Election**: Logic for terms, voting, and candidate promotion implemented (`election.ts`), currently bound to the P2P transport but marked as explicitly partial for this milestone.

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
| Memory | PASS | `src/redqueen/memory/store.ts` (File backed) |
| Transport | PASS | `src/redqueen/network/transport.ts` (Real WebSockets) |
| Peer Auth | PASS | `src/redqueen/network/peer.ts` (HELLO/CHALLENGE/AUTH) |
| Kademlia / DHT | PASS | `src/redqueen/dht/routing.ts`, `src/redqueen/core/cell.ts` (P1.5 Hardened) |
| AI | PASS | `src/redqueen/cognition/ai-provider.ts` |
| Reasoning | PASS | `src/redqueen/cognition/pipeline.ts` |
| Governance | NOT IMPLEMENTED | Planned for future phase |
| Leader Election | PARTIAL | `src/redqueen/swarm/election.ts` |
| Distributed Memory | NOT IMPLEMENTED | Planned for future phase |
| Replication | NOT IMPLEMENTED | Planned for future phase |
| Lifecycle | PASS | `src/redqueen/core/lifecycle.ts` |
| Telemetry | PASS | Metrics derived from real `cell.getStatus()` in `server.ts` |
| API | PASS | Full Express routing in `server.ts` |
| Tests | PASS | 72 tests passing across 8 suites (including 25-scenario security suite) |

## Setup Instructions
1. Run `npm install`
2. Add your OpenRouter API key to `.env`
3. Optional: Add `P2P_PORT=4000` to your `.env` to enable inbound networking.
4. Run `npm run dev` to start the Node server and the React UI.
