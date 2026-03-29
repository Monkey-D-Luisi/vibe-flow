import { describe, it, expect } from 'vitest';
import { isValidTemplate, VALID_TEMPLATES, renderSrcIndex, renderTestIndex } from '../src/templates.js';
import type { TemplateType } from '../src/templates.js';

describe('isValidTemplate', () => {
  it.each(VALID_TEMPLATES)('returns true for "%s"', (name) => {
    expect(isValidTemplate(name)).toBe(true);
  });

  it('returns false for invalid values', () => {
    expect(isValidTemplate('unknown')).toBe(false);
    expect(isValidTemplate('')).toBe(false);
    expect(isValidTemplate('TOOL')).toBe(false);
  });
});

describe('renderSrcIndex', () => {
  it.each(VALID_TEMPLATES)('renders valid TypeScript for %s template', (template: TemplateType) => {
    const result = renderSrcIndex('test-ext', template);
    expect(result).toContain("id: 'test-ext'");
    expect(result).toContain('register(api');
    expect(result).toContain('export default');
  });

  it('tool template includes registerTool', () => {
    const result = renderSrcIndex('my-tool', 'tool');
    expect(result).toContain('registerTool');
    expect(result).toContain('my_tool_hello');
  });

  it('hook template includes api.on', () => {
    const result = renderSrcIndex('my-hook', 'hook');
    expect(result).toContain("api.on('after_tool_call'");
  });

  it('service template includes registerService', () => {
    const result = renderSrcIndex('my-svc', 'service');
    expect(result).toContain('registerService');
  });

  it('http template includes registerHttpRoute', () => {
    const result = renderSrcIndex('my-api', 'http');
    expect(result).toContain('registerHttpRoute');
    expect(result).toContain("'/api/my-api'");
  });

  it('hybrid template includes all patterns', () => {
    const result = renderSrcIndex('my-hybrid', 'hybrid');
    expect(result).toContain('registerTool');
    expect(result).toContain("api.on('after_tool_call'");
    expect(result).toContain('registerHttpRoute');
  });
});

describe('renderTestIndex', () => {
  it.each(VALID_TEMPLATES)('renders valid test file for %s template', (template: TemplateType) => {
    const result = renderTestIndex('test-ext', template);
    expect(result).toContain('vitest');
    expect(result).toContain("'test-ext plugin'");
    expect(result).toContain("plugin.id");
  });
});
