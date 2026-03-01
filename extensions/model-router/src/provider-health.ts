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

const PROVIDERS: ReadonlyArray<{
  id: string;
  url: string;
  authHeaders: () => Record<string, string>;
}> = [
  {
    id: 'openai',
    url: 'https://api.openai.com/v1/models',
    authHeaders: (): Record<string, string> => {
      const key = process.env['OPENAI_API_KEY'];
      return key ? { Authorization: `Bearer ${key}` } : {};
    },
  },
  {
    id: 'anthropic',
    url: 'https://api.anthropic.com',
    authHeaders: (): Record<string, string> => {
      const key = process.env['ANTHROPIC_API_KEY'];
      return key ? { 'x-api-key': key } : {};
    },
  },
  {
    id: 'google',
    url: 'https://generativelanguage.googleapis.com',
    authHeaders: (): Record<string, string> => {
      const key = process.env['GOOGLE_AI_API_KEY'];
      return key ? { 'x-goog-api-key': key } : {};
    },
  },
];

const TIMEOUT_MS = 5000;

function checkProvider(
  url: string,
  authHeaders: Record<string, string>,
): Promise<ProviderStatus> {
  return new Promise(resolve => {
    const start = Date.now();
    const { hostname, pathname } = new URL(url);
    const req = https.request(
      {
        hostname,
        path: pathname,
        method: 'HEAD',
        headers: authHeaders,
        timeout: TIMEOUT_MS,
      },
      (res: IncomingMessage) => {
        res.resume();
        resolve({ connected: true, latencyMs: Date.now() - start });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ connected: false, latencyMs: Date.now() - start, error: 'timeout' });
    });
    req.on('error', (err: Error) => {
      resolve({ connected: false, latencyMs: Date.now() - start, error: err.message });
    });
    req.end();
  });
}

function writeJson(res: ServerResponse, statusCode: number, body: HealthResponse | Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function registerProviderHealthRoute(api: OpenClawPluginApi): void {
  api.registerHttpRoute({
    path: '/api/providers/health',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        writeJson(res, 405, { ok: false, error: 'method_not_allowed' });
        return;
      }

      try {
        const results = await Promise.all(
          PROVIDERS.map(async p => ({
            id: p.id,
            status: await checkProvider(p.url, p.authHeaders()),
          })),
        );

        const providers: Record<string, ProviderStatus> = {};
        for (const { id, status } of results) {
          providers[id] = status;
        }

        const allConnected = results.every(r => r.status.connected);
        const httpStatus = allConnected ? 200 : 207;
        writeJson(res, httpStatus, { ok: allConnected, providers });
      } catch (error: unknown) {
        writeJson(res, 500, { ok: false, error: String(error) });
      }
    },
  });

  api.logger.info('model-router: registered GET /api/providers/health');
}
