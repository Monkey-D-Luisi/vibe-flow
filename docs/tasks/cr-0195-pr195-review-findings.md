# CR-0195 — PR #195 Review Findings

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| PR | https://github.com/Monkey-D-Luisi/vibe-flow/pull/195 |
| Task | docs/tasks/0032-extension-scaffolding-cli.md |
| Branch | feat/0032-extension-scaffolding-cli |

---

## Findings

### SHOULD_FIX (5 items addressed)

| # | File | Finding | Source |
|---|------|---------|--------|
| 1 | `tools/create-extension/src/cli.ts:29` | `(err as Error)` unsafe cast — crashes if non-Error thrown | Gemini, Copilot |
| 2 | `tools/create-extension/src/cli.ts:7` | Usage text shows `create-extension` instead of `pnpm create:extension` | Copilot |
| 3 | `tools/create-extension/vitest.config.ts:15` | `branches: 80` in this package vs `branches: 75` in the generated template | Copilot |
| 4 | `docs/walkthroughs/0032-extension-scaffolding-cli.md:86` | Misleading typecheck note contradicts PR description ("clean across all packages") | Copilot |
| 5 | `tools/create-extension/src/generator.ts:55` | Missing `openclaw.plugin.json` — present in all existing extensions, required by plugin contract | Copilot, Codex |

### OUT_OF_SCOPE / FALSE_POSITIVE (4 items not addressed)

| # | Finding | Reason |
|---|---------|--------|
| 1 | `pnpm-lock.yaml` stray importers | Those are real workspace packages (`??` untracked) correctly picked up by pnpm install |
| 2 | Wrong `src/index.ts` plugin shape (`register(api)` vs `Plugin`) | AC3 passes typecheck; `Plugin` type is valid; shape change is out of scope for task 0032 |
| 3 | Missing `src/tools/` sample tool | Not in any acceptance criterion for task 0032 |
| 4 | Interactive prompt for name/description | AC1 specifies non-interactive positional arg; not in scope |
