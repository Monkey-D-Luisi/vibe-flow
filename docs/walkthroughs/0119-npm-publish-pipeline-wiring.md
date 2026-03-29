# Walkthrough: 0119 -- npm Publish Pipeline End-to-End Wiring

## Task Reference

- Task: `docs/tasks/0119-npm-publish-pipeline-wiring.md`
- Epic: EP18 -- Plugin SDK Contracts & DX
- Branch: `feat/EP18-plugin-sdk-contracts-dx`
- PR: (pending)

---

## Summary

Wired the existing `scripts/publish-packages.mjs` into the GitHub Actions
release workflow for automated npm publishing on `v*` tag pushes, and added a
dry-run publish check to the quality-gate PR workflow.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Publish job after quality-gate and package-extensions | Ensures only quality-verified code reaches npm |
| OIDC provenance via `--provenance` flag | SLSA compliance, already supported by the publish script |
| Dry-run on PR as separate step in quality-gate | Catches packaging issues before merge without blocking on registry |
| Publish order: quality-contracts first | It's the foundational dependency; extensions depend on it |

---

## Implementation Notes

### Changes to release.yml

Added `npm-publish` job that:
- Runs after quality-gate (dependency)
- Uses `id-token: write` permission for OIDC provenance
- Runs `node scripts/publish-packages.mjs` (non-dry-run)
- Only publishes `@openclaw/*` packages with changed versions (existing registry check)

### Changes to quality-gate.yml

Added `publish-dry-run` step in the quality-gate job:
- Runs `node scripts/publish-packages.mjs --dry-run` with `continue-on-error: true`
- Included in the PR report table

### Rollback Procedure

Added documentation to `scripts/publish-packages.mjs` header comment explaining
the npm unpublish window (72 hours) and procedure.

---

## Commands Run

```bash
pnpm test
pnpm lint
pnpm typecheck
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/release.yml` | Modified | Added npm-publish job |
| `.github/workflows/quality-gate.yml` | Modified | Added publish dry-run step |
| `scripts/publish-packages.mjs` | Modified | Added rollback documentation |
| `docs/tasks/0119-npm-publish-pipeline-wiring.md` | Created | Task spec |
| `docs/walkthroughs/0119-npm-publish-pipeline-wiring.md` | Created | This walkthrough |
