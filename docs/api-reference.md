# Product-Team API Reference

This document lists every registered tool from
`extensions/product-team/src/tools/index.ts`.

## Tool Index

| Tool | Primary Agent(s) | Purpose |
|------|-------------------|---------|
| `task.create` | pm | Create a new task record |
| `task.get` | pm, tech-lead, dev, qa, devops | Fetch one task with orchestrator state and cost summary |
| `task.search` | pm, tech-lead, devops | Search tasks by filters |
| `task.update` | pm, tech-lead, dev, qa, po | Update mutable task fields with optimistic locking |
| `task.transition` | pm, tech-lead, dev, qa, po, devops | Move task through lifecycle with guards |
| `workflow.step.run` | tech-lead, dev, qa, po, designer | Persist structured workflow step outputs |
| `workflow.state.get` | tech-lead, dev, qa, po, designer, devops | Read workflow state/history/guard matrix |
| `workflow.events.query` | pm, tech-lead, qa, devops | Query event log with filters and aggregates |
| `quality.tests` | dev, qa | Run tests and persist QA evidence |
| `quality.coverage` | dev, qa | Parse coverage reports and persist metrics |
| `quality.lint` | dev, qa | Run lint engine and persist metrics |
| `quality.complexity` | dev, qa | Compute complexity metrics and persist |
| `quality.gate` | tech-lead, dev, qa | Evaluate quality policy from metadata/evidence |
| `vcs.branch.create` | devops | Create task branch (idempotent) |
| `vcs.pr.create` | devops | Create pull request (idempotent) |
| `vcs.pr.update` | devops | Update pull request (idempotent) |
| `vcs.label.sync` | devops | Ensure repository labels exist/update |
| `project.list` | pm, tech-lead, devops | List registered projects |
| `project.switch` | pm, tech-lead, devops | Change active project context |
| `project.register` | (management only) | Register a new project workspace |
| `team.message` | all agents | Post a message to another agent's inbox |
| `team.inbox` | all agents | Read messages in an agent's inbox |
| `team.reply` | all agents | Reply to a team message |
| `team.status` | all agents | Update this agent's status |
| `team.assign` | pm, tech-lead | Assign work to a specific agent |
| `decision.evaluate` | all agents | Evaluate a decision (auto/escalate/pause/retry) |
| `decision.log` | tech-lead, pm | Query decision audit records |
| `pipeline.start` | pm | Start the roadmap-to-release pipeline |
| `pipeline.status` | pm, tech-lead, devops | Get pipeline status and step results |
| `pipeline.retry` | tech-lead | Retry a failed pipeline step |
| `pipeline.skip` | tech-lead | Skip a pipeline step with justification |

## Task Tools

### `task.create`

- Parameters: `title`, optional `scope`, `assignee`, `tags`, `metadata`
- Returns: `{ task }`

```json
{
  "input": {
    "title": "Implement cost tracking",
    "scope": "major",
    "tags": ["ep06", "hardening"]
  },
  "output": {
    "task": {
      "id": "01HARDENINGTASK0001",
      "status": "backlog",
      "rev": 0
    }
  }
}
```

### `task.get`

- Parameters: `id`
- Returns: `{ task, orchestratorState, costSummary }`

```json
{
  "input": {
    "id": "01HARDENINGTASK0001"
  },
  "output": {
    "task": {
      "id": "01HARDENINGTASK0001",
      "title": "Implement cost tracking"
    },
    "orchestratorState": {
      "current": "in_progress",
      "rev": 2
    },
    "costSummary": {
      "totalTokens": 420,
      "totalDurationMs": 1132,
      "eventCount": 7
    }
  }
}
```

### `task.search`

- Parameters: optional `status`, `assignee`, `tags`, `limit`, `offset`
- Returns: `{ tasks, count }`

```json
{
  "input": {
    "status": "in_review",
    "limit": 10
  },
  "output": {
    "tasks": [
      {
        "id": "01HARDENINGTASK0001",
        "status": "in_review"
      }
    ],
    "count": 1
  }
}
```

### `task.update`

- Parameters: `id`, `rev`, optional `title`, `scope`, `assignee`, `tags`, `metadata`
- Returns: `{ task }`

```json
{
  "input": {
    "id": "01HARDENINGTASK0001",
    "rev": 2,
    "metadata": {
      "budget": {
        "maxTokens": 12000,
        "maxDurationMs": 600000
      }
    }
  },
  "output": {
    "task": {
      "id": "01HARDENINGTASK0001",
      "rev": 3
    }
  }
}
```

### `task.transition`

- Parameters: `id`, `toStatus`, `agentId`, `rev` (`rev` is orchestrator revision)
- Returns: transition result with updated task/state and transition event

```json
{
  "input": {
    "id": "01HARDENINGTASK0001",
    "toStatus": "in_review",
    "agentId": "dev",
    "rev": 4
  },
  "output": {
    "task": {
      "status": "in_review"
    },
    "orchestratorState": {
      "current": "in_review",
      "rev": 5
    },
    "event": {
      "eventType": "task.transition"
    }
  }
}
```

## Workflow Tools

### `workflow.step.run`

- Parameters: `id`, `agentId`, `rev`, `steps[]`, optional `toStatus`, `orchestratorRev`
- Returns: `{ task, steps, transition }`

```json
{
  "input": {
    "id": "01HARDENINGTASK0001",
    "agentId": "dev",
    "rev": 3,
    "steps": [
      {
        "id": "dev-step-1",
        "type": "llm-task",
        "role": "dev",
        "schemaKey": "dev_result",
        "output": {
          "diff_summary": "Added hardening controls",
          "metrics": {
            "coverage": 85,
            "lint_clean": true
          },
          "red_green_refactor_log": [
            "red",
            "green"
          ]
        },
        "cost": {
          "model": "claude-sonnet-4",
          "inputTokens": 1200,
          "outputTokens": 500,
          "durationMs": 2200
        }
      }
    ]
  },
  "output": {
    "steps": [
      {
        "stepId": "dev-step-1",
        "stepType": "llm-task"
      }
    ],
    "transition": null
  }
}
```

### `workflow.state.get`

- Parameters: `id`
- Returns: `{ task, orchestratorState, history, transitionGuards }`

```json
{
  "input": {
    "id": "01HARDENINGTASK0001"
  },
  "output": {
    "orchestratorState": {
      "current": "in_progress"
    },
    "history": [],
    "transitionGuards": {
      "matrix": [],
      "config": {
        "coverageByScope": {
          "major": 80,
          "minor": 70,
          "patch": 70
        },
        "maxReviewRounds": 3
      }
    }
  }
}
```

### `workflow.events.query`

- Parameters: optional `taskId`, `agentId`, `eventType`, `since`, `until`, `limit`, `offset`
- Returns: `{ events, total, aggregates }`

```json
{
  "input": {
    "taskId": "01HARDENINGTASK0001",
    "eventType": "cost.tool",
    "limit": 20
  },
  "output": {
    "events": [],
    "total": 0,
    "aggregates": {
      "byAgent": {},
      "byEventType": {},
      "avgCycleTimeMs": null
    }
  }
}
```

## Quality Tools

### `quality.tests`

- Parameters: `taskId`, `agentId`, `rev`, optional `command`, `workingDir`, `timeoutMs`
- Returns: `{ task, output }`

```json
{
  "input": {
    "taskId": "01HARDENINGTASK0001",
    "agentId": "qa",
    "rev": 3
  },
  "output": {
    "output": {
      "total": 120,
      "passed": 120,
      "failed": 0
    }
  }
}
```

### `quality.coverage`

- Parameters: `taskId`, `agentId`, `rev`, optional `summaryPath`, `lcovPath`, `workingDir`, `format`, `exclude`
- Returns: `{ task, output }`

```json
{
  "input": {
    "taskId": "01HARDENINGTASK0001",
    "agentId": "dev",
    "rev": 3,
    "format": "auto"
  },
  "output": {
    "output": {
      "total": {
        "lines": 0.89
      }
    }
  }
}
```

### `quality.lint`

- Parameters: `taskId`, `agentId`, `rev`, optional `engine`, `command`, `paths`, `workingDir`, `timeoutMs`
- Returns: `{ task, output }`

```json
{
  "input": {
    "taskId": "01HARDENINGTASK0001",
    "agentId": "dev",
    "rev": 3,
    "engine": "eslint"
  },
  "output": {
    "output": {
      "summary": {
        "errors": 0,
        "warnings": 0
      }
    }
  }
}
```

### `quality.complexity`

- Parameters: `taskId`, `agentId`, `rev`, optional `globs`, `exclude`, `engine`, `workingDir`
- Returns: `{ task, output }`

```json
{
  "input": {
    "taskId": "01HARDENINGTASK0001",
    "agentId": "dev",
    "rev": 3,
    "engine": "tsmorph"
  },
  "output": {
    "output": {
      "summary": {
        "maxCyclomatic": 7
      }
    }
  }
}
```

### `quality.gate`

- Parameters: `taskId`, `agentId`, optional `scope`, `policy`, `autoTune`, `alerts`
- `autoTune` (optional) fields: `enabled`, `historyWindow`, `minSamples`,
  `smoothingFactor`, `maxDeltas`, `bounds`
- `alerts` (optional) fields: `enabled`, `thresholds.coverageDropPct`,
  `thresholds.complexityRise`, `noise.cooldownEvents`
- Returns: `{ task, output, effectivePolicy, tuning, alerting }`
- Persists gate verdict in `task.metadata.quality.gate`
- Emits `quality.gate` events with metric snapshots, optional tuning summary,
  and optional alerting summary (`alerts`, `suppressed`, `emittedKeys`)

```json
{
  "input": {
    "taskId": "01HARDENINGTASK0001",
    "agentId": "dev",
    "scope": "major",
    "autoTune": {
      "enabled": true,
      "historyWindow": 50,
      "minSamples": 5,
      "smoothingFactor": 0.25,
      "maxDeltas": {
        "coverageMinPct": 4,
        "lintMaxWarnings": 6,
        "complexityMaxCyclomatic": 4
      }
    },
    "alerts": {
      "enabled": true,
      "thresholds": {
        "coverageDropPct": 5,
        "complexityRise": 3
      },
      "noise": {
        "cooldownEvents": 5
      }
    }
  },
  "output": {
    "task": {
      "id": "01HARDENINGTASK0001",
      "rev": 8
    },
    "output": {
      "passed": true,
      "metrics": {
        "tests": {
          "total": 120,
          "failed": 0
        },
        "coverage": {
          "lines": 85.5
        },
        "lint": {
          "errors": 0,
          "warnings": 1
        },
        "complexity": {
          "avgCyclomatic": 3.8,
          "maxCyclomatic": 7
        }
      },
      "violations": [],
      "alerts": [
        {
          "key": "coverageDropPct:major:88:82:5",
          "metric": "coverageDropPct",
          "scope": "major",
          "direction": "decrease",
          "baseline": 88,
          "observed": 82,
          "delta": 6,
          "threshold": 5,
          "reason": "Coverage dropped by 6 from baseline 88 to 82 (threshold 5)"
        }
      ]
    },
    "effectivePolicy": {
      "coverageMinPct": 82,
      "lintMaxErrors": 0,
      "lintMaxWarnings": 8,
      "complexityMaxCyclomatic": 14,
      "testsRequired": true,
      "testsMustPass": true,
      "rgrMaxCount": 0
    },
    "tuning": {
      "applied": true,
      "sampleCount": 12,
      "adjustments": [
        {
          "metric": "coverageMinPct",
          "before": 80,
          "after": 82,
          "median": 88,
          "samples": 12
        }
      ]
    },
    "alerting": {
      "enabled": true,
      "evaluatedAt": "2026-02-26T10:05:00.000Z",
      "thresholds": {
        "coverageDropPct": 5,
        "complexityRise": 3
      },
      "cooldownEvents": 5,
      "baseline": {
        "coveragePct": 88,
        "maxCyclomatic": 8,
        "scope": "major",
        "timestamp": "2026-02-26T09:55:00.000Z"
      },
      "alerts": [
        {
          "key": "coverageDropPct:major:88:82:5",
          "metric": "coverageDropPct",
          "scope": "major",
          "direction": "decrease",
          "baseline": 88,
          "observed": 82,
          "delta": 6,
          "threshold": 5,
          "reason": "Coverage dropped by 6 from baseline 88 to 82 (threshold 5)"
        }
      ],
      "emittedKeys": [
        "coverageDropPct:major:88:82:5"
      ],
      "suppressed": []
    }
  }
}
```

## VCS Tools

### `vcs.branch.create`

- Parameters: `taskId`, `slug`, optional `base`
- Returns: branch creation result from branch service

```json
{
  "input": {
    "taskId": "01HARDENINGTASK0001",
    "slug": "hardening-cost-tracking"
  },
  "output": {
    "branchName": "task/01hardeningtask0001-hardening-cost-tracking",
    "created": true
  }
}
```

### `vcs.pr.create`

- Parameters: `taskId`, `title`, optional `body`, `labels`, `base`, `head`, `draft`
- Returns: PR payload from PR service + `bodyGenerated`
- Side effect (when `github.prBot.enabled=true`): `after_tool_call` automation
  derives metadata labels (`scope:*`, `epic:*`, `area:*`), assigns configured
  reviewers, and posts a status checklist comment.

```json
{
  "input": {
    "taskId": "01HARDENINGTASK0001",
    "title": "feat(product-team): implement hardening",
    "labels": ["ep06", "hardening"]
  },
  "output": {
    "number": 201,
    "url": "https://github.com/org/repo/pull/201",
    "bodyGenerated": true
  }
}
```

### `vcs.pr.update`

- Parameters: `taskId`, `prNumber`, optional `title`, `body`, `labels`, `state`
- Returns: updated PR payload

```json
{
  "input": {
    "taskId": "01HARDENINGTASK0001",
    "prNumber": 201,
    "labels": ["ep06", "ready-for-review"]
  },
  "output": {
    "number": 201,
    "updated": true
  }
}
```

### `vcs.label.sync`

- Parameters: `taskId`, `labels[]` (`name`, `color`, optional `description`)
- Returns: sync summary from label service

```json
{
  "input": {
    "taskId": "01HARDENINGTASK0001",
    "labels": [
      {
        "name": "ep06",
        "color": "0052CC",
        "description": "Hardening epic"
      }
    ]
  },
  "output": {
    "taskId": "01HARDENINGTASK0001",
    "synced": 1
  }
}
```

## Project Tools

### `project.list`

- Parameters: none
- Returns: `{ projects, activeProject }`

### `project.switch`

- Parameters: `projectId`
- Returns: `{ switched, activeProject }`

### `project.register`

- Parameters: `id`, `name`, `repo`, `workspace`, optional `defaultBranch`, `stitch`, `quality`
- Returns: `{ registered, project }`
- Management-only: not exposed to most agents

## Team Messaging Tools

### `team.message`

- Parameters: `to`, `subject`, `body`, optional `from`, `priority` (`normal` | `urgent`), `taskRef`
- Returns: `{ delivered, messageId, originChannel, originSessionKey }`
- Side effect: triggers `after_tool_call` auto-spawn hook for delivery

### `team.inbox`

- Parameters: `agentId`, optional `unreadOnly`
- Returns: `{ messages[] }`

### `team.reply`

- Parameters: `messageId`, `body`, optional `from`
- Returns: `{ replied, replyId, originChannel, originSessionKey }`
- Side effect: triggers `after_tool_call` auto-spawn hook; replies always route to origin channel

### `team.status`

- Parameters: `agentId`, `status`
- Returns: `{ updated, agent }`
- In-memory only; no DB persistence

### `team.assign`

- Parameters: `taskId`, `agentId`, optional `fromAgent`, `message`
- Returns: `{ assigned, task }`
- Side effect: updates task assignee via `task_update`, optionally sends inbox message

## Decision Engine Tools

### `decision.evaluate`

- Parameters: `category` (`technical` | `scope` | `quality` | `conflict` | `budget` | `blocker`), `question`, `options[]`, optional `recommendation`, `reasoning`, `taskRef`
- Returns: `{ decisionId, decision, escalated, approver, reasoning }`
- Behavior: looks up policy for the category. Policies: `auto` (decide immediately), `escalate` (forward to target agent), `pause` (wait for human), `retry` (retry with max retries before escalating)
- Side effect: when `escalated: true`, triggers auto-spawn hook for approver agent
- Circuit breaker: max 5 decisions per agent per task

### `decision.log`

- Parameters: optional `taskRef`, `category`, `agentId`
- Returns: `{ decisions[] }`

## Pipeline Tools

### `pipeline.start`

- Parameters: `ideaText`, optional `scope`, `priority`
- Returns: `{ taskId, stage, owner }`
- Creates a task and initializes pipeline metadata with stage tracking

### `pipeline.status`

- Parameters: `taskId`
- Returns: `{ tasks[], stages[] }`

### `pipeline.retry`

- Parameters: `taskId`, `stage`, optional `reason`
- Returns: `{ retried, stage, retryCount }`

### `pipeline.skip`

- Parameters: `taskId`, `stage`, `justification`
- Returns: `{ skipped, stage, justification }`
