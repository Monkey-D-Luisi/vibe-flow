# Task: 0077 -- GitHub Pages Landing Page

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | Open Source Launch (standalone) |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-05 |
| Branch | `feat/0077-github-pages-landing` |

---

## Goal

Create a developer-showcase landing page deployed via GitHub Pages that presents the autonomous AI product team, extension architecture, pipeline, and tooling -- as the project's public-facing demo before open source launch.

---

## Context

All 9 epics (EP01-EP09) are complete. The system is mature, audit-hardened, and production-grade with 76+ tasks, 34+ tools, 14 skills, 5 extensions, and 8 AI agents. Before going open source under MIT license, the project needs a compelling first impression -- a single-page site that demonstrates what vibe-flow is and why it matters.

No branding assets, logos, or images exist. Everything must be CSS/SVG-generated. No build step -- pure HTML/CSS/JS served directly from a `site/` directory.

---

## Scope

### In Scope

- `site/index.html` -- Complete single-page landing with 9 sections
- `site/style.css` -- Dark theme with indigo accent, glassmorphism, responsive, animated
- `site/script.js` -- Mermaid initialization, scroll animations, stat counters, copy-to-clipboard
- `site/favicon.svg` -- Hexagonal SVG favicon
- `.github/workflows/deploy-pages.yml` -- GitHub Actions Pages deployment workflow

### Out of Scope

- Multi-page site or documentation portal
- External frameworks, bundlers, or build steps
- Custom domain setup (standard `monkey-d-luisi.github.io/vibe-flow/`)
- Blog, changelog, or versioned docs
- External image assets or logo design

---

## Requirements

1. **Hero section** with impactful headline, CTAs (GitHub + Quick Start), and project badges
2. **Pipeline visualization** showing 10 stages (IDEA through DONE) as custom CSS/SVG, color-coded by owner agent
3. **Agent team showcase** with 8 cards: CSS avatars, roles, models, responsibilities
4. **Extension cards** for all 5 extensions with Mermaid topology diagram
5. **Features grid** (12 tiles) highlighting technical depth
6. **Architecture diagrams** rendered via CDN mermaid.js (task state machine + epic dependency graph)
7. **Animated stats** section (119+ Tasks, 9 Epics, 34+ Tools, etc.)
8. **Quick start** section with styled terminal block and copy buttons
9. **Footer** with links, license, and attribution
10. **Mobile-responsive** layout (breakpoints: 1200px, 768px, 375px)
11. **Accessible**: `prefers-reduced-motion`, semantic HTML, proper contrast
12. **SEO**: Open Graph meta tags, meta description, twitter:card
13. **Dark theme** using brand indigo `#6366f1` from `openclaw.docker.json`
14. **GitHub Actions deployment** triggered on push to main when `site/**` changes

---

## Acceptance Criteria

- [x] AC1: `site/index.html` opens in browser and renders all 9 sections correctly
- [x] AC2: 3 Mermaid diagrams render with dark theme (extension topology, task state machine, epic dependency graph)
- [x] AC3: Pipeline visualization shows 10 stages with agent color coding
- [x] AC4: 8 agent cards display with correct roles, models, and responsibilities
- [x] AC5: Site is mobile-responsive at 768px and 375px breakpoints
- [x] AC6: `deploy-pages.yml` workflow file is valid GitHub Actions syntax
- [x] AC7: Existing `pnpm test`, `pnpm lint`, `pnpm typecheck` pass (no regressions)
- [x] AC8: All CSS animations respect `prefers-reduced-motion`
- [x] AC9: Copy-to-clipboard works on quick start code block

---

## Constraints

- No external frameworks (React, Vue, Tailwind, etc.) -- vanilla HTML/CSS/JS only
- No build step -- files served directly via GitHub Pages
- No external fonts -- system font stack only
- All visual elements via CSS/inline SVG -- no image files except `favicon.svg`
- Mermaid.js loaded from CDN (`cdn.jsdelivr.net`)
- Must not affect existing TypeScript workspaces or quality gates

---

## Implementation Steps

1. Create `site/` directory at repository root
2. Create `site/favicon.svg` -- hexagonal SVG with brand color
3. Create `.github/workflows/deploy-pages.yml` -- Pages deployment workflow
4. Build `site/index.html` -- HTML5 structure with all 9 sections, OG meta tags, CDN links
5. Build `site/style.css` -- Custom properties, glassmorphism components, animations, responsive breakpoints
6. Build `site/script.js` -- Mermaid init, IntersectionObserver animations, counter animation, clipboard
7. Verify Mermaid diagrams render correctly
8. Run regression quality checks (`pnpm test`, `pnpm lint`, `pnpm typecheck`)

---

## Testing Plan

- Visual verification: open `site/index.html` in browser, verify all sections
- Mermaid rendering: confirm 3 diagrams display with dark theme
- Responsive: check layout at 1200px, 768px, 375px viewport widths
- Regression: `pnpm test`, `pnpm lint`, `pnpm typecheck` all pass
- Workflow validation: `deploy-pages.yml` has valid YAML and correct Actions references

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Regression tests passing (`pnpm test`)
- [x] Lint passes with zero errors (`pnpm lint`)
- [x] TypeScript compiles without errors (`pnpm typecheck`)
- [x] Walkthrough updated
- [ ] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Extension Integration](../extension-integration.md) -- extension topology diagram
- [Transition Guard Evidence](../transition-guard-evidence.md) -- task state machine diagram
- [Roadmap](../roadmap.md) -- epic dependency graph
- [EP08 Backlog](../backlog/EP08-autonomous-product-team.md) -- agent roster and pipeline

---

## Content Sources

| Content | Source File | Lines |
|---------|------------|-------|
| Agent roster | `docs/backlog/EP08-autonomous-product-team.md` | 118-127 |
| Pipeline flow | `docs/backlog/EP08-autonomous-product-team.md` | 131-166 |
| Extension topology | `docs/extension-integration.md` | 7-21 |
| Task state machine | `docs/transition-guard-evidence.md` | 14-25 |
| Epic dependency graph | `docs/roadmap.md` | 219-233 |
| Brand color | `openclaw.docker.json` | seamColor: `#6366f1` |
