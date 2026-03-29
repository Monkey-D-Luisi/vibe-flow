# Walkthrough: 0114 -- Database Migration Rollback Mechanism

## Task Reference

- Task: `docs/tasks/0114-db-migration-rollback.md`
- Epic: EP17 -- Security & Stability v2
- Branch: `feat/EP17-security-stability-v2`

---

## Summary

Redesigned the database migration system from forward-only `{ version, sql }`
to reversible `{ version, name, up, down }` with SHA-256 checksum validation,
per-migration transactions, and backward compatibility with the old
`schema_version` tracking table.

---

## Context

Pre-EP17, migrations were a flat array of SQL strings applied in one big
transaction. No rollback, no checksums, no modification detection. If migration
N failed, the database could be left in a partially migrated state.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Separate `migration-engine.ts` file | Clean separation from migration definitions; engine is reusable |
| 16-char SHA-256 checksums | Short enough for readability, long enough to detect changes |
| Per-migration transactions | Isolates failures; partial rollback possible |
| v3 down uses table rebuild | SQLite < 3.35.0 doesn't support DROP COLUMN; table rebuild is the standard workaround |
| Preserve `schema_version` writes | Backward compatibility for any code reading the old table |
| Legacy checksum skip | Old databases have no checksums; mark as 'legacy' and skip validation |

---

## Implementation Notes

### Approach

TDD: wrote 22 failing tests first for the migration engine, then implemented
`migrateUp`, `migrateDown`, `getMigrationStatus`, `validateChecksums`, and
`computeChecksum`. Fixed 2 issues during testing:

1. v1 down drops `schema_version`, so `migrateDown` must re-check table
   existence each iteration instead of caching a prepared statement.
2. Old `connection.test.ts` tests checked `schema_version` — updated to
   check `schema_migrations` (new canonical tracking table).

### Key Changes

- **migration-engine.ts**: New file with 5 exported functions. Handles tracking
  table creation, old→new migration, checksum computation, up/down application.
- **migrations.ts**: All 6 migrations converted to `{ version, name, up, down }`
  format. Old `Migration` interface replaced by import from engine.
  `runMigrations()` remains as backward-compatible wrapper.
- **connection.test.ts**: Updated to query `schema_migrations` instead of `schema_version`.

---

## Commands Run

```bash
npx vitest run test/persistence/migration-engine.test.ts test/persistence/connection.test.ts --reporter=verbose
pnpm test   # Full suite: 2,410 passed, 0 failed
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/src/persistence/migration-engine.ts` | Created | New migration engine with up/down/status/checksum |
| `extensions/product-team/src/persistence/migrations.ts` | Modified | Converted 6 migrations to up/down format |
| `extensions/product-team/test/persistence/migration-engine.test.ts` | Created | 22 tests covering all engine functions |
| `extensions/product-team/test/persistence/connection.test.ts` | Modified | Updated to use `schema_migrations` table |
| `docs/tasks/0114-db-migration-rollback.md` | Created | Task specification |
| `docs/walkthroughs/0114-db-migration-rollback.md` | Created | This walkthrough |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| migration-engine | 22 | 22 | ~95% |
| connection | 6 | 6 | N/A |
| Full suite | 2,410 | 2,410 | N/A |

---

## Follow-ups

- Consider adding CLI commands (`migrate up`, `migrate down`, `migrate status`) for developer use
- Migration file scaffolding (`create-migration <name>`) could be added to the extension CLI
