import { describe, it, expect } from 'vitest';
import { detectProviders } from '../src/detect-providers.js';

describe('detectProviders', () => {
  it('detects anthropic key', () => {
    const result = detectProviders({ ANTHROPIC_API_KEY: 'sk-ant-test' });
    expect(result.hasAnthropic).toBe(true);
    expect(result.hasOpenAI).toBe(false);
    expect(result.hasGithubCopilot).toBe(true);
  });

  it('detects openai key', () => {
    const result = detectProviders({ OPENAI_API_KEY: 'sk-test' });
    expect(result.hasAnthropic).toBe(false);
    expect(result.hasOpenAI).toBe(true);
  });

  it('detects both keys', () => {
    const result = detectProviders({
      ANTHROPIC_API_KEY: 'sk-ant-test',
      OPENAI_API_KEY: 'sk-test',
    });
    expect(result.hasAnthropic).toBe(true);
    expect(result.hasOpenAI).toBe(true);
  });

  it('returns false for empty keys', () => {
    const result = detectProviders({ ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '   ' });
    expect(result.hasAnthropic).toBe(false);
    expect(result.hasOpenAI).toBe(false);
  });

  it('returns false for undefined keys', () => {
    const result = detectProviders({});
    expect(result.hasAnthropic).toBe(false);
    expect(result.hasOpenAI).toBe(false);
  });

  it('always reports copilot as available', () => {
    const result = detectProviders({});
    expect(result.hasGithubCopilot).toBe(true);
  });
});
