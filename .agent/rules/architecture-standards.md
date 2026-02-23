# Architecture Standards

## OpenClaw Plugin Architecture

### Plugin Entry Point

Every extension MUST export a `register(api)` function as its entry point. The
OpenClaw gateway calls this function at startup, passing the plugin API object.

```typescript
export function register(api: PluginApi): void {
  // Register tools, hooks, and event handlers
}
```

### Plugin Manifest

Each extension MUST have an `openclaw.plugin.json` at its root:

```json
{
  "name": "product-team",
  "version": "1.0.0",
  "description": "Product team workflow engine",
  "entry": "./dist/index.js",
  "tools": ["task.create", "task.get", "task.transition"]
}
```

---

## Hexagonal Layers

The plugin is organized into five concentric layers. Dependencies flow
**inward** only.

### Layer 1: Domain (innermost)

- Location: `src/domain/`
- Contains: TaskRecord, state transitions, validation rules, value objects,
  domain events.
- Rules:
  - **Zero external dependencies** -- no imports from other layers, no npm
    packages (except pure utility types).
  - Pure functions and classes only.
  - All business rules live here.
  - Tested with unit tests (no I/O, no mocks of external systems).

### Layer 2: Persistence

- Location: `src/persistence/`
- Contains: SQLite repositories, migrations, query builders.
- Rules:
  - Depends only on Domain.
  - Uses `better-sqlite3` for database access.
  - WAL mode enabled at connection time.
  - All SQL queries use parameterized statements (no string concatenation).
  - Migrations are sequential numbered SQL files.
  - Repository interfaces are defined in Domain; implementations live here.

### Layer 3: Orchestrator

- Location: `src/orchestrator/`
- Contains: State machine, agent routing, workflow runner, event dispatcher.
- Rules:
  - Depends on Domain and Persistence.
  - Coordinates multi-step workflows.
  - Manages task lifecycle transitions.
  - No direct HTTP or GitHub calls.

### Layer 4: Tools

- Location: `src/tools/`
- Contains: OpenClaw tool registrations.
- Rules:
  - Thin adapter layer -- minimal logic.
  - Each tool registration uses TypeBox schemas for parameters and return types.
  - Delegates all business logic to Orchestrator or Domain.
  - Handles input validation and error formatting.

### Layer 5: GitHub (outermost)

- Location: `src/github/`
- Contains: Octokit client, branch management, PR creation, label
  synchronization, project board updates.
- Rules:
  - Depends on all inner layers as needed.
  - All GitHub API calls are idempotent where possible.
  - Uses Octokit for all GitHub interactions.
  - Handles rate limiting and retries.

---

## Dependency Rules

```
GitHub  -->  Tools  -->  Orchestrator  -->  Persistence  -->  Domain
(outer)                                                      (inner)
```

- An outer layer MAY import from any inner layer.
- An inner layer MUST NOT import from any outer layer.
- Layers at the same level MUST NOT import from each other.
- Cross-cutting concerns (logging, configuration) use dependency injection.

---

## Schema Definitions

- All tool parameter schemas use **TypeBox** (`@sinclair/typebox`).
- Schemas live in `src/schemas/` and are imported by tool registrations.
- Each schema file exports a `Type` object and an inferred TypeScript type.
- Schema files are named `<tool-name>.schema.ts`.

---

## Anti-Patterns to Avoid

1. **Domain importing from Persistence** -- Domain must remain pure. If you
   need data access in domain logic, use repository interfaces defined in
   Domain and implemented in Persistence.
2. **Business logic in Tools layer** -- Tools are thin adapters. Move logic to
   Orchestrator or Domain.
3. **Direct SQL in Orchestrator** -- Use repository abstractions from
   Persistence.
4. **Hardcoded GitHub tokens** -- Use configuration injection.
5. **Synchronous file I/O in request handlers** -- Use async patterns.
6. **Circular dependencies** -- If module A imports B and B imports A, refactor
   to break the cycle.
7. **God classes** -- No class should exceed 500 LOC or have more than 7 public
   methods.
