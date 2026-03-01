# CR Task: cr-0196 -- Publish Pipeline Security & Correctness Fixes

## Metadata

| Field | Value |
|-------|-------|
| Status | IN_PROGRESS |
| PR | https://github.com/Monkey-D-Luisi/vibe-flow/pull/196 |
| Branch | `feat/0033-npm-publish-pipeline` |
| Reviewer findings | Gemini, Codex, Copilot |

---

## Findings

### MUST_FIX

| ID | File | Line | Issue |
|----|------|------|-------|
| F1 | `.github/workflows/release.yml` | 6 | Tag filter `v[0-9]+.[0-9]+.[0-9]+` is regex syntax; GitHub Actions uses globs. The `+` is treated as a literal character, so standard semver tags like `v1.2.3` never match and the workflow never fires. |
| F2 | `scripts/publish-packages.mjs` | 32 | `execSync` with interpolated `${name}@${version}` in shell string — command injection. A malicious `package.json` name could execute arbitrary commands on the runner. |
| F3 | `scripts/publish-packages.mjs` | 76 | `npm publish` does not rewrite `workspace:*` dependency specifiers. `extensions/product-team` and `extensions/quality-gate` both depend on `@openclaw/quality-contracts` via `workspace:*`. Published tarballs would ship that specifier verbatim, causing `EUNSUPPORTEDPROTOCOL` for npm consumers. Fix: switch to `pnpm publish` which rewrites workspace protocols automatically. |

### SHOULD_FIX

| ID | File | Line | Issue |
|----|------|------|-------|
| F4 | `scripts/publish-packages.mjs` | 76 | `execSync` for actual publish call should also use `execFileSync` for consistency and defense-in-depth. |
| F5 | `scripts/publish-packages.mjs` | 34–35 | Blind `catch` in `isAlreadyPublished` swallows network / auth / registry errors, treating them as "not published". This causes a spurious publish attempt that fails with a confusing unrelated error. Distinguish 404 (not found) from other errors and re-throw on non-404. |
| F6 | `scripts/publish-packages.mjs` | 57 | No `@openclaw/` scope guard. Any non-private package in workspace dirs would be published, even future packages outside the intended scope. |
| F7 | `docs/walkthroughs/0033-npm-publish-pipeline.md` | 17 | Prose references `v[0-9]+.[0-9]+.[0-9]+` (regex notation). Update to reflect the actual glob pattern used. |
| F8 | `docs/tasks/0033-npm-publish-pipeline.md` | 41, 59, 70 | In-scope description, requirements, and AC1 all reference the regex-style pattern. Update to glob. |

---

## Fixes Applied

- `release.yml:6`: `'v[0-9]+.[0-9]+.[0-9]+'` → `'v[0-9]*.[0-9]*.[0-9]*'`
- `publish-packages.mjs`: replace `execSync` with `execFileSync` throughout
- `publish-packages.mjs`: switch `npm publish` → `pnpm publish --no-git-checks` (workspace protocol rewriting)
- `publish-packages.mjs`: add `@openclaw/` scope guard after private check
- `publish-packages.mjs`: distinguish 404 from other errors in `isAlreadyPublished`
- `docs/walkthroughs/0033-*`: fix tag pattern prose
- `docs/tasks/0033-*`: fix tag pattern in scope, requirements, and ACs
