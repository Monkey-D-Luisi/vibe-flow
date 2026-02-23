# CR-0115: Security and Quality Fixes

| Field     | Value                              |
|-----------|------------------------------------|
| PR        | #115                               |
| Status    | in-progress                        |
| Severity  | MUST_FIX + SHOULD_FIX              |

## MUST_FIX Items

1. **Command injection on Windows** - `lint.ts` and `run_tests.ts` pass user-provided command strings to `safeSpawn` with `shell: true` on Windows. Add command validation to reject shell metacharacters.
2. **Path traversal in complexity.ts** - `cwd` and `globs` accept arbitrary paths including `..` traversal. Add path validation to constrain within project root.
3. **Path traversal in coverage_report.ts** - `cwd`, `summaryPath`, `lcovPath` accept arbitrary paths. Add path containment check.

## SHOULD_FIX Items

4. **ESLint ignoring test/ directory** - Remove `test/` from ignorePatterns.
5. **Husky hooks missing shebang** - Modern Husky v9+ does not require shebang; no fix needed (verified).
6. **product-team tsconfig Node16 vs NodeNext** - Update to NodeNext for consistency.
7. **product-team lint placeholder** - Not blocking; scaffold is intentional.
8. **Duplicate templates** - Consolidate `.agent/templates/` duplicates.

## OUT_OF_SCOPE

- Regex complexity vs AST: This is a design decision documented in ADR-001. The regex approach is intentional for the MVP to avoid heavy dependencies. AST analyzers (`escomplex.ts`, `tsmorph.ts`) exist for future upgrade.
- `.agent.md` duplication with `CLAUDE.md`: Intentional - `.agent.md` is for OpenClaw agents, `CLAUDE.md` is for Claude Code.
