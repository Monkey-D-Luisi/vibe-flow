# Walkthrough — 0026: Consolidate exec/spawn and fs Utilities

## Summary

Extracted duplicated `exec/spawn.ts` and file-system utilities from both
`extensions/product-team` and `extensions/quality-gate` into the shared
`@openclaw/quality-contracts` package.

## Key Changes

### New modules in `packages/quality-contracts/`

| Module | Exports |
|--------|---------|
| `src/exec/spawn.ts` | `safeSpawn`, `assertSafeCommand`, `assertPathContained`, `parseCommand`, `SpawnResult` |
| `src/fs/glob.ts` | `resolveGlobPatterns`, `filterByExclude`, `MAX_PATTERN_LENGTH`, `GlobOptions` |
| `src/fs/read.ts` | `readFileSafe`, `readJsonFile`, `MAX_JSON_FILE_BYTES` |

### Updated `package.json` (`@openclaw/quality-contracts`)

- Added exports: `./exec/spawn`, `./fs/glob`, `./fs/read`
- Added dependencies: `fast-glob`, `picomatch`
- Added devDependencies: `@types/node`, `@types/picomatch`

### Import redirections

- **product-team**: 5 source files + 3 test files updated
- **quality-gate**: 4 source files + 4 test files + 1 CLI file updated

### Deleted files

- `extensions/product-team/src/exec/spawn.ts`
- `extensions/product-team/src/quality/fs.ts`
- `extensions/quality-gate/src/exec/spawn.ts`
- `extensions/quality-gate/src/fs/glob.ts`
- `extensions/quality-gate/src/fs/read.ts`

## How to Run

```bash
pnpm install
pnpm test        # 394 tests pass
pnpm typecheck   # clean across all 4 projects
pnpm lint        # clean
```

## Notable Decisions

- `github/spawn.ts` in product-team intentionally **excluded** — it has a
  different purpose (GitHub CLI), different allowlist, and `shell: false`.
- `filterByExclude` (previously only in product-team) placed in shared
  `fs/glob.ts` since it uses `picomatch` and logically groups with globbing.
- `@types/picomatch` added as devDependency in quality-contracts to satisfy
  strict typecheck (`noImplicitAny`).
