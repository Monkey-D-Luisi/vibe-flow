# Walkthrough: cr-0170 -- Project Sync PR-to-Issue Board Alignment

## Task Reference

- Task: `docs/tasks/cr-0170-project-sync-pr-linking.md`
- Workflow: `.github/workflows/project-sync.yml`

---

## Summary

Adjusted project sync behavior so PR events no longer create standalone PR items in the project board. Instead, PR events now drive status sync on linked issues, and existing PR board items are archived.

---

## Root Cause

The workflow used `pull_request.node_id` as project content and always called `addProjectV2ItemById`. This made each PR a project card under `No Parent issue`, which broke the issue-centric Kanban board.

---

## Changes Made

- `.github/workflows/project-sync.yml`
  - Added `pull_request` trigger types `edited` and `synchronize` for continuous sync on body/commit updates.
  - PR status mapping updated (`merged` -> `Done`, closed/draft -> `In Progress`, active review events -> `In Review`).
  - Added project item helpers:
    - `getProjectItemIdByContentId`
    - `ensureProjectItem`
    - `updateProjectItemStatus`
  - Added PR linked-issue resolution:
    - `extractIssueNumbersFromText` (PR body refs)
    - GraphQL `closingIssuesReferences`
  - Added `syncIssueItem` to update project status/archive/parent-link by issue.
  - Added `archivePullRequestItemIfPresent` to hide PR cards from board.
  - Main flow now:
    - `issues` event: sync that issue.
    - `pull_request` event: sync linked issues + archive PR item if present.

---

## Validation

- Local static check:
  - `actionlint .github/workflows/project-sync.yml` (not installed in local environment)
- Repository gates executed:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm typecheck`

---

## Expected Board Behavior After Fix

- New PRs stop appearing as standalone cards in `No Parent issue`.
- Linked issue cards receive status updates from PR lifecycle events.
- Existing PR cards get archived when the workflow processes PR events.
