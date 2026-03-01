# ADR-003: `quality-gate` as a standalone extension separate from `product-team`

## Status
Accepted

## Date
2026-02-27

## Context

Quality analysis (test results, coverage, lint, complexity, gate enforcement)
is needed in two distinct contexts:

1. **Developer or CI pipeline**: an engineer or CI job wants to run quality
   checks against an artifact directory from the command line, without
   connecting to OpenClaw at all. This is the primary local workflow: run
   `pnpm q:gate`, inspect output, iterate.

2. **OpenClaw agent workflow**: the product-team plugin's quality tools
   (`quality.tests`, `quality.coverage`, `quality.lint`, `quality.complexity`,
   `quality.gate`) invoke the same quality logic as part of a controlled
   agent task lifecycle, storing results in the `metadata` column of a
   TaskRecord.

Both contexts share the same parsing logic (Istanbul JSON, ESLint JSON, Vitest
JSON, TypeScript complexity), the same gate policy evaluation, and the same
result types. However, the delivery surface — CLI binary vs. OpenClaw tool
registration — is different for each.

## Decision

Maintain `extensions/quality-gate` as a **standalone extension with its own
CLI** (`cli/qcli.ts`, invoked as `pnpm q:gate`), independent of the
`product-team` plugin.

Shared logic (parsers, gate policy, complexity engine, spawn, file I/O) is
factored into the `packages/quality-contracts` workspace package
(`@openclaw/quality-contracts`), consumed by both extensions.

The product-team plugin provides its own `quality.*` OpenClaw tools that call
into `@openclaw/quality-contracts` directly, without delegating to the
quality-gate extension at runtime.

## Alternatives Considered

### Merge quality-gate CLI into product-team

- **Pros:** Single package to maintain; no shared-contracts abstraction needed.
- **Cons:** Makes the product-team plugin the only entry point for quality
  checks. CI pipelines that do not use OpenClaw would need to install the full
  product-team plugin to run a quality check. Couples the CLI lifecycle to the
  OpenClaw plugin lifecycle.

### Drive quality checks from product-team by spawning the quality-gate CLI

- **Pros:** Reuses the CLI binary as-is.
- **Cons:** Introduces a cross-extension process spawn dependency. The quality
  result would be parsed from CLI stdout rather than a typed API. Fragile:
  any CLI output format change breaks the agent tool.

### Put all quality logic directly in product-team, no separate extension

- **Pros:** Simplest dependency graph.
- **Cons:** Eliminates the standalone CLI entirely. Quality checks could not be
  run without the full OpenClaw gateway. Reduces composability for external
  tooling and CI configurations.

## Consequences

### Positive

- **Standalone usability.** The quality-gate CLI can be invoked from any CI
  pipeline (GitHub Actions, local shell) without OpenClaw.
- **Shared contracts.** `@openclaw/quality-contracts` provides a single source
  of truth for result types, parser logic, and gate policy — both extensions
  stay in sync automatically.
- **Independent release cadence.** The quality-gate CLI can be published and
  updated independently of the product-team plugin.

### Negative

- **Two packages to maintain.** Changes to quality semantics may require
  updates in both `quality-gate` and `product-team`, even though the parsing
  logic is shared.
- **Shared-contracts coupling.** Both extensions depend on
  `@openclaw/quality-contracts`. Breaking changes in the contracts package
  affect both extensions simultaneously.

### Neutral

- **Duplication of tool registration.** The product-team plugin re-registers
  quality tools against OpenClaw rather than delegating to the quality-gate
  extension. This is intentional: the tool interface is typed; the CLI
  interface is text-based.

## References

- `extensions/quality-gate/` — standalone CLI extension
- `extensions/product-team/src/tools/quality-*.ts` — OpenClaw quality tools
- `packages/quality-contracts/` — shared parsing and gate logic
- [Roadmap EP05 — Quality & Observability](../backlog/EP05-quality-observability.md)
- [Task 0017: Consolidate Quality Parser and Policy Contracts](../tasks/0017-consolidate-quality-parser-and-policy-contracts.md)
