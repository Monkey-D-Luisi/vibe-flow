# Task: 0114 -- Database Migration Rollback Mechanism

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP17 -- Security & Stability v2 |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-29 |
| Branch | `feat/EP17-security-stability-v2` |

---

## Goal

Add rollback support to the SQLite migration system so that failed migrations
can be reverted and schema changes can be undone during development.

---

## Context

The existing migration system is forward-only: an array of `{ version, sql }`
objects applied sequentially in a single transaction, tracked by a `schema_version`
table. If a migration fails mid-way, the database is left in a partially migrated
state. There is no versioning table with checksums, no rollback, and no way to
detect modified migrations.

---

## Scope

### In Scope

- New `Migration` interface with `up`/`down` SQL
- Migration engine (`migrateUp`, `migrateDown`, `getMigrationStatus`, `validateChecksums`)
- `schema_migrations` tracking table with SHA-256 checksums
- Backward compatibility with existing `schema_version` table
- All 6 existing migrations converted to up/down format
- v3 down migration handles SQLite table rebuild (no DROP COLUMN support)
- Each migration in its own transaction
- Comprehensive test suite

### Out of Scope

- CLI migration commands (up/down/status)
- Migration file scaffolding
- Migration ordering beyond sequential version numbers

---

## Requirements

1. All existing migrations converted to reversible format with tested down SQL
2. Checksum validation detects if applied migrations were modified
3. Each migration runs in its own transaction (fails independently)
4. Backward compatible: databases with old `schema_version` table upgrade seamlessly
5. v3 down migration rebuilds table to remove `pipeline_stage` column (SQLite constraint)

---

## Acceptance Criteria

- [x] AC1: New `Migration` interface with `version`, `name`, `up`, `down`
- [x] AC2: `migrateUp` applies pending migrations and records checksums
- [x] AC3: `migrateDown(targetVersion)` rolls back to specified version
- [x] AC4: `validateChecksums` detects modified migrations
- [x] AC5: `getMigrationStatus` reports current version, applied, and pending
- [x] AC6: Old `schema_version` data migrated to new `schema_migrations` table
- [x] AC7: Each migration runs in its own transaction
- [x] AC8: All 6 migrations have tested up/down paths
- [x] AC9: ≥ 90% test coverage for migration engine

---

## Definition of Done

- [x] `migration-engine.ts` created with full up/down/status/checksum API
- [x] `migrations.ts` converted to up/down format
- [x] 28 tests passing (22 migration-engine + 6 connection)
- [x] Full test suite (2,410 tests) passes with zero regressions
- [x] Backward compatibility verified
- [x] Walkthrough updated
