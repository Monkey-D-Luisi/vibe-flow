# Task 0037 -- Telegram Channel Integration Plugin

| Field        | Value                                                |
|--------------|------------------------------------------------------|
| Task         | 0037                                                 |
| Epic         | EP08 — Autonomous Product Team                       |
| Phase        | 8A — Infrastructure                                  |
| Status       | DONE                                                 |
| Dependencies | 0035 (Docker deployment)                             |
| Blocks       | 0042 (Orchestrator needs Telegram notifications)     |

## Goal

Build an OpenClaw plugin that bridges all agent activity to a Telegram group
and accepts human commands from Telegram to control the autonomous team.

## Context

OpenClaw has **native Telegram support** via the `grammy` library. The built-in
channel handles message send/receive, webhooks, streaming, reactions, etc.
However, the autonomous team needs a *specialized notification layer* on top:

1. **Outbound**: Formatted notifications for lifecycle events (not raw agent
   messages, but structured cards for task transitions, PR links, quality reports)
2. **Inbound**: Command parsing from human messages to trigger team actions
   (assign task, pause agent, change priority, request status report)

The user already has a Telegram bot token and a target group ID.

## Deliverables

### D1: Telegram Channel Configuration

Add to `openclaw.docker.json`:

```jsonc
{
  "channels": {
    "telegram": {
      "accounts": {
        "product-team-bot": {
          "token": "${TELEGRAM_BOT_TOKEN}",
          "dm": { "policy": "disabled" },
          "groups": {
            "policy": "allowlist",
            "allowlist": ["${TELEGRAM_GROUP_ID}"]
          },
          "streaming": { "mode": "block" }
        }
      }
    }
  }
}
```

### D2: Telegram Notifier Plugin (`extensions/telegram-notifier/`)

A new OpenClaw plugin that registers lifecycle hooks:

| Hook | Notification |
|------|-------------|
| `after_tool_call` (task.transition) | "📋 Task #123 moved from `design` → `in_progress` by `back-1`" |
| `after_tool_call` (vcs.pr.create) | "🔀 PR #45 created: 'Add user auth flow' — [link]" |
| `after_tool_call` (quality.gate) | "✅ Quality gate PASSED for Task #123 (coverage: 87%, lint: clean)" or "❌ FAILED" |
| `agent_end` (with error) | "⚠️ Agent `back-1` encountered error on Task #123: <summary>" |
| `subagent_spawned` | "🤖 Agent `tech-lead` delegated Task #123 to `back-1`" |
| `message_received` (from Telegram) | Parse commands, route to appropriate agent |

### D3: Telegram Command Interface

Commands the human can send in the Telegram group:

| Command | Action |
|---------|--------|
| `/status` | Report current task status for all agents |
| `/status <agent-id>` | Report detailed status for one agent |
| `/pause <agent-id>` | Pause an agent (stops accepting new tasks) |
| `/resume <agent-id>` | Resume a paused agent |
| `/assign <task-id> <agent-id>` | Manually assign a task to an agent |
| `/priority <task-id> <level>` | Change task priority (low/medium/high/critical) |
| `/budget` | Report cost tracking summary |
| `/projects` | List active projects |
| `/idea <text>` | Submit a new product idea to PM agent |
| `/approve <task-id>` | Human approval for a pending decision |
| `/reject <task-id> <reason>` | Reject a pending decision with reason |
| `/health` | System health check (providers, agents, DB) |

### D4: Message Formatting

Notifications use Telegram's MarkdownV2 format with:
- Bold role names
- Inline code for IDs and statuses
- Hyperlinks to GitHub PRs
- Thread support (group posts in reply thread per task if forum mode enabled)

### D5: Rate Limiting

Implement a message queue with:
- Max 20 messages per minute to the group (Telegram limit is 30/min/group)
- Batch minor events (e.g., multiple tool calls) into single summary messages
- Priority queue: errors and human commands > PR/quality updates > routine transitions

## Acceptance Criteria

- [x] Plugin loads in OpenClaw gateway without errors
- [x] Task transition events appear in Telegram group within 5 seconds
- [x] PR creation events include clickable GitHub link
- [x] Quality gate results show pass/fail with metrics
- [x] `/status` command returns formatted agent status
- [x] `/idea` command creates a task and triggers PM agent
- [x] Rate limiter prevents Telegram API errors under high activity
- [x] Bot only posts in the configured group (not DMs, not other groups)
- [x] All outbound messages are logged in the event log

## Testing Plan

1. Unit tests for message formatting functions
2. Unit tests for command parser
3. Integration test with mocked grammy bot (no real Telegram calls)
4. Manual test: send `/health` in Telegram group, verify response
5. Manual test: trigger task transition, verify notification appears

## Technical Notes

- OpenClaw's built-in Telegram channel handles bot lifecycle (polling/webhook).
  This plugin builds ON TOP of that channel, not replaces it.
- Use `api.registerHook()` for lifecycle events
- Use `api.registerCommand()` for slash commands
- Use `api.runtime` to access the Telegram channel's send capabilities
- The plugin must register as a `registerService()` for its message queue
  background worker
