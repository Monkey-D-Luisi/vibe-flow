# Walkthrough 0043 -- Inter-Agent Messaging

## Summary

Added an inter-agent messaging layer to the product-team plugin so agents can
send direct messages for clarifications, questions, and coordination beyond
structured task metadata. Five new tools (`team.message`, `team.inbox`,
`team.reply`, `team.status`, `team.assign`) cover sending, reading, replying,
status checking, and task assignment. Messages are persisted in an
`agent_messages` SQLite table with threading via `reply_to` foreign key. The
table is created lazily via `CREATE TABLE IF NOT EXISTS` on first use, keeping it
consistent with the existing `agent_decisions` pattern. All five tools are
co-located in a single module for cohesion and registered via `getAllToolDefs`.

## Changes

- `extensions/product-team/src/tools/team-messaging.ts` (new): Five tool
  factory functions — `teamMessageToolDef`, `teamInboxToolDef`,
  `teamReplyToolDef`, `teamStatusToolDef`, `teamAssignToolDef`. Lazy table
  creation via `ensureMessagesTable()`. `team.assign` also sends a coordination
  message when the optional `message` param is provided.
- `extensions/product-team/src/schemas/team-messaging.schema.ts` (new): TypeBox
  schemas for all five tools — `TeamMessageParams`, `TeamInboxParams`,
  `TeamReplyParams`, `TeamStatusParams`, `TeamAssignParams`.
- `extensions/product-team/src/tools/index.ts`: Added imports and registrations
  for all five messaging tools in `getAllToolDefs`.
- `extensions/product-team/src/index.ts`: Added `agentConfig` resolution from
  `pluginConfig.agents` and wired it into deps for `team.status`.
- `extensions/product-team/test/tools/team-messaging.test.ts` (new): 21 tests
  covering all five tools including edge cases (empty inbox, non-existent
  message reply, no agentConfig).

## Verification

- typecheck: PASS
- lint: PASS
- tests: PASS (479 total, 21 new)
