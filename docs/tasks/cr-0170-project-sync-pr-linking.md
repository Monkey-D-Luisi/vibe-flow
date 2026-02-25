# Task: cr-0170 -- Project Sync PR-to-Issue Board Alignment

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Priority | HIGH |
| Created | 2026-02-25 |
| Branch | `feat/0009-ci-webhook-feedback` |

---

## Goal

Prevent pull requests from appearing as standalone project items in the board and synchronize project status through linked issues instead.

---

## Finding

| Severity | Finding |
|----------|---------|
| MUST_FIX | `.github/workflows/project-sync.yml` added PR nodes directly to Project V2 on `pull_request` events, producing `No Parent issue` board items and desynchronizing issue-centric Kanban flow. |

---

## Changes

- Updated `.github/workflows/project-sync.yml` to process `pull_request` events by:
  - Resolving linked issue numbers from PR body references and `closingIssuesReferences`.
  - Updating project items/status on linked **issues** instead of adding PR content to the board.
  - Archiving existing PR project item (if present) to keep board issue-centric.
- Added robust project item resolution (`getProjectItemIdByContentId` + `ensureProjectItem`) to avoid duplicate add logic and support archived lookup.
- Kept issue event flow for parent-epic linking and deprecated archival behavior.

---

## Definition of Done

- [x] Root cause identified from board behavior
- [x] Workflow behavior changed to sync via linked issues on PR events
- [x] Existing PR project items are archived when detected
- [x] Change documented with matching walkthrough
