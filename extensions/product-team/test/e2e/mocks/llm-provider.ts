/**
 * Mock LLM provider that returns role-appropriate canned responses.
 * Used for gateway-level E2E tests where agents need deterministic LLM output.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): Record<string, unknown[]> {
  const path = join(__dirname, 'fixtures', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown[]>;
}

const ROLE_FIXTURE_FILES: Record<string, string> = {
  pm: 'pm-responses',
  po: 'po-responses',
  'tech-lead': 'tech-lead-responses',
  designer: 'designer-responses',
  'back-1': 'dev-responses',
  'front-1': 'dev-responses',
  qa: 'qa-responses',
  devops: 'devops-responses',
};

const _fixtureCache = new Map<string, Record<string, unknown[]>>();

function getFixtures(agentRole: string): Record<string, unknown[]> | null {
  const fileName = ROLE_FIXTURE_FILES[agentRole];
  if (!fileName) return null;
  if (!_fixtureCache.has(agentRole)) {
    _fixtureCache.set(agentRole, loadFixture(fileName));
  }
  return _fixtureCache.get(agentRole) ?? null;
}

/**
 * Returns a canned LLM response for a given agent role and pipeline stage.
 * Returns null if no fixture is configured for this combination.
 */
export function getMockLlmResponse(agentRole: string, stage: string): unknown | null {
  const fixtures = getFixtures(agentRole);
  if (!fixtures) return null;
  const responses = fixtures[stage];
  if (!responses || responses.length === 0) return null;
  return responses[0];
}

/** Mock LLM chat completion - returns canned response based on role context. */
export function mockLlmComplete(agentRole: string, stage: string): {
  id: string;
  choices: Array<{ message: { role: string; content: string } }>;
} {
  const response = getMockLlmResponse(agentRole, stage);
  return {
    id: `mock-${agentRole}-${stage}`,
    choices: [
      {
        message: {
          role: 'assistant',
          content: JSON.stringify(response ?? { status: 'completed', stage }),
        },
      },
    ],
  };
}
