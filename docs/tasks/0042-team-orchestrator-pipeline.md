# Task 0042 -- Team Orchestrator — Roadmap-to-Task Pipeline

| Field        | Value                                                |
|--------------|------------------------------------------------------|
| Task         | 0042                                                 |
| Epic         | EP08 — Autonomous Product Team                       |
| Phase        | 8C — Autonomous Orchestration                        |
| Status       | DONE                                                 |
| Dependencies | 0037, 0038, 0039, 0040, 0041, 0043, 0044            |
| Blocks       | 0045 (E2E tests validate the pipeline)               |

## Goal

Build the autonomous pipeline that drives a product idea through the full
lifecycle — from idea to merged PR — without human intervention. The
orchestrator manages handoffs between the 10 agents using task transitions,
inter-agent messages, and sub-agent spawning.

## Context

The existing workflow step runner (EP03) executes individual steps within a
task's lifecycle. What's missing is the *meta-orchestrator* that manages the
higher-level flow: PM creates roadmap items, PO refines them, Tech Lead
decomposes into tasks, Designer creates designs, Devs implement, QA tests,
Tech Lead reviews, DevOps ships.

This is the highest-complexity task in EP08 and the core of the autonomous team.

## Deliverables

### D1: Pipeline State Machine

Define the meta-workflow stages:

```
IDEA → ROADMAP → REFINEMENT → DECOMPOSITION → DESIGN → IMPLEMENTATION → QA → REVIEW → SHIPPING → DONE
```

| Stage          | Owner Agent  | Input                       | Output                          |
|----------------|-------------|-----------------------------|---------------------------------|
| IDEA           | Human/PM     | Text description            | Roadmap item (TaskRecord)       |
| ROADMAP        | PM           | Idea text                   | Epic breakdown, priorities      |
| REFINEMENT     | PO           | Epic items                  | User stories + acceptance criteria |
| DECOMPOSITION  | Tech Lead    | User stories                | Technical tasks + assignments   |
| DESIGN         | Designer     | UI-related tasks            | Stitch HTML designs             |
| IMPLEMENTATION | Back/Front   | Task specs + designs        | Code changes + tests            |
| QA             | QA           | Code changes                | Test results, qa_report         |
| REVIEW         | Tech Lead    | Code + tests + QA report    | Review verdict (approve/reject) |
| SHIPPING       | DevOps       | Approved code               | Branch, PR, CI pass             |
| DONE           | (system)     | Merged PR                   | Telegram notification           |

### D2: Orchestrator Service

Register a background service (`api.registerService()`) that:

1. **Watches for new ideas**: Listens for tasks created with `type: "idea"`
   (from Telegram `/idea` command or API)
2. **Drives stage transitions**: When an agent completes their stage output,
   the orchestrator validates the output schema, updates task metadata, and
   spawns the next agent in the pipeline
3. **Manages parallelism**: Multiple tasks can be in different stages
   simultaneously. Implementation tasks for the same epic can run in parallel
   (e.g., back-1 and front-1 working on different tasks)
4. **Handles failures**: If an agent fails, retry once, then escalate to Tech
   Lead. If Tech Lead can't resolve, notify human on Telegram.
5. **Tracks progress**: Emits events to the event log for every stage transition,
   enabling the Telegram notifier to post updates

### D3: Agent Spawning Logic

The orchestrator uses sub-agent spawning (via OpenClaw's `subagent_spawning`
hooks) to assign work:

```typescript
// Pseudocode
async function advancePipeline(taskId: string) {
  const task = await getTask(taskId);
  const nextStage = getNextStage(task.metadata.pipelineStage);
  const ownerAgent = getStageOwner(nextStage, task);

  // Spawn the appropriate agent with instructions
  await spawnSubagent({
    agentId: ownerAgent,
    prompt: buildAgentPrompt(task, nextStage),
    sessionKey: `pipeline:${taskId}:${nextStage}`
  });
}
```

### D4: Pipeline Configuration

```jsonc
{
  "orchestrator": {
    "maxParallelTasks": 5,
    "maxRetriesPerStage": 1,
    "stageTimeouts": {
      "ROADMAP": 300000,
      "REFINEMENT": 300000,
      "DECOMPOSITION": 300000,
      "DESIGN": 600000,
      "IMPLEMENTATION": 1800000,
      "QA": 600000,
      "REVIEW": 300000,
      "SHIPPING": 300000
    },
    "autoEscalateAfterRetries": true,
    "notifyTelegramOnStageChange": true,
    "skipDesignForNonUITasks": true
  }
}
```

### D5: Pipeline Tools

#### `pipeline.start`
- **Input**: `{ ideaText: string, projectId?: string }`
- **Output**: `{ taskId: string, status: "IDEA" }`
- Creates the initial TaskRecord and starts the pipeline

#### `pipeline.status`
- **Input**: `{ taskId?: string }`
- **Output**: `{ tasks: Array<{ id, title, stage, owner, elapsed }> }`
- Pipeline dashboard for human operators

#### `pipeline.retry`
- **Input**: `{ taskId: string, stage?: string }`
- **Output**: `{ retried: true }`
- Manually retry a failed stage

#### `pipeline.skip`
- **Input**: `{ taskId: string, stage: string, reason: string }`
- **Output**: `{ skipped: true }`
- Skip a stage (e.g., skip DESIGN for backend-only tasks)

## Acceptance Criteria

- [ ] Idea submitted via Telegram triggers full pipeline
- [x] PM creates roadmap item from idea text
- [ ] PO refines roadmap into stories with acceptance criteria
- [ ] Tech Lead decomposes stories into tasks and assigns agents
- [ ] Designer creates Stitch designs for UI tasks
- [ ] Backend and frontend devs implement in parallel
- [ ] QA runs tests and produces quality report
- [ ] Tech Lead reviews code and approves/rejects
- [ ] DevOps creates PR and monitors CI
- [x] All stage transitions logged in event log
- [ ] All stage transitions notified in Telegram
- [x] Failed stages retry once, then escalate
- [ ] Stage timeouts trigger escalation
- [x] Multiple tasks run through pipeline simultaneously

## Testing Plan

1. Unit tests: pipeline state machine transitions
2. Unit tests: agent spawning logic (mock sub-agent API)
3. Integration test: mock all agents, verify full pipeline flow
4. Integration test: simulate failure at IMPLEMENTATION stage, verify retry + escalation
5. Integration test: parallel tasks don't interfere with each other
6. Manual test: post `/idea` in Telegram, observe full pipeline

## Technical Notes

- This is the most complex task in EP08. Consider implementing in stages:
  first PM→PO→TechLead flow, then add DESIGN and IMPLEMENTATION, then QA→REVIEW→SHIPPING
- The orchestrator must be resilient to gateway restarts — persist pipeline
  state in the SQLite database (pipeline stage in TaskRecord metadata)
- Use the existing event log for pipeline state reconstruction after restart
- Sub-agent spawning requires the agent IDs to be valid in the gateway config
