# Code Review Workflow

## Trigger
User asks to review a PR or address PR comments.

## Execution Contract

Present a review plan and get user approval before making code changes. For any doubt about how to address a finding, use the questionnaire tool (always include a free-text field).

## Phases

### Phase 0: Plan & Confirm
1. Fetch PR diff and review comments
2. Present to the user: summary of changes, identified issues, proposed fix approach for each
3. Wait for user approval on which items to fix and how
4. Proceed to detailed phases only after confirmation

### Phase A: Independent Review
1. Fetch PR diff: `gh pr diff <PR_NUMBER>`
2. Review against: TypeScript standards, architecture, testing, security
3. Compile findings with severity: MUST_FIX, SHOULD_FIX, NIT

### Phase B: GitHub Comment Resolution
1. Fetch all review comments from GitHub
2. Analyze each comment critically
3. Classify: MUST_FIX, SHOULD_FIX, SUGGESTION, QUESTION, OUT_OF_SCOPE, FALSE_POSITIVE

### Phase C: Execute Fixes
1. Create `docs/tasks/cr-NNNN-*.md` and `docs/walkthroughs/cr-NNNN-*.md`
2. Implement fixes for MUST_FIX and SHOULD_FIX items
3. Respond to questions and document rationale for skipped items
4. Commit and push

### Phase D: Verify CI & Manual Smoke Test
1. Wait for CI: `gh pr checks <PR_NUMBER> --watch`
2. Fix any failures
3. Deploy on Docker for manual testing:
   a. Build images: `docker compose -f docker-compose.yml build`
   b. Start services: `docker compose -f docker-compose.yml up -d`
   c. Verify services are healthy: `docker compose -f docker-compose.yml ps`
   d. If deployment fails, diagnose and fix before proceeding
4. Design 3-5 manual smoke test scenarios that exercise the core behaviour introduced by the PR
5. Write a temporary test script, run it in-process (`npx tsx <script>`), and print results to chat
6. Present results in a summary table (test name, expected, actual, PASS/FAIL)
7. Ask the user via questionnaire to confirm results or flag issues (options: "All pass, merge", "Issues found", "Skip manual test")
8. If user confirms pass → merge: `gh pr merge <PR_NUMBER> --rebase --delete-branch`
9. If user reports issues → investigate and loop back to Phase C
10. Stop Docker services: `docker compose -f docker-compose.yml down`
11. Clean up any temporary test files before merge
