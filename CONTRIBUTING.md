# Contributing to Agents & MCPs

Thank you for your interest in contributing to this project! This guide will help you get started.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Architecture Decision Records](#architecture-decision-records)
- [Testing Guidelines](#testing-guidelines)
- [Commit Message Convention](#commit-message-convention)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please be respectful and professional in all interactions.

## Getting Started

### Prerequisites
- Node.js 20 or higher
- pnpm (install with `npm install -g pnpm`)
- SQLite (included with the project)
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Monkey-D-Luisi/agents-mcps.git
cd agents-mcps
```

2. Install dependencies:
```bash
pnpm install
```

3. Approve build scripts (first time only):
```bash
pnpm approve-builds
```

4. Run tests to verify setup:
```bash
pnpm test:quick
```

## Development Workflow

### Branch Strategy

- `main`: Production branch, protected with CI requirements
- `feature/<epic>-<task>-<description>`: Feature branches (e.g., `feature/ep01-t02-state-machine`)
- `bugfix/issue-<number>`: Bug fix branches
- `hotfix/<description>`: Emergency fixes

### Creating a Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/ep01-t02-your-feature
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode in `tsconfig.json`
- Avoid `any` types - use proper typing
- Use interfaces for data structures
- Document complex functions with JSDoc comments

### Code Style

- Use ESLint for linting: `pnpm --filter <package> run lint`
- Fix linting issues: `pnpm --filter <package> run lint:fix`
- Maximum line length: 120 characters
- Use 2 spaces for indentation
- Use single quotes for strings
- Add trailing commas in multi-line objects/arrays

### Architecture Principles

This project follows **Hexagonal Architecture**:

- **Domain**: Pure business logic (no dependencies on external systems)
- **Persistence**: Repository pattern for data access
- **Exposure**: MCP tools and JSON-RPC interfaces
- **Agents**: Contract-driven with strict input/output schemas

Keep domain logic free from infrastructure concerns.

## Architecture Decision Records

Document significant architectural decisions to preserve an auditable history and shared context.

- Read the quick guide in `docs/adr/README.md` before drafting a record.
- Create a new ADR with `pnpm adr:new`; the command proposes the next ID (`ADR-XXXX`), generates the slug, and pre-fills `id`, `title`, and `date`.
- Populate the required sections (`Context`, `Decision`, `Considered Alternatives`, `Consequences`) and update metadata (`owners`, `area`, `links`, cross references).
- Run `pnpm adr:lint` before opening a PR (or `pnpm adr:lint:changed` to validate only modified files).
- Ensure the `adr-lint` CI check passes before merging.
- Reference ADR IDs (for example `ADR-0007`) in your PR description so the PR Bot links them automatically.
- Local commits run `pnpm adr:lint:changed` through Husky; set `SKIP_ADR=1` if you need to bypass it under automation control.

## Testing Guidelines

### Test Coverage Requirements

- **Major scope changes**: ≥80% coverage
- **Minor scope changes**: ≥70% coverage
- All public APIs must have tests
- Critical business logic requires unit tests

### Running Tests

```bash
# Run all tests
pnpm test:ci

# Run tests for a specific package
pnpm --filter @agents/task-mcp test

# Run tests in watch mode
pnpm --filter @agents/task-mcp test -- --watch

# Run tests with coverage
pnpm --filter @agents/task-mcp test -- --coverage
```

### Test-Driven Development (TDD)

We strongly encourage TDD:

1. **Red**: Write a failing test
2. **Green**: Write minimal code to make it pass
3. **Refactor**: Improve code while keeping tests green

Log your TDD progress in `red_green_refactor_log` for task transitions.

### Test Structure

- Unit tests: `test/**/*.spec.ts`
- Integration tests: `test/integration/**/*.spec.ts`
- Contract tests: Validate agent input/output schemas
- E2E tests: `tooling/smoke/`

## Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

### Format
```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test additions or modifications
- `build`: Build system changes
- `ci`: CI configuration changes
- `chore`: Other changes (dependencies, configs)

### Scopes
- `task-mcp`: Task MCP service
- `quality-mcp`: Quality MCP service
- `schemas`: JSON schemas
- `docs`: Documentation
- `ci`: CI/CD workflows

### Examples
```bash
feat(task-mcp): add fast-track evaluation
fix(quality-mcp): correct coverage calculation
docs: update README with installation steps
test(task-mcp): add unit tests for state transitions
```

### Breaking Changes
If a change is breaking, add `BREAKING CHANGE:` in the footer:
```
feat(task-mcp): redesign state machine

BREAKING CHANGE: State names have changed from snake_case to camelCase
```

## Pull Request Process

### 1. Create a Pull Request

1. Push your branch to GitHub
2. Open a Pull Request against `main`
3. Use the PR template (automatically populated)
4. Set the PR to **Draft** initially

### 2. PR Checklist

Ensure your PR includes:

- [ ] Clear description of changes
- [ ] Link to related issue(s) using `Closes #<issue-number>`
- [ ] All acceptance criteria met
- [ ] Tests added/updated with ≥70% coverage (minor) or ≥80% (major)
- [ ] Linting passes with zero errors
- [ ] Red-Green-Refactor log (for code changes)
- [ ] Documentation updated (if applicable)
- [ ] No breaking changes (or clearly documented)

### 3. CI Checks

All PRs must pass:

- **test-lint**: All tests pass and linting succeeds
- **quality-gate**: Coverage, complexity, and quality thresholds met

### 4. Review Process

1. Wait for CI checks to pass
2. Request review from team members
3. Address review comments
4. Maximum 2 review rounds (after that, task needs replanning)

### 5. Merge

Once approved and all checks pass:

1. Mark PR as **Ready for Review** (if still in draft)
2. Ensure all conversations are resolved
3. Squash and merge (maintainers will handle this)

## Quality Gates

Before merging, your PR must pass:

### Coverage
- Major scope: ≥80%
- Minor scope: ≥70%

### Linting
- Zero errors required
- Warnings should be minimized

### Complexity
- Average cyclomatic complexity ≤5.0
- Maximum file cyclomatic ≤50 (will be reduced over time)

### Tests
- All tests passing
- No skipped tests without justification

## Project Structure

```
agents-mcps/
├── packages/
│   └── schemas/              # JSON Schemas
├── services/
│   └── task-mcp/             # Main MCP service
│       ├── src/
│       │   ├── domain/       # Business logic
│       │   ├── repo/         # Persistence
│       │   ├── mcp/          # MCP tools
│       │   ├── agents/       # Agent implementations
│       │   └── orchestrator/ # Orchestration
│       └── test/             # Tests
├── tooling/
│   └── quality-mcp/          # Quality tooling
└── docs/                     # Documentation
```

## Need Help?

- Check existing [documentation](docs/)
- Review [E2E smoke test report](docs/e2e-smoke-test-report.md)
- Look at existing tests for examples
- Open an issue for questions or discussions

## Recognition

Contributors will be recognized in:
- Git commit history
- Release notes
- Project documentation

Thank you for contributing! 🎉
