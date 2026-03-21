import { describe, it, expect } from 'vitest';
import { evaluateGate } from '@openclaw/quality-contracts/gate/policy';
import { DEFAULT_POLICIES } from '@openclaw/quality-contracts/gate/types';
import { scanHtmlAccessibility } from '../src/tools/accessibility.js';

describe('scanHtmlAccessibility', () => {
  it('detects missing alt attribute on img', () => {
    const html = '<html lang="en"><body><img src="photo.jpg"></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('img-alt');
    expect(violations[0].line).toBe(1);
  });

  it('allows img with alt attribute', () => {
    const html = '<html lang="en"><body><img src="photo.jpg" alt="A photo"></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(0);
  });

  it('detects missing lang on html element', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('html-lang');
  });

  it('allows html with lang attribute', () => {
    const html = '<html lang="en"><body><p>Hello</p></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(0);
  });

  it('detects missing lang on html even when another element has lang', () => {
    const html = '<html><body><span lang="fr">Bonjour</span></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    const langViolation = violations.find(v => v.rule === 'html-lang');
    expect(langViolation).toBeDefined();
  });

  it('detects input without label association', () => {
    const html = '<html lang="en"><body><input type="text"></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('input-label');
  });

  it('allows input with aria-label', () => {
    const html = '<html lang="en"><body><input type="text" aria-label="Name"></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(0);
  });

  it('allows input with id for label association', () => {
    const html = '<html lang="en"><body><label for="name">Name</label><input type="text" id="name"></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(0);
  });

  it('skips hidden inputs', () => {
    const html = '<html lang="en"><body><input type="hidden" name="csrf"></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(0);
  });

  it('detects empty button without aria-label', () => {
    const html = '<html lang="en"><body><button></button></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('button-content');
  });

  it('allows empty button with aria-label', () => {
    const html = '<html lang="en"><body><button aria-label="Close"></button></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(0);
  });

  it('detects empty link without aria-label', () => {
    const html = '<html lang="en"><body><a href="/"></a></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('link-content');
  });

  it('detects multiple violations', () => {
    const html = [
      '<html>',
      '<body>',
      '<img src="a.jpg">',
      '<input type="text">',
      '<button></button>',
      '</body>',
      '</html>',
    ].join('\n');
    const violations = scanHtmlAccessibility(html, 'test.html');
    const rules = violations.map(v => v.rule);
    expect(rules).toContain('html-lang');
    expect(rules).toContain('img-alt');
    expect(rules).toContain('input-label');
    expect(rules).toContain('button-content');
    expect(violations.length).toBeGreaterThanOrEqual(4);
  });

  it('returns zero violations for clean HTML', () => {
    const html = '<html lang="en"><body><h1>Hello</h1><p>World</p></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(0);
  });

  it('allows input with aria-labelledby', () => {
    const html = '<html lang="en"><body><input type="text" aria-labelledby="nameLabel"></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(0);
  });

  it('does not treat data-id as a valid id for label association', () => {
    const html = '<html lang="en"><body><input type="text" data-id="field-1"></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('input-label');
  });

  it('allows button with text content', () => {
    const html = '<html lang="en"><body><button>Submit</button></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(0);
  });

  it('allows link with text content', () => {
    const html = '<html lang="en"><body><a href="/">Home</a></body></html>';
    const violations = scanHtmlAccessibility(html, 'test.html');
    expect(violations).toHaveLength(0);
  });
});

describe('accessibilityTool wrapper', () => {
  it('rejects glob patterns containing ".."', async () => {
    const { accessibilityTool } = await import('../src/tools/accessibility.js');
    await expect(accessibilityTool({ globs: ['../../etc/**/*.html'] })).rejects.toThrow('PATH_TRAVERSAL');
  });

  it('rejects exclude patterns containing ".."', async () => {
    const { accessibilityTool } = await import('../src/tools/accessibility.js');
    await expect(accessibilityTool({ exclude: ['../secret/**'] })).rejects.toThrow('PATH_TRAVERSAL');
  });
});

describe('gate integration - accessibility check', () => {
  it('passes when violations within limit', () => {
    const result = evaluateGate(
      { accessibilityViolations: 0 },
      { accessibilityMaxViolations: 0 },
    );
    const check = result.checks.find(c => c.name === 'accessibility');
    expect(check).toBeDefined();
    expect(check?.verdict).toBe('pass');
  });

  it('fails when violations exceed limit', () => {
    const result = evaluateGate(
      { accessibilityViolations: 3 },
      { accessibilityMaxViolations: 0 },
    );
    const check = result.checks.find(c => c.name === 'accessibility');
    expect(check).toBeDefined();
    expect(check?.verdict).toBe('fail');
  });

  it('skips when metric not provided', () => {
    const result = evaluateGate(
      {},
      { accessibilityMaxViolations: 0 },
    );
    const check = result.checks.find(c => c.name === 'accessibility');
    expect(check).toBeDefined();
    expect(check?.verdict).toBe('skip');
  });

  it('is not included when policy field is undefined', () => {
    const result = evaluateGate({}, {});
    const check = result.checks.find(c => c.name === 'accessibility');
    expect(check).toBeUndefined();
  });

  it('default major policy has 0 max violations', () => {
    expect(DEFAULT_POLICIES.major.accessibilityMaxViolations).toBe(0);
  });

  it('default patch policy allows 5 violations', () => {
    expect(DEFAULT_POLICIES.patch.accessibilityMaxViolations).toBe(5);
  });
});
