# CR-0211: Code Review — Docker Autonomous Team PR

| Field       | Value                                                      |
|-------------|------------------------------------------------------------|
| PR          | #211                                                       |
| Branch      | `feat/docker-autonomous-team`                              |
| Reviewer    | agent (code-review-workflow)                               |
| Date        | 2026-03-03                                                 |

## Scope

Full code review of PR #211 (109 changed files). Docker deployment for autonomous multi-agent product team with reactive messaging.

## Findings Summary

| Severity   | Count | Fixed |
|------------|-------|-------|
| MUST_FIX   | 8     | 6     |
| SHOULD_FIX | 14    | 5     |
| NIT        | 12    | 1     |

## MUST_FIX (actioned)

1. **Dockerfile: `--no-frozen-lockfile`** — non-reproducible builds. Fixed → `--frozen-lockfile`.
2. **Dockerfile: `npm rebuild`** — wrong package manager. Fixed → `pnpm rebuild`.
3. **Entrypoint: gateway token in logs** — credential exposure via `docker logs`. Fixed → masked output.
4. **lint.ts / run_tests.ts: no input validation** — command flows to spawn unvalidated. Fixed → added assertion guards.
5. **team-ui: deceptive no-op handlers** — `handleAgentsUpdate` / `handleConfigUpdate` respond ok but persist nothing. Fixed → return `not_implemented` error.
6. **CI: wrong package filter** — `@openclaw/plugin-product-team` renamed to `@openclaw/product-team`. Fixed.

## MUST_FIX (deferred — architecture)

7. **auto-spawn.ts: minified export names** — `clientMod.t`, `.kt`, `.Xt` are internal mangled symbols. Breaks on any openclaw patch. Needs stable SDK API or adapter module.
8. **auto-spawn.ts: token/message in subprocess CLI** — visible via `ps`. Needs env var / stdin / temp file approach.

## SHOULD_FIX (actioned)

9. **spawn.ts: `%` missing from SHELL_META** — Windows `%VAR%` expansion bypass. Fixed.
10. **CLAUDE.md: tool names use dots** — but registration rewrites to underscores. Fixed to underscore format.
11. **decision-engine + team-messaging: duplicate ensureMessagesTable** — extracted shared helper.
12. **CI coverage: add new extensions** — noted for follow-up (need `test:coverage` scripts first).
13. **Dockerfile: `pnpm rebuild` instead of npm** — fixed alongside item 2.

## SHOULD_FIX (deferred)

- Container runs as root (needs USER directive + chown)
- Sandbox mode off + open Telegram policy (needs security architecture review)
- No multi-stage build (image ships with build tools)
- Hardcoded `/app` paths in auto-spawn.ts
- Module-level singleton `recentSpawns` Map (no size bound)
- Hardcoded `'calling-agent'` in decision-engine circuit breaker
- `envsubst` without explicit variable list
- Docker secrets declared but never consumed by entrypoint
- Hardcoded `channel: 'telegram'` in auto-spawn
- team-ui hardcoded `/team` basePath in HTML

## NIT (noted)

- `VOLUME` directive unnecessary given compose volumes
- Duplicate `restart: unless-stopped` in prod overlay
- `NODE_ENV=production` set in three places
- Docs show stale tech-lead model
- Agent roster "out of 10" hardcoded in dashboard HTML
- Deprecated `buildSpawnDirective` still exported/tested
- `else if` double-counted in regex complexity tool
- Underscore-prefix on used parameters in auto-spawn hooks
