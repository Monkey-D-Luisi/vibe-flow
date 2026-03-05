# Task 0072: SEC-002 + SEC-008 — Security Hardening (MEDIUM)

## Source Finding IDs
SEC-002, SEC-008

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Security |
| Severity | MEDIUM (SEC-002), LOW (SEC-008) |
| Confidence | CONFIRMED |
| Evidence | SEC-002: `extensions/model-router/src/provider-health.ts:141` — bearer token compared with `!==` (not timing-safe); SEC-008: `extensions/product-team/src/hooks/auto-spawn.ts:482` — gateway token embedded in spawned script text and full `process.env` passed to child |
| Impact | SEC-002: timing side-channel attack could recover bearer token character-by-character; SEC-008: token visible in process listings and child processes receive unnecessary environment variables |
| Recommendation | SEC-002: use `crypto.timingSafeEqual` (already implemented in `webhook-signature.ts`); SEC-008: pass token via environment variable and restrict env to allowlist |

## Objective
Eliminate timing side-channel in model-router token comparison and harden auto-spawn child process token/environment handling.

## Acceptance Criteria
- [x] Bearer token comparison in `provider-health.ts` uses `crypto.timingSafeEqual`
- [x] Gateway token in `auto-spawn.ts` passed via environment variable instead of script text
- [x] Child process environment restricted to necessary variables only (allowlist)
- [x] All existing tests pass
- [x] No new security warnings in lint

## Status
DONE — commit d9c6e97

## Traceability
| Field | Value |
|-------|-------|
| Audit | 2026-03-05-full-audit.md |
| Findings | SEC-002, SEC-008 |
| Commit | d9c6e97 |
