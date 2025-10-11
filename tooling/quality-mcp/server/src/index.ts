import Fastify from 'fastify';
import pino from 'pino';
import { config } from './config.js';
import { registerRoutes } from './router.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

const app = Fastify({
  logger: logger as any,
  bodyLimit: config.maxBodySize
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  if (!reply.sent) {
    const requestId = (reply.getHeader('X-Request-Id') as string | undefined) ?? String(request.headers['x-request-id'] ?? '');
    reply.code(500).send({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      },
      requestId
    });
  }
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
