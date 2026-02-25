# Task: cr-0168 -- Project Sync Workflow Fix

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Priority | HIGH |
| Created | 2026-02-25 |
| Branch | `main` |

---

## Goal

Fix the GitHub Actions workflow parsing failure for `.github/workflows/project-sync.yml` runs that failed instantly with a workflow file issue.

---

## Finding

| Severity | Finding |
|----------|---------|
| MUST_FIX | Workflow permissions used invalid key `projects: write`, which GitHub rejects in workflow syntax validation and prevents jobs from starting. |

---

## Changes

- Replaced invalid permission key `projects` with valid `repository-projects` in `.github/workflows/project-sync.yml`.

---

## Definition of Done

- [x] Root cause identified from failing workflow runs
- [x] Workflow syntax issue fixed in repository
- [x] Change documented with matching walkthrough
