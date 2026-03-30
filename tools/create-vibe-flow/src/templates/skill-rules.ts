/**
 * Skill activation rules template (EP30 Task 0191)
 */

import type { TeamSize } from '../types.js';

interface SkillRule {
  readonly skill: string;
  readonly agents: readonly string[];
}

const MINIMAL_SKILLS: readonly SkillRule[] = [
  { skill: 'tdd-implementation', agents: ['dev'] },
  { skill: 'code-review', agents: ['qa'] },
  { skill: 'qa-testing', agents: ['qa'] },
  { skill: 'backend-dev', agents: ['dev'] },
];

const FULL_SKILLS: readonly SkillRule[] = [
  { skill: 'product-owner', agents: ['pm', 'po'] },
  { skill: 'requirements-grooming', agents: ['po'] },
  { skill: 'architecture-design', agents: ['tech-lead'] },
  { skill: 'tdd-implementation', agents: ['back-1'] },
  { skill: 'code-review', agents: ['tech-lead'] },
  { skill: 'qa-testing', agents: ['qa'] },
  { skill: 'backend-dev', agents: ['back-1'] },
  { skill: 'frontend-dev', agents: ['back-1'] },
  { skill: 'devops', agents: ['devops'] },
  { skill: 'ui-designer', agents: ['designer'] },
];

export function getSkillRules(team: TeamSize): readonly SkillRule[] {
  return team === 'minimal' ? MINIMAL_SKILLS : FULL_SKILLS;
}
