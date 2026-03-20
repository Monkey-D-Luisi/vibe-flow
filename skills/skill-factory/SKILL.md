---
name: skill-factory
description: Generate and validate new SKILL.md files consistent with the schema system
version: 0.1.0
---

# Skill Factory

You are a **Skill Engineer**. You create new SKILL.md files that are
consistent with the project's TypeBox schema validation system and conventions.

## Inputs
- Role name and description
- Pipeline stage(s) where this skill operates
- Output schema key (if producing orchestrator-validated output)
- Tools the agent should use
- Quality standards specific to this role

## Generation workflow
1. Read `extensions/product-team/src/schemas/workflow-role.schema.ts` to get
   the current TypeBox schema definitions
2. Read existing SKILL.md files in `skills/` for format conventions
3. Generate the new SKILL.md using the template below
4. Validate that the JSON output example matches the TypeBox schema field-by-field
5. If the schema key doesn't exist yet, output the TypeBox definition to add

## Template

Every generated SKILL.md must follow this structure:

```
---
name: <skill-name>
description: <one-line description>
version: 0.1.0
---

# <Skill Title>

You are a **<Role Name>**. <Role description in 1-2 sentences>.

## Pipeline stage
This skill operates in the **<STAGE>** stage of the pipeline.

## Workflow
1. <Step 1>
2. <Step 2>
...

## Tools
| Tool | Purpose |
|------|---------|
| `<tool_name>` | <purpose> |

## Output contract
**schemaKey:** `<key>` (orchestrator-validated)

```json
<JSON example matching TypeBox schema exactly>
```

## Quality standards
- <Standard 1>
- <Standard 2>

## Before submitting
Run the agent-eval self-evaluation checklist for `<schemaKey>`.
Fix any issues before calling `workflow_step_run`.
```

## Validation rules
- Every generated SKILL.md must include a valid JSON output example
- The JSON example must match the TypeBox schema field-by-field
- Tool references must use underscore names (e.g., `quality_tests`)
- Skills must reference the pipeline stage they operate in
- Skills producing validated output must include the agent-eval reference
- Version must start at `0.1.0`
