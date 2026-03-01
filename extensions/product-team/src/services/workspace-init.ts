import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import type { ProjectConfig } from '../config/plugin-config.js';

interface Logger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
}

const SAFE_REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const SAFE_PATH_RE = /^[^;&|`$(){}!<>"'\\~\n\r]+$/;

function validateRepo(repo: string): void {
  if (!SAFE_REPO_RE.test(repo)) {
    throw new Error(`workspace-init: unsafe repo value: "${repo}"`);
  }
}

function validatePath(workspacePath: string): void {
  if (!SAFE_PATH_RE.test(workspacePath)) {
    throw new Error(`workspace-init: unsafe workspace path: "${workspacePath}"`);
  }
}

function runGit(args: string[], cwd?: string): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'ignore', 'pipe'],
      shell: false,
    });

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      resolve({ exitCode: code ?? -1, stderr });
    });

    child.on('error', (err) => {
      resolve({ exitCode: -1, stderr: err.message });
    });
  });
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function initializeWorkspaces(
  config: ProjectConfig,
  logger: Logger,
): Promise<void> {
  for (const project of config.projects) {
    const id = String(project['id'] ?? '');
    const repo = String(project['repo'] ?? '');
    const workspace = String(project['workspace'] ?? '');

    if (!id || !repo || !workspace) {
      logger.warn(`workspace-init: skipping project with missing id/repo/workspace`);
      continue;
    }

    try {
      validateRepo(repo);
      validatePath(workspace);
    } catch (err) {
      logger.warn(String(err));
      continue;
    }

    const exists = await directoryExists(workspace);
    if (!exists) {
      logger.info(`workspace-init: cloning ${repo} into ${workspace}`);
      const cloneUrl = `https://github.com/${repo}.git`;
      const result = await runGit(['clone', '--depth', '1', cloneUrl, workspace]);
      if (result.exitCode !== 0) {
        logger.warn(`workspace-init: clone failed for ${id} (exit ${result.exitCode}): ${result.stderr.trim()}`);
      } else {
        logger.info(`workspace-init: cloned ${id} successfully`);
      }
    } else {
      logger.info(`workspace-init: fetching origin for ${id} at ${workspace}`);
      const result = await runGit(['fetch', 'origin'], workspace);
      if (result.exitCode !== 0) {
        logger.warn(`workspace-init: fetch failed for ${id} (exit ${result.exitCode}): ${result.stderr.trim()}`);
      } else {
        logger.info(`workspace-init: fetched ${id} successfully`);
      }
    }
  }
}
