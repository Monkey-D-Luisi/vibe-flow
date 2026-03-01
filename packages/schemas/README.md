# @openclaw/schemas

Reference JSON Schemas for OpenClaw quality gate tools.

## Status

These schemas are **reference documentation only**. They are not linked to TypeScript tool definitions and are not loaded at runtime. The `loadSchema()` utility that previously referenced these files has been removed (task 0030).

The authoritative type definitions for these tools are in:
- `packages/quality-contracts/src/complexity/types.ts` — complexity types
- `packages/quality-contracts/src/gate/types.ts` — gate policy types
- `extensions/quality-gate/src/tools/*.ts` — per-tool input/output interfaces

## Reference Schemas

| Schema | Input | Output |
|--------|-------|--------|
| Complexity | `quality_complexity.input.schema.json` | `quality_complexity.output.schema.json` |
| Coverage | `quality_coverage.input.schema.json` | `quality_coverage.output.schema.json` |
| Gate | `quality_gate.input.schema.json` | `quality_gate.output.schema.json` |
| Lint | `quality_lint.input.schema.json` | `quality_lint.output.schema.json` |
| Tests | `quality_tests.input.schema.json` | `quality_tests.output.schema.json` |

## Maintenance Note

If these schemas are regenerated or updated in the future, they should be kept in sync with the TypeScript interfaces in `quality-contracts` and `quality-gate`. Consider using a schema generation tool (e.g., `ts-json-schema-generator`) rather than hand-editing.
