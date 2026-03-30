/**
 * Package.json template (EP30 Task 0191)
 */

import type { GenerateOptions } from '../types.js';

export function renderPackageJson(options: GenerateOptions): string {
  const pkg = {
    name: options.projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      start: 'openclaw gateway run',
      'start:dev': 'openclaw gateway run --watch',
    },
    dependencies: {
      openclaw: 'latest',
      '@openclaw/product-team': 'latest',
      '@openclaw/quality-gate': 'latest',
    },
  };

  return JSON.stringify(pkg, null, 2) + '\n';
}
