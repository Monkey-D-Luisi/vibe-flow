# OpenClaw Extensions

Extensions, skills, and quality tooling for [OpenClaw](https://openclaw.ai) -- a self-hosted personal AI assistant gateway.

## Overview

This monorepo contains reusable components for OpenClaw:

- **`extensions/quality-gate/`** -- Quality gate engine: parsers (ESLint, Istanbul, Vitest, Ruff), cyclomatic complexity analysis, gate policy evaluation, and CLI tool.
- **`extensions/product-team/`** -- Product-team workflow plugin (foundation).
- **`skills/`** -- OpenClaw skill definitions for ADR management, architecture patterns, and more.
- **`packages/schemas/`** -- Shared JSON Schemas for quality tool I/O.

## Prerequisites

- [OpenClaw](https://openclaw.ai) installed
- Node.js 22+
- pnpm

## Quick Start

```bash
git clone https://github.com/Monkey-D-Luisi/vibe-flow.git
cd vibe-flow
pnpm install
pnpm test
```

## Development

```bash
pnpm test          # Run all tests
pnpm lint          # Lint all packages
pnpm typecheck     # Type-check all packages
pnpm build         # Build all packages
```

## Project Structure

```
vibe-flow/
  .agent.md                    # Agent governance (single source of truth)
  .agent/rules/                # Workflow and standards definitions
  .agent/templates/            # Task, walkthrough, ADR, PR review templates
  CLAUDE.md                    # Claude Code instructions
  AGENTS.md                    # Generic agent instructions
  .claude/commands/            # Claude command shortcuts mapped to .agent rules
  .codex/commands/             # Codex command shortcuts mapped to .agent rules
  openclaw.json                # OpenClaw configuration
  extensions/
    quality-gate/              # Quality gate engine
      src/
        complexity/            # Cyclomatic complexity analysis
        exec/                  # Process execution
        fs/                    # File system utilities
        gate/                  # Gate policy and evaluation
        parsers/               # Output parsers (ESLint, Istanbul, Vitest, Ruff)
        tools/                 # Tool implementations
        utils/                 # Schema loading
      cli/                     # CLI entry point (qcli)
      test/                    # Vitest tests
    product-team/              # Product-team workflow plugin
  skills/
    adr/                       # ADR management skill
    patterns/                  # Architecture patterns skill
  packages/
    schemas/                   # Shared JSON Schemas
  docs/
    roadmap.md                 # Development roadmap
    backlog/                   # Epic specifications
    tasks/                     # Task specifications
    walkthroughs/              # Implementation journals
    adr/                       # Architecture Decision Records
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, coding standards, and PR process.

## License

MIT -- see [LICENSE](LICENSE) for details.
