# Walkthrough: 0033 -- npm Publish Pipeline for @openclaw/* Extensions

## Task Reference

- Task: `docs/tasks/0033-npm-publish-pipeline.md`
- Epic: EP07 — DX & Platform Ops
- Branch: `feat/0033-npm-publish-pipeline`
- PR: _pending_
- Source Issue: GitHub #157

---

## Summary

_Pending implementation. Task spec activated from open-issues-intake.md on 2026-03-01._

This task will create a GitHub Actions release workflow that publishes all `@openclaw/*`
packages to npm when a repo-level version tag (`v[0-9]+\.[0-9]+\.[0-9]+`) is pushed.
Each package carries its own independent `version` field; the workflow identifies
publishable packages by comparing each package's version against the npm registry rather
than assuming all packages have the same version. Uses OIDC authentication and provenance
attestation, with a mandatory dry-run gate and documented rollback procedure.

---

## Context

Prior to this task, all `@openclaw/*` packages are unpublished and releases are manual.
AR01 (Tasks 0010–0031) established the stable quality and security baseline that makes
automated publishing safe. Task 0032 (extension scaffolding CLI) will increase the number
of publishable packages, making an automated pipeline critical.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| GitHub OIDC over static `NPM_TOKEN` | OIDC tokens are short-lived and tied to a specific workflow run, reducing secret leakage risk |
| `--provenance` flag for all publishes | npm provenance attestation links published artifacts to their source commit and workflow run |
| Dry-run as a required gate | Catches packaging errors (missing files, bad `exports`) before they reach the public registry |
| Per-package independent versioning | Allows individual packages to evolve at different rates without forcing coordinated version bumps |

---

## Implementation Notes

### Approach

_To be completed during implementation._

### Key Changes

_To be completed during implementation._

---

## Commands Run

```bash
# To be filled during implementation
actionlint .github/workflows/release.yml
npm publish --dry-run
pnpm lint
pnpm typecheck
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/release.yml` | Created | Release pipeline workflow |
| `docs/release-strategy.md` | Created | Versioning, tagging, and rollback documentation |
| `package.json` (root) | Modified | Add `changelog` script |

_Exact file list to be updated during implementation._

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| CI (actionlint) | - | - | - |
| Dry-run | - | - | - |
| Total | - | - | - |

_To be filled during implementation._

---

## Follow-ups

- Add GitHub Release creation (upload release notes and tarball artifacts)
- Consider private registry support for enterprise OpenClaw deployments
- Integrate changelog preamble into PR description via bot

---

## Checklist

- [ ] Task spec read end-to-end
- [ ] TDD cycle followed (Red-Green-Refactor)
- [ ] All ACs verified
- [ ] Quality gates passed
- [ ] Files changed section complete
- [ ] Follow-ups recorded
