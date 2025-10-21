# Task MCP Service

The **Task MCP Service** is the core service of the Agents & MCPs system. It provides a Model Context Protocol (MCP) server that exposes tools for task management, state orchestration, GitHub integration, and fast-track evaluation.

## Features

- **Task Management**: Create, read, update, search, and transition TaskRecords
- **State Orchestration**: Manage workflow state with optimistic locking and event journaling
- **Agent System**: 6 specialized agents (PO, Architect, Dev, Reviewer, QA, PR-Bot)
- **GitHub Integration**: Automated branch creation, PR management, and project synchronization
- **Fast-Track System**: Intelligent workflow optimization for minor scope tasks
- **Quality Gates**: Automated validation of coverage, complexity, and linting
- **SQLite Persistence**: Robust storage with WAL mode for concurrent access

## Architecture

This service follows **Hexagonal Architecture** (Ports & Adapters):

```
src/
├── domain/          # Business logic (pure, no external dependencies)
│   ├── TaskRecord.ts
│   ├── validators/
│   └── transitions/
├── repo/            # Persistence adapters (SQLite repositories)
│   ├── TaskRepository.ts
│   ├── StateRepository.ts
│   ├── LeaseRepository.ts
│   └── EventRepository.ts
├── mcp/             # MCP server and tool handlers
│   ├── server.ts
│   ├── taskHandlers.ts
│   ├── stateHandlers.ts
│   └── githubHandlers.ts
├── agents/          # Agent implementations
│   ├── po.ts
│   ├── architect.ts
│   ├── dev.ts
│   ├── reviewer.ts
│   ├── qa.ts
│   └── prbot.ts
├── orchestrator/    # Workflow orchestration
│   ├── runner.ts
│   ├── router.ts
│   └── mappers/
├── github/          # GitHub API integration
│   ├── service.ts
│   └── types.ts
└── fasttrack/       # Fast-track evaluation
    ├── evaluator.ts
    └── guard.ts
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- SQLite (included)

### Installation

From the monorepo root:
```bash
pnpm install
```

### Running the Server

```bash
# From monorepo root
pnpm --filter @agents/task-mcp dev

# Or from this directory
pnpm dev
```

The server will start and output:
```
Task MCP server started
```

### Database Location

The SQLite database is created at:
```
data/tasks.db
```

With WAL files:
```
data/tasks.db-wal
data/tasks.db-shm
```

## Available MCP Tools

### Task Management

- **`task.create`**: Create a new TaskRecord
- **`task.get`**: Retrieve a TaskRecord by ID
- **`task.update`**: Update a TaskRecord with optimistic locking
- **`task.search`**: Search TaskRecords with filters
- **`task.transition`**: Transition a TaskRecord to a new state

### State Management

- **`state.get`**: Get orchestrator state for a task
- **`state.patch`**: Update orchestrator state
- **`state.acquire_lock`**: Acquire exclusive lease for task execution
- **`state.release_lock`**: Release an exclusive lease
- **`state.events`**: Get event history for a task

### Fast-Track

- **`fasttrack.evaluate`**: Evaluate task for fast-track eligibility
- **`fasttrack.guard_post_dev`**: Re-evaluate after development

### GitHub Integration

- **`gh.createBranch`**: Create a feature branch
- **`gh.openPR`**: Open a draft pull request
- **`gh.comment`**: Add comments to PRs
- **`gh.addLabels`**: Apply labels to issues/PRs
- **`gh.setProjectStatus`**: Update GitHub Projects v2 status
- **`gh.readyForReview`**: Mark PR as ready for review

## Configuration

### GitHub Integration

Set environment variables for GitHub authentication:

**Option 1: GitHub App (Recommended)**
```bash
export GH_APP_ID="123456"
export GH_APP_INSTALLATION_ID="987654"
export GH_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

**Option 2: Personal Access Token**
```bash
export PR_TOKEN="ghp_your_token_here"
```

### PR-Bot Configuration

Edit `config/github.pr-bot.json`:
```json
{
  "defaultBase": "main",
  "labels": {
    "fasttrack_eligible": "fast-track",
    "fasttrack_incompatible": "fast-track:incompatible",
    ...
  },
  "project": {
    "statusFieldName": "Status",
    "statusValues": {
      "todo": "To Do",
      "inProgress": "In Progress",
      "inReview": "In Review",
      "done": "Done"
    }
  }
}
```

## Testing

### Run Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test -- --watch

# With coverage
pnpm test -- --coverage
```

### Test Structure

```
test/
├── domain/          # Domain logic tests
├── repo/            # Repository tests
├── agents/          # Agent contract tests
├── orchestrator/    # Orchestration tests
├── fasttrack/       # Fast-track tests
└── integration/     # Integration tests
```

### Coverage Requirements

- Major scope: ≥80%
- Minor scope: ≥70%

## Development

### Commands

```bash
# Start development server
pnpm dev

# Run tests
pnpm test

# Lint code
pnpm run lint

# Fix linting issues
pnpm run lint:fix

# Type checking
npx tsc --noEmit
```

### Database Schema

The service automatically creates and migrates the database schema:

- `task_records`: TaskRecord data
- `orchestrator_state`: Current workflow state per task
- `event_log`: Audit trail of all state transitions
- `leases`: Exclusive access control with TTL
- `github_requests`: Idempotency tracking for GitHub operations

## State Machine

TaskRecords follow this workflow:

```
po → arch → dev → review → po_check → qa → pr → done
     ↓
   dev (fast-track for minor scope)
```

### States

- **po**: Product Owner - Initial requirements
- **arch**: Architecture - Design and contracts
- **dev**: Development - TDD implementation
- **review**: Code Review - Peer review
- **po_check**: PO Check - Acceptance validation
- **qa**: Quality Assurance - Testing
- **pr**: Pull Request - Integration pending
- **done**: Completed - Task finalized

### Quality Gates

#### dev → review
- TDD logs: ≥2 entries in `red_green_refactor_log`
- Coverage: ≥80% (major) / ≥70% (minor)
- Lint errors: 0

#### review → po_check
- No high-severity violations

#### qa → pr
- All tests passing (`qa_report.failed === 0`)

## Troubleshooting

### Database Locked

```bash
# Stop all processes
pkill -f "node.*task-mcp"

# Remove WAL files
rm -f data/tasks.db-wal data/tasks.db-shm

# Restart
pnpm dev
```

### Revision Conflicts

This is expected with optimistic locking. Re-fetch and retry:
```typescript
const task = await taskRepo.get(id);
await taskRepo.update(id, task.rev, updates);
```

### GitHub Authentication Errors

Verify credentials:
```bash
echo $GH_APP_ID
echo $PR_TOKEN
```

Ensure token has required scopes:
- `repo`
- `read:org`
- `write:discussion`
- `project`

## Contributing

See the main [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

### Adding a New MCP Tool

1. Define the tool contract in `src/mcp/handlers/`
2. Implement the handler function
3. Register the tool in `src/mcp/server.ts`
4. Add tests in `test/mcp/`
5. Update documentation

### Adding a New Agent

1. Create agent file in `src/agents/`
2. Define input/output schemas in `packages/schemas/`
3. Implement agent logic
4. Add to orchestrator router
5. Write contract tests
6. Update documentation

## License

MIT - see [LICENSE](../../LICENSE)

## Support

- [Main Documentation](../../README.md)
- [Getting Started Guide](../../docs/GETTING_STARTED.md)
- [Troubleshooting](../../docs/TROUBLESHOOTING.md)
- [Open an Issue](https://github.com/Monkey-D-Luisi/agents-mcps/issues)
