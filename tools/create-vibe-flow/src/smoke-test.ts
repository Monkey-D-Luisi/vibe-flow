/**
 * Smoke Test (EP30 Task 0191)
 *
 * Post-generation validation: parse JSON configs, check file presence.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface SmokeTestResult {
  readonly passed: boolean;
  readonly errors: string[];
}

const REQUIRED_FILES = [
  'package.json',
  'openclaw.json',
  '.gitignore',
  'README.md',
];

const JSON_FILES = [
  'package.json',
  'openclaw.json',
];

export function runSmokeTest(projectDir: string): SmokeTestResult {
  const errors: string[] = [];

  for (const file of REQUIRED_FILES) {
    const filePath = join(projectDir, file);
    if (!existsSync(filePath)) {
      errors.push(`Missing required file: ${file}`);
    }
  }

  for (const file of JSON_FILES) {
    const filePath = join(projectDir, file);
    if (existsSync(filePath)) {
      try {
        JSON.parse(readFileSync(filePath, 'utf-8'));
      } catch {
        errors.push(`Invalid JSON in ${file}`);
      }
    }
  }

  return { passed: errors.length === 0, errors };
}
