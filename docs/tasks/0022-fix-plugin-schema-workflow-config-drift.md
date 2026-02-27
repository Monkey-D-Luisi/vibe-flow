# Task: 0022 -- Fix Plugin Schema / Runbook Workflow Config Drift

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | Audit remediation 2026-02-27 |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-02-27 |
| Branch | `fix/0022-plugin-schema-workflow-config-drift` |
| Source Finding | D-007 (audit 2026-02-27) |

---

## Goal

Resolve the contract mismatch between the plugin JSON Schema (`openclaw.plugin.json`) and the documented `workflow` config property shown in `docs/runbook.md`, so that users following the runbook receive valid configurations rather than schema validation errors.

---

## Context

Source finding: **D-007** — `docs/runbook.md` lines 50-63 show a `workflow` configuration block in the plugin config example, but `extensions/product-team/openclaw.plugin.json` has `additionalProperties: false` and does not declare a `workflow` property. The runtime (`src/index.ts:152-153`) does parse `pluginConfig.workflow`, creating a three-way divergence: docs say yes, schema says no, runtime says yes.

Per OpenClaw official plugin manifest docs (`node_modules/openclaw/docs/plugins/manifest.md`): missing or invalid manifests block config validation and cause Doctor errors.

---

## Scope

### In Scope

- Investigate whether `workflow` is an intentional config property or legacy/experimental
- Either extend the `openclaw.plugin.json` configSchema to include the `workflow` property with full JSON Schema definition, OR remove the `workflow` block from `docs/runbook.md`
- Add a contract test that parses every config example in the runbook through the plugin schema and asserts validity

### Out of Scope

- Changes to the runtime parsing logic in `src/index.ts` (separate concern)
- Adding new config properties not already present in the codebase

---

## Requirements

1. After the fix, no config example in `docs/runbook.md` must fail `openclaw.plugin.json` schema validation.
2. The schema and runtime must agree: if a property is parsed at runtime it must be declared in the schema, and vice versa.
3. A contract test must enforce this invariant going forward.

---

## Acceptance Criteria

- [ ] AC1: Running the plugin config example from `docs/runbook.md` through the `openclaw.plugin.json` configSchema produces zero validation errors.
- [ ] AC2: The `workflow` property either appears in `openclaw.plugin.json` with a correct JSON Schema definition, or is absent from `docs/runbook.md`.
- [ ] AC3: A new test in `test/config/plugin-config-contract.test.ts` (or similar) validates all runbook config examples against the schema.
- [ ] AC4: `pnpm test`, `pnpm lint`, `pnpm typecheck` all pass.

---

## Constraints

- The plugin schema must remain `additionalProperties: false` to comply with OpenClaw plugin contract requirements.
- Must not break existing users' configs.

---

## Implementation Steps

1. Read `src/index.ts` lines 140-170 to understand how `pluginConfig.workflow` is used at runtime.
2. Read `docs/runbook.md` lines 40-80 to see the full config example.
3. Read `openclaw.plugin.json` configSchema in full.
4. Decide: if `workflow` is a real supported feature, extend the schema with a proper JSON Schema definition for it. If it's experimental/removed, delete it from the runbook.
5. Write a contract test that imports the schema and validates all config examples in the runbook.
6. Run `pnpm test && pnpm lint && pnpm typecheck`.

---

## Testing Plan

- Contract test: load `openclaw.plugin.json`, parse each config example from runbook as JSON, validate via `ajv` or TypeScript type assertion.
- Unit test: if schema is extended, test that a `workflow`-containing config passes and a `workflow`-missing config also passes (since it should be optional).

---

## Definition of Done

- [x] All Acceptance Criteria met (pre-existing, verified)
- [x] Tests written and passing (4 contract tests in workflow-config-contract.test.ts)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] PR created and linked (#184)

---

## Agent References

- [Extension Integration](../extension-integration.md)
- [Transition Guard Evidence](../transition-guard-evidence.md)

## Finding Snapshot (Immutable)

| Field | Value |
|-------|-------|
| Source Finding ID | D-007 |
| Axis | Development |
| Severity | HIGH |
| Confidence | HIGH |
| Evidence | `docs/runbook.md` lines 50-63 vs `openclaw.plugin.json` `additionalProperties: false`; runtime parsing at `src/index.ts:152-153` |
| Impact | Users following the runbook receive schema validation errors; schema contract and runtime behavior diverge |
| Recommendation | Extend `openclaw.plugin.json` schema to include `workflow` property (or remove from runbook); add contract tests |
