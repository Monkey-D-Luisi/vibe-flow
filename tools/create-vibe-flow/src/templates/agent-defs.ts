/**
 * Agent definitions template (EP30 Task 0191)
 */

import type { TeamSize } from '../types.js';

export interface AgentDef {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

const MINIMAL_AGENTS: readonly AgentDef[] = [
  { id: 'dev', name: 'Developer', role: 'Full-stack developer handling planning, implementation, and DevOps' },
  { id: 'qa', name: 'QA Engineer', role: 'Quality assurance, testing, and code review' },
];

const FULL_AGENTS: readonly AgentDef[] = [
  { id: 'pm', name: 'Product Manager', role: 'Product strategy, roadmap, and requirements' },
  { id: 'po', name: 'Product Owner', role: 'Requirement refinement and acceptance criteria' },
  { id: 'tech-lead', name: 'Tech Lead', role: 'Architecture, decomposition, and code review' },
  { id: 'designer', name: 'UI Designer', role: 'UI/UX design and visual specifications' },
  { id: 'back-1', name: 'Backend Developer', role: 'Implementation and unit testing' },
  { id: 'qa', name: 'QA Engineer', role: 'Quality assurance and integration testing' },
  { id: 'devops', name: 'DevOps Engineer', role: 'CI/CD, deployment, and infrastructure' },
];

export function getAgentDefs(team: TeamSize): readonly AgentDef[] {
  return team === 'minimal' ? MINIMAL_AGENTS : FULL_AGENTS;
}
