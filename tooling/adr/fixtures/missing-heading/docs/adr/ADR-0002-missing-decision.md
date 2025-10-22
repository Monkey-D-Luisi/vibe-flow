---
id: ADR-0002
title: Define schema for structured logs
status: proposed
date: 2025-03-11
owners:
  - '@team/observability'
area: observability
links:
  issues: []
  pr: []
  docs: []
supersedes: []
superseded_by: null
---

# Define schema for structured logs

## Context
Services emit heterogeneous logs, which blocks correlation in observability tooling.

## Considered Alternatives
- Keep free-form text -- zero upfront cost, low queryability.
- Adopt a shared JSON format -- higher coordination effort.

## Consequences
- Positive: efficient queries and predictable alerts.
- Negative / Trade-offs: requires schema validation.
- Operations / Maintainability: pipelines must be updated to accept the schema.
