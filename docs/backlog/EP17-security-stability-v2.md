# EP17 -- Security & Stability v2

> Status: IN_PROGRESS
> Dependencies: EP09
> Phase: 12 (Quality at Scale)
> Target: May 2026

## Motivation

A project aspiring to be a reference implementation must have zero known
high-severity security findings. Several items from audit remediation (task 0078)
were blocked on infrastructure access. Additional stability gaps exist: DB
migrations have no rollback, vitest version conflicts cause sporadic failures,
and coverage/complexity is advisory rather than blocking in CI.

**Current state:**
- Vulnerability scanning: `pnpm verify:vuln-policy` (live, exception ledger)
- Secrets scanning: none in CI
- DB migrations: sequential array, no rollback
- Vitest: ^3 in some workspaces, ^4 in others (A-004 blocker)
- Coverage/complexity: reported in CI, not blocking (D-008 pending decision)
- Blocked findings: task 0078 items requiring external access

**Target state:**
- Automated secrets scanning catches leaks before merge.
- DB migrations are reversible with tested rollback paths.
- Single vitest version across all workspaces.
- Coverage and complexity thresholds block PRs that regress.
- All blocked infrastructure findings resolved or formally deferred with rationale.

## Task Breakdown

### 12A: Scanning & Migrations (parallel)

#### Task 0113: Secrets Scanning in CI (Gitleaks)

**Scope:** Add gitleaks to the CI pipeline to scan for accidentally committed
secrets, API keys, tokens, and credentials.

**Implementation:**
- Add gitleaks GitHub Action to quality-gate workflow
- Scan all files on PR (not just changed files — catch pre-existing leaks)
- Configure custom rules for OpenClaw-specific patterns:
  - OpenClaw API keys
  - Telegram bot tokens
  - Provider API keys (OpenAI, Anthropic, Google AI)
- Allow-list for known false positives (test fixtures, documentation examples)
- Failure blocks merge (required status check)

**Gitleaks config (`.gitleaks.toml`):**

```toml
[allowlist]
  paths = [
    '''\.test\.ts$''',
    '''__fixtures__''',
    '''docs/''',
  ]

[[rules]]
  id = "telegram-bot-token"
  description = "Telegram Bot Token"
  regex = '''\d+:[\w-]{35}'''
  tags = ["credential", "telegram"]

[[rules]]
  id = "openai-api-key"
  description = "OpenAI API Key"
  regex = '''sk-[a-zA-Z0-9]{48}'''
  tags = ["credential", "openai"]
```

**Files to create/modify:**
- `.gitleaks.toml` (new: gitleaks configuration)
- `.github/workflows/quality-gate.yml` (modify: add gitleaks job)

**Acceptance criteria:**
- Gitleaks runs on every PR
- Custom rules for project-specific credential patterns
- Allow-list prevents false positives in test fixtures
- Findings block merge
- Job completes in < 60 seconds

---

#### Task 0114: Database Migration Rollback Mechanism

**Scope:** Add rollback support to the SQLite migration system so that failed
migrations can be reverted and schema changes can be undone during development.

**Current migration system:**
- Array of migration functions: `migrations: (() => void)[]`
- Migrations run sequentially on startup
- No versioning table, no rollback
- If migration N fails, database is in partially migrated state

**New migration system:**

```typescript
interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
  down: (db: Database) => void;
}
```

**Migration tracking table:**

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  checksum TEXT NOT NULL
);
```

**Behavior:**
- `migrate up` — apply all pending migrations
- `migrate down [version]` — rollback to specified version
- `migrate status` — show current version and pending migrations
- Checksum validation: detect if applied migration was modified
- Transaction wrapping: each migration runs in a transaction, rolls back on error

**Files to create/modify:**
- `extensions/product-team/src/persistence/migration-engine.ts` (new: replaces current array)
- `extensions/product-team/src/persistence/migrations/` (modify: convert to up/down format)
- `extensions/product-team/src/persistence/migration-engine.test.ts` (new)

**Acceptance criteria:**
- All existing migrations converted to up/down format
- `down` migrations tested for every `up` migration
- Checksum validation detects modified migrations
- Transaction wrapping prevents partial migration state
- Backward compatible: existing databases upgrade seamlessly
- >= 90% test coverage

---

### 12B: Alignment (sequential after 12A)

#### Task 0115: Vitest Version Alignment

**Scope:** Align all workspaces to a single vitest version, resolving the ^3 vs ^4
conflict that causes sporadic test failures.

**Investigation steps:**
1. Audit all `package.json` files for vitest version ranges
2. Identify which features require vitest ^3 vs ^4
3. Choose target version (prefer latest stable)
4. Update all workspaces simultaneously
5. Fix any breaking changes from version migration

**Known risks:**
- Vitest 4 may have different snapshot format
- Test runner configuration syntax may differ
- Some plugins may not support vitest 4

**Files to modify:**
- `packages/quality-contracts/package.json`
- `extensions/product-team/package.json`
- `extensions/quality-gate/package.json`
- `extensions/model-router/package.json`
- `extensions/telegram-notifier/package.json`
- `extensions/stitch-bridge/package.json`
- Root `package.json` (if workspace-level vitest config)
- Any vitest config files that need syntax updates

**Acceptance criteria:**
- Single vitest version across all workspaces
- All tests pass after migration
- No sporadic failures in CI for 5 consecutive runs
- Vitest version pinned (exact, not range) in root package.json
- `pnpm test` completes without warnings

---

#### Task 0116: Coverage/Complexity CI Blocking Policy

**Scope:** Make coverage and complexity thresholds blocking in CI, resolving the
D-008 finding that these are currently advisory.

**Current state (from copilot-instructions.md):**
- Coverage threshold: >= 80% (major), >= 70% (minor)
- Complexity threshold: avg <= 5.0
- CI reports these but does not fail the build

**Decision to make:**
- Should complexity be blocking? (Pros: enforces quality. Cons: may block urgent fixes.)
- Resolution: blocking with escape hatch.

**Implementation:**
- quality-gate CI job exits non-zero when thresholds breached (already partially done)
- Add `--strict` flag to `pnpm q:gate` that makes all gates blocking
- CI uses `--strict` mode
- Emergency escape: PR label `bypass-quality-gate` skips blocking (requires team lead approval)

**Files to create/modify:**
- `extensions/quality-gate/src/commands/gate.ts` (modify: add `--strict` flag)
- `.github/workflows/quality-gate.yml` (modify: use `--strict`)
- Documentation update for bypass process

**Acceptance criteria:**
- Coverage below threshold blocks PR merge
- Complexity above threshold blocks PR merge
- `bypass-quality-gate` label provides documented escape hatch
- CI job clearly reports which threshold was breached
- >= 90% test coverage for strict mode logic

---

### 12C: Blocked Items (sequential after 12B)

#### Task 0117: Blocked Infrastructure Findings Resolution

**Scope:** Revisit and resolve (or formally defer) all blocked findings from
task 0078 that required external access or infrastructure changes.

**Known blocked items (from task 0078):**
- Items requiring external service access
- Items dependent on OpenClaw SDK features not yet available
- Items blocked on upstream dependency releases

**Process per finding:**
1. Re-evaluate: is it still blocked, or has the blocker been resolved?
2. If resolved → implement fix
3. If still blocked → document specific blocker and re-evaluation date
4. If no longer relevant → close with rationale

**Files to create/modify:**
- `docs/tasks/0117-blocked-findings-resolution.md` (new: tracking document)
- Various source files depending on which findings are now unblocked

**Acceptance criteria:**
- Every blocked finding from task 0078 has a resolution or documented deferral
- Deferred items have specific re-evaluation dates
- No finding is left in "blocked, unknown timeline" state
- Implemented fixes pass quality gates

## Definition of Done

- [ ] All 5 tasks completed
- [ ] Gitleaks scans every PR for secrets
- [ ] DB migrations have tested up/down paths
- [ ] Single vitest version across all workspaces
- [ ] Coverage/complexity blocking in CI with escape hatch
- [ ] All blocked findings resolved or formally deferred
- [ ] `pnpm test && pnpm lint && pnpm typecheck` passes
