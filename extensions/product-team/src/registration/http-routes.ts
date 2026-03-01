/**
 * HTTP Route Registration
 *
 * Registers all HTTP routes for the product-team plugin: the /health endpoint
 * and the GitHub CI feedback webhook. Extracted from index.ts (D-004).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GithubConfig } from '../config/plugin-config.js';
import type { CiFeedbackAutomation } from '../github/ci-feedback.js';
import { createHealthCheckHandler, type HealthCheckDeps } from '../services/health-check.js';
import { registerCiWebhookRoute } from './ci-webhook-route.js';

interface Logger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
}

interface RouteRegistrar {
  registerHttpRoute: (params: {
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }) => void;
  logger: Logger;
}

export interface HttpRoutesConfig {
  readonly healthCheck: HealthCheckDeps;
  readonly githubConfig: GithubConfig;
}

export interface HttpRoutesServices {
  readonly ciFeedbackAutomation: CiFeedbackAutomation;
}

export function registerHttpRoutes(
  api: RouteRegistrar,
  config: HttpRoutesConfig,
  services: HttpRoutesServices,
): void {
  // Register production health check endpoint: GET /health
  api.registerHttpRoute({
    path: '/health',
    handler: createHealthCheckHandler(config.healthCheck),
  });
  api.logger.info('registered GET /health endpoint');

  registerCiWebhookRoute(
    api,
    config.githubConfig,
    services.ciFeedbackAutomation,
    api.logger,
  );
}
