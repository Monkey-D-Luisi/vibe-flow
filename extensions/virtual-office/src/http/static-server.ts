/**
 * Static File Server
 *
 * Serves static files from a base directory via HTTP, with MIME type detection
 * and path traversal prevention. Used to serve the virtual office frontend.
 */

import { readFile } from 'node:fs/promises';
import { resolve, normalize, extname } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

export interface StaticServerOptions {
  /** Filesystem directory containing the static files. */
  readonly baseDir: string;
  /** URL prefix to strip before resolving file paths (e.g. '/office'). */
  readonly urlPrefix: string;
}

/**
 * Creates an HTTP handler that serves files from `baseDir`.
 * Path traversal attacks are blocked by verifying the resolved path
 * stays within `baseDir`.
 */
export function createStaticHandler(
  opts: StaticServerOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const baseDir = resolve(opts.baseDir);
  const prefix = opts.urlPrefix.replace(/\/+$/, '');

  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Method Not Allowed');
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    let relativePath = decodeURIComponent(url.pathname);

    // Strip the URL prefix
    if (relativePath.startsWith(prefix)) {
      relativePath = relativePath.slice(prefix.length);
    }

    // Default to index.html for root or empty path
    if (relativePath === '' || relativePath === '/') {
      relativePath = '/index.html';
    }

    // Normalize and resolve the path
    const normalizedPath = normalize(relativePath);
    const filePath = resolve(baseDir, '.' + normalizedPath);

    // Path traversal prevention: ensure resolved path is inside baseDir
    if (!filePath.startsWith(baseDir)) {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Not Found');
      return;
    }

    try {
      const data = await readFile(filePath);
      const mimeType = getMimeType(filePath);

      res.statusCode = 200;
      res.setHeader('content-type', mimeType);
      res.setHeader('cache-control', 'no-cache');

      if (req.method === 'HEAD') {
        res.setHeader('content-length', data.length);
        res.end();
      } else {
        res.end(data);
      }
    } catch {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Not Found');
    }
  };
}
