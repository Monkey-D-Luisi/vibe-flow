# Task: 0111 -- Protocol Regression Test Suite

## Metadata

| Field | Value |
|-------|-------|
| Status | IN_PROGRESS |
| Epic | EP16 -- E2E Testing & Load Characterization |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-29 |
| Branch | `feat/EP16-e2e-testing-load` |

---

## Goal

Build a stress test suite that validates EP13 protocol contracts under high
message volume, concurrent sends, invalid payloads, version mismatches,
large payloads, and rate limiting conditions.

---

## Context

EP13 established formal inter-agent message contracts (10 message types with
JSON schemas), protocol version negotiation, and contract conformance tests.
The existing conformance tests cover valid/invalid payloads per type but do
not test under stress conditions (concurrent sends, high volume, fuzz).

---

## Scope

### In Scope

- Schema fuzz: random payloads per message type
- Concurrent messaging: 8 agents × 10 messages simultaneously
- Invalid payloads: missing fields, wrong types, extra fields
- Version mismatch: mixed protocol versions
- Large payloads: 100KB+ data
- Rate limiting: 100 messages/second burst

### Out of Scope

- Actual network-level testing (messages are in-process)
- CI integration for these tests (Task 0112)

---

## Acceptance Criteria

- [ ] AC1: All test categories pass
- [ ] AC2: Schema fuzz generates random payloads using JSON Schema definitions
- [ ] AC3: Concurrent tests verify no message loss or corruption
- [ ] AC4: Invalid payloads produce clear error messages
- [ ] AC5: Test suite runs in under 60 seconds
- [ ] AC6: `pnpm test && pnpm lint && pnpm typecheck` passes

---

## Definition of Done

- [ ] Protocol regression test file created
- [ ] All 6 test categories pass
- [ ] All quality gates pass locally
