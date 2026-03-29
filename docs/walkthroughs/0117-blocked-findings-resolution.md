# Walkthrough 0117 — Blocked Infrastructure Findings Resolution

## Context

Task 0078 identified five findings that were blocked on external factors
(infrastructure access, upstream dependency releases, research, operational
decisions). This task re-evaluates each finding now that EP17 has delivered
Vitest pinning (Task 0115) and CI blocking policy (Task 0116).

## Re-evaluation Results

### A-004 — Vitest version skew → RESOLVED

Task 0115 aligned all 8 workspace `package.json` files to exact `vitest@4.0.18`
and `@vitest/coverage-v8@4.0.18`. The `^` prefix was removed to prevent
minor-version drift. The lockfile was regenerated and all 2,410 tests pass.

### D-008 — Coverage/complexity not blocking → RESOLVED

Task 0116 added `COVERAGE_OUTCOME` and `COMPLEXITY_OUTCOME` to the CI verdict
computation. Previously only tests, lint, and vulnerability policy contributed
to the overall pass/fail. A `bypass-quality-gate` label escape hatch was added
for emergency merges.

### SEC-001/A-001 — actions-runner in repo → DEFERRED

The `actions-runner/` directory is in the repo root but fully gitignored
(line 72 of `.gitignore`). No credential files are tracked in git. The
`.gitleaks.toml` allowlist excludes the directory from secrets scanning.

Moving the runner outside the repo tree requires:
1. Service downtime for the self-hosted runner
2. Re-registration with GitHub
3. Updating any CI references to the runner directory

This is an infrastructure coordination task with no security urgency given
the existing mitigations. Re-evaluation date: 2026-06-30.

### SEC-004 — shell:true on Windows → DEFERRED

`packages/quality-contracts/src/exec/spawn.ts:147` uses `shell: true` on
Windows because Node.js `child_process.spawn` cannot resolve `.cmd` files
(like `pnpm.cmd`, `npx.cmd`) without a shell.

The existing mitigation is robust:
- `assertSafeCommand()` validates the command against an allowlist of 8
  safe prefixes (pnpm, npx, npm, node, vitest, eslint, ruff, tsc)
- All tokens are checked against a shell metacharacter regex
- 29 tests cover injection attempts and edge cases

Switching to `shell: false` would require:
- Adding `cross-spawn` dependency, OR
- Resolving `.cmd` paths manually on Windows
- Both approaches add complexity for marginal security improvement

Re-evaluation date: 2026-06-30.

### SEC-005 — Transitive vulnerabilities → DEFERRED

All transitive vulnerabilities flow through the `openclaw` dependency in
`extensions/model-router`. The security vulnerability exception ledger
(docs/security-vulnerability-exception-ledger.md) tracks 34 active
exceptions with expiry dates ranging from 2026-05-28 to 2026-06-28.

CI enforces `pnpm verify:vuln-policy` which validates that all discovered
vulnerabilities are covered by active ledger entries. Any untracked
vulnerability fails the build.

No direct remediation is possible without upstream `openclaw` releases.
Re-evaluation date: 2026-06-30.

## Impact

- 2 of 5 findings fully resolved by prior EP17 tasks
- 3 of 5 formally deferred with specific mitigations and re-evaluation dates
- Zero findings in "blocked, unknown timeline" state
