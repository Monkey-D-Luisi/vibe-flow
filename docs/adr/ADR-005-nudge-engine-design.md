# ADR-005: Agent Nudge Engine Design

**ID:** ADR-005-nudge-engine-design
**Status:** Accepted  
**Date:** 2026-03-22  
**Task:** 01KMAMM7PBEE3A0PZXE7FK1CNH  

## Context

The autonomous agent team sometimes stalls — agents idle without picking up work, pipeline tasks go stale, and there's no way to "kick" agents into action without manually inspecting state. We need a nudge/wake-up mechanism that can be triggered manually (via tool or Telegram) and could later support scheduled execution.

## Decision

Implement a **nudge-engine** module inside `extensions/product-team` that:

1. **Centralizes nudge logic** behind a single `executeNudge(options)` function (Command Pattern), decoupling triggers from execution.
2. **Supports three scopes**: `all` (round-robin all agents), `blocked` (only stale tasks), `active` (only agents with assigned work).
3. **Dispatches via existing `team.message`** — no new messaging infrastructure needed.
4. **Detects blocked tasks** by comparing pipeline stage timestamps against a configurable stale threshold (default 30 min).
5. **Proposes actions** for blocked tasks: `retry` (if retries < max), `escalate` (if exceeded), `skip` (for non-critical stages).
6. **Emits events** to `event_log` for observability.
7. **Exposes an MCP tool** (`agent.nudge`) and a **Telegram command** (`/nudge`, alias `/move`).

### Why not a standalone extension?

The nudge engine needs deep access to task repo, pipeline metadata, team messaging, and agent config — all already wired into `product-team`. A separate extension would duplicate deps and add coupling overhead. Keeping it in `product-team` as a new module is simpler and more cohesive.

### Why team.message instead of sessions_send?

`team.message` is the established inter-agent communication channel with persistence, priority, and audit trail. `sessions_send` is a lower-level primitive for session-to-session IPC. Using `team.message` keeps nudges visible in agent inboxes and auditable.

## Consequences

- **Positive:** Single entry point for all nudge triggers; agents get actionable messages; blocked tasks get surfaced automatically.
- **Negative:** Nudge messages add noise to agent inboxes if threshold is too aggressive. Mitigated by `dryRun` mode and configurable thresholds.
- **Risk:** Scheduled nudges (future) could overwhelm agents. Will need rate limiting when scheduled trigger is added.

## Alternatives Considered

1. **Heartbeat-only approach** — rely on HEARTBEAT.md polling. Rejected: too passive, no blocked-task detection.
2. **Separate nudge extension** — rejected: too much dep duplication with product-team.
3. **Direct session spawning per agent** — rejected: expensive, team.message is sufficient for status requests.
