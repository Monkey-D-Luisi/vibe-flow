# Getting Started with Agents & MCPs

This guide will help you get up and running with the Agents & MCPs project quickly.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Understanding the System](#understanding-the-system)
4. [Running Your First Task](#running-your-first-task)
5. [Development Workflow](#development-workflow)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 20+**: [Download here](https://nodejs.org/)
- **pnpm**: Package manager (install with `npm install -g pnpm`)
- **Git**: Version control system
- **SQLite**: Database (included with the project)
- **A code editor**: VS Code recommended

### Recommended VS Code Extensions

- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- SQLite Viewer

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Monkey-D-Luisi/agents-mcps.git
cd agents-mcps
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Approve Build Scripts (First Time Only)

```bash
pnpm approve-builds
```

When prompted, select both `core-js` and `esbuild` by pressing space, then press enter.

### 4. Verify Installation

Run the test suite to ensure everything is working:

```bash
pnpm test:quick
```

If all tests pass, you're ready to go! ✅

## Understanding the System

### What is Agents & MCPs?

This project implements an **agent-orchestrated task management system** that automates the complete software development lifecycle from requirements to deployment.

### Key Components

#### 1. TaskRecord v1.0.0
The core data structure representing a task. Each TaskRecord:
- Has a unique ULID identifier (e.g., `TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C`)
- Follows a strict state machine: `po → arch → dev → review → po_check → qa → pr → done`
- Tracks quality metrics (coverage, complexity, linting)
- Maintains TDD evidence through `red_green_refactor_log`

#### 2. Agents
Six specialized agents handle different phases:
- **PO Agent**: Defines requirements and acceptance criteria
- **Architect Agent**: Designs system architecture
- **Dev Agent**: Implements features using TDD
- **Reviewer Agent**: Performs code reviews
- **QA Agent**: Executes test plans
- **PR-Bot Agent**: Manages Git workflow and PRs

#### 3. MCP (Model Context Protocol)
A JSON-RPC interface that exposes tools for:
- Task management (`task.create`, `task.get`, `task.update`, etc.)
- State management (`state.get`, `state.patch`, etc.)
- GitHub integration (`gh.createBranch`, `gh.openPR`, etc.)
- Quality checks (`quality.run_tests`, `quality.coverage_report`, etc.)

#### 4. Quality Gates
Automated validation ensures:
- **Coverage**: ≥80% (major) / ≥70% (minor)
- **Linting**: Zero errors
- **TDD**: Red-Green-Refactor logs required
- **Tests**: All tests passing

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Orchestrator                          │
│  (Routes tasks between agents, enforces contracts)      │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐       ┌────▼────┐      ┌────▼────┐
   │ PO Agent│       │Arch Agent│      │Dev Agent│
   └─────────┘       └──────────┘      └─────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐       ┌────▼────┐      ┌────▼────┐
   │Reviewer │       │QA Agent │      │ PR-Bot  │
   └─────────┘       └─────────┘      └─────────┘
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
   ┌────▼────────┐                  ┌───────▼──────┐
   │  Task MCP   │                  │ Quality MCP  │
   │  (SQLite)   │                  │   (Tools)    │
   └─────────────┘                  └──────────────┘
```

## Running Your First Task

### Starting the Task MCP Server

```bash
# From the repository root
pnpm --filter @agents/task-mcp dev
```

You should see:
```
Task MCP server started
```

The server is now listening for MCP tool calls.

### Creating a Task

In another terminal, you can interact with the MCP server programmatically or use the test utilities:

```bash
# Run the E2E smoke test to see the complete workflow
pnpm exec tsx tooling/smoke/e2e-minor-fasttrack.ts
```

This will:
1. Create a new TaskRecord
2. Execute the complete workflow through all states
3. Generate quality artifacts
4. Validate all transitions
5. Create a comprehensive report in `.qreport/e2e-smoke-report.md`

### Viewing the Database

The SQLite database is created at `services/task-mcp/data/tasks.db` when you first run the server.

You can view it using any SQLite browser or the SQLite CLI:

```bash
sqlite3 services/task-mcp/data/tasks.db
```

Useful queries:
```sql
-- View all tasks
SELECT id, title, status, scope FROM task_records;

-- View orchestrator state
SELECT task_id, current, previous, last_agent FROM orchestrator_state;

-- View event log
SELECT id, task_id, type, created_at FROM event_log ORDER BY created_at DESC LIMIT 10;
```

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/ep01-t02-your-feature
```

### 2. Write Tests First (TDD)

```bash
# Navigate to the package you're working on
cd services/task-mcp

# Run tests in watch mode
pnpm test -- --watch
```

### 3. Implement Your Changes

Follow the hexagonal architecture pattern:
- Domain logic goes in `src/domain/`
- Persistence in `src/repo/`
- MCP tools in `src/mcp/`
- Agents in `src/agents/`

### 4. Run Quality Checks

```bash
# Run tests with coverage
pnpm test -- --coverage

# Run linting
pnpm run lint

# Fix linting issues
pnpm run lint:fix

# Generate quality reports
pnpm q:tests
pnpm q:coverage
pnpm q:lint
pnpm q:complexity

# Run the quality gate
pnpm q:gate --source artifacts --scope minor
```

### 5. Commit Your Changes

Use conventional commits:

```bash
git add .
git commit -m "feat(task-mcp): add new feature"
```

Husky pre-commit hooks will:
- Run tests automatically
- Validate commit message format

### 6. Create a Pull Request

```bash
git push origin feature/ep01-t02-your-feature
```

Then open a PR on GitHub. The PR will:
- Start as a draft
- Run CI checks automatically
- Require quality gates to pass before merging

## Troubleshooting

### Common Issues

#### 1. `pnpm: command not found`

**Solution**: Install pnpm globally
```bash
npm install -g pnpm
```

#### 2. Build script approval warnings

**Solution**: Approve the build scripts
```bash
pnpm approve-builds
```
Select `core-js` and `esbuild`, then press enter.

#### 3. SQLite database locked

**Cause**: Multiple processes accessing the database simultaneously.

**Solution**: 
- Stop all running MCP servers
- Delete `services/task-mcp/data/tasks.db-wal` and `tasks.db-shm`
- Restart the server

#### 4. Tests failing on Git hooks

**Solution**: Bypass hooks temporarily (for CI/automation only):
```bash
SKIP_TESTS=1 git commit -m "your message"
```

⚠️ **Warning**: Only use this in CI environments. Local development should always run tests.

#### 5. Quality gate failures

Check the detailed report in `.qreport/gate.json`:
```bash
cat .qreport/gate.json | jq
```

Common violations:
- `COVERAGE_BELOW`: Add more tests
- `LINT_ERRORS`: Run `pnpm run lint:fix`
- `TESTS_FAILED`: Fix failing tests
- `COMPLEXITY_HIGH`: Refactor complex functions

#### 6. Port already in use (Quality MCP Server)

**Solution**: Change the port
```bash
PORT=8081 pnpm --filter @agents/quality-mcp-server dev
```

#### 7. TypeScript compilation errors

**Solution**: Ensure TypeScript dependencies are installed
```bash
cd services/task-mcp
pnpm install
npx tsc --noEmit
```

### Getting Help

If you're stuck:

1. **Check the documentation**: 
   - [README.md](../README.md) - Main overview
   - [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
   - [docs/](.) - Technical specifications

2. **Review examples**:
   - Tests in `services/task-mcp/test/`
   - E2E smoke test: `tooling/smoke/e2e-minor-fasttrack.ts`

3. **Check existing issues**:
   - [GitHub Issues](https://github.com/Monkey-D-Luisi/agents-mcps/issues)

4. **Open a new issue**:
   - Describe the problem
   - Include error messages
   - Provide steps to reproduce

## Next Steps

Now that you're set up:

1. **Explore the codebase**:
   - Read the domain models in `services/task-mcp/src/domain/`
   - Review agent implementations in `services/task-mcp/src/agents/`
   - Understand the state machine in `services/task-mcp/src/orchestrator/`

2. **Read the specifications**:
   - [TaskRecord v1.0.0](task_record_v_1_0.md)
   - [Agent Contracts](ep_01_t_03_prompts_por_agente_y_contratos_de_salida_especificacion.md)
   - [State Management](ep_01_t_04_estado_compartido_y_persistencia_sqlite_mcp.md)
   - [Fast-Track System](ep_01_t_05_fast_track_para_scope_minor_especificacion_tecnica.md)

3. **Try modifying the system**:
   - Add a new quality metric
   - Implement a custom agent
   - Create a new MCP tool

4. **Contribute**:
   - Pick an issue from the backlog
   - Follow the [contribution guidelines](../CONTRIBUTING.md)
   - Submit your first PR!

Happy coding! 🚀
