---
id: ADR-0004
title: Migrate queues to managed provider
status: superseded
date: 2025-03-13
owners:
  - '@team/platform'
links:
  issues: []
  pr: []
  docs: []
supersedes: []
superseded_by: ADR-9999
---

# Migrate queues to managed provider

## Context
Self-managed queues carry high maintenance costs and operational risk.

## Decision
Adopt a managed queue provider to reduce operational friction.

## Considered Alternatives
- Keep self-managed infrastructure -- full control with high costs.
- Build an internal PaaS -- requires significant upfront investment.

## Consequences
- Positive: faster incident recovery and lower maintenance toil.
- Negative / Trade-offs: vendor dependency and variable costs.
- Operations / Maintainability: requires external SLAs and monitoring.
