# Tool Registration API

Register tools that agents can invoke. Each tool has a name, description,
JSON Schema parameters, and an async handler.

## `api.registerTool(tool, opts?)`

Register a single tool with the gateway.

### Signature

```typescript
api.registerTool(tool: ToolDefinition, opts?: Record<string, unknown>): void
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tool` | `ToolDefinition` | Yes | Tool definition object (see below) |
| `opts` | `Record<string, unknown>` | No | Additional registration options |

### ToolDefinition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Unique tool identifier. Dots (`.`) are converted to underscores (`_`) at runtime. |
| `label` | `string` | No | Human-friendly display name |
| `description` | `string` | Yes | Purpose description shown to agents |
| `parameters` | `JSONSchema` | Yes | JSON Schema for input validation |
| `execute` | `(toolCallId: string, params: Record<string, unknown>) => Promise<ToolResult>` | Yes | Async handler function |

### ToolResult

The handler must return an object with a `content` array:

```typescript
interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details?: unknown;
}
```

### Naming Convention

Tool names use dot notation in source code but are exposed with underscores at
runtime. This is handled automatically by the gateway:

| Source Name | Runtime Name | Agent Allow-List |
|-------------|-------------|------------------|
| `design.generate` | `design_generate` | `design_generate` |
| `qgate.tests` | `qgate_tests` | `qgate_tests` |
| `task.create` | `task_create` | `task_create` |

### Example: Simple Tool

```typescript
// extensions/hello/src/index.ts
export default {
  id: 'hello',
  name: 'Hello Extension',
  description: 'Simple greeting tool',

  register(api: OpenClawPluginApi): void {
    api.registerTool({
      name: 'hello_greet',
      label: 'Greet',
      description: 'Return a greeting for the given name',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name to greet' },
        },
        required: ['name'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const name = String(params['name'] ?? 'World');
        return {
          content: [{ type: 'text' as const, text: `Hello, ${name}!` }],
        };
      },
    });
  },
};
```

### Example: Tool with Schema Validation

From the stitch-bridge extension (`extensions/stitch-bridge/src/index.ts`):

```typescript
api.registerTool({
  name: 'design_generate',
  label: 'Generate Design',
  description: 'Generate a UI screen design via Google Stitch',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Stitch project ID' },
      screenName: { type: 'string', description: 'Screen file name' },
      description: { type: 'string', description: 'Design requirements' },
      model: { type: 'string', description: 'Model override' },
      workspace: { type: 'string', description: 'Output directory' },
    },
    required: ['screenName', 'description'],
  },
  async execute(_toolCallId: string, params: Record<string, unknown>) {
    const screenName = sanitizeScreenName(String(params['screenName']));
    const description = String(params['description']);

    const result = await callStitchMcp(config, 'generateScreen', {
      screenName,
      description,
    });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
});
```

### Example: Batch Tool Registration

From the quality-gate extension (`extensions/quality-gate/src/index.ts`):

```typescript
register(api: { registerTool: (tool: unknown) => void }) {
  const tools = getAllToolDefs();
  for (const tool of tools) {
    // Normalize dot notation to underscores
    (tool as { name: string }).name =
      (tool as { name: string }).name.replace(/\./g, '_');
    api.registerTool(tool);
  }
},
```

### Security Considerations

- **Input validation**: Always validate and sanitize handler parameters. Use type
  guards and explicit casting — never trust raw `params` values.
- **Path traversal**: When tools accept file paths, use `path.basename()` to strip
  directory components and validate against workspace boundaries.
- **Enum validation**: For constrained string parameters, validate against an
  explicit allow-set before processing.

## Cross-References

| Extension | Tools Registered | Source |
|-----------|-----------------|--------|
| product-team | 30+ (task, workflow, quality, VCS, pipeline, team, decision, metrics) | `extensions/product-team/src/index.ts` |
| quality-gate | 7 (tests, coverage, lint, complexity, gate, accessibility, audit) | `extensions/quality-gate/src/index.ts` |
| stitch-bridge | 8 (generate, edit, variant, get, list, project CRUD) | `extensions/stitch-bridge/src/index.ts` |
