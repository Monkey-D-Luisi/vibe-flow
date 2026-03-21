/**
 * Dashboard Panel -- DOM-based real-time sidebar.
 *
 * Renders a 320px right sidebar with agent status rows,
 * pipeline summary, and activity feed. Updated via SSE callbacks.
 *
 * Task 0139 (EP15)
 */

import type { ServerAgentState } from '../net/sse-client.js';
import { ActivityFeed, type ActivityEntry } from './activity-feed.js';

const AGENT_ORDER = ['pm', 'tech-lead', 'po', 'designer', 'back-1', 'front-1', 'qa', 'devops'];

const STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  spawning: '#f59e0b',
  idle: '#6b7280',
  offline: '#ef4444',
};

export class DashboardPanel {
  private readonly el: HTMLElement;
  private readonly agentRows: Map<string, HTMLElement> = new Map();
  private readonly pipelineEl: HTMLElement;
  private readonly feedEl: HTMLElement;
  private readonly feed: ActivityFeed;
  private agentStates: Map<string, ServerAgentState> = new Map();

  constructor() {
    this.feed = new ActivityFeed();
    this.el = this.createPanel();
    this.pipelineEl = this.el.querySelector('#dash-pipeline')!;
    this.feedEl = this.el.querySelector('#dash-feed')!;

    for (const id of AGENT_ORDER) {
      const row = this.el.querySelector(`[data-agent="${id}"]`) as HTMLElement;
      if (row) this.agentRows.set(id, row);
    }

    document.body.appendChild(this.el);
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'dashboard-panel';

    const agentRows = AGENT_ORDER.map(id =>
      `<div class="dash-agent-row" data-agent="${id}">
        <span class="dash-dot" style="background:${STATUS_COLORS['idle']}"></span>
        <span class="dash-name">${escapeHtml(id)}</span>
        <span class="dash-tool">--</span>
        <span class="dash-stage">--</span>
      </div>`,
    ).join('');

    panel.innerHTML = `
      <div class="dash-section">
        <div class="dash-header">Agents</div>
        ${agentRows}
      </div>
      <div class="dash-section">
        <div class="dash-header">Pipeline</div>
        <div id="dash-pipeline" class="dash-pipeline">No active pipeline</div>
      </div>
      <div class="dash-section dash-feed-section">
        <div class="dash-header">Activity</div>
        <div id="dash-feed" class="dash-feed">
          <div class="feed-empty">No activity yet</div>
        </div>
      </div>
    `;

    return panel;
  }

  updateAgent(state: ServerAgentState): void {
    this.agentStates.set(state.agentId, state);
    const row = this.agentRows.get(state.agentId);
    if (!row) return;

    const dot = row.querySelector('.dash-dot') as HTMLElement;
    const tool = row.querySelector('.dash-tool') as HTMLElement;
    const stage = row.querySelector('.dash-stage') as HTMLElement;

    if (dot) dot.style.background = STATUS_COLORS[state.status] ?? STATUS_COLORS['idle'];
    if (tool) tool.textContent = state.currentTool ?? '--';
    if (stage) stage.textContent = state.pipelineStage ?? '--';

    this.updatePipelineSummary();
  }

  updateAllAgents(agents: ServerAgentState[]): void {
    for (const a of agents) {
      this.updateAgent(a);
    }
    this.updatePipelineSummary();
  }

  addActivity(entry: ActivityEntry): void {
    this.feed.push(entry);
    this.feedEl.innerHTML = this.feed.render();
  }

  private updatePipelineSummary(): void {
    const active = Array.from(this.agentStates.values())
      .filter(a => a.taskId && a.pipelineStage);

    if (active.length === 0) {
      this.pipelineEl.textContent = 'No active pipeline';
      return;
    }

    const first = active[0]!;
    this.pipelineEl.innerHTML = `
      <div class="dash-pipe-task">${escapeHtml(first.taskId!)}</div>
      <div class="dash-pipe-stage">${escapeHtml(first.pipelineStage!)}</div>
      <div class="dash-pipe-agents">${active.length} agent(s) active</div>
    `;
  }

  destroy(): void {
    this.el.remove();
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
