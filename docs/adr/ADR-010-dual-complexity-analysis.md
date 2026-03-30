# ADR-010: Dual Complexity Analysis (AST + Regex)

## Status
Accepted

## Date
2026-03-05

## Context

The quality gate system needs to measure cyclomatic complexity to enforce
the project's "average complexity <= 5.0" threshold. Two extensions need
complexity measurement but with different trade-offs:

- **product-team extension:** Runs as part of the task lifecycle. Accuracy
  matters more than speed because results feed into quality gate decisions
  that block pipeline advancement.
- **quality-gate extension:** Runs as a standalone CLI for quick local scans
  and CI checks. Speed matters more than precision because developers run it
  frequently during development.

A single complexity engine cannot optimally serve both use cases.

## Decision

Maintain **two separate complexity analysis implementations:**

1. **AST-based analysis** (`quality_complexity` tool in product-team):
   Uses `ts-morph` to parse TypeScript into an AST and count branching
   nodes (if, for, while, case, catch, &&, ||, ??). Produces higher,
   more accurate scores.

2. **Regex-based heuristic** (`qgate_complexity` tool in quality-gate):
   Uses regular expressions to count keyword patterns in source text.
   Produces lower scores, runs ~10x faster, requires no compilation.

**Important:** Results from the two tools are not directly comparable. The
AST-based tool produces higher scores because it detects branches that
regex cannot (e.g., ternary expressions inside template literals, short-circuit
evaluation chains).

## Alternatives Considered

### Single AST-based engine for both extensions

- **Pros:** Consistent scores everywhere, single codebase to maintain.
- **Cons:** `ts-morph` is heavy (~15 MB, slow startup). Unacceptable for CLI
  scans where developers expect sub-second results. The quality-gate CLI
  runs on every file save in watch mode — startup latency matters.

### Single regex-based engine for both extensions

- **Pros:** Fast everywhere, simple codebase.
- **Cons:** Regex misses significant branching constructs. Using inaccurate
  scores for pipeline quality gate decisions would allow overly-complex code
  to pass unchecked.

### ESLint complexity rule (`complexity`)

- **Pros:** Battle-tested, widely used.
- **Cons:** Only measures cyclomatic complexity for JavaScript/TypeScript
  functions, not files or modules. Doesn't produce the aggregate scores
  the quality gate needs. Would require parsing ESLint output, adding a
  dependency on ESLint's programmatic API.

## Consequences

### Positive

- Each use case gets the optimal trade-off: accuracy for pipeline decisions,
  speed for developer feedback.
- Shared analysis logic (score aggregation, threshold comparison) is factored
  into `@openclaw/quality-contracts`.
- Developers get fast feedback loops; pipeline gets accurate enforcement.

### Negative

- Two implementations to maintain. Bug fixes may need to be applied to both.
- Score comparison between tools is confusing — the same function may score
  3 in regex and 5 in AST. This is documented in
  `docs/complexity-analysis-discrepancy.md`.

### Neutral

- The dual approach is well-documented and the discrepancy is expected. Users
  of the CLI are warned that scores differ from pipeline scores.

## References

- EP05 -- Quality & Observability (quality tools consolidation)
- `extensions/quality-gate/` — regex-based complexity implementation
- `extensions/product-team/` — AST-based complexity implementation
- `packages/quality-contracts/` — shared analysis contracts
- `docs/complexity-analysis-discrepancy.md` — discrepancy explanation
