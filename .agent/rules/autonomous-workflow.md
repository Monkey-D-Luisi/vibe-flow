# Autonomous Agent Workflow

## Trigger Command
**Command:** `"next task"`

## Workflow Steps

### Step 0: Sync with Main
1. Switch to `main` branch: `git checkout main`
2. Pull latest: `git pull origin main`
3. Create a new feature branch for the task

### Step 1: Identify Next Task
1. Read `docs/backlog/` to find PENDING tasks
2. Select the first PENDING task with all dependencies met
3. If no task is available, report to user and wait

### Step 2: Create Task Documentation
1. Create task file: `docs/tasks/NNNN-<task-title>.md` using `.agent/templates/task-template.md`
2. Create walkthrough file: `docs/walkthroughs/NNNN-<task-title>.md` using `.agent/templates/walkthrough-template.md`

### Step 3: Update Task Status
Change the task status in the backlog file: `PENDING` -> `IN_PROGRESS`

### Step 4: Implement the Solution
Follow the project's coding standards. Write tests alongside implementation.

### Step 5: Run Quality Checks
```bash
pnpm test
pnpm lint
pnpm typecheck
```

### Step 6: Update Walkthrough
Document: summary, decisions, commands run, files changed, tests, follow-ups.

### Step 7: Commit Changes
```bash
git add <specific-files>
git commit -m "feat(scope): description"
```

### Step 8: Mark Task Complete
1. Update backlog: `IN_PROGRESS` -> `DONE`
2. Update task file: Status -> DONE, check DoD boxes
3. Commit status updates

### Step 9: Create Pull Request
Push and create PR following `.agent/rules/pr-workflow.md`.

## Task Document Rules
- The task document is immutable. Only update Status and DoD checkboxes.
- Implementation notes go in the walkthrough.
- Only modify files required by the task scope.

## Quality Gates
| Gate | Verification |
|------|--------------|
| Tests pass | `pnpm test` succeeds |
| Lint clean | `pnpm lint` succeeds |
| Types clean | `pnpm typecheck` succeeds |
| No secrets | No credentials in code |
| Walkthrough | Reflects actual implementation |
