# Agents & MCPs — TaskRecord v1.0.0 Implementation

This monorepo contains the complete implementation of **TaskRecord v1.0.0** following hexagonal architecture, with SQLite persistence and exposure via **Model Context Protocol (MCP)**.

## 📋 Project Description

Implementation of a task management system (TaskRecord) that allows:
- Create and manage task records with strict validations
- Optimistic concurrency control
- State transitions with business rules
- Advanced search and filtering
- Exposure via MCP tools for integration with AI agents

## 🏗️ Architecture

### Hexagonal Architecture
- **Domain**: Pure business logic (TaskRecord, validations, transition rules)
- **Persistence**: SQLite repository with automatic migration
- **Exposure**: MCP server with JSON-RPC tools

### Monorepo Structure
```
agents-mcps/
├── packages/
│   └── schemas/           # JSON Schema v1.0.0
│       └── taskrecord.schema.json
├── services/
│   └── task-mcp/          # Main MCP service
│       ├── src/
│       │   ├── domain/    # Domain types and rules
│       │   ├── repo/      # SQLite persistence
│       │   └── mcp/       # MCP tools
│       └── test/          # TDD tests
└── docs/
    └── task_record_v_1_0.md  # Complete documentation
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- pnpm
- SQLite (included)

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd agents-mcps

# Install dependencies
pnpm install

# Approve better-sqlite3 builds (first time only)
pnpm approve-builds
```

### Run the MCP Server
```bash
# From the monorepo root
pnpm --filter @agents/task-mcp dev

# Or from the service directory
cd services/task-mcp
pnpm dev
```

The server will start and display: `Task MCP server started`

## 🛠️ Available MCP Tools

### task.create
Creates a new TaskRecord in initial state (`po`).

**Input:**
```json
{
  "title": "Add user validation",
  "description": "As PO I want...",
  "acceptance_criteria": ["when invalid user → error 422"],
  "scope": "minor",
  "links": {
    "jira": {"projectKey": "AGENTSMCPS", "issueKey": "AGENTSMCPS-15"}
  },
  "tags": ["area_architecture", "agent_orchestrator"]
}
```

### task.get
Gets a TaskRecord by its ID.

**Input:**
```json
{"id": "TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C"}
```

### task.update
Updates a TaskRecord with optimistic concurrency control.

**Input:**
```json
{
  "id": "TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C",
  "if_rev": 3,
  "patch": {
    "metrics": {"coverage": 0.83, "lint": {"errors": 0, "warnings": 2}},
    "red_green_refactor_log": ["red: 4 failing", "green: all passing"]
  }
}
```

### task.search
Searches TaskRecords with filters and pagination.

**Input:**
```json
{
  "q": "validation",
  "status": ["dev", "review"],
  "labels": ["area_architecture"],
  "limit": 50,
  "offset": 0
}
```

### task.transition
Transita un TaskRecord a un nuevo estado con validaciones y efectos secundarios.

**Input:**
```json
{
  "id": "TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C",
  "to": "review",
  "if_rev": 5,
  "evidence": {
    "red_green_refactor_log": ["red: 4 failing", "green: all passing"],
    "metrics": {"coverage": 0.85, "lint": {"errors": 0, "warnings": 1}},
    "acceptance_criteria_met": true,
    "qa_report": {"total": 10, "passed": 10, "failed": 0},
    "violations": [{"severity": "low", "description": "style issue"}],
    "merged": true
  }
}
```

**Efectos por Transición:**
- `dev → review`: Actualiza `red_green_refactor_log` y `metrics`
- `review → dev`: Incrementa `rounds_review`
- `qa → dev`: Actualiza `qa_report`
- `qa → pr`: Actualiza `qa_report`

## 📊 States and Transitions

TaskRecords follow a state flow with strict validations and quality gates:

```
po → arch → dev → review → po_check → qa → pr → done
     ↓
   dev (fast-track)
```

### Available States
- **`po`**: Product Owner - Initial requirements
- **`arch`**: Architecture - Design and contracts
- **`dev`**: Development - TDD implementation
- **`review`**: Code Review - Peer review
- **`po_check`**: PO Check - Acceptance criteria validation
- **`qa`**: Quality Assurance - Automated testing
- **`pr`**: Pull Request - Integration pending
- **`done`**: Completed - Task finalized

### Transitions and Guards

| From | To | Condition | Required Evidence |
|------|----|-----------|-------------------|
| `po` | `arch` | `acceptance_criteria.length > 0` | - |
| `po` | `dev` | `scope === 'minor'` (fast-track) | - |
| `arch` | `dev` | `adr_id && contracts.length > 0` | - |
| `dev` | `review` | Quality Gate: TDD logs + Coverage + No lint errors | `red_green_refactor_log`, `metrics` |
| `review` | `dev` | Always (up to 2 rounds) | - |
| `review` | `po_check` | `!hasHighViolations(evidence)` | `violations` |
| `po_check` | `qa` | `acceptance_criteria_met === true` | `acceptance_criteria_met` |
| `qa` | `dev` | `qa_report` present | `qa_report` |
| `qa` | `pr` | `record.qa_report.failed === 0` | - |
| `pr` | `done` | `merged === true` | `merged` |

### Quality Gates

#### Dev → Review
- **TDD Logs**: `red_green_refactor_log.length ≥ 2`
- **Coverage**: ≥80% (major) / ≥70% (minor)
- **Lint**: `errors === 0`

#### Review Rounds
- Maximum 2 iterations `review → dev`
- After limit: task requires replanning

#### QA Gates
- **QA Pass**: `qa_report.failed === 0`
- **QA Fail**: Requires `qa_report` to return to `dev`

### Terminal States
- **`done`**: Final state, no outgoing transitions allowed

## 🧪 Testing

### Run Tests
```bash
# Tests for task-mcp service
pnpm --filter @agents/task-mcp test

# Tests with watch mode
pnpm --filter @agents/task-mcp test -- --watch
```

### Test Coverage
- ✅ JSON schema validations
- ✅ Repository CRUD operations
- ✅ Optimistic concurrency control
- ✅ State transitions with business rules
- ✅ Creation validations

## 📚 Data Schema

### TaskRecord v1.0.0
Main fields:
- `id`: ULID with `TR-` prefix
- `title`: Title (5-120 characters)
- `status`: Current flow state
- `scope`: `minor` | `major`
- `acceptance_criteria`: List of acceptance criteria
- `metrics`: Coverage, complexity, lint
- `red_green_refactor_log`: TDD log
- `links`: JIRA, Git, ADR references

See [`docs/task_record_v_1_0.md`](docs/task_record_v_1_0.md) for complete documentation.

## 🔧 Development

### Available Commands
```bash
# Install dependencies
pnpm install

# Run service
pnpm --filter @agents/task-mcp dev

# Run tests
pnpm --filter @agents/task-mcp test

# Type checking
cd services/task-mcp && npx tsc --noEmit

# Lint (if configured)
pnpm lint
```

### Conventional Commits
This project uses Conventional Commits:
- `feat:` for new features
- `fix:` for corrections
- `docs:` for documentation
- `test:` for tests

## 🤝 Contributing

1. Fork the project
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For support or questions:
- Open an issue on GitHub
- Check the documentation in [`docs/`](docs/)
- Review the tests for usage examples