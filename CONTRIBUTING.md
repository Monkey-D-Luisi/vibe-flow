# Contributing to OpenClaw Extensions -- Product Team

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm
- [OpenClaw](https://openclaw.ai) (for integration testing)

### Installation

```bash
git clone https://github.com/Monkey-D-Luisi/agents-mcps.git
cd agents-mcps
pnpm install
```

### Verify Setup

```bash
pnpm test
pnpm lint
pnpm typecheck
```

## Development Workflow

### Branch Strategy

- `main` -- Production branch, protected with CI
- `feature/<description>` -- Feature branches
- `bugfix/<description>` -- Bug fix branches
- `hotfix/<description>` -- Emergency fixes

### Task-Driven Development

1. Read the task specification in `docs/tasks/NNNN-*.md`
2. Create a feature branch from `main`
3. Implement using TDD (Red-Green-Refactor)
4. Update the walkthrough in `docs/walkthroughs/NNNN-*.md`
5. Pass quality gates
6. Commit and create a PR

### Quality Gates

Before merging, ensure:

- **Coverage**: >= 80% (major scope) / >= 70% (minor scope)
- **Lint**: Zero errors
- **Complexity**: Average cyclomatic <= 5.0
- **Tests**: All passing
- **Types**: No TypeScript errors

## Coding Standards

### TypeScript

- Strict mode enabled
- No `any` types -- use proper typing
- ESM modules (`"type": "module"`)
- TypeBox for schema definitions in tool registrations
- Vitest for all tests

### Architecture

The plugin follows **Hexagonal Architecture**:

- **Domain** (`src/domain/`): Pure business logic, zero dependencies
- **Persistence** (`src/persistence/`): SQLite repositories, WAL mode
- **Orchestrator** (`src/orchestrator/`): State machine and agent routing
- **Tools** (`src/tools/`): OpenClaw tool registrations (thin adapter layer)
- **GitHub** (`src/github/`): Octokit-based automation with idempotency

### Naming

- Files: `kebab-case.ts`
- Classes/Interfaces: `PascalCase`
- Functions/Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- JSON Schema files: `kebab-case.schema.json`

## Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

### Types

- `feat` -- New feature
- `fix` -- Bug fix
- `docs` -- Documentation
- `test` -- Tests
- `refactor` -- Code restructuring
- `ci` -- CI configuration
- `chore` -- Dependencies, configs

### Scopes

- `product-team` -- Plugin code
- `skills` -- Skill definitions
- `docs` -- Documentation
- `ci` -- CI/CD workflows

### Examples

```
feat(product-team): add task.create tool registration
fix(product-team): correct optimistic locking in state repository
docs: update roadmap with Phase 2 details
test(product-team): add integration tests for quality gate
```

## Pull Request Process

1. Create a feature branch from `main`
2. Implement changes with tests
3. Ensure CI passes (`pnpm test && pnpm lint && pnpm typecheck`)
4. Open a PR with the template filled out
5. Link to the task specification (`docs/tasks/NNNN-*.md`)
6. Address review feedback
7. Merge when approved

## Project Structure

```
extensions/product-team/       # OpenClaw plugin
  src/
    domain/                    # TaskRecord, FastTrack
    persistence/               # SQLite repositories
    orchestrator/              # State machine
    quality/                   # Quality gates
    github/                    # GitHub automation
    tools/                     # Tool registrations
    schemas/                   # JSON Schemas
  test/                        # Vitest tests

skills/                        # OpenClaw skills
  requirements-grooming/
  architecture-design/
  tdd-implementation/
  code-review/
  qa-testing/
  github-automation/

docs/
  roadmap.md                   # Phased execution plan
  backlog/                     # Epic specs
  tasks/                       # Task specs
  walkthroughs/                # Implementation journals
  adr/                         # Architecture decisions
```
