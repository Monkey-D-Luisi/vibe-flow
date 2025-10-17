import Fastify from 'fastify';
import pino from 'pino';
import { config } from './config.js';
import { registerRoutes } from './router.js';

const level = process.env.LOG_LEVEL ?? 'info';
const pretty = process.env.QUALITY_PRETTY_LOGS === 'true';
export const log = pretty
  ? pino({ level, transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true, translateTime: 'SYS:standard' } } })
  : pino({ level });

const app = Fastify({
  logger: log as any,
  bodyLimit: config.maxBodySize
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  if (reply.sent) {
    return;
  }

  const requestId = (reply.getHeader('X-Request-Id') as string | undefined) ?? String(request.headers['x-request-id'] ?? '');
  if (requestId) {
    reply.header('X-Request-Id', requestId);
  }

  if ((error as any)?.validation) {
    reply.code(400).send({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message ?? 'Request validation failed',
        details: (error as any).validation
      },
      requestId
    });
    return;
  }

  reply.code(500).send({
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    },
    requestId
  });
});

async function main() {
  if (config.apiKeys.size === 0) {
    app.log.warn('QUALITY_MCP_KEYS is empty; all requests will be rejected');
  }
  await registerRoutes(app);
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info({ port: config.port }, 'Quality MCP server listening');
}

main().catch((error) => {
  app.log.error({ err: error }, 'Failed to start server');
  process.exit(1);
});
