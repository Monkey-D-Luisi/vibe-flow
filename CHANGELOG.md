# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-03-06

Initial open-source release.

### Added

- 8-agent autonomous product team with 10-stage evidence-gated pipeline
- Task lifecycle engine with SQLite persistence, state machine, and transition guards
- Quality gate engine with auto-tuning and threshold alerting
- VCS automation: idempotent branch creation, PR management, label sync
- Team messaging system with inter-agent communication and auto-spawn
- Decision engine with auto/escalate/pause/retry policies and circuit breakers
- Pipeline orchestration with stage advancement, timeouts, retry limits, and metrics
- Multi-project workspace manager
- 14 role-focused skills for OpenClaw agents
- Quality-gate standalone CLI for local and CI use (`pnpm q:gate`, `pnpm q:*`)
- Docker deployment with multi-model provider support (Anthropic, OpenAI Codex, GitHub Copilot)
- Telegram integration with per-persona bot routing
- Model router hook with per-agent fallback chains
- Stitch MCP bridge for designer agent
- GitHub Actions CI with quality gate PR comments and vulnerability audit policy
- GitHub Pages landing page

[0.1.0]: https://github.com/Monkey-D-Luisi/vibe-flow/releases/tag/v0.1.0
