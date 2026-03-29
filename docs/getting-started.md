# Getting Started -- Build Your First OpenClaw Extension

> **Time:** ~5 minutes.  **Prerequisites:** Node.js 22+, pnpm 9+, Git.

## 1. Clone and install

```bash
git clone https://github.com/openclaw/openclaw-extensions.git
cd openclaw-extensions
pnpm install
```

## 2. Scaffold a new extension

Pick a template that matches your use-case:

| Template | What you get |
|----------|-------------|
| `tool` | A single tool with schema + handler |
| `hook` | An event listener (e.g. `after_tool_call`) |
| `service` | A background service with start/stop lifecycle |
| `http` | An HTTP route handler |
| `hybrid` | All of the above (default) |

```bash
pnpm create:extension hello-world --template tool
```

Expected output:

```
Created extensions/hello-world (template: tool)
```

## 3. Explore the generated files

```
extensions/hello-world/
├── src/
│   └── index.ts          # Plugin entry — register(api) pattern
├── test/
│   └── index.test.ts     # Starter tests
├── package.json           # @openclaw/hello-world
├── tsconfig.json          # Strict ESM config
├── vitest.config.ts       # Test runner config
├── .eslintrc.cjs          # Lint rules
├── openclaw.plugin.json   # Plugin manifest
└── README.md
```

## 4. Implement your tool

Open `extensions/hello-world/src/index.ts`. The scaffolded code already contains
a working tool. Let's customise it:

```typescript
export default {
  id: 'hello-world',
  name: 'hello-world',
  description: 'My first OpenClaw extension',

  register(api: {
    registerTool: (tool: unknown) => void;
    logger: { info: (msg: string) => void };
  }): void {
    api.registerTool({
      name: 'hello_world_greet',
      label: 'Greet',
      description: 'Return a personalised greeting',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name to greet' },
          language: {
            type: 'string',
            enum: ['en', 'es', 'de'],
            description: 'Greeting language',
          },
        },
        required: ['name'],
      },
      async execute(
        _toolCallId: string,
        params: Record<string, unknown>,
      ) {
        const greetName = String(params['name'] ?? 'World');
        const lang = String(params['language'] ?? 'en');

        const greetings: Record<string, string> = {
          en: `Hello, ${greetName}!`,
          es: `¡Hola, ${greetName}!`,
          de: `Hallo, ${greetName}!`,
        };

        return {
          content: [{
            type: 'text' as const,
            text: greetings[lang] ?? greetings['en'],
          }],
        };
      },
    });

    api.logger.info('hello-world extension loaded');
  },
};
```

## 5. Run tests

```bash
cd extensions/hello-world
pnpm test
```

Expected output:

```
 ✓ test/index.test.ts
   ✓ hello-world plugin > has the correct id
   ✓ hello-world plugin > registers a tool
   ✓ hello-world plugin > tool returns a greeting

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## 6. Load the extension

Add the extension to your OpenClaw gateway configuration (`openclaw.json`):

```json
{
  "extensions": [
    "./extensions/hello-world/src/index.ts"
  ]
}
```

Restart the gateway to pick up the new extension.

## 7. Verify

Call your tool through the gateway API or chat interface:

```
Use hello_world_greet with name "Alice" and language "es"
```

Expected response: `¡Hola, Alice!`

## 8. Run quality checks

Before committing, run the full quality suite:

```bash
pnpm test          # All tests pass
pnpm lint          # Zero lint errors
pnpm typecheck     # Zero type errors
```

## Next steps

- **API reference:** See [docs/api/README.md](api/README.md) for the full
  plugin API surface.
- **Templates:** Run `pnpm create:extension --help` to see all available
  templates.
- **Examples:** See [docs/api/examples.md](api/examples.md) for complete
  mini-extension examples.
- **Existing extensions:** Browse `extensions/` for real-world patterns.
- **Troubleshooting:** See [docs/troubleshooting.md](troubleshooting.md) for
  common issues.
