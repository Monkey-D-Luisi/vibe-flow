# ADR-006: Hexagonal Architecture for product-team Extension

## Status
Accepted

## Date
2026-02-24

## Context

The product-team extension is the largest and most complex extension in the
monorepo. It contains task lifecycle management, workflow orchestration, quality
gates, GitHub automation, inter-agent messaging, a decision engine, and pipeline
management. Without structural discipline, this extension would become an
unmaintainable monolith where every module depends on every other module.

The extension needs to:

- Allow domain logic (task status rules, state machine guards) to be tested in
  isolation without a database or GitHub connection.
- Support swapping persistence implementations (e.g., SQLite → PostgreSQL) without
  rewriting business logic.
- Keep tool handlers thin — they should validate input and delegate, not contain
  business rules.
- Prevent circular dependencies between layers.

## Decision

Adopt a **hexagonal (ports-and-adapters) architecture** with five layers, where
dependencies flow strictly inward:

```
Layer 5: GitHub (outermost)
  └─ gh-client, branch-service, pr-service
Layer 4: Tools
  └─ MCP tool handlers (task-create, vcs-branch-create, etc.)
Layer 3: Orchestrator
  └─ state-machine, step-runner, event-log, lease-manager
Layer 2: Persistence
  └─ task-repository, event-repository, SQLite migrations
Layer 1: Domain (innermost)
  └─ task-status, task-record, errors, types
```

**Rules:**

1. Inner layers never import from outer layers.
2. Domain layer has zero external dependencies — pure functions and types only.
3. Persistence layer exposes repository interfaces consumed by the orchestrator.
4. Tool handlers (Layer 4) are thin adapters: parse input → call orchestrator → return result.
5. GitHub layer (Layer 5) is isolated so it can be disabled or mocked entirely.

## Alternatives Considered

### Flat module structure (all files in `src/`)

- **Pros:** Simple, no layer decisions, fast to start.
- **Cons:** As the extension grew to 50+ files, imports became tangled. No way to
  enforce that tool handlers don't call GitHub directly or that domain logic
  doesn't touch the database. Would have become unmaintainable by EP05.

### Clean Architecture (Uncle Bob)

- **Pros:** Well-documented, strong separation of concerns.
- **Cons:** Requires explicit interface definitions for all ports and many
  adapter files, which adds significant boilerplate for a plugin that runs
  in-process. The full ceremony of use-case interactors felt heavyweight for
  MCP tool handlers that are already naturally scoped.

### Vertical slices (feature folders)

- **Pros:** Each feature is self-contained, easy to locate all code for a feature.
- **Cons:** Cross-cutting concerns (state machine, event log, lease management)
  would be duplicated or require an awkward shared layer. The task state machine
  is used by every feature — it belongs in a shared layer, not duplicated per slice.

## Consequences

### Positive

- Domain logic is tested with pure unit tests (no mocks, no database).
- Persistence can be swapped without touching business logic (proven when adding
  WAL mode and migration versioning).
- Tool handlers are consistently thin — typically under 30 lines.
- Circular dependency prevention is enforced by project convention.
- New developers can understand the codebase by reading one layer at a time.

### Negative

- Layer boundaries require discipline — no TypeScript compiler enforcement exists
  to prevent Layer 1 from importing Layer 3.
- Some pragmatic shortcuts (e.g., direct SQLite calls in an orchestrator module)
  required conscious decisions about whether to add an intermediate repository.
- Five layers adds cognitive overhead for simple features that touch multiple layers.

### Neutral

- The hexagonal pattern is well-known in the TypeScript ecosystem, reducing
  onboarding friction for contributors familiar with the pattern.

## References

- EP02 -- Task Engine (initial architecture)
- EP05 -- Quality & Observability (validated the pattern under growth)
- `extensions/product-team/src/` directory structure
