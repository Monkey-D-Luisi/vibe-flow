---
id: P-0002
slug: outbox
title: Transactional Outbox
category: data
status: accepted
created: 2025-10-22
updated: 2025-10-22
adr_refs: [ADR-0001]
related: [change-data-capture, saga-choreography]
tags: [consistency, messaging, data]
owner: architecture
---

## Intent
Ensure reliable event publication by persisting outbound messages in the same transaction as domain changes and relaying them asynchronously.

## Context
- Services modify state in a database and must emit events or notifications.
- At-least-once delivery is required to maintain downstream consistency.
- Directly publishing to the message bus inside the transaction risks partial failures.

## Problem
Without atomic persistence, a crash between database commit and event publication results in dropped messages. The anti-goal is full-blown distributed transactions or two-phase commit.

## Solution sketch
Write outbound messages to an "outbox" table within the same database transaction as business state changes. A relay process polls the outbox, publishes events to the broker, and marks them as dispatched with idempotent guarantees.

## When to use
- Services own a relational datastore and must publish integration events.
- Downstream consumers tolerate eventual consistency on the order of seconds.
- The team can run a lightweight poller or streaming job to relay the outbox.

## When not to use
- The service already uses a database that supports change data capture streams.
- Hard real-time delivery is required with tight latency bounds.
- You cannot guarantee idempotent consumers for duplicate event handling.

## Trade-offs
- Cost: Additional storage and relay processing overhead.
- Complexity: Requires scheduling and monitoring for the relay process.
- Latency: Introduces delay between transaction commit and event consumption.
- Throughput: Relay must be scaled to keep up with write volume.
- Reliability: Provides strong guarantees against message loss.
- Scalability: Partitioning the outbox table is necessary at high volumes.
- Security: Outbox data may hold sensitive payloads; apply access controls.
- Operability: Needs visibility into relay lag, retries, and dead-letter handling.

## Operational notes
- Index the outbox table on dispatch status and partition by creation timestamp to ease cleanup.
- Instrument relay lag and retry counters; alert when thresholds are exceeded.
- Provide tooling to re-drive failed messages safely.

## Known issues
- Outbox tables can grow quickly if cleanup is neglected.
- Backpressure from the relay can slow down transactional workloads.

## References
- ADR-0001 - Enable lint pipeline for ADRs
- Related pattern: [Circuit Breaker](./P-0001-circuit-breaker.md)
- External: https://microservices.io/patterns/data/transactional-outbox.html
