import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifySSEPlugin from 'fastify-sse-v2';
import pLimit from 'p-limit';
import { ulid } from 'ulid';
import { config } from './config.js';
import { requireAuth } from './auth.js';
import { rateLimiter } from './rateLimit.js';
import { invokeTool } from './exec.js';
import { sendSse } from './sse.js';
import { invokeSchema, responseSchema, errorSchema } from './schemas.js';
import { validateToolResult } from './resultValidators.js';
import { inflightGauge, latencyHistogram, requestsTotal, toolFailures, registry } from './metrics.js';
import type { ToolName } from './toolNames.js';

const limiter = pLimit(config.maxConcurrency > 0 ? config.maxConcurrency : 1);

interface ToolBody {
  tool: ToolName;
  input: unknown;
  requestId?: string;
  timeoutMs?: number;
}

function currentTime(): number {
  return Date.now();
}

function errorResponse(requestId: string, code: string, message: string, details?: unknown) {
  const errorPayload: Record<string, unknown> = { code, message };
  if (details !== undefined) {
    errorPayload.details = details;
  }
  return {
    ok: false,
    error: errorPayload,
    requestId
  };
}

function successResponse(requestId: string, tool: string, result: unknown) {
  return {
    ok: true,
    tool,
    result,
    requestId
  };
}

function mapError(error: unknown): { code: string; message: string; statusCode: number } {
  if (!error) {
    return { code: 'INTERNAL_ERROR', message: 'Unknown error', statusCode: 500 };
  }
  const err = error as any;
  const code = typeof err.code === 'string' ? err.code : 'INTERNAL_ERROR';
  const message = err.message ?? 'Unexpected error';
  switch (code) {
    case 'UNAUTHORIZED':
      return { code, message, statusCode: 401 };
    case 'FORBIDDEN':
      return { code, message, statusCode: 403 };
    case 'RATE_LIMIT':
      return { code, message, statusCode: 429 };
    case 'VALIDATION_ERROR':
      return { code, message, statusCode: 400 };
    case 'TIMEOUT':
      return { code, message, statusCode: 504 };
    case 'NOT_FOUND':
      return { code, message, statusCode: 404 };
    case 'RUNNER_ERROR':
      return { code, message, statusCode: 422 };
    case 'PARSE_ERROR':
      return { code, message, statusCode: 500 };
    default:
      return { code, message, statusCode: 500 };
  }
}

async function handleInvocation(request: FastifyRequest<{ Body: ToolBody }>, reply: FastifyReply, stream = false) {
  const start = currentTime();
  const requestId = (request as any).reqId as string;
  let auth;
  try {
    auth = requireAuth(request, 'run');
  } catch (error) {
    const mapped = mapError(error);
    requestsTotal.inc({ tool: request.body.tool, status: mapped.code.toLowerCase() });
    if (stream) {
      sendSse(reply, {
        event: 'error',
        data: { code: mapped.code, message: mapped.message, requestId }
      });
      reply.sseContext.source.end();
    } else {
      reply.code(mapped.statusCode).send(errorResponse(requestId, mapped.code, mapped.message));
    }
    return;
  }

  if (!rateLimiter.consume(auth.key.key)) {
    requestsTotal.inc({ tool: request.body.tool, status: 'rate_limited' });
    const payload = errorResponse(requestId, 'RATE_LIMIT', 'Rate limit exceeded');
    if (stream) {
      sendSse(reply, { event: 'error', data: { code: 'RATE_LIMIT', message: 'Rate limit exceeded', requestId } });
      reply.sseContext.source.end();
    } else {
      reply.code(429).send(payload);
    }
    return;
  }

  inflightGauge.inc();
  try {
    if (stream) {
      sendSse(reply, { event: 'log', data: { level: 'info', msg: 'Tool execution started', requestId } });
    }
    const limited = await limiter(() =>
      invokeTool(request.body.tool, request.body.input, {
        requestId,
        timeoutMs: request.body.timeoutMs
      })
    );
    validateToolResult(request.body.tool, limited);

    const resultPayload = successResponse(requestId, request.body.tool, limited);
    const latency = currentTime() - start;
    latencyHistogram.observe({ tool: request.body.tool, status: 'ok' }, latency);
    requestsTotal.inc({ tool: request.body.tool, status: 'ok' });
    request.log.info(
      { requestId, tool: request.body.tool, latencyMs: latency },
      'Tool invocation completed'
    );

    if (stream) {
      sendSse(reply, { event: 'log', data: { level: 'info', msg: 'Tool execution completed', requestId } });
      sendSse(reply, { event: 'result', data: { result: limited, requestId } });
      reply.sseContext.source.end();
      return;
    }

    reply.code(200).send(resultPayload);
  } catch (error) {
    const mapped = mapError(error);
    const details = (error as any)?.details;
    toolFailures.inc({ tool: request.body.tool, code: mapped.code });
    requestsTotal.inc({ tool: request.body.tool, status: mapped.code.toLowerCase() });
    const latency = currentTime() - start;
    latencyHistogram.observe({ tool: request.body.tool, status: 'error' }, latency);
    request.log.error(
      { requestId, tool: request.body.tool, error: mapped, latencyMs: latency },
      'Tool invocation failed'
    );

    if (stream) {
      const errorData: Record<string, unknown> = { code: mapped.code, message: mapped.message, requestId };
      if (details !== undefined) {
        errorData.details = details;
      }
      sendSse(reply, {
        event: 'error',
        data: errorData
      });
      reply.sseContext.source.end();
      return;
    }

    reply.code(mapped.statusCode).send(errorResponse(requestId, mapped.code, mapped.message, details));
  } finally {
    inflightGauge.dec();
  }
}

export async function registerRoutes(app: FastifyInstance) {
  if (config.allowedOrigins.length > 0) {
    const { default: cors } = await import('@fastify/cors');
    await app.register(cors, {
      origin: (origin, cb) => {
        if (!origin || config.allowedOrigins.includes(origin)) {
          cb(null, true);
          return;
        }
        cb(new Error('Invalid origin'), false);
      },
      exposedHeaders: ['X-Request-Id']
    });
  }

  await app.register(fastifySSEPlugin as any);

  app.addHook('preHandler', async (request, reply) => {
    const headerId = request.headers['x-request-id'] as string | undefined;
    const bodyId = (request as any).body?.requestId as string | undefined;
    const reqId = headerId ?? bodyId ?? ulid();
    reply.header('X-Request-Id', reqId);
    (request as any).reqId = reqId;
  });

  app.post<{ Body: ToolBody }>(
    '/mcp/tool',
    { schema: { ...invokeSchema, response: { 200: responseSchema, '4xx': errorSchema, '5xx': errorSchema } } },
    async (request, reply) => {
    await handleInvocation(request, reply, false);
    }
  );

  app.post<{ Body: ToolBody }>('/mcp/tool/stream', { schema: invokeSchema }, async (request, reply) => {
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    await handleInvocation(request, reply, true);
  });

  app.get('/healthz', async (_request, reply) => {
    reply.send({ status: 'ok' });
  });

  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });
}
