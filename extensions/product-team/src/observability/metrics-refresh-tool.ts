/**
 * Metrics Refresh Tool (EP14, Task 0099)
 *
 * Registers a `metrics.refresh` tool that triggers on-demand metrics aggregation.
 */

import type { ToolDef, ToolDeps } from '../tools/index.js';
import type { MetricsAggregator } from './metrics-aggregator.js';
import { MetricsRefreshParams, type MetricsRefreshInput, type MetricPeriod } from './metrics-types.js';

export function metricsRefreshToolDef(
  deps: ToolDeps,
  aggregator: MetricsAggregator,
): ToolDef {
  return {
    name: 'metrics.refresh',
    label: 'Refresh Metrics',
    description:
      'Trigger on-demand metrics aggregation. Computes agent activity, event counts, pipeline throughput, cost summary, and stage duration from the event log.',
    parameters: MetricsRefreshParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<MetricsRefreshInput>(MetricsRefreshParams, params);
      const period: MetricPeriod = input.period ?? 'hour';

      const result = aggregator.refresh(period);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
