# Lifecycle Hooks API

Register event handlers that fire at key points in agent execution. Hooks enable
middleware patterns: logging, state tracking, cost accounting, and dynamic routing.

## `api.on(eventName, handler)`

Subscribe to a lifecycle event.

### Signature

```typescript
api.on(eventName: string, handler: (event: Record<string, unknown>, ctx?: EventContext) => void | Promise<void>): void
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `eventName` | `string` | Yes | Event to listen for (see table below) |
| `handler` | `Function` | Yes | Callback invoked when the event fires |

### Available Events

| Event | When It Fires | Extensions Using It |
|-------|---------------|---------------------|
| `before_tool_call` | Before a tool handler executes | product-team, virtual-office |
| `after_tool_call` | After a tool handler completes | product-team, telegram-notifier, virtual-office |
| `agent_end` | When an agent session terminates | product-team, telegram-notifier, virtual-office |
| `subagent_spawned` | When a sub-agent is created | telegram-notifier, virtual-office |
| `before_model_resolve` | Before the gateway selects an LLM model | model-router |

---

## Event: `before_tool_call`

Fires before a tool's `execute` handler runs. Use for pre-processing, logging,
or rejecting calls.

### Handler Signature

```typescript
api.on('before_tool_call', (event, ctx) => {
  // event.toolName: string — name of the tool about to execute
  // event.params: Record<string, unknown> — parameters passed to the tool
  // ctx.agentId: string — ID of the calling agent
  // ctx.sessionKey: string — session identifier
});
```

### Event Shape

| Field | Type | Description |
|-------|------|-------------|
| `event.toolName` | `string` | Tool name (underscore notation) |
| `event.params` | `Record<string, unknown>` | Tool parameters |
| `ctx.agentId` | `string` | Agent that invoked the tool |
| `ctx.sessionKey` | `string` | Session identifier |

### Example

From the virtual-office extension (`extensions/virtual-office/src/index.ts`):

```typescript
api.on('before_tool_call', (event, ctx) => {
  handlers.onBeforeToolCall(
    event as { toolName: string; params?: Record<string, unknown> },
    ctx as { agentId?: string },
  );
});
```

---

## Event: `after_tool_call`

Fires after a tool's `execute` handler completes (success or failure). Use for
metrics, cost tracking, notifications, and state updates.

### Handler Signature

```typescript
api.on('after_tool_call', (event, ctx) => {
  // event.toolName: string — name of the completed tool
  // event.params: Record<string, unknown> — parameters that were passed
  // event.result: unknown — return value from the tool handler
  // ctx.agentId: string — ID of the calling agent
});
```

### Event Shape

| Field | Type | Description |
|-------|------|-------------|
| `event.toolName` | `string` | Tool name (underscore notation) |
| `event.params` | `Record<string, unknown>` | Tool parameters |
| `event.result` | `unknown` | Tool handler return value |
| `ctx.agentId` | `string \| undefined` | Agent that invoked the tool |

### Example: Cost Tracking

From the product-team extension (`extensions/product-team/src/index.ts`):

```typescript
api.on('after_tool_call', (event, ctx) => {
  const toolName = String(event.toolName ?? '');
  const agentId = ctx?.agentId ?? 'unknown';

  // Track tool usage for cost and metrics
  eventLog.append({
    type: 'tool_call',
    toolName,
    agentId,
    timestamp: new Date().toISOString(),
  });
});
```

### Example: Notification Dispatch

From the telegram-notifier extension (`extensions/telegram-notifier/src/index.ts`):

```typescript
api.on('after_tool_call', (event) => {
  const toolName = String(event.toolName ?? '');
  const params = (event.params ?? {}) as Record<string, unknown>;
  const result = event.result;

  // Notify on specific tool completions
  if (toolName === 'pipeline_advance') {
    enqueue(`Pipeline advanced: stage ${String(params['stage'] ?? 'unknown')}`);
  }
});
```

---

## Event: `agent_end`

Fires when an agent session terminates — either successfully or with an error.

### Handler Signature

```typescript
api.on('agent_end', (event, ctx) => {
  // event.error: unknown | undefined — error if the agent failed
  // ctx.agentId: string — ID of the terminated agent
});
```

### Event Shape

| Field | Type | Description |
|-------|------|-------------|
| `event.error` | `unknown \| undefined` | Error object if the agent crashed |
| `ctx.agentId` | `string \| undefined` | Agent that ended |

### Example

From the telegram-notifier extension:

```typescript
api.on('agent_end', (event) => {
  if (event.error) {
    const errorMsg = event.error instanceof Error
      ? event.error.message
      : String(event.error);
    enqueue(`Agent terminated with error: ${errorMsg}`);
  }
});
```

---

## Event: `subagent_spawned`

Fires when a sub-agent is created by the gateway (e.g., during pipeline
execution).

### Handler Signature

```typescript
api.on('subagent_spawned', (event) => {
  // event.agentId: string — ID of the newly spawned agent
});
```

### Event Shape

| Field | Type | Description |
|-------|------|-------------|
| `event.agentId` | `string` | ID of the spawned sub-agent |

### Example

From the telegram-notifier extension:

```typescript
api.on('subagent_spawned', (event) => {
  const agentId = String(
    (event as Record<string, unknown>)['agentId'] ?? 'unknown',
  );
  enqueue(`Sub-agent spawned: ${agentId}`);
});
```

---

## Event: `before_model_resolve`

Fires before the gateway selects an LLM model for a request. Return an override
object to dynamically change the model.

**This hook is exclusive to the model-router extension.** It enables dynamic
routing based on task complexity, budget constraints, and provider health.

### Handler Signature

```typescript
api.on('before_model_resolve', (_event, ctx) => {
  // ctx.agentId: string — ID of the requesting agent
  // Return: { modelOverride: string, providerOverride?: string } | undefined
});
```

### Return Value

| Field | Type | Description |
|-------|------|-------------|
| `modelOverride` | `string` | Model ID to use instead of the default |
| `providerOverride` | `string \| undefined` | Provider ID override |

Return `undefined` to keep the default model.

### Example

From the model-router extension (`extensions/model-router/src/index.ts`):

```typescript
api.on('before_model_resolve', (_event, ctx) => {
  const agentId = ctx.agentId ?? 'unknown';
  const agentModelConfig = lookupAgentModelConfig(api, agentId);

  const result = resolveModel({
    agentId,
    complexityInput: { agentRole: agentId as ModelRole },
    agentModelConfig,
    correlationId: undefined,
  });

  if (result.source === 'dynamic') {
    return { modelOverride: result.modelId, providerOverride: result.providerId };
  }
  return undefined;
});
```

---

## Patterns

### Multiple Hooks on the Same Event

Multiple extensions can listen to the same event. Hooks execute in registration
order.

```typescript
// Extension A
api.on('after_tool_call', (event) => { /* logging */ });

// Extension B
api.on('after_tool_call', (event) => { /* metrics */ });
```

### Type Narrowing in Handlers

Event objects are loosely typed. Use type assertions with guards:

```typescript
api.on('after_tool_call', (event, ctx) => {
  const toolName = String(event.toolName ?? '');
  const agentId = (ctx as { agentId?: string })?.agentId ?? 'unknown';

  if (toolName && agentId !== 'unknown') {
    // Safe to process
  }
});
```

## Cross-References

| Extension | Hooks Used | Source |
|-----------|-----------|--------|
| product-team | `before_tool_call`, `after_tool_call`, `agent_end` | `extensions/product-team/src/index.ts` |
| telegram-notifier | `after_tool_call`, `agent_end`, `subagent_spawned` | `extensions/telegram-notifier/src/index.ts` |
| model-router | `before_model_resolve` | `extensions/model-router/src/index.ts` |
| virtual-office | `before_tool_call`, `after_tool_call`, `agent_end`, `subagent_spawned` | `extensions/virtual-office/src/index.ts` |
