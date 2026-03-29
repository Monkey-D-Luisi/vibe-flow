import { describe, it, expect } from 'vitest';
import {
  PersonaRegistry,
  withPersona,
  formatPersonaStatus,
  resolveAgentId,
  getStagePersona,
  type Persona,
} from '../../src/personas/persona-registry.js';

// ── PersonaRegistry ──

describe('PersonaRegistry', () => {
  it('returns known personas by agentId', () => {
    const registry = new PersonaRegistry();
    const pm = registry.get('pm');
    expect(pm.displayName).toBe('Product Manager');
    expect(pm.emoji).toBe('📋');
  });

  it('returns all default personas', () => {
    const registry = new PersonaRegistry();
    const all = registry.all();
    expect(all.length).toBeGreaterThanOrEqual(8);
    const ids = all.map(p => p.agentId);
    expect(ids).toContain('pm');
    expect(ids).toContain('tech-lead');
    expect(ids).toContain('qa');
    expect(ids).toContain('devops');
  });

  it('returns fallback persona for unknown agent', () => {
    const registry = new PersonaRegistry();
    const unknown = registry.get('mystery-agent');
    expect(unknown.agentId).toBe('mystery-agent');
    expect(unknown.displayName).toBe('mystery-agent');
    expect(unknown.emoji).toBe('🤖');
  });

  it('supports custom personas', () => {
    const custom: Persona[] = [
      { agentId: 'alice', displayName: 'Alice', emoji: '👩', role: 'dev', tagline: 'Coding away' },
    ];
    const registry = new PersonaRegistry(custom);
    expect(registry.get('alice').displayName).toBe('Alice');
    expect(registry.has('pm')).toBe(false);
  });

  it('always includes system persona', () => {
    const registry = new PersonaRegistry([]);
    expect(registry.has('system')).toBe(true);
    expect(registry.get('system').displayName).toBe('System');
  });

  it('has() returns true for known agents', () => {
    const registry = new PersonaRegistry();
    expect(registry.has('pm')).toBe(true);
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('returns specific personas for each default agent', () => {
    const registry = new PersonaRegistry();
    expect(registry.get('tech-lead').emoji).toBe('🏗️');
    expect(registry.get('po').emoji).toBe('🎯');
    expect(registry.get('designer').emoji).toBe('🎨');
    expect(registry.get('back-1').emoji).toBe('⚙️');
    expect(registry.get('front-1').emoji).toBe('🖥️');
    expect(registry.get('qa').emoji).toBe('🔍');
    expect(registry.get('devops').emoji).toBe('🚀');
  });
});

// ── withPersona ──

describe('withPersona', () => {
  it('prefixes message with persona identity', () => {
    const registry = new PersonaRegistry();
    const msg = withPersona(registry, 'pm', 'Task advanced to REVIEW');
    expect(msg).toContain('📋');
    expect(msg).toContain('Product Manager');
    expect(msg).toContain('Task advanced to REVIEW');
  });

  it('uses fallback for unknown agents', () => {
    const registry = new PersonaRegistry();
    const msg = withPersona(registry, 'unknown-agent', 'Hello');
    expect(msg).toContain('🤖');
    expect(msg).toContain('unknown\\-agent');
    expect(msg).toContain('Hello');
  });

  it('escapes special characters in display name', () => {
    const custom: Persona[] = [
      { agentId: 'test', displayName: 'Test.Agent', emoji: '🧪', role: 'test', tagline: 'Testing' },
    ];
    const registry = new PersonaRegistry(custom);
    const msg = withPersona(registry, 'test', 'Hi');
    expect(msg).toContain('Test\\.Agent');
  });
});

// ── formatPersonaStatus ──

describe('formatPersonaStatus', () => {
  it('formats default status with tagline', () => {
    const registry = new PersonaRegistry();
    const status = formatPersonaStatus(registry.get('qa'));
    expect(status).toContain('🔍');
    expect(status).toContain('QA Engineer');
    expect(status).toContain('Ensuring quality');
  });

  it('uses custom status when provided', () => {
    const registry = new PersonaRegistry();
    const status = formatPersonaStatus(registry.get('pm'), 'Working on task-0142');
    expect(status).toContain('Working on task\\-0142');
  });
});

// ── resolveAgentId ──

describe('resolveAgentId', () => {
  it('resolves from top-level agentId', () => {
    expect(resolveAgentId({ agentId: 'pm' })).toBe('pm');
  });

  it('resolves from agent_id', () => {
    expect(resolveAgentId({ agent_id: 'qa' })).toBe('qa');
  });

  it('resolves from params.agentId', () => {
    expect(resolveAgentId({ params: { agentId: 'back-1' } })).toBe('back-1');
  });

  it('falls back to system for missing agentId', () => {
    expect(resolveAgentId({})).toBe('system');
  });

  it('prefers agentId over agent_id', () => {
    expect(resolveAgentId({ agentId: 'pm', agent_id: 'qa' })).toBe('pm');
  });

  it('ignores empty strings', () => {
    expect(resolveAgentId({ agentId: '' })).toBe('system');
  });
});

// ── getStagePersona ──

describe('getStagePersona', () => {
  const registry = new PersonaRegistry();

  it('returns PM persona for IDEA stage', () => {
    expect(getStagePersona(registry, 'IDEA').agentId).toBe('pm');
  });

  it('returns tech-lead persona for REVIEW stage', () => {
    expect(getStagePersona(registry, 'REVIEW').agentId).toBe('tech-lead');
  });

  it('returns designer persona for DESIGN stage', () => {
    expect(getStagePersona(registry, 'DESIGN').agentId).toBe('designer');
  });

  it('returns back-1 persona for IMPLEMENTATION stage', () => {
    expect(getStagePersona(registry, 'IMPLEMENTATION').agentId).toBe('back-1');
  });

  it('returns qa persona for QA stage', () => {
    expect(getStagePersona(registry, 'QA').agentId).toBe('qa');
  });

  it('returns devops persona for SHIPPING stage', () => {
    expect(getStagePersona(registry, 'SHIPPING').agentId).toBe('devops');
  });

  it('returns system persona for DONE stage', () => {
    expect(getStagePersona(registry, 'DONE').agentId).toBe('system');
  });

  it('returns system persona for unknown stage', () => {
    expect(getStagePersona(registry, 'UNKNOWN').agentId).toBe('system');
  });
});
