# Product-Team Plugin — Architecture Reference

> Permanent reference document for developers, onboarding, and future maintainers.
> Covers the `extensions/product-team` plugin: how it boots, what it exposes, and how it orchestrates a 10-agent team over Telegram.

---

## 1. Overview

The **product-team** plugin is an OpenClaw gateway plugin that turns a set of 10 AI agents into a structured software-delivery team. It registers with the gateway at startup, injects 31 custom tools into every agent session, and coordinates the full task lifecycle from triage to release.

### Plugin manifest

Located at `extensions/product-team/openclaw.plugin.json`. The manifest declares:

- **`id`**: `product-team` — matches the key in `openclaw.docker.json > plugins.entries`
- **`tools`**: all 31 tool names that the plugin registers
- **`hooks`**: `after_tool_call` (auto-spawn, delivery policy)
- **`configSchema`**: JSON Schema for the plugin config block (validated by the SDK at load time — any undeclared key causes a config rejection)

### Boot sequence

```
Gateway starts
  → SDK loads openclaw.docker.json
  → SDK validates plugin config against configSchema
  → SDK calls plugin entrypoint (index.ts)
  → Plugin registers 31 tools via api.tool(name, schema, handler)
  → Plugin registers after_tool_call hooks (auto-spawn, delivery)
  → Plugin opens SQLite database, runs pending migrations
  → Plugin starts monitoring cron (heartbeat, CI poll)
  → Gateway starts Telegram polling for each named account (pm, tl, designer)
```

### The 10 agents

| ID          | Role                     | Model (primary)              | Delivery mode |
|-------------|--------------------------|------------------------------|---------------|
| `pm`        | Product Manager          | openai-codex/gpt-5.2         | broadcast     |
| `tech-lead` | Tech Lead                | anthropic/claude-opus-4-6    | smart         |
| `po`        | Product Owner            | github-copilot/gpt-4.1       | smart         |
| `designer`  | UI/UX Designer           | github-copilot/gpt-4o        | internal      |
| `back-1`    | Senior Backend Dev       | anthropic/claude-sonnet-4-6  | internal      |
| `back-2`    | Junior Backend Dev       | anthropic/claude-sonnet-4-6  | internal      |
| `front-1`   | Senior Frontend Dev      | anthropic/claude-sonnet-4-6  | internal      |
| `front-2`   | Junior Frontend Dev      | anthropic/claude-sonnet-4-6  | internal      |
| `qa`        | QA Engineer              | anthropic/claude-sonnet-4-6  | smart         |
| `devops`    | DevOps Engineer          | anthropic/claude-sonnet-4-6  | smart         |

---

## 2. Tool Inventory

31 tools grouped by domain. Tool names use underscores (dots rewritten at registration).

### Task management (6)

| Tool             | Purpose                                           |
|------------------|---------------------------------------------------|
| `task_create`    | Create a task record (returns assigned ID)        |
| `task_get`       | Fetch a task by ID                                |
| `task_search`    | Search tasks by status, assignee, tags            |
| `task_update`    | Update mutable task fields (title, body, etc.)    |
| `task_transition`| Transition a task through the workflow FSM        |
| `workflow_events_query` | Query the event audit log for a task       |

### Workflow state (2)

| Tool                  | Purpose                                      |
|-----------------------|----------------------------------------------|
| `workflow_step_run`   | Run a defined workflow step for the task     |
| `workflow_state_get`  | Get current FSM state and available transitions |

### Quality (5)

| Tool                | Purpose                                          |
|---------------------|--------------------------------------------------|
| `quality_tests`     | Run test suite (task-lifecycle-aware, writes .qreport) |
| `quality_coverage`  | Parse coverage JSON and evaluate thresholds      |
| `quality_lint`      | Run linter and report violations                 |
| `quality_complexity`| Measure cyclomatic complexity (AST-based)        |
| `quality_gate`      | Evaluate composite quality gate policy           |

### VCS / GitHub (4)

| Tool              | Purpose                                            |
|-------------------|----------------------------------------------------|
| `vcs_branch_create` | Create a VCS branch via GitHub API              |
| `vcs_pr_create`   | Create a pull request                              |
| `vcs_pr_update`   | Update title, body, labels on an existing PR       |
| `vcs_label_sync`  | Sync PR labels from task metadata                  |

### Messaging / team (5)

| Tool           | Purpose                                               |
|----------------|-------------------------------------------------------|
| `team_message` | Post a message to another agent's inbox               |
| `team_inbox`   | Read messages in an agent's inbox                     |
| `team_reply`   | Reply to a team message                               |
| `team_status`  | Update this agent's status                            |
| `team_assign`  | Assign work to a specific agent                       |

### Decision engine (2)

| Tool               | Purpose                                           |
|--------------------|---------------------------------------------------|
| `decision_evaluate`| Evaluate a decision (auto/escalate/pause/retry)   |
| `decision_log`     | Record a decision for audit                        |

### Pipeline (3)

| Tool               | Purpose                                           |
|--------------------|---------------------------------------------------|
| `pipeline_start`   | Start a CI/CD pipeline                            |
| `pipeline_status`  | Get pipeline status and step results              |
| `pipeline_retry`   | Retry a failed pipeline step                      |
| `pipeline_skip`    | Skip a pipeline step with justification           |

### Project (2)

| Tool               | Purpose                                           |
|--------------------|---------------------------------------------------|
| `project_list`     | List registered projects                          |
| `project_switch`   | Change the active project context                 |
| `project_register` | Register a new project workspace                  |

> Note: `project_register` is registered as a tool but is a management-only operation not exposed to most agents.

---

## 3. Orchestrator & State Machine

### Task lifecycle FSM

```
                         ┌──── skipDesignForNonUITasks ────┐
                         │                                  ▼
  OPEN ──► REFINEMENT ──►DESIGN──► IMPLEMENTATION ──► QA ──► REVIEW ──► DONE
                                         ▲             │       │          ▲
                                         │  (regression)│  (rework)       │
                                         └──────────────┘       │    SHIPPING
                                                                 └────► QA     │
                                                                              ─┘

  * (any status) ──► BLOCKED      BLOCKED ──► (previous status)
  * (any status) ──► CANCELLED
```

Valid transitions summary:

| From          | To (allowed)                                    |
|---------------|-------------------------------------------------|
| OPEN          | REFINEMENT                                      |
| REFINEMENT    | DESIGN, IMPLEMENTATION                          |
| DESIGN        | IMPLEMENTATION                                  |
| IMPLEMENTATION| QA                                              |
| QA            | REVIEW, IMPLEMENTATION (regression)             |
| REVIEW        | SHIPPING, DONE, QA (rework)                     |
| SHIPPING      | DONE                                            |
| any           | BLOCKED, CANCELLED                              |
| BLOCKED       | previous status                                 |

### Transition guards

Guards are evaluated by `task_transition` before the FSM moves. The checks:

| Guard                 | Condition                                      |
|-----------------------|------------------------------------------------|
| Coverage (major)      | `linePct >= coverageMajor` (default 80%)       |
| Coverage (minor)      | `linePct >= coverageMinor` (default 70%)       |
| Max review rounds     | `reviewRounds <= maxReviewRounds` (default 3)  |
| QA approval           | QA step must be marked completed               |

Guard thresholds come from `workflow.transitionGuards` in the plugin config, with per-project overrides possible via `projects[].quality`.

### Lease manager

Controls agent concurrency. Settings live in `workflow.concurrency`:

- `maxLeasesPerAgent` (default 3) — max concurrent tasks per agent
- `maxTotalLeases` (default 10) — global cap across all agents

`task_transition` acquires a lease on move to `IMPLEMENTATION`; releases on `DONE` / `CANCELLED`.

### Step runner (`workflow_step_run`)

Executes a named step within the current state. Steps are declared in the agent's skill files and can call any tool in the agent's allow-list. The step runner records start/end events in the event log for full auditability.

---

## 4. Persistence Layer

The plugin uses **SQLite** via `better-sqlite3` with a 2-migration schema managed at startup.

### Database location

Configured via `dbPath` in the plugin config block (e.g. `/app/data/product-team.db`). Must be writable at gateway startup.

### Database tables

The actual tables (verified from the live container):

```sql
-- Core task records
task_records      id, title, status, scope, assignee, tags, metadata,
                  created_at, updated_at, rev (optimistic lock counter)

-- Append-only workflow event log
event_log         id, task_id, event_type, agent_id, payload, created_at

-- Agent concurrency leases
leases            (agent_id, task_id, acquired_at)

-- Decision records (scope/quality/conflict/budget/blocker)
agent_decisions   id, task_id, type, question, action, status,
                  escalated_to, resolved_at, payload, created_at

-- Team inbox/outbox with full origin context
agent_messages    id, from_agent, to_agent, subject, body, priority,
                  reply_to, status, origin_channel, origin_session_key,
                  created_at, read_at

-- Orchestrator FSM tracking per task
orchestrator_state  task_id, stage, step, retries, metadata

-- VCS idempotency cache
ext_requests      id, type, dedup_key, status, response_payload, created_at
```

### Repositories

| Repository              | Table              | Manages                              |
|-------------------------|--------------------|--------------------------------------|
| `TaskRepository`        | `task_records`     | CRUD + status transitions            |
| `EventRepository`       | `event_log`        | Append-only event log                |
| `LeaseRepository`       | `leases`           | Agent concurrency leases             |
| `DecisionRepository`    | `agent_decisions`  | Decision records                     |
| `MessageRepository`     | `agent_messages`   | Team inbox/outbox                    |
| `OrchestratorRepository`| `orchestrator_state`| FSM stage tracking per task         |

All mutations use **optimistic locking** on `rev` (integer counter). Concurrent writes return a `409 Conflict` rather than silently overwriting.

---

## 5. Hook System

The plugin registers three `after_tool_call` hooks. All hooks are wrapped with try/catch so a failing hook never kills the parent agent turn.

### Origin-injection hook

Injected in the message store layer (not as an SDK hook). When `team_message` stores a message to the DB, it captures the current `originChannel` and `originSessionKey` from the tool call context. This is what enables later delivery routing — the origin is preserved in the `agent_messages` table and returned in tool results so the auto-spawn hooks can read it without needing `ctx.sessionKey` (which the SDK passes as `undefined` in `after_tool_call`).

### Auto-spawn hook — `handleTeamMessageAutoSpawn`

Fires after every `team_message` call that returned `delivered: true`.

1. Reads `toAgent`, `messageId`, `originChannel`, `originSessionKey` from the result
2. Deduplicates via a 10-second in-memory TTL cache (the SDK fires `after_tool_call` from multiple code paths)
3. Validates `toAgent` exists in the team config
4. Calls `shouldDeliver()` with the sender agent's delivery policy
5. If delivery approved: builds `AgentSpawnOptions` (channel, sessionKey, accountId, to)
6. Calls `agentRunner.spawnAgent()` — in production, this fires `fireAgentViaGatewayWs()`

### Auto-spawn hook — `handleTeamReplyAutoSpawn`

Fires after every `team_reply` call that returned `replied: true`.

Same flow as the message hook, but replies **always route back to the origin channel** regardless of the sender's delivery mode. Policy applies only to new outbound messages.

### Auto-spawn hook — `handleDecisionEscalationAutoSpawn`

Fires after `decision_evaluate` when `escalated: true` is returned.

If the approver is a non-human agent with a `nextAction.agentId`, fires `agentRunner.spawnAgent()` for that agent. No delivery routing — escalation runs the approver in the background context.

---

## 6. Delivery & Multi-Bot Routing

End-to-end flow from a user message to a spawned agent responding via the correct bot.

```
Telegram Group (user @-mentions @AiTeam_ProductManager_bot)
│
▼
Grammy Bot [pm account] ──► SDK gateway ──► session: agent:pm:telegram:group:<chatId>
                                                │
                                                ▼
                                        PM agent turn
                                                │
                                                └─► team_message({ to:"tech-lead", priority:"urgent" })
                                                           │
                                                           ├─ DB: INSERT agent_messages
                                                           │      origin_channel = "telegram"
                                                           │      origin_session_key = "agent:pm:telegram:group:<chatId>"
                                                           │
                                                           └─ returns { delivered:true, originChannel, originSessionKey }
                                                                     │
                                                           after_tool_call hook fires
                                                                     │
                                                  ┌──────────────────▼──────────────────┐
                                                  │  handleTeamMessageAutoSpawn          │
                                                  │  shouldDeliver("pm") → deliver:true  │
                                                  │  agentAccounts["tech-lead"] → "tl"   │
                                                  │  rebuildSessionKey → "agent:tech-lead│
                                                  │                    :telegram:group:  │
                                                  │                    <chatId>"         │
                                                  │  extractChatId → "<chatId>"          │
                                                  └──────────────────┬──────────────────┘
                                                                     │
                                                          fireAgentViaGatewayWs(
                                                              "tech-lead", message,
                                                              { deliver:true,
                                                                channel:"telegram",
                                                                accountId:"tl",
                                                                sessionKey, to }
                                                          )
                                                                     │
                                                           detached Node subprocess
                                                           raw WS → gateway :28789
                                                                     │
                                                                     ▼
                                                  session: agent:tech-lead:telegram:group:<chatId>
                                                  (loads tech-lead's tools+skills)
                                                                     │
                                                                     ▼
                                                          Tech Lead agent turn
                                                                     │
                                                                     ▼
                                                  Grammy Bot [tl account]
                                                  → message sent as @AiTeam_TechLead_bot
```

### Delivery mode matrix

| Mode           | When to deliver                                      |
|----------------|------------------------------------------------------|
| `broadcast`    | Always (every team_message triggers delivery)        |
| `internal`     | Never                                                |
| `smart`        | If priority is in `broadcastPriorities` OR subject contains a `broadcastKeywords` match |
| `replies-only` | Only if the message is a `team_reply`                |

Default `broadcastKeywords`: decision, escalation, blocker, review, approval, deploy, release, rollback, incident, hotfix (+ Spanish equivalents).

---

## 7. Telechan Architecture

### Multi-account channel config

All three bots share a single `channels.telegram` config block. The SDK creates one `Bot` (Grammy) instance per named account in `accounts`:

```
channels.telegram.accounts
┌────────────────┬─────────────────┬─────────────────────┐
│   "pm"         │   "tl"          │   "designer"         │
│ BOT_TOKEN_PM   │ BOT_TOKEN_TL    │ BOT_TOKEN_DESIGNER   │
└───────┬────────┴────────┬────────┴──────────┬───────────┘
        │                 │                   │
  Grammy Bot         Grammy Bot          Grammy Bot
  (long poll)        (long poll)         (long poll)
  @PM_bot            @TL_bot             @Designer_bot
        │                 │                   │
  inbound              inbound            inbound
  accountId:"pm"       accountId:"tl"     accountId:"designer"
        │                 │                   │
  ┌─────▼─────┐     ┌─────▼──────┐     ┌──────▼────────┐
  │ pm, po,   │     │ tech-lead  │     │ designer      │
  │ back-1/2, │     └────────────┘     └───────────────┘
  │ front-1/2,│
  │ qa,devops │
  └───────────┘
```

JSON representation:

```json
"channels": {
  "telegram": {
    "enabled": true,
    "botToken": "${TELEGRAM_BOT_TOKEN_PM}",
    "accounts": {
      "pm":       { "botToken": "${TELEGRAM_BOT_TOKEN_PM}" },
      "tl":       { "botToken": "${TELEGRAM_BOT_TOKEN_TL}" },
      "designer": { "botToken": "${TELEGRAM_BOT_TOKEN_DESIGNER}" }
    }
  }
}
```

> The root-level `botToken` is a fallback config value only. Polling providers are created exclusively for named `accounts` entries. All three accounts must be listed explicitly.

### Bot-to-account mapping

| Account    | Env var                    | Telegram bot               | Bound agents                              |
|------------|----------------------------|----------------------------|-------------------------------------------|
| `pm`       | `TELEGRAM_BOT_TOKEN_PM`    | @AiTeam_ProductManager_bot | pm, po, back-1, back-2, front-1, front-2, qa, devops |
| `tl`       | `TELEGRAM_BOT_TOKEN_TL`    | @AiTeam_TechLead_bot       | tech-lead                                 |
| `designer` | `TELEGRAM_BOT_TOKEN_DESIGNER` | @AiTeam_Designer_bot    | designer                                  |

### Agent bindings

`bindings` use `match.accountId` to scope inbound messages to the correct agent:

```json
{ "agentId": "pm",        "match": { "channel": "telegram", "accountId": "pm" } },
{ "agentId": "tech-lead", "match": { "channel": "telegram", "accountId": "tl" } },
{ "agentId": "designer",  "match": { "channel": "telegram", "accountId": "designer" } }
```

All other agents (po, back-1, etc.) also use `accountId: "pm"` — they share the PM bot for inbound but get their own session keys.

### Group configuration

The SDK requires an explicit `groups` entry for each group chat ID. Without it, the SDK's `requireMention` gate fires silently and drops all group messages:

```json
"groups": {
  "-5177552677": { "enabled": true, "requireMention": true }
}
```

`requireMention: true` means the bot must be @-mentioned in the group for a message to be processed. Set to `false` to process all messages.

### Session key format

All sessions use the same channel name regardless of account:

```
agent:<agentId>:telegram:(group|dm):<chatId>
```

Account routing is a separate dimension: `DeliveryContext.accountId` tells the gateway which bot token to use for outbound messages.

### agentAccounts delivery map

```json
"delivery": {
  "agentAccounts": {
    "tech-lead": "tl",
    "designer":  "designer"
  }
}
```

Agents absent from this map default to the `pm` account. This map is read by `handleTeamMessageAutoSpawn` and `handleTeamReplyAutoSpawn` to set `accountId` in the WS spawn params.

---

## 8. Quality Pipeline

The quality pipeline is a chain of 5 tools that feed into the orchestrator's transition guards.

### Chain

```
quality_tests
    → writes artifacts/coverage/lcov-report/
quality_coverage
    → reads coverage JSON, evaluates thresholds, writes .qreport/coverage.json
quality_lint
    → runs ESLint, writes .qreport/lint.json
quality_complexity
    → AST-based cyclomatic analysis, writes .qreport/complexity.json
quality_gate
    → reads .qreport/*.json, evaluates composite policy, returns PASS/FAIL
```

### Thresholds (task-lifecycle-aware)

The tools read the active task's `scope` field to pick the right threshold:

| Scope   | Coverage threshold | Complexity cap (avg) |
|---------|--------------------|----------------------|
| `major` | 80% lines          | 5.0                  |
| `minor` | 70% lines          | 5.0                  |
| `patch` | 70% lines          | 5.0                  |

### Feeding transition guards

When an agent calls `task_transition` to move to `REVIEW`, the FSM evaluates:

1. Is there a `quality_gate` event in the workflow log for this task?
2. Did it return `PASS`?
3. Does `linePct` in the gate result meet the task's scope threshold?

If any check fails, the transition is rejected and the agent is instructed to run the quality pipeline again.

### CI integration

`quality-gate.yml` mirrors the same pipeline in CI:

1. `pnpm q:tests` → runs all tests, writes qreport artifacts
2. `pnpm --filter @openclaw/quality-gate test:coverage || true` → coverage for quality-gate package
3. `pnpm --filter @openclaw/product-team test:coverage || true` → coverage for product-team package
4. `pnpm q:coverage` → parses coverage artifacts
5. `pnpm q:lint` → lint gate
6. `pnpm q:complexity` → complexity gate
7. Report posted as a PR comment via `gh api`
8. Gate verdict exits non-zero if tests or lint fail

---

## 9. Live Session: Real Conversations from the Database

The records below are queried directly from the live Docker container's SQLite database. They show the plugin operating in production — real agent messages, real escalations, and real tasks created autonomously.

```bash
docker exec openclaw-product-team node -e "
  const db = require('better-sqlite3')('/app/data/product-team.db', { readonly: true });
  const msgs = db.prepare('SELECT * FROM agent_messages ORDER BY created_at').all();
  console.log(JSON.stringify(msgs, null, 2));
"
```

---

### Example 1 — Architecture decision: NestJS vs alternatives

*2026-03-04 11:50 UTC — group chat -5177552677*

**From DB (`agent_messages` table):**

```
from_agent   : pm
to_agent     : tech-lead
subject      : Decisión framework backend
body         : Luis pide decisión sobre approach de framework para el backend.
               ¿Opciones (NestJS vs Fastify/Express minimal vs Adonis vs Spring/.NET
               según stack), criterios (DX, testing, modularidad, perf, observabilidad,
               DI), y una recomendación para backend típico de APIs en Node/TS?
origin_channel       : telegram
origin_session_key   : agent:pm:telegram:group:-5177552677
created_at           : 2026-03-04T11:50:49.072Z
```

**TL response (36 seconds later):**

```
from_agent   : tech-lead
to_agent     : pm
subject      : Re: Decisión framework backend
body         : Decisión formalizada (ID: 01KJWB0861N1ESKEJFHS1NQQ8X). Recomendación:
               **NestJS**.

               **Opciones evaluadas:**
               1. NestJS ✅ — DI nativo, modularidad, guards/interceptors/pipes,
                  OpenAPI auto, testing excelente, estándar enterprise en Node/TS
               2. Fastify + custom stack — mejor perf raw pero hay que construir toda
                  la arquitectura a mano (DI, modules, testing setup)
               ...
origin_session_key   : agent:pm:telegram:group:-5177552677
created_at           : 2026-03-04T11:51:25.733Z
```

**Routing trace:**

```
PM turn (sessionKey: agent:pm:telegram:group:-5177552677)
  └─► team_message({ to:"tech-lead", subject:"Decisión framework backend" })
        │  stored in agent_messages with origin_session_key = "agent:pm:telegram:group:-5177552677"
        ▼
  after_tool_call: handleTeamMessageAutoSpawn
  ├─ shouldDeliver("pm") → deliver:true [broadcast mode, always delivers]
  ├─ agentAccounts["tech-lead"] → "tl"
  ├─ rebuildSessionKey("agent:pm:telegram:group:-5177552677", "tech-lead")
  │    → "agent:tech-lead:telegram:group:-5177552677"
  └─► fireAgentViaGatewayWs("tech-lead", msg, { accountId:"tl", sessionKey, to:"-5177552677" })
        │
        ▼
  TL agent turn (session: agent:tech-lead:telegram:group:-5177552677)
  └─► team_reply({ ... }) → response sent via @AiTeam_TechLead_bot
  elapsed: 36 seconds
```

---

### Example 2 — Security incident escalation + autonomous task creation

*2026-03-04 17:04 UTC — same group, 16 minutes before ft-0173 commit — ft-0173 code already deployed in Docker*

**From DB (`agent_messages` table):**

```
from_agent   : pm
to_agent     : tech-lead
subject      : URGENTE: problema de seguridad crítico en módulo de auth
body         : Luis reporta un problema de seguridad CRÍTICO en el módulo de
               autenticación y necesita tu revisión urgente.
               1) confirma recepción y ownership
               2) indica mitigación inmediata (feature flag/disable endpoint/rotación
                  de secretos)
               3) qué info necesitas (repo/branch, descripción del vector, logs,
                  entorno afectado)
               4) ETA para primer assessment. Prioriza contener (bloquear vector)
                  antes del análisis completo.
origin_channel       : telegram
origin_session_key   : agent:pm:telegram:group:-5177552677
created_at           : 2026-03-04T17:04:58.236Z
```

**TL response (21 seconds later):**

```
from_agent   : tech-lead
to_agent     : pm
subject      : Re: URGENTE: problema de seguridad crítico en módulo de auth
body         : Recibido, ya tengo ownership. Estado:

               1. **Ya lancé un audit automático** del módulo de auth en vibe-flow.
                  Esperando resultados.
               2. **Mitigación inmediata:** Pendiente de que Luis confirme qué
                  vector/síntoma vio. Sin esa info, las opciones genéricas son:
                  (a) desactivar endpoints de auth públicos vía feature flag,
                  (b) rotar secretos/JWT keys,
                  (c) activar rate limiting agresivo.
               3. **Info que necesito:** repo branch afectado, descripción del vector
                  (XSS/CSRF/injection/bypass/exposure?), logs del error y entorno
                  (prod/staging).
origin_session_key   : agent:pm:telegram:group:-5177552677
created_at           : 2026-03-04T17:05:19.532Z
```

**Task created autonomously by TL (6 seconds after response):**

```sql
-- From task_records table
id         : 01KJWWZFKZ5G5VJGVWFYKWZSC5
title      : Auth Security Audit - workspace exploration
status     : backlog
scope      : patch
assignee   : null
created_at : 2026-03-04T17:05:25.631Z
```

**Complete sequence timeline:**

```
17:04:58  User → group: "@PM reporta CRÍTICO en módulo de auth"
17:04:58  @AiTeam_ProductManager_bot (PM) responds in group
17:04:58  PM calls team_message({ to:"tech-lead", subject:"URGENTE: ...", priority:"urgent" })
17:04:58  ┌── after_tool_call hook fires immediately ──────────────────────────────┐
          │  shouldDeliver("pm") → deliver:true (broadcast mode, always on)        │
          │  agentAccounts["tech-lead"] → account "tl"                             │
          │  sessionKey → "agent:tech-lead:telegram:group:-5177552677"             │
          │  fireAgentViaGatewayWs("tech-lead", ..., { accountId:"tl" })           │
          └────────────────────────────────────────────────────────────────────────┘
17:05:19  @AiTeam_TechLead_bot appears in group: "Recibido, ya tengo ownership..."
17:05:25  TL calls task_create({ title:"Auth Security Audit...", scope:"patch" })
          → task_records: 01KJWWZFKZ5G5VJGVWFYKWZSC5 created
```

**Proof of per-persona identity:** the TL's response at 17:05:19 was sent via `accountId:"tl"` (TELEGRAM_BOT_TOKEN_TL), appearing in the Telegram group as `@AiTeam_TechLead_bot` — not as `@AiTeam_ProductManager_bot`. The PM and TL bots are visually distinct in the conversation.

---

## 10. Configuration Reference

Complete reference for the `product-team` plugin config block in `openclaw.docker.json > plugins.entries.product-team.config`.

### Top-level fields

| Field           | Type     | Default       | Description                              |
|-----------------|----------|---------------|------------------------------------------|
| `dbPath`        | string   | required      | Absolute path to the SQLite database     |
| `activeProject` | string   | first project | ID of the currently active project       |

### `github`

| Field                          | Type    | Default             | Description                         |
|--------------------------------|---------|---------------------|-------------------------------------|
| `owner`                        | string  | `"local-owner"`     | GitHub org/user                     |
| `repo`                         | string  | `"local-repo"`      | Repository name                     |
| `defaultBase`                  | string  | `"main"`            | Default base branch for PRs         |
| `timeoutMs`                    | number  | `30000`             | GitHub API timeout                  |
| `prBot.enabled`                | boolean | `true`              | Enable PR bot features              |
| `prBot.reviewers.default`      | string[]| `[]`                | Default reviewers for all PRs       |
| `ciFeedback.enabled`           | boolean | `false`             | Enable GitHub CI webhook            |
| `ciFeedback.routePath`         | string  | `"/webhooks/github/ci"` | Webhook route path             |
| `ciFeedback.webhookSecret`     | string  | `""`                | Required when `enabled: true`       |
| `ciFeedback.commentOnPr`       | boolean | `true`              | Post CI result as PR comment        |
| `ciFeedback.autoTransition.enabled` | boolean | `false`        | Auto-transition task on CI result   |
| `ciFeedback.autoTransition.toStatus` | string | `null`         | Target task status on CI pass       |

### `workflow`

| Field                               | Type   | Default | Description                        |
|-------------------------------------|--------|---------|------------------------------------|
| `transitionGuards.coverage.major`   | number | `80`    | Min line coverage % for major tasks|
| `transitionGuards.coverage.minor`   | number | `70`    | Min line coverage % for minor tasks|
| `transitionGuards.maxReviewRounds`  | number | `3`     | Max review cycles before escalation|
| `concurrency.maxLeasesPerAgent`     | number | `3`     | Max concurrent tasks per agent     |
| `concurrency.maxTotalLeases`        | number | `10`    | Global max concurrent tasks        |

### `projects[]`

| Field             | Type    | Required | Description                             |
|-------------------|---------|----------|-----------------------------------------|
| `id`              | string  | yes      | Project identifier                      |
| `name`            | string  | yes      | Display name                            |
| `repo`            | string  | yes      | `owner/repo` format                     |
| `workspace`       | string  | yes      | Absolute path to workspace on disk      |
| `defaultBranch`   | string  | no       | Default branch (default: `"main"`)      |
| `stitch.projectId`| string\|null | no  | Google Stitch project ID                |
| `quality.coverageMajor` | number | no | Per-project major coverage override  |
| `quality.coverageMinor` | number | no | Per-project minor coverage override  |
| `quality.maxComplexity` | number | no | Per-project complexity cap          |

### `delivery`

| Field                          | Type           | Default    | Description                                  |
|--------------------------------|----------------|------------|----------------------------------------------|
| `default.mode`                 | DeliveryMode   | `"smart"`  | Default delivery mode for all agents         |
| `default.broadcastKeywords`    | string[]       | (16 terms) | Keywords that trigger smart delivery         |
| `default.broadcastPriorities`  | string[]       | `["urgent"]` | Priorities that always deliver             |
| `agents.<id>.mode`             | DeliveryMode   | defaultMode| Per-agent delivery mode override             |
| `agentAccounts.<id>`           | string         | —          | Maps agentId to Telegram account name        |

**DeliveryMode values:** `broadcast` | `internal` | `smart` | `replies-only`

### `decisions`

| Field                              | Type   | Default     | Description                             |
|------------------------------------|--------|-------------|-----------------------------------------|
| `policies.<type>.action`           | string | —           | `auto`, `escalate`, `pause`, `retry`    |
| `policies.<type>.target`           | string | —           | Agent ID to escalate to                 |
| `policies.<type>.notify`           | boolean| —           | Whether to send Telegram notification   |
| `policies.blocker.maxRetries`      | number | —           | Max retries before converting to pause  |
| `timeoutMs`                        | number | `300000`    | Decision resolution timeout             |
| `humanApprovalTimeout`             | number | `3600000`   | Human approval timeout (1 hour)         |

### `orchestrator`

| Field                        | Type    | Default   | Description                                   |
|------------------------------|---------|-----------|-----------------------------------------------|
| `maxParallelTasks`           | number  | `5`       | Max tasks running in parallel                 |
| `maxRetriesPerStage`         | number  | `1`       | Max retries per FSM stage before escalation   |
| `autoEscalateAfterRetries`   | boolean | `true`    | Auto-escalate after max retries               |
| `notifyTelegramOnStageChange`| boolean | `true`    | Post Telegram notification on stage transition|
| `skipDesignForNonUITasks`    | boolean | `true`    | Skip the DESIGN stage for non-UI tasks        |
| `stageTimeouts.<STAGE>`      | number  | varies    | Per-stage timeout in milliseconds             |
