# Autonomous Agent Workflow

## Trigger Command
**Command:** `"next task"`

## Execution contract

Execute this workflow with **plan-first** discipline — always confirm the approach with the user before implementing.

- Present a plan and get user approval before writing code.
- If a step fails: diagnose and ask the user how to proceed.
- Read only local files. Do not fetch external repos or URLs.
- **Any doubt or uncertainty?** Use the questionnaire tool (always include a free-text field). Ask early, ask often.

## Workflow Steps

### Step 0: Sync with Main
1. Switch to `main` branch: `git checkout main`
2. Pull latest: `git pull origin main`
3. Create a new feature branch for the task

### Step 1: Identify Next Task
1. Read `docs/roadmap.md` (`Task Specs` section) to find PENDING tasks
2. Select the first PENDING task with all dependencies met
3. Validate dependency epics in `docs/backlog/` are `DONE`
4. If no task is available, report to user and wait

### Step 1.5: Plan & Confirm
1. Enter plan mode (or present a structured plan in chat)
2. Outline: which files will be created/modified, implementation approach, key design decisions, any risks
3. Wait for user approval before proceeding to Step 2
4. If the user requests changes to the plan, revise and re-confirm

### Step 2: Create Task Documentation
1. Ensure task file exists: `docs/tasks/NNNN-<task-title>.md` (create from `.agent/templates/task-spec.md` if missing)
2. Ensure walkthrough file exists: `docs/walkthroughs/NNNN-<task-title>.md` (create from `.agent/templates/walkthrough.md` if missing)

### Step 3: Update Task Status
Change task status in `docs/roadmap.md`: `PENDING` -> `IN_PROGRESS`

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
1. Update `docs/roadmap.md`: `IN_PROGRESS` -> `DONE`
2. Update task file: Status -> DONE, check DoD boxes
3. If epic-level status changes, update the corresponding `docs/backlog/EPxx-*.md`
4. Commit status updates

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
