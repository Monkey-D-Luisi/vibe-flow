# Error Recovery Patterns

> How agents should handle failures during task execution. This document covers
> every failure mode in the product-team plugin and the correct recovery action.

---

## 1. Lease Errors

### LeaseConflictError

**When:** An agent tries to transition a task that another agent holds the lease for.

**Message:** `Lease conflict for task {taskId}: currently held by {currentHolder}`

**Recovery:**
1. Check who holds the lease via `workflow.state.get`
2. If the other agent is still active, wait for it to finish
3. If the lease has expired (older than 5 minutes default), the system will
   auto-expire it on the next operation. Retry after a short delay.
4. If stuck, an agent with the same `agentId` as the holder can release it

```typescript
// Example: retry after lease conflict
try {
  await taskTransition({ id, toStatus, agentId, rev });
} catch (error) {
  if (error.name === 'LeaseConflictError') {
    // Wait for lease to expire (default: 5 minutes)
    // or ask the current holder's agent to release
  }
}
```

### LeaseNotHeldError

**When:** An agent tries to release a lease it doesn't own.

**Message:** `Agent {agentId} does not hold lease for task {taskId}`

**Recovery:** This typically means the lease expired while the agent was working.
The agent should re-acquire the lease before continuing.

---

## 2. State Machine Errors

### InvalidTransitionError

**When:** An agent attempts a transition not in the valid transition map.

**Message:** `Invalid transition for task {taskId}: {from} -> {to}`

**Valid transitions:**
```
backlog    -> grooming
grooming   -> design, in_progress
design     -> in_progress
in_progress -> in_review
in_review  -> qa, in_progress
qa         -> done, in_progress
done       -> (terminal)
```

**Recovery:** Check the current status via `task.get` and use the correct
target status. Common mistake: trying to go from `in_progress` directly to
`qa` (must go through `in_review` first).

### TransitionGuardError

**When:** Required evidence is missing or insufficient for a guarded transition.

**Message:** `Transition guard failed for task {taskId} ({from} -> {to}): {reasons}`

**Recovery:**
1. Read the `reasons` array -- each entry explains exactly what's missing
2. Use `workflow.state.get` to see the full guard matrix
3. Provide the missing evidence via `task.update` (set metadata) or
   `workflow.step.run` (run the appropriate role step)
4. Retry the transition

See [`docs/transition-guard-evidence.md`](transition-guard-evidence.md) for
the complete list of required evidence per transition.

---

## 3. Optimistic Locking Errors

### StaleRevisionError

**When:** Two agents try to update the same task concurrently, and the second
one has a stale `rev` value.

**Message:** `Stale revision for task {taskId}: expected rev={expected}, actual rev={actual}`

**Recovery:**
1. Re-read the task via `task.get` to get the current `rev`
2. Merge your changes with the current state (if applicable)
3. Retry the update with the fresh `rev`

```typescript
// Example: handle stale revision
try {
  await taskUpdate({ id, rev: 2, title: 'New title' });
} catch (error) {
  if (error.name === 'StaleRevisionError') {
    const { task } = await taskGet({ id });
    await taskUpdate({ id, rev: task.rev, title: 'New title' });
  }
}
```

**Important:** The same applies to `orchestratorRev` in `workflow.step.run`.
Always fetch the latest state before retrying.

---

## 4. Validation Errors

### ValidationError

**When:** Tool input doesn't match the TypeBox schema.

**Message:** `Validation failed: {details with JSON path}`

**Recovery:** Fix the input to match the schema. The error message includes
the specific path that failed (e.g., `title: must be string, got number`).

Common mistakes:
- Missing required fields (`title`, `id`, `agentId`, `rev`)
- `rev` is a string instead of number
- `scope` has an invalid value (must be `major`, `minor`, or `patch`)
- `tags` array exceeds 20 items
- `title` exceeds 500 characters

---

## 5. Database Errors

### Database locked

**When:** SQLite write contention under concurrent access.

**Mitigation (already in place):**
- WAL mode enabled at connection time
- 5-second busy timeout configured
- All multi-step mutations wrapped in transactions

**Recovery:** If you hit this error, it means the busy timeout was exceeded.
Retry the operation. If it persists, check for stuck processes holding the
database open.

### Database path escape

**When:** `dbPath` in plugin config resolves outside workspace root.

**Message:** `Database path "{path}" escapes workspace root`

**Recovery:** Fix the `pluginConfig.dbPath` to be a relative path within the
workspace or use `:memory:` for testing.

---

## 6. Workflow Step Errors

### Step execution failure

**When:** A step in `workflow.step.run` fails (e.g., invalid `schemaKey`,
schema validation failure on output).

**Recovery:**
- For `llm-task` steps: verify the `schemaKey` is one of `po_brief`,
  `architecture_plan`, `dev_result`, `qa_report`, `review_result`
- For `shell`/`script` steps: check the output format matches expectations
- Note: `workflow.step.run` executes all steps and an optional transition
  in a single transaction. If any part fails, nothing is committed.

### Transaction atomicity

**When:** `workflow.step.run` is called with `toStatus` and `orchestratorRev`.
The steps and transition run in a single outer transaction.

**If the transition guard fails after steps succeed:**
- The entire transaction rolls back (steps are NOT persisted)
- The agent must fix the guard issue and re-run everything

**Recovery:** Always include all evidence-providing steps AND the transition
in a single `workflow.step.run` call rather than running steps and then
transitioning separately.

---

## 7. General Recovery Pattern

For any unhandled error, the recommended pattern is:

1. **Log the error** in the walkthrough (for human review)
2. **Re-read current state** via `task.get` and `workflow.state.get`
3. **Retry once** with corrected parameters
4. **If still failing**, skip the operation and document the blocker
5. **Never stop** the workflow -- move on to the next step and flag the issue

This aligns with the autonomous execution rule in `.agent.md`:
> If a tool call fails or returns no data: retry once, then skip and document
> in the walkthrough. Never stop.
