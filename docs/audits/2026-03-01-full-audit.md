# Full Audit Report — 2026-03-01

## Metadata

| Field | Value |
|-------|-------|
| Date | 2026-03-01 |
| Auditor | Claude Opus 4.6 (automated) |
| Scope | Full monorepo audit — Product, Security, Architecture, Development |
| Branch | `main` (commit 3fb8440, post-merge of PR #209) |
| OpenClaw version | 2026.2.22-2 |
| Tool versions | Vitest 3.2.4 (product-team, team-ui), Vitest 2.1.9 (quality-gate), ESLint 8.57.1, TypeScript 5.7 strict |
| Previous audit | [2026-02-27-full-audit.md](2026-02-27-full-audit.md) |

---

## Evidence Baseline (Phase 1)

### Commands Executed

```
git status --short --branch   → ## main...origin/main (clean, 2 untracked: .claude/worktrees/, this report)
pnpm lint                     → PASS (all 9 workspace packages)
pnpm typecheck                → PASS (all 9 workspace packages)
pnpm test                     → PASS (748 tests: 493 product-team + 149 quality-gate + 23 team-ui + 32 telegram + 22 stitch-bridge + 21 create-extension + 8 model-router)
pnpm audit --prod --audit-level=critical → 0 critical, 13 high, 1 moderate, 1 low (15 total)
pnpm audit --prod             → 15 vulnerabilities (1 low, 1 moderate, 13 high)
```

### Repository Inventory

| Metric | Value |
|--------|-------|
| Total files (excl. node_modules, .git, .claude, actions-runner) | 832 |
| TypeScript source files | 280 |
| Extensions | 6 (product-team, quality-gate, team-ui, model-router, telegram-notifier, stitch-bridge) |
| Skills | 14 directories |
| Packages | 2 (quality-contracts, schemas) |
| Tools | 1 (create-extension) |

### Coverage Summary

| Package | Lines | Functions | Branches |
|---------|-------|-----------|----------|
| quality-gate | 61.36% | 63.15% | 81.70% |
| product-team | coverage json empty — config present | | |
| team-ui | not yet measured (new) | | |
| create-extension | 83.89% | 100% | 82.22% |

### Hotspot Files (source, by line count)

| File | Lines |
|------|-------|
| `extensions/product-team/src/index.ts` | 397 |
| `extensions/product-team/src/tools/quality-gate.ts` | 394 |
| `extensions/product-team/src/orchestrator/transition-guards.ts` | 357 |
| `extensions/quality-gate/cli/qcli.ts` | 349 |
| `extensions/product-team/src/github/gh-client.ts` | 319 |
| `extensions/quality-gate/src/tools/gate_enforce.ts` | 318 |
| `extensions/product-team/src/github/ci-feedback-utils.ts` | 310 |
| `packages/quality-contracts/src/gate/alerts.ts` | 289 |
| `packages/quality-contracts/src/gate/auto-tune.ts` | 257 |
| `extensions/product-team/src/orchestrator/event-log.ts` | 257 |

---

## Findings Table

| ID | Axis | Severity | Confidence | Evidence | Impact | Recommendation | Owner | Status |
|----|------|----------|------------|----------|--------|----------------|-------|--------|
| P-001 | Product | MEDIUM | HIGH | CLAUDE.md commands table vs actual registered tools/skills | CLAUDE.md documents 10 commands but product-team registers 31 tools and 14 skills — 15 tools and 6 skills undocumented | Update CLAUDE.md tool/skill inventory | dev | OPEN |
| P-002 | Product | MEDIUM | HIGH | `packages/schemas/*.schema.json` vs tool validation code | JSON schemas in `packages/schemas/` define input/output contracts but are never consumed by any tool; tools use inline TypeBox/JSON schemas instead | Either wire schemas into validation pipeline or remove stale package | dev | OPEN |
| P-003 | Product | LOW | HIGH | `docs/tasks/0047-config-web-ui.md` acceptance criteria | Task marked DONE but 6/10 acceptance criteria explicitly deferred as scaffold — partially addressed in CR-0209 | Already addressed in CR-0209 | — | FIXED |
| P-004 | Product | INFO | HIGH | CLAUDE.md commands vs executable commands, `.agent/rules/` | All 6 workflow rules present and executable | No action | — | PASS |
| P-005 | Product | INFO | HIGH | `docs/tasks/` vs `docs/walkthroughs/` | All task-walkthrough pairs verified including new 0047 and cr-0209 | No action | — | PASS |
| S-001 | Security | HIGH | CERTAIN | `pnpm audit --prod` | 13 HIGH transitive vulns (glob, tar, minimatch) via openclaw — all covered by active ledger exceptions expiring 2026-05-28 | Update openclaw when patched upstream | Infra | OPEN |
| S-002 | Security | LOW | CERTAIN | `pnpm audit --prod` | 1 LOW transitive vuln (fast-xml-parser via AWS SDK) — covered by active ledger exception | Update openclaw when patched | Infra | OPEN |
| S-003 | Security | MODERATE | CERTAIN | `pnpm audit --prod` | 1 MODERATE vuln (new since last audit) — needs ledger exception entry | Triage and add to vulnerability ledger | dev | NEW |
| S-004 | Security | MEDIUM | HIGH | `quality-gate/cli/qcli.ts`, `fs/read.ts` | JSON parsing without file-size limits — potential DoS on large crafted inputs | Add file-size limits before JSON.parse() | dev | OPEN (carried from S-008) |
| S-005 | Security | INFO | CERTAIN | `exec/spawn.ts`, `webhook-signature.ts`, `secret-detector.ts`, `persistence/*.ts` | Command injection, path traversal, webhook auth, SQL injection, secret detection all MITIGATED with defense-in-depth | Maintain current practices | — | PASS |
| A-001 | Architecture | HIGH | CERTAIN | `quality-gate/src/complexity/escomplex.ts` = `product-team/src/quality/complexity/escomplex.ts` (70 LOC identical) | Fully duplicated complexity implementation not extracted to quality-contracts | Extract `escomplex.ts` to `@openclaw/quality-contracts` | dev | OPEN |
| A-002 | Architecture | HIGH | CERTAIN | `quality-gate/src/complexity/tsmorph.ts` = `product-team/src/quality/complexity/tsmorph.ts` (128 LOC identical) | Fully duplicated AST complexity implementation | Extract `tsmorph.ts` to `@openclaw/quality-contracts` | dev | OPEN |
| A-003 | Architecture | HIGH | HIGH | Both extensions register tools named `quality.complexity`, `quality.lint`, `quality.coverage`, `quality.tests`, `quality.gate` | 5 tool-name collisions — if both loaded simultaneously, behavior is undefined | Namespace quality-gate tools differently or document mutual exclusion | dev | OPEN |
| A-004 | Architecture | MEDIUM | HIGH | `packages/schemas/` — zero consumers, zero TypeScript imports | Orphaned package occupies workspace slot but serves no function | Delete or integrate into tool validation | dev | OPEN |
| A-005 | Architecture | MEDIUM | HIGH | `quality-gate/package.json` `openclaw.extensions: ["./index.ts"]` vs all others `["./src/index.ts"]` | Inconsistent manifest entry point path — quality-gate also missing `main` field | Align entry point paths across all extensions | dev | OPEN |
| A-006 | Architecture | MEDIUM | HIGH | quality-gate `complexity.ts` uses regex heuristics; product-team uses AST analysis | Same tool name `quality.complexity` produces different numbers for same code | Standardize on AST analysis or document divergence | dev | OPEN |
| A-007 | Architecture | MEDIUM | HIGH | `packages/quality-contracts` has zero direct tests | Shared foundation package relies entirely on transitive testing via consumers | Add dedicated test suite for quality-contracts | dev | OPEN |
| A-008 | Architecture | LOW | HIGH | `vitest` version drift: quality-gate `^2.0.5`, product-team `^3.0.0`, quality-contracts `^4.0.18` | Different test framework versions across workspace | Align devDependency versions | dev | OPEN |
| D-001 | Development | HIGH | HIGH | `extensions/team-ui/` had zero tests pre-CR-0209 | New extension shipped without test coverage — fixed in CR-0209 (23 tests added) | Already addressed in CR-0209 | — | FIXED |
| D-002 | Development | MEDIUM | HIGH | product-team coverage summary JSON is empty | Coverage reporting may be misconfigured — unable to measure actual coverage | Fix coverage configuration and add coverage thresholds | dev | OPEN |
| D-003 | Development | MEDIUM | HIGH | `.github/workflows/ci.yml` — quality-gate check is informational only | Quality gate failures don't block merge in branch protection | Make quality-gate a required status check | dev | OPEN |
| D-004 | Development | MEDIUM | HIGH | `product-team/src/index.ts` (397 LOC) registers 31 tools + 14 skills in one file | High complexity mainline file — difficult to maintain/review | Split registration into domain-grouped modules | dev | OPEN |
| D-005 | Development | LOW | HIGH | `actions-runner/` directory with `.credentials` inside repo tree | Self-hosted runner installed inside repo — credentials should be external | Move runner installation outside repository tree | Infra | OPEN |

---

## Phase 2: Product Findings (detail)

### P-001: Documentation undercount of tools and skills

CLAUDE.md lists 10 commands mapped to 6 workflow rules, plus references to `pnpm q:gate`, `pnpm q:tests`, etc. However the product-team extension registers **31 tools** (e.g., `task.create`, `task.update`, `task.search`, `vcs.pr.create`, `vcs.branch.create`, `quality.gate`, `pipeline.transition`, `decision.record`, `cost.estimate`, plus 22 more) and **14 skills** (e.g., `adr`, `architecture-design`, `code-review`, `github-automation`, `qa-testing`, `requirements-grooming`, `tdd-implementation`, plus 7 more). Of these, 15 tools and 6 skills are undocumented in CLAUDE.md.

**Evidence**: `extensions/product-team/src/tools/index.ts` lines 91-127 (tool registrations), `skills/` directory listing (14 SKILL.md files), `CLAUDE.md` commands table.

### P-002: Orphaned JSON schemas in `packages/schemas/`

The `packages/schemas/` package contains 11 `.schema.json` files (e.g., `quality_coverage.input.schema.json`, `quality_lint.output.schema.json`) defining input/output contracts for quality tools. However, **zero code files** import from `@openclaw/schemas`. The product-team extension uses TypeBox schemas in `src/schemas/*.schema.ts`, and quality-gate uses inline JSON schema objects. The schemas package has no scripts, no dependencies, and no exports in package.json.

**Evidence**: `packages/schemas/package.json` (name/version only), grep `@openclaw/schemas` found 0 TypeScript imports.

---

## Phase 3: Security Findings (detail)

### S-001 / S-002: Transitive dependency vulnerabilities (carried)

15 vulnerabilities detected by `pnpm audit --prod` (13 high, 1 moderate, 1 low). All 13 high + 1 low are **covered by active ledger exceptions** in `docs/security-vulnerability-exception-ledger.md`, with expiry 2026-05-28. CI enforces this via `pnpm verify:vuln-policy`.

Affected packages (all transitive via `openclaw`):
- `glob` 10.4.5 — command injection via `-c/--cmd` ([GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2))
- `tar` 6.2.1 — 4 advisories (race condition, symlink, buffer overflow) via `openclaw>node-llama-cpp>cmake-js>tar`
- `minimatch` 3.1.2 / 9.0.5 / 10.2.2 — ReDoS via GLOBSTAR/extglobs, 7 advisory paths
- `fast-xml-parser` 5.3.6 — entity expansion via AWS SDK chain (LOW)

**Citation**: [OpenClaw Trust page](https://trust.openclaw.ai) for upstream security reporting.

### S-003: New moderate vulnerability

`pnpm audit --prod` reports 1 MODERATE vulnerability not present in the previous audit. This needs triage and a ledger exception entry if it's transitive.

### S-004: Unbounded JSON parsing (carried)

The quality-gate CLI (`cli/qcli.ts`) and `fs/read.ts` parse JSON files without checking file size first. A crafted multi-GB JSON file could cause OOM/DoS.

**Evidence**: `extensions/quality-gate/cli/qcli.ts`, `extensions/quality-gate/src/fs/read.ts` — `JSON.parse()` called on `fs.readFileSync()` with no size guard.

### S-005: Security controls PASS

| Control | Location | Status |
|---------|----------|--------|
| Command injection prevention | `exec/spawn.ts` lines 11-47 (allowlist + SHELL_META regex) | PASS |
| Path traversal prevention | `exec/spawn.ts` lines 54-61 (assertPathContained) | PASS |
| Webhook authentication | `github/webhook-signature.ts` lines 41-59 (timingSafeEqual) | PASS |
| Secret detection | `security/secret-detector.ts` (7 patterns, recursive) | PASS |
| SQL injection prevention | `persistence/task-repository.ts` (parameterized queries) | PASS |

**Citation**: [OpenClaw Threat Model](node_modules/openclaw/docs/security/THREAT-MODEL-ATLAS.md) — MITRE ATLAS-based model.

---

## Phase 4: Architecture Findings (detail)

### A-001 / A-002: Duplicated complexity analysis modules

`escomplex.ts` (70 LOC) and `tsmorph.ts` (128 LOC) are **character-identical** between `extensions/quality-gate/src/complexity/` and `extensions/product-team/src/quality/complexity/`. Both import types from `@openclaw/quality-contracts/complexity/types` but contain the full implementation inline. Every other shared module (parsers, gate policy, auto-tune, alerts) was correctly extracted to `@openclaw/quality-contracts` — these two were missed.

**Evidence**: `extensions/quality-gate/src/complexity/escomplex.ts` vs `extensions/product-team/src/quality/complexity/escomplex.ts` — identical 70 lines. Same for `tsmorph.ts` — identical 128 lines.

### A-003: Tool name collision

Both quality-gate and product-team register tools with identical names: `quality.complexity`, `quality.lint`, `quality.coverage`, `quality.tests`, `quality.gate`. The implementations differ significantly — quality-gate tools are stateless standalone tools; product-team tools integrate with the task lifecycle (calling `getTaskOrThrow()`, `beginQualityExecution()`, etc.). If both extensions are loaded simultaneously, behavior is undefined.

**Evidence**: `extensions/quality-gate/src/tools/index.ts` lines 29-37, `extensions/product-team/src/tools/index.ts` lines 91-127.

### A-004: Orphaned `@openclaw/schemas` package

`packages/schemas/` contains 11 JSON schema files but zero TypeScript consumers. Listed in `pnpm-workspace.yaml` but functionally dead.

### A-005: Inconsistent extension manifests

quality-gate uses `openclaw.extensions: ["./index.ts"]` while all 5 other extensions use `["./src/index.ts"]`. quality-gate also lacks the `main` field present in all other package.json files.

**Evidence**: All 6 extension `package.json` files compared.

### A-006: Divergent complexity algorithms under same tool name

quality-gate's `quality.complexity` tool uses a regex-based heuristic (`countCyclomaticSimple()` — counts `if`, `for`, `&&` keywords, lines 40-63). product-team's `quality.complexity` tool uses proper AST analysis via `analyzeWithEscomplex()` + `analyzeWithTsMorph()`. Same tool name, different numerical results.

### A-007: Shared package without direct tests

`@openclaw/quality-contracts` is the shared foundation consumed by both quality-gate and product-team. It has no `test/` directory and no `test` script. Testing is purely transitive via consumers, including a parity test in quality-gate.

### A-008: DevDependency version drift

| Package | quality-gate | product-team | quality-contracts |
|---------|-------------|-------------|-------------------|
| vitest | ^2.0.5 | ^3.0.0 | ^4.0.18 |
| @vitest/coverage-v8 | ^2.0.5 | ^3.2.4 | ^4.0.18 |
| typescript | ^5.6.2 | ^5.7.0 | — |

---

## Phase 5: Development Findings (detail)

### D-001: team-ui shipped without tests (FIXED)

The new `team-ui` extension was delivered with `passWithNoTests: true` and zero test files. Fixed in CR-0209: 23 tests added covering plugin registration (12 methods, HTTP route), config handling (null, invalid types, custom basePath), HTTP method restriction (405 for non-GET), and all 12 handler modules.

### D-002: product-team coverage not measurable

The `coverage-summary.json` for product-team exists but contains only empty/default values. This may indicate a clean run without coverage flags or a misconfiguration. The previous audit reported 87.51% line coverage — current state cannot be verified from artifacts.

### D-003: Quality gate check is informational

The `.github/workflows/ci.yml` runs quality-gate as a separate job but branch protection does not require it to pass. Only `test-lint-build` and `semgrep-cloud-platform/scan` are required checks.

### D-004: Monolithic index.ts registration

`extensions/product-team/src/index.ts` (397 LOC) registers 31 tools, 14 skills, persistence setup, webhook handlers, CI feedback hooks, and lifecycle management in a single file. This is the largest source file in the extension and a maintainability hotspot.

### D-005: Self-hosted runner in repo tree

The `actions-runner/` directory contains a full GitHub Actions self-hosted runner installation including `.credentials` (OAuth client ID), `.credentials_rsaparams` (RSA keys), and a 98MB runner zip. It is gitignored but resides in the repo working tree.

---

## Phase 6: Official Sources

| Source | URL | Consulted for |
|--------|-----|--------------|
| OpenClaw Security & Trust | [trust.openclaw.ai](https://trust.openclaw.ai) | Vulnerability reporting procedures |
| OpenClaw Threat Model | `node_modules/openclaw/docs/security/THREAT-MODEL-ATLAS.md` | MITRE ATLAS-based threat assessment |
| OpenClaw Security README | `node_modules/openclaw/docs/security/README.md` | Security contact and disclosure |
| GitHub Security Advisories | Referenced per finding (GHSA links) | Vulnerability verification per S-001 entries |
| Vulnerability Exception Ledger | `docs/security-vulnerability-exception-ledger.md` | CI policy verification |

---

## Remediation Roadmap

### Now (immediate)

| Finding | Action |
|---------|--------|
| S-003 | Triage moderate vulnerability, add to exception ledger or resolve |
| D-003 | Add `quality-gate` as required status check in branch protection |
| A-005 | Align quality-gate manifest entry point to `./src/index.ts` pattern |

### Next (within sprint)

| Finding | Action |
|---------|--------|
| A-001, A-002 | Extract `escomplex.ts` + `tsmorph.ts` to `@openclaw/quality-contracts` |
| A-003 | Namespace quality-gate tools (e.g., `qgate.*`) or document mutual exclusion |
| A-006 | Standardize complexity algorithm — use AST in both or document divergence |
| A-007 | Add direct tests for `@openclaw/quality-contracts` |
| D-002 | Fix product-team coverage reporting configuration |
| D-004 | Split product-team `index.ts` registration into domain modules |
| P-001 | Update CLAUDE.md with complete tool/skill inventory |

### Later (backlog)

| Finding | Action |
|---------|--------|
| A-004, P-002 | Decide on `@openclaw/schemas` — consume or delete |
| A-008 | Align devDependency versions across workspace (vitest, typescript) |
| S-004 | Add file-size guards to JSON parsing in quality-gate |
| D-005 | Move actions-runner installation outside repository tree |
| S-001, S-002 | Upgrade openclaw when upstream resolves transitive vuln chains |

---

## Open Questions and Accepted Risks

1. **quality-gate + product-team coexistence**: Are both extensions intended to be loaded simultaneously? If yes, tool name collision (A-003) is a bug. If mutually exclusive, this should be documented.

2. **EP08 scope**: Task 0047 is marked DONE but acceptance criteria show 6/10 items deferred. Is this intentional "scaffold done" or should a follow-up task be created for the full UI?

3. **actions-runner credentials**: The `.credentials` file in `actions-runner/` contains an OAuth client ID. While gitignored, this is a hygiene risk — accepted risk as long as `.gitignore` is maintained.

4. **Coverage gap**: product-team coverage cannot be independently verified from current artifacts. Accepted risk pending D-002 resolution.

---

## Processing Ledger

_Generated: 2026-03-01 by process-findings workflow (branch: fix/findings-2026-03-01)_

| Finding ID | Task File | Walkthrough File | Status |
|------------|-----------|------------------|--------|
| S-001 | [0048-s001-transitive-vulns.md](../tasks/0048-s001-transitive-vulns.md) | [0048-s001-transitive-vulns.md](../walkthroughs/0048-s001-transitive-vulns.md) | BLOCKED |
| S-002 | [0052-s002-s003-vuln-ledger.md](../tasks/0052-s002-s003-vuln-ledger.md) | [0052-s002-s003-vuln-ledger.md](../walkthroughs/0052-s002-s003-vuln-ledger.md) | DONE_VERIFIED |
| S-003 | [0052-s002-s003-vuln-ledger.md](../tasks/0052-s002-s003-vuln-ledger.md) | [0052-s002-s003-vuln-ledger.md](../walkthroughs/0052-s002-s003-vuln-ledger.md) | DONE_VERIFIED |
| S-004 | [0059-s004-d002-pre-verified.md](../tasks/0059-s004-d002-pre-verified.md) | [0059-s004-d002-pre-verified.md](../walkthroughs/0059-s004-d002-pre-verified.md) | DONE_VERIFIED |
| A-001 | [0049-a001-extract-escomplex.md](../tasks/0049-a001-extract-escomplex.md) | [0049-a001-extract-escomplex.md](../walkthroughs/0049-a001-extract-escomplex.md) | DONE_VERIFIED |
| A-002 | [0050-a002-extract-tsmorph.md](../tasks/0050-a002-extract-tsmorph.md) | [0050-a002-extract-tsmorph.md](../walkthroughs/0050-a002-extract-tsmorph.md) | DONE_VERIFIED |
| A-003 | [0051-a003-qgate-namespacing.md](../tasks/0051-a003-qgate-namespacing.md) | [0051-a003-qgate-namespacing.md](../walkthroughs/0051-a003-qgate-namespacing.md) | DONE_VERIFIED |
| A-004 | [0055-p002-a004-delete-schemas.md](../tasks/0055-p002-a004-delete-schemas.md) | [0055-p002-a004-delete-schemas.md](../walkthroughs/0055-p002-a004-delete-schemas.md) | DONE_VERIFIED |
| A-005 | [0053-a005-a008-manifest-depdeps.md](../tasks/0053-a005-a008-manifest-depdeps.md) | [0053-a005-a008-manifest-depdeps.md](../walkthroughs/0053-a005-a008-manifest-depdeps.md) | DONE_VERIFIED |
| A-006 | [0054-p001-a006-docs-inventory.md](../tasks/0054-p001-a006-docs-inventory.md) | [0054-p001-a006-docs-inventory.md](../walkthroughs/0054-p001-a006-docs-inventory.md) | DONE_VERIFIED |
| A-007 | [0056-a007-quality-contracts-tests.md](../tasks/0056-a007-quality-contracts-tests.md) | [0056-a007-quality-contracts-tests.md](../walkthroughs/0056-a007-quality-contracts-tests.md) | DONE_VERIFIED |
| A-008 | [0053-a005-a008-manifest-depdeps.md](../tasks/0053-a005-a008-manifest-depdeps.md) | [0053-a005-a008-manifest-depdeps.md](../walkthroughs/0053-a005-a008-manifest-depdeps.md) | DONE_VERIFIED |
| P-001 | [0054-p001-a006-docs-inventory.md](../tasks/0054-p001-a006-docs-inventory.md) | [0054-p001-a006-docs-inventory.md](../walkthroughs/0054-p001-a006-docs-inventory.md) | DONE_VERIFIED |
| P-002 | [0055-p002-a004-delete-schemas.md](../tasks/0055-p002-a004-delete-schemas.md) | [0055-p002-a004-delete-schemas.md](../walkthroughs/0055-p002-a004-delete-schemas.md) | DONE_VERIFIED |
| D-002 | [0059-s004-d002-pre-verified.md](../tasks/0059-s004-d002-pre-verified.md) | [0059-s004-d002-pre-verified.md](../walkthroughs/0059-s004-d002-pre-verified.md) | DONE_VERIFIED |
| D-003 | [0057-d003-ci-quality-gate.md](../tasks/0057-d003-ci-quality-gate.md) | [0057-d003-ci-quality-gate.md](../walkthroughs/0057-d003-ci-quality-gate.md) | DONE_VERIFIED |
| D-004 | [0058-d004-registration-refactor.md](../tasks/0058-d004-registration-refactor.md) | [0058-d004-registration-refactor.md](../walkthroughs/0058-d004-registration-refactor.md) | DONE_VERIFIED |
| D-005 | [0060-d005-runner-outside-repo.md](../tasks/0060-d005-runner-outside-repo.md) | [0060-d005-runner-outside-repo.md](../walkthroughs/0060-d005-runner-outside-repo.md) | BLOCKED |

*Report generated: 2026-03-01 by Claude Opus 4.6 (automated full audit workflow)*
