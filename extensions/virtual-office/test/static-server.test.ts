import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createStaticHandler } from '../src/http/static-server.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Minimal mock for IncomingMessage. */
function mockReq(
  url: string,
  method = 'GET',
): IncomingMessage {
  return {
    url,
    method,
    headers: { host: 'localhost:28789' },
  } as unknown as IncomingMessage;
}

/** Minimal mock for ServerResponse that captures output. */
function mockRes(): ServerResponse & {
  _statusCode: number;
  _headers: Record<string, string>;
  _body: string;
} {
  const headers: Record<string, string> = {};
  let body = '';
  let statusCode = 200;

  const res = {
    get _statusCode() { return statusCode; },
    get _headers() { return headers; },
    get _body() { return body; },
    set statusCode(code: number) { statusCode = code; },
    get statusCode() { return statusCode; },
    setHeader(name: string, value: string) { headers[name] = value; },
    end(data?: Buffer | string) {
      if (data instanceof Buffer) body = data.toString('utf-8');
      else if (typeof data === 'string') body = data;
    },
  } as unknown as ServerResponse & {
    _statusCode: number;
    _headers: Record<string, string>;
    _body: string;
  };

  return res;
}

const TEST_DIR = resolve(import.meta.dirname ?? '.', '__test-static__');

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  await writeFile(join(TEST_DIR, 'index.html'), '<html><body>Hello</body></html>');
  await writeFile(join(TEST_DIR, 'office.js'), 'console.log("ok");');
  await writeFile(join(TEST_DIR, 'style.css'), 'body { margin: 0; }');
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('createStaticHandler', () => {
  const handler = createStaticHandler({
    baseDir: TEST_DIR,
    urlPrefix: '/office',
  });

  it('serves index.html for /office', async () => {
    const req = mockReq('/office');
    const res = mockRes();
    await handler(req, res);
    expect(res._statusCode).toBe(200);
    expect(res._headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res._body).toContain('<html>');
  });

  it('serves index.html for /office/', async () => {
    const req = mockReq('/office/');
    const res = mockRes();
    await handler(req, res);
    expect(res._statusCode).toBe(200);
    expect(res._body).toContain('<html>');
  });

  it('serves JS files with correct content-type', async () => {
    const req = mockReq('/office/office.js');
    const res = mockRes();
    await handler(req, res);
    expect(res._statusCode).toBe(200);
    expect(res._headers['content-type']).toBe('application/javascript; charset=utf-8');
    expect(res._body).toContain('console.log');
  });

  it('serves CSS files with correct content-type', async () => {
    const req = mockReq('/office/style.css');
    const res = mockRes();
    await handler(req, res);
    expect(res._statusCode).toBe(200);
    expect(res._headers['content-type']).toBe('text/css; charset=utf-8');
  });

  it('returns 404 for missing files', async () => {
    const req = mockReq('/office/nonexistent.js');
    const res = mockRes();
    await handler(req, res);
    expect(res._statusCode).toBe(404);
    expect(res._body).toBe('Not Found');
  });

  it('blocks path traversal with ../', async () => {
    const req = mockReq('/office/../../../etc/passwd');
    const res = mockRes();
    await handler(req, res);
    expect(res._statusCode).toBe(404);
  });

  it('blocks path traversal with encoded ../', async () => {
    const req = mockReq('/office/%2e%2e/%2e%2e/etc/passwd');
    const res = mockRes();
    await handler(req, res);
    expect(res._statusCode).toBe(404);
  });

  it('returns 405 for POST requests', async () => {
    const req = mockReq('/office', 'POST');
    const res = mockRes();
    await handler(req, res);
    expect(res._statusCode).toBe(405);
    expect(res._body).toBe('Method Not Allowed');
  });

  it('handles HEAD requests without body', async () => {
    const req = mockReq('/office/index.html', 'HEAD');
    const res = mockRes();
    await handler(req, res);
    expect(res._statusCode).toBe(200);
    expect(res._headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res._body).toBe('');
  });
});
