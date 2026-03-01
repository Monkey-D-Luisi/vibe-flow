# Complexity Analysis Discrepancy

**Created:** 2026-03-01
**Source Finding:** A-007 (2026-02-27 audit)
**Status:** Documented — migration deferred (see below)

---

## Summary

Two complexity analysis implementations exist in the codebase that produce different metrics for the same source code:

| Extension | Engine | Approach |
|-----------|--------|----------|
| `extensions/product-team` | ts-morph + escomplex | AST-based (accurate) |
| `extensions/quality-gate` | Regex heuristics | Pattern-matching (approximate) |

---

## Detail

### product-team: AST-based analysis

`extensions/product-team/src/tools/quality-complexity.ts` uses two real AST engines:

- **escomplex** (`typhonjs-escomplex`): Produces cyclomatic complexity, Halstead metrics, and maintainability index from a parsed AST.
- **ts-morph**: Walks the TypeScript AST to count decision points (if-statements, loops, logical operators, catch clauses, ternaries).

These engines produce the industry-standard cyclomatic complexity metric per McCabe's definition.

### quality-gate: Regex heuristics

`extensions/quality-gate/src/tools/complexity.ts` uses regex pattern matching to count decision points in raw source text:

```typescript
const patterns = [
  /\bif\s*\(/g,
  /\belse\s+if\s*\(/g,
  /\bcase\s+/g,
  /\bfor\s*\(/g,
  /\bwhile\s*\(/g,
  /\bdo\s*\{/g,
  /\bcatch\s*\(/g,
  /&&/g,
  /\|\|/g,
  /\?\?/g,
];
```

This approach is faster (no AST parsing dependency) but less accurate: it can mis-count patterns inside string literals and comments, misses some TypeScript-specific constructs, and cannot distinguish scope boundaries (function-level vs file-level).

---

## Impact

Running both tools against the same file will produce different complexity numbers. Thresholds set for one tool may be either too strict or too lenient when applied to the other.

---

## Intended Maintenance Strategy

1. **Shared types (done):** Both extensions now share `FunctionComplexity`, `FileComplexity`, `ComplexitySummary`, `ComplexityThresholds`, and `DEFAULT_THRESHOLDS` via `@openclaw/quality-contracts/complexity/types`. This ensures that output shape is consistent even when raw numbers differ.

2. **No immediate migration:** Migrating quality-gate from regex to AST analysis is a separate engineering effort. The regex heuristic provides adequate approximations for the standalone CLI use case (quick local runs) and avoids adding `ts-morph`/escomplex as dependencies to the quality-gate extension.

3. **Future work:** If the discrepancy causes production issues (e.g., CI passes quality-gate but fails product-team gate), migrate quality-gate to the AST engine. Track this as a new task with a separate PR.

4. **Threshold calibration:** Operators configuring complexity thresholds should note which tool applies those thresholds and calibrate accordingly.

---

## References

- Finding A-007: `audits/2026-02-27-full-audit.md`
- Task 0030: `docs/tasks/0030-consolidate-shared-types-and-schemas-in-quality-contracts.md`
- Shared types: `packages/quality-contracts/src/complexity/types.ts`
- product-team AST engine: `extensions/product-team/src/tools/quality-complexity.ts`
- quality-gate heuristic engine: `extensions/quality-gate/src/tools/complexity.ts`
