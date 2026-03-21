/**
 * Decision Query HTTP Handlers
 *
 * Exposes decision data via HTTP endpoints so other plugins (e.g. telegram-notifier)
 * can list, approve, and reject escalated decisions without accessing the DB directly.
 *
 * EP13 Task 0096
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import type Database from 'better-sqlite3';

export interface DecisionQueryDeps {
  readonly db: Database.Database;
}

const MAX_BODY_BYTES = 65_536;

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('payload_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

export function createDecisionQueryHandler(
  deps: DecisionQueryDeps,
): (req: IncomingMessage, res: ServerResponse) => void | Promise<void> {
  return async (req, res) => {
    const baseUrl = `http://localhost${req.url ?? '/'}`;
    const url = new URL(baseUrl);
    const pathname = url.pathname;

    if (req.method === 'GET' && pathname === '/api/decisions') {
      const status = url.searchParams.get('status');
      let rows: unknown[];

      if (status === 'pending') {
        rows = deps.db.prepare(
          'SELECT id, task_ref, agent_id, category, question, options, decision, reasoning, escalated, approver, created_at FROM agent_decisions WHERE decision IS NULL AND escalated = 1 ORDER BY created_at DESC LIMIT 50',
        ).all();
      } else {
        rows = deps.db.prepare(
          'SELECT id, task_ref, agent_id, category, question, options, decision, reasoning, escalated, approver, created_at FROM agent_decisions ORDER BY created_at DESC LIMIT 50',
        ).all();
      }

      sendJson(res, 200, { decisions: rows });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/decisions/approve') {
      let raw: string;
      try {
        raw = await readBody(req);
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'payload_too_large') {
          sendJson(res, 413, { error: 'Payload too large' });
          return;
        }
        throw err;
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      const decisionId = typeof body['decisionId'] === 'string' ? body['decisionId'] : '';
      const choice = typeof body['choice'] === 'string' ? body['choice'] : '';

      if (!decisionId || !choice) {
        sendJson(res, 400, { error: 'Missing required fields: decisionId, choice' });
        return;
      }

      const result = deps.db.transaction(() => {
        const row = deps.db.prepare(
          'SELECT id, decision FROM agent_decisions WHERE id = ?',
        ).get(decisionId) as { id: string; decision: string | null } | undefined;

        if (!row) return { status: 404 as const, body: { error: `Decision "${decisionId}" not found` } };
        if (row.decision !== null) return { status: 409 as const, body: { error: `Decision "${decisionId}" already resolved: ${row.decision}` } };

        deps.db.prepare(
          "UPDATE agent_decisions SET decision = ?, reasoning = COALESCE(reasoning, '') || ? WHERE id = ?",
        ).run(choice, ' [Approved via API by human]', decisionId);

        return { status: 200 as const, body: { approved: true, decisionId, choice } };
      })();

      sendJson(res, result.status, result.body);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/decisions/reject') {
      let raw: string;
      try {
        raw = await readBody(req);
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'payload_too_large') {
          sendJson(res, 413, { error: 'Payload too large' });
          return;
        }
        throw err;
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      const decisionId = typeof body['decisionId'] === 'string' ? body['decisionId'] : '';
      const reason = typeof body['reason'] === 'string' ? body['reason'] : 'Rejected via API';

      if (!decisionId) {
        sendJson(res, 400, { error: 'Missing required field: decisionId' });
        return;
      }

      const result = deps.db.transaction(() => {
        const row = deps.db.prepare(
          'SELECT id, decision FROM agent_decisions WHERE id = ?',
        ).get(decisionId) as { id: string; decision: string | null } | undefined;

        if (!row) return { status: 404 as const, body: { error: `Decision "${decisionId}" not found` } };
        if (row.decision !== null) return { status: 409 as const, body: { error: `Decision "${decisionId}" already resolved` } };

        deps.db.prepare(
          "UPDATE agent_decisions SET approver = 'tech-lead', reasoning = COALESCE(reasoning, '') || ? WHERE id = ?",
        ).run(` [Rejected via API: ${reason}]`, decisionId);

        return { status: 200 as const, body: { rejected: true, decisionId, reEscalatedTo: 'tech-lead' } };
      })();

      sendJson(res, result.status, result.body);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  };
}
