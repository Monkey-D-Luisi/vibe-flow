import { describe, it, expect } from 'vitest';
import { buildConfig } from '../src/config-builder.js';
import type { WizardAnswers } from '../src/wizard.js';
import type { DetectedProviders, TeamSize, ModelTier, ProjectType } from '../src/types.js';

function answers(overrides?: Partial<WizardAnswers>): WizardAnswers {
  return {
    projectName: 'test-project',
    team: 'minimal',
    model: 'free',
    type: 'webapp',
    ...overrides,
  };
}

const noProviders: DetectedProviders = { hasAnthropic: false, hasOpenAI: false, hasGithubCopilot: true };
const anthropicProvider: DetectedProviders = { hasAnthropic: true, hasOpenAI: false, hasGithubCopilot: true };
const bothProviders: DetectedProviders = { hasAnthropic: true, hasOpenAI: true, hasGithubCopilot: true };

describe('buildConfig', () => {
  it('passes through wizard answers', () => {
    const result = buildConfig(answers(), noProviders, { playground: false, force: false });
    expect(result.projectName).toBe('test-project');
    expect(result.team).toBe('minimal');
    expect(result.model).toBe('free');
    expect(result.type).toBe('webapp');
  });

  it('resolves projectDir from cwd + name', () => {
    const result = buildConfig(answers(), noProviders, { playground: false, force: false });
    expect(result.projectDir).toContain('test-project');
  });

  it('downgrades premium to free when no providers available', () => {
    const result = buildConfig(answers({ model: 'premium' }), noProviders, { playground: false, force: false });
    expect(result.model).toBe('free');
  });

  it('downgrades mixed to free when no providers available', () => {
    const result = buildConfig(answers({ model: 'mixed' }), noProviders, { playground: false, force: false });
    expect(result.model).toBe('free');
  });

  it('keeps premium when both providers available', () => {
    const result = buildConfig(answers({ model: 'premium' }), bothProviders, { playground: false, force: false });
    expect(result.model).toBe('premium');
  });

  it('keeps mixed when one provider available', () => {
    const result = buildConfig(answers({ model: 'mixed' }), anthropicProvider, { playground: false, force: false });
    expect(result.model).toBe('mixed');
  });

  it('passes playground flag', () => {
    const result = buildConfig(answers(), noProviders, { playground: true, force: false });
    expect(result.playground).toBe(true);
  });

  it('passes force flag', () => {
    const result = buildConfig(answers(), noProviders, { playground: false, force: true });
    expect(result.force).toBe(true);
  });

  // Combination tests
  const teams: TeamSize[] = ['minimal', 'full'];
  const models: ModelTier[] = ['free', 'mixed', 'premium'];
  const types: ProjectType[] = ['webapp', 'api', 'cli', 'lib'];

  for (const team of teams) {
    for (const model of models) {
      for (const type of types) {
        it(`builds config for team=${team} model=${model} type=${type}`, () => {
          const providers = model === 'premium' ? bothProviders : model === 'mixed' ? anthropicProvider : noProviders;
          const result = buildConfig(answers({ team, model, type }), providers, { playground: false, force: false });
          expect(result.team).toBe(team);
          expect(result.type).toBe(type);
          // model may be downgraded
          expect(['free', 'mixed', 'premium']).toContain(result.model);
        });
      }
    }
  }
});
