# /site Stitch Adaptation — PR Skeleton Checklist

This doc is meant to be copy/pasted into the PR description while we wait for the final Stitch tokens / designer guidance.

## Goal (hold)
Adapt the GitHub Pages landing at `site/` to the new Stitch design (ID: `13727051608662686055`) **without a rewrite**.

**Current constraint:** no major restyle until design tokens/guidance land.

## Current content inventory (sections)
- Header/topbar + mobile nav
- Hero (#top): headline, lead, stats (8/10/6), actions, “Why developers care” card, hero screenshot
- Features (#features)
- Docs (#docs)
- Screenshots (#screenshots)
- Roadmap (#roadmap)
- Install / Quickstart (#quickstart)
- Pipeline (#pipeline) + Mermaid diagrams
- Extensions (#extensions) + Mermaid diagram
- Footer

## “Before” screenshots (baseline)
Existing baseline screenshots (3 viewports):
- `site/screenshots/hero-375.png`
- `site/screenshots/hero-768.png`
- `site/screenshots/hero-1280.png`

## PR checklist (copy into PR)
- [ ] Confirm final Stitch tokens (colors/type/spacing/radius/shadows)
- [ ] Confirm layout rules per breakpoint (mobile/tablet/desktop)
- [ ] Map Stitch sections → existing sections (decide what stays, what moves)
- [ ] Confirm hero asset + dimensions (avoid CLS: set `width/height` or `aspect-ratio`)
- [ ] Confirm any new assets (and whether we need updated `og-image.svg/png`)
- [ ] Validate progressive enhancement:
  - [ ] JS-off: content remains readable (no hidden `.reveal` content)
  - [ ] Reduced motion: no forced animations
  - [ ] Mobile nav: graceful fallback (noscript links)
- [ ] Run HTML validation (CI: `html-validate site/index.html`)
- [ ] Capture “after” screenshots (375/768/1280)

## Notes / risks
- Responsive breakpoints currently: `980px` and `520px`.
- Mermaid diagrams are rendered via CDN ESM (`mermaid@10.9.1`). If Stitch design requires no external deps, we need a plan (static SVG pre-render, or remove Mermaid blocks).
- GitHub Pages deploys `site/` as-is (no build step). Keep paths relative.
