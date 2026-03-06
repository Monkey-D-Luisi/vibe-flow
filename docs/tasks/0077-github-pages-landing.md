# Task: 0077 -- GitHub Pages Landing Page (Autonomous Pipeline)

## Metadata

| Field | Value |
|-------|-------|
| Status | IN_REVIEW |
| Epic | Open Source Launch |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-05 |
| Pipeline | Yes -- full 10-stage pipeline execution |
| Target URL | `https://monkey-d-luisi.github.io/vibe-flow/` |

---

## Goal

The autonomous agent team builds a developer-showcase landing page for GitHub Pages that presents vibe-flow to the open source community. The page is built entirely by the team through the full pipeline (IDEA through DONE), demonstrating the system's own autonomous capabilities. Every pipeline stage must be documented in the walkthrough.

---

## Context

vibe-flow is a monorepo of extensions, skills, and quality tooling for OpenClaw -- an AI agent gateway. Its core product is an autonomous product team of 8 AI agents that collaborate through a 10-stage pipeline to take product ideas from concept to merged PR.

All 9 epics (EP01-EP09) are complete. The system is mature, audit-hardened, and production-grade. Before going open source under MIT license, the project needs a compelling public-facing landing page. The team will build this page about itself -- the ultimate demonstration.

**No existing site files, logos, or images exist.** Everything must be created from scratch.

---

## Pipeline Stage Deliverables

Each stage must document its output in the walkthrough before advancing.

### IDEA (pm)
Define what the landing page must communicate to the open source community:
- What is vibe-flow?
- Why should developers care?
- What makes it unique?

### ROADMAP (pm)
Produce a content strategy document:
- Content hierarchy (which sections, in what order)
- Key messages per section
- Target audience definition (developer personas)
- Success metrics (what makes the page "work")

### REFINEMENT (po)
Write user stories with acceptance criteria:
- Visitor personas (OSS contributor, enterprise evaluator, curious developer)
- Per-section user stories ("As a developer, I want to see the agent team so that I understand who does what")
- Acceptance criteria for each story

### DECOMPOSITION (tech-lead)
Produce a technical architecture document:
- File structure (recommend: `site/` directory at repo root)
- Technology decisions (vanilla HTML/CSS/JS, no build step, Mermaid CDN)
- Component breakdown (HTML sections, CSS design system, JS interactions)
- Deployment architecture (GitHub Actions workflow for Pages)
- Assign implementation work: `front-1` for HTML/CSS/JS, `devops` for deployment workflow

### DESIGN (designer)
Create visual mockups via Stitch for each major section:
- Hero section
- Pipeline visualization
- Agent team showcase
- Extension architecture cards
- Features grid
- Quick start guide

### IMPLEMENTATION (back-1 / front-1)
Build the actual site files. Delegate to `front-1` via `team_assign` for frontend work:
- `site/index.html` -- Complete single-page landing
- `site/style.css` -- Responsive design with dark theme
- `site/script.js` -- Mermaid rendering, scroll animations, interactions
- `site/favicon.svg` -- Project icon

### QA (qa)
Verify the implementation:
- All sections render correctly in browser
- Mermaid diagrams display with dark theme
- Responsive layout works at mobile (375px), tablet (768px), desktop (1200px)
- Copy-to-clipboard functionality works
- Accessibility: `prefers-reduced-motion`, semantic HTML, contrast ratios
- No broken links

### REVIEW (tech-lead)
Code review focused on:
- Content accuracy (are agent names, models, tool counts correct?)
- Design fidelity (does implementation match designer mockups?)
- Code quality (clean HTML, organized CSS, minimal JS)
- SEO meta tags present (og:title, og:description, etc.)

### SHIPPING (devops)
- Create `.github/workflows/deploy-pages.yml` for GitHub Actions deployment
- Create feature branch
- Commit all files
- Create pull request targeting `main`
- Include deployment instructions in PR description

---

## Content Sources

The team must pull accurate data from these files:

| Content | Source File | Key Lines |
|---------|------------|-----------|
| Agent roster (8 agents) | `docs/backlog/EP08-autonomous-product-team.md` | Lines 118-127 |
| Pipeline flow diagram | `docs/backlog/EP08-autonomous-product-team.md` | Lines 131-166 |
| Extension topology (Mermaid) | `docs/extension-integration.md` | Lines 7-21 |
| Task state machine (Mermaid) | `docs/transition-guard-evidence.md` | Lines 14-25 |
| Epic dependency graph (Mermaid) | `docs/roadmap.md` | Lines 219-233 |
| Brand color | `openclaw.docker.json` | `seamColor: "#6366f1"` |
| Tool list and categories | `docs/api-reference.md` | Full file |
| Docker deployment info | `docs/docker-setup.md` | Full file |
| Agent tool allow-lists | `openclaw.docker.json` | Lines 290-447 |

---

## Constraints

- No external frameworks (React, Vue, Tailwind) -- vanilla HTML/CSS/JS only
- No build step -- files served directly via GitHub Pages
- No external fonts -- system font stack
- All visual elements via CSS/inline SVG -- no image files except favicon
- Mermaid.js loaded from CDN for rendering diagrams
- Must not affect existing TypeScript workspaces or quality gates
- English only (repo convention)

---

## Definition of Done

- [ ] All 10 pipeline stages executed and documented in walkthrough
- [ ] `site/` directory exists with working landing page
- [ ] `.github/workflows/deploy-pages.yml` exists
- [ ] Site renders all sections in browser
- [ ] Mermaid diagrams render correctly
- [ ] Mobile-responsive layout
- [ ] PR created targeting main
- [ ] Walkthrough documents every stage's output
