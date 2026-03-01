import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as https from 'node:https';

type ProviderStatus = {
  connected: boolean;
  latencyMs: number;
  error?: string;
};

type HealthResponse = {
  ok: boolean;
  providers: Record<string, ProviderStatus>;
};

export const PROVIDERS: ReadonlyArray<{
  id: string;
  url: string;
  authHeaders: () => Record<string, string>;
}> = [
  {
    id: 'anthropic',
    // Use the models list endpoint — returns 401 without auth, 200 with valid key.
    // Both outcomes confirm the server is reachable.
    url: 'https://api.anthropic.com/v1/models',
    authHeaders: (): Record<string, string> => {
      const key = process.env['ANTHROPIC_API_KEY'];
      return key
        ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
        : { 'anthropic-version': '2023-06-01' };
    },
  },
  {
    id: 'openai-codex',
    // OpenAI Codex provider — authenticated via OAuth (JWT stored in auth-profiles.json).
    // Health check only verifies reachability (even a 401 confirms the endpoint is live).
    // Auth token is managed by the runtime, not via env vars.
    url: 'https://api.openai.com/v1/models',
    authHeaders: (): Record<string, string> => ({}),
  },
  {
    id: 'github-copilot',
    // GitHub Copilot provider — uses GitHub user token for the Copilot proxy API.
    // Health check only verifies reachability; auth is managed by the runtime
    // via auth-profiles.json (ghu_... token), not via GITHUB_TOKEN env var.
    url: 'https://api.individual.githubcopilot.com',
    authHeaders: (): Record<string, string> => ({}),
  },
  {
    id: 'openai-transcription',
    // OpenAI direct API — used only for audio transcription (gpt-4o-mini-transcribe).
    url: 'https://api.openai.com/v1/models',
    authHeaders: (): Record<string, string> => {
      const key = process.env['OPENAI_API_KEY'];
      return key ? { Authorization: `Bearer ${key}` } : {};
    },
  },
];

const TIMEOUT_MS = 5000;

export function checkProvider(
  url: string,
  authHeaders: Record<string, string>,
): Promise<ProviderStatus> {
  return new Promise(resolve => {
    const start = Date.now();
    const { hostname, pathname, search } = new URL(url);
    let settled = false;

    const done = (result: ProviderStatus): void => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const req = https.request(
      {
        hostname,
        path: pathname + search,
        method: 'HEAD',
        headers: authHeaders,
        timeout: TIMEOUT_MS,
      },
      (res: IncomingMessage) => {
        res.resume();
        const status = res.statusCode ?? 0;
        // 5xx means the server is up but degraded; treat as not connected.
        // 2xx, 3xx, and 4xx (auth/notfound) mean the server is reachable.
        const connected = status < 500;
        done({ connected, latencyMs: Date.now() - start });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      done({ connected: false, latencyMs: Date.now() - start, error: 'timeout' });
    });

    req.on('error', (err: Error) => {
      done({ connected: false, latencyMs: Date.now() - start, error: err.message });
    });

    req.end();
  });
}

function writeJson(
  req: IncomingMessage,
  res: ServerResponse,
  statusCode: number,
  body: HealthResponse | Record<string, unknown>,
): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  // HEAD responses MUST NOT include a message body (RFC 9110 §9.3.2).
  if (req.method === 'HEAD') {
    res.end();
  } else {
    res.end(JSON.stringify(body));
  }
}

export function registerProviderHealthRoute(
  api: OpenClawPluginApi,
  checkFn: typeof checkProvider = checkProvider,
): void {
  api.registerHttpRoute({
    path: '/api/providers/health',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        writeJson(req, res, 405, { ok: false, error: 'method_not_allowed' });
        return;
      }

      // Optional bearer-token auth: if HEALTH_CHECK_SECRET is set, enforce it.
      const secret = process.env['HEALTH_CHECK_SECRET'];
      if (secret) {
        const auth = (req.headers as Record<string, string>)['authorization'] ?? '';
        if (auth !== `Bearer ${secret}`) {
          writeJson(req, res, 401, { ok: false, error: 'unauthorized' });
          return;
        }
      }

      try {
        const results = await Promise.all(
          PROVIDERS.map(async p => ({
            id: p.id,
            status: await checkFn(p.url, p.authHeaders()),
          })),
        );

        const providers: Record<string, ProviderStatus> = {};
        for (const { id, status } of results) {
          providers[id] = status;
        }

        const allConnected = results.every(r => r.status.connected);
        const httpStatus = allConnected ? 200 : 207;
        writeJson(req, res, httpStatus, { ok: allConnected, providers });
      } catch (error: unknown) {
        writeJson(req, res, 500, { ok: false, error: String(error) });
      }
    },
  });

  api.logger.info('model-router: registered GET /api/providers/health');
}
