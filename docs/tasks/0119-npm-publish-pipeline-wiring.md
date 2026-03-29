# Task: 0119 -- npm Publish Pipeline End-to-End Wiring

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP18 -- Plugin SDK Contracts & DX |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-29 |
| Branch | `feat/EP18-plugin-sdk-contracts-dx` |

---

## Goal

Connect the existing `scripts/publish-packages.mjs` to GitHub Actions for
automated npm publishing on release tags, with a dry-run check on PRs.

---

## Context

The publish script exists and can publish packages. The release workflow exists
but does not include an npm publish job. npm publish was previously removed
from the release workflow. This task re-adds it with improvements.

---

## Scope

### In Scope

- Add publish job to release workflow (triggers on v* tags)
- Add dry-run publish check to quality-gate workflow on PRs
- Document rollback procedure

### Out of Scope

- Actually publishing packages (this wires the pipeline for future use)
- Changing package versions

---

## Requirements

1. v* tag push triggers npm publish for changed packages
2. Provenance attestations included in published packages
3. Dry-run on PR catches publish failures before merge
4. Publish order respects dependency graph (quality-contracts first)
5. Rollback procedure documented

---

## Acceptance Criteria

- [ ] AC1: Release workflow has a publish job after quality-gate
- [ ] AC2: Publish job uses OIDC provenance
- [ ] AC3: Quality-gate workflow has a dry-run publish step on PRs
- [ ] AC4: Rollback procedure documented in publish script comments

---

## Definition of Done

- [ ] Release workflow publish job added
- [ ] Quality-gate dry-run step added
- [ ] Rollback procedure documented
- [ ] pnpm test && pnpm lint && pnpm typecheck passes
