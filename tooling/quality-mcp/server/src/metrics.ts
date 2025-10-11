import client from 'prom-client';

export const registry = new client.Registry();

export const requestsTotal = new client.Counter({
  name: 'quality_mcp_requests_total',
  help: 'Total number of tool invocations',
  labelNames: ['tool', 'status']
});

export const inflightGauge = new client.Gauge({
  name: 'quality_mcp_requests_inflight',
  help: 'Concurrent requests currently being processed'
});

export const latencyHistogram = new client.Histogram({
  name: 'quality_mcp_latency_ms',
  help: 'Latency of tool invocations in milliseconds',
  labelNames: ['tool', 'status'],
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 60000]
});

export const toolFailures = new client.Counter({
  name: 'quality_mcp_tool_failures_total',
  help: 'Total number of tool failures by error code',
  labelNames: ['tool', 'code']
});

registry.registerMetric(requestsTotal);
registry.registerMetric(inflightGauge);
registry.registerMetric(latencyHistogram);
registry.registerMetric(toolFailures);

client.collectDefaultMetrics({ register: registry });
