# Product-Team API Reference

This document lists every registered tool from
`extensions/product-team/src/tools/index.ts`.

## Tool Index

| Tool | Primary Agent(s) | Purpose |
|------|-------------------|---------|
| `task.create` | pm | Create a new task record |
| `task.get` | pm, architect, dev, qa, reviewer, infra | Fetch one task with orchestrator state and cost summary |
| `task.search` | pm, infra | Search tasks by filters |
| `task.update` | pm, architect, dev, qa, reviewer | Update mutable task fields with optimistic locking |
| `task.transition` | pm, architect, dev, qa, reviewer | Move task through lifecycle with guards |
| `workflow.step.run` | dev | Persist structured workflow step outputs |
| `workflow.state.get` | architect, dev, infra | Read workflow state/history/guard matrix |
| `workflow.events.query` | infra | Query event log with filters and aggregates |
| `quality.tests` | dev, qa | Run tests and persist QA evidence |
| `quality.coverage` | dev, qa | Parse coverage reports and persist metrics |
| `quality.lint` | dev, qa | Run lint engine and persist metrics |
| `quality.complexity` | dev, qa | Compute complexity metrics and persist |
| `quality.gate` | dev | Evaluate quality policy from metadata/evidence |
| `vcs.branch.create` | infra | Create task branch (idempotent) |
| `vcs.pr.create` | infra | Create pull request (idempotent) |
| `vcs.pr.update` | infra | Update pull request (idempotent) |
| `vcs.label.sync` | infra | Ensure repository labels exist/update |

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

- Parameters: `taskId`, `agentId`, optional `scope`, `policy`
- Returns: `{ task, output }`
- Persists gate verdict in `task.metadata.quality.gate`

```json
{
  "input": {
    "taskId": "01HARDENINGTASK0001",
    "agentId": "dev",
    "scope": "major"
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
      "violations": []
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
