# Task: 0033 -- npm Publish Pipeline for @openclaw/* Extensions

## Metadata

| Field | Value |
|-------|-------|
| Status | PENDING |
| Epic | EP07 — DX & Platform Ops |
| Priority | MEDIUM |
| Scope | MAJOR |
| Created | 2026-03-01 |
| Branch | `feat/0033-npm-publish-pipeline` |
| Source Issue | GitHub #157 |

---

## Goal

Establish a CI/CD pipeline that automatically publishes `@openclaw/*` packages to npm
on version-tag push, with safeguards for dry-run verification, OIDC-based authentication,
provenance attestation, and a documented rollback procedure.

---

## Context

There is currently no automated publish pipeline for any of the `@openclaw/*` packages
(`extensions/product-team`, `extensions/quality-gate`, `packages/schemas`, skills).
Releases are performed manually and are undocumented. As the package count grows (Task 0032
will add more), a reproducible and auditable release process is required.

Relates to GitHub issue #157 (`docs/backlog/open-issues-intake.md`). Depends on AR01 (DONE)
for stable baseline. Complements Task 0032 which scaffolds new publishable extensions.

---

## Scope

### In Scope

- GitHub Actions workflow `.github/workflows/release.yml` triggered on tags matching `v[0-9]+\.[0-9]+\.[0-9]+`
- Per-package publish with `npm publish --access public` for scoped packages
- Mandatory dry-run step (`npm publish --dry-run`) prior to actual publish
- npm provenance attestation (`--provenance`) via GitHub OIDC
- `CHANGELOG.md` generation from conventional commits (`conventional-changelog-cli`)
- Versioning and tagging strategy documented in `docs/release-strategy.md`
- Rollback procedure documented in `docs/release-strategy.md`

### Out of Scope

- Extension scaffolding CLI (Task 0032)
- GitHub Release asset upload (follow-up)
- Private or scoped registry support other than the public npm registry

---

## Requirements

1. Workflow must only trigger on tags matching `v[0-9]+\.[0-9]+\.[0-9]+`.
2. A dry-run must succeed before the actual publish step executes.
3. Publish must use GitHub OIDC for npm authentication — no long-lived `NPM_TOKEN` stored as a static secret.
4. Each package must carry an independent `version` field; root workspace version is advisory only.
5. The pipeline must block publish if any test, lint, or typecheck step fails.
6. A rollback procedure (`npm deprecate` + re-tag) must be documented.

---

## Acceptance Criteria

- [ ] AC1: Pushing a tag matching `v[0-9]+\.[0-9]+\.[0-9]+` triggers `release.yml` and publishes all workspace packages whose `package.json` version does not already exist on the npm registry.
- [ ] AC2: Dry-run step is a required gate — publish step cannot run if dry-run fails.
- [ ] AC3: `npm publish` uses `--provenance` flag for attestation.
- [ ] AC4: `CHANGELOG.md` is updated automatically from conventional commits before publish.
- [ ] AC5: `docs/release-strategy.md` documents versioning conventions, tagging, and rollback.
- [ ] AC6: Workflow exits non-zero if tests, lint, or typecheck fail; publish does not proceed.

---

## Constraints

- Must use GitHub OIDC for npm authentication (no static `NPM_TOKEN`).
- Package names for publish must be derived dynamically from workspace manifests — not hardcoded.
- Must not introduce breaking changes to existing `package.json` scripts.

---

## Implementation Steps

1. Write `docs/release-strategy.md` covering: semver conventions, tag format, `CHANGELOG.md` process, and rollback steps.
2. Create `.github/workflows/release.yml` with:
   - Tag filter trigger
   - Checkout, pnpm install
   - Test / lint / typecheck gate
   - `npm publish --dry-run` step
   - `npm publish --provenance` step
   - OIDC permission block (`id-token: write`, `contents: read`)
3. Verify each package has a `version` field in `package.json`; add if missing.
4. Add `conventional-changelog-cli` as a root dev dependency and wire `changelog` script.
5. Document in `docs/release-strategy.md` how to configure npm OIDC trust in repository settings.
6. Validate workflow YAML with `actionlint`.

---

## Testing Plan

- Workflow YAML linting with `actionlint`.
- Dry-run test: verify `npm publish --dry-run` succeeds from each package root.
- Manual end-to-end test on a version bump branch before merging.
- No Vitest unit tests required; acceptance is CI green on a real or simulated tag push.

---

## Definition of Done

- [ ] All Acceptance Criteria met
- [ ] Lint passes with zero errors
- [ ] TypeScript compiles without errors
- [ ] Walkthrough updated
- [ ] Code reviewed (if applicable)
- [ ] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
