import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { createConfigGetHandler, handleConfigUpdate } from './handlers/config-handlers.js';
import { handleAgentsList, handleAgentsUpdate } from './handlers/agent-handlers.js';
import {
  handleProjectsList,
  handleProjectsAdd,
  handleProjectsRemove,
} from './handlers/project-handlers.js';
import {
  handlePipelineStatus,
  handleCostsSummary,
  handleEventsStream,
  handleProvidersStatus,
  handleDecisionsList,
} from './handlers/pipeline-handlers.js';

const BASE_PATH = '/team';

export default {
  id: 'team-ui',
  name: 'Team Configuration UI',
  description: 'Web UI for managing the autonomous product team',

  register(api: OpenClawPluginApi) {
    const logger = api.logger;
    const cfg = (typeof api.pluginConfig === 'object' && api.pluginConfig !== null)
      ? (api.pluginConfig as Record<string, unknown>)
      : {};
    const basePath = (typeof cfg['basePath'] === 'string' && cfg['basePath'].trim())
      ? cfg['basePath'].trim()
      : BASE_PATH;

    if (basePath !== BASE_PATH) {
      logger.warn(
        `team-ui: custom basePath "${basePath}" configured but dashboard HTML uses fixed ${BASE_PATH} nav links; subpaths may not resolve correctly`,
      );
    }

    // ── Gateway WebSocket Methods ──

    api.registerGatewayMethod('team.config.get', createConfigGetHandler(basePath));
    api.registerGatewayMethod('team.config.update', handleConfigUpdate);
    api.registerGatewayMethod('team.agents.list', handleAgentsList);
    api.registerGatewayMethod('team.agents.update', handleAgentsUpdate);
    api.registerGatewayMethod('team.projects.list', handleProjectsList);
    api.registerGatewayMethod('team.projects.add', handleProjectsAdd);
    api.registerGatewayMethod('team.projects.remove', handleProjectsRemove);
    api.registerGatewayMethod('team.providers.status', handleProvidersStatus);
    api.registerGatewayMethod('team.pipeline.status', handlePipelineStatus);
    api.registerGatewayMethod('team.costs.summary', handleCostsSummary);
    api.registerGatewayMethod('team.events.stream', handleEventsStream);
    api.registerGatewayMethod('team.decisions.list', handleDecisionsList);

    // ── Static Asset Handler ──

    api.registerHttpRoute({
      path: basePath,
      handler(req, res) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD' });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(DASHBOARD_HTML);
      },
    });

    logger.info(`team-ui: registered 12 gateway methods; dashboard at ${basePath}`);
  },
};

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Product Team Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f0f13; color: #e5e7eb; min-height: 100vh; }
    header { background: #1a1a24; border-bottom: 1px solid #2d2d3d; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 1.2rem; font-weight: 600; color: #a5b4fc; }
    nav { display: flex; gap: 8px; margin-left: auto; }
    nav a { color: #9ca3af; text-decoration: none; font-size: 0.85rem; padding: 4px 10px; border-radius: 6px; }
    nav a:hover { background: #2d2d3d; color: #e5e7eb; }
    main { max-width: 1100px; margin: 0 auto; padding: 28px 24px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .card { background: #1a1a24; border: 1px solid #2d2d3d; border-radius: 10px; padding: 20px; }
    .card .label { font-size: 0.78rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .card .value { font-size: 2rem; font-weight: 700; color: #a5b4fc; }
    .card .sub { font-size: 0.8rem; color: #6b7280; margin-top: 4px; }
    h2 { font-size: 1rem; font-weight: 600; color: #d1d5db; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; background: #1a1a24; border: 1px solid #2d2d3d; border-radius: 10px; overflow: hidden; }
    th { text-align: left; padding: 10px 14px; font-size: 0.78rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #2d2d3d; }
    td { padding: 10px 14px; font-size: 0.88rem; border-bottom: 1px solid #1e1e2c; }
    tr:last-child td { border-bottom: none; }
    .status-idle { color: #4ade80; }
    .model-tag { background: #2d2d3d; color: #9ca3af; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-family: monospace; }
    .notice { background: #1a1a24; border: 1px solid #2d2d3d; border-radius: 10px; padding: 20px; color: #6b7280; font-size: 0.88rem; margin-top: 24px; }
  </style>
</head>
<body>
  <header>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
    <h1>Product Team Dashboard</h1>
    <nav>
      <a href="/team">Dashboard</a>
      <a href="/team#agents">Agents</a>
      <a href="/team#pipeline">Pipeline</a>
      <a href="/team#projects">Projects</a>
      <a href="/team#settings">Settings</a>
    </nav>
  </header>
  <main>
    <div class="cards">
      <div class="card">
        <div class="label">Active Tasks</div>
        <div class="value" id="activeTasks">0</div>
        <div class="sub">across pipeline stages</div>
      </div>
      <div class="card">
        <div class="label">Agents Working</div>
        <div class="value" id="agentsWorking">0</div>
        <div class="sub">out of 10 agents</div>
      </div>
      <div class="card">
        <div class="label">Cost Today</div>
        <div class="value" id="costToday">$0.00</div>
        <div class="sub">vs budget</div>
      </div>
      <div class="card">
        <div class="label">Providers</div>
        <div class="value" id="providerCount">3</div>
        <div class="sub">OpenAI &middot; Anthropic &middot; Google</div>
      </div>
    </div>

    <h2>Agent Roster</h2>
    <table id="agentTable">
      <thead>
        <tr>
          <th>Agent</th>
          <th>Model</th>
          <th>Status</th>
          <th>Cost Today</th>
        </tr>
      </thead>
      <tbody id="agentBody">
        <tr><td colspan="4" style="color:#6b7280;text-align:center;padding:20px">Loading agents...</td></tr>
      </tbody>
    </table>

    <div class="notice">
      Full dashboard UI (pipeline kanban, project management, settings panel, real-time WebSocket feed) is deferred to a follow-up task.
      All 12 gateway methods are registered and ready.
    </div>
  </main>

  <script type="module">
    async function callMethod(method, params = {}) {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return new Promise((resolve) => {
        const ws = new WebSocket(\`\${protocol}//\${location.host}\`);
        ws.onopen = () => ws.send(JSON.stringify({ method, params, id: 1 }));
        ws.onmessage = (e) => { resolve(JSON.parse(e.data)); ws.close(); };
        ws.onerror = () => resolve(null);
      });
    }

    async function loadAgents() {
      const result = await callMethod('team.agents.list');
      const tbody = document.getElementById('agentBody');
      if (!result?.payload?.agents?.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:#6b7280;text-align:center;padding:20px">No agents found.</td></tr>';
        return;
      }
      tbody.innerHTML = '';
      for (const a of result.payload.agents) {
        const row = tbody.insertRow();
        row.insertCell().textContent = a.name;

        const modelCell = row.insertCell();
        const modelTag = document.createElement('span');
        modelTag.className = 'model-tag';
        modelTag.textContent = a.model;
        modelCell.appendChild(modelTag);

        const statusCell = row.insertCell();
        const statusTag = document.createElement('span');
        statusTag.className = 'status-idle';
        statusTag.textContent = a.status;
        statusCell.appendChild(statusTag);

        row.insertCell().textContent = '$' + (a.costToday ?? 0).toFixed(4);
      }
    }

    async function loadCosts() {
      const result = await callMethod('team.costs.summary');
      if (result?.payload) {
        document.getElementById('costToday').textContent = '$' + (result.payload.totalToday ?? 0).toFixed(2);
      }
    }

    loadAgents().catch(err => console.error('Failed to load agents:', err));
    loadCosts().catch(err => console.error('Failed to load costs:', err));
  </script>
</body>
</html>`;
