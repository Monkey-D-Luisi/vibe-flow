# Contributing to OpenClaw Extensions

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm

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
- `feat/<description>` -- Feature branches
- `fix/<description>` -- Bug fix branches

### Task-Driven Development

1. Read the task specification in `docs/tasks/NNNN-*.md`
2. Create a feature branch from `main`
3. Implement with tests
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
- Use `.js` extension in import paths
- Vitest for all tests

### Architecture

Extensions follow the OpenClaw plugin pattern:
- `package.json` with `@openclaw/<name>` naming
- `openclaw.plugin.json` with plugin metadata
- `index.ts` default-exporting `{ id, name, description, register(api) }`

### Naming

- Files: `kebab-case.ts`
- Classes/Interfaces: `PascalCase`
- Functions/Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`

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

- `quality-gate` -- Quality gate extension
- `schemas` -- JSON Schemas
- `skills` -- Skill definitions
- `docs` -- Documentation
- `ci` -- CI/CD workflows

### Examples

```
feat(quality-gate): add ruff parser support
fix(quality-gate): correct coverage ratio clamping
docs: update README with CLI usage
test(quality-gate): add integration tests for gate policy
```

## Pull Request Process

1. Create a feature branch from `main`
2. Implement changes with tests
3. Ensure CI passes (`pnpm test && pnpm lint && pnpm typecheck`)
4. Open a PR with the template filled out
5. Address review feedback
6. Merge when approved

## Project Structure

```
extensions/quality-gate/       # Quality gate extension
  src/
    complexity/                # Cyclomatic complexity analysis
    exec/                      # Process execution
    fs/                        # File system utilities
    gate/                      # Gate policy and evaluation
    parsers/                   # Output parsers
    tools/                     # Tool implementations
    utils/                     # Schema loading
  cli/                         # CLI entry point
  test/                        # Vitest tests

skills/                        # OpenClaw skills
  adr/                         # ADR management
  patterns/                    # Architecture patterns

packages/
  schemas/                     # Shared JSON Schemas

docs/
  tasks/                       # Task specifications
  walkthroughs/                # Implementation journals
  backlog/                     # Epic/backlog specs
  adr/                         # Architecture decisions
  patterns/                    # Pattern catalog
```
