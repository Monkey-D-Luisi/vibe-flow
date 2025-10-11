import type { FastifyReply } from 'fastify';

export interface SseEvent<T = unknown> {
  event: 'log' | 'chunk' | 'result' | 'error';
  data: T;
}

export function sendSse<T>(reply: FastifyReply, event: SseEvent<T>) {
  const payload = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
  reply.sse({ event: event.event, data: payload });
}
