/**
 * Provider Detection (EP30 Task 0191)
 *
 * Checks environment variables for API keys to auto-detect model tier.
 */

import type { DetectedProviders } from './types.js';

/**
 * Detect available model providers by checking environment variables.
 */
export function detectProviders(env: Record<string, string | undefined> = process.env): DetectedProviders {
  return {
    hasAnthropic: isNonEmptyEnv(env['ANTHROPIC_API_KEY']),
    hasOpenAI: isNonEmptyEnv(env['OPENAI_API_KEY']),
    hasGithubCopilot: true, // Always available as fallback
  };
}

function isNonEmptyEnv(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
