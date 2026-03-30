# EP21 -- Agent Excellence & Telegram Command Center

**Phase:** 15
**Status:** DONE
**Priority:** HIGH

## Goal

Transform Telegram from a passive notification window into an interactive
command center with inline keyboards, live-updating messages, and natural
language commands. Simultaneously raise agentic execution quality by enforcing
pre-advance quality validation, agent self-evaluation, collaborative review
loops, and cross-pipeline learning.

## Motivation

Observation of the live system reveals:

1. **Telegram is passive** — agents post notifications and respond to slash
   commands, but there are no interactive controls (buttons, inline keyboards),
   messages flood the chat instead of updating in-place, and quality gate
   results are single emoji lines instead of rich reports.
2. **Agents can advance without proof** — `pipeline_advance` does not enforce
   stage-specific quality checks. An agent can claim IMPLEMENTATION is done
   without tests passing or coverage meeting thresholds.
3. **No self-reflection** — agents do not score their own work before handing
   off. The skill-rules.json includes an eval reminder but it is not enforced.
4. **Review is one-shot** — tech-lead reviews but findings are not automatically
   routed back to the implementer for a fix-and-resubmit cycle.

## Scope

### Phase 15A: Interactive Telegram UX

- Rich quality report cards with progress bars and metric breakdowns
- Inline keyboard buttons for decision approval/rejection
- Live-updating pipeline tracker message (single message, edited on each advance)
- Multi-bot persona identity (agent-specific formatting and bot routing)

### Phase 15B: Agentic Execution Excellence

- Pre-advance quality validation (per-stage quality rules enforced in pipeline_advance)
- Agent self-evaluation requirement (structured self-assessment before advancing)
- Collaborative review loop protocol (findings → re-implementation → re-review)
- Cross-pipeline learning integration (auto-analysis on pipeline completion)

### Phase 15C: Observability & Communication Bridge

- Daily standup summary cron (automated team report to Telegram)
- Natural language intent parser (free-form Telegram messages → pipeline actions)

## Tasks

| ID   | Title                                     | Scope | Deps | Phase |
|------|-------------------------------------------|-------|------|-------|
| 0140 | Rich Quality Report Cards                 | MINOR | --   | 15A   |
| 0141 | Pre-Advance Quality Validation            | MAJOR | --   | 15B   |
| 0142 | Inline Keyboard Buttons for Decisions     | MINOR | --   | 15A   |
| 0143 | Live Pipeline Tracker Message             | MINOR | 0142 | 15A   |
| 0144 | Agent Self-Evaluation Enforcement         | MINOR | 0141 | 15B   |
| 0145 | Daily Standup Summary Cron                | MINOR | --   | 15C   |
| 0146 | Collaborative Review Loop Protocol        | MAJOR | 0141 | 15B   |
| 0147 | Natural Language Intent Parser            | MINOR | --   | 15C   |
| 0148 | Multi-Bot Persona Identity                | MINOR | --   | 15A   |
| 0149 | Cross-Pipeline Learning Integration       | MINOR | 0141 | 15B   |

## Dependencies

- EP15 (Telegram Control Plane v2) — DONE
- EP14 (Local-First Observability) — DONE
- EP09 (Pipeline Intelligence) — DONE

## Risks

- **Gateway API surface**: `api.sendMessage()` may not support Telegram's
  `reply_markup` for inline keyboards. Mitigation: direct Bot API HTTP calls
  (pattern exists in api-client.ts).
- **Telegram Topics**: Message threading via `message_thread_id` requires
  supergroup with Topics enabled. Mitigation: fall back to `reply_to_message_id`.
- **Quality gate enforcement strictness**: Too strict → agents stuck in loops.
  Too loose → quality degrades. Mitigation: configurable thresholds with
  max-retry limits (pattern from transition-guards.ts).
