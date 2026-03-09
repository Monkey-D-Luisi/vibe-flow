# Next Epic Workflow

## Trigger Command
**Command:** `"next epic"`

## Execution Contract

Execute the **entire epic** as an **atomic run** — all tasks in the epic are implemented sequentially on a **single feature branch** and submitted in a **single Pull Request**.

- Complete all tasks in sequence without mid-task pauses.
- If a step fails: fix it or document the blocker in the walkthrough and continue.
- Read only local files. Do not fetch external repos or URLs.
- **Genuine ambiguity before starting?** Use the questionnaire tool (no requests consumed). Ask once, upfront, not mid-task.
- Emphasis on **maximum detail, depth, and exhaustive testing** at every step.

## Key Differences from `next task`

| Aspect | `next task` | `next epic` |
|--------|-------------|-------------|
| Scope | Single task | All tasks in one epic |
| Branch | One branch per task | One shared branch for the entire epic |
| PR | One PR per task | One PR for the entire epic |
| Quality gates | After each task | After each task AND comprehensive E2E after all tasks |
| Manual testing | None | Questionnaire with manual test instructions after E2E |
| Commits | One per task | One per task (accumulated on same branch) |

---

## Workflow Steps

### Step 0: Identify Target Epic

1. Read `docs/roadmap.md` to find the first `PENDING` epic with all dependency epics `DONE`.
2. Read the corresponding `docs/backlog/EPxx-*.md` to get the full task breakdown.
3. Identify all tasks in the epic, their sub-phases, and dependency ordering.
4. If no epic is available (all dependencies unmet), report to user and stop.

### Step 1: Sync and Branch

1. Switch to `main` branch: `git checkout main`
2. Pull latest: `git pull origin main`
3. Create a single feature branch for the entire epic: `feat/EPxx-<kebab-epic-name>`
   - Example: `feat/EP12-agent-learning-loop`

### Step 2: Mark Epic IN_PROGRESS

1. Update epic status in `docs/backlog/EPxx-*.md`: `PENDING` → `IN_PROGRESS`.
2. Commit: `chore(docs): mark EPxx as IN_PROGRESS`

---

### Step 3: Execute Tasks Sequentially

For **each task** in the epic (respecting sub-phase dependency order):

#### 3a: Create Task Documentation

1. Create task file: `docs/tasks/NNNN-<task-title>.md` from `.agent/templates/task-spec.md`
   - Fill in ALL sections with **maximum detail**: comprehensive requirements, thorough acceptance criteria, detailed implementation steps, complete testing plan.
2. Create walkthrough file: `docs/walkthroughs/NNNN-<task-title>.md` from `.agent/templates/walkthrough.md`

#### 3b: Update Task Status

1. Change task status in `docs/roadmap.md`: `PENDING` → `IN_PROGRESS`

#### 3c: Deep Implementation

Follow the project's coding standards with emphasis on depth and quality:

1. **Read existing code thoroughly** — understand all related modules before writing a single line.
2. **TDD cycle** — strict Red-Green-Refactor for every feature:
   - Write failing test first
   - Implement minimum code to pass
   - Refactor while green
3. **Comprehensive error handling** — handle edge cases, validate inputs, provide clear error messages.
4. **Full type safety** — no `any`, use TypeBox schemas for all external contracts.
5. **Integration with existing systems** — wire into existing tools, hooks, and event flows.

#### 3d: Run Quality Checks (per task)

```bash
pnpm test
pnpm lint
pnpm typecheck
```

All three must pass. Fix issues immediately before continuing.

#### 3e: Update Walkthrough (per task)

Document thoroughly:
- Summary of what was implemented
- Key decisions and rationale
- TDD cycle description
- All commands run
- All files changed with descriptions
- Test results and coverage numbers
- Follow-ups discovered

#### 3f: Commit Task Changes

```bash
git add <specific-files>
git commit -m "feat(scope): description (Task NNNN)"
```

Use conventional commit format. Include task number in the message.

#### 3g: Mark Task Complete

1. Update `docs/roadmap.md`: `IN_PROGRESS` → `DONE`
2. Update task file: Status → `DONE`, check DoD boxes
3. Commit status updates: `chore(docs): mark Task NNNN as DONE`

#### 3h: Proceed to Next Task

Move to the next task in the epic, respecting sub-phase dependencies:
- Tasks in the same sub-phase (marked "parallel") execute sequentially in order
- Tasks in a later sub-phase execute only after all tasks in the prior sub-phase are complete

---

### Step 4: Comprehensive E2E Testing

After ALL tasks in the epic are complete:

1. **Full quality suite:**
   ```bash
   pnpm test
   pnpm lint
   pnpm typecheck
   ```

2. **Integration verification:**
   - Run the full test suite one more time to confirm zero regressions
   - Verify all new tools are registered and functional
   - Verify all new files follow architecture standards (hexagonal layers, dependency flow)

3. **Cross-task integration check:**
   - Verify tasks that depend on earlier tasks in the epic work together
   - Run any epic-specific integration scenarios (from the epic backlog DoD)
   - Document total combined coverage for the epic

4. **Review all walkthroughs:**
   - Ensure every walkthrough is complete and accurate
   - Verify Files Changed sections match actual changes
   - Confirm Follow-ups are recorded

---

### Step 5: Manual Testing Questionnaire

After E2E testing passes, present manual testing instructions and a questionnaire to the user.

**Before the questionnaire, paste clear instructions in the chat:**

1. List every new tool/command/feature added by the epic
2. Provide step-by-step manual test scenarios for each
3. Include expected outputs/behaviors
4. List any configuration required (env vars, Docker, etc.)

**Then immediately (without pausing)** use the AskUserQuestion tool:
- Ask whether each critical feature was manually verified
- Ask about any UI/UX observations
- Ask about edge cases the user wants tested
- The questionnaire must NOT block execution — proceed to Step 6 regardless of response

---

### Step 6: Mark Epic Complete

1. Update epic status in `docs/backlog/EPxx-*.md`: `IN_PROGRESS` → `DONE`
2. Check all DoD checkboxes in the epic backlog
3. Commit: `chore(docs): mark EPxx as DONE`

---

### Step 7: Create Single Pull Request

Push and create a **single PR** for the entire epic:

```bash
git push -u origin feat/EPxx-<kebab-epic-name>
```

PR format:

```bash
gh pr create --title "feat(scope): EPxx — <Epic Title>" --body "$(cat <<'EOF'
## Summary

<Epic-level description of what was implemented>

## Tasks Completed

- [ ] Task NNNN: <Title> — <1-line summary>
- [ ] Task NNNN: <Title> — <1-line summary>
...

## Changes by Task

### Task NNNN: <Title>
- <Key change 1>
- <Key change 2>

### Task NNNN: <Title>
- <Key change 1>
- <Key change 2>

## New Tools/Features

| Tool | Purpose |
|------|---------|
| `tool_name` | <Description> |

## Testing

### Automated
- [x] `pnpm test` — all passing
- [x] `pnpm lint` — zero errors
- [x] `pnpm typecheck` — zero errors
- [x] Cross-task integration verified
- [x] Coverage >= 90% per task

### Manual Test Scenarios
- [ ] <Scenario 1>
- [ ] <Scenario 2>

## Quality Gates
- [x] Tests pass
- [x] Lint clean
- [x] Types clean
- [x] No secrets committed
- [x] All walkthroughs updated
- [x] All task files updated to DONE
- [x] Epic backlog updated to DONE

## Walkthroughs
- `docs/walkthroughs/NNNN-<title>.md`
- `docs/walkthroughs/NNNN-<title>.md`
EOF
)"
```

### Step 8: Report Result

Output:
- PR URL
- Epic summary (tasks completed, total tests, total coverage)
- Any follow-ups or tech debt discovered

---

## Task Document Rules

- The task document is **immutable**. Only update Status and DoD checkboxes.
- Implementation notes go in the walkthrough.
- Only modify files required by the task scope.
- Each task in the epic gets its own task spec, walkthrough, and conventional commit.

## Quality Gates

| Gate | Per Task | Per Epic |
|------|----------|----------|
| Tests pass | `pnpm test` | `pnpm test` (final) |
| Lint clean | `pnpm lint` | `pnpm lint` (final) |
| Types clean | `pnpm typecheck` | `pnpm typecheck` (final) |
| No secrets | Yes | Yes |
| Walkthrough | Per task | All reviewed |
| Coverage | >= 90% per task | Aggregate verified |
| Cross-task integration | N/A | Yes |
| Manual test questionnaire | N/A | Yes |

## Emphasis: Detail, Depth, and Testing

1. **Detail**: Every implementation must be thorough — no stubs, no TODOs, no "will implement later". Every function has full error handling, every interface has complete documentation.

2. **Depth**: Read and understand all existing related code before implementing. Integration must be real and tested, not theoretical.

3. **Testing**: TDD is mandatory. Every feature starts with a failing test. Coverage >= 90%. Integration tests verify cross-module behavior. E2E verification confirms the whole epic works together.

4. **Manual testing**: Before the PR, provide the user with detailed manual test instructions and a non-blocking questionnaire to capture their observations.
