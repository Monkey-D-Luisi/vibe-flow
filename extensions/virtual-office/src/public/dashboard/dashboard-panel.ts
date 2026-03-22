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
import { PIPELINE_STAGES } from '../../shared/stage-location-map.js';
import {
  deriveAgentDisplayState,
  derivePipelineSummary,
  formatStageShort,
  type ConnectionState,
} from '../state/display-state.js';

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
  private readonly connectionEl: HTMLElement;
  private readonly feed: ActivityFeed;
  private agentStates: Map<string, ServerAgentState> = new Map();
  private connectionState: ConnectionState = 'connecting';
  private readonly refreshTimer: number;

  constructor() {
    this.feed = new ActivityFeed();
    this.el = this.createPanel();
    this.connectionEl = this.el.querySelector('#dash-connection')!;
    this.pipelineEl = this.el.querySelector('#dash-pipeline')!;
    this.feedEl = this.el.querySelector('#dash-feed')!;

    for (const id of AGENT_ORDER) {
      const row = this.el.querySelector(`[data-agent="${id}"]`) as HTMLElement;
      if (row) this.agentRows.set(id, row);
    }

    document.body.appendChild(this.el);
    this.refreshTimer = window.setInterval(() => this.refresh(), 1000);
    this.renderConnectionState();
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'dashboard-panel';

    const agentRows = AGENT_ORDER.map(id =>
      `<div class="dash-agent-row" data-agent="${id}">
        <div class="dash-agent-top">
          <span class="dash-dot" style="background:${STATUS_COLORS['idle']}"></span>
          <span class="dash-name">${escapeHtml(id)}</span>
          <span class="dash-badge dash-badge-idle">Idle</span>
          <span class="dash-badge dash-badge-connecting">Connecting</span>
        </div>
        <div class="dash-agent-meta"><span class="dash-meta-label">Now</span><span class="dash-meta-value">Waiting for live updates</span></div>
        <div class="dash-agent-meta"><span class="dash-meta-label">Pipeline</span><span class="dash-meta-value">No pipeline context</span></div>
      </div>`,
    ).join('');

    panel.innerHTML = `
      <div class="dash-section">
        <div class="dash-header dash-header-split"><span>Agents</span><span id="dash-connection" class="dash-connection">Connecting</span></div>
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
    this.renderAgentRow(state.agentId, Date.now());
    this.updatePipelineSummary(Date.now());
  }

  updateAllAgents(agents: ServerAgentState[]): void {
    for (const a of agents) {
      this.agentStates.set(a.agentId, a);
    }
    this.refresh();
  }

  addActivity(entry: ActivityEntry): void {
    this.feed.push(entry);
    this.feedEl.innerHTML = this.feed.render();
  }

  setConnectionState(connectionState: ConnectionState): void {
    this.connectionState = connectionState;
    this.renderConnectionState();
    this.refresh();
  }

  private updatePipelineSummary(now: number): void {
    const summary = derivePipelineSummary(Array.from(this.agentStates.values()), now, this.connectionState);

    if (!summary) {
      this.pipelineEl.innerHTML = '<div class="dash-pipeline-empty">No recent pipeline activity</div>';
      return;
    }

    const segments = PIPELINE_STAGES.map((stage, idx) => {
      let cls = 'pipe-seg';
      if (idx < summary.currentIdx) cls += ' done';
      else if (idx === summary.currentIdx) cls += ' current';
      const abbr = formatStageShort(stage);
      return `<span class="${cls}">${abbr}</span>`;
    }).join('');

    const related = summary.relatedLabels.length > 0
      ? escapeHtml(summary.relatedLabels.join(', '))
      : 'No related agents';
    const stagePrefix = summary.activeNowCount > 0 ? 'Current stage' : 'Last known stage';
    const ownerPrefix = summary.activeNowCount > 0 ? 'Current owner' : 'Last known owner';
    const relatedTitle = summary.relatedLabels.length > 0
      ? summary.relatedLabels.join(', ')
      : 'No related agents';

    this.pipelineEl.innerHTML = `
      <div class="dash-pipe-heading">
        <div class="dash-pipe-task" title="${escapeHtml(summary.taskFull)}">Task ${escapeHtml(summary.taskShort)}</div>
        <span class="dash-badge dash-badge-${summary.freshness.tone}" title="${escapeHtml(summary.freshness.detail)}">${escapeHtml(summary.freshness.badge)}</span>
      </div>
      <div class="dash-pipe-stage-line">${stagePrefix}: ${escapeHtml(summary.stageLabel)}</div>
      <div class="pipe-bar">${segments}</div>
      <div class="dash-pipe-meta">${ownerPrefix}: ${escapeHtml(summary.ownerLabel)}</div>
      <div class="dash-pipe-meta" title="${escapeHtml(relatedTitle)}">Related agents: ${related}</div>
      <div class="dash-pipe-agents">${summary.activeNowCount} active now · ${summary.participantCount} linked · ${escapeHtml(summary.freshness.detail)}</div>
    `;
  }

  private renderAgentRow(agentId: string, now: number): void {
    const row = this.agentRows.get(agentId);
    const state = this.agentStates.get(agentId);
    if (!row || !state) return;

    const display = deriveAgentDisplayState(state, now, this.connectionState);
    row.classList.toggle('dash-agent-active', state.status === 'active');
    row.dataset.freshness = display.freshness.tone;
    const pipelineTitle = display.taskFull
      ? `${display.pipelineLabel} (${display.taskFull})`
      : display.pipelineLabel;

    row.innerHTML = `
      <div class="dash-agent-top">
        <span class="dash-dot" style="background:${STATUS_COLORS[state.status] ?? STATUS_COLORS['idle']}"></span>
        <span class="dash-name">${escapeHtml(agentId)}</span>
        <span class="dash-badge dash-badge-${display.statusTone}">${escapeHtml(display.statusLabel)}</span>
        <span class="dash-badge dash-badge-${display.freshness.tone}">${escapeHtml(display.freshness.badge)}</span>
      </div>
      <div class="dash-agent-meta"><span class="dash-meta-label">Now</span><span class="dash-meta-value" title="${escapeHtml(display.activityLabel)}">${escapeHtml(display.activityLabel)}</span></div>
      <div class="dash-agent-meta"><span class="dash-meta-label">Pipeline</span><span class="dash-meta-value" title="${escapeHtml(pipelineTitle)}">${escapeHtml(display.pipelineLabel)}</span></div>
      <div class="dash-agent-meta"><span class="dash-meta-label">Freshness</span><span class="dash-meta-value" title="${escapeHtml(display.freshness.detail)}">${escapeHtml(display.freshness.detail)}</span></div>
    `;
    row.setAttribute(
      'aria-label',
      `${display.roleLabel}: ${display.statusLabel}. ${display.activityLabel}. ${display.pipelineLabel}. ${display.freshness.detail}`,
    );
  }

  private renderConnectionState(): void {
    const label = this.connectionState === 'connected'
      ? 'Live'
      : this.connectionState === 'disconnected'
        ? 'Disconnected'
        : 'Connecting';
    this.connectionEl.textContent = label;
    this.connectionEl.className = `dash-connection dash-badge dash-badge-${this.connectionState === 'connected' ? 'live' : this.connectionState === 'disconnected' ? 'offline' : 'connecting'}`;
  }

  private refresh(): void {
    const now = Date.now();
    for (const id of AGENT_ORDER) {
      this.renderAgentRow(id, now);
    }
    this.updatePipelineSummary(now);
  }

  destroy(): void {
    window.clearInterval(this.refreshTimer);
    this.el.remove();
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
