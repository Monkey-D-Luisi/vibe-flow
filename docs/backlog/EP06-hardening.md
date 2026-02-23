# EP06 -- Hardening

| Field       | Value                                            |
|-------------|--------------------------------------------------|
| Epic        | EP06                                             |
| Status      | PENDING                                          |
| Priority    | P2                                               |
| Phase       | 5 -- Hardening                                   |
| Target      | August 2026                                      |
| Depends on  | EP03, EP04                                       |
| Blocks      | None                                             |

## Goal

Production readiness with security hardening, cost controls, concurrency
safeguards, and comprehensive documentation.

## Context

Before the product-team system can be used in production, it needs hardening
across security, cost, and operational dimensions. This epic addresses the
non-functional requirements that make the system safe and sustainable.

## Tasks

### 6.1 Tool allow-lists audit

- Review every tool allow-list in `openclaw.json`
- Remove overly broad wildcards where possible
- Document the rationale for each allowed tool per agent
- Add CI check that validates allow-lists against registered tools

**Acceptance Criteria:**
- Every allow-list entry has a documented justification
- No agent has access to tools outside its role
- CI fails if an unknown tool is referenced in allow-lists

### 6.2 Cost tracking and limits

- Track token usage per task (input + output tokens)
- Track API calls per task (GitHub, LLM, etc.)
- Set per-task budget limits (configurable)
- Alert or halt when budget exceeded

**Acceptance Criteria:**
- Token usage recorded in event log per operation
- Budget limits enforced before LLM calls
- Cost report available per task and per agent

### 6.3 Secrets management

- Audit all configuration for embedded secrets
- Ensure no secrets in task metadata or event log
- Document required environment variables
- Validate secrets are not logged in structured logs

**Acceptance Criteria:**
- No secrets in SQLite database
- No secrets in log output
- Environment variable documentation complete

### 6.4 Concurrency limits

- Set maximum parallel tasks per agent
- Set maximum total active tasks
- Queue excess tasks in `backlog` status
- Lease expiration prevents deadlocks

**Acceptance Criteria:**
- Concurrency limits configurable per agent
- Excess tasks queued gracefully
- No deadlock scenarios in stress tests

### 6.5 Runbook and documentation

- Operator runbook: setup, configuration, troubleshooting
- End-to-end walkthrough: task from backlog to done
- Architecture overview with component diagram
- API reference for all registered tools

**Acceptance Criteria:**
- Runbook covers all common operational scenarios
- Walkthrough is executable (can follow step-by-step)
- All tools documented with parameters and examples

## Out of Scope

- Performance optimization (future epic)
- Multi-repo support (future epic)

## References

- [Roadmap](../roadmap.md)
- [EP03 -- Role Execution](EP03-role-execution.md)
- [EP04 -- GitHub Integration](EP04-github-integration.md)
