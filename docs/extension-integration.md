# Extension Integration Patterns

> How the two extensions (`quality-gate` and `product-team`) interact, and how
> they will evolve through EP05 (Quality & Observability consolidation).

---

## Current State (Post-EP03)

```
┌───────────────────────────┐     ┌─────────────────────────┐
│   extensions/quality-gate │     │ extensions/product-team  │
│                           │     │                          │
│  quality.tests (tool)     │     │  task.create (tool)      │
│  quality.coverage (tool)  │     │  task.get (tool)         │
│  quality.lint (tool)      │     │  task.update (tool)      │
│  quality.complexity (tool)│     │  task.transition (tool)  │
│  quality.gate (tool)      │     │  task.search (tool)      │
│                           │     │  workflow.state.get      │
│  CLI: pnpm q:gate         │     │  workflow.step.run       │
└───────────────────────────┘     └─────────────────────────┘
        │                                     │
        │  No direct connection               │
        │  Agents must manually copy          │
        │  results from quality tools         │
        │  into task metadata                 │
        └──────────── ❌ ─────────────────────┘
```

### Current Workflow (manual bridging)

1. Dev agent writes code
2. Dev agent runs `quality.tests` (quality-gate tool) -- gets JSON results
3. Dev agent manually copies results into `task.update` metadata
4. Dev agent calls `task.transition` to `in_review`
5. Transition guard checks `task.metadata.dev_result.metrics.coverage`

**Problem:** Step 3 is error-prone. The agent must correctly map quality tool
output to the exact metadata structure the transition guards expect.

---

## Target State (Post-EP05)

```
┌─────────────────────────────────────────────────┐
│           extensions/product-team               │
│                                                 │
│  ┌─ Task Tools ─────────────────────────────┐   │
│  │  task.create, task.get, task.update,      │   │
│  │  task.search, task.transition             │   │
│  └──────────────────────────────────────────-┘   │
│                                                 │
│  ┌─ Workflow Tools ─────────────────────────┐   │
│  │  workflow.state.get, workflow.step.run    │   │
│  └──────────────────────────────────────────-┘   │
│                                                 │
│  ┌─ Quality Tools (consolidated from QG) ───┐   │
│  │  quality.tests    -> writes qa_report     │   │
│  │  quality.coverage -> writes dev_result    │   │
│  │  quality.lint     -> writes dev_result    │   │
│  │  quality.complexity -> writes complexity  │   │
│  │  quality.gate     -> evaluates all        │   │
│  └──────────────────────────────────────────-┘   │
│                                                 │
│  ┌─ VCS Tools (EP04) ───────────────────────┐   │
│  │  vcs.branch.create, vcs.pr.create,       │   │
│  │  vcs.pr.update, vcs.label.sync           │   │
│  └──────────────────────────────────────────-┘   │
│                                                 │
│  ┌─ Observability Tools (EP05) ─────────────┐   │
│  │  workflow.events.query                    │   │
│  └──────────────────────────────────────────-┘   │
│                                                 │
│  Transition guards evaluate task.metadata        │
│  written by quality tools automatically          │
└─────────────────────────────────────────────────┘

┌───────────────────────────┐
│   extensions/quality-gate │  ← Remains as standalone CLI
│   CLI: pnpm q:gate        │    Not loaded as OpenClaw extension
└───────────────────────────┘
```

### Target Workflow (automated bridging)

1. Dev agent writes code
2. Dev agent runs `quality.tests` (product-team tool) -- results auto-written to `task.metadata.qa_report`
3. Dev agent runs `quality.coverage` (product-team tool) -- coverage auto-written to `task.metadata.dev_result.metrics.coverage`
4. Dev agent runs `quality.lint` (product-team tool) -- lint_clean auto-written to `task.metadata.dev_result.metrics.lint_clean`
5. Dev agent calls `task.transition` to `in_review` -- guard passes automatically
6. No manual metadata copying required

---

## Metadata Flow Diagram

```
 quality.tests ──────► task.metadata.qa_report = {
                         total: 42,
                         passed: 42,
                         failed: 0,
                         skipped: 0,
                         evidence: [...]
                       }
                       ▲
                       │ Guard: qa -> done checks failed === 0

 quality.coverage ───► task.metadata.dev_result.metrics.coverage = 85.5
                       ▲
                       │ Guard: in_progress -> in_review checks >= threshold

 quality.lint ───────► task.metadata.dev_result.metrics.lint_clean = true
                       ▲
                       │ Guard: in_progress -> in_review checks === true

 workflow.step.run ──► task.metadata.{schemaKey} = validated output
  (llm-task steps)     Examples:
                       - architecture_plan (guard: design -> in_progress)
                       - dev_result (guard: in_progress -> in_review)
                       - review_result (guard: in_review -> qa)
                       - qa_report (guard: qa -> done)
```

---

## Shared Dependencies

Both extensions (until EP05 consolidation) share:

| Dependency | Usage in quality-gate | Usage in product-team |
|---|---|---|
| `better-sqlite3` | N/A | Core persistence |
| `ajv` / `ajv-formats` | Schema validation | Schema validation |
| `@sinclair/typebox` | N/A | Schema definitions |
| `vitest` | Testing | Testing |
| `ts-morph` | Complexity analysis | After EP05: complexity |
| `typhonjs-escomplex` | Complexity analysis | After EP05: complexity |
| `fast-glob` | File discovery | After EP05: file discovery |

---

## Code Reuse Strategy for EP05

When consolidating quality-gate into product-team:

1. **Copy, don't import** -- Move source files into `src/quality/` directory
2. **Adapt interfaces** -- Replace standalone function signatures with methods
   that accept `taskId` and `ToolDeps`
3. **Add metadata writes** -- Each quality function ends by updating TaskRecord
4. **Port tests** -- Move test files into `test/quality/` with adapted imports
5. **Keep CLI** -- `extensions/quality-gate/cli/qcli.ts` remains functional
   by importing from its own local `src/`
