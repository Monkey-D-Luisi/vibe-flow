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

### 4.1 GithubService migration

- Port GithubService from old MCP server codebase
- Adapt to OpenClaw plugin API patterns
- Replace direct Octokit usage with abstracted VCS interface
- Add idempotency tracking (request IDs in event log)

**Acceptance Criteria:**
- GithubService works within plugin context
- All operations are idempotent
- Request IDs logged for every GitHub API call

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

## References

- [Roadmap](../roadmap.md)
- [EP02 -- Task Engine](EP02-task-engine.md)
