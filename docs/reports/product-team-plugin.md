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

Tasks move through these statuses in order:

```
OPEN → REFINEMENT → DESIGN → IMPLEMENTATION → QA → REVIEW → DONE
                                                            ↓
                                                         SHIPPING (optional)
                                                            ↓
                                                          CLOSED

Any status → BLOCKED (on pause/blocker decision)
BLOCKED → any status (on unblock)
Any status → CANCELLED
```

Compact representation of valid transitions:

```
OPEN            → REFINEMENT
REFINEMENT      → DESIGN, IMPLEMENTATION
DESIGN          → IMPLEMENTATION
IMPLEMENTATION  → QA
QA              → REVIEW, IMPLEMENTATION (regression)
REVIEW          → SHIPPING, DONE, QA (rework)
SHIPPING        → DONE
*               → BLOCKED, CANCELLED
BLOCKED         → (previous status)
```

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

### Migration 001 — Core schema

```sql
tasks           id, title, body, status, assignee, priority, scope,
                project, branch, pr_url, stitch_id, created_at, updated_at
workflow_events task_id, event_type, from_status, to_status, actor,
                payload, created_at
leases          agent_id, task_id, acquired_at
decisions       id, task_id, type, question, action, escalated_to,
                resolved_at, payload
messages        id, from_agent, to_agent, subject, body, priority,
                reply_to, status, origin_channel, origin_session_key,
                created_at, read_at
```

### Migration 002 — VCS idempotency

```sql
ext_requests    id, type, dedup_key, status, response_payload, created_at
```

`ext_requests` prevents duplicate GitHub API calls (branch creates, PR creates) when an agent retries a tool. Every VCS tool writes a `dedup_key = "type:params-hash"` row; on duplicate key, the stored response is returned without re-calling GitHub.

### Repositories

| Repository              | Manages                              |
|-------------------------|--------------------------------------|
| `TaskRepository`        | CRUD + status transitions            |
| `WorkflowEventRepository` | Append-only event log              |
| `LeaseRepository`       | Agent concurrency leases             |
| `DecisionRepository`    | Decision records                     |
| `MessageRepository`     | Team inbox/outbox                    |

All mutations use **optimistic locking** on `updated_at`. Concurrent writes return a `409 Conflict` rather than silently overwriting.

---

## 5. Hook System

The plugin registers three `after_tool_call` hooks. All hooks are wrapped with try/catch so a failing hook never kills the parent agent turn.

### Origin-injection hook

Injected in the message store layer (not as an SDK hook). When `team_message` stores a message to the DB, it captures the current `originChannel` and `originSessionKey` from the tool call context. This is what enables later delivery routing — the origin is preserved in the `messages` table and returned in tool results so the auto-spawn hooks can read it without needing `ctx.sessionKey` (which the SDK passes as `undefined` in `after_tool_call`).

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

### Step 1: Inbound — origin capture

```
User sends message to @AiTeam_ProductManager_bot in Telegram group
    → SDK receives update via Grammy (botToken for `pm` account)
    → Gateway creates/resumes session: agent:pm:telegram:group:<chatId>
    → PM agent runs; tool call: team_message({ to: "tech-lead", ... })
    → Message stored in DB with originChannel="telegram", originSessionKey="agent:pm:telegram:group:<chatId>"
```

### Step 2: Auto-spawn decision

```
after_tool_call fires with team_message result (delivered: true)
    → handleTeamMessageAutoSpawn reads toAgent="tech-lead"
    → shouldDeliver(deliveryConfig, "pm", { priority, subject }) returns { deliver: true }
    → targetAccountId = deliveryConfig.agentAccounts["tech-lead"] → "tl"
    → sessionKey = rebuildSessionKeyForAgent("agent:pm:telegram:group:<chatId>", "tech-lead")
                 = "agent:tech-lead:telegram:group:<chatId>"
    → chatId = extractChatIdFromSessionKey("agent:pm:telegram:group:<chatId>") → "<chatId>"
```

### Step 3: Gateway WS spawn

```
fireAgentViaGatewayWs("tech-lead", message, logger, {
    deliver: true,
    channel: "telegram",
    accountId: "tl",
    sessionKey: "agent:tech-lead:telegram:group:<chatId>",
    to: "<chatId>"
})
    → Detached Node.js subprocess opens WS to gateway
    → Calls gateway "agent" method with { sessionKey, message, deliver, channel, accountId, to }
    → Gateway resolves agent config from sessionKey (tech-lead's tools + skills)
    → Tech Lead agent runs
    → Response sent via account "tl" (TELEGRAM_BOT_TOKEN_TL → @AiTeam_TechLead_bot)
    → Message appears in group as @AiTeam_TechLead_bot
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

## 9. Live Example: Tech Lead Escalation via Telegram

This section shows a real session from the ft-0173 deployment. It demonstrates delivery routing, the auto-spawn chain, and per-persona bot identity end-to-end.

### Setup

- Three bots running in Docker: @AiTeam_ProductManager_bot (pm), @AiTeam_TechLead_bot (tl), @AiTeam_Designer_bot (designer)
- Group: vibe-flow team channel (ID -5177552677), requireMention: true
- User DM: sent to @AiTeam_ProductManager_bot in Telegram group

### The escalation

**User** (in group, @mentioning PM bot):
> There is a critical authentication issue: session tokens expire in 24 hours instead of 7 days. This affects all users. The PM must escalate this to the Tech Lead.

**@AiTeam_ProductManager_bot** (PM agent, same group turn):
> I'm receiving a critical auth issue report. Escalating to Tech Lead now.
>
> *[calls `team_message({ to: "tech-lead", subject: "escalation: critical session token expiry bug", priority: "urgent", ... })`]*

**Internal — after_tool_call fires:**
```
handleTeamMessageAutoSpawn
  toAgent = "tech-lead"
  originChannel = "telegram"
  originSessionKey = "agent:pm:telegram:group:-5177552677"
  shouldDeliver(deliveryConfig, "pm", { priority: "urgent" }) → { deliver: true, reason: "broadcast mode" }
  targetAccountId = agentAccounts["tech-lead"] → "tl"
  sessionKey = "agent:tech-lead:telegram:group:-5177552677"
  to = "-5177552677"
  → fireAgentViaGatewayWs("tech-lead", ..., { deliver: true, channel: "telegram", accountId: "tl", sessionKey, to })
```

**@AiTeam_TechLead_bot** (Tech Lead auto-spawned, 5–8 seconds later, in the same group):
> PM, I've reviewed the authentication issue. Session tokens are configured in `auth/jwt.service.ts` line 12 — `expiresIn: '24h'` should be `'7d'`. I'm creating a hotfix task now.
>
> *[calls `task_create({ title: "fix: extend session token TTL to 7 days", scope: "patch", ... })`]*

The Tech Lead's response appears in the group under its own bot identity (`@AiTeam_TechLead_bot`), not the PM bot.

### What made this work

1. **`agentAccounts`** — the delivery map connected `"tech-lead"` to `"tl"`, enabling the gateway to pick the TL bot token
2. **`rebuildSessionKeyForAgent`** — replaced `pm` with `tech-lead` in the session key so the gateway loaded tech-lead's tools and skills
3. **`fireAgentViaGatewayWs`** — bypassed the CLI subprocess path (which causes auth rejections during concurrent runs) by opening a raw WS directly to the gateway
4. **Named `accounts`** — the SDK created a separate Grammy `Bot` instance for `tl`, which the gateway used for the outbound message
5. **`groups` config** — the explicit group entry allowed the original PM message to be processed (without it, Grammy receives the update but the SDK drops it silently before reaching `telegram inbound:`)

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
