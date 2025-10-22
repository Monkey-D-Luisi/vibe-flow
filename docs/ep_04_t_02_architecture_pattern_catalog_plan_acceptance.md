# EP04‑T02 — Architecture Pattern Catalog (Plan & Acceptance)

**Goal**
Provide a lightweight, reviewable catalog of architectural patterns that engineers can use to choose well‑understood solutions with explicit trade‑offs. The catalog must be easy to author, lint, cross‑reference from ADRs, and verify in CI.

---

## 1) Scope
**In scope**
- Authoring format for pattern “cards.”
- Minimal but opinionated schema (front‑matter + body headings).
- Tooling: generator, linter, and index builder.
- CI workflow and PNPM scripts to run locally and on PRs.
- Cross‑linking with ADRs (e.g., `ADR-0012`).

**Out of scope**
- Deep tutorials or full reference implementations.
- Diagrams automation. Authors may embed images/mermaid manually.

---

## 2) Deliverables
### 2.1 Directory layout
```
docs/
  patterns/
    README.md                 # index, grouped by category
    _TEMPLATE.md              # authoring template
    catalog.yml               # optional taxonomy (categories, tags)
    P-0001-circuit-breaker.md # sample card
    P-0002-outbox.md          # sample card
  adr/                        # already present (cross-links live here)

tooling/patterns/
  pattern-new.cjs             # interactive generator
  pattern-lint.ts             # schema + content linter
  __tests__/pattern-lint.spec.ts
```

### 2.2 Pattern schema (front‑matter)
Each card starts with YAML followed by Markdown sections.
```yaml
---
id: P-0001              # unique, zero-padded, monotonically increasing
slug: circuit-breaker   # kebab-case
title: Circuit Breaker
category: resilience    # one of: resilience, messaging, data, integration, ui, security, ops
status: draft           # draft | accepted | deprecated
created: 2025-10-22
updated: 2025-10-22
adr_refs: [ADR-0010]    # ADR IDs referenced by this pattern
related: [retry, bulkhead]
tags: [resilience, availability]
owner: architecture
---
```

### 2.3 Body sections (headings)
1. **Intent**
2. **Context** (forces, constraints)
3. **Problem** (anti-goals explicit)
4. **Solution sketch** (text + optional diagram)
5. **When to use**
6. **When not to use**
7. **Trade‑offs**
   - Cost | Complexity | Latency | Throughput | Reliability | Scalability | Security | Operability
8. **Operational notes** (observability, rollout, failure modes)
9. **Known issues**
10. **References** (links, ADRs, related patterns)

A minimal `_TEMPLATE.md` is provided with all headings and guidance comments.

### 2.4 Tooling
- **Generator (`pattern-new.cjs`)**
  - Reads `_TEMPLATE.md`, auto‑assigns next `id` and `slug` from the provided title, and pre‑fills dates.
  - Writes `docs/patterns/P-XXXX-<slug>.md`.

- **Linter (`pattern-lint.ts`)**
  - Validates front‑matter: required fields, allowed enums, kebab‑case `slug`, unique `id`.
  - Verifies presence and order of mandatory headings.
  - Checks `status` transitions (e.g., `deprecated` must include a replacement in **References**).
  - Ensures ADR references exist and follow `ADR-####` format; warns if missing.
  - Optional: validates links and image paths.

- **Index builder (optional)**
  - Script that scans cards and regenerates `docs/patterns/README.md` grouped by `category`, listing title, status, and quick links.

### 2.5 PNPM scripts (workspace root)
```json
{
  "scripts": {
    "patterns:new": "node tooling/patterns/pattern-new.cjs",
    "patterns:lint": "tsx tooling/patterns/pattern-lint.ts",
    "patterns:lint:changed": "tsx tooling/patterns/pattern-lint.ts --changed",
    "patterns:test": "node --test tooling/patterns/__tests__/pattern-lint.spec.ts"
  }
}
```

### 2.6 CI workflow
- `.github/workflows/patterns-lint.yml` runs on PRs touching `docs/patterns/**` or `tooling/patterns/**`.
- Steps: checkout → setup Node/pnpm → install → `pnpm patterns:lint` → `pnpm patterns:test`.
- Expose a required status check: **patterns-lint**.

---

## 3) Conventions & authoring rules
- **File name**: `P-XXXX-<slug>.md` (e.g., `P-0007-saga-choreography.md`).
- **Language**: English, concise, decision‑focused.
- **Cross‑links**: refer to ADRs as `ADR-####` and to other patterns by file link.
- **Diagrams**: mermaid preferred; images under `docs/patterns/img/`.
- **Status policy**:
  - `draft`: proposal under review.
  - `accepted`: endorsed and preferred where applicable.
  - `deprecated`: kept for history; must name an alternative in **References**.

---

## 4) Review checklist (for PRs)
- Front‑matter present and valid.
- All mandatory headings in order; content not empty.
- Clear “When to use / not to use” with at least 3 trade‑offs articulated.
- At least one ADR reference or rationale linking to related decisions.
- Index updated (if builder not automated) and links render in preview.

---

## 5) Verification plan
Local:
```bash
pnpm patterns:new "Circuit Breaker"
pnpm patterns:lint
pnpm patterns:test
```
CI:
- Open PR → **patterns-lint** and **patterns-test** checks pass.
- Preview `docs/patterns/README.md` shows the new card under the right category.

Smoke of cross‑links:
- Add `ADR-####` to **References** and confirm the linter recognizes it.

---

## 6) Acceptance criteria
- [ ] Template, sample cards, and README exist under `docs/patterns/`.
- [ ] Generator creates a valid, lint‑clean card with auto‑incremented ID.
- [ ] Linter enforces schema, headings, and references; unit tests exist.
- [ ] CI workflow runs on PRs touching patterns and blocks merges on failure.
- [ ] Contribution guide references the new commands and review checklist.

---

## 7) Risks & mitigations
- **Entropy of categories** → keep a `catalog.yml` taxonomy and validate categories.
- **Rotting guidelines** → codify in linter rules; keep template authoritative.
- **Over‑engineering** → keep cards brief; link out for deep dives.

---

## 8) Appendix A — Authoring template (starter)
```markdown
---
id: P-XXXX
slug: <kebab-slug>
title: <Pattern title>
category: <resilience|messaging|data|integration|ui|security|ops>
status: draft
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
adr_refs: []
related: []
tags: []
owner: architecture
---

## Intent

## Context

## Problem

## Solution sketch

## When to use

## When not to use

## Trade-offs
- Cost:
- Complexity:
- Latency:
- Throughput:
- Reliability:
- Scalability:
- Security:
- Operability:

## Operational notes

## Known issues

## References
- ADR-#### — <title>
- Related pattern: [<name>](./P-XXXX-<slug>.md)
- External: <link>
```

---

## 9) Appendix B — Example (Circuit Breaker, abbreviated)
```markdown
---
id: P-0001
slug: circuit-breaker
title: Circuit Breaker
category: resilience
status: accepted
created: 2025-10-22
updated: 2025-10-22
adr_refs: [ADR-0010]
related: [retry, bulkhead]
tags: [failure, timeout]
owner: architecture
---

## Intent
Prevent cascading failures by short‑circuiting calls to an unhealthy dependency.

## When to use
- Remote dependency has variable latency or outages.
- Downstream timeouts would multiply resource pressure.

## When not to use
- Calls are idempotent and extremely cheap; a simple retry suffices.

## Trade-offs
- **Latency**: improves tail latency after tripping.
- **Complexity**: adds state machine and tuning.
- **Operability**: requires metrics (open/half-open/closed) and alerts.

## References
- ADR-0010 — Resilience primitives baseline
- Related: [Retry](./P-0003-retry.md)
```

