/**
 * Agent State Store -- In-memory state tracking for 8 agents.
 *
 * Maintains current status, tool activity, and pipeline stage for each agent.
 * Emits 'change' events when state is updated, consumed by the SSE handler.
 */

import { EventEmitter } from 'node:events';

/** Agent status in the virtual office. */
export type AgentStatus = 'idle' | 'active' | 'spawning' | 'offline';

/** State snapshot for a single agent. */
export interface AgentState {
  readonly agentId: string;
  status: AgentStatus;
  currentTool: string | null;
  pipelineStage: string | null;
  taskId: string | null;
  lastSeenAt: number;
}

/** Partial state update for an agent. */
export type AgentStateUpdate = Partial<Omit<AgentState, 'agentId'>>;

/** Change event payload. */
export interface StateChangeEvent {
  readonly agentId: string;
  readonly state: Readonly<AgentState>;
}

/** Default agent IDs. */
const DEFAULT_AGENTS = [
  'pm', 'tech-lead', 'po', 'designer',
  'back-1', 'front-1', 'qa', 'devops',
];

/**
 * In-memory store tracking real-time state for all agents.
 * Not persisted -- the virtual office shows live state only.
 */
export class AgentStateStore extends EventEmitter {
  private readonly agents = new Map<string, AgentState>();

  constructor(agentIds: readonly string[] = DEFAULT_AGENTS) {
    super();
    for (const id of agentIds) {
      this.agents.set(id, {
        agentId: id,
        status: 'idle',
        currentTool: null,
        pipelineStage: null,
        taskId: null,
        lastSeenAt: Date.now(),
      });
    }
  }

  /** Get all agent states as an array. */
  getAll(): AgentState[] {
    return [...this.agents.values()];
  }

  /** Get a single agent's state. */
  get(agentId: string): AgentState | undefined {
    return this.agents.get(agentId);
  }

  /** Update an agent's state. Emits 'change' event. */
  update(agentId: string, partial: AgentStateUpdate): void {
    const current = this.agents.get(agentId);
    if (!current) return; // ignore unknown agents

    Object.assign(current, partial, { lastSeenAt: Date.now() });

    const event: StateChangeEvent = { agentId, state: { ...current } };
    this.emit('change', event);
  }

  /** Number of tracked agents. */
  get size(): number {
    return this.agents.size;
  }
}
