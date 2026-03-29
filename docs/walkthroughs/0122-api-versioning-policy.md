# Walkthrough 0122 -- API Versioning Policy

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Independent API semver | Package versions already track npm releases; API version tracks the plugin contract separately |
| 2 | 2-minor deprecation window | Balances stability with agility; matches industry norms (e.g. Node.js) |
| 3 | Three stability tiers | Matches TypeScript/VS Code ecosystem conventions (stable/beta/experimental) |
| 4 | All existing core APIs → Stable | They have multiple consumers and haven't changed since creation |
| 5 | `subagent_spawned`, `before_model_resolve`, `registerCommand` → Beta | Fewer consumers, API shape still settling |
| 6 | `api.runtime` → Experimental | Internal detail, subject to change |

## Files Created

- `docs/api/versioning-policy.md`
- `docs/api/stability-tiers.md`
- `docs/tasks/0122-api-versioning-policy.md`
