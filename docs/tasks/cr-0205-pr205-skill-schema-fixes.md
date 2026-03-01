# CR-0205 — PR #205 Review Fixes: Skill Schema Alignment

| Field   | Value                                                |
|---------|------------------------------------------------------|
| CR      | 0205                                                 |
| PR      | #205 feat(skills): add SKILL.md files for 6 new agent roles |
| Status  | IN PROGRESS                                          |
| Source  | Copilot + Gemini code-assist review comments         |

## MUST_FIX

### M1 — devops/SKILL.md: wrong branch naming convention
`feat/<description>` / `fix/<description>` contradicts the actual
`vcs.branch.create` enforcement of `task/<taskId>-<slug>`.
**Fix**: Update Branch Management section to use `task/<taskId>-<slug>`.

### M2 — product-owner/SKILL.md: unregistered output schema key
Schema named `product_owner_brief` is not in `ROLE_OUTPUT_SCHEMAS`.
The only valid key is `po_brief`, which requires `title`, `acceptance_criteria`,
`scope`, `done_if`.
**Fix**: Replace `product_owner_brief` schema block with `po_brief` including
the required fields; nest story breakdown as optional additional context.

### M3 — tech-lead/SKILL.md: invalid review verdict values
`request_changes` and `reject` are not in `ReviewResultSchema`.
Only `approve` and `changes_requested` are valid.
**Fix**: Update verdict docs to `approve` / `changes_requested`.

### M4 — tech-lead/SKILL.md: tech_lead_plan not a registered schemaKey
`tech_lead_plan` is not in `ROLE_OUTPUT_SCHEMAS` and will be rejected by the
step runner.
**Fix**: Mark section as informal/non-validated example structure.

### M5 — frontend-dev/SKILL.md: red_green_refactor_log must be string[]
Runtime `DevResultSchema` declares `red_green_refactor_log: string[]`.
The example shows array of objects, which breaks contract validation.
**Fix**: Replace object entries with string entries.

### M6 — backend-dev/SKILL.md: same as M5

## SHOULD_FIX

### S1 — product-owner/SKILL.md: brittle priorityOrder by title
`priorityOrder: ["storyTitle"]` is fragile if titles change or are non-unique.
**Fix**: Add `id` field to each story; change `priorityOrder` to use `storyId`.

### S2 — tech-lead/SKILL.md: task objects missing id field
`dependencies` and `parallelGroups` reference `taskId` but task objects have
no `id` field.
**Fix**: Add `"id": "string"` to task object schema.

### S3 — ui-designer/SKILL.md: ambiguous props placeholder
`"props": { "key": "description" }` reads as an example not a schema spec.
**Fix**: Use `"<propName>": "<propType or description>"` as placeholder.

### S4 — docs/tasks/0041-new-role-skills.md: incorrect schema refs
D1 references `tech_lead_plan`, D2 references `product_owner_brief`, D3
references `design_spec` — none are registered schemaKeys.
**Fix**: Correct refs to valid keys or mark as informal.

### S5 — docs/walkthroughs/0041-new-role-skills.md: misleading "new schemas" statement
States tech-lead and product-owner get "new schemas" — these don't exist in
runtime registry.
**Fix**: Clarify each role maps to an existing schema key.
