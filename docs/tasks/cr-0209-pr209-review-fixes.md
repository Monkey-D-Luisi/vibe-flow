# CR-0209 — PR #209 Review Fixes

| Field   | Value                                           |
|---------|-------------------------------------------------|
| PR      | #209 feat(task-0047): Configuration Web UI Extension |
| CR      | 0209                                            |
| Status  | IN PROGRESS                                     |

## MUST_FIX

- **[M1]** `index.ts:24-25`: Unsafe `pluginConfig` cast — `as Record<string, unknown>` without runtime check; `String(null)` produces `'null'`. Fixed: runtime type guard + string check.
- **[M2]** `index.ts:157-163`: XSS via `innerHTML` with unescaped WebSocket payload data. Fixed: replaced with DOM API (`insertRow`/`insertCell`/`textContent`).
- **[M3]** `index.ts:146`: Hard-coded `ws://` protocol fails on HTTPS (mixed-content). Fixed: derive protocol from `location.protocol`.
- **[M4]** `vitest.config.ts`: `passWithNoTests: true` with no test directory → zero test coverage undetected. Fixed: added 20 tests covering plugin registration, handler behavior, config handling, HTTP method enforcement.
- **[M5]** `index.ts:91-95`: Nav links (`/team/agents`, etc.) point to unregistered subpaths → 404. Fixed: changed to hash-based navigation (`/team#agents`).

## SHOULD_FIX

- **[S1]** `index.ts:173-174`: Silent `.catch(() => {})` on loadAgents/loadCosts. Fixed: log errors to console.
- **[S2]** `index.ts:46`: HTTP handler accepts all methods. Fixed: restrict to GET/HEAD, return 405 otherwise.
- **[S3]** `walkthrough:14`: References `registerHttpHandler` but code uses `registerHttpRoute`. Fixed.
- **[S4]** `walkthrough:19`: Manifest description says "declaring gateway methods and HTTP routes" but manifest only has metadata + configSchema. Fixed.
- **[S5]** `walkthrough:20`: Claims tsconfig "extending the root monorepo settings" but it's standalone. Fixed.
- **[S6]** `task:12`: Status DONE but acceptance criteria all unchecked. Fixed: checked delivered items, marked deferred items.
- **[S7]** `task:90`: References `registerHttpHandler`, should be `registerHttpRoute`. Fixed.
- **[S8]** `config-handlers.ts:5`: `basePath` hard-coded in response, diverges from configured value. Fixed: factory pattern (`createConfigGetHandler(basePath)`).

## SUGGESTION / OUT_OF_SCOPE

- **Copilot #12/13**: Extensive basePath validation/normalization — partially addressed via type guard; full normalization not needed for scaffold.
- **Copilot #14**: nav subpath routing — addressed via hash-based links; full SPA routing is a follow-up.
