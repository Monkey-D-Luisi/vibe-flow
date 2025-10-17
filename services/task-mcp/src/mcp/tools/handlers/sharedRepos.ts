import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { TaskRepository } from '../../../repo/repository.js';
import { StateRepository, EventRepository, LeaseRepository } from '../../../repo/state.js';
import { GithubRequestRepository } from '../../../repo/githubRequests.js';

function resolveDbPath(): string {
  const explicitPath = process.env.TASK_MCP_DB_PATH;
  if (explicitPath && explicitPath.trim().length > 0) {
    return resolve(explicitPath);
  }
  return resolve(process.cwd(), '.cache', 'task-mcp.sqlite');
}

const dbPath = resolveDbPath();
mkdirSync(dirname(dbPath), { recursive: true });

// Singleton repository instances shared across all handlers
export const repo = new TaskRepository(dbPath);
export const stateRepo = new StateRepository(repo.database);
export const eventRepo = new EventRepository(repo.database);
export const leaseRepo = new LeaseRepository(repo.database);
export const githubRequestRepo = new GithubRequestRepository(repo.database);
