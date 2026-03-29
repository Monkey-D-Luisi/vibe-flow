# Services & Commands API

Register long-running background services and chat slash commands.

---

## `api.registerService(config)`

Register a background service with a managed lifecycle. The gateway calls
`start()` after plugin registration and `stop()` during shutdown.

### Signature

```typescript
api.registerService(config: ServiceConfig): void
```

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique service identifier |
| `start` | `() => Promise<void>` | Yes | Called once after plugin registration |
| `stop` | `() => Promise<void>` | Yes | Called during graceful shutdown |

### Example: Alert Engine Service

From the telegram-notifier extension (`extensions/telegram-notifier/src/index.ts`).
`AlertEngine` is a custom class defined in the extension that wraps
`setInterval`-based polling and graceful shutdown logic.

```typescript
const alertEngine = new AlertEngine(ptApi, enqueue, alertLogger, {
  enabled: true,
  pollIntervalMs: 60_000,
});

api.registerService({
  id: 'telegram-notifier-alerting',
  async start() {
    alertEngine.start();
  },
  async stop() {
    alertEngine.stop();
  },
});
```

### Example: Message Queue Service

```typescript
const queue = new MessageQueue();

api.registerService({
  id: 'telegram-notifier-queue',
  async start() {
    queue.startProcessing();
  },
  async stop() {
    queue.stopProcessing();
    await queue.flush();
  },
});
```

### Example: Custom Background Service

```typescript
export default {
  id: 'my-background',
  name: 'Background Worker',
  description: 'Runs periodic background tasks',

  register(api: OpenClawPluginApi): void {
    let intervalId: ReturnType<typeof setInterval> | undefined;

    api.registerService({
      id: 'my-background-worker',
      async start() {
        api.logger.info('Background worker started');
        intervalId = setInterval(async () => {
          try {
            await doPeriodicWork();
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            api.logger.error(`Background worker error: ${msg}`);
          }
        }, 30_000);
      },
      async stop() {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = undefined;
        }
        api.logger.info('Background worker stopped');
      },
    });
  },
};
```

---

## `api.registerCommand(config)` {#registercommand}

Register a slash command for chat platforms (Telegram, etc.). Commands are
exposed as `/commandName` in the chat interface.

### Signature

```typescript
api.registerCommand(config: CommandConfig): void
```

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Command name (without leading `/`) |
| `description` | `string` | Yes | Help text shown in command listings |
| `acceptsArgs` | `boolean` | No | Whether the command accepts arguments (default: `false`) |
| `handler` | `(ctx: CommandContext) => Promise<CommandResult>` | Yes | Async handler |

### CommandContext

| Field | Type | Description |
|-------|------|-------------|
| `args` | `string \| undefined` | Arguments passed after the command name |

### CommandResult

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Response text (supports Markdown) |

### Example: Simple Status Command

From the telegram-notifier extension:

```typescript
api.registerCommand({
  name: 'teamstatus',
  description: 'Show live agent status dashboard',
  handler: async () => {
    const agents = await getAgentStatuses();
    const lines = agents.map(
      (a) => `${a.emoji} *${a.name}*: ${a.status} — ${a.currentTask ?? 'idle'}`,
    );
    return { text: lines.join('\n') };
  },
});
```

### Example: Command with Arguments

```typescript
api.registerCommand({
  name: 'idea',
  description: 'Submit a product idea',
  acceptsArgs: true,
  handler: async (ctx) => {
    const ideaText = ctx.args?.trim();
    if (!ideaText) {
      return { text: 'Usage: /idea <your idea description>' };
    }

    await createIdea(ideaText);
    return { text: `Idea recorded: "${ideaText}"` };
  },
});
```

### Example: Command with Rich Output

```typescript
api.registerCommand({
  name: 'pipeline',
  description: 'Show active pipeline visualization',
  acceptsArgs: true,
  handler: async (ctx) => {
    const taskId = ctx.args?.trim();
    const pipelines = await queryPipelines(taskId);

    if (pipelines.length === 0) {
      return { text: 'No active pipelines.' };
    }

    const sections = pipelines.map((p) => {
      const stages = p.stages
        .map((s) => `${s.done ? '✅' : '⏳'} ${s.name} (${s.duration ?? '—'})`)
        .join('\n');
      return `*Pipeline ${p.id}*\n${stages}`;
    });

    return { text: sections.join('\n\n') };
  },
});
```

---

## Registered Commands (Telegram)

The telegram-notifier extension registers these commands:

| Command | Args | Description |
|---------|------|-------------|
| `/teamstatus` | No | Live agent status dashboard |
| `/idea` | Yes | Submit a product idea |
| `/health` | No | System diagnostics from metrics |
| `/pipeline` | Yes (optional taskId) | Active pipeline visualization |
| `/budget` | Yes (optional subcommand) | Budget dashboard |
| `/approve` | Yes (`<decisionId> <optionId>`) | Approve a pending decision |
| `/reject` | Yes (`<decisionId> [reason]`) | Reject a pending decision |
| `/decisions` | No | List pending decisions |

## Cross-References

| Extension | Services | Commands | Source |
|-----------|----------|----------|--------|
| telegram-notifier | 2 (alerting, queue) | 8 (teamstatus, idea, health, pipeline, budget, approve, reject, decisions) | `extensions/telegram-notifier/src/index.ts` |
| product-team | 3+ (monitoring, decision-timeout, stage-timeout) | — | `extensions/product-team/src/index.ts` |
