## [0.1.1](https://github.com/Monkey-D-Luisi/vibe-flow/compare/v0.1.0...v0.1.1) (2026-03-07)


### Bug Fixes

* add auth param to registerHttpRoute for openclaw 2026.3.2 ([a5a0391](https://github.com/Monkey-D-Luisi/vibe-flow/commit/a5a03914de04435a599307482231687122f1d960))
* **docker:** resolve Control UI 404 after openclaw SDK 2026.3.2 ([9c2dd82](https://github.com/Monkey-D-Luisi/vibe-flow/commit/9c2dd822f695e57afaa84bf75f07940ec7db7099))
* **quality-gate:** remove accidentally committed .js build artifacts ([fc669e1](https://github.com/Monkey-D-Luisi/vibe-flow/commit/fc669e106aa5824e0651c22e0c529cbe845956e1))
* resolve CI vuln policy, badges, landing screenshots, and og-image ([829416c](https://github.com/Monkey-D-Luisi/vibe-flow/commit/829416c088970a246faa0e2dc5756426da047dab))
* **site:** replace broken dashboard PNG with SVG mockup ([02153c6](https://github.com/Monkey-D-Luisi/vibe-flow/commit/02153c625a02bf9b4253a4f9ad5624fda9ee4813))



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
