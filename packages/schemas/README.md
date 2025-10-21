# JSON Schemas

This package contains all JSON schemas used throughout the Agents & MCPs system for contract validation and data integrity.

## Overview

These schemas define strict contracts for:
- **TaskRecord**: Core task data structure
- **Agent I/O**: Input and output contracts for each agent
- **Quality Reports**: Standardized quality tool outputs

All schemas follow [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/schema).

## Schemas

### taskrecord.schema.json

Defines the complete TaskRecord structure with:
- ULID identifier with `TR-` prefix
- State machine states: `po | arch | dev | review | po_check | qa | pr | done`
- Scope: `minor | major`
- Quality metrics (coverage, complexity, lint)
- TDD evidence (`red_green_refactor_log`)
- Links to GitHub, Git, and ADRs

**Usage**:
```typescript
import taskRecordSchema from '@agents/schemas/taskrecord.schema.json';
import Ajv from 'ajv';

const ajv = new Ajv();
const validate = ajv.compile(taskRecordSchema);

if (validate(data)) {
  // Valid TaskRecord
} else {
  console.error(validate.errors);
}
```

### Agent Output Schemas

#### po_brief.schema.json

Product Owner brief output:
```json
{
  "title": "string",
  "acceptance_criteria": ["string"],
  "scope": "minor|major",
  "non_functional": ["string"],
  "done_if": ["string"]
}
```

#### design_ready.schema.json

Architecture design output:
```json
{
  "modules": ["string"],
  "contracts": [
    {
      "name": "PascalCase",
      "methods": ["string"]
    }
  ],
  "patterns": [
    {
      "name": "string",
      "where": "string",
      "why": "string"
    }
  ],
  "adr_id": "ADR-\\d+",
  "test_plan": ["string"]
}
```

#### dev_work_output.schema.json

Development work output:
```json
{
  "diff_summary": "string",
  "metrics": {
    "coverage": 0.0,
    "lint": {
      "errors": 0,
      "warnings": 0
    }
  },
  "red_green_refactor_log": ["string"]
}
```

#### reviewer_report.schema.json

Code review report:
```json
{
  "violations": [
    {
      "rule": "string",
      "where": "string",
      "why": "string",
      "severity": "low|med|high",
      "suggested_fix": "string"
    }
  ],
  "summary": "string"
}
```

#### qa_report.schema.json

QA test report:
```json
{
  "total": 0,
  "passed": 0,
  "failed": 0,
  "evidence": ["string"]
}
```

#### pr_summary.schema.json

PR bot summary:
```json
{
  "branch": "feature/[a-z0-9._-]+",
  "pr_url": "https://...",
  "checklist": ["string"]
}
```

### Quality Tool Schemas

#### quality_coverage.input.schema.json

Input schema for coverage tool:
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

#### quality_coverage.output.schema.json

Output schema for coverage reports:
```json
{
  "overall": {
    "lines": 0.85,
    "statements": 0.86,
    "functions": 0.80,
    "branches": 0.75
  },
  "files": [
    {
      "path": "string",
      "coverage": 0.0
    }
  ],
  "source": "server|cli",
  "timestamp": "2024-10-21T16:00:00Z"
}
```

## Schema Validation

### In TypeScript

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ strict: true });
addFormats(ajv);

// Load schema
import taskRecordSchema from '@agents/schemas/taskrecord.schema.json';
const validate = ajv.compile(taskRecordSchema);

// Validate data
const isValid = validate(taskRecord);
if (!isValid) {
  console.error('Validation errors:', validate.errors);
}
```

### In Agent Code

Agents use schemas to validate their outputs before handoff:

```typescript
import { validateAgentOutput } from '@agents/task-mcp/src/agents/validator';
import designReadySchema from '@agents/schemas/design_ready.schema.json';

async function architectAgent(input: unknown): Promise<unknown> {
  const output = {
    modules: ['task', 'orchestrator'],
    contracts: [{ name: 'TaskRepository', methods: ['create', 'get'] }],
    patterns: [{ name: 'Repository', where: 'persistence', why: 'decouple domain' }],
    adr_id: 'ADR-001',
    test_plan: ['unit tests for repository']
  };

  // Validate before returning
  validateAgentOutput(output, designReadySchema);
  return output;
}
```

## Schema Versioning

Schemas follow semantic versioning:
- **Major**: Breaking changes (field removal, type change)
- **Minor**: Backward-compatible additions
- **Patch**: Documentation or clarification

Current version: **1.0.0**

## Schema Guidelines

When modifying schemas:

1. **Maintain backward compatibility** when possible
2. **Use `additionalProperties: false`** to prevent field creep
3. **Define strict patterns** for string fields (e.g., ULID, branch names)
4. **Document all fields** with `description` properties
5. **Use enums** for fixed value sets
6. **Require essential fields** in `required` array

### Example Schema Structure

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/example.schema.json",
  "title": "Example Schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "name"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^EX-[0-9A-Z]{26}$",
      "description": "Unique identifier with EX- prefix"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "description": "Human-readable name"
    },
    "status": {
      "type": "string",
      "enum": ["active", "inactive", "archived"],
      "description": "Current status"
    },
    "metadata": {
      "type": "object",
      "description": "Additional metadata",
      "additionalProperties": true
    }
  }
}
```

## Testing Schemas

All schemas should have corresponding tests:

```typescript
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import schema from './example.schema.json';

describe('Example Schema', () => {
  const ajv = new Ajv();
  const validate = ajv.compile(schema);

  it('accepts valid data', () => {
    const valid = {
      id: 'EX-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
      name: 'Test Example',
      status: 'active'
    };
    expect(validate(valid)).toBe(true);
  });

  it('rejects invalid id format', () => {
    const invalid = {
      id: 'invalid-id',
      name: 'Test Example',
      status: 'active'
    };
    expect(validate(invalid)).toBe(false);
    expect(validate.errors).toBeDefined();
  });

  it('rejects additional properties', () => {
    const invalid = {
      id: 'EX-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
      name: 'Test Example',
      status: 'active',
      extraField: 'not allowed'
    };
    expect(validate(invalid)).toBe(false);
  });
});
```

## Schema Location

Schemas are published as part of the `@agents/schemas` package and can be imported directly:

```typescript
// ESM
import taskRecordSchema from '@agents/schemas/taskrecord.schema.json' assert { type: 'json' };

// CommonJS
const taskRecordSchema = require('@agents/schemas/taskrecord.schema.json');
```

## Contributing

When adding or modifying schemas:

1. **Update the schema file** in `packages/schemas/`
2. **Add tests** for validation scenarios
3. **Update this README** with new schema documentation
4. **Update dependent code** that uses the schema
5. **Run validation tests** to ensure no regressions

### Schema Change Checklist

- [ ] Schema file updated
- [ ] Version bumped if needed
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Dependent services updated
- [ ] All tests passing

## References

- [JSON Schema Specification](https://json-schema.org/)
- [Ajv Documentation](https://ajv.js.org/)
- [TaskRecord v1.0.0 Spec](../../docs/task_record_v_1_0.md)
- [Agent Contracts](../../docs/ep_01_t_03_prompts_por_agente_y_contratos_de_salida_especificacion.md)

## License

MIT - see [LICENSE](../../LICENSE)
