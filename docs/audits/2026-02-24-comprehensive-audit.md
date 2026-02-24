# Comprehensive Audit: Security > Architecture > Performance

| Field       | Value                      |
|-------------|----------------------------|
| Date        | 2026-02-24                 |
| Auditor     | Claude Opus 4.6            |
| Scope       | Full codebase              |
| Branch      | `fix/audit-security-architecture-performance` |

---

## 1. SECURITY AUDIT

### 1.1 Command Injection — `assertSafeCommand` bypass (MEDIUM)

**File**: `extensions/quality-gate/src/exec/spawn.ts:17-27`
**File**: `extensions/quality-gate/src/tools/run_tests.ts:50`

`assertSafeCommand` validates the full command string but `parseCommand` splits on whitespace. The validation runs on the concatenated string, not on individual tokens. If the command itself is `pnpm vitest run --reporter=json` (a single string), the shell metacharacter check is applied to the whole string, which is correct. However, the function accepts a user-provided `command` parameter with no allowlist — any command can be executed.

**Risk**: An agent (or malicious prompt) can pass `command: "rm -rf /"` and it would pass `assertSafeCommand` (no shell metacharacters).

**Recommendation**: Add a command allowlist or prefix-check (only allow `pnpm`, `npx`, `npm` prefixes).

**Status**: WILL FIX

### 1.2 Symlink following in glob resolution (LOW)

**File**: `extensions/quality-gate/src/fs/glob.ts:22`

`followSymbolicLinks: true` allows symlink traversal that could escape the `cwd` directory boundary despite `assertPathContained` being called later.

**Recommendation**: Set `followSymbolicLinks: false`.

**Status**: WILL FIX

### 1.3 Unbounded stdout/stderr accumulation (MEDIUM)

**File**: `extensions/quality-gate/src/exec/spawn.ts:93-102`

`stdout` and `stderr` are accumulated in memory without any size limit. A malicious or runaway process could produce output that exhausts memory.

**Recommendation**: Cap buffer at 10 MB and truncate.

**Status**: WILL FIX

### 1.4 Missing `db.close()` on plugin shutdown (LOW)

**File**: `extensions/product-team/src/index.ts:29`

The SQLite database is opened but never closed. If the process receives a signal, WAL checkpoint may not flush.

**Recommendation**: Register a cleanup callback with the plugin API.

**Status**: WILL FIX (best-effort — depends on plugin API support)

### 1.5 Transitive dependency vulnerabilities (HIGH)

**Source**: `pnpm audit`

Three HIGH severity issues in transitive dependencies via `openclaw` SDK:
- `glob` 10.2-10.5: command injection via `--cmd` (GHSA-5j98-mcp5-4vw2)
- `tar` <7.5.4: race condition path traversal (GHSA-r6q2-hw4h-h46w)
- `tar` <7.5.7: hardlink path traversal (GHSA-34x7-hfp2-rc4v)

All are in the `openclaw` transitive dependency chain, not directly exploitable by this codebase.

**Recommendation**: Document as known risk. File upstream issue with OpenClaw SDK. Add `pnpm audit` to CI.

**Status**: WILL FIX (CI enforcement only — cannot fix upstream deps)

### 1.6 `JSON.parse` on untrusted input without schema validation (LOW)

**Files**:
- `extensions/product-team/src/persistence/task-repository.ts:34-35` (tags, metadata)
- `extensions/product-team/src/persistence/event-repository.ts:27` (payload)
- All parsers: `eslint.ts:52`, `ruff.ts:42`, `vitest.ts:80`, `istanbul.ts:32`

`JSON.parse` is used to deserialize data from the SQLite database and external tool output. The database data was serialized by this same code, so the risk is low. The parser inputs come from spawned processes, not user input directly.

**Recommendation**: No code change needed. The TypeBox validation in the product-team tools and the `as` type assertions in parsers are sufficient for this threat model.

**Status**: ACCEPTED RISK

### 1.7 Database path validation (LOW)

**File**: `extensions/product-team/src/index.ts:27-28`

The `dbPath` from plugin config is passed through `api.resolvePath()` which is assumed to sandbox the path. If `resolvePath` doesn't validate, an attacker could write to arbitrary filesystem locations.

**Recommendation**: Add `assertPathContained` check on the resolved path.

**Status**: WILL FIX

### 1.8 SQL injection — N/A (PASS)

All SQL queries use parameterized statements (`?` placeholders). Dynamic `WHERE` and `SET` clauses are built from hardcoded column names, not user input. No SQL injection vulnerabilities found.

### 1.9 Path traversal protections — PASS

`assertPathContained` correctly uses `path.relative` to detect traversal. Coverage tool and complexity tool both validate paths before file operations.

### 1.10 Error information disclosure (LOW)

**File**: `extensions/product-team/src/domain/errors.ts:10,17,25,33,41`

Error messages include task IDs, agent IDs, and revision numbers. These are operational identifiers, not secrets. In a production API context, these could be information disclosure.

**Recommendation**: No change needed for current plugin model (internal tool responses, not external API).

**Status**: ACCEPTED RISK

---

## 2. ARCHITECTURE AUDIT

### 2.1 Product-team plugin missing linting setup (MEDIUM)

**File**: `extensions/product-team/package.json:8`

The lint script is `echo 'no lint rules yet'`. This means the product-team extension code is never linted, despite the CI running `pnpm lint`. The CI passes because the echo exits 0.

**Recommendation**: Configure ESLint for the product-team extension matching quality-gate's setup.

**Status**: WILL FIX

### 2.2 Duplicate `parseCommand` function (LOW)

**Files**:
- `extensions/quality-gate/src/tools/run_tests.ts:34-39`
- `extensions/quality-gate/src/tools/lint.ts:44-49`

Identical `parseCommand` function duplicated in two files.

**Recommendation**: Extract to `exec/spawn.ts` alongside other command utilities.

**Status**: WILL FIX

### 2.3 Tool definition schemas inconsistency (MEDIUM)

The quality-gate tools use plain JSON Schema objects for `parameters`:
- `extensions/quality-gate/src/tools/run_tests.ts:106-131`

The product-team tools use TypeBox schemas:
- `extensions/product-team/src/schemas/task-create.schema.ts`

Both approaches work, but mixing them creates inconsistency. The quality-gate tools also lack input validation — the `execute` functions cast `params as unknown as Input` without validation:
- `run_tests.ts:133`: `params as unknown as RunTestsInput`
- `lint.ts:152`: `params as unknown as LintInput`
- `complexity.ts:239`: `params as unknown as ComplexityInput`
- `gate_enforce.ts:110`: `params as unknown as GateEnforceInput`

**Recommendation**: Add runtime validation for quality-gate tool inputs using the existing JSON schema (via Ajv, which is already a dependency). This also mitigates the command injection risk from 1.1.

**Status**: WILL FIX (partially — validation for command fields)

### 2.4 `loadSchema` has hardcoded relative path (LOW)

**File**: `extensions/quality-gate/src/utils/loadSchema.ts:7`

`schemasRoot` resolves relative to the source file location using `../../../../packages/schemas`. This is fragile and breaks if the file moves.

**Recommendation**: Accept schemas root as a parameter or use workspace resolution.

**Status**: ACCEPTED RISK (current structure is stable)

### 2.5 Missing return type annotation on `getAllToolDefs` (LOW)

**File**: `extensions/quality-gate/src/tools/index.ts:22`

`getAllToolDefs()` lacks a return type annotation.

**Recommendation**: Add explicit return type.

**Status**: WILL FIX

### 2.6 Roadmap status inconsistency (LOW)

**File**: `docs/roadmap.md`

EP02 is shown as PENDING in the roadmap but is actually DONE (task `0002-task-engine.md` completed, PR #161 merged).

**Recommendation**: Update roadmap to reflect actual status.

**Status**: WILL FIX

---

## 3. PERFORMANCE AUDIT

### 3.1 Unbounded stdout accumulation (already covered in 1.3)

String concatenation in a loop (`stdout += data.toString()`) creates GC pressure for large outputs. Should cap buffer size.

### 3.2 Sequential file analysis in complexity tool (LOW)

**File**: `extensions/quality-gate/src/tools/complexity.ts:154-162`

Files are analyzed sequentially. For large codebases this could be slow.

**Recommendation**: Use `Promise.all` with concurrency limit for parallel file analysis. Low priority — current scope is small.

**Status**: ACCEPTED RISK (premature optimization)

### 3.3 Schema compilation cache uses Map with object keys (LOW)

**File**: `extensions/product-team/src/schemas/validator.ts:7`

The cache uses `TSchema` objects as `Map` keys. Object identity comparison means the same schema definition in two different variables would miss the cache and compile twice. In practice, schemas are module-level singletons, so this works correctly.

**Status**: ACCEPTED RISK

### 3.4 Missing index on `event_log.event_type` (LOW)

**File**: `extensions/product-team/src/persistence/migrations.ts:44-45`

Indexes exist on `task_id` and `created_at` but not on `event_type`. EP05's `workflow.events.query` tool will need to filter by event type.

**Recommendation**: Add index in next migration when EP05 is implemented.

**Status**: DEFERRED to EP05

---

## Summary

| Category | Critical | High | Medium | Low | Accepted |
|----------|----------|------|--------|-----|----------|
| Security | 0 | 1 | 2 | 4 | 2 |
| Architecture | 0 | 0 | 2 | 3 | 1 |
| Performance | 0 | 0 | 0 | 2 | 3 |

### Action Items (WILL FIX)

| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 1 | Command allowlist for spawn tools | MEDIUM | Add prefix allowlist to `assertSafeCommand` |
| 2 | Symlink following in glob | LOW | Set `followSymbolicLinks: false` |
| 3 | Unbounded stdout/stderr | MEDIUM | Cap buffer at 10 MB |
| 4 | Missing db.close() | LOW | Add shutdown hook |
| 5 | Add pnpm audit to CI | HIGH | Add audit step to ci.yml |
| 6 | Product-team missing lint | MEDIUM | Configure ESLint |
| 7 | Duplicate parseCommand | LOW | Extract to shared module |
| 8 | Quality-gate tool input validation | MEDIUM | Validate command inputs |
| 9 | getAllToolDefs return type | LOW | Add type annotation |
| 10 | Roadmap status stale | LOW | Update EP02 status |
| 11 | DB path validation | LOW | Add assertPathContained |
