# EP01‑T02 — State Graph and Handoffs

## Objective
Define the state machine of the PO → Architecture → Dev → Review ↔ Dev → PO Check → QA → PR flow and the rules that govern it, including fast‑track for `scope=minor`, round limits and gate verification (quality MCP, reviewer rubric, QA report).

## States
`po`, `arch`, `dev`, `review`, `po_check`, `qa`, `pr`, `done`

## Events
`design_ready`, `implement_ready`, `review_ok`, `review_changes`, `po_approved`, `qa_pass`, `qa_fail`, `pr_opened`, `merged`

## Transitions
- `po → arch` on backlog grooming or if `scope=major`. Guard: minimum requirements defined.
- `po → dev` fast‑track if `scope=minor` and no design changes.
- `arch → dev` on `design_ready` (ADR and contracts defined).
- `dev → review` guard: `red_green_refactor_log ≥ 2`, `coverage ≥ threshold` (0.8 major, 0.7 minor), `lint.errors=0`.
- `review → dev` on `review_changes`. Effect: `rounds_review++` (max 2).
- `review → po_check` on `review_ok`. Guard: no `violations.high` in rubric.
- `po_check → qa` on `po_approved`. Guard: acceptance criteria marked.
- `qa → dev` on `qa_fail` (attach report).
- `qa → pr` on `qa_pass`.
- `pr → done` on `merged`.

## JSON Representation (statechart)
```json
{
  "initial": "po",
  "states": {
    "po": { "on": { "GROOMED": "arch", "FAST_TRACK": "dev" } },
    "arch": { "on": { "DESIGN_READY": "dev" } },
    "dev": { "on": { "SUBMIT_REVIEW": "review" } },
    "review": { "on": { "CHANGES": "dev", "APPROVED": "po_check" } },
    "po_check": { "on": { "APPROVED": "qa" } },
    "qa": { "on": { "FAIL": "dev", "PASS": "pr" } },
    "pr": { "on": { "MERGED": "done" } },
    "done": { "type": "final" }
  }
}
```

## Guards and Effects (pseudocode)
- Guard `ready_for_review(tr)`:
  - `len(tr.red_green_refactor_log) ≥ 2`
  - `tr.metrics.coverage ≥ (tr.scope == 'major' ? 0.8 : 0.7)`
  - `lint.errors == 0`
- Effect `inc_rounds_review(tr)`: `tr.rounds_review += 1` and if `> 2` → block.

## MCP API — tool `task.transition`
Input:
```json
{
  "id": "TR-...",
  "to": "review",
  "if_rev": 3,
  "evidence": {
    "metrics": {"coverage": 0.82, "lint": {"errors": 0, "warnings": 2}},
    "red_green_refactor_log": ["red: 4 failing", "green: all passing"],
    "qa_report": {"total": 32, "passed": 32, "failed": 0},
    "violations": []
  }
}
```
Output: Updated TaskRecord or error `409` if `rev` outdated.

## Gate Integrations
- **Quality MCP**: before `dev → review` calculates coverage, lint and complexity. Configurable thresholds.
- **Reviewer**: generates `violations[]` with severity. No `high` allowed to pass to `po_check`.
- **QA**: executes unit/contract/smoke plan; if `failed > 0` returns to `dev`.

## Round Limit
- `review ↔ dev`: max 2 rounds per TaskRecord. Exceeded limit requires PO intervention.

## Telemetry and Traces
- Save in `links.github.issueNumber` and `links.git.branch` when they exist.
- Emit `handoff` event {from, to, when, tr_id} for observability.

## DoD (EP01‑T02)
- Serializable statechart (`statechart.json`) and validated in tests.
- Implementation of `task.transition` with active guards.
- Transition tests and round limit tests.
- Documentation of fast‑track and thresholds per scope.

