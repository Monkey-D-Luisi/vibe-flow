# EP06 -- Hardening

| Field       | Value                                            |
|-------------|--------------------------------------------------|
| Epic        | EP06                                             |
| Status      | PENDING                                          |
| Priority    | P2                                               |
| Phase       | 5 -- Hardening                                   |
| Target      | August 2026                                      |
| Depends on  | EP03, EP04                                       |
| Blocks      | None                                             |

## Goal

Production readiness with security hardening, cost controls, concurrency
safeguards, and comprehensive documentation.

## Context

> **Decided 2026-02-24:** Cost tracking covers LLM tokens + agent wall-clock time.
> Secrets management is scoped to DB path validation and metadata/log scrubbing
> (GitHub auth is via pre-configured `gh` CLI).

Before the product-team system can be used in production, it needs hardening
across security, cost, and operational dimensions. This epic addresses the
non-functional requirements that make the system safe and sustainable.

## Tasks

### 6.1 Tool allow-lists audit

- Create `scripts/validate-allowlists.ts` that:
  1. Loads `openclaw.json`
  2. Instantiates the plugin to get the set of registered tool names
  3. For each agent, verifies every tool in `tools.allow` is registered
  4. Exits non-zero on any mismatch
- Add CI step: `pnpm tsx scripts/validate-allowlists.ts`
- Document rationale for each agent's allowed tools in `openclaw.json` (comments or separate doc)

**Acceptance Criteria:**
- Every allow-list entry has a documented justification
- No agent has access to tools outside its role
- CI fails if an unknown tool is referenced in allow-lists

### 6.2 Cost tracking and limits

- **LLM tokens:** New event type `cost.llm` with `input_tokens`, `output_tokens`, `model`
- **Wall-clock time:** New event type `cost.tool` with `duration_ms`, `toolName`
- Wrap each tool's `execute()` with `withCostTracking()` helper that measures duration
- Add `costSummary` field to `task.get` response (aggregated from cost events)
- Per-task budget via `task.metadata.budget = { maxTokens?, maxDurationMs? }`
- Budget exceeded emits warning event (soft limit, does not hard-block)

**Acceptance Criteria:**
- Token usage recorded in event log per operation
- Budget limits enforced before LLM calls
- Cost report available per task and per agent

### 6.3 Secrets management

> **Scope:** DB path validation + metadata/log scrubbing. No external vault needed.

- Create `src/security/secret-detector.ts` with regex patterns for common secrets
  (GitHub tokens, API keys, private keys, base64-encoded secrets)
- Integrate into `task.create` and `task.update`: reject metadata containing secret-like values
- Integrate into structured logging: sanitize output before logging
- Audit: verify `resolvedPath` workspace containment check in `src/index.ts` (already done)
- Document all required environment variables in runbook

**Acceptance Criteria:**
- No secrets in SQLite database
- No secrets in log output
- Environment variable documentation complete

### 6.4 Concurrency limits

- Add `countByAgent(agentId)` to `SqliteLeaseRepository` (counts unexpired leases)
- Add `LeaseCapacityError` to `src/domain/errors.ts`
- Enforce per-agent limit (configurable, default: 3) in `LeaseManager.acquire()`
- Enforce total limit (default: 10) across all agents
- Queue excess tasks in `backlog` status (informational; limit just prevents acquire)
- Lease expiration already prevents deadlocks (existing feature)

**Acceptance Criteria:**
- Concurrency limits configurable per agent
- Excess tasks queued gracefully
- No deadlock scenarios in stress tests

### 6.5 Runbook and documentation

- `docs/runbook.md`: prerequisites, installation, config, troubleshooting, recovery
- `docs/api-reference.md`: every tool with params, returns, agent, example JSON
- Architecture overview with component diagram (Mermaid) in README.md

## Out of Scope

- Performance optimization (future epic)
- Multi-repo support (future epic)
- External secret vaults (AWS SSM, HashiCorp Vault)
- Rate limiting against GitHub API (handled by `gh` CLI natively)

## Task Spec

Full implementation spec with pseudocode, regex patterns, test plan, and step-by-step
breakdown: [`docs/tasks/0007-hardening.md`](../tasks/0007-hardening.md)

## References

- [Roadmap](../roadmap.md)
- [EP03 -- Role Execution](EP03-role-execution.md)
- [EP04 -- GitHub Integration](EP04-github-integration.md)
