import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { config, type ApiKeyConfig } from './config.js';

const HMAC_WINDOW_MS = 5 * 60 * 1000;

export interface AuthResult {
  key: ApiKeyConfig;
}

function parseAuthorizationHeader(value?: string): string | null {
  if (!value) {
    return null;
  }
  const [scheme, token] = value.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }
  return token.trim();
}

function verifyHmac(key: ApiKeyConfig, request: FastifyRequest): boolean {
  if (!key.hmacSecret) {
    return true;
  }

  const signatureHeader = request.headers['x-signature'];
  const timestampHeader = request.headers['x-timestamp'];
  if (typeof signatureHeader !== 'string' || typeof timestampHeader !== 'string') {
    return false;
  }

  const [algorithm, providedDigest] = signatureHeader.split('=');
  if (algorithm?.toLowerCase() !== 'sha256' || !providedDigest) {
    return false;
  }

  const timestamp = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > HMAC_WINDOW_MS) {
    return false;
  }

  const body = JSON.stringify(request.body ?? {});

  const canonical = `${timestampHeader}${body}`;
  const computed = crypto.createHmac('sha256', key.hmacSecret).update(canonical).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(providedDigest, 'hex'), Buffer.from(computed, 'hex'));
}

export function requireAuth(request: FastifyRequest, scope: 'run' | 'read'): AuthResult {
  const token = parseAuthorizationHeader(request.headers.authorization);
  if (!token) {
    const error = new Error('Missing Authorization header');
    (error as any).code = 'UNAUTHORIZED';
    throw error;
  }

  const key = config.apiKeys.get(token);
  if (!key) {
    const error = new Error('Invalid API key');
    (error as any).code = 'FORBIDDEN';
    throw error;
  }

  if (!key.scopes.has(scope)) {
    const error = new Error('Insufficient scope');
    (error as any).code = 'FORBIDDEN';
    throw error;
  }

  if (!verifyHmac(key, request)) {
    const error = new Error('Invalid signature');
    (error as any).code = 'FORBIDDEN';
    throw error;
  }

  return { key };
}
