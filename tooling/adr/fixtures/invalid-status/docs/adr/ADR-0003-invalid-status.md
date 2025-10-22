---
id: ADR-0003
title: Adopt dedicated queues for email
status: pending
date: 2025-03-12
owners:
  - '@team/notifications'
links:
  issues: []
  pr: []
  docs: []
supersedes: []
superseded_by: null
---

# Adopt dedicated queues for email

## Context
Email delivery currently shares resources with the internal event pipeline.

## Decision
Split the queue infrastructure to prioritise email workloads.

## Considered Alternatives
- Keep the current architecture -- simple but vulnerable to bottlenecks.
- Outsource to a provider -- less maintenance, higher operational cost.

## Consequences
- Positive: guarantees priority for critical email notifications.
- Negative / Trade-offs: increases infrastructure cost.
- Operations / Maintainability: requires specialised metrics.
