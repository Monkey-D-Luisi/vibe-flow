/**
 * HTTP Route Registration
 *
 * Registers all HTTP routes for the product-team plugin: the /health endpoint,
 * budget/decision API endpoints (EP13), and the GitHub CI feedback webhook.
 * Extracted from index.ts (D-004).
 */

import type { Logger, RouteRegistrar } from './types.js';
import type { GithubConfig } from '../config/plugin-config.js';
import type { CiFeedbackAutomation } from '../github/ci-feedback.js';
import { createHealthCheckHandler, type HealthCheckDeps } from '../services/health-check.js';
import { createBudgetQueryHandler, type BudgetQueryDeps } from '../services/budget-query-handler.js';
import { createDecisionQueryHandler, type DecisionQueryDeps } from '../services/decision-query-handler.js';
import { createMetricsQueryHandler, type MetricsQueryDeps } from '../observability/metrics-query-handler.js';
import { registerCiWebhookRoute } from './ci-webhook-route.js';

interface RouteRegistrarWithLogger extends RouteRegistrar {
  logger: Logger;
}

export interface HttpRoutesConfig {
  readonly healthCheck: HealthCheckDeps;
  readonly githubConfig: GithubConfig;
  readonly budgetQuery: BudgetQueryDeps;
  readonly decisionQuery: DecisionQueryDeps;
  readonly metricsQuery?: MetricsQueryDeps;
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

  // Register budget API endpoints (EP13 Task 0096)
  const budgetHandler = createBudgetQueryHandler(config.budgetQuery);
  api.registerHttpRoute({ path: '/api/budget', auth: 'plugin', handler: budgetHandler });
  api.registerHttpRoute({ path: '/api/budget/replenish', auth: 'plugin', handler: budgetHandler });
  api.registerHttpRoute({ path: '/api/budget/reset', auth: 'plugin', handler: budgetHandler });
  api.logger.info('registered /api/budget endpoints');

  // Register decision API endpoints (EP13 Task 0096)
  const decisionHandler = createDecisionQueryHandler(config.decisionQuery);
  api.registerHttpRoute({ path: '/api/decisions', auth: 'plugin', handler: decisionHandler });
  api.registerHttpRoute({ path: '/api/decisions/approve', auth: 'plugin', handler: decisionHandler });
  api.registerHttpRoute({ path: '/api/decisions/reject', auth: 'plugin', handler: decisionHandler });
  api.logger.info('registered /api/decisions endpoints');

  // Register observability metrics endpoint (EP14 Task 0100)
  if (config.metricsQuery) {
    const metricsHandler = createMetricsQueryHandler(config.metricsQuery);
    api.registerHttpRoute({ path: '/api/metrics', auth: 'plugin', handler: metricsHandler });
    api.logger.info('registered /api/metrics endpoint');
  }

  registerCiWebhookRoute(
    api,
    config.githubConfig,
    services.ciFeedbackAutomation,
    api.logger,
  );
}
