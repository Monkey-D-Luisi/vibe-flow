/**
 * HTTP Route Registration
 *
 * Registers all HTTP routes for the product-team plugin: the /health endpoint
 * and the GitHub CI feedback webhook. Extracted from index.ts (D-004).
 */

import type { Logger, RouteRegistrar } from './types.js';
import type { GithubConfig } from '../config/plugin-config.js';
import type { CiFeedbackAutomation } from '../github/ci-feedback.js';
import { createHealthCheckHandler, type HealthCheckDeps } from '../services/health-check.js';
import { registerCiWebhookRoute } from './ci-webhook-route.js';

interface RouteRegistrarWithLogger extends RouteRegistrar {
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
  api: RouteRegistrarWithLogger,
  config: HttpRoutesConfig,
  services: HttpRoutesServices,
): void {
  // Register production health check endpoint: GET /health
  api.registerHttpRoute({
    path: '/health',
    auth: 'plugin',
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
