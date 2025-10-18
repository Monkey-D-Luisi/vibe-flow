import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { normalizeForFingerprint } from '../utils/normalize.js';

export interface GithubRequestRecord {
  requestId: string;
  tool: string;
  payloadHash: string;
  response: unknown;
  createdAt: string;
}

function computeHash(payload: unknown): string {
  const normalized = JSON.stringify(normalizeForFingerprint(payload ?? {}));
  return createHash('sha256').update(normalized).digest('hex');
}

export class GithubRequestRepository {
  constructor(private readonly db: Database.Database) {}

  find(requestId: string): GithubRequestRecord | null {
    const stmt = this.db.prepare(
      'SELECT request_id, tool, payload_hash, response_json, created_at FROM github_requests WHERE request_id = ?'
    );
    const row = stmt.get(requestId) as
      | { request_id: string; tool: string; payload_hash: string; response_json: string; created_at: string }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      requestId: row.request_id,
      tool: row.tool,
      payloadHash: row.payload_hash,
      response: JSON.parse(row.response_json),
      createdAt: row.created_at
    };
  }

  async ensure<T>(requestId: string, tool: string, payload: unknown, responder: () => Promise<T>): Promise<T> {
    const existing = this.find(requestId);
    const payloadHash = computeHash(payload);

    if (existing) {
      if (existing.tool !== tool || existing.payloadHash !== payloadHash) {
        throw new Error(`Request ${requestId} already used for different payload`);
      }
      return existing.response as T;
    }

    const response = await responder();
    const insert = this.db.prepare(
      `INSERT INTO github_requests (request_id, tool, payload_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    insert.run(requestId, tool, payloadHash, JSON.stringify(response ?? {}), new Date().toISOString());
    return response;
  }
}
