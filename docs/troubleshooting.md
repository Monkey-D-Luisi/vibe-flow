# Troubleshooting

Common issues when developing OpenClaw extensions.

## 1. `ERR_MODULE_NOT_FOUND` when importing `.js` extension

**Symptom:** TypeScript compiles but Node throws `ERR_MODULE_NOT_FOUND` at
runtime.

**Cause:** Import paths must use `.js` extensions in ESM projects, even when the
source file is `.ts`.

**Fix:**

```typescript
// ✗ Wrong
import { foo } from './util';

// ✓ Correct
import { foo } from './util.js';
```

## 2. `Cannot find module '../src/index.js'` in tests

**Symptom:** Vitest fails with a module-not-found error for test imports.

**Cause:** The `tsconfig.json` `rootDir` is set to `src/` but tests import from
`../src/index.js`. Vitest needs to resolve the source.

**Fix:** Ensure your `vitest.config.ts` includes:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

## 3. `pnpm create:extension` fails with "reserved name"

**Symptom:**

```
Error: "src" is a reserved name and cannot be used as an extension name.
```

**Cause:** The following names are reserved: `node_modules`, `src`, `dist`,
`test`, `tools`, `packages`, `extensions`, `scripts`, `coverage`.

**Fix:** Choose a different name. Extension names must be kebab-case
(e.g. `my-tool`, `audit-logger`).

## 4. Lint error: `@typescript-eslint/no-explicit-any`

**Symptom:** ESLint reports `Unexpected any. Specify a different type`.

**Cause:** The project enforces `no-explicit-any`. Using `any` is not allowed.

**Fix:** Use `unknown` with type guards:

```typescript
// ✗ Wrong
function handle(data: any) { ... }

// ✓ Correct
function handle(data: unknown) {
  const record = data as Record<string, unknown>;
  const name = String(record['name'] ?? '');
}
```

## 5. Tests pass locally but fail in CI

**Symptom:** All tests pass with `pnpm test` locally but the quality gate
fails in GitHub Actions.

**Common causes:**

| Cause | Fix |
|-------|-----|
| Missing `node_modules` | CI runs `pnpm install` — check lockfile is committed |
| OS-specific paths | Use `node:path` join/resolve, not string concatenation |
| Timezone-dependent tests | Use UTC explicitly or mock `Date` |
| Port conflicts | Use port 0 to let the OS assign a free port |

**Debug step:** Run the full quality gate locally:

```bash
pnpm q:gate --source artifacts --scope minor
```

## 6. `openclaw.plugin.json` not found

**Symptom:** The gateway cannot load your extension because it expects a
`openclaw.plugin.json` manifest.

**Fix:** Ensure the manifest exists at the root of your extension directory:

```json
{
  "id": "my-extension",
  "name": "my-extension",
  "version": "0.1.0",
  "description": "OpenClaw extension: my-extension"
}
```

The `pnpm create:extension` CLI generates this automatically.

## 7. Coverage below threshold

**Symptom:**

```
ERROR: Coverage threshold not met for statements (75% < 80%)
```

**Cause:** The quality gate requires >= 80% statement coverage for major
changes and >= 70% for minor changes.

**Fix:** Add tests for uncovered branches. Check which lines are missed:

```bash
cd extensions/my-extension
pnpm test:coverage
```

Review the coverage report in `coverage/` to identify untested paths.
