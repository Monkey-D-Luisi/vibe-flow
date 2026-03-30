# Contributing to OpenClaw Extensions

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- `gh` CLI (GitHub CLI)
- Docker (optional, for full-stack deployment -- see `docs/docker-setup.md`)

### Installation

```bash
git clone https://github.com/Monkey-D-Luisi/vibe-flow.git
cd vibe-flow
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

- **Workflow quality coverage gate**: >= 80% (major scope) / >= 70% (minor scope)
- **Extension test coverage baseline (CI)**: statements >= 45%, lines >= 45%, functions >= 50%, branches >= 70% for `src/**/*.ts`
- **Lint**: Zero errors
- **Complexity**: Average cyclomatic <= 5.0
- **Tests**: All passing
- **Types**: No TypeScript errors

CI enforces the extension baseline with:

- `pnpm --filter @openclaw/quality-gate test:coverage`
- `pnpm --filter @openclaw/plugin-product-team test:coverage`

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

- `product-team` -- Product-team plugin
- `quality-gate` -- Quality gate extension
- `quality-contracts` -- Quality contracts package
- `skills` -- Skill definitions
- `docs` -- Documentation
- `ci` -- CI/CD workflows

### Examples

```
feat(product-team): add task transition guard diagnostics
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
extensions/product-team/       # Product-team plugin
  src/
    domain/                    # Task and workflow domain model
    orchestrator/              # State transitions, guards, lifecycle
    persistence/               # SQLite repositories and migrations
    quality/                   # Quality parsers, policies, complexity logic
    github/                    # gh CLI integration and idempotency
    tools/                     # Registered OpenClaw tools
  test/                        # Vitest suites

extensions/quality-gate/       # Standalone quality-gate CLI/engine
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
  architecture-design/         # Architecture design workflow
  backend-dev/                 # Backend development
  code-review/                 # Code review workflow
  devops/                      # DevOps and infrastructure
  frontend-dev/                # Frontend development
  github-automation/           # GitHub automation workflow
  patterns/                    # Architecture patterns
  product-owner/               # Product owner workflow
  qa-testing/                  # QA/testing workflow
  requirements-grooming/       # Requirements workflow
  tdd-implementation/          # TDD workflow
  tech-lead/                   # Tech lead workflow
  ui-designer/                 # UI design workflow

packages/
  quality-contracts/           # Shared parsers, gate policy, complexity analysis, validation contracts

docs/
  roadmap_mvp.md               # Development roadmap
  runbook.md                   # Operator runbook
  api-reference.md             # Tool API reference
  allowlist-rationale.md       # Agent-tool allow-list justifications
  extension-integration.md     # Extension boundaries and integration model
  error-recovery.md            # Failure and recovery patterns
  transition-guard-evidence.md # Guard evidence requirements
  tasks/                       # Task specifications
  walkthroughs/                # Implementation journals
  backlog/                     # Epic/backlog specs
  adr/                         # Architecture decisions
  audits/                      # Security/architecture audit reports
```
