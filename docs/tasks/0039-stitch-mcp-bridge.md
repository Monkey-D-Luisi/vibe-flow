# Task 0039 -- Stitch MCP Bridge Plugin

| Field        | Value                                                |
|--------------|------------------------------------------------------|
| Task         | 0039                                                 |
| Epic         | EP08 — Autonomous Product Team                       |
| Phase        | 8B — Design & Multi-Project                          |
| Status       | DONE                                                 |
| Dependencies | 0038 (Agent roster with designer role)               |
| Blocks       | 0042 (Orchestrator integrates design step)           |

## Goal

Create an OpenClaw plugin that registers design tools by proxying to the Google
Stitch MCP endpoint. The designer agent uses these tools to generate, edit, and
retrieve UI screen designs before frontend implementation begins.

## Context

Stitch is Google's AI design tool accessible via MCP at
`https://stitch.googleapis.com/mcp`. Authentication uses an API key passed in
the `X-Goog-Api-Key` header. The saas-template project already uses Stitch
with project ID `16786124142182555397` and model `GEMINI_3_PRO`.

Design workflow from saas-template conventions:
1. Agent calls `generate_screen_from_text` with a screen description
2. Stitch returns HTML/CSS design
3. Design is saved to `.stitch-html/<screen-name>.html`
4. Frontend developer implements pixel-perfect from the design

## Deliverables

### D1: Stitch Bridge Plugin (`extensions/stitch-bridge/`)

Plugin structure:
```
extensions/stitch-bridge/
├── package.json
├── openclaw.plugin.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Plugin entry, registers tools
│   ├── stitch-client.ts      # HTTP client for Stitch MCP API
│   ├── tools/
│   │   ├── design-generate.ts  # generate_screen_from_text proxy
│   │   ├── design-edit.ts      # edit_screens proxy
│   │   ├── design-get.ts       # Retrieve saved design
│   │   └── design-list.ts      # List designs in project
│   └── storage/
│       └── design-store.ts     # Save/load designs from workspace
└── tests/
    ├── stitch-client.test.ts
    └── tools/
        └── design-generate.test.ts
```

### D2: Tool Definitions

#### `design.generate`
- **Input**: `{ projectId: string, screenName: string, description: string, modelId?: string }`
- **Output**: `{ screenId: string, html: string, savedTo: string }`
- **Behavior**: Calls Stitch `generate_screen_from_text`, saves HTML to
  `<workspace>/.stitch-html/<screenName>.html`, returns path

#### `design.edit`
- **Input**: `{ projectId: string, screenId: string, editPrompt: string }`
- **Output**: `{ html: string, savedTo: string }`
- **Behavior**: Calls Stitch `edit_screens`, overwrites saved HTML

#### `design.get`
- **Input**: `{ screenName: string }`
- **Output**: `{ html: string, path: string }`
- **Behavior**: Reads from `.stitch-html/<screenName>.html`

#### `design.list`
- **Input**: `{}`
- **Output**: `{ designs: Array<{ name: string, path: string, modifiedAt: string }> }`
- **Behavior**: Lists all `.html` files in `.stitch-html/`

### D3: Stitch MCP Client

HTTP client that:
- Sends requests to `https://stitch.googleapis.com/mcp`
- Sets headers: `X-Goog-Api-Key`, `Accept: application/json`
- Handles MCP JSON-RPC protocol (method, params, id)
- Retry with exponential backoff on transient failures
- Timeout: 60 seconds (design generation can be slow)
- API key from environment variable `STITCH_API_KEY`

### D4: Configuration

```jsonc
// openclaw.plugin.json
{
  "id": "stitch-bridge",
  "name": "Stitch MCP Bridge",
  "description": "Proxy Google Stitch design tools for the designer agent",
  "configSchema": {
    "type": "object",
    "properties": {
      "endpoint": { "type": "string", "default": "https://stitch.googleapis.com/mcp" },
      "defaultProjectId": { "type": "string" },
      "defaultModel": { "type": "string", "default": "GEMINI_3_PRO" },
      "timeoutMs": { "type": "number", "default": 60000 },
      "designDir": { "type": "string", "default": ".stitch-html" }
    }
  }
}
```

## Acceptance Criteria

- [x] Plugin loads in OpenClaw without errors
- [x] `design.generate` calls Stitch MCP and saves HTML locally
- [x] `design.edit` modifies an existing design via Stitch
- [x] `design.get` reads a saved design from disk
- [x] `design.list` returns all designs in the workspace
- [x] Only the `designer` agent has access to `design.generate` and `design.edit`
- [x] `front-1` and `front-2` can read designs (`design.get`, `design.list`)
- [x] API key is read from environment (not hardcoded)
- [x] Stitch client retries transient failures
- [x] Designs persist in workspace volume across container restarts

## Testing Plan

1. Unit tests: mock Stitch HTTP responses, verify client parsing
2. Unit tests: tool input validation (schema enforcement)
3. Integration test: with mocked Stitch endpoint, verify full tool flow
4. Manual test: designer agent generates a screen, frontend agent reads it
5. Verify file system: `.stitch-html/` contains the generated HTML

## Technical Notes

- Stitch MCP uses JSON-RPC over HTTP (not WebSocket). The client is a simple
  HTTP POST wrapper.
- The Stitch project ID should be configurable per project workspace (for
  multi-project support in Task 0040)
- Design files are stored in the project workspace, not the plugin data
  directory, so they can be committed to the project repo if desired
