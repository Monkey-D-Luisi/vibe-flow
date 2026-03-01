# Task 0045 -- End-to-End Integration Test Suite

| Field        | Value                                                |
|--------------|------------------------------------------------------|
| Task         | 0045                                                 |
| Epic         | EP08 — Autonomous Product Team                       |
| Phase        | 8D — Integration Testing & Hardening                 |
| Status       | DONE                                                 |
| Dependencies | 0042 (Orchestrator pipeline complete)                |
| Blocks       | None (final validation)                              |

## Goal

Build a comprehensive test suite that validates the full autonomous pipeline:
idea → roadmap → tasks → design → implementation → quality gates → PR → merge.
All external services are mocked for reproducible testing.

## Context

The pipeline involves 10 agents, 4+ LLM providers, Stitch MCP, GitHub API, and
Telegram API. Testing the real pipeline would be expensive and non-deterministic.
The E2E suite uses mock providers that return canned responses, allowing the
pipeline mechanics to be tested without actual LLM calls.

## Deliverables

### D1: Mock Provider Infrastructure

```
tests/e2e/
├── mocks/
│   ├── llm-provider.ts         # Mock LLM that returns role-appropriate responses
│   ├── stitch-mcp.ts           # Mock Stitch MCP endpoint
│   ├── github-api.ts           # Mock GitHub API (branches, PRs, labels)
│   ├── telegram-bot.ts         # Mock Telegram bot API
│   └── fixtures/
│       ├── pm-responses.json       # PM agent canned responses
│       ├── po-responses.json       # PO agent canned responses
│       ├── tech-lead-responses.json
│       ├── designer-responses.json
│       ├── dev-responses.json
│       ├── qa-responses.json
│       └── devops-responses.json
├── scenarios/
│   ├── happy-path.test.ts          # Full pipeline, no errors
│   ├── design-skip.test.ts         # Backend-only task, skip design
│   ├── quality-gate-fail.test.ts   # QA fails, retry, then pass
│   ├── agent-failure.test.ts       # Agent crashes, escalation
│   ├── parallel-tasks.test.ts      # Multiple tasks in parallel
│   ├── human-intervention.test.ts  # Human /pause, /approve commands
│   └── multi-project.test.ts       # Switch between projects
└── helpers/
    ├── pipeline-harness.ts     # Test orchestrator with mock agents
    └── assertions.ts           # Custom assertion helpers
```

### D2: Test Scenarios

#### Happy path
1. Submit idea via `pipeline.start`
2. Verify PM creates roadmap item
3. Verify PO refines into stories
4. Verify Tech Lead decomposes into tasks
5. Verify Designer creates design for UI task
6. Verify Backend dev implements API task
7. Verify Frontend dev implements UI task
8. Verify QA runs tests and reports pass
9. Verify Tech Lead approves review
10. Verify DevOps creates PR
11. Verify Telegram receives notifications at each stage

#### Quality gate failure
1. Submit idea, pipeline progresses to QA
2. QA reports coverage below threshold
3. Verify orchestrator sends task back to dev
4. Dev fixes tests, QA passes second time
5. Pipeline continues to review

#### Agent failure
1. Backend dev agent encounters error
2. Orchestrator retries once
3. Still fails → escalates to Tech Lead
4. Tech Lead reassigns to back-2
5. Pipeline continues

### D3: CI Integration

Add E2E test script to root `package.json`:
```json
"test:e2e": "pnpm vitest run tests/e2e/"
```

E2E tests run in CI alongside unit tests but are tagged for optional skip
(`vitest --tag e2e`) since they're slower.

## Acceptance Criteria

- [x] Happy path scenario passes
- [x] Design skip scenario passes (backend-only)
- [x] Quality gate failure + retry scenario passes
- [x] Agent failure + escalation scenario passes
- [x] Parallel tasks scenario passes
- [x] Human intervention scenario passes
- [x] Multi-project switch scenario passes
- [x] All external services are mocked (no real API calls)
- [x] Test suite runs in CI via `pnpm test:e2e`
- [x] Reproducible results (no flaky tests)

## Testing Plan

This IS the testing task. Acceptance = all scenarios pass with mocked services.

## Technical Notes

- Mock LLM provider returns structured JSON matching role output schemas
  (po_brief, architecture_plan, dev_result, etc.). No actual LLM inference.
- Mock Stitch returns canned HTML designs
- Mock GitHub returns success for branch/PR operations
- Mock Telegram records messages for assertion (never sends real messages)
- Use Vitest's `vi.mock()` for mocking, and custom fixtures for response data
