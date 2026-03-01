/**
 * CI Feedback Webhook Route
 *
 * Registers the GitHub CI webhook HTTP route on the provided api registrar.
 * Extracted from index.ts to keep registration concerns modular (D-004).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GithubConfig } from '../config/plugin-config.js';
import {
  CiFeedbackAutomation,
  InvalidJsonPayloadError,
  parseJsonRequestBody,
  RequestBodyTooLargeError,
  readRequestBody,
} from '../github/ci-feedback.js';
import {
  assertValidGithubWebhookSignature,
  InvalidGithubSignatureError,
  MissingGithubSignatureError,
} from '../github/webhook-signature.js';

interface Logger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
}

interface RouteRegistrar {
  registerHttpRoute: (params: {
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }) => void;
}

function asNonEmptyString(value: string | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return asNonEmptyString(value[0]);
  }
  return asNonEmptyString(value);
}

function writeJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function registerCiWebhookRoute(
  api: RouteRegistrar,
  githubConfig: GithubConfig,
  ciFeedbackAutomation: CiFeedbackAutomation,
  logger: Logger,
): void {
  if (!githubConfig.ciFeedback.enabled) {
    return;
  }

  api.registerHttpRoute({
    path: githubConfig.ciFeedback.routePath,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: 'method_not_allowed' });
        return;
      }

      const eventName = headerValue(req.headers['x-github-event']);
      if (!eventName) {
        writeJson(res, 400, { ok: false, error: 'missing_x_github_event_header' });
        return;
      }

      try {
        const payloadBytes = await readRequestBody(req);
        const signature = headerValue(req.headers['x-hub-signature-256']);
        assertValidGithubWebhookSignature(
          githubConfig.ciFeedback.webhookSecret,
          payloadBytes,
          signature,
        );
        const payload = parseJsonRequestBody(payloadBytes);
        const deliveryId = headerValue(req.headers['x-github-delivery']);
        const result = await ciFeedbackAutomation.handleGithubWebhook({
          eventName,
          deliveryId,
          payload,
        });
        writeJson(res, result.handled ? 200 : 202, { ok: true, ...result });
      } catch (error: unknown) {
        const message = String(error);
        logger.warn(`ci-feedback webhook failed: ${message}`);
        if (error instanceof RequestBodyTooLargeError) {
          writeJson(res, 413, { ok: false, error: 'payload_too_large' });
          return;
        }
        if (error instanceof MissingGithubSignatureError) {
          writeJson(res, 401, { ok: false, error: 'missing_x_hub_signature_256_header' });
          return;
        }
        if (error instanceof InvalidGithubSignatureError) {
          writeJson(res, 401, { ok: false, error: 'invalid_x_hub_signature_256' });
          return;
        }
        if (error instanceof InvalidJsonPayloadError || error instanceof SyntaxError) {
          writeJson(res, 400, { ok: false, error: 'invalid_json_payload' });
          return;
        }
        writeJson(res, 500, { ok: false, error: 'ci_feedback_processing_failed' });
      }
    },
  });

  logger.info(`registered CI webhook route at ${githubConfig.ciFeedback.routePath}`);
}
