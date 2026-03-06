export interface StitchConfig {
  endpoint: string;
  defaultProjectId: string;
  defaultModel: string;
  timeoutMs: number;
  designDir: string;
}

interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface McpJsonRpcResponse {
  jsonrpc: '2.0';
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

/** MCP tools/call result content block. */
interface McpContentBlock {
  type: string;
  text?: string;
}

/** MCP tools/call result shape. */
interface McpToolResult {
  content?: McpContentBlock[];
  isError?: boolean;
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    // AbortError from timeout is deterministic — retrying won't help.
    if (err.name === 'AbortError') return false;
    const msg = err.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('socket') ||
      msg.includes('fetch failed')
    );
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Low-level JSON-RPC sender with retry logic. */
export async function sendRpc(
  config: StitchConfig,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const apiKey = process.env['STITCH_API_KEY'];
  if (!apiKey) {
    throw new Error('STITCH_API_KEY environment variable is not set');
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }

    const body: McpJsonRpcRequest = {
      jsonrpc: '2.0',
      id: `stitch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      method,
      params,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Goog-Api-Key': apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text().catch(() => 'unknown');
        const error = new Error(`Stitch MCP returned ${response.status}: ${text}`);
        // Only retry on 5xx server errors
        if (response.status >= 500 && attempt < MAX_ATTEMPTS - 1) {
          lastError = error;
          continue;
        }
        throw error;
      }

      const json = (await response.json()) as McpJsonRpcResponse;
      if (json.error) {
        throw new Error(`Stitch MCP error ${json.error.code}: ${json.error.message}`);
      }
      return json.result;
    } catch (err) {
      clearTimeout(timeout);
      if (isTransientError(err) && attempt < MAX_ATTEMPTS - 1) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

// ── MCP session management ──

const initializedEndpoints = new Set<string>();

/** Send MCP initialize handshake (once per endpoint). */
export async function initializeSession(config: StitchConfig): Promise<void> {
  if (initializedEndpoints.has(config.endpoint)) return;

  await sendRpc(config, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'stitch-bridge', version: '0.1.0' },
  });

  initializedEndpoints.add(config.endpoint);
}

/** Reset cached session state (for testing). */
export function resetSessionCache(): void {
  initializedEndpoints.clear();
}

/** Discover available tools on the Stitch MCP endpoint. */
export async function listTools(config: StitchConfig): Promise<unknown> {
  await initializeSession(config);
  return sendRpc(config, 'tools/list', {});
}

/**
 * Call a Stitch MCP tool using the standard MCP protocol.
 *
 * Sends `tools/call` with `{ name, arguments }` and parses the
 * response content array. Returns the parsed JSON from the first
 * text content block, or throws if the response is empty/error.
 */
export async function callStitchMcp(
  config: StitchConfig,
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<unknown> {
  await initializeSession(config);

  const raw = await sendRpc(config, 'tools/call', {
    name: toolName,
    arguments: toolArgs,
  });

  const result = raw as McpToolResult | undefined;

  if (result?.isError) {
    const msg = result.content?.[0]?.text ?? 'Unknown tool error';
    throw new Error(`Stitch tool "${toolName}" failed: ${msg}`);
  }

  const content = result?.content;
  if (!content || content.length === 0) {
    throw new Error(`Stitch tool "${toolName}" returned empty content`);
  }

  // Try to parse the first text block as JSON (most Stitch tools return structured data).
  const textBlock = content.find(b => b.type === 'text' && b.text);
  if (!textBlock?.text) {
    throw new Error(`Stitch tool "${toolName}" returned no text content`);
  }

  try {
    return JSON.parse(textBlock.text);
  } catch {
    // If not JSON, return the raw text wrapped in an object.
    return { text: textBlock.text };
  }
}
