# EP13 -- Stable Agent Protocol

> Status: IN_PROGRESS
> Dependencies: EP09
> Phase: 11 (Protocol & Communication)
> Target: April 2026

## Motivation

The agent communication layer works but depends on brittle internals:

1. **Spawn mechanism** uses discovered minified SDK exports (`clientMod.t`,
   `clientMod.kt`, `clientMod.Xt`) that can break on any OpenClaw SDK update.
   EP09 task 0067 introduced an abstraction layer, but the underlying
   implementation still resolves these internals at runtime.

2. **Telegram plugin** accesses the database via
   `(api as unknown as Record<string, unknown>)['_sharedDb']`, a non-public API
   cast that could break silently on SDK refactors.

3. **Inter-agent messages** have no formal schema. Message payloads are
   `Record<string, unknown>` with no validation. A sending agent can include
   anything; the receiving agent must guess the structure.

**Current state:**
- Spawn abstraction layer: `fireAgentViaGatewayWs` with retry queue (live, EP09)
- Inter-agent messaging: `team_message` / `team_reply` tools (live, EP08)
- Shared state access: `_sharedDb` cast in Telegram plugin (fragile, live)
- Message format: unstructured `Record<string, unknown>` (live)

**Target state:**
- Spawn mechanism with zero SDK internal dependencies.
- Formal JSON Schema contracts for every inter-agent message type.
- Stable plugin API for shared state access (no casts, no private properties).
- Protocol version negotiation so agents can evolve independently.

## Task Breakdown

### 11A: Core Protocol (parallel)

#### Task 0094: Spawn Mechanism v2 -- Zero SDK Internals

**Scope:** Replace the spawn implementation that depends on minified SDK internals
with one that uses only public OpenClaw APIs or documented extension points.

**Investigation required:** Before implementation, audit the current spawn path
to identify exactly which SDK internals are used and what public alternatives exist.

**Strategy options (choose during implementation):**

1. **HTTP-based spawn**: Use the gateway's REST API to start agent sessions.
   The gateway already has HTTP endpoints for session management.
   Pro: No SDK coupling. Con: May require gateway config changes.

2. **Plugin API spawn**: Check if `api.spawnAgent()` or equivalent exists in the
   current SDK version. If so, use it directly.
   Pro: Official API. Con: May not exist yet.

3. **Event-based spawn**: Emit a `spawn_request` event and let the gateway handle
   it via its native event loop.
   Pro: Decoupled. Con: Async, harder to track success/failure.

4. **WebSocket with public protocol**: Use the WebSocket connection but only send
   documented message types (not discovered internal method calls).
   Pro: Similar to current approach. Con: Still WS-coupled.

**Deliverables regardless of strategy:**
- `SpawnService` interface with `spawn(agentId, context): Promise<SpawnResult>`
- Implementation using chosen strategy
- Fallback to current implementation if new approach fails (feature flag)
- Migration path: old → new with zero downtime
- Retry queue and dead-letter semantics preserved (from EP09)

**Files to create/modify:**
- `extensions/product-team/src/orchestrator/spawn-service.ts` (rewrite)
- `extensions/product-team/src/orchestrator/spawn-service.test.ts` (new/rewrite)
- Integration test: spawn all 8 agent types successfully

**Acceptance criteria:**
- Zero references to minified SDK exports (`clientMod.*`)
- Spawn works for all 8 agent types
- Retry queue semantics preserved
- Feature flag to revert to old implementation
- >= 90% test coverage

---

#### Task 0095: Inter-Agent Message Contracts (JSON Schema)

**Scope:** Define formal JSON Schema contracts for every inter-agent message type
and validate messages at send time and receive time.

**Message types to formalize:**

| Message Type | Sender(s) | Receiver(s) | Key Fields |
|-------------|-----------|-------------|------------|
| `stage_handoff` | Any | Next stage owner | taskId, fromStage, toStage, artifacts |
| `review_request` | back-1/front-1 | tech-lead | taskId, prUrl, changedFiles, qualityReport |
| `review_result` | tech-lead | back-1/front-1 | taskId, verdict, violations[], summary |
| `qa_request` | tech-lead | qa | taskId, scope, testTargets |
| `qa_report` | qa | tech-lead | taskId, total, passed, failed, evidence[] |
| `design_request` | po | designer | taskId, brief, constraints |
| `design_delivery` | designer | front-1 | taskId, screenIds[], htmlPaths[] |
| `escalation` | Any | pm/tech-lead | taskId, reason, category, context |
| `status_update` | Any | pm | agentId, status, currentTask, progress |
| `budget_alert` | system | pm | scope, consumed, limit, recommendation |

**Validation strategy:**
- Schemas stored in `packages/quality-contracts/src/schemas/messages/`
- `team_message` tool validates payload against schema before sending
- Validation errors logged and message rejected (fail-fast, not silent drop)
- Schema version included in every message: `{ _protocol: '1.0', _type: 'stage_handoff', ... }`

**Files to create/modify:**
- `packages/quality-contracts/src/schemas/messages/` (new directory, 10+ schema files)
- `packages/quality-contracts/src/validation/message-validator.ts` (new)
- `extensions/product-team/src/tools/team-messaging.ts` (modify: add validation)
- Tests for schemas and validator

**Acceptance criteria:**
- All 10+ message types have published JSON Schema
- Send-time validation rejects malformed messages with clear error
- Schema version field present in all messages
- Backward compatibility: messages without `_protocol` field still accepted (logged as warning)
- >= 90% test coverage

---

### 11B: Stability (sequential after 11A)

#### Task 0096: Stable Plugin Shared State API

**Scope:** Replace the `_sharedDb` cast in the Telegram plugin with a stable,
documented mechanism for plugins to share state.

**Current fragile pattern:**
```typescript
const db = (api as unknown as Record<string, unknown>)['_sharedDb'];
```

**Proposed solutions (choose during implementation):**

1. **Plugin extension API**: If OpenClaw SDK supports `api.getSharedService('db')`,
   use it. Check SDK docs/source.

2. **Event-based query**: Telegram plugin emits `query` events that product-team
   listens to and responds with data. No direct DB access.
   ```typescript
   // Telegram plugin
   const result = await api.emit('query:tasks', { status: 'in_progress' });

   // Product-team plugin
   api.on('query:tasks', async ({ status }) => {
     return taskRepo.search({ status });
   });
   ```

3. **HTTP API**: Telegram plugin calls product-team's HTTP endpoints instead of
   accessing the DB directly. The `/api/` routes already exist.

4. **Shared service registration**: Product-team registers a service that Telegram
   can consume:
   ```typescript
   // Product-team
   api.registerService('task-query', taskQueryService);

   // Telegram
   const taskQuery = api.getService('task-query');
   ```

**Files to create/modify:**
- `extensions/telegram-notifier/src/index.ts` (modify: remove `_sharedDb` cast)
- `extensions/telegram-notifier/src/commands/` (modify: use new shared state API)
- `extensions/product-team/src/index.ts` (modify: expose shared state if needed)
- Tests for all modified modules

**Acceptance criteria:**
- Zero `_sharedDb` references in the codebase
- Zero `as unknown as` casts for SDK internals in the codebase
- Telegram commands produce same results as before
- New pattern documented as extension integration example
- >= 90% test coverage

---

#### Task 0097: Protocol Version Negotiation

**Scope:** Add protocol version metadata to agent communication so that agents
using different protocol versions can interoperate gracefully.

**Version header:**

```typescript
interface ProtocolHeader {
  _protocol: string;   // semver: '1.0.0'
  _type: string;       // message type: 'stage_handoff'
  _sender: string;     // agentId
  _timestamp: string;  // ISO 8601
}
```

**Negotiation behavior:**
- Sender includes protocol version in every message
- Receiver checks version compatibility:
  - Same major version → process normally
  - Different major version → reject with `PROTOCOL_MISMATCH` error
  - Unknown minor version fields → ignore (forward-compatible)
- Version mismatch logged as structured event for monitoring

**Files to create/modify:**
- `packages/quality-contracts/src/schemas/protocol-header.ts` (new)
- `extensions/product-team/src/tools/team-messaging.ts` (modify: add header)
- Tests for version negotiation

**Acceptance criteria:**
- All messages include protocol version header
- Version mismatch produces clear, actionable error
- Forward-compatible: unknown fields ignored, not rejected
- >= 90% test coverage

---

### 11C: Verification (sequential after 11B)

#### Task 0098: Contract Conformance Test Suite

**Scope:** Build a test suite that validates all inter-agent communication
conforms to the published contracts (task 0095) and that the spawn mechanism
(task 0094) works reliably across all agent types.

**Test categories:**

1. **Schema conformance**: For each message type, generate valid and invalid
   payloads and verify validation behavior.

2. **Round-trip tests**: Simulate agent A sending a message, verify it
   arrives at agent B with correct schema, header, and payload.

3. **Spawn smoke tests**: Spawn each of the 8 agent types, verify they start
   and can send/receive at least one message.

4. **Version negotiation tests**: Verify behavior with matching versions,
   minor mismatch, and major mismatch.

5. **Backward compatibility**: Verify that messages without protocol header
   still process (with deprecation warning).

**Files to create/modify:**
- `extensions/product-team/src/__tests__/protocol-conformance.test.ts` (new)
- `extensions/product-team/src/__tests__/spawn-smoke.test.ts` (new)

**Acceptance criteria:**
- All 10+ message types tested with valid and invalid payloads
- Round-trip test for at least 3 message types
- Spawn test for all 8 agent types
- Version negotiation tested (match, minor mismatch, major mismatch)
- Test suite runs in CI as part of `pnpm test`
- >= 95% coverage of protocol-related code

## Definition of Done

- [ ] All 5 tasks completed with >= 90% test coverage each
- [ ] Zero references to `clientMod.*` minified SDK exports
- [ ] Zero `_sharedDb` casts in codebase
- [ ] All inter-agent messages validated against JSON Schema contracts
- [ ] Protocol version header present in all messages
- [ ] Contract conformance test suite passes in CI
- [ ] `pnpm test && pnpm lint && pnpm typecheck` passes
