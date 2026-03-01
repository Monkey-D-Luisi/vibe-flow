# Walkthrough 0052: S-002 + S-003 — Vulnerability Exception Ledger Updates (MEDIUM/LOW)

## Source Finding IDs
S-002, S-003

## Execution Journal

### Review Existing Ledger State (S-002)
Read `docs/security-vulnerability-exception-ledger.md` to confirm the fast-xml-parser exception was already present. The existing entry was valid but the ledger scope description said "High-severity only", which was no longer accurate given the presence of moderate-severity entries.

**Commands run:**
```
grep -n "fast-xml-parser\|scope\|High-severity" docs/security-vulnerability-exception-ledger.md
```

**Result:** fast-xml-parser exception confirmed present; scope description identified as stale.

### Add GHSA-7jx5-9fjg-hp4m (S-003)
GHSA-7jx5-9fjg-hp4m is an openclaw ACP (Agent Control Protocol) permission auto-approval bypass vulnerability of MODERATE severity. The finding was not yet in the ledger. Added entry S-003-14 with:
- CVE/GHSA: GHSA-7jx5-9fjg-hp4m
- Package: openclaw (host)
- Severity: MODERATE
- Expiry: 2026-05-28
- Task reference: 0052
- Justification: ACP bypass requires attacker-controlled ACP server; not applicable in standard deployment where ACP server is trusted infrastructure

**Result:** Entry S-003-14 added to ledger.

### Update Ledger Metadata
- Updated scope description from "High-severity" to "High and moderate-severity"
- Updated `last-validated` date to 2026-03-01

**Result:** Ledger metadata updated.

### Verification
**Commands run:**
```
grep -n "GHSA-7jx5-9fjg-hp4m\|last-validated\|High and moderate" docs/security-vulnerability-exception-ledger.md
```

**Result:** All three patterns found in updated ledger.

## Verification Evidence
- `docs/security-vulnerability-exception-ledger.md` updated with S-003-14 entry
- Ledger scope updated to "High and moderate-severity"
- `last-validated` date set to 2026-03-01
- GHSA-7jx5-9fjg-hp4m expiry: 2026-05-28
- Commit: adbfbcb

## Closure Decision
**Status:** DONE_VERIFIED
**Residual risk:** GHSA-7jx5-9fjg-hp4m exception expires 2026-05-28; must be renewed or resolved before that date
**Date:** 2026-03-01
