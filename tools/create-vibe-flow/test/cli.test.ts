import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/cli.js';

describe('CLI argument parsing', () => {
  it('parses project name as first positional arg', () => {
    const flags = parseArgs(['my-project']);
    expect(flags.projectName).toBe('my-project');
  });

  it('parses --team flag', () => {
    const flags = parseArgs(['my-app', '--team', 'full']);
    expect(flags.team).toBe('full');
  });

  it('parses --model flag', () => {
    const flags = parseArgs(['my-app', '--model', 'premium']);
    expect(flags.model).toBe('premium');
  });

  it('parses --type flag', () => {
    const flags = parseArgs(['my-app', '--type', 'api']);
    expect(flags.type).toBe('api');
  });

  it('parses --playground flag', () => {
    const flags = parseArgs(['my-app', '--playground']);
    expect(flags.playground).toBe(true);
  });

  it('parses --defaults flag', () => {
    const flags = parseArgs(['--defaults']);
    expect(flags.defaults).toBe(true);
  });

  it('parses --force flag', () => {
    const flags = parseArgs(['my-app', '--force']);
    expect(flags.force).toBe(true);
  });

  it('parses --help flag', () => {
    const flags = parseArgs(['--help']);
    expect(flags.help).toBe(true);
  });

  it('parses -h as help', () => {
    const flags = parseArgs(['-h']);
    expect(flags.help).toBe(true);
  });

  it('returns defaults for empty args', () => {
    const flags = parseArgs([]);
    expect(flags.projectName).toBeUndefined();
    expect(flags.team).toBeUndefined();
    expect(flags.model).toBeUndefined();
    expect(flags.type).toBeUndefined();
    expect(flags.playground).toBe(false);
    expect(flags.defaults).toBe(false);
    expect(flags.force).toBe(false);
    expect(flags.help).toBe(false);
  });

  it('ignores invalid team values', () => {
    const flags = parseArgs(['--team', 'huge']);
    expect(flags.team).toBeUndefined();
  });

  it('ignores invalid model values', () => {
    const flags = parseArgs(['--model', 'infinite']);
    expect(flags.model).toBeUndefined();
  });

  it('parses all flags together', () => {
    const flags = parseArgs(['my-app', '--team', 'minimal', '--model', 'free', '--type', 'cli', '--playground', '--force', '--defaults']);
    expect(flags.projectName).toBe('my-app');
    expect(flags.team).toBe('minimal');
    expect(flags.model).toBe('free');
    expect(flags.type).toBe('cli');
    expect(flags.playground).toBe(true);
    expect(flags.force).toBe(true);
    expect(flags.defaults).toBe(true);
  });
});
