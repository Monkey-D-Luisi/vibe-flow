import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import type { ToolDeps } from '../../src/tools/index.js';
import { resolveWorkingDir } from '../../src/tools/quality-tool-common.js';

function depsWithWorkspace(workspaceDir: string): ToolDeps {
  return { workspaceDir } as ToolDeps;
}

describe('resolveWorkingDir', () => {
  it('uses workspace root when workingDir is omitted', () => {
    const workspaceDir = process.cwd();
    const resolvedDir = resolveWorkingDir(depsWithWorkspace(workspaceDir));
    expect(resolvedDir).toBe(resolve(workspaceDir));
  });

  it('resolves relative paths inside workspace root', () => {
    const workspaceDir = process.cwd();
    const resolvedDir = resolveWorkingDir(
      depsWithWorkspace(workspaceDir),
      'extensions/product-team',
    );
    expect(resolvedDir).toBe(resolve(workspaceDir, 'extensions/product-team'));
  });

  it('rejects paths that escape workspace root', () => {
    const workspaceDir = process.cwd();
    const escaped = join(workspaceDir, '..');
    expect(() => resolveWorkingDir(depsWithWorkspace(workspaceDir), escaped)).toThrow(
      'PATH_TRAVERSAL',
    );
  });
});
