import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TaskRepository } from '../repo/sqlite.js';
import { TaskRecord, TaskRecordValidator } from '../domain/TaskRecord.js';

const repo = new TaskRepository();

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
    description: 'Transición de estado con validaciones mínimas',
    inputSchema: {
      type: 'object',
      required: ['id', 'to', 'if_rev'],
      properties: {
        id: { type: 'string' },
        to: { type: 'string', enum: ['po', 'arch', 'dev', 'review', 'po_check', 'qa', 'pr', 'done'] },
        if_rev: { type: 'integer' },
        evidence: { type: 'object' }
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
            const transition = TaskRecordValidator.validateTransition(current.status, input.to, current);
            if (!transition.valid) {
              throw new Error(`Transition invalid: ${transition.reason}`);
            }
            const patch: Partial<TaskRecord> = { status: input.to };
            if (input.to === 'review' && input.evidence) {
              patch.red_green_refactor_log = input.evidence.red_green_refactor_log;
              patch.metrics = input.evidence.metrics;
            }
            if (input.to === 'dev') {
              patch.rounds_review = (current.rounds_review || 0) + 1;
            }
            const updated = repo.update(input.id, input.if_rev, patch);
            return { content: [{ type: 'text', text: JSON.stringify(updated) }] };
          }
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
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