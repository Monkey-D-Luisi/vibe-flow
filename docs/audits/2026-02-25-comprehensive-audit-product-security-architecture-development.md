# Comprehensive Audit: Product > Security > Architecture > Development

| Field | Value |
|-------|-------|
| Date | 2026-02-25 |
| Auditor | Codex (GPT-5) |
| Scope | Full repository code and docs (`extensions/`, `packages/`, `skills/`, `docs/`, `.github/`) plus local official OpenClaw docs and official web references |
| Branch | `main` |
| Workflow | `.agent/rules/full-audit-workflow.md` |

---

## Metadata, Scope, Commands, and Evidence

### Scope and depth

- Code audited:
  - `extensions/product-team/`
  - `extensions/quality-gate/`
  - `packages/schemas/`
  - `skills/`
  - `.github/workflows/`
- Documentation audited:
  - governance (`.agent.md`, `AGENTS.md`, `.github/copilot-instructions.md`)
  - operational docs (`docs/runbook.md`, `docs/extension-integration.md`, backlog/tasks)
- Official sources pass:
  - local official docs under installed `openclaw/docs`
  - official web links (`openclaw.ai`, `trust.openclaw.ai`)
  - advisory pages from `pnpm audit`

### Preflight baseline (mandatory commands)

| Command | Result | Evidence |
|---------|--------|----------|
| `git status --short --branch` | PASS | `## main...origin/main`; working tree contains governance and audit file changes plus pre-existing untracked files (`.claude/worktrees/`, `docs/audits/2026-02-25-open-issues-triage.md`). |
| `pnpm lint` | PASS | Workspace lint passed for `@openclaw/quality-gate` and `@openclaw/plugin-product-team`. |
| `pnpm typecheck` | PASS | Workspace TypeScript checks passed for both extensions. |
| `pnpm test` | PASS (with warnings) | All suites passed (`quality-gate`: 132 passed; `product-team`: 327 passed). Runtime emitted `MaxListenersExceededWarning` for `exit/SIGINT/SIGTERM`. |
| `pnpm audit --prod --audit-level=critical` | PASS gate | No critical vulnerabilities; summary still reported `1 moderate | 7 high`. |
| `pnpm audit --prod` | FAIL (expected for triage) | `8 vulnerabilities`: `7 high`, `1 moderate` with advisory links. |

### Repository inventory metrics

- Total tracked files via `rg --files`: `276`
- Files in audited directories (`extensions`, `packages`, `skills`, `docs`): `367`
- Per top-level audited area:
  - `extensions=286`
  - `packages=12`
  - `skills=8`
  - `docs=61`
  - `.github=4`
- Source/test file counts:
  - `product-team`: `src=85`, `test=55`
  - `quality-gate`: `src=21`, `test=14`
- Hotspots (excluding `node_modules`, `dist`, `coverage`, `.qreport`):
  - `extensions/product-team/test/orchestrator/transition-guards.test.ts` (457 lines)
  - `extensions/product-team/src/github/pr-bot.ts` (404 lines)
  - `extensions/product-team/src/github/ci-feedback.ts` (391 lines)
  - `extensions/product-team/src/index.ts` (356 lines)
  - `.github/workflows/project-sync.yml` (339 lines)
- Coverage summary artifacts:
  - `product-team`: statements `87.28%`, branches `78.38%`, functions `95.85%`, lines `87.28%`
  - `quality-gate` coverage-final aggregate: statements `511/1640 (31.16%)`, functions `28/41 (68.29%)`, branches `173/206 (83.98%)`

---

## Findings Table

| ID | Axis | Severity | Confidence | Evidence | Impact | Recommendation | Owner | Status |
|----|------|----------|------------|----------|--------|----------------|-------|--------|
| P-001 | Product | MUST_FIX | High | `package.json` root scripts; `pnpm q:gate` fails (`Command "q:gate" not found`); docs reference `pnpm q:gate/q:*` | Documented command surface is not executable from repo root | Add root `q:*` scripts (delegating to `@openclaw/quality-gate`) or update all docs to real command contract | DX + Docs | OPEN |
| P-002 | Product | MUST_FIX | High | `run_tests.ts:10,40-41`; `lint.ts:13,50-51`; CLI execution fails with `UNSAFE_COMMAND` for defaults | Primary quality-gate CLI flows (`--tests`, `--lint`) fail out-of-box | Parse command first, validate executable token, then validate args; align defaults with validator semantics | quality-gate | OPEN |
| P-003 | Product | MUST_FIX | High | `docs/runbook.md:50-63` vs `openclaw.plugin.json:14-72` (`additionalProperties:false`, no `workflow`) | Runbook config example can be rejected by strict plugin schema validation | Either extend `configSchema` with `workflow` block or remove that block from runbook and document actual supported config | product-team + Docs | OPEN |
| S-001 | Security | HIGH | High | `pnpm audit --prod` output (`glob/tar/minimatch` advisories via transitive `openclaw` chain) | Known high vulnerabilities remain in dependency graph | Track upstream `openclaw` updates aggressively; fail CI at least on `high` or maintain explicit risk exceptions | Security + Dependency owners | OPEN |
| S-002 | Security | MODERATE | High | `pnpm audit --prod` shows `ajv` (`>=7 <8.18`); both extensions pin `^8.17.1` | Direct dependency has published ReDoS advisory | Upgrade `ajv` to `>=8.18.0`, rerun full tests and schema validations | product-team + quality-gate | OPEN |
| S-003 | Security | HIGH | Medium | `index.ts:317-374` webhook route handles `x-github-event`; no `x-hub-signature-256` verification path | If webhook route is enabled and reachable, forged payload risk remains despite repository-name check | Add HMAC signature verification with shared secret and fail-closed behavior | product-team | OPEN |
| A-001 | Architecture | SHOULD_FIX | High | SHA256 equality check: parser files (`eslint/ruff/vitest/istanbul`) are duplicated across both extensions | Duplicate source-of-truth increases long-term drift and patch risk | Extract shared parser package/module and import from both extensions | Architecture | OPEN |
| A-002 | Architecture | SHOULD_FIX | High | `gate/policy.ts` vs `quality/gate-policy.ts` differ (`skip` vs `fail` messaging for missing data) | Same conceptual gate policy yields different outcomes by execution path | Define one canonical policy contract and reuse implementation | Architecture + Quality owners | OPEN |
| A-003 | Architecture | SHOULD_FIX | High | Runtime consumes `pluginConfig.workflow` (`index.ts:152-153,209`) while manifest schema omits it (`openclaw.plugin.json`) | Runtime behavior and declared contract diverge | Keep runtime config parsing and schema in strict sync; enforce via schema contract tests | product-team | OPEN |
| A-004 | Architecture | SHOULD_FIX | High | `index.ts:192-194` registers process listeners per registration; tests show `MaxListenersExceededWarning` | Lifecycle leak/noise during repeated initialization, can hide real warnings | Make shutdown hooks idempotent or register once globally with guard | product-team | OPEN |
| D-001 | Development | SHOULD_FIX | High | `quality-gate/test/lint.tool.test.ts` is mostly mocked; `run_tests` test file search returns `NO_MATCH` | Behavior regressions can ship despite green tests | Add behavior-level tests for `lintTool` and `runTestsTool` command handling/parsing/error paths | quality-gate | OPEN |
| D-002 | Development | SHOULD_FIX | Medium | `quality-gate/vitest.config.ts` excludes only `node_modules/test`, no thresholds; product-team has tighter include/exclude | Coverage signal is inconsistent and partly misleading across packages | Align coverage config/threshold policy across extensions, include deterministic threshold checks | Quality owners | OPEN |
| D-003 | Development | SHOULD_FIX | High | `.github/workflows/ci.yml:31-32` gates only `critical`; current audit has `high/moderate` findings | CI permits merges with known high vulnerabilities | Raise CI audit threshold to `high` or adopt exception ledger with explicit approvals | CI + Security | OPEN |
| D-004 | Development | LOW | Medium | Hotspot metrics show very large test/workflow/source files (`transition-guards`, `ci-feedback`, `project-sync`) | Maintainability and change-risk increase in high-churn areas | Plan targeted refactors and split high-complexity files with characterization tests first | Component owners | OPEN |

---

## Findings Processing Ledger (Workflow B)

Processing policy applied:

- `MUST_FIX` or `HIGH`: individual task and walkthrough pairs.
- Remaining findings grouped by implementation theme for shared execution tracks.

| Finding ID | Task File | Walkthrough File | Status |
|------------|-----------|------------------|--------|
| P-001 | `docs/tasks/0010-restore-root-quality-gate-command-surface.md` | `docs/walkthroughs/0010-restore-root-quality-gate-command-surface.md` | PLANNED |
| P-002 | `docs/tasks/0011-fix-quality-gate-default-command-validation.md` | `docs/walkthroughs/0011-fix-quality-gate-default-command-validation.md` | PLANNED |
| P-003 | `docs/tasks/0012-align-runbook-schema-and-runtime-config-contract.md` | `docs/walkthroughs/0012-align-runbook-schema-and-runtime-config-contract.md` | PLANNED |
| S-001 | `docs/tasks/0013-manage-transitive-vulnerability-remediation-path.md` | `docs/walkthroughs/0013-manage-transitive-vulnerability-remediation-path.md` | DONE_VERIFIED |
| S-002 | `docs/tasks/0016-upgrade-ajv-and-verify-schema-security.md` | `docs/walkthroughs/0016-upgrade-ajv-and-verify-schema-security.md` | PLANNED |
| S-003 | `docs/tasks/0014-add-github-webhook-signature-verification.md` | `docs/walkthroughs/0014-add-github-webhook-signature-verification.md` | PLANNED |
| A-001 | `docs/tasks/0017-consolidate-quality-parser-and-policy-contracts.md` | `docs/walkthroughs/0017-consolidate-quality-parser-and-policy-contracts.md` | PLANNED |
| A-002 | `docs/tasks/0017-consolidate-quality-parser-and-policy-contracts.md` | `docs/walkthroughs/0017-consolidate-quality-parser-and-policy-contracts.md` | PLANNED |
| A-003 | `docs/tasks/0017-consolidate-quality-parser-and-policy-contracts.md` | `docs/walkthroughs/0017-consolidate-quality-parser-and-policy-contracts.md` | PLANNED |
| A-004 | `docs/tasks/0018-fix-plugin-lifecycle-listeners-and-hotspot-maintainability.md` | `docs/walkthroughs/0018-fix-plugin-lifecycle-listeners-and-hotspot-maintainability.md` | PLANNED |
| D-001 | `docs/tasks/0019-strengthen-quality-gate-tests-and-coverage-policy.md` | `docs/walkthroughs/0019-strengthen-quality-gate-tests-and-coverage-policy.md` | PLANNED |
| D-002 | `docs/tasks/0019-strengthen-quality-gate-tests-and-coverage-policy.md` | `docs/walkthroughs/0019-strengthen-quality-gate-tests-and-coverage-policy.md` | PLANNED |
| D-003 | `docs/tasks/0015-enforce-ci-high-vulnerability-gating.md` | `docs/walkthroughs/0015-enforce-ci-high-vulnerability-gating.md` | PLANNED |
| D-004 | `docs/tasks/0018-fix-plugin-lifecycle-listeners-and-hotspot-maintainability.md` | `docs/walkthroughs/0018-fix-plugin-lifecycle-listeners-and-hotspot-maintainability.md` | PLANNED |

---

## Product Findings (Highest Priority)

### P-001 -- Documented quality-gate commands are not executable from root

**Evidence**

- Root `package.json` only defines `prepare`, `test`, `lint`, `typecheck`, `build`.
- Docs/governance still advertise root commands (`pnpm q:gate`, `pnpm q:tests`, `pnpm q:coverage`, `pnpm q:lint`, `pnpm q:complexity`):
  - `AGENTS.md:51-55`
  - `.agent.md:89`
  - `docs/extension-integration.md:20,81`
  - `docs/backlog/EP05-quality-observability.md:22`
  - `docs/tasks/0006-quality-observability.md:56,124`
- Execution proof:
  - `pnpm q:gate --source artifacts --scope minor` -> `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "q:gate" not found`

**Impact**

- Operational docs and onboarding steps fail for first-time users.
- Team may assume quality gate CLI is runnable from root when it is not.

**Recommendation**

- Option A: add root scripts that delegate to `@openclaw/quality-gate`.
- Option B: update every doc/governance reference to filtered workspace commands only.

### P-002 -- quality-gate CLI defaults are blocked by command safety guard

**Evidence**

- `extensions/quality-gate/src/tools/run_tests.ts`:
  - default command `pnpm vitest run --reporter=json` (`line 10`)
  - validation before parse (`line 40`) then parse (`line 41`)
- `extensions/quality-gate/src/tools/lint.ts`:
  - default command `pnpm lint -f json` (`line 13`)
  - validation before parse (`line 50`) then parse (`line 51`)
- `assertSafeCommand` expects executable token semantics (`extensions/quality-gate/src/exec/spawn.ts:30-41`).
- Runtime proof:
  - `pnpm --filter @openclaw/quality-gate q:cli run --tests` -> `UNSAFE_COMMAND: command "pnpm vitest run --reporter=json"...`
  - `pnpm --filter @openclaw/quality-gate q:cli run --lint` -> `UNSAFE_COMMAND: command "pnpm lint -f json"...`

**Impact**

- The advertised default CLI path cannot execute tests or lint.
- Product behavior contradicts intended operational flow.

**Recommendation**

- Parse command first (`parseCommand`), then call `assertSafeCommand(cmd, args)`.
- Add regression tests specifically for defaults and custom command overrides.

### P-003 -- Runbook configuration example diverges from schema contract

**Evidence**

- Runbook example includes `plugins.entries.product-team.config.workflow.transitionGuards` and `.concurrency` (`docs/runbook.md:50-63`).
- Plugin manifest schema is strict (`additionalProperties:false`) and only declares `dbPath` + `github` in `configSchema` (`extensions/product-team/openclaw.plugin.json:14-72`).
- Runtime reads `pluginConfig.workflow` (`extensions/product-team/src/index.ts:152-153,209`), but schema does not declare it.

**Impact**

- Config copied from runbook can fail strict validation before runtime.
- Operators get contradictory guidance between docs, schema, and runtime logic.

**Recommendation**

- Choose one contract: either declare `workflow` in schema, or remove it from runbook/runtime path.
- Add config contract tests that validate sample runbook config against manifest schema.

---

## Security Findings

### S-001 -- High transitive vulnerabilities in dependency graph

**Evidence**

- `pnpm audit --prod` reports 7 high vulnerabilities:
  - `glob` command injection (`GHSA-5j98-mcp5-4vw2`)
  - `tar` path traversal / overwrite variants (`GHSA-r6q2-hw4h-h46w`, `GHSA-34x7-hfp2-rc4v`, `GHSA-8qq5-rm4j-mr97`, `GHSA-83g3-92jg-28cx`)
  - `minimatch` ReDoS (`GHSA-3ppc-4f35-3m26`)
- Paths indicate transitive chain through `openclaw` dependency.

**Impact**

- Security posture is dependent on upstream package updates.
- CI currently allows these to pass (critical-only gate).

**Recommendation**

- Open and track upstream dependency issue for `openclaw` chain.
- Raise CI threshold or maintain explicit temporary exception registry with expiry.

### S-002 -- Direct `ajv` dependency below patched version

**Evidence**

- `pnpm audit --prod` reports `ajv` moderate advisory (`GHSA-2g4f-4pwh-qvx6`).
- Both extensions declare `ajv: ^8.17.1`:
  - `extensions/product-team/package.json`
  - `extensions/quality-gate/package.json`

**Impact**

- Known ReDoS advisory remains present in direct dependencies.

**Recommendation**

- Upgrade to `ajv >=8.18.0` and rerun full test/type/lint gates.

### S-003 -- Webhook model lacks cryptographic signature verification

**Evidence**

- Webhook route registration and handling:
  - `extensions/product-team/src/index.ts:317-374`
- Route validates `x-github-event` and JSON shape, but no `x-hub-signature-256` validation path.
- Additional repository-name check exists (`extensions/product-team/src/github/ci-feedback.ts:330-341`), but this is not cryptographic authenticity.

**Impact**

- If route is enabled and exposed, attacker-controlled requests may still be processed if payload passes semantic checks.

**Recommendation**

- Add HMAC signature verification with shared secret in plugin config schema.
- Reject unsigned/invalid signatures before payload processing.

### S-004 -- Plugin trust model is inherently high privilege (accepted risk)

**Evidence**

- Official plugin docs state plugins run in-process and should be treated as trusted code.

**Impact**

- Any vulnerable plugin logic has gateway-process blast radius.

**Recommendation**

- Keep strict plugin allowlists and continue sandbox/tool-policy hardening.
- Maintain explicit accepted-risk documentation per environment.

**Status**: ACCEPTED_RISK (platform model, not repo-only fix)

---

## Architecture Findings

### A-001 -- Parser duplication across `quality-gate` and `product-team`

**Evidence**

- Hash comparisons show identical duplicated files:
  - `parsers/eslint.ts`
  - `parsers/ruff.ts`
  - `parsers/vitest.ts`
  - `parsers/istanbul.ts`
- Current structure keeps two copies of the same parsing logic.

**Impact**

- Bug fixes and enhancements must be applied in two places.
- Drift risk increases over time.

**Recommendation**

- Extract shared parsers into a common workspace package/module.

### A-002 -- Gate policy semantics drift across duplicated implementations

**Evidence**

- `extensions/quality-gate/src/gate/policy.ts` and `extensions/product-team/src/quality/gate-policy.ts` are near-duplicate but differ in behavior:
  - one returns `skip` on missing lint/complexity data
  - one returns `fail` with actionable guidance

**Impact**

- Same quality input may produce different gate outcomes depending on execution surface.

**Recommendation**

- Define one canonical policy engine and reuse it from both extensions.

### A-003 -- Runtime configuration path not declared in manifest schema

**Evidence**

- Runtime consumes `workflow`/`concurrency` config (`src/index.ts:152-157,209-210`).
- Manifest schema disallows undeclared properties (`openclaw.plugin.json:16`).

**Impact**

- Architecture contract splits across runtime code and schema.

**Recommendation**

- Enforce a single config contract: schema-first, with runtime and docs generated/aligned from it.

### A-004 -- Plugin lifecycle cleanup hooks are not registration-safe

**Evidence**

- `process.once('exit'|'SIGINT'|'SIGTERM', closeDb)` in `src/index.ts:192-194` executes on every registration.
- Test runs emit `MaxListenersExceededWarning`.

**Impact**

- Repeated plugin initialization accumulates listeners and produces warning noise.

**Recommendation**

- Register listeners only once (global guard) or use framework lifecycle shutdown hook if available.

---

## Development Findings

### D-001 -- Insufficient behavioral tests for quality-gate command tools

**Evidence**

- `extensions/quality-gate/test/lint.tool.test.ts` uses heavy mocks for spawn/parsers and does not execute real `lintTool` behavior paths.
- No `run_tests` tool test file found in `extensions/quality-gate/test` (`NO_MATCH` from file search).

**Impact**

- Critical command-path regressions can slip through with green tests.

**Recommendation**

- Add focused tests for `lintTool` and `runTestsTool` covering:
  - default command path
  - command parsing/validation
  - timeout and malformed output behavior

### D-002 -- Coverage configuration and signal quality are inconsistent

**Evidence**

- `product-team` coverage config scopes to `src/**/*.ts` and provides stable summary (`vitest.config.ts:8-13`).
- `quality-gate` coverage config excludes only `node_modules` and `test` (`vitest.config.ts:5-9`), includes non-source files, and has no thresholds.
- Measured quality-gate aggregate is low (`31.16%` statements) and not directly comparable.

**Impact**

- Cross-package coverage policy is inconsistent and can mislead gate decisions.

**Recommendation**

- Align include/exclude and threshold policy in both packages; enforce threshold checks in CI.

### D-003 -- CI vulnerability policy does not block high/moderate findings

**Evidence**

- CI uses `pnpm audit --prod --audit-level=critical` (`.github/workflows/ci.yml:31-32`).
- Current baseline has `7 high + 1 moderate`.

**Impact**

- Pipeline can be green while known high vulnerabilities remain unresolved.

**Recommendation**

- Raise blocking threshold or implement controlled exception mechanism.

### D-004 -- Maintainability hotspots in high-churn files

**Evidence**

- Large operational files:
  - `extensions/product-team/src/github/pr-bot.ts` (404)
  - `extensions/product-team/src/github/ci-feedback.ts` (391)
  - `extensions/product-team/src/index.ts` (356)
  - `.github/workflows/project-sync.yml` (339)
- Large high-value tests:
  - `test/orchestrator/transition-guards.test.ts` (457)

**Impact**

- Large files increase review friction and regression probability.

**Recommendation**

- Stage refactors with characterization tests and split by bounded responsibilities.

---

## Official Sources Pass and Citations

### Local official documentation (installed OpenClaw docs)

- Plugin manifest and strict schema behavior:
  - `node_modules/.pnpm/openclaw@.../node_modules/openclaw/docs/plugins/manifest.md`
- Plugin model and trust assumptions:
  - `node_modules/.pnpm/openclaw@.../node_modules/openclaw/docs/tools/plugin.md`
- Security trust entrypoint:
  - `node_modules/.pnpm/openclaw@.../node_modules/openclaw/docs/security/README.md`
- Gateway configuration/sandbox guidance:
  - `node_modules/.pnpm/openclaw@.../node_modules/openclaw/docs/gateway/configuration-reference.md`
  - `node_modules/.pnpm/openclaw@.../node_modules/openclaw/docs/gateway/sandboxing.md`

### Official web references

- https://openclaw.ai/docs/tools/plugin
- https://openclaw.ai/docs/plugins/manifest
- https://openclaw.ai/docs/gateway/configuration-reference
- https://openclaw.ai/docs/gateway/sandboxing
- https://openclaw.ai/docs/gateway/security
- https://trust.openclaw.ai

### Advisory references (from audit output)

- https://github.com/advisories/GHSA-5j98-mcp5-4vw2
- https://github.com/advisories/GHSA-r6q2-hw4h-h46w
- https://github.com/advisories/GHSA-34x7-hfp2-rc4v
- https://github.com/advisories/GHSA-8qq5-rm4j-mr97
- https://github.com/advisories/GHSA-83g3-92jg-28cx
- https://github.com/advisories/GHSA-3ppc-4f35-3m26
- https://github.com/advisories/GHSA-2g4f-4pwh-qvx6

---

## Consolidated Remediation Roadmap

### Now

1. Fix product command contract:
   - restore executable root command surface or align docs immediately (P-001).
2. Repair quality-gate default command validation flow (P-002).
3. Align runbook, schema, and runtime config contract (P-003/A-003).
4. Upgrade direct `ajv` dependency to patched range (S-002).
5. Add signature verification for CI webhook route (S-003).

### Next

1. Raise CI vulnerability gate to include high severity (D-003), with exception ledger.
2. Consolidate duplicated parser/policy logic into shared module (A-001/A-002).
3. Add missing behavior-level tests for `run_tests` and real lint tool flows (D-001).
4. Normalize coverage policy and thresholds across both extensions (D-002).

### Later

1. Address maintainability hotspots with targeted file decomposition (D-004).
2. Resolve process-listener lifecycle warnings with idempotent shutdown registration (A-004).
3. Keep tracking upstream transitive vulnerability fixes from `openclaw` dependency chain (S-001).

---

## Open Questions

1. Should root command compatibility (`pnpm q:*`) be restored for backward compatibility, or should docs fully migrate to workspace-filtered invocations?
2. Is `workflow` configuration intended to be first-class plugin config (schema-owned), or should it be removed from runtime and docs?
3. Should CI block on `high` by default, or adopt explicit temporary exceptions with expiry dates?

---

## Accepted Risks

1. **S-004 Plugin trust model**: OpenClaw plugin execution is in-process by design; risk is accepted with hardening controls (allowlists, sandboxing, auth policy).
2. **S-001 transitive advisories (temporary)**: repository cannot patch upstream transitive chain directly; risk accepted short-term pending upstream releases and CI policy hardening.


