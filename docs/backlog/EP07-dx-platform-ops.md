# EP07 -- DX & Platform Ops

| Field       | Value                                                |
|-------------|------------------------------------------------------|
| Epic        | EP07                                                 |
| Status      | PENDING                                              |
| Priority    | P2                                                   |
| Phase       | 7 -- DX & Platform Ops                               |
| Target      | Q2 2026                                              |
| Depends on  | AR01                                                 |
| Blocks      | None                                                 |

## Goal

Improve developer experience and platform operational readiness: automated extension
scaffolding, a reproducible and auditable npm publish pipeline, and a full quality-gate
feedback loop on pull requests.

## Context

AR01 (Tasks 0010–0031) stabilised quality, security, and convention baselines across
the monorepo. EP07 builds on that stable foundation to address the three open gaps
identified in `docs/backlog/open-issues-intake.md` (issues #156, #157, #158):

- No automated way to bootstrap a new OpenClaw extension (leads to convention drift).
- No CI/CD pipeline for publishing `@openclaw/*` packages to npm (manual, undocumented).
- No quality-gate feedback on pull requests (developers must run `pnpm q:*` locally).

## Tasks

### 7.1 Extension Scaffolding CLI (Task 0032)

See `docs/tasks/0032-extension-scaffolding-cli.md`.

- CLI command `pnpm create:extension <name>` generating a fully-configured extension package.
- Enforces project conventions (ESM, TypeScript strict, Vitest, top-level `test/` directory).
- Validates kebab-case name format; guards against overwrite without `--force`.

**Source issue:** GitHub #156

### 7.2 npm Publish Pipeline (Task 0033)

See `docs/tasks/0033-npm-publish-pipeline.md`.

- GitHub Actions workflow `.github/workflows/release.yml` triggered on semver tags.
- OIDC-based npm authentication (no static `NPM_TOKEN`), provenance attestation.
- Mandatory dry-run gate before actual publish.
- Per-package independent versioning; publishable set determined by npm registry comparison.
- Rollback procedure documented in `docs/release-strategy.md`.

**Source issue:** GitHub #157

### 7.3 CI Quality Gate Workflow for PRs (Task 0034)

See `docs/tasks/0034-ci-quality-gate-workflow-for-prs.md`.

- GitHub Actions workflow `.github/workflows/quality-gate.yml` on all PRs targeting `main`.
- Runs metric commands first (`q:tests`, `q:coverage`, `q:lint`, `q:complexity`), then gate evaluation (`q:gate`), then vulnerability policy (`verify:vuln-policy`).
- Posts/updates a Markdown quality report as a PR comment (upsert via HTML anchor).
- Exits non-zero on threshold breach; surfaces as a required status check.

**Source issue:** GitHub #158

## Acceptance Criteria (Epic level)

- [ ] A new extension can be scaffolded in one command and passes `pnpm typecheck` out of the box.
- [ ] A version tag push triggers publish of all un-released packages with provenance.
- [ ] Every PR against `main` receives a quality gate report comment and a required status check.
