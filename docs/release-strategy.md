# Release Strategy — @openclaw/* Packages

> Last updated: 2026-03-01

## Overview

This document covers versioning conventions, tagging, changelog generation, npm publish
pipeline configuration, and rollback procedures for all `@openclaw/*` packages in this
monorepo.

---

## Versioning

All publishable packages follow [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH).

| Bump  | When to use                                         |
|-------|-----------------------------------------------------|
| PATCH | Bug fixes and non-breaking internal changes         |
| MINOR | New backwards-compatible features                   |
| MAJOR | Breaking changes to the public API                  |

**Each package is versioned independently.** The root `package.json` has no `version` field
(it is the private workspace root). Packages are allowed to be at different versions.

To bump a package version:
```bash
cd extensions/<package>
npm version patch   # or minor / major
```

---

## Tagging Convention

Release tags are created at the **repository root** and act as a publish trigger:

```
v<MAJOR>.<MINOR>.<PATCH>
```

Examples: `v0.1.0`, `v1.0.0`, `v2.3.1`

The tag represents the "release event". Each publishable package whose current `version`
field does not yet exist on the npm registry will be published when the tag is pushed.

### Creating a release tag

```bash
# 1. Ensure you're on main and up-to-date
git checkout main && git pull origin main

# 2. Update versions of packages that changed
cd extensions/quality-gate && npm version minor && cd ../..

# 3. Generate/update the changelog
pnpm changelog

# 4. Commit version bumps and changelog together
git add -A && git commit -m "chore(release): bump versions and update changelog"

# 5. Push the commit
git push origin main

# 6. Create and push the release tag
git tag v0.2.0
git push origin v0.2.0
```

Pushing the tag triggers `.github/workflows/release.yml`.

---

## Changelog

Changelogs are generated from [Conventional Commits](https://www.conventionalcommits.org/)
using [`conventional-changelog-cli`](https://github.com/conventional-changelog/conventional-changelog).

### Generate / update CHANGELOG.md

```bash
pnpm changelog
```

This runs `conventional-changelog -p angular -i CHANGELOG.md -s` and prepends new entries
since the last tag to `CHANGELOG.md`.

### Commit format

```
<type>(<scope>): <short description>

Types: feat, fix, chore, docs, refactor, test, perf, ci
Scope: package or feature area (e.g. quality-gate, product-team, deps)
```

---

## npm Publish Pipeline

The release workflow `.github/workflows/release.yml` performs:

1. **Quality gate** — runs tests, lint, typecheck, and coverage policy checks.
2. **Changelog generation** — regenerates `CHANGELOG.md` from commits.
3. **Dry-run publish** — `npm publish --dry-run` for every publishable package.
4. **Actual publish** — `npm publish --provenance --access public` for packages whose
   version is not yet on the registry.

### Publishable packages

A package is publishable if its `package.json`:
- has a `name` field, and
- does **not** have `"private": true`

The publish script (`scripts/publish-packages.mjs`) discovers packages dynamically from
`packages/`, `extensions/`, and `tools/` directories.

### GitHub OIDC and npm authentication

The workflow requires two separate secrets/capabilities:

| Capability              | Mechanism                                                                |
|-------------------------|--------------------------------------------------------------------------|
| **Provenance attestation** | GitHub OIDC token (`id-token: write`) — `--provenance` flag links the published artifact to its source commit and workflow run |
| **npm authentication**  | `NPM_TOKEN` GitHub secret — must be a **Granular Access Token** (not a classic automation token), scoped to specific packages with `publish` permission and an expiry date |

#### Setting up npm authentication

1. Log in to [npmjs.com](https://www.npmjs.com/) → **Access Tokens** → **Generate New Token**
   → **Granular Access Token**.
2. Scope the token to the `@openclaw` organization or individual packages.
3. Set an expiry (recommended: 90 days).
4. Add the token to the GitHub repository as a secret named `NPM_TOKEN`:
   **Settings → Secrets and variables → Actions → New repository secret**.

#### Future: npm Trusted Publishing (zero secrets)

npm's [Trusted Publishers](https://docs.npmjs.com/about-trusted-publishers) feature
allows publishing without any stored token by exchanging a GitHub OIDC token directly
with the npm registry. When this is configured:

1. Visit each package's npm settings page → **Trusted Publishers**.
2. Add a GitHub Actions publisher entry with the repository and workflow path.
3. Remove the `NODE_AUTH_TOKEN` env var from the workflow `publish` job.

---

## Rollback Procedure

If a bad version was published to npm, follow these steps:

### Step 1: Deprecate the bad version

```bash
# Deprecate (does NOT remove; warns users who try to install)
npm deprecate @openclaw/plugin-product-team@0.2.0 "Critical bug — use 0.1.0 instead"
```

Repeat for each affected package.

### Step 2: Unpublish (within 72 hours only)

npm allows unpublishing only within 72 hours of initial publish, and only if no other
package depends on it.

```bash
npm unpublish @openclaw/plugin-product-team@0.2.0
```

If outside the 72-hour window, deprecation is the only option.

### Step 3: Publish a patch release

Fix the issue, bump the patch version, and push a new tag:

```bash
cd extensions/product-team && npm version patch && cd ../..
git add extensions/product-team/package.json
git commit -m "fix(product-team): <description of fix>"
git push origin main
git tag v0.2.1 && git push origin v0.2.1
```

### Step 4: Update the tag (re-tag)

Move the `latest` dist-tag to point to the fixed version:

```bash
npm dist-tag add @openclaw/plugin-product-team@0.2.1 latest
```

---

## References

- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [npm Provenance](https://docs.npmjs.com/generating-provenance-statements)
- [npm Trusted Publishers](https://docs.npmjs.com/about-trusted-publishers)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
