# Task: 0147 -- Natural Language Intent Parser

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP21 -- Agent Excellence & Telegram Command Center |
| Priority | MEDIUM |
| Scope | MINOR |
| Created | 2026-03-21 |
| Branch | `feat/EP21-agent-excellence-telegram-command-center` |

---

## Goal

Parse free-form Telegram messages into structured intents and map them to
existing slash commands, enabling natural conversation with the bot.

---

## Context

Users could only interact via rigid `/command arg` syntax. Natural language
like "how's the team doing?" should map to `/teamstatus`. The intent parser
uses regex-based pattern matching with confidence scoring to identify intents
and map them to commands.

---

## Scope

### In Scope

- Intent parser module (`intents/intent-parser.ts`)
- 8 intent types: status, pipeline, budget, health, approve, reject, idea, help
- Confidence scoring based on match coverage
- `intentToCommand` mapping to slash command equivalents
- `/ask` command registration in index.ts
- Help text generator for natural language usage

### Out of Scope

- ML/LLM-based intent classification
- Multi-turn conversation state

---

## Requirements

1. Parse free-form text into one of 8 intent types + unknown
2. Confidence score reflects match quality (0-1)
3. Map intents to existing slash commands
4. `/ask` command accepts natural language input

---

## Acceptance Criteria

- [x] AC1: `parseIntent` identifies all 8 intent types from natural text
- [x] AC2: Confidence score is based on match coverage ratio
- [x] AC3: `intentToCommand` maps intents to existing slash commands
- [x] AC4: `/ask` command is registered and delegates to intent parser
- [x] AC5: Unknown intents return help text
- [x] AC6: Unit tests cover all intent types and edge cases

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 70% minor)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
