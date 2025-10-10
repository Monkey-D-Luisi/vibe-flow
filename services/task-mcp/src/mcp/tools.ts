import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TaskRepository } from '../repo/sqlite.js';
import { StateRepository, EventRepository, LeaseRepository } from '../repo/state.js';
import { TaskRecord, TaskRecordValidator } from '../domain/TaskRecord.js';
import { evaluateFastTrack, guardPostDev, FastTrackContext } from '../domain/FastTrack.js';

const repo = new TaskRepository();
const stateRepo = new StateRepository(repo.database);
const eventRepo = new EventRepository(repo.database);
const leaseRepo = new LeaseRepository(repo.database);

const tools = [
  {
    name: 'task.create',
    description: 'Crear TaskRecord en estado inicial',
    inputSchema: {
      type: 'object',
      required: ['title', 'acceptance_criteria', 'scope'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        acceptance_criteria: { type: 'array', items: { type: 'string' } },
        scope: { type: 'string', enum: ['minor', 'major'] },
        links: { type: 'object' },
        tags: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  {
    name: 'task.get',
    description: 'Obtener TaskRecord por id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' }
      }
    }
  },
  {
    name: 'task.update',
    description: 'Actualizar con control optimista',
    inputSchema: {
      type: 'object',
      required: ['id', 'if_rev', 'patch'],
      properties: {
        id: { type: 'string' },
        if_rev: { type: 'integer' },
        patch: { type: 'object' }
      }
    }
  },
  {
    name: 'task.search',
    description: 'Buscar por texto/estado/labels',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        status: { type: 'array', items: { type: 'string' } },
        labels: { type: 'array', items: { type: 'string' } },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
        offset: { type: 'integer', minimum: 0 }
      }
    }
  },
  {
    name: 'task.transition',
    description: 'Transición de estado con validaciones completas y quality gates',
    inputSchema: {
      type: 'object',
      required: ['id', 'to', 'if_rev'],
      properties: {
        id: { type: 'string' },
        to: { type: 'string', enum: ['po', 'arch', 'dev', 'review', 'po_check', 'qa', 'pr', 'done'] },
        if_rev: { type: 'integer' },
        evidence: {
          type: 'object',
          properties: {
            metrics: {
              type: 'object',
              properties: {
                coverage: { type: 'number', minimum: 0, maximum: 1 },
                lint: {
                  type: 'object',
                  properties: {
                    errors: { type: 'integer', minimum: 0 },
                    warnings: { type: 'integer', minimum: 0 }
                  }
                }
              }
            },
            red_green_refactor_log: { type: 'array', items: { type: 'string' } },
            qa_report: {
              type: 'object',
              properties: {
                total: { type: 'integer', minimum: 0 },
                passed: { type: 'integer', minimum: 0 },
                failed: { type: 'integer', minimum: 0 }
              }
            },
            violations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  rule: { type: 'string' },
                  severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                  message: { type: 'string' }
                }
              }
            },
            acceptance_criteria_met: { type: 'boolean' },
            merged: { type: 'boolean' }
          }
        }
      }
    }
  },
  {
    name: 'state.get',
    description: 'Obtener estado del orquestador para una tarea',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' }
      }
    }
  },
  {
    name: 'state.patch',
    description: 'Actualizar estado con control optimista de concurrencia',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'if_rev', 'patch'],
      properties: {
        task_id: { type: 'string' },
        if_rev: { type: 'integer' },
        patch: {
          type: 'object',
          properties: {
            current: { type: 'string', enum: ['po', 'arch', 'dev', 'review', 'po_check', 'qa', 'pr', 'done'] },
            previous: { type: 'string', enum: ['po', 'arch', 'dev', 'review', 'po_check', 'qa', 'pr', 'done'] },
            last_agent: { type: 'string' },
            rounds_review: { type: 'integer' }
          }
        }
      }
    }
  },
  {
    name: 'state.acquire_lock',
    description: 'Adquirir lease para acceso exclusivo a una tarea',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'owner_agent'],
      properties: {
        task_id: { type: 'string' },
        owner_agent: { type: 'string' },
        ttl_seconds: { type: 'integer', minimum: 30, maximum: 3600, default: 300 }
      }
    }
  },
  {
    name: 'state.release_lock',
    description: 'Liberar lease de una tarea',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'lease_id'],
      properties: {
        task_id: { type: 'string' },
        lease_id: { type: 'string' }
      }
    }
  },
  {
    name: 'state.events',
    description: 'Obtener historial de eventos para una tarea',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }
      }
    }
  },
  {
    name: 'fasttrack.evaluate',
    description: 'Evalúa si un task es elegible para fast-track (PO → DEV omitiendo Arquitectura)',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'diff', 'quality', 'metadata'],
      properties: {
        task_id: { type: 'string' },
        diff: {
          type: 'object',
          required: ['files', 'locAdded', 'locDeleted'],
          properties: {
            files: { type: 'array', items: { type: 'string' } },
            locAdded: { type: 'integer', minimum: 0 },
            locDeleted: { type: 'integer', minimum: 0 }
          }
        },
        quality: {
          type: 'object',
          required: ['lintErrors'],
          properties: {
            coverage: { type: 'number', minimum: 0, maximum: 1 },
            avgCyclomatic: { type: 'number', minimum: 0 },
            lintErrors: { type: 'integer', minimum: 0 }
          }
        },
        metadata: {
          type: 'object',
          required: ['modulesChanged', 'publicApiChanged'],
          properties: {
            modulesChanged: { type: 'boolean' },
            publicApiChanged: { type: 'boolean' }
          }
        }
      }
    }
  },
  {
    name: 'fasttrack.guard_post_dev',
    description: 'Reevalúa después de DEV si el fast-track debe revocarse',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'diff', 'quality', 'metadata'],
      properties: {
        task_id: { type: 'string' },
        diff: {
          type: 'object',
          required: ['files', 'locAdded', 'locDeleted'],
          properties: {
            files: { type: 'array', items: { type: 'string' } },
            locAdded: { type: 'integer', minimum: 0 },
            locDeleted: { type: 'integer', minimum: 0 }
          }
        },
        quality: {
          type: 'object',
          required: ['lintErrors'],
          properties: {
            coverage: { type: 'number', minimum: 0, maximum: 1 },
            avgCyclomatic: { type: 'number', minimum: 0 },
            lintErrors: { type: 'integer', minimum: 0 }
          }
        },
        metadata: {
          type: 'object',
          required: ['modulesChanged', 'publicApiChanged'],
          properties: {
            modulesChanged: { type: 'boolean' },
            publicApiChanged: { type: 'boolean' }
          }
        },
        reviewer_violations: {
          type: 'array',
          items: {
            type: 'object',
            required: ['severity'],
            properties: {
              severity: { type: 'string', enum: ['low', 'med', 'high'] }
            }
          }
        }
      }
    }
  },
  {
    name: 'gh.createBranch',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', pattern: '^feature/|^bugfix/|^hotfix/' },
        base: { type: 'string', default: 'main' }
      }
    }
  },
  {
    name: 'gh.openPR',
    description: 'Abrir Pull Request en GitHub',
    inputSchema: {
      type: 'object',
      required: ['title', 'head', 'base'],
      properties: {
        title: { type: 'string' },
        head: { type: 'string' },
        base: { type: 'string', default: 'main' },
        body: { type: 'string' },
        draft: { type: 'boolean', default: true },
        labels: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  {
    name: 'gh.comment',
    description: 'Añadir comentario a Issue o PR',
    inputSchema: {
      type: 'object',
      required: ['number', 'body'],
      properties: {
        number: { type: 'integer' },
        body: { type: 'string' },
        type: { type: 'string', enum: ['issue', 'pr'], default: 'pr' }
      }
    }
  },
  {
    name: 'gh.setProjectStatus',
    description: 'Actualizar estado en GitHub Projects',
    inputSchema: {
      type: 'object',
      required: ['itemId', 'status'],
      properties: {
        itemId: { type: 'string' },
        status: { type: 'string', enum: ['To Do', 'In Progress', 'In Review', 'Done'] }
      }
    }
  },
  {
    name: 'gh.addLabels',
    description: 'Añadir etiquetas a Issue/PR',
    inputSchema: {
      type: 'object',
      required: ['number', 'labels'],
      properties: {
        number: { type: 'integer' },
        labels: { type: 'array', items: { type: 'string' } },
        type: { type: 'string', enum: ['issue', 'pr'], default: 'pr' }
      }
    }
  }
];

class TaskMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'task-mcp',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!args) {
        return { content: [{ type: 'text', text: 'Error: No arguments provided' }], isError: true };
      }

      try {
        switch (name) {
          case 'task.create': {
            const input = args as any;
            const validation = TaskRecordValidator.validateCreation(input);
            if (!validation.valid) {
              throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
            }
            const record = repo.create({
              id: `TR-${Date.now().toString(36).toUpperCase().padStart(26, '0')}`, // Simple ULID mock
              title: input.title,
              description: input.description,
              acceptance_criteria: input.acceptance_criteria,
              scope: input.scope,
              status: 'po',
              links: input.links,
              tags: input.tags
            });
            return { content: [{ type: 'text', text: JSON.stringify(record) }] };
          }
          case 'task.get': {
            const input = args as any;
            const record = repo.get(input.id);
            if (!record) throw new Error('Task not found');
            return { content: [{ type: 'text', text: JSON.stringify(record) }] };
          }
          case 'task.update': {
            const input = args as any;
            const record = repo.update(input.id, input.if_rev, input.patch);
            return { content: [{ type: 'text', text: JSON.stringify(record) }] };
          }
          case 'task.search': {
            const input = args as any;
            const result = repo.search(input);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          case 'task.transition': {
            const input = args as any;
            const current = repo.get(input.id);
            if (!current) throw new Error('Task not found');

            // Validate transition with evidence
            const transition = TaskRecordValidator.validateTransition(current.status, input.to, current, input.evidence);
            if (!transition.valid) {
              throw new Error(`Transition invalid: ${transition.reason}`);
            }

            // Build patch based on transition effects
            const patch: Partial<TaskRecord> = { status: input.to };

            // Handle specific transition effects
            switch (`${current.status}->${input.to}`) {
              case 'dev->review':
                if (input.evidence?.red_green_refactor_log) {
                  patch.red_green_refactor_log = input.evidence.red_green_refactor_log;
                }
                if (input.evidence?.metrics) {
                  patch.metrics = { ...current.metrics, ...input.evidence.metrics };
                }
                break;

              case 'review->dev':
                patch.rounds_review = (current.rounds_review || 0) + 1;
                break;

              case 'qa->dev':
                if (input.evidence?.qa_report) {
                  patch.qa_report = input.evidence.qa_report;
                }
                break;

              case 'qa->pr':
                if (input.evidence?.qa_report) {
                  patch.qa_report = input.evidence.qa_report;
                }
                break;
            }

            const updated = repo.update(input.id, input.if_rev, patch);
            return { content: [{ type: 'text', text: JSON.stringify(updated) }] };
          }
          case 'gh.createBranch': {
            const input = args as any;
            // In a real implementation, this would use GitHub CLI or API
            // For now, return mock response
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  branch: input.name,
                  base: input.base || 'main',
                  created: true,
                  command: `git checkout -b ${input.name} ${input.base || 'main'}`
                })
              }]
            };
          }
          case 'gh.openPR': {
            const input = args as any;
            // Mock PR creation - in real implementation would use GitHub API
            const prNumber = Math.floor(Math.random() * 1000) + 1;
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  number: prNumber,
                  title: input.title,
                  head: input.head,
                  base: input.base || 'main',
                  draft: input.draft !== false,
                  url: `https://github.com/Monkey-D-Luisi/agents-mcps/pull/${prNumber}`,
                  labels: input.labels || []
                })
              }]
            };
          }
          case 'gh.comment': {
            const input = args as any;
            // Mock comment creation
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  number: input.number,
                  type: input.type || 'pr',
                  body: input.body,
                  commented: true
                })
              }]
            };
          }
          case 'gh.setProjectStatus': {
            const input = args as any;
            // Mock project status update
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  itemId: input.itemId,
                  status: input.status,
                  updated: true
                })
              }]
            };
          }
          case 'gh.addLabels': {
            const input = args as any;
            // Mock label addition
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  number: input.number,
                  type: input.type || 'pr',
                  labels: input.labels,
                  added: true
                })
              }]
            };
          }
          case 'state.get': {
            const input = args as any;
            const state = stateRepo.get(input.task_id);
            if (!state) throw new Error('State not found');
            return { content: [{ type: 'text', text: JSON.stringify(state) }] };
          }
          case 'state.patch': {
            const input = args as any;
            const updated = stateRepo.update(input.task_id, input.if_rev, input.patch);
            return { content: [{ type: 'text', text: JSON.stringify(updated) }] };
          }
          case 'state.acquire_lock': {
            const input = args as any;
            const lease = leaseRepo.acquire(input.task_id, input.owner_agent, input.ttl_seconds || 300);
            return { content: [{ type: 'text', text: JSON.stringify(lease) }] };
          }
          case 'state.release_lock': {
            const input = args as any;
            const released = leaseRepo.release(input.task_id, input.lease_id);
            return { content: [{ type: 'text', text: JSON.stringify({ released }) }] };
          }
          case 'state.events': {
            const input = args as any;
            const events = eventRepo.getByTaskId(input.task_id, input.limit || 50);
            return { content: [{ type: 'text', text: JSON.stringify(events) }] };
          }
          case 'fasttrack.evaluate': {
            const input = args as any;
            const task = repo.get(input.task_id);
            if (!task) throw new Error('Task not found');

            const ctx: FastTrackContext = {
              task,
              diff: input.diff,
              quality: input.quality,
              metadata: input.metadata
            };

            const result = evaluateFastTrack(ctx);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          case 'fasttrack.guard_post_dev': {
            const input = args as any;
            const task = repo.get(input.task_id);
            if (!task) throw new Error('Task not found');

            const ctx: FastTrackContext = {
              task,
              diff: input.diff,
              quality: input.quality,
              metadata: input.metadata
            };

            const result = guardPostDev(ctx, input.reviewer_violations);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
        // This should never be reached due to the default case above
        return { content: [{ type: 'text', text: 'Unexpected error' }], isError: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Task MCP server started');
  }
}

export { TaskMCPServer };