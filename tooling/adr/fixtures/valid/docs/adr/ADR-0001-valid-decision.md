---
id: ADR-0001
title: Use queues to process notifications
status: accepted
date: 2025-03-10
owners:
  - '@team/payments'
area: platform
links:
  issues: ['#12']
  pr: ['#45']
  docs: ['https://example.com/adr']
supersedes: []
superseded_by: null
---

# Use queues to process notifications

## Context
Synchronous notification delivery hurts user experience during traffic spikes.

## Decision
Introduce a distributed queue to decouple notification production from delivery.

## Considered Alternatives
- Keep synchronous processing -- simple, but brittle under load.
- Local retries -- partial improvement without isolating the workload.

## Consequences
- Positive: improved resilience and scalability.
- Negative / Trade-offs: additional operational complexity.
- Operations / Maintainability: requires dedicated queue monitoring.

## Success Metrics (optional)
- p95 notification send latency under two seconds.

## Implementation Notes (optional)
- Enable a feature flag for gradual rollout.

## Appendix (optional)
- Architecture diagram for the distributed queue.
