# Task 0061 -- Configurable Delivery Channel Routing for Agent Messages

| Field        | Value                                                               |
|--------------|---------------------------------------------------------------------|
| Task         | 0061                                                                |
| Epic         | EP08 — Autonomous Product Team                                      |
| Phase        | 8C — Autonomous Orchestration                                       |
| Status       | TODO                                                                |
| Dependencies | 0043 (Inter-agent messaging), PR #211 (auto-spawn hooks)            |
| Blocks       | —                                                                   |

## Problem Statement

After PR #211 achieved bidirectional reactive messaging (PM → TL → PM → Telegram),
the delivery mechanism has three limitations:

1. **DM vs group mismatch**: When a user writes from the Telegram group, the
   agent's response arrives as a DM from the bot instead of in the same group.
   The `team_reply` auto-spawn hook delivers via `agent:pm:main` session, not
   the originating Telegram group session (`agent:pm:telegram:group:<id>`).

2. **Hardcoded Telegram delivery**: The `handleTeamReplyAutoSpawn` hook always
   passes `{ deliver: true, channel: 'telegram' }` regardless of the original
   message source or agent configuration. Internal-only agent conversations
   (e.g. back-1 asking tech-lead a question) should not route to Telegram.

3. **Only PM is Telegram-visible**: The `bindings` config only maps PM to
   Telegram. The user wants all agents visible in the group so the team's
   internal communication is transparent and observable.

## Goal

Implement configurable per-agent delivery channel routing so that:

- Agents can be individually configured for Telegram visibility
- Reply delivery respects the originating channel (group reply → group, DM → DM)
- Agent-to-agent conversations can optionally stay internal or be broadcast

## Analysis of Alternatives

### A1: Originating Channel Propagation (Recommended)

Track the originating channel and session in the message metadata. When
`team_reply` fires, the auto-spawn hook reads the original channel from the
message chain and routes the delivery back to the same channel/session.

**How it works:**
1. `team_message` tool records `originChannel` and `originSessionKey` in the
   message metadata (from the SDK context or the gateway's inbound session).
2. `team_reply` result exposes these fields alongside `from`/`to`.
3. `handleTeamReplyAutoSpawn` reads `originChannel`/`originSessionKey` and
   passes them to the gateway instead of hardcoded `"telegram"`.

**Pros:** Messages always return to where they came from. No new config needed
for the basic case. Works for group, DM, and web UI channels.

**Cons:** Requires schema migration to add `origin_channel` and
`origin_session_key` columns to `agent_messages`.

### A2: Per-Agent Telegram Binding (Complementary)

Extend the `bindings` config and agent `list` entries to support multiple agents
bound to Telegram. Each agent gets its own Telegram identity in the group.

**Current config:**
```json
"bindings": [
  { "agentId": "pm", "match": { "channel": "telegram" } }
]
```

**Proposed config:**
```json
"bindings": [
  { "agentId": "pm",        "match": { "channel": "telegram" } },
  { "agentId": "tech-lead", "match": { "channel": "telegram" } },
  { "agentId": "back-1",    "match": { "channel": "telegram" } },
  { "agentId": "qa",        "match": { "channel": "telegram" } },
  { "agentId": "devops",    "match": { "channel": "telegram" } }
]
```

With all agents bound, each one can post to the Telegram group directly. The
user sees which agent is speaking because the `responsePrefix` config already
includes `[{provider}/{model}]`, but this should be extended to include the
agent name for clarity.

**Pros:** All agents visible in Telegram. Full transparency of internal
communication. Each agent can reply directly to the group.

**Cons:** Higher message volume in Telegram. Needs careful routing so that only
one agent (PM by default) is the entry point for user messages, while other
agents only post their inter-agent replies. Requires gateway support for
multi-agent bindings on the same channel.

### A3: Per-Agent Delivery Policy (Complementary)

Add a `delivery` field per agent in the config to control whether messages are
broadcast externally, kept internal, or conditionally routed.

**Proposed config per agent:**
```json
{
  "id": "tech-lead",
  "delivery": {
    "mode": "broadcast",
    "channels": ["telegram"],
    "filter": "replies-only"
  }
}
```

**Modes:**
- `"internal"` — Agent messages stay in the internal inbox only. No channel
  delivery. Suitable for junior devs doing background work.
- `"broadcast"` — All `team_reply` and `team_message` outputs from this agent
  are delivered to configured channels.
- `"replies-only"` — Only replies (not initial messages) are delivered. Keeps
  the group clean — agents discuss internally but results reach Telegram.
- `"on-demand"` — Agent decides per-message whether to deliver externally by
  setting a `deliver: true` flag in the `team_reply` call.

**Pros:** Fine-grained control. Different agents can have different visibility.
PM and TL broadcast; junior devs stay internal.

**Cons:** More complex configuration. Agents need to be aware of their delivery
policy (or the hook must enforce it).

## Recommended Approach

Implement **A1 + A2 + A3** in phases:

### Phase 1: Originating channel propagation (A1)

Fixes the immediate DM-vs-group bug. Minimal changes:

1. Add `origin_channel TEXT` and `origin_session_key TEXT` columns to
   `agent_messages` table.
2. `team_message` tool captures the channel from the gateway context (the
   session key encodes the channel: `agent:pm:telegram:group:-517...`).
3. `team_reply` result includes `originChannel` and `originSessionKey`.
4. `handleTeamReplyAutoSpawn` uses these fields instead of hardcoded values.
5. Fallback: if `originChannel` is not set (legacy messages), default to
   current behavior (`deliver: true, channel: 'telegram'`).

### Phase 2: Multi-agent Telegram bindings (A2)

Makes all agents visible in the group:

1. Add all agents to the `bindings` array in `openclaw.docker.json`.
2. Update `responsePrefix` to include agent name: `[{agentName}:{model}]`.
3. Add routing logic so inbound Telegram messages still go to PM (the entry
   point agent), but outbound messages from any agent can be delivered to the
   group.
4. Verify the gateway supports multiple agents bound to the same Telegram group
   without routing conflicts.

### Phase 3: Per-agent delivery policy (A3)

Adds configurability:

1. Add `delivery` field to agent config schema.
2. `handleTeamReplyAutoSpawn` and `handleTeamMessageAutoSpawn` consult the
   sender's delivery policy before setting `deliver: true`.
3. `"internal"` agents never trigger channel delivery.
4. `"broadcast"` agents always deliver.
5. `"replies-only"` agents deliver only on `team_reply`, not `team_message`.
6. Default mode: `"replies-only"` for all agents (backward compatible).

## Deliverables

### D1: Schema Migration — `origin_channel` in Messages

Add `origin_channel` and `origin_session_key` columns to the `agent_messages`
table. Populate on `team_message` insert.

### D2: Originating Channel in `team_reply` Result

Extend the `team_reply` tool to surface `originChannel` and `originSessionKey`
from the parent message chain.

### D3: Dynamic Channel Routing in Auto-Spawn Hook

Update `handleTeamReplyAutoSpawn` to read origin channel from the reply result
and pass it dynamically to the gateway instead of hardcoding `"telegram"`.

### D4: Multi-Agent Telegram Bindings

Add all team agents to the `bindings` config. Verify gateway routing. Update
`responsePrefix` to identify the agent.

### D5: Per-Agent Delivery Policy Config

Add `delivery` config field per agent. Implement policy enforcement in the
auto-spawn hooks. Document the modes.

### D6: Tests

- Unit: `handleTeamReplyAutoSpawn` with dynamic channel from origin.
- Unit: delivery policy enforcement (internal, broadcast, replies-only).
- Integration: message round-trip preserving origin channel.
- E2E: Telegram group → PM → TL → reply back to the same group (not DM).

## Acceptance Criteria

- [ ] Reply from agent goes to the same Telegram group where user wrote (not DM)
- [ ] Internal agent-to-agent conversations do not leak to Telegram by default
- [ ] All agents can optionally be visible in the Telegram group
- [ ] Per-agent delivery policy is configurable (`internal`/`broadcast`/`replies-only`)
- [ ] Legacy messages without `originChannel` fall back to current behavior
- [ ] Schema migration is backward compatible (nullable columns)
- [ ] All existing auto-spawn tests continue to pass

## Technical Notes

- Session key format encodes the channel: `agent:<id>:main` (internal),
  `agent:<id>:telegram:group:<chatId>` (Telegram group),
  `agent:<id>:telegram:dm:<userId>` (Telegram DM). Parse the session key to
  derive the origin channel when the SDK context doesn't expose it explicitly.
- The gateway `agent` method already accepts `deliver` and `channel` params
  (added in PR #211). Phase 1 just needs to pass the right values dynamically.
- Multi-agent bindings (Phase 2) may require gateway changes if the current
  implementation assumes 1:1 agent-to-channel mapping. Investigate
  `matchBinding()` in the gateway code.
- Consider rate limiting for broadcast mode — if 5 agents all broadcast to the
  same group, the Telegram rate limit (20/min in config) could be hit quickly.
