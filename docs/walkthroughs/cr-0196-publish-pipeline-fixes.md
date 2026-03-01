# Walkthrough: cr-0196 -- Publish Pipeline Security & Correctness Fixes

## Task Reference

- Task: `docs/tasks/cr-0196-publish-pipeline-fixes.md`
- PR: https://github.com/Monkey-D-Luisi/vibe-flow/pull/196
- Branch: `feat/0033-npm-publish-pipeline`

---

## Summary

Addressed all MUST_FIX and SHOULD_FIX findings raised by Gemini, Codex, and Copilot
reviewers against PR #196. Three critical issues prevented the pipeline from working
correctly (broken tag trigger, command injection, broken published packages) plus four
medium-severity hardening items.

---

## Findings Addressed

### F1 — MUST_FIX: Tag glob pattern never matches

**File:** `.github/workflows/release.yml:6`

GitHub Actions tag filters use fnmatch glob syntax. The original pattern
`v[0-9]+.[0-9]+.[0-9]+` uses regex quantifier `+` which is treated as a literal `+`
character in glob context. Tags like `v1.2.3` do not contain a literal `+`, so the
workflow **never fires**.

**Fix:** Updated to `v[0-9]*.[0-9]*.[0-9]*`, which is valid glob syntax and correctly
matches standard semver tags such as `v1.2.3`, `v0.1.0`, `v10.0.0`.

---

### F2 — MUST_FIX: Command injection via `execSync` with interpolated package name

**File:** `scripts/publish-packages.mjs:32`

`execSync(\`npm view ${name}@${version} version\`, ...)` passes the package name and
version through a shell, where they come from `package.json` files on disk. A malicious
`package.json` (e.g. `"name": "pkg; rm -rf /"`) could execute arbitrary commands.

**Fix:** Replaced with `execFileSync('npm', ['view', \`${name}@${version}\`, 'version'], ...)`.
`execFileSync` does not spawn a shell; the arguments are passed directly to the process.

---

### F3 — MUST_FIX: `workspace:*` dependencies shipped verbatim to npm

**File:** `scripts/publish-packages.mjs:76`

`extensions/product-team` and `extensions/quality-gate` both declare
`@openclaw/quality-contracts` as a `workspace:*` dependency. `npm publish` does not
rewrite workspace protocol specifiers; the tarball would include `"workspace:*"` verbatim.
Consumers installing those packages from npm receive `EUNSUPPORTEDPROTOCOL`.

**Fix:** Switched from `npm publish` to `pnpm publish`, which automatically rewrites
`workspace:*` to the resolved version (`^X.Y.Z`) before building the tarball. Added
`--no-git-checks` to bypass pnpm's clean working-tree assertion (not meaningful in CI
where the code is freshly checked out).

---

### F4 — SHOULD_FIX: `execSync` for actual publish call

**File:** `scripts/publish-packages.mjs:76`

Covered by the F3 fix — migrating to `execFileSync('pnpm', ['publish', ...args], ...)`
eliminates shell invocation for both npm view and publish calls.

---

### F5 — SHOULD_FIX: Blind `catch` swallows non-404 errors

**File:** `scripts/publish-packages.mjs:34–35`

The original `isAlreadyPublished` returned `false` for any `npm view` failure. A network
outage or auth error was silently misclassified as "not published", causing a follow-on
`npm publish` attempt that would fail with an unrelated, confusing error message.

**Fix:** The catch block now inspects `err.stderr` for 404 indicators (`E404`,
`404 Not Found`, `is not in the npm registry`). Only genuine 404 responses return `false`;
all other errors are re-thrown so the run fails fast with the real cause.

---

### F6 — SHOULD_FIX: No `@openclaw/` scope guard

**File:** `scripts/publish-packages.mjs:57`

The filter only checked `private: true`, meaning any future non-private,
non-scoped package accidentally added to a workspace directory would be published publicly.

**Fix:** Added `if (!manifest.name.startsWith('@openclaw/')) continue;` after the
existing `private`/`name`/`version` check.

---

### F7/F8 — SHOULD_FIX: Prose references broken regex pattern

**Files:** `docs/walkthroughs/0033-npm-publish-pipeline.md:17`,
`docs/tasks/0033-npm-publish-pipeline.md:41,59,70`

The summary, scope, requirement, and AC1 still referenced `v[0-9]+.[0-9]+.[0-9]+` (regex
syntax). Updated all occurrences to `v[0-9]*.[0-9]*.[0-9]*` to match the actual workflow
glob.

---

## Files Changed

| File | Change |
|------|--------|
| `.github/workflows/release.yml` | Fix tag glob: `+` quantifier → `*` quantifier |
| `scripts/publish-packages.mjs` | `execSync` → `execFileSync`; `npm publish` → `pnpm publish --no-git-checks`; `@openclaw/` scope guard; 404-aware error handling in `isAlreadyPublished` |
| `docs/walkthroughs/0033-npm-publish-pipeline.md` | Fix tag pattern in prose |
| `docs/tasks/0033-npm-publish-pipeline.md` | Fix tag pattern in scope, requirements, AC1 |

---

## Checklist

- [x] All MUST_FIX items addressed
- [x] All SHOULD_FIX items addressed
- [x] Walkthrough created
- [x] Lint / typecheck / tests to be verified in CI
