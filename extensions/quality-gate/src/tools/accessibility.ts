/**
 * Tool: qgate.accessibility
 *
 * Scans HTML files for common accessibility violations using regex heuristics.
 * Checks for: missing alt on images, missing lang attribute, missing form labels,
 * missing aria-label on interactive elements, empty buttons/links.
 *
 * This is a lightweight heuristic scanner (no browser or DOM required).
 * For comprehensive WCAG audits, use axe-core with a real browser.
 */

import { resolveGlobPatterns } from '@openclaw/quality-contracts/fs/glob';
import { readFileSafe } from '@openclaw/quality-contracts/fs/read';
import { resolve } from 'node:path';
import { assertPathContained } from '@openclaw/quality-contracts/exec/spawn';
import {
  assertOptionalStringArray,
  assertOptionalString,
} from '@openclaw/quality-contracts/validate/tools';

const DEFAULT_GLOBS = ['**/*.html'];
const DEFAULT_EXCLUDE = ['**/node_modules/**', '**/dist/**'];

export interface AccessibilityViolation {
  rule: string;
  message: string;
  file: string;
  line: number;
}

export interface AccessibilityInput {
  globs?: string[];
  exclude?: string[];
  cwd?: string;
}

export interface AccessibilityOutput {
  totalFiles: number;
  totalViolations: number;
  violations: AccessibilityViolation[];
}

/**
 * Scan a single HTML file for accessibility violations.
 */
export function scanHtmlAccessibility(source: string, filePath: string): AccessibilityViolation[] {
  const violations: AccessibilityViolation[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Rule: img without alt attribute
    if (/<img\b/i.test(line) && !/\balt\s*=/i.test(line)) {
      violations.push({
        rule: 'img-alt',
        message: '<img> element missing alt attribute',
        file: filePath,
        line: lineNum,
      });
    }

    // Rule: input without associated label or aria-label
    if (/<input\b/i.test(line) && !/type\s*=\s*["']hidden["']/i.test(line)) {
      if (!/\baria-label\s*=/i.test(line) && !/\baria-labelledby\s*=/i.test(line) && !/\bid\s*=/i.test(line)) {
        violations.push({
          rule: 'input-label',
          message: '<input> element missing aria-label, aria-labelledby, or id for label association',
          file: filePath,
          line: lineNum,
        });
      }
    }

    // Rule: button with empty text content (self-closing or empty)
    if (/<button[^>]*>\s*<\/button>/i.test(line) && !/\baria-label\s*=/i.test(line)) {
      violations.push({
        rule: 'button-content',
        message: '<button> element has no text content and no aria-label',
        file: filePath,
        line: lineNum,
      });
    }

    // Rule: anchor with empty text content
    if (/<a\b[^>]*>\s*<\/a>/i.test(line) && !/\baria-label\s*=/i.test(line)) {
      violations.push({
        rule: 'link-content',
        message: '<a> element has no text content and no aria-label',
        file: filePath,
        line: lineNum,
      });
    }
  }

  // Rule: missing lang attribute on <html> tag
  if (/<html\b/i.test(source) && !/\blang\s*=/i.test(source)) {
    violations.push({
      rule: 'html-lang',
      message: '<html> element missing lang attribute',
      file: filePath,
      line: 1,
    });
  }

  return violations;
}

/**
 * Execute accessibility scan tool.
 */
export async function accessibilityTool(input: AccessibilityInput): Promise<AccessibilityOutput> {
  const cwd = resolve(input.cwd || process.cwd());
  const globs = input.globs || DEFAULT_GLOBS;
  const exclude = input.exclude || DEFAULT_EXCLUDE;

  for (const pattern of globs) {
    if (pattern.includes('..')) {
      throw new Error(`PATH_TRAVERSAL: glob pattern must not contain "..": ${pattern}`);
    }
  }
  for (const pattern of exclude) {
    if (pattern.includes('..')) {
      throw new Error(`PATH_TRAVERSAL: exclude pattern must not contain "..": ${pattern}`);
    }
  }

  const files = await resolveGlobPatterns(globs, { cwd, exclude });

  const allViolations: AccessibilityViolation[] = [];
  let fileCount = 0;

  for (const file of files) {
    try {
      assertPathContained(file, cwd);
      const source = await readFileSafe(file);
      const violations = scanHtmlAccessibility(source, file);
      allViolations.push(...violations);
      fileCount++;
    } catch {
      // Skip files that fail path validation or can't be read
    }
  }

  return {
    totalFiles: fileCount,
    totalViolations: allViolations.length,
    violations: allViolations,
  };
}

/**
 * Tool definition for registration.
 */
export const accessibilityToolDef = {
  name: 'qgate.accessibility',
  description: 'Scan HTML files for common accessibility violations (missing alt, lang, labels, aria attributes)',
  parameters: {
    type: 'object',
    properties: {
      globs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Glob patterns for HTML files to scan',
        default: DEFAULT_GLOBS,
      },
      exclude: {
        type: 'array',
        items: { type: 'string' },
        description: 'Glob patterns to exclude',
        default: DEFAULT_EXCLUDE,
      },
      cwd: {
        type: 'string',
        description: 'Working directory',
      },
    },
    additionalProperties: false,
  },
  execute: async (_id: string, params: Record<string, unknown>) => {
    assertOptionalStringArray(params['globs'], 'globs');
    assertOptionalStringArray(params['exclude'], 'exclude');
    assertOptionalString(params['cwd'], 'cwd');
    return accessibilityTool(params as unknown as AccessibilityInput);
  },
};
