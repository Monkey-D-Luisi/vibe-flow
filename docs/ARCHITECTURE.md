# Architecture Overview

This document provides a high-level overview of the Agents & MCPs system architecture, design principles, and key components.

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Principles](#architecture-principles)
3. [Component Architecture](#component-architecture)
4. [Data Flow](#data-flow)
5. [State Management](#state-management)
6. [Agent System](#agent-system)
7. [Quality System](#quality-system)
8. [GitHub Integration](#github-integration)
9. [Technology Stack](#technology-stack)

---

## System Overview

The Agents & MCPs system is an **agent-orchestrated task management platform** that automates the complete software development lifecycle from requirements gathering to deployment.

### Key Capabilities

- **Automated Workflow**: End-to-end task execution through specialized agents
- **Quality Enforcement**: Built-in quality gates at each workflow stage
- **Contract-Driven**: Strict JSON schemas for all agent interactions
- **TDD First**: Test-Driven Development baked into the workflow
- **GitHub Native**: Deep integration with GitHub for project management
- **Fast-Track**: Intelligent workflow optimization for minor changes

### Design Goals

1. **Reliability**: Robust state management with optimistic locking
2. **Observability**: Complete audit trail of all decisions and transitions
3. **Quality**: Automated enforcement of coverage, linting, and complexity thresholds
4. **Flexibility**: Extensible agent system for custom workflows
5. **Performance**: Concurrent agent execution with lease-based locking

---

## Architecture Principles

### 1. Hexagonal Architecture (Ports & Adapters)

The system follows hexagonal architecture to maintain clean separation of concerns:

```
┌─────────────────────────────────────────┐
│           Application Core               │
│  (Domain Logic, Business Rules)         │
│                                         │
│  ┌──────────┐     ┌──────────┐        │
│  │TaskRecord│     │  Agent   │        │
│  │  Rules   │     │Contracts │        │
│  └──────────┘     └──────────┘        │
└─────────────────────────────────────────┘
         ↑                    ↑
         │                    │
    ┌────┴────┐         ┌────┴────┐
    │  Ports  │         │  Ports  │
    └────┬────┘         └────┬────┘
         │                    │
         ↓                    ↓
┌─────────────────┐   ┌─────────────────┐
│    Adapters     │   │    Adapters     │
│                 │   │                 │
│  - SQLite Repo  │   │  - MCP Server   │
│  - File System  │   │  - HTTP API     │
│  - GitHub API   │   │  - CLI Tools    │
└─────────────────┘   └─────────────────┘
```

**Benefits**:
- Domain logic remains pure and testable
- Easy to swap infrastructure components
- Clear boundaries between layers

### 2. Contract-Driven Development

All agent interactions use strict JSON schemas:

```
Agent Output → Schema Validation → Next Agent Input
```

**Benefits**:
- Type safety across agent boundaries
- Prevents malformed data propagation
- Self-documenting interfaces
- Easier testing and debugging

### 3. Event Sourcing

All state changes are recorded in an event log:

```
State Change → Event Created → Event Stored → Queryable History
```

**Benefits**:
- Complete audit trail
- Debugging capabilities
- Replay and analysis
- Compliance and traceability

### 4. Optimistic Concurrency Control

Tasks use revision-based optimistic locking:

```
Read (rev=3) → Modify → Write (if_rev=3) → Success/Conflict
```

**Benefits**:
- No locks held during user operations
- Better UX for distributed scenarios
- Clear conflict detection
- Scalable for concurrent access

---

## Component Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────┐
│                  Orchestrator                        │
│  (Routes tasks, enforces contracts, quality gates)  │
└──────────────┬──────────────────────┬────────────────┘
               │                      │
    ┌──────────▼──────────┐    ┌─────▼──────────┐
    │   Agent System      │    │  State Manager  │
    │                     │    │                 │
    │ ┌─────┐  ┌─────┐  │    │ ┌─────────────┐ │
    │ │ PO  │  │Arch │  │    │ │Orchestrator │ │
    │ └─────┘  └─────┘  │    │ │   State     │ │
    │                    │    │ └─────────────┘ │
    │ ┌─────┐  ┌─────┐  │    │ ┌─────────────┐ │
    │ │ Dev │  │ Rev │  │    │ │ Event Log   │ │
    │ └─────┘  └─────┘  │    │ └─────────────┘ │
    │                    │    │ ┌─────────────┐ │
    │ ┌─────┐  ┌─────┐  │    │ │   Leases    │ │
    │ │ QA  │  │PR-B │  │    │ └─────────────┘ │
    │ └─────┘  └─────┘  │    └─────────────────┘
    └─────────┬──────────┘
              │
    ┌─────────▼──────────┐
    │   Task Repository   │
    │     (SQLite)        │
    └─────────────────────┘
```

### Task MCP Service

The core service providing MCP tools:

**Responsibilities**:
- Task CRUD operations
- State transitions with validation
- Agent orchestration
- Event journaling
- Lease management

**Technologies**:
- TypeScript
- SQLite with WAL mode
- better-sqlite3
- MCP JSON-RPC

### Quality MCP Service

Independent quality tooling service:

**Responsibilities**:
- Test execution
- Coverage analysis
- Linting
- Complexity calculation
- Quality gate enforcement

**Technologies**:
- TypeScript
- Vitest (test runner)
- Istanbul (coverage)
- ESLint (linting)
- typhonjs-escomplex (complexity)

### GitHub Connector

Integration with GitHub APIs:

**Responsibilities**:
- Branch creation
- PR management
- Label synchronization
- Project board updates
- Idempotent operations

**Technologies**:
- Octokit
- GitHub REST API
- GitHub GraphQL API

---

## Data Flow

### Complete Task Lifecycle

```
1. Task Creation (PO)
   └─→ TaskRecord created (status: po)
       └─→ Event: task_created

2. Architecture Phase (if major scope)
   └─→ Architect designs system
       └─→ State: po → arch
           └─→ Event: handoff(po → architect)
               └─→ Design complete (ADR, contracts)
                   └─→ State: arch → dev
                       └─→ Event: design_ready

3. Development Phase
   └─→ Dev implements with TDD
       └─→ Red-Green-Refactor logs
           └─→ Quality metrics captured
               └─→ State: dev → review
                   └─→ Event: submit_review

4. Review Phase
   └─→ Reviewer checks SOLID principles
       └─→ Violations recorded
           └─→ If approved: → po_check
           └─→ If changes needed: → dev (round++)
               └─→ Event: review_decision

5. PO Check
   └─→ PO validates acceptance criteria
       └─→ State: po_check → qa
           └─→ Event: po_approved

6. QA Phase
   └─→ QA runs test suite
       └─→ QA report generated
           └─→ If passed: → pr
           └─→ If failed: → dev
               └─→ Event: qa_result

7. PR Phase
   └─→ PR-Bot creates PR
       └─→ Labels applied
           └─→ Project status updated
               └─→ PR merged
                   └─→ State: pr → done
                       └─→ Event: task_completed
```

### Fast-Track Flow (Minor Scope)

```
1. Task Creation (PO)
   └─→ TaskRecord created (status: po, scope: minor)
       └─→ Fast-track evaluation
           └─→ If eligible: po → dev (skip arch)
           └─→ If ineligible: po → arch (normal flow)
               └─→ Event: fasttrack_decision

2. Post-Dev Guard
   └─→ After dev completion
       └─→ Re-evaluate eligibility
           └─→ If still eligible: continue
           └─→ If revoked: → arch
               └─→ Event: fasttrack_revoked
```

---

## State Management

### Database Schema

#### TaskRecords Table
```sql
CREATE TABLE task_records (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  scope TEXT NOT NULL,
  metrics_json TEXT,
  rev INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
  -- ... additional fields
);
```

#### Orchestrator State Table
```sql
CREATE TABLE orchestrator_state (
  task_id TEXT PRIMARY KEY,
  current TEXT NOT NULL,
  previous TEXT,
  last_agent TEXT,
  rounds_review INTEGER DEFAULT 0,
  rev INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES task_records(id)
);
```

#### Event Log Table
```sql
CREATE TABLE event_log (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES task_records(id)
);
```

#### Leases Table
```sql
CREATE TABLE leases (
  task_id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  owner_agent TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES task_records(id)
);
```

### Concurrency Strategy

1. **Optimistic Locking**: Revision numbers prevent lost updates
2. **Lease-Based Locking**: TTL-based exclusive access for agent execution
3. **WAL Mode**: SQLite Write-Ahead Logging for concurrent reads
4. **Event Journaling**: Immutable audit log of all changes

---

## Agent System

### Agent Responsibilities

| Agent | Phase | Input | Output |
|-------|-------|-------|--------|
| **PO** | Requirements | User story | PO Brief (acceptance criteria) |
| **Architect** | Design | PO Brief | Design Ready (modules, contracts, ADR) |
| **Dev** | Implementation | Design Ready | Dev Output (diff, metrics, TDD logs) |
| **Reviewer** | Code Review | Dev Output | Review Report (violations, severity) |
| **QA** | Testing | Test Plan | QA Report (test results) |
| **PR-Bot** | Integration | Approved Task | PR Summary (branch, PR URL) |

### Agent Contract Example

**Input Schema** (Architect):
```json
{
  "title": "Add user validation",
  "acceptance_criteria": ["Invalid user returns 422"],
  "scope": "minor",
  "non_functional": ["Performance: <100ms"]
}
```

**Output Schema** (Architect):
```json
{
  "modules": ["validation", "api"],
  "contracts": [
    {
      "name": "UserValidator",
      "methods": ["validate", "sanitize"]
    }
  ],
  "patterns": [
    {
      "name": "Strategy",
      "where": "validation",
      "why": "Multiple validation rules"
    }
  ],
  "adr_id": "ADR-042",
  "test_plan": ["Unit tests for validator", "Integration tests for API"]
}
```

---

## Quality System

### Quality Gates

#### Development Gate (dev → review)
```
✓ TDD Logs: ≥2 entries
✓ Coverage: ≥80% (major) / ≥70% (minor)
✓ Lint Errors: 0
✓ Tests: All passing
```

#### Review Gate (review → po_check)
```
✓ No high-severity violations
✓ SOLID principles followed
✓ Code patterns documented
```

#### QA Gate (qa → pr)
```
✓ All tests passing
✓ Integration tests green
✓ Smoke tests complete
```

### Quality Metrics

```json
{
  "coverage": {
    "lines": 0.85,
    "statements": 0.86,
    "functions": 0.80,
    "branches": 0.75
  },
  "lint": {
    "errors": 0,
    "warnings": 5
  },
  "complexity": {
    "avgCyclomatic": 3.5,
    "maxCyclomatic": 12
  },
  "tests": {
    "total": 150,
    "passed": 150,
    "failed": 0
  }
}
```

---

## GitHub Integration

### Workflow Automation

1. **Branch Creation**: `feature/ep01-t02-description`
2. **Draft PR**: Automatically created when task reaches `pr` state
3. **Labels**: Applied based on task status and quality gates
4. **Project Board**: Status synchronized with task state
5. **Comments**: Quality reports posted automatically
6. **Ready for Review**: Promoted when quality gates pass

### Label Mapping

| Task State | GitHub Labels |
|------------|--------------|
| `po`, `arch`, `dev` | `status:in-progress` |
| `review` | `status:in-review`, `needs-review` |
| `qa` | `status:qa`, `ready-for-qa` |
| Fast-track eligible | `fast-track`, `fast-track:eligible` |
| Fast-track blocked | `fast-track:incompatible` |

### Project Board Mapping

| Task State | Project Status |
|------------|----------------|
| `po`, `arch`, `dev` | In Progress |
| `review`, `po_check` | In Review |
| `qa`, `pr` | In Review |
| `done` | Done |

---

## Technology Stack

### Core Technologies

- **Language**: TypeScript 5+
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm
- **Database**: SQLite with WAL mode
- **Testing**: Vitest
- **Linting**: ESLint
- **Protocol**: Model Context Protocol (MCP)

### Key Dependencies

- **better-sqlite3**: SQLite bindings
- **ajv**: JSON Schema validation
- **octokit**: GitHub API client
- **ulid**: ULID generation
- **vitest**: Test framework
- **istanbul**: Coverage reporting
- **typhonjs-escomplex**: Complexity analysis

### Infrastructure

- **CI/CD**: GitHub Actions
- **Version Control**: Git/GitHub
- **Project Management**: GitHub Projects v2
- **Documentation**: Markdown

---

## Security Considerations

1. **API Authentication**: API keys with HMAC for Quality MCP
2. **GitHub Tokens**: Secure storage of PAT/App credentials
3. **Input Validation**: JSON Schema validation on all inputs
4. **SQL Injection**: Parameterized queries via better-sqlite3
5. **Least Privilege**: Minimal required GitHub permissions

---

## Performance Characteristics

- **Database**: SQLite handles 100k+ tasks efficiently
- **Concurrent Access**: WAL mode supports multiple readers
- **Agent Execution**: Parallel execution with lease coordination
- **API Latency**: <100ms for most operations
- **Test Execution**: ~5 seconds for full suite

---

## Future Considerations

1. **Multi-Repository Support**: Extend beyond monorepo
2. **Distributed Agents**: Remote agent execution
3. **Custom Quality Rules**: User-defined thresholds
4. **Advanced Reporting**: Analytics dashboard
5. **Agent Marketplace**: Community-contributed agents

---

## References

- [TaskRecord v1.0.0 Spec](task_record_v_1_0.md)
- [State Management](ep_01_t_04_estado_compartido_y_persistencia_sqlite_mcp.md)
- [Agent Contracts](ep_01_t_03_prompts_por_agente_y_contratos_de_salida_especificacion.md)
- [Fast-Track System](ep_01_t_05_fast_track_para_scope_minor_especificacion_tecnica.md)
- [ADR-TR-001](ADR-TR-001.md)

---

**Document Version**: 1.0.0  
**Last Updated**: 2024-10-21  
**Maintained By**: Agents & MCPs Team
