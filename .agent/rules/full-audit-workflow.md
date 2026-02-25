# Full Audit Workflow

## Trigger Command
**Command:** `"full audit"`

## Execution Contract

Execute this workflow atomically and do not skip phases.

- Run every mandatory phase in order.
- If a command fails, retry once. If still failing, record blocker and continue with remaining phases.
- Keep command-backed evidence for each phase.
- Do not mark completion until the report is fully generated and linked in walkthrough evidence.

## Priority Axis (strict)

Findings and report sections must follow:

1. Product
2. Security
3. Architecture
4. Development

## Phase 1: Preflight and Evidence Baseline

Run and capture outputs for:

```bash
git status --short --branch
pnpm lint
pnpm typecheck
pnpm test
pnpm audit --prod --audit-level=critical
pnpm audit --prod
```

Capture repository inventory metrics:

- file count (global + scoped directories)
- hotspot list (largest files by line count)
- coverage summary from available coverage artifacts or coverage runs

## Phase 2: Product Audit (highest priority)

Validate:

- documented commands vs executable commands
- documented operational flows vs observed behavior
- quality-gate CLI behavior against docs/runbooks
- docs/config examples vs schema-enforced config contract

Output Product findings first and classify severity.

## Phase 3: Security Audit

Perform:

- dependency risk triage from `pnpm audit` (direct vs transitive, exploitability notes)
- code-level checks:
  - command execution safety
  - path containment
  - webhook trust/auth model
  - secret handling
- cross-check with official security guidance and advisories

## Phase 4: Architecture Audit

Check:

- layer boundaries and dependency direction
- contract consistency (plugin manifest, config schema, tool registration)
- duplication and drift across `quality-gate` and `product-team`

## Phase 5: Development Audit

Check:

- test depth and behavioral coverage (real behavior vs mock-only tests)
- coverage quality and threshold consistency
- CI policy adequacy (blocking vs informational checks)
- maintainability hotspots and documentation drift

## Phase 6: Official Sources Pass

Use and cite:

- local official docs in installed OpenClaw package under `node_modules/**/openclaw/docs`
- official web docs/sources:
  - `https://openclaw.ai`
  - `https://trust.openclaw.ai`
  - official advisory pages referenced by findings

Every external claim must include a citation link in the report.

## Phase 7: Mandatory Report Output

Create audit report in `docs/audits/` with:

1. Metadata + scope + commands/evidence
2. Findings table with fields:
   - `ID`
   - `Axis`
   - `Severity`
   - `Confidence`
   - `Evidence`
   - `Impact`
   - `Recommendation`
   - `Owner`
   - `Status`
3. Detailed sections ordered strictly by axis priority:
   - Product
   - Security
   - Architecture
   - Development
4. Consolidated remediation roadmap:
   - `Now`
   - `Next`
   - `Later`
5. Open questions and accepted risks

## Completion Criteria

- All phases executed with command-backed evidence
- Report generated with required schema and strict axis ordering
- Walkthrough updated with commands run and files changed
