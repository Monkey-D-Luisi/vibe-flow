# Code Review Workflow

## Trigger
User asks to review a PR or address PR comments.

## Phases

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

### Phase D: Verify CI
1. Wait for CI: `gh pr checks <PR_NUMBER> --watch`
2. Fix any failures
3. Merge when green: `gh pr merge <PR_NUMBER> --rebase --delete-branch`
