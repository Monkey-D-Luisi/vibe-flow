/**
 * Skill Activation Enricher
 *
 * Loads skill-rules.json and provides stage+agent → skill instructions
 * mapping for enriching pipeline spawn messages with contextual guidance.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SkillRule {
  readonly id: string;
  readonly stage: string;
  readonly agent: string;
  readonly skills: readonly string[];
  readonly instruction: string;
}

interface SkillRulesFile {
  readonly rules: readonly SkillRule[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, '..', 'skills', 'skill-rules.json');

let cachedRules: readonly SkillRule[] | null = null;

/**
 * Load skill rules from skill-rules.json.
 * Results are cached after first load.
 */
export function loadSkillRules(rulesPath?: string): readonly SkillRule[] {
  if (cachedRules) return cachedRules;
  try {
    const raw = readFileSync(rulesPath ?? RULES_PATH, 'utf-8');
    const data = JSON.parse(raw) as SkillRulesFile;
    if (!data.rules || !Array.isArray(data.rules)) return [];
    cachedRules = data.rules;
    return cachedRules;
  } catch {
    return [];
  }
}

/**
 * Get skill activation instructions for a given pipeline stage and agent.
 *
 * Returns the matched instruction text, or null if no rule matches.
 * When multiple rules match (e.g., same stage, same agent), all
 * instructions are concatenated.
 */
export function getSkillInstructions(
  stage: string,
  agentId: string,
  rulesPath?: string,
): string | null {
  const rules = loadSkillRules(rulesPath);
  const matches = rules.filter(
    (r) => r.stage === stage && r.agent === agentId,
  );

  if (matches.length === 0) return null;

  const header = `\n## Skill activation (${matches.map((m) => m.skills.join(', ')).join('; ')})\n`;
  const instructions = matches.map((m) => m.instruction).join('\n\n');
  const evalReminder =
    '\n\nBefore submitting your output, run the agent-eval self-evaluation checklist for your schemaKey.';

  return header + instructions + evalReminder;
}

/** @internal Reset cache for testing. */
export function resetSkillRulesCache(): void {
  cachedRules = null;
}
