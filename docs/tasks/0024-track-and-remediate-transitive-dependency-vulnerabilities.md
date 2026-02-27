# Task: 0024 -- Track and Remediate Transitive Dependency Vulnerabilities

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | Audit remediation 2026-02-27 |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-02-27 |
| Branch | `fix/0024-track-transitive-dependency-vulnerabilities` |
| Source Finding | S-001, S-002 (audit 2026-02-27) |

---

## Goal

Track 14 transitive dependency vulnerabilities (13 HIGH, 1 LOW) introduced through the `openclaw` package, ensure they are formally recorded in the exception ledger, and define a remediation path for when upstream patches become available.

---

## Context

Source findings: **S-001** (HIGH) and **S-002** (LOW).

`pnpm audit --prod` reports 14 vulnerabilities, all transitive via the `openclaw` package:
- **glob** >=10.2.0 <10.5.0 — command injection via -c/--cmd (GHSA-5j98-mcp5-4vw2). Not used directly (we use fast-glob).
- **tar** <=7.5.8 — 4 separate CVEs: race condition, hardlink traversal, symlink poisoning, symlink chain escape. Not used directly.
- **minimatch** multiple version ranges — 8 ReDoS CVEs. Not used directly (we use picomatch 2.3.1).
- **fast-xml-parser** <5.3.8 — stack overflow with preserveOrder (GHSA-fj3w-jwp8-x2g3). Not used directly.

Practical exploitability is LOW for all findings — none of the vulnerable APIs (glob CLI, tar extraction, minimatch pattern matching) are called by this repo's code. Risk is formally accepted pending upstream `openclaw` update.

---

## Scope

### In Scope

- Verify all 14 vulnerabilities are recorded in the CI exception ledger with correct GHSA IDs
- Set `expiresAt: "2026-05-28"` on each exception entry (or use task 0023 mechanism if already implemented)
- Add a monitoring procedure: check openclaw release notes on each version bump for patch status
- Document exploitability analysis in a vulnerability tracking comment per entry

### Out of Scope

- Forking or patching the `openclaw` dependency directly
- Modifying how fast-glob, picomatch, or other direct dependencies work

---

## Requirements

1. All 14 vulnerability GHSA IDs must appear in the CI exception ledger with justification.
2. Each entry must include: GHSA ID, severity, direct use assessment (YES/NO), exploitability note, expiry date.
3. A tracking comment must note the openclaw version (2026.2.22-2) at time of exception.
4. CI must pass `pnpm verify:vuln-policy` with all entries present.

---

## Acceptance Criteria

- [ ] AC1: `pnpm verify:vuln-policy` exits zero after all entries are recorded.
- [ ] AC2: Exception ledger contains entries for all 14 GHSAs with `directUse: false` justification.
- [ ] AC3: Each entry has `expiresAt` ≤ 90 days from creation (2026-05-28).
- [ ] AC4: A `docs/vulnerability-tracking.md` or inline comment documents the exploitability analysis.
- [ ] AC5: `pnpm test`, `pnpm lint`, `pnpm typecheck` all pass.

---

## Constraints

- Must use the existing exception ledger format (extended with `expiresAt` from task 0023, or add that here if 0023 is not yet done).
- Must not disable or weaken the vulnerability policy script.

---

## Implementation Steps

1. Read `scripts/enforce-ci-vulnerability-policy.ts` and locate the exception ledger file.
2. For each of the 14 GHSAs, add an exception entry with: GHSA ID, severity, package name, path, justification, `directUse: false`, `expiresAt: "2026-05-28"`, openclaw version note.
3. Run `pnpm verify:vuln-policy` to confirm all exceptions are accepted.
4. Create or update `docs/vulnerability-tracking.md` with the full exploitability analysis.
5. Run `pnpm test && pnpm lint && pnpm typecheck`.

---

## Testing Plan

- Run `pnpm audit --prod` and `pnpm verify:vuln-policy` — both must exit zero.
- Verify the exception count in the ledger matches the 14 reported GHSAs.

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Vulnerability ledger complete with 14 entries (S-001-01 to S-001-13 + S-002-01)
- [x] CI passes
- [x] Walkthrough updated
- [x] PR created and linked (#186)

---

## Finding Snapshot (Immutable)

| Field | Value |
|-------|-------|
| Source Finding IDs | S-001, S-002 |
| Axis | Security |
| Severity | HIGH (S-001), LOW (S-002) |
| Confidence | CERTAIN |
| Evidence | `pnpm audit --prod` → 14 vulns (1 low, 13 high) all via openclaw@2026.2.22-2 |
| Impact | Transitive exposure; LOW practical exploitability since no direct API use |
| Recommendation | Formally record in exception ledger with exploitability analysis; update openclaw when patched |
