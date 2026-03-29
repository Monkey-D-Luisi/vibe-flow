# EP18 -- Plugin SDK Contracts & DX

> Status: IN_PROGRESS
> Dependencies: EP13, EP16
> Phase: 13 (Reference & Community)
> Target: June 2026

## Motivation

The `create:extension` CLI (task 0032) and `publish-packages.mjs` (task 0033)
exist but are not connected end-to-end. The plugin API surface is implicit —
learned by reading `index.ts` files across extensions. For external contributors,
there is no "getting started" path: no API reference, no example extensions, no
versioning policy.

A project that aspires to be a reference for autonomous agents must make it
trivial for others to build on it.

**Current state:**
- Extension scaffolding CLI: `pnpm create:extension <name>` (live, task 0032)
- Publish script: `tools/publish-packages.mjs` (live, task 0033)
- API surface: implicit (register function, api.registerTool, api.on, etc.)
- API documentation: none
- Getting started guide: none
- Templates: single generic template
- Versioning policy: conventional commits, but no formal deprecation strategy

**Target state:**
- Comprehensive API reference with executable examples.
- End-to-end npm publish pipeline wired to GitHub Actions.
- Multiple scaffolding templates for different extension types.
- Getting started guide: first extension in 5 minutes.
- Formal API versioning and deprecation policy.

## Task Breakdown

### 13A: Documentation & Publishing (parallel)

#### Task 0118: Plugin API Reference Documentation

**Scope:** Create comprehensive API reference documentation for the OpenClaw
plugin extension API, derived from the actual implementations.

**API surface to document:**

| API | Category | Used In |
|-----|----------|---------|
| `api.registerTool(name, schema, handler)` | Tool registration | All extensions |
| `api.on(event, handler)` | Hook registration | product-team, telegram, model-router |
| `api.emit(event, data)` | Event emission | All extensions |
| `api.registerHttpRoute(method, path, handler)` | HTTP endpoints | product-team, model-router |
| `api.registerService(name, service)` | Service registration | product-team |
| `api.registerCommand(name, handler)` | Command registration | telegram-notifier |
| `api.logger` | Structured logger | All extensions |
| `api.config` | Plugin configuration | All extensions |
| `api.getService(name)` | Service consumption | EP13 pattern |

**Documentation format:**
- One markdown file per API area: `docs/api/tools.md`, `docs/api/hooks.md`, etc.
- Each entry: function signature, parameters table, return type, example, notes
- Cross-references to real usage in existing extensions
- Code examples are executable (can be copy-pasted into a new extension)

**Files to create:**
- `docs/api/README.md` (overview and navigation)
- `docs/api/tools.md` (tool registration API)
- `docs/api/hooks.md` (hook/event API)
- `docs/api/http.md` (HTTP route API)
- `docs/api/services.md` (service registration API)
- `docs/api/configuration.md` (config and logging API)
- `docs/api/examples.md` (complete example extensions)

**Acceptance criteria:**
- All public API methods documented
- Every method has at least one executable example
- Cross-referenced to real usage in existing extensions
- No undocumented public API surfaces remain
- Examples validate (TypeScript compiler passes)

---

#### Task 0119: npm Publish Pipeline End-to-End Wiring

**Scope:** Connect the existing `publish-packages.mjs` script to GitHub Actions
for automated npm publishing on release tags.

**Current state:**
- `tools/publish-packages.mjs` exists and can publish packages
- Release workflow exists in `.github/workflows/release.yml`
- npm publish was recently removed from release workflow (commit f5d4d30)
- Packages use `@openclaw/` scope

**Wiring:**
- Add publish job to release workflow (triggers on `v*` tags)
- Publish only packages whose version changed since last release
- OIDC provenance signing (already configured in task 0033)
- Dry-run on PR, actual publish on tag push
- Publish order: `quality-contracts` first (dependency), then extensions

**Files to create/modify:**
- `.github/workflows/release.yml` (modify: re-add publish with improvements)
- `tools/publish-packages.mjs` (modify: add changed-package detection)
- `.github/workflows/quality-gate.yml` (modify: add dry-run publish check on PR)

**Acceptance criteria:**
- `v*` tag push triggers npm publish for changed packages
- Provenance attestations included in published packages
- Dry-run on PR catches publish failures before merge
- Publish order respects dependency graph
- Rollback procedure documented (npm unpublish within 24h window)

---

### 13B: Scaffolding & Onboarding (sequential after 13A)

#### Task 0120: Extension Scaffolding Templates by Type

**Scope:** Enhance the `create:extension` CLI with templates for each common
extension pattern: tool-only, hook-only, service, and hybrid.

**Template types:**

| Template | Scaffolds | Use Case |
|----------|-----------|----------|
| `tool` | registerTool + schema + handler + tests | Single-purpose tool extension |
| `hook` | api.on + handler + tests | Event listener extension |
| `service` | registerService + API + tests | Background service extension |
| `http` | registerHttpRoute + handler + tests | HTTP API extension |
| `hybrid` | All of the above + README | Full-featured extension (current default) |

**Each template includes:**
- `src/index.ts` with register function
- `src/*.test.ts` with starter tests
- `package.json` with correct dependencies
- `tsconfig.json` extending root config
- `README.md` explaining the extension
- `.gitignore`

**CLI enhancement:**
```bash
pnpm create:extension my-tool --template tool
pnpm create:extension my-hook --template hook
pnpm create:extension my-service --template service
```

**Files to create/modify:**
- `tools/templates/tool/` (new directory with template files)
- `tools/templates/hook/` (new directory)
- `tools/templates/service/` (new directory)
- `tools/templates/http/` (new directory)
- `tools/create-extension.mjs` (modify: add --template flag)

**Acceptance criteria:**
- All 5 template types scaffold correctly
- Scaffolded extensions compile and pass tests immediately
- Templates use current project conventions (ESM, .js extensions, vitest)
- `--template` flag with tab completion / help text
- >= 90% test coverage for scaffolding logic

---

#### Task 0121: Getting Started Guide

**Scope:** Create a step-by-step guide that walks a new developer from zero to a
working OpenClaw extension in 5 minutes.

**Guide structure:**

1. **Prerequisites** (1 min): Node.js, pnpm, git clone
2. **Install** (1 min): `pnpm install`
3. **Scaffold** (30s): `pnpm create:extension hello-world --template tool`
4. **Implement** (2 min): Add a simple tool that returns "Hello, {name}!"
5. **Test** (30s): `cd extensions/hello-world && pnpm test`
6. **Load** (30s): Add to gateway config and restart
7. **Verify** (30s): Call the tool via gateway API

**Guide includes:**
- Copy-pasteable code blocks
- Expected output for each step
- Troubleshooting section for common issues
- Link to API reference for deeper exploration
- Link to existing extensions as examples

**Files to create:**
- `docs/getting-started.md` (new)
- `docs/troubleshooting.md` (new)

**Acceptance criteria:**
- Guide tested end-to-end by following steps exactly
- All code blocks are correct and complete
- Expected output matches actual output
- Troubleshooting covers top 5 common issues
- Time to complete < 5 minutes (verified)

---

### 13C: Governance (sequential after 13B)

#### Task 0122: API Versioning Policy and Deprecation Strategy

**Scope:** Define the formal policy for how the plugin API evolves, how breaking
changes are communicated, and how deprecated features are removed.

**Policy structure:**

1. **Versioning**: Plugin API version follows semver independently of package versions
   - MAJOR: Breaking API changes (removing/renaming methods, changing signatures)
   - MINOR: New API methods, new optional parameters
   - PATCH: Bug fixes to existing behavior

2. **Deprecation timeline**:
   - Deprecated features emit console warning with migration path
   - Deprecated features remain functional for 2 minor versions
   - Removal only in next major version
   - Migration guide published for every deprecation

3. **Breaking change process**:
   - RFC issue opened with proposed change and migration path
   - 2-week comment period
   - ADR recording the decision
   - Migration guide + automated codemod if feasible

4. **Stability tiers**:
   - `@stable` — will not break within major version
   - `@beta` — may change in minor versions (1 minor version notice)
   - `@experimental` — may change or be removed at any time

**Files to create:**
- `docs/api/versioning-policy.md` (new)
- `CHANGELOG.md` (new: template for tracking changes)
- `docs/api/stability-tiers.md` (new: stability annotation guide)

**Acceptance criteria:**
- Policy covers versioning, deprecation, breaking changes, and stability tiers
- All current API methods annotated with stability tier
- CHANGELOG template follows Keep a Changelog format
- Policy approved by repo owner (you)

## Definition of Done

- [ ] All 5 tasks completed
- [ ] API reference documentation covers all public methods
- [ ] npm publish pipeline publishes on tag push with provenance
- [ ] 5 scaffolding templates available and tested
- [ ] Getting started guide verified end-to-end (< 5 min)
- [ ] Versioning policy and stability tiers documented
- [ ] `pnpm test && pnpm lint && pnpm typecheck` passes
