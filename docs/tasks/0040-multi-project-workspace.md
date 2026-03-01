# Task 0040 -- Multi-Project Workspace Manager

| Field        | Value                                                |
|--------------|------------------------------------------------------|
| Task         | 0040                                                 |
| Epic         | EP08 — Autonomous Product Team                       |
| Phase        | 8B — Design & Multi-Project                          |
| Status       | DONE                                                 |
| Dependencies | 0038 (Agent roster)                                  |
| Blocks       | 0042 (Orchestrator needs project context)            |

## Goal

Extend the product-team plugin to support multiple project workspaces, each
with its own git clone, configuration, and optionally its own task database.
Agents can switch between projects during the workflow.

## Context

The user wants this team to be multi-project capable — initially working on
both `vibe-flow` and `saas-template`, with the ability to add more projects
later. Each project has its own GitHub repo, branch conventions, quality
thresholds, and Stitch project ID.

## Deliverables

### D1: Project Registry

Add a `projects` configuration section to the gateway config:

```jsonc
{
  "plugins": {
    "entries": {
      "product-team": {
        "config": {
          "projects": [
            {
              "id": "vibe-flow",
              "name": "OpenClaw Extensions",
              "repo": "luiss/vibe-flow",
              "defaultBranch": "main",
              "workspace": "/workspaces/vibe-flow",
              "stitch": { "projectId": null },
              "quality": { "coverageMajor": 80, "coverageMinor": 70, "maxComplexity": 5.0 }
            },
            {
              "id": "saas-template",
              "name": "SaaS Template",
              "repo": "luiss/saas-template",
              "defaultBranch": "main",
              "workspace": "/workspaces/saas-template",
              "stitch": { "projectId": "16786124142182555397" },
              "quality": { "coverageMajor": 80, "coverageMinor": 70, "maxComplexity": 5.0 }
            }
          ],
          "activeProject": "vibe-flow"
        }
      }
    }
  }
}
```

### D2: New Tools

#### `project.list`
- **Output**: `{ projects: Array<{ id, name, repo, active }> }`
- Returns all registered projects with their active/inactive status

#### `project.switch`
- **Input**: `{ projectId: string }`
- **Output**: `{ switched: true, workspace: string, repo: string }`
- Changes the active project for subsequent tool calls
- Updates working directory for quality tools, VCS tools
- Switches Stitch project ID for design tools
- Switches GitHub owner/repo for VCS tools

#### `project.register`
- **Input**: `{ id, name, repo, defaultBranch, stitch?, quality? }`
- **Output**: `{ registered: true }`
- Clones the repo into `/workspaces/<id>/` if not already present
- Adds project to the registry

### D3: Workspace Initialization

On gateway startup, for each registered project:
1. Check if workspace directory exists
2. If not: `git clone` the repo into the workspace
3. If yes: `git fetch origin` to update refs
4. Verify `.git` directory is valid

### D4: Tool Context Injection

Modify existing tools (task.*, workflow.*, quality.*, vcs.*) to receive the
active project context:
- Quality tools use project-specific thresholds
- VCS tools use project-specific owner/repo and default branch
- Design tools use project-specific Stitch project ID
- Task tools can filter by project tag

### D5: Task Tagging

Add an optional `project` field to TaskRecord metadata so tasks are associated
with their project. `task.search` gets a `project` filter parameter.

## Acceptance Criteria

- [x] `project.list` returns all configured projects
- [x] `project.switch` changes active project context
- [x] `project.register` clones a new repo and adds it to registry
- [ ] Quality tools use project-specific thresholds after switch
- [ ] VCS tools target the correct GitHub repo after switch
- [ ] Design tools use the correct Stitch project ID after switch
- [x] Workspaces initialize on first boot (git clone)
- [x] Workspaces persist across container restarts (Docker volume)
- [ ] Tasks are tagged with their project for filtering

## Testing Plan

1. Unit tests: project registry CRUD operations
2. Unit tests: context injection for quality/VCS/design tools
3. Integration test: switch project, verify VCS tools target correct repo
4. Integration test: register new project, verify git clone occurs
5. Docker test: restart container, verify workspaces survive

## Technical Notes

- Project switching is per-session, not global. If multiple agents work
  simultaneously on different projects, each maintains its own context.
- Git operations inside Docker need proper SSH keys or HTTPS tokens configured
  via environment variables.
- Large repos: consider `git clone --depth 1` for initial clone, with full
  history fetched lazily.
