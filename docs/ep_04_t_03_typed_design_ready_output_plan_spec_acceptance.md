---
id: EP04-T03
epic: EP04-architecture-agent-and-adrs
task: typed_design_ready_output
status: in_progress
owner: monkey-d-luisi
labels: [area_architecture, type_task, docs]
issues: [#69]
adrs: [ADR-0001]
patterns: [P-0001, P-0002]
prs: []
updated_at: 2025-10-22
---

# Typed Design‑Ready Output

## Goal
Provide a **typed, machine‑checkable "design_ready" artifact** that summarizes module boundaries, public contracts, pattern usage, and a test plan. The output must be easy to lint in CI and simple for agents and humans to consume.

## Scope
- Type definitions (TS types + JSON Schema) for the design_ready document.
- Reference generator that produces a design_ready.json from sources (ADR, patterns, module specs).
- Contract shape for APIs and events (request/response, topics, error model).
- Pattern references aligned with the **Pattern Catalog**.
- Test plan skeleton with acceptance checks and traceability.
- Repo integration: pnpm scripts, CI workflow, and lint rules.

Out of scope: implementing the modules themselves; this task defines the typed artifact and its validation pipeline.

## Deliverables
1. `tooling/design-ready/design-ready.schema.json` — canonical JSON Schema.
2. `tooling/design-ready/types.ts` — TypeScript types (generated from schema or the source of truth).
3. `tooling/design-ready/gen.ts` — generator that assembles the document.
4. `docs/epics/EP04-architecture-and-adrs/T03-typed-design-ready/20-design_ready.json` — sample output for EP04.
5. Linter: `tooling/design-ready/lint.ts` plus unit tests.
6. CI job `design-ready-lint.yml` and pnpm scripts.

## Data model (high‑level)
```ts
// types.ts
export type UUID = string;
export type ISODate = string; // YYYY-MM-DD or full ISO

export interface DesignReadyDoc {
  id: string;                // EPxx-Tyy
  title: string;             // human title
  version: number;           // schema version
  updated_at: ISODate;
  owners: string[];          // GitHub handles or teams
  modules: ModuleSpec[];
  contracts: ContractSpec[]; // HTTP, RPC, Events
  patterns: PatternRef[];    // must exist in catalog
  risks?: string[];
  test_plan: TestPlan;
  links?: {
    adrs?: string[];         // ADR-####
    tasks?: string[];        // EPxx-Tyy
  };
}

export interface ModuleSpec {
  key: string;               // slug, unique in doc
  summary: string;
  owned_by: string;          // team/owner
  dependencies?: string[];   // keys of other modules
  public_surface: string[];  // exported functions/endpoints
}

export interface ContractSpec {
  id: string;                // e.g., auth.login.v1
  kind: 'http'|'rpc'|'event';
  module: string;            // ModuleSpec.key
  request?: JSONSchemaRef;   // required for http/rpc
  response?: JSONSchemaRef;  // required for http/rpc
  event?: JSONSchemaRef;     // for kind === 'event'
  errors?: ErrorCase[];
  examples?: ExampleRef[];
}

export interface PatternRef {
  id: string;                // P-0001, P-0002
  rationale: string;         // why it applies here
}

export interface TestPlan {
  strategy: 'component'|'contract'|'e2e'|'mixed';
  acceptance: AcceptanceCase[]; // must trace to contracts or modules
  coverage_targets?: {
    contracts_pct?: number;  // optional goal
  };
}

export interface AcceptanceCase {
  id: string;                // AC-###
  relates_to: { module?: string; contract?: string };
  description: string;
  success_criteria: string[];
}

export interface ErrorCase { code: string; when: string; http?: number; }
export interface ExampleRef { name: string; file: string; }
export interface JSONSchemaRef { $ref?: string; type?: string; [k: string]: unknown }
```

### JSON Schema notes
- Use `$defs` for shared value objects (User, Token, Envelope).
- Enforce `additionalProperties: false` for contracts.
- All pattern IDs must match `^P-\d{4}$` and exist in `docs/patterns/catalog.yml`.
- ADR links must match `^ADR-\d{4}$` and pass `pnpm adr:lint`.

## Generator
`tooling/design-ready/gen.ts` aggregates:
- `docs/patterns/catalog.yml` to validate `patterns` references.
- ADRs under `docs/adr/` to validate `links.adrs`.
- Optional module metadata from `docs/epics/**/T*/10-spec.md` (front‑matter extraction).
Output is written to the task folder under `/20-design_ready.json` and validated against the schema.

## Lint & CI integration
**package.json** (root):
```json
{
  "scripts": {
    "design:gen": "tsx tooling/design-ready/gen.ts",
    "design:lint": "tsx tooling/design-ready/lint.ts",
    "design:test": "tsx tooling/design-ready/__tests__/run.ts",
    "precommit:check": "node scripts/should-run-tests.js || true && pnpm adr:lint && pnpm patterns:lint && pnpm tasks:lint && pnpm design:lint"
  }
}
```
**Workflow** `.github/workflows/design-ready-lint.yml`:
- Setup Node + pnpm
- Run `pnpm install -w` and `pnpm design:gen && pnpm design:lint`
- Expose status check `design-ready-lint`

Mark the workflow as **Required** on protected branches once green.

## Contracts examples (sketch)
```jsonc
{
  "id": "auth.login.v1",
  "kind": "http",
  "module": "auth",
  "request": {"type": "object", "required": ["email","password"], "properties": {"email": {"type":"string","format":"email"}, "password": {"type":"string","minLength": 8}}},
  "response": {"type":"object","required":["token"],"properties":{"token":{"type":"string"}}},
  "errors": [{"code":"AUTH_INVALID","when":"Bad credentials","http":401}],
  "examples": [{"name":"ok","file":"examples/auth.login.ok.json"}]
}
```

## Test plan (sample)
```jsonc
{
  "strategy": "mixed",
  "acceptance": [
    {
      "id": "AC-001",
      "relates_to": {"contract": "auth.login.v1"},
      "description": "User receives JWT on valid credentials",
      "success_criteria": ["200 response","token matches schema","exp >= 15m"]
    },
    {
      "id": "AC-002",
      "relates_to": {"module": "payments"},
      "description": "Circuit breaker opens on 5xx burst",
      "success_criteria": ["P-0001 referenced","trips within window","auto-closes after cool-down"]
    }
  ],
  "coverage_targets": {"contracts_pct": 90}
}
```

## Acceptance criteria
1. `design-ready.schema.json` exists and validates the sample document.
2. `pnpm design:gen` produces `20-design_ready.json` under EP04‑T03 and passes `pnpm design:lint`.
3. Pattern refs are cross‑checked against `patterns:lint`; ADR refs pass `adr:lint`.
4. CI workflow `design-ready-lint` runs on PR and is green.
5. The document lists at least 3 modules and 3 contracts with 1 event example.
6. Test plan includes at least 2 acceptance cases and maps to modules/contracts.

## Verification
- Run locally: `pnpm design:gen && pnpm design:lint && pnpm test:quick`.
- Break something (e.g., remove required field in a contract) and confirm linter fails with a precise message.
- Inspect the rendered JSON and ensure it is linked from the task folder.

## Risks & mitigations
- **Drift between TS types and JSON Schema.** Source of truth is the **Schema**; generate types from schema in CI.
- **Catalog references go stale.** Lint checks include ADR/pattern existence and status.
- **Over‑specification.** Keep the schema pragmatic; optional fields stay optional.

## Definition of Done
1. Schema, types, generator, and linter are in `tooling/design-ready/` with tests.
2. Sample doc committed under EP04‑T03.
3. CI check is required on protected branches.
4. README updated with a short "How to produce design_ready" section.

## Checklist
- [ ] Schema authored and reviewed
- [ ] Types generated from schema
- [ ] Generator reads ADR and Pattern catalogs
- [ ] Linter enforces references and invariants
- [ ] CI workflow added and passing
- [ ] Sample document produced for EP04‑T03

