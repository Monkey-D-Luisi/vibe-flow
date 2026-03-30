/**
 * Multi-Bot Persona Identity
 *
 * Maps agent roles to visual personas with emoji avatars, display names,
 * and role descriptions. Each persona enriches messages sent to Telegram
 * with agent identity so team members know who is "speaking".
 *
 * EP21 Task 0148
 */

import { escapeMarkdownV2 } from '../formatting.js';

export interface Persona {
  readonly agentId: string;
  readonly displayName: string;
  readonly emoji: string;
  readonly role: string;
  /** Short tagline for status/greeting messages. */
  readonly tagline: string;
}

const DEFAULT_PERSONAS: readonly Persona[] = [
  {
    agentId: 'pm',
    displayName: 'Product Manager',
    emoji: '📋',
    role: 'pm',
    tagline: 'Shaping the product vision',
  },
  {
    agentId: 'tech-lead',
    displayName: 'Tech Lead',
    emoji: '🏗️',
    role: 'tech-lead',
    tagline: 'Architecting the solution',
  },
  {
    agentId: 'po',
    displayName: 'Product Owner',
    emoji: '🎯',
    role: 'po',
    tagline: 'Refining requirements',
  },
  {
    agentId: 'designer',
    displayName: 'Designer',
    emoji: '🎨',
    role: 'designer',
    tagline: 'Crafting the experience',
  },
  {
    agentId: 'back-1',
    displayName: 'Backend Dev',
    emoji: '⚙️',
    role: 'back-1',
    tagline: 'Building the engine',
  },
  {
    agentId: 'front-1',
    displayName: 'Frontend Dev',
    emoji: '🖥️',
    role: 'front-1',
    tagline: 'Crafting the interface',
  },
  {
    agentId: 'qa',
    displayName: 'QA Engineer',
    emoji: '🔍',
    role: 'qa',
    tagline: 'Ensuring quality',
  },
  {
    agentId: 'devops',
    displayName: 'DevOps',
    emoji: '🚀',
    role: 'devops',
    tagline: 'Shipping to production',
  },
];

const SYSTEM_PERSONA: Persona = {
  agentId: 'system',
  displayName: 'System',
  emoji: '🤖',
  role: 'system',
  tagline: 'Orchestrating the workflow',
};

/** Persona registry with lookup by agentId. */
export class PersonaRegistry {
  private readonly personas: Map<string, Persona>;

  constructor(customPersonas?: readonly Persona[]) {
    this.personas = new Map();
    for (const p of customPersonas ?? DEFAULT_PERSONAS) {
      this.personas.set(p.agentId, p);
    }
    if (!this.personas.has('system')) {
      this.personas.set('system', SYSTEM_PERSONA);
    }
  }

  get(agentId: string): Persona {
    return this.personas.get(agentId) ?? {
      agentId,
      displayName: agentId,
      emoji: '🤖',
      role: agentId,
      tagline: `Agent ${agentId}`,
    };
  }

  all(): readonly Persona[] {
    return [...this.personas.values()];
  }

  has(agentId: string): boolean {
    return this.personas.has(agentId);
  }
}

/**
 * Prefix a message with the agent's persona identity.
 *
 * Format: `emoji **DisplayName**: message`
 *
 * Works with MarkdownV2 formatting.
 */
export function withPersona(
  registry: PersonaRegistry,
  agentId: string,
  message: string,
): string {
  const persona = registry.get(agentId);
  const escapedName = escapeMarkdownV2(persona.displayName);
  return `${persona.emoji} *${escapedName}:* ${message}`;
}

/**
 * Format a persona status line for dashboards.
 *
 * Format: `emoji DisplayName — tagline`
 */
export function formatPersonaStatus(persona: Persona, status?: string): string {
  const escapedName = escapeMarkdownV2(persona.displayName);
  const escapedTagline = escapeMarkdownV2(status ?? persona.tagline);
  return `${persona.emoji} *${escapedName}* — _${escapedTagline}_`;
}

/**
 * Resolve the agent ID from a tool call event.
 *
 * The event may contain agentId at the top level or nested in various
 * places depending on the SDK version.
 */
export function resolveAgentId(event: Record<string, unknown>): string {
  if (typeof event['agentId'] === 'string' && event['agentId']) {
    return event['agentId'];
  }
  if (typeof event['agent_id'] === 'string' && event['agent_id']) {
    return event['agent_id'];
  }
  const params = event['params'];
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    const p = params as Record<string, unknown>;
    if (typeof p['agentId'] === 'string' && p['agentId']) return p['agentId'];
  }
  return 'system';
}

/**
 * Map a pipeline stage to its owner agent ID.
 *
 * Duplicated from product-team's STAGE_OWNERS to avoid cross-extension import.
 */
const STAGE_AGENT_MAP: Record<string, string> = {
  IDEA: 'pm',
  ROADMAP: 'pm',
  REFINEMENT: 'po',
  DECOMPOSITION: 'tech-lead',
  DESIGN: 'designer',
  IMPLEMENTATION: 'back-1',
  QA: 'qa',
  REVIEW: 'tech-lead',
  SHIPPING: 'devops',
  DONE: 'system',
};

/**
 * Get the persona for a pipeline stage based on stage ownership.
 */
export function getStagePersona(registry: PersonaRegistry, stage: string): Persona {
  const agentId = STAGE_AGENT_MAP[stage] ?? 'system';
  return registry.get(agentId);
}
