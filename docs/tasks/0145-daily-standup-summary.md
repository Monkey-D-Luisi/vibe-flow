# Task: 0145 -- Daily Standup Summary Cron

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

Send an automated daily standup summary to Telegram at a configurable hour,
covering pipeline progress, active tasks, and team health.

---

## Context

The team had no automated summary of daily progress. Checking status required
manual `/teamstatus` commands. A scheduled daily digest provides visibility
without human intervention and keeps the Telegram group informed.

---

## Scope

### In Scope

- `StandupScheduler` class with configurable hour (UTC)
- Standup report generation from product-team API
- Registration as a plugin service with start/stop lifecycle
- Plugin config for enabling/disabling and hour override

### Out of Scope

- Per-agent individual reports
- Weekend/holiday awareness

---

## Requirements

1. Runs once daily at the configured UTC hour
2. Fetches metrics, timeline, and team status from product-team API
3. Formats a MarkdownV2 summary for Telegram
4. Configurable via plugin config (`standup.enabled`, `standup.hourUtc`)

---

## Acceptance Criteria

- [x] AC1: StandupScheduler fires at the configured hour
- [x] AC2: Report includes pipeline progress and team activity
- [x] AC3: Scheduler starts/stops with plugin lifecycle
- [x] AC4: Configuration respects `standup.enabled` and `standup.hourUtc`
- [x] AC5: Unit tests cover scheduler logic and report generation

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 70% minor)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
