export interface StitchConfig {
  endpoint: string;
  defaultProjectId: string;
  defaultModel: string;
  timeoutMs: number;
  designDir: string;
}

interface StitchJsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface StitchJsonRpcResponse {
  jsonrpc: '2.0';
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      err.name === 'AbortError' ||
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

export async function callStitchMcp(
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

    const body: StitchJsonRpcRequest = {
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

      const json = (await response.json()) as StitchJsonRpcResponse;
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
