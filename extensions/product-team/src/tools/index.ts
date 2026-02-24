import type Database from 'better-sqlite3';
import type { TSchema } from '@sinclair/typebox';
import type { SqliteTaskRepository } from '../persistence/task-repository.js';
import type { SqliteOrchestratorRepository } from '../persistence/orchestrator-repository.js';
import type { SqliteLeaseRepository } from '../persistence/lease-repository.js';
import type { EventLog } from '../orchestrator/event-log.js';
import type { ValidateFn } from '../schemas/validator.js';

export interface ToolDeps {
  db: Database.Database;
  taskRepo: SqliteTaskRepository;
  orchestratorRepo: SqliteOrchestratorRepository;
  leaseRepo: SqliteLeaseRepository;
  eventLog: EventLog;
  generateId: () => string;
  now: () => string;
  validate: ValidateFn;
}

export interface ToolDef {
  name: string;
  label: string;
  description: string;
  parameters: TSchema;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
  ) => Promise<{ content: { type: 'text'; text: string }[]; details: unknown }>;
}

import { taskCreateToolDef } from './task-create.js';
import { taskGetToolDef } from './task-get.js';
import { taskSearchToolDef } from './task-search.js';
import { taskUpdateToolDef } from './task-update.js';
import { taskTransitionToolDef } from './task-transition.js';

export function getAllToolDefs(deps: ToolDeps): ToolDef[] {
  return [
    taskCreateToolDef(deps),
    taskGetToolDef(deps),
    taskSearchToolDef(deps),
    taskUpdateToolDef(deps),
    taskTransitionToolDef(deps),
  ];
}
