# Troubleshooting Guide

This guide covers common issues and their solutions when working with the Agents & MCPs project.

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Database Issues](#database-issues)
3. [Test Issues](#test-issues)
4. [Quality Gate Issues](#quality-gate-issues)
5. [MCP Server Issues](#mcp-server-issues)
6. [GitHub Integration Issues](#github-integration-issues)
7. [Build and Compilation Issues](#build-and-compilation-issues)
8. [Performance Issues](#performance-issues)

---

## Installation Issues

### Issue: `pnpm: command not found`

**Cause**: pnpm is not installed globally.

**Solution**:
```bash
npm install -g pnpm
```

Verify installation:
```bash
pnpm --version
```

---

### Issue: Build script approval warnings

**Symptoms**:
```
Warning: Ignored build scripts: core-js, esbuild.
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

**Solution**:
```bash
pnpm approve-builds
```

When prompted, select both `core-js` and `esbuild` using the space bar, then press Enter.

---

### Issue: Husky hooks not working

**Cause**: Husky not initialized after fresh clone.

**Solution**:
```bash
pnpm prepare
```

This reinstalls Git hooks.

---

### Issue: Permission denied on Git hooks

**Cause**: Hook files not executable.

**Solution**:
```bash
chmod +x .husky/pre-commit
chmod +x .husky/pre-push
chmod +x .husky/commit-msg
```

---

## Database Issues

### Issue: SQLite database locked

**Symptoms**:
```
Error: database is locked
```

**Cause**: Multiple processes accessing the database simultaneously, or a crashed process left a lock.

**Solution 1**: Stop all processes
```bash
# Find and kill all node processes
pkill -f "node.*task-mcp"
pkill -f "tsx.*task-mcp"
```

**Solution 2**: Remove WAL files
```bash
rm -f services/task-mcp/data/tasks.db-wal
rm -f services/task-mcp/data/tasks.db-shm
```

**Solution 3**: Check for orphaned processes
```bash
lsof services/task-mcp/data/tasks.db
```

---

### Issue: Migration errors on startup

**Symptoms**:
```
Error: table already exists
```

**Cause**: Database schema mismatch or partial migration.

**Solution**:
```bash
# Backup current database
cp services/task-mcp/data/tasks.db services/task-mcp/data/tasks.db.backup

# Remove database and restart (will recreate)
rm services/task-mcp/data/tasks.db
pnpm --filter @agents/task-mcp dev
```

---

### Issue: Optimistic locking conflicts

**Symptoms**:
```
Error 409: Revision mismatch
```

**Cause**: Task was modified by another process between read and update.

**Solution**: This is expected behavior. Retry the operation:
1. Re-fetch the task with `task.get`
2. Apply your changes to the fresh copy
3. Update with the new `rev` value

---

### Issue: Database corruption

**Symptoms**:
```
Error: database disk image is malformed
```

**Solution 1**: Try to repair
```bash
sqlite3 services/task-mcp/data/tasks.db "PRAGMA integrity_check;"
```

**Solution 2**: Restore from backup
```bash
cp services/task-mcp/data/tasks.db.backup services/task-mcp/data/tasks.db
```

**Solution 3**: Start fresh (development only)
```bash
rm services/task-mcp/data/tasks.db
```

---

## Test Issues

### Issue: Tests failing on Git hooks

**Symptoms**:
```
[pre-commit] Tests failed
```

**Cause**: Code changes broke tests.

**Solution**: Fix the tests before committing. To bypass temporarily (⚠️ use with caution):
```bash
SKIP_TESTS=1 git commit -m "your message"
```

**Note**: This should only be used in CI environments or emergencies.

---

### Issue: Watch mode not detecting changes

**Cause**: File system watcher limitations.

**Solution 1**: Increase watchers limit (Linux)
```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

**Solution 2**: Restart watch mode
```bash
# Stop the test watcher (Ctrl+C)
# Restart it
pnpm --filter @agents/task-mcp test -- --watch
```

---

### Issue: Coverage reports missing

**Cause**: Tests not run with coverage flag.

**Solution**:
```bash
pnpm --filter @agents/task-mcp test -- --coverage
```

Check the generated report:
```bash
open services/task-mcp/coverage/lcov-report/index.html
```

---

### Issue: Flaky tests

**Symptoms**: Tests pass sometimes, fail other times.

**Common causes**:
- Race conditions in async code
- Timing-dependent assertions
- Shared state between tests
- Database state not cleaned up

**Solutions**:
1. Use `beforeEach` to clean state:
```typescript
beforeEach(() => {
  // Clean database or mock state
});
```

2. Add proper async/await:
```typescript
await expect(asyncFunction()).resolves.toBe(expected);
```

3. Increase timeouts for slow operations:
```typescript
test('slow operation', async () => {
  // ...
}, 10000); // 10 second timeout
```

---

## Quality Gate Issues

### Issue: Coverage below threshold

**Symptoms**:
```
COVERAGE_BELOW: Coverage 0.76 < 0.80 (major)
```

**Solution**: Add more tests
```bash
# Check which files need coverage
cat .qreport/coverage.json | jq '.files[] | select(.coverage < 0.8)'

# Write tests for uncovered code
# Re-run coverage
pnpm q:coverage

# Verify gate passes
pnpm q:gate --source artifacts --scope major
```

---

### Issue: Lint errors blocking merge

**Symptoms**:
```
LINT_ERRORS: 5 errors found
```

**Solution**:
```bash
# Check errors
pnpm --filter @agents/task-mcp run lint

# Auto-fix what's possible
pnpm --filter @agents/task-mcp run lint:fix

# Fix remaining errors manually
# Verify
pnpm q:lint
```

---

### Issue: Complexity too high

**Symptoms**:
```
COMPLEXITY_HIGH: avg 6.5 > 5.0
```

**Solution**: Refactor complex functions
1. Identify complex functions:
```bash
cat .qreport/complexity.json | jq '.functions[] | select(.cyclomatic > 10)'
```

2. Refactoring strategies:
   - Extract helper functions
   - Reduce nested conditionals
   - Use early returns
   - Apply guard clauses
   - Simplify boolean logic

3. Verify improvement:
```bash
pnpm q:complexity
```

---

### Issue: RGR log missing

**Symptoms**:
```
RGR_MISSING: Red-Green-Refactor log required for dev → review
```

**Solution**: Update the TaskRecord with TDD logs:
```typescript
await task.update({
  id: taskId,
  if_rev: currentRev,
  patch: {
    red_green_refactor_log: [
      "Red: Added failing test for user validation",
      "Green: Implemented basic validation logic",
      "Refactor: Extracted validation to helper function"
    ]
  }
});
```

---

## MCP Server Issues

### Issue: Task MCP server won't start

**Cause 1**: Port already in use

**Solution**:
```bash
# Find process using the port
lsof -i :3000  # Replace with actual port

# Kill the process
kill -9 <PID>
```

**Cause 2**: Missing dependencies

**Solution**:
```bash
cd services/task-mcp
pnpm install
```

---

### Issue: Quality MCP server port conflict

**Symptoms**:
```
Error: listen EADDRINUSE: address already in use :::8080
```

**Solution**: Use a different port
```bash
PORT=8081 pnpm --filter @agents/quality-mcp-server dev
```

Or stop the existing process:
```bash
lsof -i :8080
kill -9 <PID>
```

---

### Issue: MCP tools not responding

**Cause**: Server not fully initialized.

**Solution**: Check server logs for errors
```bash
# Server should output:
# Task MCP server started
```

Verify the database is accessible:
```bash
sqlite3 services/task-mcp/data/tasks.db "SELECT COUNT(*) FROM task_records;"
```

---

## GitHub Integration Issues

### Issue: GitHub authentication fails

**Symptoms**:
```
Error: Bad credentials
```

**Solution 1**: Verify GitHub token
```bash
# For PAT
echo $PR_TOKEN

# For GitHub App
echo $GH_APP_ID
echo $GH_APP_INSTALLATION_ID
```

**Solution 2**: Check token scopes
Required scopes:
- `repo` (full)
- `read:org`
- `write:discussion`
- `project` (for Projects v2)

**Solution 3**: Regenerate token
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with required scopes
3. Update environment variable

---

### Issue: PR creation fails

**Symptoms**:
```
Error: Reference already exists
```

**Cause**: Branch with the same name already exists.

**Solution**:
```bash
# List existing branches
git branch -a | grep feature/

# Delete old branch
git branch -D feature/old-branch
git push origin --delete feature/old-branch
```

---

### Issue: Labels not syncing

**Cause**: Labels don't exist in repository.

**Solution**: Create missing labels manually or via script:
```bash
# Check required labels in config
cat services/task-mcp/config/github.pr-bot.json | jq '.labels'

# Create labels via GitHub UI or API
```

---

### Issue: Project board not updating

**Cause**: Invalid project configuration or insufficient permissions.

**Solution**:
1. Verify Project v2 ID and field configuration
2. Ensure token has `project` scope
3. Check project status values match config:
   - `To Do`
   - `In Progress`
   - `In Review`
   - `Done`

---

## Build and Compilation Issues

### Issue: TypeScript compilation errors

**Symptoms**:
```
error TS2322: Type 'X' is not assignable to type 'Y'
```

**Solution 1**: Ensure types are correct
```bash
cd services/task-mcp
npx tsc --noEmit
```

**Solution 2**: Update dependencies
```bash
pnpm install
```

**Solution 3**: Clear build cache
```bash
rm -rf node_modules/.cache
rm -rf dist/
pnpm install
```

---

### Issue: Module not found errors

**Symptoms**:
```
Error: Cannot find module '@agents/schemas'
```

**Cause**: Workspace dependencies not linked.

**Solution**:
```bash
# From monorepo root
pnpm install

# Verify workspace links
pnpm list -r
```

---

### Issue: ESM/CommonJS compatibility errors

**Symptoms**:
```
Error [ERR_REQUIRE_ESM]: require() of ES Module
```

**Solution**: Ensure `"type": "module"` in package.json
```json
{
  "type": "module",
  ...
}
```

Use `.js` extensions in imports:
```typescript
import { foo } from './module.js';
```

---

## Performance Issues

### Issue: Tests running slowly

**Solution 1**: Run tests in parallel
```bash
pnpm test:ci  # Uses --runInBand for CI
pnpm test     # Runs in parallel by default
```

**Solution 2**: Reduce test timeout
```typescript
// vitest.config.ts
export default {
  test: {
    testTimeout: 5000  // Reduce from 10000
  }
};
```

---

### Issue: High memory usage

**Cause**: Too many concurrent operations or memory leak.

**Solution 1**: Increase Node memory limit
```bash
NODE_OPTIONS="--max-old-space-size=4096" pnpm test
```

**Solution 2**: Profile memory usage
```bash
node --inspect node_modules/.bin/vitest run
```

Open Chrome DevTools → Profiler → Take heap snapshot

---

### Issue: Database queries slow

**Solution**: Add indexes
```sql
-- Check missing indexes
EXPLAIN QUERY PLAN SELECT * FROM task_records WHERE status = 'dev';

-- Add index if needed
CREATE INDEX IF NOT EXISTS idx_task_custom ON task_records(field);
```

---

## Debugging Tips

### Enable Debug Logging

```bash
# Task MCP
DEBUG=task-mcp:* pnpm --filter @agents/task-mcp dev

# Quality MCP
DEBUG=quality-mcp:* pnpm --filter @agents/quality-mcp-server dev
```

### Inspect Database State

```bash
sqlite3 services/task-mcp/data/tasks.db
```

Useful queries:
```sql
-- View recent events
SELECT * FROM event_log ORDER BY created_at DESC LIMIT 10;

-- Check state consistency
SELECT tr.id, tr.status, os.current 
FROM task_records tr 
LEFT JOIN orchestrator_state os ON tr.id = os.task_id;

-- Find orphaned leases
SELECT * FROM leases WHERE expires_at < datetime('now');
```

### Check CI Logs

View detailed CI logs in GitHub Actions:
1. Go to the PR
2. Click "Checks" tab
3. Select failing workflow
4. Expand failed steps

---

## Still Stuck?

If none of these solutions work:

1. **Search existing issues**: [GitHub Issues](https://github.com/Monkey-D-Luisi/agents-mcps/issues)

2. **Check documentation**:
   - [README.md](../README.md)
   - [GETTING_STARTED.md](GETTING_STARTED.md)
   - [CONTRIBUTING.md](../CONTRIBUTING.md)

3. **Enable verbose logging** and collect diagnostic info:
```bash
# Collect system info
node --version
pnpm --version
git --version
sqlite3 --version

# Check environment
env | grep -i github
env | grep -i node

# Export logs
pnpm --filter @agents/task-mcp dev > server.log 2>&1
```

4. **Open a new issue** with:
   - Clear description of the problem
   - Steps to reproduce
   - Error messages and logs
   - Environment details (OS, Node version, etc.)
   - What you've already tried

---

## Preventive Measures

To avoid issues:

1. **Keep dependencies updated**:
```bash
pnpm update
```

2. **Run quality checks regularly**:
```bash
pnpm test:ci
pnpm q:gate --source artifacts --scope minor
```

3. **Clean build artifacts periodically**:
```bash
rm -rf node_modules
rm -rf dist
rm -rf coverage
pnpm install
```

4. **Monitor database size**:
```bash
du -h services/task-mcp/data/tasks.db
```

5. **Review Git hooks**:
```bash
cat .husky/pre-commit
cat .husky/pre-push
```

Happy debugging! 🐛🔧
