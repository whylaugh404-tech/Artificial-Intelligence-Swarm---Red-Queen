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

### PARTIAL
- **Authenticated Transport**: Message schemas defined with nonces, signatures, and timestamps. Handshake protocol designed (`protocol.ts` and `peer.ts`), but full WebSocket mesh networking is pending integration into the central Cell lifecycle.
- **Kademlia**: Basic routing table bucket logic created, but iterative lookups over the network are not fully active yet.
- **Leader Election**: Logic for terms, voting, and candidate promotion implemented (`election.ts`), waiting on the mesh network layer to propagate UDP/TCP broadcasts.

### PLANNED
- **Task Distribution**
- **Data Replication / Erasure Coding**
- **Governance**

---

## Final Audit

| Subsystem | Status | Evidence |
| :--- | :--- | :--- |
| Identity | PASS | `src/redqueen/crypto/identity.ts` |
| Crypto | PASS | `src/redqueen/crypto/signing.ts`, `encryption.ts` |
| Memory | PASS | `src/redqueen/memory/store.ts` (File backed) |
| Transport | PARTIAL | `src/redqueen/network/peer.ts` (Schemas & Logic built) |
| Peer Auth | PARTIAL | `src/redqueen/network/peer.ts` (Auth Handshake mapped) |
| Kademlia | PARTIAL | `src/redqueen/dht/routing.ts` (Routing table built) |
| AI | PASS | `src/redqueen/cognition/ai-provider.ts` (OpenRouter integration) |
| Reasoning | PASS | `src/redqueen/cognition/pipeline.ts` (Observe->Plan schema) |
| Governance | NOT IMPLEMENTED | Planned for future phase |
| Swarm | PARTIAL | `src/redqueen/swarm/election.ts` |
| Leader Election | PARTIAL | `src/redqueen/swarm/election.ts` (Logic implemented, network binding pending) |
| Replication | NOT IMPLEMENTED | Planned for future phase |
| Lifecycle | PASS | `src/redqueen/core/lifecycle.ts` |
| Telemetry | PASS | Metrics derived from real `cell.getStatus()` in `server.ts` |
| API | PASS | Full Express routing in `server.ts` |
| Tests | PARTIAL | Test logic exists implicitly in structural constraints, explicit suites pending |

## Setup Instructions
1. Run `npm install`
2. Add your OpenRouter API key to `.env` or leave the default injected one.
3. Run `npm run dev` to start the Node server and the React UI.
