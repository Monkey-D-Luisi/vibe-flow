# CR-0204 — PR #204 Review Fixes

| Field   | Value                                    |
|---------|------------------------------------------|
| CR      | 0204                                     |
| PR      | #204 — feat(product-team): multi-project workspace manager |
| Status  | IN PROGRESS                              |

## Findings

### MUST_FIX

1. **Path traversal in `validatePath`** (Gemini, `workspace-init.ts:23`)
   - `SAFE_PATH_RE` blocklist does not reject `..` segments — a path like
     `/workspaces/../../etc/cron.d` passes and could overwrite sensitive files.
   - Fix: add explicit `..`-segment detection after the character check.

2. **Unvalidated `id` used in default workspace path** (`project-register.ts`)
   - `workspace: input.workspace ?? `/workspaces/${input.id}`` — if `id` is
     `../../etc`, the default workspace path becomes `/workspaces/../../etc`.
   - Fix: validate `input.id` against `SAFE_ID_RE = /^[\w-]+$/` before use.

### SHOULD_FIX

3. **Silent success when `cfg` is `undefined`** (Copilot, `project-register.ts:55`)
   - Tool returns `{ registered: true }` even when `deps.projectConfig` is absent and
     the push was skipped — a false positive.
   - Fix: guard early and return `{ registered: false, reason: '...' }`.

4. **Misleading walkthrough summary** (Copilot, `walkthroughs/0040:11`)
   - Summary says switching updates "all downstream tools"; deferred section says none
     of those integrations are implemented.
   - Fix: rewrite the summary to reflect only in-memory `activeProject` mutation.

5. **No timeout on `runGit`** (Copilot, `workspace-init.ts:45`)
   - A hung `git clone` or `git fetch` blocks the event loop indefinitely.
   - Fix: add 60 s `AbortController` timeout.

6. **Weak `Record<string, unknown>` type for `ProjectConfig.projects`** (Gemini, `plugin-config.ts:141`)
   - Add typed `Project` interface with required string fields; update filter in
     `resolveProjectConfig`.

### NIT

7. **Unused `beforeEach` import** (Copilot, `project-tools.test.ts:1`)
8. **Tool description implies immediate clone** (Copilot, `project-register.ts:8`)
   - Change to clarify cloning is deferred to next gateway boot.
9. **Hardcoded GitHub.com in clone URL** (Copilot, `workspace-init.ts:83`)
   - Document the limitation in the service description comment.
