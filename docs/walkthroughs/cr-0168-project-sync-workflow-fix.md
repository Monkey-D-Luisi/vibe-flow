# Walkthrough: cr-0168 -- Project Sync Workflow Fix

## Task Reference

- Task: `docs/tasks/cr-0168-project-sync-workflow-fix.md`
- Failing run investigated: `22392727513`
- Workflow: `.github/workflows/project-sync.yml`

---

## Summary

The `project-sync` workflow failed at run start (0s duration, no jobs) because GitHub rejected the workflow file permissions block. The workflow used `projects: write`, which is not a valid workflow permission key. The fix replaces it with `repository-projects: write`.

---

## Changes Made

- `.github/workflows/project-sync.yml`
  - `permissions.projects: write` -> `permissions.repository-projects: write`

---

## Verification

- Confirmed failing runs had `workflow file issue` and no jobs.
- Confirmed corrected workflow file committed in repository.

