# Walkthrough CR-0205 — PR #205 Skill Schema Fixes

## Source
PR #205 reviewed by Copilot and Gemini code-assist.

## Decisions

### Schema alignment strategy
All skill output schemas are documentation artifacts read by agents, not by the
step runner directly. However, if an agent constructs a `workflow.step.run` call
with a `schemaKey`, that key must exist in `ROLE_OUTPUT_SCHEMAS`. Skills that
tried to introduce new keys (`tech_lead_plan`, `product_owner_brief`,
`design_spec`) would have caused runtime rejection.

**Resolution**: Map each role to the closest existing validated schema key.
New/informal structures are clearly marked as non-validated examples.

### Branch naming (devops skill)
`vcs.branch.create` validates that branches start with `task/`. The original
`feat/<desc>` / `fix/<desc>` convention would cause tool call failures at
runtime. Updated to match the actual enforced convention.

### red_green_refactor_log type
`DevResultSchema` uses `Type.Array(Type.String())`. The object-array example
in frontend-dev and backend-dev would fail contract validation. Updated to
string entries in the format `"<phase>: <description> — <result>"`.

### po_brief vs product_owner_brief
`PoBriefSchema` requires `title`, `acceptance_criteria`, `scope`, `done_if`.
The custom `product_owner_brief` schema omitted these required fields.
The rich story breakdown is preserved as additional metadata under a clearly
labelled "non-validated" section.

### tech_lead_plan → informal
`tech_lead_plan` is not in `ROLE_OUTPUT_SCHEMAS`. The decomposition example is
now labelled as informal. The tech-lead's two validated outputs remain
`architecture_plan` and `review_result`.

### review_result verdicts
`ReviewResultSchema.overall_verdict` only allows `approve` | `changes_requested`.
`reject` and `request_changes` were removed.

## Files Modified
- `skills/devops/SKILL.md` — Branch naming convention corrected
- `skills/product-owner/SKILL.md` — Schema key `po_brief`; story breakdown marked informal; story `id` added; `priorityOrder` uses `storyId`
- `skills/tech-lead/SKILL.md` — Verdicts corrected; `tech_lead_plan` marked informal; task `id` added
- `skills/frontend-dev/SKILL.md` — `red_green_refactor_log` fixed to `string[]`
- `skills/backend-dev/SKILL.md` — Same as frontend-dev
- `skills/ui-designer/SKILL.md` — `design_spec` marked as informal metadata; `props` placeholder clarified
- `docs/tasks/0041-new-role-skills.md` — D1/D2/D3 output schema refs corrected
- `docs/walkthroughs/0041-new-role-skills.md` — "new schemas" statement corrected

## Files Created
- `docs/tasks/cr-0205-pr205-skill-schema-fixes.md`
- `docs/walkthroughs/cr-0205-pr205-skill-schema-fixes.md`
