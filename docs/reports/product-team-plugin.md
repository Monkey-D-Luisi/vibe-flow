# Product-Team Plugin — Architecture Reference

> Permanent reference document for developers, onboarding, and future maintainers.
> Covers the `extensions/product-team` plugin: how it boots, what it exposes, and how it orchestrates an 8-agent team over Telegram.

---

## 1. Overview

The **product-team** plugin is an OpenClaw gateway plugin that turns a set of 8 AI agents into a structured software-delivery team. It registers with the gateway at startup, injects 31 custom tools into every agent session, and coordinates the full task lifecycle from triage to release.

### Plugin manifest

Located at `extensions/product-team/openclaw.plugin.json`. The manifest declares:

- **`id`**: `product-team` — matches the key in `openclaw.docker.json > plugins.entries`
- **`skills`**: paths to all 14 skill directories
- **`configSchema`**: JSON Schema for the plugin config block (validated by the SDK at load time — any undeclared key causes a config rejection)

Tools and hooks are registered programmatically in `index.ts` via `api.registerTool()` and `api.on()`, not declared in the manifest.

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

### The 8 agents

| ID          | Role                     | Model (primary)              | Delivery mode |
|-------------|--------------------------|------------------------------|---------------|
| `pm`        | Product Manager          | openai-codex/gpt-5.2         | broadcast     |
| `tech-lead` | Tech Lead                | anthropic/claude-opus-4-6    | smart         |
| `po`        | Product Owner            | github-copilot/gpt-4.1       | smart         |
| `designer`  | UI/UX Designer           | github-copilot/gpt-4o        | internal      |
| `back-1`    | Backend Developer        | anthropic/claude-sonnet-4-6  | internal      |
| `front-1`   | Frontend Developer       | anthropic/claude-sonnet-4-6  | internal      |
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

### Pipeline (4)

| Tool               | Purpose                                           |
|--------------------|---------------------------------------------------|
| `pipeline_start`   | Start a CI/CD pipeline                            |
| `pipeline_status`  | Get pipeline status and step results              |
| `pipeline_retry`   | Retry a failed pipeline step                      |
| `pipeline_skip`    | Skip a pipeline step with justification           |

### Project (3)

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
                        ┌──── fast-track (minor scope) ───┐
                        │                                  ▼
  backlog ──► grooming ──► design ──► in_progress ──► in_review ──► qa ──► done
                                          ▲               │          │
                                          │  (rejection)  │  (failure)│
                                          └───────────────┘          │
                                          ▲                          │
                                          └──────────────────────────┘
```

Valid transitions summary:

| From          | To (allowed)                                    |
|---------------|-------------------------------------------------|
| backlog       | grooming                                        |
| grooming      | design, in_progress (fast-track)                |
| design        | in_progress                                     |
| in_progress   | in_review                                       |
| in_review     | qa, in_progress (rejection)                     |
| qa            | done, in_progress (failure)                     |
| done          | (terminal)                                      |

### Transition guards

Guards are evaluated by `task_transition` before the FSM moves. The checks:

| Guard                             | Transition              | Condition                                                  |
|-----------------------------------|-------------------------|------------------------------------------------------------|
| Architecture plan completeness    | design → in_progress    | `architecture_plan.adr_id` non-empty; `contracts` non-empty|
| Coverage + lint + TDD log         | in_progress → in_review | `coverage >= scope threshold`; `lint_clean`; `≥ 2 TDD log entries` |
| Review violations + round cap     | in_review → qa          | No high/critical violations; `rounds_review < maxReviewRounds` |
| QA pass                           | qa → done               | `qa_report.failed === 0`                                   |

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
-- Core task records (migration 001)
task_records      id, title, status, scope, assignee, tags, metadata,
                  created_at, updated_at, rev (optimistic lock counter)

-- Orchestrator FSM tracking per task (migration 001)
orchestrator_state  task_id, current, previous, last_agent, rounds_review,
                    rev, updated_at

-- Append-only workflow event log (migration 001)
event_log         id, task_id, event_type, agent_id, payload, created_at

-- Agent concurrency leases (migration 001)
leases            task_id, agent_id, acquired_at, expires_at

-- VCS idempotency cache (migration 002)
ext_requests      request_id, task_id, tool, payload_hash, response, created_at

-- Decision records (lazily created in decision-engine.ts)
agent_decisions   id, task_ref, agent_id, category, question, options,
                  decision, reasoning, escalated, approver, created_at

-- Team inbox/outbox (lazily created in shared-db.ts)
agent_messages    id, from_agent, to_agent, subject, body, priority,
                  task_ref, reply_to, read, origin_channel,
                  origin_session_key, created_at
```

### Repositories

| Repository                | Table              | Manages                              |
|---------------------------|--------------------|--------------------------------------|
| `SqliteTaskRepository`    | `task_records`     | CRUD + status transitions            |
| `SqliteOrchestratorRepository` | `orchestrator_state` | FSM stage tracking per task   |
| `SqliteEventRepository`   | `event_log`        | Append-only event log                |
| `SqliteLeaseRepository`   | `leases`           | Agent concurrency leases             |
| `SqliteRequestRepository` | `ext_requests`     | VCS idempotency cache                |

`agent_decisions` and `agent_messages` are managed via inline SQL in `decision-engine.ts` and `shared-db.ts` respectively — no formal repository classes.

All mutations use **optimistic locking** on `rev` (integer counter). Concurrent writes return a `409 Conflict` rather than silently overwriting.

---

## 5. Hook System

The plugin registers five hooks across two lifecycle events. All hooks are wrapped with try/catch so a failing hook never kills the parent agent turn.

| Hook                            | Lifecycle event    | Condition            |
|---------------------------------|--------------------|----------------------|
| Origin injection                | `before_tool_call` | Always               |
| Team message auto-spawn         | `after_tool_call`  | Always               |
| Team reply auto-spawn           | `after_tool_call`  | Always               |
| Decision escalation auto-spawn  | `after_tool_call`  | Always               |
| PR-Bot                          | `after_tool_call`  | `prBot.enabled` only |

### Origin-injection hook

Registered as a `before_tool_call` hook via `api.on('before_tool_call', ...)` in `index.ts`. When `team_message` stores a message to the DB, it captures the current `originChannel` and `originSessionKey` from the tool call context. This is what enables later delivery routing — the origin is preserved in the `agent_messages` table and returned in tool results so the auto-spawn hooks can read it without needing `ctx.sessionKey` (which the SDK passes as `undefined` in `after_tool_call`).

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
  │ back-1,   │     └────────────┘     └───────────────┘
  │ front-1,  │
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
| `pm`       | `TELEGRAM_BOT_TOKEN_PM`    | @AiTeam_ProductManager_bot | pm, po, back-1, front-1, qa, devops |
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

Agents absent from this map receive no explicit `accountId` in spawn params. Their routing to the PM bot is determined by the gateway `bindings` configuration, not by a plugin-level default.

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

### Example 2 — Security incident escalation + autonomous task creation (complete trace)

*2026-03-04 18:04 CET (17:04 UTC) — Telegram group -5177552677 — ft-0173 already live in Docker*

This is a verbatim trace of a real incident. The inter-agent messages (`agent_messages` table) and task/event records were queried directly from the live container's SQLite. The Telegram group messages shown below are the actual bot outputs visible to the user in the group chat.

---

**Step 1 — User writes in the Telegram group (18:04 CET)**

```
[Telegram group -5177552677]
Luis: @AiTeam_ProductManager_bot tenemos un problema de seguridad crítico en el
      módulo de auth, necesito que el tech lead lo revise urgentemente
```

The message lands in @AiTeam_ProductManager_bot's update queue (Grammy long-polling). The SDK routes it to the `pm` agent session `agent:pm:telegram:group:-5177552677`.

---

**Step 2 — PM processes: escalates internally + responds to user (18:04:58 CET, +23s)**

The PM agent performs two actions in its turn:

**2a. Internal escalation** — `team_message` tool call creates an `agent_messages` row:

```
id           : 01KJWWYMVWTX6PP1TC0VYSS2K6
from_agent   : pm
to_agent     : tech-lead
subject      : URGENTE: problema de seguridad crítico en módulo de auth
body         :
  Luis reporta un problema de seguridad CRÍTICO en el módulo de autenticación y
  necesita tu revisión urgente.

  Por favor: 1) confirma recepción y ownership, 2) indica mitigación inmediata
  (feature flag/disable endpoint/rotación de secretos), 3) qué info necesitas
  (repo/branch, descripción del vector, logs, entorno afectado), 4) ETA para
  primer assessment.

  Si es posible, prioriza contener (bloquear exploit) antes de root-cause.
origin_channel     : telegram
origin_session_key : agent:pm:telegram:group:-5177552677
created_at         : 2026-03-04T17:04:58.236Z
```

The `team_message` call triggers the `after_tool_call` hook synchronously:

```
after_tool_call hook
├─ shouldDeliver("pm") → deliver:true   [pm is broadcast — always delivers]
├─ agentAccounts["tech-lead"] → "tl"
├─ rebuildSessionKey("agent:pm:telegram:group:-5177552677", "tech-lead")
│    → "agent:tech-lead:telegram:group:-5177552677"
├─ extractChatId → "-5177552677"
└─ fireAgentViaGatewayWs("tech-lead", msg, {
       deliver:true, channel:"telegram",
       accountId:"tl", sessionKey:"agent:tech-lead:telegram:group:-5177552677"
   })  ← detached subprocess, raw WS to gateway port 28789
```

**2b. Telegram group response** — PM's turn output sent via `accountId:"pm"` → @AiTeam_ProductManager_bot posts:

```
[Telegram group — @AiTeam_ProductManager_bot]
[PM | openai-codex/gpt-5.2] Enviado al Tech Lead con prioridad urgent para que
lo revise ya mitigación y assessment.

Para acelerar: pásame aquí los detalles que puedas:
1. ¿Qué vulnerabilidad es? (tipo, vector, síntoma)
2. Entorno afectado (prod / staging / dev)
3. Enlace al repo/branch
4. Si hay evidencia (logs, screenshot, CVE)

Con eso le paso al TL todo el contexto en un solo golpe.
```

This message is the PM's direct response to the user in the group. It informs the user the escalation has been sent and proactively requests more context — a structured triage intake.

---

**Step 3 — TL responds to the group (18:05:19 CET, +21s after escalation)**

The TL agent receives the forwarded message in session `agent:tech-lead:telegram:group:-5177552677`. It calls `team_reply` (creating the second `agent_messages` row) and also posts directly to the Telegram group.

**3a. Internal reply** — `team_reply` creates `agent_messages` row:

```
id           : 01KJWWZ9NCF161P0C9MC05SE4T
from_agent   : tech-lead
to_agent     : pm
subject      : Re: URGENTE: problema de seguridad crítico en módulo de auth
body         :
  Recibido, ya tengo ownership. Estado:

  1. **Ya lancé un audit automático** del módulo de auth en vibe-flow.
     Esperando resultados.
  2. **Mitigación inmediata:** Pendiente de que Luis confirme qué vector/síntoma
     vio. Sin esa info, las opciones genéricas son:
     (a) desactivar endpoints de auth públicos vía feature flag,
     (b) rotar secretos/JWT keys,
     (c) activar rate limiting agresivo.
  3. **Info que necesito de Luis:** ¿Qué vio exactamente? (acceso no autorizado,
     tokens válidos de usuarios inexistentes, brute force, etc.) + ¿está en
     producción y es explotable ahora?
  4. **ETA:** Primer assessment en cuanto termine el scan (~minutos) o en cuanto
     Luis dé más contexto, lo que llegue primero.

  Prioridad: contención > diagnóstico > fix.
origin_session_key : agent:pm:telegram:group:-5177552677
created_at         : 2026-03-04T17:05:19.532Z
```

**3b. Telegram group messages** — TL's turn produces multiple outputs via `accountId:"tl"` → @AiTeam_TechLead_bot posts:

```
[Telegram group — @AiTeam_TechLead_bot]
[Tech Lead | anthropic/claude-opus-4-6] Estoy en ello. Déjame revisar qué
tenemos en el módulo de auth.
```

```
[Telegram group — @AiTeam_TechLead_bot]
[Tech Lead | anthropic/claude-opus-4-6] Ya lancé un audit de seguridad del
módulo de auth en el repo. Luis, mientras analizo el código, necesito que me
digas:

1. ¿Qué problema detectaste exactamente? (comportamiento, error, acceso
   indebido, etc.)
2. ¿Está en producción ahora o es entorno dev/staging?
```

```
[Telegram group — @AiTeam_TechLead_bot]
Ya confirmé al PM que estoy liderando esto. Luis, el scan del código está
corriendo — en cuanto tenga resultados los comparto aquí.
```

Three separate messages from @AiTeam_TechLead_bot appear in rapid succession. The TL acknowledges receipt, launches the audit, requests more context from the user, and confirms ownership to the PM — all within the same agent turn.

---

**Step 4 — PM relays TL's response back to the group (18:05 CET)**

The `after_tool_call` hook fires on TL's `team_reply`, delivering the reply content back through @AiTeam_ProductManager_bot:

```
[Telegram group — @AiTeam_ProductManager_bot]
Respuesta del Tech Lead sobre el problema de seguridad crítico en auth:

• Recibido, tiene ownership.
• Ya lanzó un audit/scan automático del código del módulo de auth.
• Mitigación inmediata: pendiente de que Luis confirme el vector/síntoma.
  Opciones genéricas listas: desactivar endpoints de auth, rotar secretos/JWT,
  rate limiting agresivo.
• Info que necesita de Luis: ¿Qué vio exactamente? (acceso no autorizado,
  tokens de usuarios inexistentes, brute force, etc.) + ¿está en producción
  y es explotable ahora?
• ETA: primer assessment en cuanto el scan termine o Luis dé contexto.
• Prioridad: contención > diagnóstico > fix.
```

This is the PM relaying the TL's structured response in a human-friendly summary. The user sees both the TL's direct messages and the PM's relay — providing redundancy and a consolidated view.

---

**Step 5 — TL creates audit task autonomously (18:05:25 CET, +6s after response)**

```sql
-- task_records
id         : 01KJWWZFKZ5G5VJGVWFYKWZSC5
title      : Auth Security Audit - workspace exploration
status     : backlog
scope      : patch
assignee   : null
created_at : 2026-03-04T17:05:25.631Z
```

```
-- event_log (task lifecycle)
17:05:25.631  task.created          (task_create tool called)
17:05:25.632  cost.tool             toolName=task.create  durationMs=2  success=true
```

---

**Step 6 — TL runs 3 workspace-exploration steps in parallel (18:05:30 CET, +5s)**

```
-- event_log (workflow steps)
17:05:30.663  workflow.step.completed  stepId=find-all-files   stepType=shell  agent=tech-lead
17:05:30.663  workflow.step.completed  stepId=find-auth-files  stepType=shell  agent=tech-lead
17:05:30.663  workflow.step.completed  stepId=grep-auth-refs   stepType=shell  agent=tech-lead
17:05:30.663  cost.tool               toolName=workflow.step.run  durationMs=1  success=true
```

Three shell steps fired literally at the same millisecond — the orchestrator runs them as a parallel batch. All completed within 5 seconds of the task being created.

---

**Step 7 — TL publishes audit results to the group (18:05 CET)**

After the workspace-exploration steps complete, the TL agent posts a final summary report to the Telegram group:

```
[Telegram group — @AiTeam_TechLead_bot]
✅ Subagent tech-lead finished

Auth Security Audit Report — /workspaces/vibe-flow

⚠️ Limitation: The audit ran against the workspace source tree (no runtime
access). Findings below are static analysis only.

What I Could Determine:
• The auth module code was scanned for common vulnerability patterns
  (hardcoded secrets, SQL injection, XSS, insecure token handling)
• File-level structure reviewed: middleware, routes, token generation

Recommendation:
• Luis should provide the specific symptom/vector to enable targeted analysis
• A follow-up dynamic scan (runtime + dependency audit) is recommended
• If production is affected: rotate tokens immediately, enable strict
  rate limiting

Checklist I Would Apply:
☐ Confirm vulnerability vector with Luis
☐ Check dependencies for known CVEs (pnpm audit)
☐ Review token expiration and rotation policies
☐ Verify middleware auth chain order
☐ Run SAST tooling against auth module specifically
```

This is the final output of the TL's autonomous workflow — a structured audit report posted directly in the group for the user to see. It demonstrates the full loop: user report → PM intake → TL escalation → autonomous task + scan → published results.

---

**Complete timeline:**

```
18:04:35  Luis types in Telegram group: "@AiTeam_ProductManager_bot tenemos un problema..."
18:04:58  PM processes → team_message to TL (agent_messages row) (+23s)
          PM posts in group: "Enviado al Tech Lead con prioridad urgent..."
          after_tool_call: hook spawns TL agent in same group session via WS
18:05:19  TL processes → team_reply to PM (agent_messages row) (+21s)
          TL posts 3 messages in group:
            "Estoy en ello..."
            "Ya lancé un audit de seguridad..."
            "Ya confirmé al PM que estoy liderando esto..."
18:05:19  PM relays TL's response in group: "Respuesta del Tech Lead..."
18:05:25  TL calls task_create → task 01KJWWZFKZ5G5VJGVWFYKWZSC5 written to DB (+6s)
18:05:30  TL runs 3 parallel shell steps: find-all-files, find-auth-files, grep-auth-refs (+5s)
18:05:30  TL posts audit report in group: "Auth Security Audit Report..."
          ──────────────────────────────────────────────────────────────────────────────
          Total: 55 seconds from user message to autonomous audit report published
```

**What the user sees in Telegram (7 messages in ~55 seconds):**

```
┌── Telegram Group Chat ───────────────────────────────────────────┐
│                                                                   │
│  Luis (18:04):                                                    │
│    @AiTeam_ProductManager_bot tenemos un problema de seguridad    │
│    crítico en el módulo de auth...                                │
│                                                                   │
│  @AiTeam_ProductManager_bot (18:05):                              │
│    Enviado al Tech Lead con prioridad urgent...                   │
│    Para acelerar: pásame aquí los detalles...                     │
│                                                                   │
│  @AiTeam_TechLead_bot (18:05):                                    │
│    Estoy en ello. Déjame revisar qué tenemos en el módulo...     │
│                                                                   │
│  @AiTeam_TechLead_bot (18:05):                                    │
│    Ya lancé un audit de seguridad del módulo de auth...           │
│    Luis: 1. ¿Qué problema detectaste? 2. ¿Producción?           │
│                                                                   │
│  @AiTeam_TechLead_bot (18:05):                                    │
│    Ya confirmé al PM que estoy liderando esto...                  │
│                                                                   │
│  @AiTeam_ProductManager_bot (18:05):                              │
│    Respuesta del Tech Lead: • Recibido, tiene ownership...        │
│    • Ya lanzó un audit automático...                              │
│                                                                   │
│  @AiTeam_TechLead_bot (18:05):                                    │
│    ✅ Auth Security Audit Report...                                │
│    Recommendation: rotate tokens, enable rate limiting...         │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

**Per-persona identity proof:** the TL's messages were delivered via `accountId:"tl"` (env var `TELEGRAM_BOT_TOKEN_TL`), so the Telegram group shows `@AiTeam_TechLead_bot` — a different avatar and username from `@AiTeam_ProductManager_bot`. Both bots appear in the same conversation, each with their own identity, demonstrating the ft-0173 multi-account routing working as designed.

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
