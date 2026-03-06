# CR-0220: PR #220 Landing Page Code Review

| Field | Value |
|-------|-------|
| Status | DONE |
| PR | #220 |
| Branch | `feat/gh-pages-landing` |
| Scope | MINOR |

## Context

PR #220 was created by the autonomous 8-agent team (Task 0077) building a GitHub Pages landing page for vibe-flow. The task was specifically designed as a self-demo: the system builds a page about itself. This code review addresses findings from Gemini Code Assist, GitHub Copilot, and an independent manual review.

## Findings

### MUST_FIX (4)

1. **Unhandled `initMermaid()` promise rejection** — async function called without `.catch()`, causing unhandled rejection if CDN fails (offline, CSP, CDN outage)
2. **Missing CSS classes** — `.grid--three`, `.shot`, `.shot__img`, `.link`, `.noscript` referenced in HTML but undefined in CSS
3. **Copy-to-clipboard fallback incomplete** — Selection fallback without `document.execCommand('copy')` doesn't actually copy text
4. **`e.target.closest('a')` on non-Element nodes** — Can throw TypeError on Text node event targets in mobile nav

### SHOULD_FIX (5)

5. **Pin Mermaid CDN version** — `mermaid@10` is a floating tag; pinned to `@10.9.1`
6. **Pin html-validate in CI** — Unpinned `npm install --global html-validate`; pinned to `@8`
7. **"MIT (soon)" label stale** — LICENSE file already exists; updated to "MIT"
8. **Walkthrough documents Agent Roster section** — HTML doesn't have an explicit agent roster; walkthrough matches actual output (features/pipeline/extensions)
9. **`e.target` instanceof guard** — Added Element type guard before `.closest()` call

### NIT (1)

10. **html-validate rules** — 9 rules disabled; all justified for this static landing page type (inline styles, Mermaid arrows, custom data attributes)

## Changes Made

| File | Change |
|------|--------|
| `site/script.js` | Pin Mermaid `@10.9.1`, add `.catch()` to `initMermaid()`, fix copy fallback with `execCommand('copy')`, guard `e.target instanceof Element` |
| `site/index.html` | "MIT (soon)" → "MIT" |
| `site/style.css` | Add `.link`, `.grid--three`, `.shot`, `.shot__img`, `.noscript` styles + responsive breakpoints |
| `.github/workflows/validate-html.yml` | Pin `html-validate@8` |
