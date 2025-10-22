---
id: P-0001
slug: circuit-breaker
title: Circuit Breaker
category: resilience
status: accepted
created: 2025-10-22
updated: 2025-10-22
adr_refs: [ADR-0001]
related: [retry, bulkhead]
tags: [resilience, failure, availability]
owner: architecture
---

## Intent
Prevent cascading failures by short-circuiting requests to an unhealthy dependency once failure thresholds are exceeded.

## Context
- Remote dependencies have unpredictable latency or availability.
- Downstream timeouts amplify resource pressure across the fleet.
- Consumers need fast failure signals to trigger fallbacks.

## Problem
Without protective throttling, a failing downstream system causes thread exhaustion, retry storms, and customer-facing latency spikes. The goal is to avoid amplifying partial outages; the anti-goal is guaranteeing recovery of the dependency itself.

## Solution sketch
Wrap calls to external dependencies with a stateful guard that tracks recent failures, opens the circuit after configurable thresholds, and uses a half-open probe period before re-enabling traffic.

## When to use
- Dependencies exhibit intermittent failures or high tail latency.
- Consumers have meaningful fallback behaviour when a request is rejected quickly.
- You can record and monitor success/failure ratios in near real time.

## When not to use
- The dependency is extremely cheap, idempotent, and tolerant of retries.
- The caller cannot afford to fail fast and lacks fallback logic.
- You cannot instrument the traffic or store local state for the breaker.

## Trade-offs
- Cost: Minimal compute cost but adds operational telemetry overhead.
- Complexity: Introduces state management and tuning for thresholds.
- Latency: Improves tail latency for callers once the breaker opens.
- Throughput: Temporarily reduces throughput to the protected dependency.
- Reliability: Reduces blast radius for dependent services during outages.
- Scalability: Scales horizontally when breaker state is local per instance.
- Security: Requires safe handling of failure metrics but no direct impact.
- Operability: Needs dashboards for open/half-open/closed states and alerting.

## Operational notes
- Capture breaker state transitions as metrics and logs to detect chattering.
- Coordinate threshold changes and test values in staging before production rollout.
- Combine with failover strategies (fallback cache, stale data reads) to preserve functionality.

## Known issues
- Misconfigured thresholds can cause the breaker to oscillate and degrade availability.
- Shared breaker state across instances may be required when load balancing is uneven.

## References
- ADR-0001 - Enable lint pipeline for ADRs
- Related pattern: [Transactional Outbox](./P-0002-outbox.md)
- External: https://martinfowler.com/bliki/CircuitBreaker.html
