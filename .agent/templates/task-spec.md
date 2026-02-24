# Task: NNNN -- <Title>

## Metadata

| Field | Value |
|-------|-------|
| Status | PENDING |
| Epic | <Epic name or link> |
| Priority | <HIGH / MEDIUM / LOW / URGENT> |
| Scope | <MAJOR / MINOR> |
| Created | YYYY-MM-DD |
| Branch | `feature/NNNN-<kebab-case>` |

---

## Goal

<One or two sentences describing what this task achieves and why it matters.>

---

## Context

<Background information. What exists today? What problem does this solve?
Link to relevant ADRs, epics, or prior tasks.>

---

## Scope

### In Scope

- <Specific deliverable 1>
- <Specific deliverable 2>

### Out of Scope

- <Explicitly excluded item 1>
- <Explicitly excluded item 2>

---

## Requirements

1. <Functional requirement>
2. <Functional requirement>
3. <Non-functional requirement (performance, security, etc.)>

---

## Acceptance Criteria

- [ ] AC1: <Testable criterion>
- [ ] AC2: <Testable criterion>
- [ ] AC3: <Testable criterion>

---

## Constraints

- <Technical constraint (e.g., must use TypeBox schemas)>
- <Process constraint (e.g., no breaking changes to existing API)>

---

## Implementation Steps

1. <Step 1>
2. <Step 2>
3. <Step 3>

---

## Testing Plan

- Unit tests: <What to test at the domain level>
- Integration tests: <What to test with database or external systems>
- Contract tests: <Schema validation, if applicable>

---

## Definition of Done

- [ ] All Acceptance Criteria met
- [ ] Tests written and passing
- [ ] Coverage meets threshold (>= 80% major / >= 70% minor)
- [ ] Lint passes with zero errors
- [ ] TypeScript compiles without errors
- [ ] Walkthrough updated
- [ ] Code reviewed (if applicable)
- [ ] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
