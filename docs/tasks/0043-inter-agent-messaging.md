# Task 0043 -- Inter-Agent Messaging System

| Field        | Value                                                |
|--------------|------------------------------------------------------|
| Task         | 0043                                                 |
| Epic         | EP08 — Autonomous Product Team                       |
| Phase        | 8C — Autonomous Orchestration                        |
| Status       | DONE                                                 |
| Dependencies | 0038 (Agent roster)                                  |
| Blocks       | 0042 (Orchestrator uses messaging for coordination)  |

## Goal

Implement a messaging layer that allows agents to send direct messages to each
other for clarifications, questions, and coordination beyond structured task
metadata. All messages are logged for auditability. Urgent messages are
forwarded to the Telegram group.

## Context

The current system communicates only through TaskRecord metadata (structured
JSON). For an autonomous team, agents sometimes need to ask quick questions:
"Which API version should I target?", "Is this design component reusable?",
"The test is flaky — should I skip it?".

OpenClaw has agent-to-agent messaging capabilities built into the SDK.

## Deliverables

### D1: Message Tools

#### `team.message`
- **Input**: `{ to: string, subject: string, body: string, priority: "low"|"normal"|"urgent", taskRef?: string }`
- **Output**: `{ messageId: string, delivered: boolean }`
- Sends a message to another agent. If `priority: "urgent"`, also forwards to Telegram.

#### `team.inbox`
- **Input**: `{ unreadOnly?: boolean, limit?: number }`
- **Output**: `{ messages: Array<{ id, from, subject, body, priority, taskRef, timestamp, read }> }`
- Retrieves messages for the calling agent.

#### `team.reply`
- **Input**: `{ messageId: string, body: string }`
- **Output**: `{ replied: true }`
- Reply to a received message.

#### `team.status`
- **Input**: `{}`
- **Output**: `{ agents: Array<{ id, name, status, currentTask, model }> }`
- Get the status of all agents in the team.

#### `team.assign`
- **Input**: `{ taskId: string, agentId: string, message?: string }`
- **Output**: `{ assigned: true }`
- Assign a task to a specific agent (used by Tech Lead).

### D2: Message Persistence

Store messages in the SQLite database:

```sql
CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  task_ref TEXT,
  reply_to TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (reply_to) REFERENCES agent_messages(id)
);
```

### D3: Telegram Forwarding

Messages with `priority: "urgent"` are automatically forwarded to the Telegram
group with format:

```
🔔 **Urgent from back-1 → tech-lead**
Re: Task #123 — API schema conflict

The /users endpoint schema conflicts with the existing /auth endpoint.
Should I use the auth schema or create a new one?

Reply in Telegram or wait for tech-lead to respond.
```

### D4: Message Queue Processing

Register a background service that:
1. Polls for unread messages per agent
2. Injects unread messages into the agent's next prompt context
3. Handles message expiry (auto-mark read after 1 hour if no response)

## Acceptance Criteria

- [x] `team.message` delivers messages between agents
- [x] `team.inbox` returns agent's messages
- [x] `team.reply` creates threaded replies
- [x] `team.status` returns all agent statuses
- [x] `team.assign` assigns tasks to agents
- [ ] Urgent messages appear in Telegram group
- [x] All messages persisted in SQLite
- [x] Messages survive container restarts
- [ ] Unread messages injected into agent prompt context
- [x] No message loss under concurrent access

## Testing Plan

1. Unit tests: message CRUD operations
2. Unit tests: Telegram forwarding for urgent messages
3. Integration test: agent A sends to agent B, B reads inbox
4. Integration test: concurrent messages from multiple agents
5. Load test: 100 messages in rapid succession

## Technical Notes

- Use OpenClaw's built-in agent-to-agent messaging if available (`tools.messaging`
  in SDK). If not sufficient, build custom on top of SQLite.
- Message injection into prompt: use `before_prompt_build` hook to prepend
  unread messages to the system prompt.
- Keep messages lightweight — they're for coordination, not long documents.
  Limit body to 2000 characters.
