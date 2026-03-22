# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.1] - 2026-03-22

### Added

- **product-team:** nudge engine — `agent_nudge` tool to wake idle agents and unblock stalled pipeline tasks, with three scopes (`all`, `blocked`, `active`), configurable stale threshold, and event logging (ADR-005)
- **virtual-office:** task references and connection-state semantics in dashboard/activity feed (`ab627ef`)

### Changed

- **virtual-office:** improved dashboard and info-panel readability with stronger contrast, clearer labels, and better tooltip coverage (`a7b96cb`)
- **virtual-office:** responsive sidebar/canvas behavior aligned to CSS-driven sidebar width (`a7b96cb`)
- **docs:** README updated to reflect tool count (35→38), category count (7→10), and current version; added nudge engine to product-team description
- **docs:** CLAUDE.md/AGENTS.md updated with 3 missing tool entries (`agent_nudge`, `decision_patterns`, `metrics_refresh`)
- **docs:** extension-integration guide updated with virtual-office topology and corrected tool counts
- **docs:** api-reference updated with 3 missing tool entries
- **docs:** installation guide updated: deprecated `GEMINI_3_PRO` → `GEMINI_3_FLASH`
- **docs:** ADRs renumbered to sequential convention (ADR-001 through ADR-005 backfilled)
- **site:** fixed "plugins" → "extensions" label; added virtual-office to architecture topology diagram

### Fixed

- **virtual-office:** pipeline stage context and room layout alignment (`2a9fa96`)
- **virtual-office:** persistent pipeline-stage behavior after `agent_end` transition handling (`4e75225`, `c2df116`)

## [0.2.0] - 2026-03-20

### Added

- **model-router:** new extension (`@openclaw/model-router`) — per-agent model routing hook with configurable fallback chains (EP10)
- **model-router:** task complexity scoring engine — evaluates scope, pipeline stage, agent role, and history to produce a 0–100 score with low/medium/high tier classification
- **model-router:** provider health integration — tracks provider availability and factors health status into routing decisions
- **model-router:** dynamic model resolver hook — overrides agent model selection at runtime based on complexity tier and provider health
- **model-router:** cost-aware model tier downgrade — automatically steps down to cheaper models when budget pressure is detected
- **model-router:** Copilot proxy fallback chain — routes to GitHub Copilot endpoints when primary providers are unavailable
- **model-router:** hard budget limits engine — enforces per-task and per-agent token/cost ceilings
- **model-router:** per-agent budget tracking — accumulates spend per agent per task with warning thresholds
- **model-router:** budget forecasting and alerting — projects spend trends and triggers Telegram alerts before limits are reached (EP11)
- **model-router:** decision outcome pattern analyzer — `decision_patterns` tool mines event log for escalation/retry patterns to inform policy tuning (EP12)
- **model-router:** adaptive escalation policy engine — adjusts escalation aggressiveness based on historical outcome patterns
- **model-router:** agent model performance scorer — tracks quality-per-cost ratios per agent×model combination and publishes recommendations
- **model-router:** dynamic template pre-loading — warms prompt templates ahead of agent spawn to reduce first-token latency
- **model-router:** routing feedback loop integration — resolver queries scoring recommendations to override default routes when confidence is sufficient, closing the EP12 learning loop
- **virtual-office:** new extension (`@openclaw/virtual-office`) — pixel-art virtual office served at `/office`, visualizing the 8 agents in real time (EP20)
- **virtual-office:** canvas engine — 20×12 tile grid with 8 agent desk positions rendered via Canvas 2D
- **virtual-office:** pixel-art agent sprites with idle/working/blocked animation states
- **virtual-office:** WebSocket bridge and SSE event stream for real-time agent state updates
- **virtual-office:** agent state mapping — translates `task.*`, `pipeline.*`, and `agent_end` events to on-canvas agent states
- **virtual-office:** speech bubble system for inter-agent messages and status text
- **virtual-office:** interactivity — click an agent tile to open an info panel with task and pipeline details
- **virtual-office:** 320px right-sidebar dashboard with live agent status list, pipeline stage summary, and scrollable activity feed
- **product-team:** metrics aggregation engine — `metrics_refresh` tool and hourly/daily cron that pre-computes pipeline throughput, stage durations, and budget summaries into a `metrics_aggregated` SQLite table (EP14)
- **product-team:** metrics health endpoint (`GET /metrics/health`) — returns live system health indicators
- **product-team:** timeline endpoint (`GET /metrics/timeline`) — returns per-task ordered stage history with timestamps and durations
- **product-team:** heatmap endpoint (`GET /metrics/heatmap`) — returns stage-level activity density over time
- **product-team:** TeamStatus live agent dashboard — Telegram command `/teamstatus` displays agent state, current task, and pipeline stage in real time
- **product-team:** structured logging — all major operations emit structured JSON log lines with correlation IDs
- **product-team:** pipeline visualization — `pipeline_timeline` tool returns a compact Gantt-style view of stage durations per task
- **product-team:** rich approval workflows — `workflow_step_run` supports `approve`/`reject`/`comment` actions with evidence attachments
- **product-team:** proactive alerting engine (EP15) — background service emitting Telegram alerts for budget overruns, stalled pipelines, and agent inactivity with per-alert cooldown deduplication
- **stitch-bridge:** `design_variant` tool — generates A/B design variants from an existing screen; model updated to GEMINI_3_1_PRO
- **stitch-bridge:** `design_get`, `design_list`, `design_project_create`, `design_project_list`, `design_screens_list` — 5 new tools for reading and managing Stitch projects and screens (total: 8 tools)
- **quality-gate:** accessibility scan — `qgate_accessibility` tool checks HTML for missing `alt`, `lang`, and form labels via axe-core rule subset
- **quality-gate:** dependency audit check — `qgate_audit` tool runs `pnpm audit` and reports vulnerability counts by severity
- **skills:** `agent-eval` skill library — rubric-based agent output evaluation workflow
- **skills:** `build-error-resolver` skill library — systematic approach to diagnosing and fixing build/type errors
- **skills:** `skill-factory` skill library — workflow for authoring and validating new skill definitions
- **tools/create-extension:** new scaffolding CLI (`pnpm create:extension <name>`) — generates a complete extension package with `package.json`, `tsconfig.json`, `vitest.config.ts`, `openclaw.plugin.json`, `src/index.ts`, and `test/index.test.ts` (EP07)

### Changed

- **product-team:** total registered tools expanded from 34 to 38 across 10 categories (task×5, workflow×3, quality×5, vcs×4, project×3, team×5, decision×4, pipeline×7, metrics×1, agent×1)
- **product-team:** `team_message` auto-spawn guidance updated to use `team_inbox`/`team_reply` in spawned-agent prompts
- **telegram-notifier:** per-persona bot routing — tech-lead and designer agents now use dedicated bot tokens (`TELEGRAM_BOT_TOKEN_TL`, `TELEGRAM_BOT_TOKEN_DESIGNER`) via multi-account channel config; remaining 6 agents share the default PM bot
- **docker:** added virtual-office and model-router to plugin load paths in `openclaw.json` and `openclaw.docker.json`
- **ci:** quality-gate workflow now posts gate results as PR comments
- **ci:** vulnerability audit policy enforced in CI via `pnpm verify:vuln-policy`; exception ledger with mandatory expiry dates

### Fixed

- **product-team:** circuit breaker agent tracking — fixed stale agent references causing false-positive circuit open events
- **stitch-bridge:** path traversal vulnerability in design file reads hardened with resolved-path boundary check

## [0.1.1] - 2026-03-07

### Fixed

- add auth param to registerHttpRoute for openclaw 2026.3.2 ([a5a0391](https://github.com/Monkey-D-Luisi/vibe-flow/commit/a5a03914de04435a599307482231687122f1d960))
- **docker:** resolve Control UI 404 after openclaw SDK 2026.3.2 ([9c2dd82](https://github.com/Monkey-D-Luisi/vibe-flow/commit/9c2dd822f695e57afaa84bf75f07940ec7db7099))
- **quality-gate:** remove accidentally committed .js build artifacts ([fc669e1](https://github.com/Monkey-D-Luisi/vibe-flow/commit/fc669e106aa5824e0651c22e0c529cbe845956e1))
- resolve CI vuln policy, badges, landing screenshots, and og-image ([829416c](https://github.com/Monkey-D-Luisi/vibe-flow/commit/829416c088970a246faa0e2dc5756426da047dab))
- **site:** replace broken dashboard PNG with SVG mockup ([02153c6](https://github.com/Monkey-D-Luisi/vibe-flow/commit/02153c625a02bf9b4253a4f9ad5624fda9ee4813))

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
[0.1.1]: https://github.com/Monkey-D-Luisi/vibe-flow/releases/tag/v0.1.1
[0.2.0]: https://github.com/Monkey-D-Luisi/vibe-flow/compare/v0.1.1...v0.2.0
[0.2.1]: https://github.com/Monkey-D-Luisi/vibe-flow/compare/v0.2.0...v0.2.1
[Unreleased]: https://github.com/Monkey-D-Luisi/vibe-flow/compare/v0.2.1...HEAD
