import { describe, it, expect, vi } from 'vitest';
import { AgentStateStore } from '../src/state/agent-state-store.js';
import type { StateChangeEvent } from '../src/state/agent-state-store.js';

describe('AgentStateStore', () => {
  it('initializes with 8 agents in idle status', () => {
    const store = new AgentStateStore();
    expect(store.size).toBe(8);
    const all = store.getAll();
    expect(all).toHaveLength(8);
    for (const agent of all) {
      expect(agent.status).toBe('idle');
      expect(agent.currentTool).toBeNull();
      expect(agent.pipelineStage).toBeNull();
    }
  });

  it('initializes with custom agent IDs', () => {
    const store = new AgentStateStore(['agent-a', 'agent-b']);
    expect(store.size).toBe(2);
    expect(store.get('agent-a')).toBeDefined();
    expect(store.get('agent-b')).toBeDefined();
  });

  it('returns undefined for unknown agent ID', () => {
    const store = new AgentStateStore();
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('updates agent state with partial data', () => {
    const store = new AgentStateStore(['pm']);
    store.update('pm', { status: 'active', currentTool: 'quality_tests' });

    const state = store.get('pm');
    expect(state?.status).toBe('active');
    expect(state?.currentTool).toBe('quality_tests');
    expect(state?.pipelineStage).toBeNull(); // unchanged
  });

  it('ignores updates for unknown agents', () => {
    const store = new AgentStateStore(['pm']);
    const listener = vi.fn();
    store.on('change', listener);

    store.update('unknown-agent', { status: 'active' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('emits change event on update', () => {
    const store = new AgentStateStore(['qa']);
    const listener = vi.fn();
    store.on('change', listener);

    store.update('qa', { status: 'active', currentTool: 'quality_lint' });

    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0][0] as StateChangeEvent;
    expect(event.agentId).toBe('qa');
    expect(event.state.status).toBe('active');
    expect(event.state.currentTool).toBe('quality_lint');
  });

  it('updates lastSeenAt on every update', () => {
    const store = new AgentStateStore(['pm']);
    const before = Date.now();
    store.update('pm', { status: 'active' });
    const state = store.get('pm');
    expect(state?.lastSeenAt).toBeGreaterThanOrEqual(before);
  });

  it('initializes toolCallSeq to 0', () => {
    const store = new AgentStateStore(['pm']);
    const state = store.get('pm');
    expect(state?.toolCallSeq).toBe(0);
  });

  it('getAll returns a new array on each call', () => {
    const store = new AgentStateStore(['pm']);
    const all1 = store.getAll();
    const all2 = store.getAll();
    expect(all1).not.toBe(all2); // different array instances
    expect(all1).toEqual(all2);  // same contents
  });
});
