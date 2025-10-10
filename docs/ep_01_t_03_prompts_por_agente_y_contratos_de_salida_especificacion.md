# EP01‑T03 — Agent Prompts and Output Contracts

> Objective: define system instructions per agent, their typed inputs/outputs and evaluation criteria so that the orchestrator can chain handoffs without ambiguity or creativity outside the allowed range.

## Agents and Responsibilities

* **orchestrator**: plans, routes and validates handoffs; applies fast‑track if `scope=minor`.
* **po**: defines objective, acceptance criteria, priorities and constraints (security, performance, privacy).
* **architect**: produces `design_ready` (modules, contracts, patterns, test_plan), registers ADRs.
* **dev**: implements with TDD; delivers `diff_summary`, `red_green_refactor_log` and updates metrics.
* **reviewer**: executes SOLID/Clean Code/Patterns rubric and issues `violations`.
* **qa**: executes unit/contract/smoke plan; produces `qa_report` and evidence.
* **pr-bot**: creates branch, commits gated by tests, and PR with checklist.
* **telemetry**: traces handoffs and metrics.

## I/O Contracts per Agent

### 1) PO → `po.brief`

**Input:**

```json
{
  "title": "string",
  "description": "string",
  "acceptance_criteria": ["string"],
  "scope": "minor|major",
  "constraints": {"security": ["string"], "performance": ["string"], "privacy": ["string"]}
}
```

**Output (`po_brief.json`)**

```json
{
  "title": "string",
  "acceptance_criteria": ["string"],
  "scope": "minor|major",
  "non_functional": ["string"],
  "done_if": ["string"]
}
```

### 2) Architecture → `architect.design_ready`

**Output:**

```json
{
  "modules": ["string"],
  "contracts": [{"name": "PascalCase", "methods": ["string"]}],
  "patterns": [{"name": "string", "where": "string", "why": "string"}],
  "adr_id": "ADR-\d+",
  "test_plan": ["string"]
}
```

### 3) Dev → `dev.work_output`

```json
{
  "diff_summary": "string",
  "metrics": {"coverage": 0.0, "lint": {"errors": 0, "warnings": 0}},
  "red_green_refactor_log": ["string"]
}
```

### 4) Reviewer → `reviewer.report`

```json
{
  "violations": [{"rule": "string", "where": "string", "why": "string", "severity": "low|med|high", "suggested_fix": "string"}],
  "summary": "string"
}
```

### 5) QA → `qa.report`

```json
{
  "total": 0,
  "passed": 0,
  "failed": 0,
  "evidence": ["string"]
}
```

### 6) PR Bot → `pr.summary`

```json
{
  "branch": "feature/[a-z0-9._-]+",
  "pr_url": "https://...",
  "checklist": ["string"]
}
```

## System Instructions (summary)

> All with `temperature: 0` and `guardrails` to **not invent fields** nor go outside the expected JSON.

**po.system**

* Objective: distill clear requirements and actionable acceptance criteria.
* Strict output: `po_brief.json`.

**architect.system**

* Objective: deliver self-explanatory `design_ready` with patterns and trade‑offs.
* Rules: prefer GoF/DDD patterns; justify with `why`; ADR mandatory.

**dev.system**

* Objective: pure TDD; first tests, then implementation; report `metrics` and `rgr_log`.
* Rules: SOLID, Clean Code, avoid couplings, small functions.

**reviewer.system**

* Objective: evaluate with rubric and severities; block with `high`.
* Rules: each violation must propose `suggested_fix`.

**qa.system**

* Objective: execute plan defined by architecture; record evidence.

**pr-bot.system**

* Objective: create PR with checklist of criteria, ADR, QA, metrics and link to issue.

## Automatic Validations per Tool

* `dev.work_output`: `coverage ≥ 0.8` if `scope=major`, `≥ 0.7` if `minor`; `lint.errors = 0`.
* `reviewer.report`: no `severity=high` to pass to `po_check`.
* `qa.report`: `failed = 0` to pass to `pr`.

## Contract Tests

* Given a minimal input per agent, the parser validates that the output JSON **complies with the schema** and brings no extra fields.
* Snapshot tests of prompts to avoid drift.

## DoD (EP01‑T03)

* Schemas `po_brief.json`, `design_ready.json`, `dev_work_output.json`, `reviewer_report.json`, `qa_report.json`, `pr_summary.json` published in `packages/schemas/`.
* Contract tests per agent in `services/task-mcp/test/agents.contract.spec.ts`.
* Orchestrator capable of routing and validating each handoff using these contracts.

---

## Implementation Instructions

> Yes, the step-by-step instructions were missing. Here you have the complete recipe so that the orchestrator and agents work without improvising.

### 1) File Structure

```
packages/schemas/
  po_brief.schema.json
  design_ready.schema.json
  dev_work_output.schema.json
  reviewer_report.schema.json
  qa_report.schema.json
  pr_summary.schema.json
services/task-mcp/
  src/agents/
    po.ts            # prompt + output validation
    architect.ts     # prompt + output validation
    dev.ts           # prompt + output validation
    reviewer.ts      # prompt + output validation
    qa.ts            # prompt + output validation
    prbot.ts         # prompt + output validation
  src/orchestrator/
    router.ts        # decides next agent based on status/scope
    runner.ts        # executes agent (Agent Builder / API) and validates against schema
    mappers.ts       # maps output → TaskRecord.patch
  test/agents.contract.spec.ts
```

### 2) Output Schemas (place in `packages/schemas/`)

> They are already defined above in "I/O Contracts". Copy them 1:1 to `.schema.json` files and version them.

* `po_brief.schema.json`, `design_ready.schema.json`, `dev_work_output.schema.json`, `reviewer_report.schema.json`, `qa_report.schema.json`, `pr_summary.schema.json`.
* Add `"additionalProperties": false` in all to avoid inventions.

### 3) Prompt Templates per Agent

> Use **temperature: 0** and **strict response_format**. If using Agent Builder, define each agent with its system prompt and the schema as "tool output".

**`src/agents/dev.ts` (prompt excerpt)**

```
You are the DEV agent. Write tests first (TDD), then implementation. Do not invent fields.
Mandatory output: Valid JSON that complies with `dev_work_output.schema.json`.
Rules:
- Apply SOLID and Clean Code.
- coverage ≥ 0.8 (major) | ≥ 0.7 (minor)
- lint.errors = 0
- Include `red_green_refactor_log` with at least 2 entries (red→green).
```

**`src/agents/reviewer.ts`**

```
You are the REVIEWER agent. You evaluate the delivery with the SOLID/Patterns rubric.
Output: `reviewer_report.schema.json`
Rules:
- Each violation includes rule, where, why, severity and suggested_fix.
- Do not allow passing to PO_CHECK if severity = "high" exists.
```

**`src/agents/architect.ts`**

```
You are the ARCHITECT agent. You deliver `design_ready` with modules, contracts, patterns and ADR.
Output: `design_ready.schema.json`. Justify patterns in `why`.
```

**`src/agents/qa.ts`**

```
You are QA. You execute unit/contract/smoke plan.
Output: `qa_report.schema.json` with failed=0 to approve.
```

**`src/agents/prbot.ts`**

```
You are PR-BOT. You create branch, draft PR and validation checklist.
Output: `pr_summary.schema.json` (branch, pr_url, checklist[]).
```

### 4) Runner and Validation

**`src/orchestrator/runner.ts` (pseudocode)**

```ts
import Ajv from "ajv";
import { callAgent } from "../vendor/agent-builder.js"; // wrapper to OpenAI Agent Builder

export async function runAgent({agent, input, schemaPath}) {
  const out = await callAgent(agent, input); // returns JSON string
  const json = JSON.parse(out);
  const validate = new Ajv({allErrors:true, strict:false}).compile(require(schemaPath));
  if (!validate(json)) throw new Error("SchemaError:"+JSON.stringify(validate.errors));
  return json;
}
```

### 5) Router

**`src/orchestrator/router.ts`**

```ts
import { TaskRecord } from "../domain/TaskRecord";
export function nextAgent(tr: TaskRecord){
  if (tr.status === "po" && tr.scope === "minor") return "dev"; // fast‑track
  if (tr.status === "po") return "architect";
  if (tr.status === "arch") return "dev";
  if (tr.status === "dev") return "reviewer";
  if (tr.status === "review") return "po_check";
  if (tr.status === "po_check") return "qa";
  if (tr.status === "qa") return "prbot";
  return null;
}
```

### 6) Output Mapping → TaskRecord.patch

**`src/orchestrator/mappers.ts`**

```ts
export function mapDev(out){
  return { metrics: out.metrics, red_green_refactor_log: out.red_green_refactor_log, diff_summary: out.diff_summary };
}
export function mapReviewer(out){ return { review_notes: out.violations, }; }
export function mapQA(out){ return { qa_report: { total: out.total, passed: out.passed, failed: out.failed } }; }
export function mapArchitect(out){ return { modules: out.modules, contracts: out.contracts, patterns: out.patterns, adr_id: out.adr_id, test_plan: out.test_plan } }
export function mapPR(out){ return { branch: out.branch, links: { git: { prUrl: out.pr_url } } } }
```

### 7) Contract Tests (Vitest)

**`test/agents.contract.spec.ts`**

```ts
import { runAgent } from "../src/orchestrator/runner";
import poBrief from "../../packages/schemas/po_brief.schema.json";
// ...load the rest of schemas

it("dev complies with schema and thresholds", async () => {
  const out = await runAgent({ agent: "dev", input: { /* brief */ }, schemaPath: "packages/schemas/dev_work_output.schema.json" });
  expect(out.metrics.coverage).toBeGreaterThanOrEqual(0.7);
  expect(out.red_green_refactor_log.length).toBeGreaterThanOrEqual(2);
});
```

### 8) GitHub Integration

* PR‑bot MCP updates the PR body with checklist and links issue.
* If `runAgent('reviewer')` returns `severity=high`, adds label `changes-requested` and comments on the PR with the `violations[]`.
* If `runAgent('qa')` fails, marks the PR as draft and adds label `qa-failed`.

### 9) DoD of EP01‑T03

* `.schema.json` schemas created and versioned.
* Prompts implemented per agent.
* `runner`, `router`, `mappers` working.
* Contract tests green.
* Handoffs validate against schema before updating `TaskRecord` and before changing status.
