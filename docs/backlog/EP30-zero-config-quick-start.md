# EP30 -- Zero-Config Quick Start

> Epic Owner: DevOps + Tech Lead
> Status: IN_PROGRESS
> Phase: V1-1 (first priority)
> Dependencies: None (builds on existing Docker and gateway infrastructure)

## Problem Statement

vibe-flow currently requires Docker, OpenClaw gateway configuration, 8 agent
definitions, model API keys, and a project workspace before a user can evaluate it.
The onboarding process takes 30+ minutes and requires reading multiple docs.

MetaGPT gets 66K stars partly because `pip install metagpt && metagpt "create a game"`
works in under 2 minutes. The barrier to entry for vibe-flow is orders of magnitude
higher.

If users can't try the product in 5 minutes, nothing else in V1 matters.

## Goal

A new user can go from zero to a working vibe-flow output in under 5 minutes with
a single command. No Docker required for the minimal mode. Free-tier models only.
Progressive upgrade path to the full 8-agent team.

## Key Design Decisions

1. **Bootstrap tool**: `npx create-vibe-flow` (npm/pnpm ecosystem, no global install)
2. **Minimal mode**: 2 agents (dev + qa) — enough to demonstrate the pipeline value
3. **Model provider for free tier**: copilot-proxy (existing fallback chain)
4. **No Docker for minimal**: Direct Node.js execution, embedded SQLite
5. **Upgrade path**: `vibe-flow upgrade --team full` to expand from 2 → 8 agents

## Tasks

### V1-1A: Core Bootstrap

#### Task 0191: create-vibe-flow CLI Bootstrap
**Scope**: Major
**Assignee**: DevOps

Build the `create-vibe-flow` npm package that bootstraps a complete vibe-flow
workspace with a single command. Should detect available model providers, set up
the project structure, and run the first pipeline automatically.

Acceptance criteria:
- `npx create-vibe-flow my-project` creates a working workspace
- Auto-detects available API keys (OpenAI, Anthropic, Google AI, copilot-proxy)
- Creates gateway config, agent definitions, project workspace
- Runs initial smoke test to verify everything works
- Total time from command to first output < 3 minutes
- Works on macOS, Linux, and Windows (WSL)
- Zero runtime dependencies beyond Node.js >= 18

#### Task 0192: 2-Agent Minimal Mode (Dev + QA)
**Scope**: Major
**Assignee**: Tech Lead

Create a minimal team configuration with just 2 agents: a developer and a QA tester.
This configuration uses a simplified 5-stage pipeline (IDEA → DECOMPOSITION →
IMPLEMENTATION → QA → DONE) that skips design, refinement, and shipping stages.

Acceptance criteria:
- 2-agent config (dev + qa) with simplified pipeline
- 5-stage pipeline that still enforces quality gates
- Dev agent handles both backend and frontend tasks
- QA agent handles testing and basic review
- Decision engine works with 2 agents (auto-resolve most decisions)
- Pipeline completes end-to-end with 2 agents
- Upgrade command to expand to full 8-agent team

### V1-1B: Accessibility

#### Task 0193: Free-Tier-Only Mode with Copilot-Proxy
**Scope**: Minor
**Assignee**: Backend Dev

Ensure vibe-flow can run entirely on free-tier models via copilot-proxy. No paid
API keys required. Model routing should automatically select the best available
free-tier model for each task.

Acceptance criteria:
- Pipeline completes with only copilot-proxy (no OpenAI/Anthropic/Google keys)
- Model routing respects free-tier constraints
- Clear messaging when paid models would improve results
- Documentation: which models are used in free-tier mode
- Quality gates still enforced (may need adjusted thresholds for weaker models)

#### Task 0194: Interactive Setup Wizard
**Scope**: Minor
**Assignee**: Frontend Dev

Add an interactive CLI wizard to the bootstrap process. Asks the user about team
size, model provider preferences, and project type. Generates optimized config
based on answers.

Acceptance criteria:
- Interactive prompts for: team size (minimal/standard/full), model preference,
  project type (web app, API, CLI, library)
- Generated config is optimized for the chosen options
- Can be skipped with `--defaults` flag for CI usage
- Preview of the generated config before writing
- Works in non-interactive mode (all options as CLI flags)

### V1-1C: Playground

#### Task 0195: Playground Mode (No Git, No Docker)
**Scope**: Major
**Assignee**: DevOps + Backend Dev

Create a playground mode that works without Git and without Docker. Agents write
to local files, pipeline state is in-memory, and there's no VCS integration.
Perfect for casual evaluation and experimentation.

Acceptance criteria:
- `npx create-vibe-flow --playground` starts in playground mode
- No Git repository required or created
- No Docker required
- Pipeline state in-memory (lost on restart, that's OK)
- Agent outputs written to local `./output/` directory
- Clear messaging about limitations vs full mode
- One-command upgrade from playground → full mode

## Definition of Done

- [ ] `npx create-vibe-flow my-project` works end-to-end in < 3 minutes
- [ ] 2-agent minimal mode completes pipeline with quality gates
- [ ] Free-tier-only mode works without any paid API keys
- [ ] Interactive setup wizard with sensible defaults
- [ ] Playground mode (no Git, no Docker) for casual evaluation
- [ ] Tested on macOS, Linux, and Windows (WSL)
- [ ] README updated with new quick-start instructions
- [ ] Upgrade path from minimal/playground → full mode documented

## References

- [Roadmap V1](../roadmap_v1.md)
- [Roadmap MVP](../roadmap_mvp.md)
- [EP07 -- DX & Platform Ops](EP07-dx-platform-ops.md) (scaffolding CLI foundation)
- [EP08 -- Autonomous Product Team](EP08-autonomous-product-team.md) (Docker deployment)
- [Getting Started Guide](../getting-started.md)
