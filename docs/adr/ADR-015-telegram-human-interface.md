# ADR-015: Telegram as Primary Human Interface

## Status
Accepted

## Date
2026-03-12

## Context

The autonomous product team needs a channel for human oversight: monitoring
pipeline progress, approving escalated decisions, checking budgets, and
receiving alerts. The interface must be:

- **Always available:** Accessible from any device (phone, desktop, tablet).
- **Low friction:** Operators should not need to open a browser or IDE to
  check status or make decisions.
- **Bidirectional:** Not just notifications — humans must be able to send
  commands and receive structured responses.
- **Group-compatible:** Multiple stakeholders (PM, tech lead, QA) may need
  visibility into the same pipeline.

## Decision

Use **Telegram** as the primary human interface via a dedicated extension
(`extensions/telegram-notifier/`).

Design:

1. **Bot per channel:** A Telegram bot connected to a group chat where all
   8 agents send notifications.
2. **Slash commands:** `/status`, `/budget`, `/health`, `/pipeline`,
   `/standup`, `/ask`, `/approve`, `/reject` provide structured interaction.
3. **Per-persona routing:** Each agent has a distinct Telegram identity so
   operators can see which agent is communicating.
4. **Inline buttons:** Decision escalations include approve/reject buttons
   for fast resolution without typing commands.
5. **Notification hooks:** Pipeline stage transitions, quality gate results,
   budget alerts, and error events all trigger Telegram messages.

## Alternatives Considered

### Web dashboard only

- **Pros:** Rich UI, charts, detailed views.
- **Cons:** Requires opening a browser and navigating to the dashboard.
  Not practical for quick decisions while away from the desk. No push
  notifications without additional PWA infrastructure. Command interaction
  requires forms or separate API endpoints.

### Slack integration

- **Pros:** Widely used in professional environments, rich message formatting,
  app directory.
- **Cons:** Requires a Slack workspace (paid for most features), OAuth
  setup, and app review for distribution. Telegram Bot API is simpler
  (single token), free, and has no distribution restrictions.

### Email notifications

- **Pros:** Universal, no app installation required.
- **Cons:** One-way only — operators cannot send commands via email.
  High latency. Messages get buried in inboxes. No inline interaction
  (approve/reject buttons).

### Discord bot

- **Pros:** Free, rich message formatting, slash commands, voice channels.
- **Cons:** Similar complexity to Slack. Discord's bot API has stricter
  rate limits. The target audience (developer teams, not gaming communities)
  is better served by Telegram.

## Consequences

### Positive

- Telegram is accessible from any device with push notifications — operators
  respond to escalations in seconds.
- Bot API is simple: a single token, no OAuth, no app review.
- Group chat provides shared visibility — all stakeholders see the same feed.
- Inline buttons reduce decision latency to a single tap.
- Slash commands provide structured interaction without a custom UI.

### Negative

- Telegram dependency: if Telegram is down, human oversight is blocked.
  (Mitigated by fallback logging to stdout for `docker logs` visibility.)
- Bot API limitations: message formatting is limited compared to web UIs.
  Complex data (large tables, charts) must be simplified or linked.
- Telegram blocked in some countries/organizations, limiting adoption.

### Neutral

- The Virtual Office (EP20) provides a complementary web-based visualization,
  but Telegram remains the primary command-and-control interface.

## References

- EP08 -- Autonomous Product Team (Telegram integration requirement)
- EP15 -- Telegram Control Plane v2 (enhanced commands and persona routing)
- EP21 -- Agent Excellence & Telegram Command Center
- `extensions/telegram-notifier/` — Telegram extension implementation
