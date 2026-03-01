# Task 0041 -- New Skills for Expanded Roles

| Field        | Value                                                |
|--------------|------------------------------------------------------|
| Task         | 0041                                                 |
| Epic         | EP08 — Autonomous Product Team                       |
| Phase        | 8B — Design & Multi-Project                          |
| Status       | DONE                                                 |
| Dependencies | 0038 (Agent roster references skill IDs)             |
| Blocks       | 0042 (Orchestrator needs all skills operational)     |

## Goal

Create SKILL.md files for the new agent roles introduced in the expanded roster:
tech-lead, product-owner, ui-designer, frontend-dev, backend-dev, devops.
Update existing skills where roles have changed.

## Context

Existing skills (8 total): requirements-grooming, architecture-design,
tdd-implementation, code-review, qa-testing, github-automation, adr, patterns.

Some existing skills map to the new roster but need refinement. New skills are
needed for roles that didn't exist before (tech-lead, product-owner, ui-designer,
frontend-dev, backend-dev, devops).

## Deliverables

### D1: `skills/tech-lead/SKILL.md`

Tech Lead = Senior Architect + Code Reviewer + Task Decomposer. Responsibilities:
- Decompose epics/stories into granular technical tasks
- Assign tasks to the appropriate dev agents (back/front)
- Make architecture decisions (with ADR creation for significant decisions)
- Perform final code review before merging
- Resolve technical disputes between agents
- Output schemas: `architecture_plan` (for system design), `review_result` (for
  code reviews); task decomposition structure is informal/non-validated

### D2: `skills/product-owner/SKILL.md`

Product Owner = Story Refiner + Acceptance Definer. Responsibilities:
- Refine PM's roadmap items into detailed user stories
- Define acceptance criteria with testable conditions
- Negotiate scope (what's in v1 vs deferred)
- Prioritize stories within an epic
- Output schema: `po_brief` (title, acceptance_criteria, scope, done_if)

### D3: `skills/ui-designer/SKILL.md`

UI/UX Designer = Stitch Design Expert. Responsibilities:
- Create screen designs using Stitch (`design.generate`)
- Iterate on designs based on PO/PM feedback (`design.edit`)
- Define design system tokens (colors, typography, spacing)
- Create component specifications for frontend devs
- Ensure responsive layouts (mobile, tablet, desktop)
- Always use `modelId: GEMINI_3_PRO` for Stitch calls
- Outputs: screens[], components[], design_tokens[] (task metadata, not an
  orchestrator schemaKey)

### D4: `skills/frontend-dev/SKILL.md`

Frontend Developer = React/Next.js Specialist. Responsibilities:
- Implement UI components from Stitch designs (pixel-perfect)
- Manage state (React hooks, context, or state library)
- Integrate with backend APIs
- Write component tests (Vitest + React Testing Library)
- Follow TDD Red-Green-Refactor cycle
- Translate `.stitch-html/*.html` designs into React components
- Output schema: inherits `dev_result` from tdd-implementation

### D5: `skills/backend-dev/SKILL.md`

Backend Developer = API & Server Logic Specialist. Responsibilities:
- Design and implement REST/GraphQL API endpoints
- Database schema design and migrations
- Server-side business logic
- Write API tests and integration tests
- Follow TDD Red-Green-Refactor cycle
- Output schema: inherits `dev_result` from tdd-implementation

### D6: `skills/devops/SKILL.md`

DevOps Engineer = CI/CD & Infrastructure. Responsibilities:
- Create and manage GitHub branches
- Open and update pull requests
- Configure CI/CD workflows
- Manage deployment configurations
- Monitor build/test pipeline results
- Handle infrastructure-as-code
- No unique output schema — uses VCS tools directly

## Acceptance Criteria

- [x] All 6 new skills have SKILL.md files with proper YAML frontmatter
- [x] Each skill defines clear responsibilities, output schemas, and quality checks
- [x] Skills are loadable by OpenClaw (proper directory structure)
- [x] Agent roster in openclaw.docker.json references correct skill IDs
- [x] Existing skills (requirements-grooming, qa-testing, etc.) remain unchanged
- [x] No skill duplicates responsibilities already handled by another skill

## Testing Plan

1. Verify SKILL.md YAML frontmatter parses correctly
2. Verify skills load in OpenClaw (no errors in gateway startup)
3. Verify each agent's skill binding matches its role
4. Review skill prompts for role clarity and non-overlap
