# Walkthrough: CR-0220 — PR #220 Landing Page Review

## Overview

Code review of the autonomous team's GitHub Pages landing page (PR #220, Task 0077). The PR was created by 8 AI agents running through a 10-stage pipeline (IDEA → DONE) as a self-demonstration of the vibe-flow system.

## Review Sources

- **Gemini Code Assist** (2 comments): SRI rule concern, tabnabbing prevention
- **GitHub Copilot** (10 comments): Missing CSS, dead classes, JS bugs, CI pinning, doc mismatches
- **Manual review**: Independent analysis of all 17 changed files

## Fixes Applied

### 1. JavaScript hardening (`site/script.js`)

**Pin Mermaid CDN** — Changed `mermaid@10` to `mermaid@10.9.1` to prevent unexpected breakage from floating semver.

**Handle Mermaid init failure** — Added `.catch()` to `initMermaid()` call. Without this, a CDN failure (offline, CSP block) causes an unhandled promise rejection.

**Fix copy-to-clipboard fallback** — The clipboard API fallback selected text but never called `document.execCommand('copy')`. Added the actual copy call with a nested try/catch for environments that don't support it.

**Guard non-Element event targets** — Mobile nav click handler called `e.target.closest('a')` which throws if `e.target` is a Text node. Added `e.target instanceof Element` guard.

### 2. Missing CSS classes (`site/style.css`)

Added 5 missing class definitions:
- `.link` — accent-colored link style for doc cards
- `.grid--three` — 3-column grid for screenshots section
- `.shot` / `.shot__img` — placeholder screenshot styling with gradient background
- `.noscript` — centered fallback message styling

Added responsive breakpoints for `.grid--three` at 980px and 520px.

### 3. Footer license label (`site/index.html`)

Changed "MIT (soon)" to "MIT" — the repo already has a LICENSE file.

### 4. CI reproducibility (`.github/workflows/validate-html.yml`)

Pinned `html-validate` to major version `@8` to prevent nondeterministic CI.

## Items NOT Fixed (Justified)

- **`rel="noreferrer"` on external links** — Already present on all `target="_blank"` links. `noreferrer` implies `noopener` in modern browsers.
- **SRI for Mermaid** — SRI doesn't apply to dynamic ES module imports (`import()`). The `securityLevel: 'strict'` Mermaid config mitigates XSS risk.
- **html-validate disabled rules** — All 9 disabled rules are justified for this project type (CSS custom properties instead of inline styles, Mermaid `-->` arrows trigger `no-raw-characters`, etc.)

## Verification

- All 839 tests pass (`pnpm test`)
- No regressions in existing code
