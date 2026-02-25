# Task: ft-0172 -- Full Audit and Findings Workflows

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | Process governance |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-02-25 |
| Branch | `main` |

---

## Goal

Add two operational workflows with command triggers:

- `full audit`: run a complete audit ordered by priority axis `Product > Security > Architecture > Development`.
- `process findings`: transform audit findings into executable task and walkthrough artifacts with deterministic rules.

Execute `full audit` and publish a detailed report with command-backed evidence and official-source citations.

---

## Context

The repository already defines command-triggered workflows (`next task`, `code review`, `fast track`, `pr`) but lacks a complete audit workflow and a deterministic findings-processing workflow. This task formalizes both workflows and executes the first audit cycle under the new contract.

---

## Scope

### In Scope

- Add new workflow rules:
  - `.agent/rules/full-audit-workflow.md`
  - `.agent/rules/findings-processing-workflow.md`
- Add new command triggers in Codex and Claude command shims:
  - `.codex/commands/full-audit.md`
  - `.codex/commands/process-findings.md`
  - `.claude/commands/full-audit.md`
  - `.claude/commands/process-findings.md`
- Update command registries/documentation in:
  - `.agent.md`
  - `AGENTS.md`
  - `.github/copilot-instructions.md`
- Execute `full audit` and publish:
  - `docs/audits/2026-02-25-comprehensive-audit-product-security-architecture-development.md`
- Record implementation and execution evidence in walkthrough:
  - `docs/walkthroughs/ft-0172-full-audit-and-findings-workflows.md`

### Out of Scope

- Applying remediation code changes for audit findings.
- Executing `process findings` against the generated report in this task.

---

## Requirements

1. Workflow `full audit` must include mandatory phases and command-backed evidence requirements.
2. Workflow `process findings` must define deterministic task generation, grouping policy, and closure criteria.
3. Findings section order in audit report must strictly follow: Product, Security, Architecture, Development.
4. Report findings table must include: `ID`, `Axis`, `Severity`, `Confidence`, `Evidence`, `Impact`, `Recommendation`, `Owner`, `Status`.
5. Audit report must include local official docs references and official web citation links.

---

## Acceptance Criteria

- [x] AC1: All required rule and command files exist and reference the correct workflows.
- [x] AC2: `.agent.md`, `AGENTS.md`, and `.github/copilot-instructions.md` list `full audit` and `process findings`.
- [x] AC3: Audit report exists at the required path and follows mandatory structure and priority ordering.
- [x] AC4: Report includes command evidence and citation links for official sources.
- [x] AC5: Walkthrough captures commands run, decisions, and artifacts produced.

---

## Constraints

- English-only repository content.
- Workflow execution must be atomic and command-backed.
- No finding may be declared closed without verification evidence and linked walkthrough proof.

---

## Implementation Steps

1. Define `full audit` and `process findings` rule contracts.
2. Register command shims for Codex and Claude.
3. Update command registries in governance docs.
4. Execute full-audit command sequence and collect evidence.
5. Produce detailed audit report with ordered findings and roadmap.
6. Finalize walkthrough and mark task complete.

---

## Testing Plan

- Validate file presence and command registries with filesystem checks.
- Execute baseline quality and audit commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm audit --prod --audit-level=critical`
  - `pnpm audit --prod`
- Validate report structure and required sections by manual review.

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] New workflows and commands added in both command surfaces
- [x] Full audit executed with command-backed evidence
- [x] Detailed audit report published at target path
- [x] Walkthrough updated with execution journal
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Tests pass

---

## Agent References

- [Autonomous Workflow](../../.agent/rules/autonomous-workflow.md)
- [Fast Track Workflow](../../.agent/rules/fast-track-workflow.md)
- [Code Review Workflow](../../.agent/rules/code-review-workflow.md)
