# EP04 -- GitHub Integration

| Field       | Value                                            |
|-------------|--------------------------------------------------|
| Epic        | EP04                                             |
| Status      | PENDING                                          |
| Priority    | P1                                               |
| Phase       | 3 -- GitHub Integration                          |
| Target      | May--June 2026                                   |
| Depends on  | EP02                                             |
| Blocks      | EP06                                             |

## Goal

Automated branch creation, pull-request management, labelling, and CI feedback
with idempotent request tracking to avoid duplicate operations.

## Context

The infra agent needs to interact with GitHub on behalf of the team. Operations
must be idempotent (creating a branch that already exists should be a no-op) and
tracked through the event log for auditability.

## Tasks

### 4.1 GH CLI Wrapper + Idempotency Layer

> **Decided 2026-02-24:** Wrap `gh` CLI via `safeSpawn` instead of Octokit. Auth
> is pre-configured (`gh auth status`). No token handling in plugin code.

- Create `src/github/gh-client.ts` wrapping `gh` CLI commands via `safeSpawn`
  (reuse pattern from `extensions/quality-gate/src/exec/spawn.ts`)
- Create `src/github/idempotency.ts` with SHA-256 payload hashing
- Create dedicated `ext_requests` table (migration v2) for **idempotency tracking**:
  - Fields: `request_id` (PK), `task_id` (FK), `tool`, `payload_hash`, `response` (JSON), `created_at`
  - `UNIQUE(tool, payload_hash)` constraint for O(1) dedup lookup
  - Before executing any `gh` command, hash the sorted payload and check for an
    existing record — if found, return cached response (no-op)
- Create `src/persistence/request-repository.ts` (SqliteRequestRepository)

**New files:**
- `src/github/gh-client.ts`
- `src/github/idempotency.ts`
- `src/github/branch-service.ts`
- `src/github/pr-service.ts`
- `src/github/label-service.ts`
- `src/persistence/request-repository.ts`

**Acceptance Criteria:**
- All operations are idempotent via `ext_requests` hash check
- Request IDs and `task_id` logged for every GitHub API call
- Duplicate calls return cached response without hitting GitHub API
- All `gh` arguments validated via `assertSafeCommand`

**Implementation detail:** See `docs/tasks/0005-github-integration.md` for
full pseudocode, schema definitions, and test plan.

### 4.2 VCS tools registration

Register the following tools:

| Tool                | Description                              |
|---------------------|------------------------------------------|
| `vcs.branch.create` | Create a feature branch for a task       |
| `vcs.pr.create`     | Open a pull request                      |
| `vcs.pr.update`     | Update PR title, body, labels            |
| `vcs.label.sync`    | Synchronize labels on issues/PRs         |

**Acceptance Criteria:**
- All four tools registered and documented
- Branch naming convention enforced (`task/<id>-<slug>`)
- PR template auto-populated from task metadata

### 4.3 PR-Bot skill

- Create a skill that automates standard PR workflows
- Auto-label PRs based on task metadata (scope, epic, area)
- Auto-assign reviewers based on role configuration
- Post status comments on PR with task summary

**Acceptance Criteria:**
- PRs are labelled automatically on creation
- Reviewers assigned based on configuration
- Status comment posted with task link

### 4.4 CI webhook feedback

- Listen for CI status check events
- Update task metadata with build results
- Post comments on PR with test/lint/coverage results
- Transition task if all checks pass (configurable)

**Acceptance Criteria:**
- CI results stored in task event log
- PR comments reflect latest CI status
- Auto-transition is opt-in and configurable

## Out of Scope

- Quality gate logic (EP05)
- Security hardening of tokens (EP06)
- CI webhook listener (future sub-task)
- Auto-reviewer assignment (future enhancement)

## Task Spec

Full implementation spec with pseudocode, TypeBox schemas, test plan, and
file-by-file breakdown: [`docs/tasks/0005-github-integration.md`](../tasks/0005-github-integration.md)

## Prerequisite

Task 0004 (Coverage Debt Fix) must be completed first to ensure product-team
base coverage is >= 80% before adding new modules.

## References

- [Roadmap](../roadmap.md)
- [EP02 -- Task Engine](EP02-task-engine.md)
