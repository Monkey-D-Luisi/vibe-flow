# Full Audit Report — 2026-02-27

## Metadata

| Field | Value |
|-------|-------|
| Date | 2026-02-27 |
| Auditor | Claude Opus 4.6 (automated) |
| Scope | Full monorepo audit — Product, Security, Architecture, Development |
| Branch | `main` (commit a69965b) |
| OpenClaw version | 2026.2.22-2 |
| Tool versions | Vitest 3.2.4 (product-team), Vitest 2.1.9 (quality-gate), ESLint, TypeScript strict |

## Evidence Baseline (Phase 1)

### Commands Executed

```
git status --short --branch   → ## main...origin/main (clean)
pnpm lint                     → PASS (2 packages)
pnpm typecheck                → PASS (2 packages)
pnpm test                     → PASS (504 tests: 359 product-team + 145 quality-gate, 3 skipped)
pnpm audit --prod --audit-level=critical → 14 vulnerabilities (1 low, 13 high)
pnpm audit --prod             → 14 vulnerabilities (1 low, 13 high)
```

### Repository Inventory

| Metric | Value |
|--------|-------|
| Total files (excl. node_modules, .git, .claude) | 1,348 |
| extensions/product-team | 157 files |
| extensions/quality-gate | 53 files |
| skills | 8 directories |
| packages | 24 files |
| docs | 110 files |
| .agent | 14 files |

### Coverage Summary

| Package | Lines | Statements | Functions | Branches |
|---------|-------|------------|-----------|----------|
| product-team | 87.51% | 87.51% | 95.13% | 79.21% |
| quality-gate | 46.49% | 46.49% | 58.33% | 80.73% |

### Hotspot Files (by line count)

| File | Lines |
|------|-------|
| `extensions/product-team/test/index.test.ts` | 684 |
| `extensions/product-team/test/orchestrator/transition-guards.test.ts` | 511 |
| `extensions/product-team/src/github/pr-bot.ts` | 464 |
| `extensions/product-team/src/github/ci-feedback.ts` | 430 |
| `extensions/product-team/src/tools/quality-gate.ts` | 394 |
| `scripts/enforce-ci-vulnerability-policy.ts` | 387 |

---

## Findings Table

| ID | Axis | Severity | Confidence | Evidence | Impact | Recommendation | Owner | Status |
|----|------|----------|------------|----------|--------|----------------|-------|--------|
| P-001 | Product | INFO | HIGH | CLAUDE.md commands vs package.json scripts | All 10 documented commands executable | No action | — | PASS |
| P-002 | Product | INFO | HIGH | `.agent/rules/` vs `.agent.md` references | All 6 workflow rules present | No action | — | PASS |
| P-003 | Product | INFO | HIGH | `docs/tasks/` vs `docs/walkthroughs/` | 31/31 task-walkthrough pairs verified | No action | — | PASS |
| P-004 | Product | INFO | HIGH | `skills/` directories vs `.agent.md` | All 8 skills present with SKILL.md | No action | — | PASS |
| P-005 | Product | INFO | HIGH | qcli.ts CLI vs documented commands | CLI commands match documented interface | No action | — | PASS |
| P-006 | Product | INFO | HIGH | `openclaw.plugin.json` schemas vs config types | Plugin config schema aligned with TypeScript types | No action | — | PASS |
| S-001 | Security | HIGH | CERTAIN | `pnpm audit --prod` | 13 HIGH transitive vulns (glob, tar, minimatch) via openclaw | Update openclaw when patched | maintainer | OPEN |
| S-002 | Security | LOW | CERTAIN | `pnpm audit --prod` | 1 LOW transitive vuln (fast-xml-parser) via openclaw | Update openclaw when patched | maintainer | OPEN |
| S-003 | Security | MEDIUM | CERTAIN | picomatch@2.3.1 in quality-gate/product-team | ReDoS risk via user-supplied glob patterns in exclude args | Update picomatch; add pattern length limits | dev | OPEN |
| S-004 | Security | INFO | CERTAIN | `exec/spawn.ts` lines 11-47 | Command injection MITIGATED: allowlist + SHELL_META regex + assertion | Maintain current practices | — | PASS |
| S-005 | Security | INFO | CERTAIN | `exec/spawn.ts` lines 54-61 | Path traversal MITIGATED: assertPathContained with relative-path check | Maintain current practices | — | PASS |
| S-006 | Security | INFO | CERTAIN | `github/webhook-signature.ts` lines 41-59 | Webhook auth SECURE: timingSafeEqual + length check + format validation | Maintain current practices | — | PASS |
| S-007 | Security | INFO | CERTAIN | `security/secret-detector.ts` | Secret detection SECURE: 7 patterns, recursive scrubbing, log integration | Maintain current practices | — | PASS |
| S-008 | Security | MEDIUM | CERTAIN | `quality-gate/cli/qcli.ts`, `fs/read.ts` | JSON parsing without file size limits — potential DoS | Add file size limits before JSON.parse() | dev | OPEN |
| S-009 | Security | INFO | CERTAIN | `persistence/task-repository.ts` | SQL injection MITIGATED: parameterized queries everywhere | Maintain current practices | — | PASS |
| A-001 | Architecture | INFO | HIGH | `packages/quality-contracts/` package structure | Quality contracts properly shared via workspace dependency | Maintain pattern | — | PASS |
| A-002 | Architecture | MEDIUM | HIGH | `product-team/src/quality/fs.ts` vs `quality-gate/src/fs/` | ~40 LOC duplicated file system utilities (glob, read) | Extract to `@openclaw/quality-contracts/fs/` | dev | OPEN |
| A-003 | Architecture | MEDIUM | HIGH | `product-team/src/exec/spawn.ts` vs `quality-gate/src/exec/spawn.ts` | 227-line security-critical spawn utility 99%+ duplicated | Extract to `@openclaw/quality-contracts/exec/spawn.ts` | dev | OPEN |
| A-004 | Architecture | LOW | HIGH | `product-team/src/quality/complexity/types.ts` vs `quality-gate/src/complexity/types.ts` | 45-line complexity types byte-for-byte identical | Move to `@openclaw/quality-contracts/complexity/types.ts` | dev | OPEN |
| A-005 | Architecture | INFO | HIGH | Dependency graph analysis | No circular dependencies: both extensions -> quality-contracts (one-way) | Maintain isolation | — | PASS |
| A-006 | Architecture | LOW | MEDIUM | `packages/schemas/` JSON schema files, `loadSchema()` utility | Unused JSON schemas drift from TypeScript tool schemas; loadSchema() never called | Remove or auto-generate from TypeScript | dev | OPEN |
| A-007 | Architecture | LOW | HIGH | `quality-gate/src/tools/complexity.ts` vs `product-team/src/tools/quality-complexity.ts` | Complexity analysis divergence: regex heuristic vs real AST parsing | Standardize on ts-morph/escomplex or document heuristic limitations | dev | OPEN |
| A-008 | Architecture | LOW | HIGH | `product-team/src/schemas/` vs `quality-gate/src/tools/` | Schema validation only in product-team (Typebox); quality-gate tools accept unvalidated input | Move quality tool schemas to contracts package | dev | OPEN |
| D-001 | Development | MEDIUM | HIGH | `product-team/src/exec/spawn.ts` — 32.33% line coverage | Security-critical command parsing/validation untested in product-team | Create `test/exec/spawn.test.ts` with security-focused tests | dev | OPEN |
| D-002 | Development | MEDIUM | HIGH | `quality-gate/test/` — mock-heavy tests | Lint/test tools mock safeSpawn; no real tool execution or output parsing | Add integration tests with real ESLint/Ruff fixtures | dev | OPEN |
| D-003 | Development | LOW | HIGH | `quality-metadata.ts`, `quality/fs.ts` — no test files | Utility modules with zero test coverage | Create test files for utility modules | dev | OPEN |
| D-004 | Development | MEDIUM | HIGH | vitest.config.ts thresholds: 45% lines/statements in both extensions | product-team actual 87% vs threshold 45%; quality-gate actual 46% vs threshold 45% | Raise thresholds: product-team to 85%, quality-gate to 50% | dev | OPEN |
| D-005 | Development | HIGH | HIGH | `.github/workflows/ci.yml` — vulnerability policy | CI gates HIGH/CRITICAL via exception ledger; stale exceptions may accumulate | Enforce exception expiry; monthly review cadence | dev | OPEN |
| D-006 | Development | MEDIUM | HIGH | `.github/workflows/ci.yml` — coverage policy | Coverage step runs after other checks; threshold failures may not block merge | Parse vitest output and fail workflow explicitly on threshold miss | dev | OPEN |
| D-007 | Development | HIGH | HIGH | `docs/runbook.md` lines 50-63 vs `openclaw.plugin.json` schema | Runbook shows `workflow` config not in plugin JSON Schema; runtime parses it | Extend schema to include `workflow` or remove from docs | dev | OPEN |
| D-008 | Development | MEDIUM | HIGH | `pr-bot.ts` (464L), `ci-feedback.ts` (430L) | Large files with mixed concerns increase maintainability risk | Refactor into smaller modules by responsibility | dev | OPEN |
| D-009 | Development | LOW | MEDIUM | `docs/adr/` — only ADR-001 | Key architectural decisions lack recorded rationale | Create ADRs for major decisions (SQLite, spawn split, quality-gate separation) | dev | OPEN |

---

## Detailed Findings by Axis

### 1. Product (Highest Priority)

**Overall status: PASS**

All documented functionality aligns with executable implementations:

- **Commands** (P-001): All 10 root package.json scripts (`test`, `lint`, `typecheck`, `build`, `q:gate`, `q:tests`, `q:coverage`, `q:lint`, `q:complexity`) match CLAUDE.md documentation. Root command surface verified by `scripts/verify-root-quality-gate-command-surface.ts`.

- **Workflow rules** (P-002): All 6 `.agent/rules/` workflow files exist and are referenced correctly from `.agent.md`.

- **Task-walkthrough pairing** (P-003): All 31 tasks in `docs/tasks/` have corresponding walkthroughs in `docs/walkthroughs/`.

- **Skills** (P-004): All 8 skill directories under `skills/` contain valid SKILL.md frontmatter files matching documented descriptions.

- **Quality-gate CLI** (P-005): CLI entrypoint `cli/qcli.ts` implements all documented flags (`--tests`, `--coverage`, `--lint`, `--complexity`, `--gate`). Root scripts delegate correctly via `pnpm --filter @openclaw/quality-gate q:cli run`.

- **Config schemas** (P-006): Plugin `openclaw.plugin.json` schemas for both extensions match TypeScript config types and documented defaults. Shared `packages/quality-contracts/` properly exports gate policy types.

---

### 2. Security

**Overall status: GOOD with transitive dependency exposure**

#### 2.1 Dependency Risk Triage

All 14 vulnerabilities are **transitive** through the `openclaw` package — none are direct dependencies of this monorepo.

| Package | Severity | Vuln Count | Via | Direct Use? | Risk |
|---------|----------|------------|-----|-------------|------|
| glob >=10.2.0 <10.5.0 | HIGH | 1 | openclaw > @google/genai > rimraf | No (uses fast-glob) | LOW practical |
| tar <=7.5.8 | HIGH | 4 | openclaw > node-llama-cpp > cmake-js | No | LOW practical |
| minimatch <3.1.3/9.0.6/10.2.3 | HIGH | 8 | openclaw > various | No (uses picomatch 2.3.1) | MEDIUM (picomatch ReDoS) |
| fast-xml-parser <5.3.8 | LOW | 1 | openclaw > @aws-sdk | No | LOW |

**Exploitability assessment**: The glob and tar vulns require direct CLI invocation or untrusted archive extraction, neither of which this repo does. The minimatch ReDoS is relevant because picomatch (a similar library) is used directly for user-supplied exclude patterns.

> Ref: [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2), [GHSA-r6q2-hw4h-h46w](https://github.com/advisories/GHSA-r6q2-hw4h-h46w), [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26)

#### 2.2 Code-Level Security — STRONG

**Command execution** (S-004): Both `exec/spawn.ts` implementations enforce:
- Command allowlist: `['pnpm', 'npx', 'npm', 'node', 'vitest', 'eslint', 'ruff', 'tsc']`
- Shell metacharacter blocking via `SHELL_META = /[;&|`$(){}!<>"'\\~\n\r]/` regex
- All spawn calls gated by `assertSafeCommand()` before execution

**Path containment** (S-005): `assertPathContained()` uses `path.relative()` to detect traversal, rejecting both `..` escapes and absolute paths outside root.

**Webhook auth** (S-006): `assertValidGithubWebhookSignature()` uses:
- `crypto.timingSafeEqual()` for constant-time comparison
- Length validation before comparison
- SHA-256 HMAC with format validation

**Secret handling** (S-007): `secret-detector.ts` detects GitHub PATs, OpenAI keys, AWS keys, private keys, and generic password/token patterns. Integrated into `correlated-logger.ts` for automatic log scrubbing.

**SQL injection** (S-009): All database operations use `better-sqlite3` prepared statements with parameterized queries.

> Ref: OpenClaw official security docs at [trust.openclaw.ai](https://trust.openclaw.ai); exec tool security model per `node_modules/openclaw/docs/tools/exec.md`

#### 2.3 Remaining Risks

- **S-003**: picomatch@2.3.1 used for user-supplied exclude patterns. While not directly a minimatch vuln, consider updating and adding pattern length limits.
- **S-008**: JSON parsing in CLI and quality tools has no file size limits. Add max size validation before `JSON.parse()`.

---

### 3. Architecture

**Overall status: GOOD with consolidation opportunities**

#### 3.1 Layer Boundaries — CLEAN

- No circular dependencies detected between extensions
- Both `product-team` and `quality-gate` depend on `@openclaw/quality-contracts` (one-way)
- GitHub-specific spawn (`github/spawn.ts`) is correctly separated from build-tool spawn (`exec/spawn.ts`)
- Gate policy logic properly centralized in `@openclaw/quality-contracts/gate/policy.ts`
- Plugin manifests comply with official OpenClaw plugin contract per `node_modules/openclaw/docs/plugins/manifest.md`

#### 3.2 Duplication Findings

**A-003 (MEDIUM)**: `exec/spawn.ts` is 99%+ identical between both extensions — 227 lines of security-critical code. This is the highest-priority consolidation target because vulnerability patches must currently be applied in two places.

**A-002 (MEDIUM)**: File system utilities (`resolveGlobPatterns()`, `readFileSafe()`, `readJsonFile()`) are ~95% duplicated across extensions.

**A-004 (LOW)**: Complexity types (`FunctionComplexity`, `FileComplexity`, `ComplexitySummary`, `DEFAULT_THRESHOLDS`) are byte-for-byte identical.

#### 3.3 Drift Findings

**A-007 (LOW)**: Complexity analysis uses real AST parsing (ts-morph/escomplex) in product-team but regex heuristics in quality-gate. This can produce different metrics for the same code.

**A-006 (LOW)**: JSON schema files in `packages/schemas/` are not linked to TypeScript tool definitions. The `loadSchema()` utility is exported but never imported anywhere.

**A-008 (LOW)**: Input validation exists only in product-team (via Typebox schemas). Quality-gate tools accept unvalidated `Record<string, unknown>`.

---

### 4. Development

**Overall status: NEEDS IMPROVEMENT**

#### 4.1 Test Depth

**D-001 (MEDIUM)**: `exec/spawn.ts` in product-team has only 32.33% line coverage. Critical security functions (`assertSafeCommand`, `assertPathContained`, `parseCommand`) lack dedicated tests. The quality-gate copy has tests in `test/spawn.test.ts` but the product-team copy does not.

**D-002 (MEDIUM)**: Quality-gate tests are heavily mock-based. Lint and test tools mock `safeSpawn` entirely, so real tool output parsing is never verified. Parser tests use fixture data rather than real tool output.

**D-003 (LOW)**: `quality-metadata.ts` (7 public functions for metadata merging) and `quality/fs.ts` have no test files.

#### 4.2 Coverage Thresholds

**D-004 (MEDIUM)**: Both extensions set identical thresholds (`statements: 45%, branches: 70%, functions: 50%, lines: 45%`) but actual coverage differs dramatically:
- product-team: 87.51% lines (42 points above threshold)
- quality-gate: 46.49% lines (barely above threshold)

Thresholds should be raised to prevent regression: product-team to ~85%, quality-gate to ~50%.

#### 4.3 CI Policy

**D-005 (HIGH)**: The CI vulnerability policy in `scripts/enforce-ci-vulnerability-policy.ts` gates only HIGH/CRITICAL severities and allows exceptions via a ledger. Stale exceptions are warned but don't fail CI, so known HIGH vulnerabilities can persist indefinitely.

**D-006 (MEDIUM)**: Coverage enforcement runs as a CI step but vitest threshold failures may not explicitly block merge if the step is not properly gated.

#### 4.4 Documentation Drift

**D-007 (HIGH)**: `docs/runbook.md` shows a `workflow` config block in plugin configuration examples, but `openclaw.plugin.json` schema has `additionalProperties: false` and does not include a `workflow` property. The runtime (`src/index.ts:152-153`) does parse `pluginConfig.workflow`. This means:
- Users following the runbook will get schema validation errors
- The schema contract and runtime behavior diverge

#### 4.5 Maintainability

**D-008 (MEDIUM)**: `pr-bot.ts` (464 lines) and `ci-feedback.ts` (430 lines) have mixed concerns (event handling, state management, utility functions, type definitions). Candidates for responsibility-based splitting.

**D-009 (LOW)**: Only 1 ADR exists (`ADR-001: Migration from MCP`). Key decisions like SQLite for persistence, separate quality-gate extension, and spawn utility split lack recorded rationale.

---

## Consolidated Remediation Roadmap

### Now (This Sprint)

| Priority | Finding | Action |
|----------|---------|--------|
| 1 | D-007 | Extend `openclaw.plugin.json` schema to include `workflow` property (or remove from runbook) |
| 2 | A-003 | Extract `exec/spawn.ts` to `@openclaw/quality-contracts` — security-critical dedup |
| 3 | D-005 | Add exception expiry enforcement to CI vulnerability policy; establish monthly review cadence |
| 4 | S-003 | Update picomatch; add glob pattern length validation |

### Next (Next Sprint)

| Priority | Finding | Action |
|----------|---------|--------|
| 5 | D-001 | Create `test/exec/spawn.test.ts` in product-team with security-focused tests |
| 6 | D-004 | Raise coverage thresholds (product-team: 85% lines, quality-gate: 50% lines) |
| 7 | A-002 | Extract fs utilities to `@openclaw/quality-contracts/fs/` |
| 8 | A-004 | Move complexity types to `@openclaw/quality-contracts/complexity/types.ts` |
| 9 | D-006 | Parse vitest coverage output in CI; fail workflow on threshold miss |
| 10 | S-008 | Add file size validation before JSON.parse() in CLI and quality tools |

### Later (Quarterly)

| Priority | Finding | Action |
|----------|---------|--------|
| 11 | D-002 | Add integration tests with real ESLint/Ruff output fixtures |
| 12 | D-008 | Refactor pr-bot.ts and ci-feedback.ts into smaller modules |
| 13 | A-007 | Standardize complexity analysis implementation across extensions |
| 14 | A-006 | Remove or auto-generate JSON schemas from TypeScript definitions |
| 15 | A-008 | Move quality tool input schemas to contracts package |
| 16 | D-009 | Create ADRs for major architectural decisions |
| 17 | S-001 | Update openclaw package when dependency patches available |
| 18 | D-003 | Create test files for quality-metadata.ts and quality/fs.ts |

---

## Open Questions and Accepted Risks

### Open Questions

1. **Schema vs runtime for `workflow` config** (D-007): Is the `workflow` property an intentional feature that needs schema declaration, or a deprecated/experimental property that should be removed from docs?

2. **Complexity metric standardization** (A-007): Should the quality-gate CLI use the same ts-morph/escomplex analysis as product-team, or is the lightweight heuristic intentional for CLI performance?

3. **Exception ledger governance** (D-005): What is the acceptable maximum age for a vulnerability exception? 30 days? 90 days?

### Accepted Risks

1. **Transitive dependency vulns** (S-001, S-002): All 14 vulnerabilities are transitive through `openclaw`. This repo does not directly use the vulnerable APIs (glob CLI, tar extraction, minimatch). Practical exploitability is LOW. Risk accepted until upstream patches are available.

2. **Quality-gate line coverage at 46%** (D-004): The quality-gate extension has low line coverage because several tool modules (`complexity.ts`, `coverage_report.ts`, `gate_enforce.ts`) are tested at the contract/parser level but not at the tool entrypoint level. The standalone CLI is not the primary deployment mode. Risk accepted with plan to raise threshold incrementally.

3. **Mock-heavy quality tool tests** (D-002): Quality tools mock `safeSpawn` because real tool execution (ESLint, vitest) requires a test project fixture. This is acceptable for unit tests but integration tests should be added over time.

---

## Official Sources Referenced

- OpenClaw Plugin Manifest: `node_modules/openclaw/docs/plugins/manifest.md` — Plugin JSON Schema requirements
- OpenClaw Plugin System: `node_modules/openclaw/docs/tools/plugin.md` — Extension discovery, config, safety model
- OpenClaw Exec Tool: `node_modules/openclaw/docs/tools/exec.md` — Command execution security model
- OpenClaw Exec Approvals: `node_modules/openclaw/docs/tools/exec-approvals.md` — Allowlist and approval enforcement
- OpenClaw Security: `node_modules/openclaw/docs/security/README.md` — Trust page and reporting
- OpenClaw Threat Model: `node_modules/openclaw/docs/security/THREAT-MODEL-ATLAS.md` — MITRE ATLAS-based threat model
- [GitHub Advisory GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2) — glob command injection
- [GitHub Advisory GHSA-r6q2-hw4h-h46w](https://github.com/advisories/GHSA-r6q2-hw4h-h46w) — tar race condition
- [GitHub Advisory GHSA-34x7-hfp2-rc4v](https://github.com/advisories/GHSA-34x7-hfp2-rc4v) — tar hardlink traversal
- [GitHub Advisory GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97) — tar symlink poisoning
- [GitHub Advisory GHSA-83g3-92jg-28cx](https://github.com/advisories/GHSA-83g3-92jg-28cx) — tar symlink chain escape
- [GitHub Advisory GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26) — minimatch ReDoS (wildcards)
- [GitHub Advisory GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj) — minimatch ReDoS (GLOBSTAR)
- [GitHub Advisory GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74) — minimatch ReDoS (extglobs)
- [GitHub Advisory GHSA-fj3w-jwp8-x2g3](https://github.com/advisories/GHSA-fj3w-jwp8-x2g3) — fast-xml-parser stack overflow
- [trust.openclaw.ai](https://trust.openclaw.ai) — OpenClaw Security & Trust

---

## Processing Ledger

Generated by findings-processing workflow on 2026-02-27.

| Finding ID | Severity | Task File | Walkthrough File | Status |
|------------|----------|-----------|------------------|--------|
| D-007 | HIGH | `docs/tasks/0022-fix-plugin-schema-workflow-config-drift.md` | `docs/walkthroughs/0022-fix-plugin-schema-workflow-config-drift.md` | DONE (pre-existing fix verified by task 0022) |
| D-005 | HIGH | `docs/tasks/0023-enforce-vulnerability-exception-expiry-in-ci.md` | `docs/walkthroughs/0023-enforce-vulnerability-exception-expiry-in-ci.md` | PLANNED |
| S-001 | HIGH | `docs/tasks/0024-track-and-remediate-transitive-dependency-vulnerabilities.md` | `docs/walkthroughs/0024-track-and-remediate-transitive-dependency-vulnerabilities.md` | PLANNED |
| S-002 | LOW | `docs/tasks/0024-track-and-remediate-transitive-dependency-vulnerabilities.md` | `docs/walkthroughs/0024-track-and-remediate-transitive-dependency-vulnerabilities.md` | PLANNED |
| S-003 | MEDIUM | `docs/tasks/0025-security-input-validation-hardening.md` | `docs/walkthroughs/0025-security-input-validation-hardening.md` | PLANNED |
| S-008 | MEDIUM | `docs/tasks/0025-security-input-validation-hardening.md` | `docs/walkthroughs/0025-security-input-validation-hardening.md` | PLANNED |
| A-002 | MEDIUM | `docs/tasks/0026-consolidate-exec-and-fs-utilities-to-shared-contracts.md` | `docs/walkthroughs/0026-consolidate-exec-and-fs-utilities-to-shared-contracts.md` | PLANNED |
| A-003 | MEDIUM | `docs/tasks/0026-consolidate-exec-and-fs-utilities-to-shared-contracts.md` | `docs/walkthroughs/0026-consolidate-exec-and-fs-utilities-to-shared-contracts.md` | PLANNED |
| D-001 | MEDIUM | `docs/tasks/0027-strengthen-behavioral-test-coverage.md` | `docs/walkthroughs/0027-strengthen-behavioral-test-coverage.md` | PLANNED |
| D-002 | MEDIUM | `docs/tasks/0027-strengthen-behavioral-test-coverage.md` | `docs/walkthroughs/0027-strengthen-behavioral-test-coverage.md` | PLANNED |
| D-004 | MEDIUM | `docs/tasks/0028-fix-coverage-thresholds-and-ci-enforcement.md` | `docs/walkthroughs/0028-fix-coverage-thresholds-and-ci-enforcement.md` | PLANNED |
| D-006 | MEDIUM | `docs/tasks/0028-fix-coverage-thresholds-and-ci-enforcement.md` | `docs/walkthroughs/0028-fix-coverage-thresholds-and-ci-enforcement.md` | PLANNED |
| D-008 | MEDIUM | `docs/tasks/0029-refactor-large-github-module-files.md` | `docs/walkthroughs/0029-refactor-large-github-module-files.md` | PLANNED |
| A-004 | LOW | `docs/tasks/0030-consolidate-shared-types-and-schemas-in-quality-contracts.md` | `docs/walkthroughs/0030-consolidate-shared-types-and-schemas-in-quality-contracts.md` | PLANNED |
| A-006 | LOW | `docs/tasks/0030-consolidate-shared-types-and-schemas-in-quality-contracts.md` | `docs/walkthroughs/0030-consolidate-shared-types-and-schemas-in-quality-contracts.md` | PLANNED |
| A-007 | LOW | `docs/tasks/0030-consolidate-shared-types-and-schemas-in-quality-contracts.md` | `docs/walkthroughs/0030-consolidate-shared-types-and-schemas-in-quality-contracts.md` | PLANNED |
| A-008 | LOW | `docs/tasks/0030-consolidate-shared-types-and-schemas-in-quality-contracts.md` | `docs/walkthroughs/0030-consolidate-shared-types-and-schemas-in-quality-contracts.md` | PLANNED |
| D-003 | LOW | `docs/tasks/0031-add-utility-module-tests-and-architectural-decision-records.md` | `docs/walkthroughs/0031-add-utility-module-tests-and-architectural-decision-records.md` | PLANNED |
| D-009 | LOW | `docs/tasks/0031-add-utility-module-tests-and-architectural-decision-records.md` | `docs/walkthroughs/0031-add-utility-module-tests-and-architectural-decision-records.md` | PLANNED |
