# Pull Request Workflow

## Trigger
**Command:** `"pr"`

## Steps

### Step 1: Verify Branch
```bash
git branch --show-current
git log main..HEAD --oneline
```
Abort if on `main` or no commits ahead.

### Step 2: Gather Information
```bash
git diff main..HEAD
git status -sb
```

### Step 3: Push to Remote
```bash
git push -u origin <branch-name>
```

### Step 4: Create PR
```bash
gh pr create --title "<type>(<scope>): <description>" --body "$(cat <<'EOF'
## Summary
<Brief description>

## Changes
- <Change 1>
- <Change 2>

## Testing
- [ ] `pnpm test`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`

## Quality Gates
- [x] Tests pass
- [x] Lint clean
- [x] No secrets committed
- [x] Walkthrough updated
EOF
)"
```

### Step 5: Report Result
Output PR URL to user.
