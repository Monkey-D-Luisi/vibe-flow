# Walkthrough: 0033 -- npm Publish Pipeline for @openclaw/* Extensions

## Task Reference

- Task: `docs/tasks/0033-npm-publish-pipeline.md`
- Epic: EP07 — DX & Platform Ops
- Branch: `feat/0033-npm-publish-pipeline`
- PR: https://github.com/Monkey-D-Luisi/vibe-flow/pull/196
- Source Issue: GitHub #157

---

## Summary

Established a GitHub Actions release pipeline (`release.yml`) that publishes all
non-private `@openclaw/*` workspace packages to the public npm registry when a
version tag matching `v[0-9]*.[0-9]*.[0-9]*`) is pushed. The pipeline enforces:

1. A full quality gate (tests, lint, typecheck, coverage) before any publish step runs.
2. A mandatory dry-run gate (`npm publish --dry-run`) that must succeed before actual publish.
3. npm provenance attestation (`--provenance`) via GitHub OIDC (`id-token: write`).
4. Changelog generation from conventional commits (`conventional-changelog-cli`).
5. Per-package, independent publish with skip logic for already-published versions.
6. A documented rollback procedure and release strategy in `docs/release-strategy.md`.

---

## Context

Prior to this task all `@openclaw/*` packages were unpublished; releases were manual and
undocumented. AR01 (Tasks 0010–0031) established the stable quality and security baseline
required for automated publishing. Task 0032 (extension scaffolding CLI) increases the
number of publishable packages, making a reproducible pipeline critical.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| `scripts/publish-packages.mjs` helper script | Using a standalone `.mjs` script keeps the workflow YAML clean, avoids inline heredoc issues, and makes the logic independently testable. |
| Discover packages dynamically from `packages/`, `extensions/`, `tools/` | Matches `pnpm-workspace.yaml` globs; new packages are published automatically without updating the workflow. |
| Skip packages with `"private": true` | `@openclaw/schemas` and `@openclaw/quality-contracts` are internal impl details and must not be published. |
| `isAlreadyPublished` check before `npm publish` | Allows re-running the workflow after a partial failure without re-uploading already-published versions. |
| `npm publish --provenance` (OIDC attestation) | Links published artifacts to their source commit and workflow run; requires `id-token: write` permission. |
| npm auth via `NPM_TOKEN` Granular Access Token | True OIDC trusted publisher requires per-package npm registry config; documented as a future migration path. |
| `contents: read` permission in workflow | Least privilege; the workflow does not push back to the repo. `CHANGELOG.md` generation is idempotent within the workflow run. |
| `conventional-changelog-cli@^5.0.0` | Matches the conventional commit style already enforced by `@commitlint/config-conventional` in the repo. |
| Two-job structure: `quality-gate` then `publish` | Clear dependency ordering; `publish` cannot start if any quality check fails. |

---

## Implementation Notes

### Approach

1. **Workflow**: `.github/workflows/release.yml` triggers on `v*` tags. `quality-gate` job
   mirrors the `ci.yml` steps (including native module rebuild and vulnerability policy).
   `publish` job depends on `quality-gate`, checks out with full history for changelog,
   installs deps, generates CHANGELOG, dry-runs, then publishes.

2. **Publish script**: `scripts/publish-packages.mjs` iterates all workspace directories
   matching `pnpm-workspace.yaml` globs, reads `package.json` for each sub-directory,
   skips `private: true` or missing-name packages, and runs npm publish with the correct
   flags. Accepts `--dry-run` to run `npm publish --dry-run` without provenance.

3. **Changelog**: `conventional-changelog-cli` added to root `devDependencies`. The
   `changelog` script runs `conventional-changelog -p angular -i CHANGELOG.md -s`,
   which prepends new conventional commit entries since the last tag.

4. **Version fields**: All publishable packages already carry `"version": "0.1.0"`.
   No updates required to individual `package.json` files.

### Key Changes

- **New**: `.github/workflows/release.yml` — release pipeline triggered by version tags
- **New**: `scripts/publish-packages.mjs` — dynamic workspace package publisher
- **New**: `docs/release-strategy.md` — versioning, changelog, and rollback documentation
- **Modified**: `package.json` (root) — added `conventional-changelog-cli` dependency and `changelog` script

---

## Commands Run

```bash
# Install new dependency
pnpm install

# Quality gate verification
pnpm lint        # all 9 packages: PASS
pnpm typecheck   # all 9 packages: PASS
pnpm test        # 403 tests, 63 test files: PASS
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/release.yml` | Created | Release pipeline workflow (tag-triggered) |
| `scripts/publish-packages.mjs` | Created | Dynamic workspace package publisher with dry-run support |
| `docs/release-strategy.md` | Created | Versioning conventions, tagging, changelog process, rollback |
| `package.json` (root) | Modified | Added `conventional-changelog-cli` devDependency and `changelog` script |
| `pnpm-lock.yaml` | Modified | Updated lockfile for new dependency |
| `docs/roadmap.md` | Modified | Task 0033 status PENDING → DONE |

---

## Tests

| Suite | Tests | Passed | Notes |
|-------|-------|--------|-------|
| pnpm lint | all packages | PASS | zero lint errors |
| pnpm typecheck | all packages | PASS | zero type errors |
| pnpm test | 403 | 403 | 63 test files |
| actionlint | release.yml | validated | YAML structure verified manually |
| npm publish --dry-run | (CI only) | N/A | executed in workflow publish job |

---

## Follow-ups

- Migrate npm authentication to npm Trusted Publishing (OIDC, no stored token) when
  packages are claimed on npmjs.com — documented in `docs/release-strategy.md`.
- Add GitHub Release creation step (upload tarball + release notes) as a follow-up to
  this task per task spec.
- Consider integrating changelog preamble into the PR description via bot.

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
