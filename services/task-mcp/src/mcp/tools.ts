import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { handleToolCall } from './tools/handlers/index.js';
import { repo, stateRepo, eventRepo, leaseRepo } from './tools/handlers/sharedRepos.js';

type ToolName =
  | 'task.create'
  | 'task.get'
  | 'task.update'
  | 'task.search'
  | 'task.transition'
  | 'state.get'
  | 'state.patch'
  | 'state.acquire_lock'
  | 'state.release_lock'
  | 'state.append_event'
  | 'state.search'
  | 'fasttrack.evaluate'
  | 'fasttrack.guard_post_dev'
  | 'quality.run_tests'
  | 'quality.coverage_report'
  | 'quality.lint'
  | 'quality.complexity'
  | 'quality.enforce_gates'
  | 'gh.createBranch'
  | 'gh.openPR'
  | 'gh.comment'
  | 'gh.setProjectStatus'
  | 'gh.addLabels';

class SemanticError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'SemanticError';
  }
}

const schemaValidator = new Ajv({ allErrors: true, coerceTypes: false });
addFormats(schemaValidator);

const fastTrackDiffSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['files', 'locAdded', 'locDeleted'],
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    locAdded: { type: 'integer', minimum: 0 },
    locDeleted: { type: 'integer', minimum: 0 }
  }
};

const fastTrackQualitySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    coverage: { type: 'number', minimum: 0, maximum: 1 },
    avgCyclomatic: { type: 'number', minimum: 0 },
    lintErrors: { type: 'integer', minimum: 0 }
  },
  required: ['lintErrors']
};

const fastTrackMetadataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['modulesChanged', 'publicApiChanged'],
  properties: {
    modulesChanged: { type: 'boolean' },
    publicApiChanged: { type: 'boolean' },
    contractsChanged: { type: 'boolean' },
    patternsChanged: { type: 'boolean' },
    adrChanged: { type: 'boolean' },
    packagesSchemaChanged: { type: 'boolean' }
  }
};

const toolInputSchemas: Record<ToolName, any> = {
  'task.create': {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'acceptance_criteria', 'scope'],
    properties: {
      title: { type: 'string', minLength: 5, maxLength: 120 },
      description: { type: 'string', maxLength: 4000 },
      acceptance_criteria: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', minLength: 3, maxLength: 300 }
      },
      scope: { type: 'string', enum: ['minor', 'major'] },
      links: {
        type: 'object',
        additionalProperties: false,
        properties: {
          github: {
            type: 'object',
            additionalProperties: false,
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
              issueNumber: { type: 'integer', minimum: 1 }
            }
          },
          git: {
            type: 'object',
            additionalProperties: false,
            properties: {
              repo: { type: 'string' },
              branch: { type: 'string' },
              prNumber: { type: 'integer', minimum: 1 }
            }
          }
        }
      },
      tags: { type: 'array', items: { type: 'string' } }
    }
  },
  'task.get': {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 5 }
    }
  },
  'task.update': {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'if_rev', 'patch'],
    properties: {
      id: { type: 'string', minLength: 5 },
      if_rev: { type: 'integer', minimum: 0 },
      patch: { type: 'object' }
    }
  },
  'task.search': {
    type: 'object',
    additionalProperties: false,
    properties: {
      q: { type: 'string' },
      status: { type: 'array', items: { type: 'string' } },
      labels: { type: 'array', items: { type: 'string' } },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      offset: { type: 'integer', minimum: 0 }
    }
  },
  'task.transition': {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'to', 'if_rev'],
    properties: {
      id: { type: 'string', minLength: 5 },
      to: { type: 'string', enum: ['po', 'arch', 'dev', 'review', 'po_check', 'qa', 'pr', 'done'] },
      if_rev: { type: 'integer', minimum: 0 },
      evidence: {
        type: 'object',
        additionalProperties: false,
        properties: {
          metrics: {
            type: 'object',
            additionalProperties: false,
            properties: {
              coverage: { type: 'number', minimum: 0, maximum: 1 },
              lint: {
                type: 'object',
                additionalProperties: false,
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
            additionalProperties: false,
            required: ['total', 'passed', 'failed'],
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
              additionalProperties: false,
              properties: {
                rule: { type: 'string' },
                where: { type: 'string' },
                why: { type: 'string' },
                severity: { type: 'string', enum: ['low', 'med', 'high'] },
                suggested_fix: { type: 'string' }
              },
              required: ['rule', 'where', 'why', 'severity', 'suggested_fix']
            }
          },
          acceptance_criteria_met: { type: 'boolean' },
          merged: { type: 'boolean' },
          fast_track: {
            type: 'object',
            additionalProperties: false,
            properties: {
              eligible: { type: 'boolean' },
              score: { type: 'number', minimum: 0, maximum: 100 }
            }
          }
        }
      }
    }
  },
  'state.get': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id'],
    properties: {
      task_id: { type: 'string', minLength: 5 }
    }
  },
  'state.patch': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'if_rev', 'patch'],
    properties: {
      task_id: { type: 'string', minLength: 5 },
      if_rev: { type: 'integer', minimum: 0 },
      patch: { type: 'object' }
    }
  },
  'state.acquire_lock': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'owner_agent'],
    properties: {
      task_id: { type: 'string', minLength: 5 },
      owner_agent: { type: 'string', minLength: 2 },
      ttl_seconds: { type: 'integer', minimum: 1, maximum: 3600 }
    }
  },
  'state.release_lock': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'lease_id'],
    properties: {
      task_id: { type: 'string', minLength: 5 },
      lease_id: { type: 'string', minLength: 5 }
    }
  },
  'state.append_event': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'type', 'payload'],
    properties: {
      task_id: { type: 'string', minLength: 5 },
      type: { type: 'string', minLength: 2 },
      payload: { type: 'object' }
    }
  },
  'state.search': {
    type: 'object',
    additionalProperties: false,
    properties: {
      task_id: { type: 'string', minLength: 5 },
      type: { type: 'string', minLength: 2 },
      limit: { type: 'integer', minimum: 1, maximum: 200 }
    }
  },
  'fasttrack.evaluate': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'diff', 'quality', 'metadata'],
    properties: {
      task_id: { type: 'string', minLength: 5 },
      diff: fastTrackDiffSchema,
      quality: fastTrackQualitySchema,
      metadata: fastTrackMetadataSchema
    }
  },
  'fasttrack.guard_post_dev': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'diff', 'quality', 'metadata'],
    properties: {
      task_id: { type: 'string', minLength: 5 },
      diff: fastTrackDiffSchema,
      quality: fastTrackQualitySchema,
      metadata: fastTrackMetadataSchema,
      reviewer_violations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            rule: { type: 'string' }
          },
          required: ['severity', 'rule']
        }
      }
    }
  },
  'quality.run_tests': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id'],
    properties: {
      task_id: { type: 'string', minLength: 5 }
    }
  },
  'quality.coverage_report': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id'],
    properties: {
      task_id: { type: 'string', minLength: 5 }
    }
  },
  'quality.lint': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id'],
    properties: {
      task_id: { type: 'string', minLength: 5 }
    }
  },
  'quality.complexity': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id'],
    properties: {
      task_id: { type: 'string', minLength: 5 }
    }
  },
  'quality.enforce_gates': {
    type: 'object',
    additionalProperties: false,
    required: ['task_id', 'metrics'],
    properties: {
      task_id: { type: 'string', minLength: 5 },
      metrics: {
        type: 'object',
        additionalProperties: false,
        required: ['coverage', 'lintErrors', 'testsFailed'],
        properties: {
          coverage: { type: 'number', minimum: 0, maximum: 1 },
          lintErrors: { type: 'integer', minimum: 0 },
          testsFailed: { type: 'integer', minimum: 0 }
        }
      }
    }
  },
  'gh.createBranch': {
    type: 'object',
    additionalProperties: false,
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 3 },
      base: { type: 'string', minLength: 2 }
    }
  },
  'gh.openPR': {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'head'],
    properties: {
      title: { type: 'string', minLength: 5 },
      head: { type: 'string', minLength: 2 },
      base: { type: 'string', minLength: 2 },
      body: { type: 'string' },
      draft: { type: 'boolean' },
      labels: { type: 'array', items: { type: 'string' } }
    }
  },
  'gh.comment': {
    type: 'object',
    additionalProperties: false,
    required: ['number', 'body'],
    properties: {
      number: { type: 'integer', minimum: 1 },
      body: { type: 'string', minLength: 1 },
      type: { type: 'string', enum: ['issue', 'pr'] }
    }
  },
  'gh.setProjectStatus': {
    type: 'object',
    additionalProperties: false,
    required: ['itemId', 'status'],
    properties: {
      itemId: { type: 'string', minLength: 5 },
      status: { type: 'string', enum: ['To Do', 'In Progress', 'In Review', 'Done'] }
    }
  },
  'gh.addLabels': {
    type: 'object',
    additionalProperties: false,
    required: ['number', 'labels'],
    properties: {
      number: { type: 'integer', minimum: 1 },
      labels: { type: 'array', items: { type: 'string' }, minItems: 1 },
      type: { type: 'string', enum: ['issue', 'pr'] }
    }
  }
};

const toolDescriptions: Record<ToolName, string> = {
  'task.create': 'Crear TaskRecord en estado inicial',
  'task.get': 'Obtener TaskRecord por id',
  'task.update': 'Actualizar TaskRecord con control de versión',
  'task.search': 'Buscar TaskRecords por texto/estado/etiquetas',
  'task.transition': 'Aplicar transición de estado con validaciones de negocio',
  'state.get': 'Obtener el estado del orquestador para una tarea',
  'state.patch': 'Actualizar campos del estado del orquestador',
  'state.acquire_lock': 'Adquirir un lease de ejecución para una tarea',
  'state.release_lock': 'Liberar un lease previamente adquirido',
  'state.append_event': 'Registrar un evento en el journal del orquestador',
  'state.search': 'Consultar eventos del orquestador',
  'fasttrack.evaluate': 'Evaluar elegibilidad fast-track con reglas duras y puntaje',
  'fasttrack.guard_post_dev': 'Reevaluar fast-track después de DEV (guard post-dev)',
  'quality.run_tests': 'Ejecutar suite de pruebas automatizadas',
  'quality.coverage_report': 'Generar reporte de cobertura',
  'quality.lint': 'Ejecutar análisis estático (lint)',
  'quality.complexity': 'Calcular métricas de complejidad',
  'quality.enforce_gates': 'Aplicar quality gates (coverage, lint, tests)',
  'gh.createBranch': 'Crear una rama local/remota',
  'gh.openPR': 'Abrir un Pull Request',
  'gh.comment': 'Publicar un comentario en Issue/PR',
  'gh.setProjectStatus': 'Actualizar estado en GitHub Projects',
  'gh.addLabels': 'Añadir etiquetas a un Issue/PR'
};

const tools = Object.entries(toolInputSchemas).map(([name, schema]) => ({
  name,
  description: toolDescriptions[name as ToolName] ?? `MCP tool ${name}`,
  inputSchema: schema
}));

const toolValidators = Object.fromEntries(
  Object.entries(toolInputSchemas).map(([name, schema]) => [name, schemaValidator.compile(schema)])
);

function asSuccess(payload: any) {
  return {
    content: [
      {
        type: 'application/json',
        text: JSON.stringify(payload)
      }
    ]
  };
}

function asError(code: number, message: string, details?: any) {
  return {
    content: [
      {
        type: 'application/json',
        text: JSON.stringify({
          error: {
            code,
            message,
            details
          }
        })
      }
    ],
    isError: true
  };
}

class TaskMCPServer {
  private readonly server: Server;

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

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;

      try {
        const result = await handleToolCall(name, args);
        return asSuccess(result);
      } catch (error) {
        if (error instanceof SemanticError) {
          return asError(error.code, error.message);
        }
        if ((error as any).name === 'NotFound404') {
          return asError(404, (error as Error).message);
        }
        if (error instanceof Error) {
          return asError(500, error.message);
        }
        return asError(500, 'Unknown error');
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Task MCP server started');
  }
}

export { TaskMCPServer, handleToolCall };
export const __test__ = {
  toolInputSchemas,
  schemaValidator,
  toolValidators,
  repo,
  stateRepo,
  eventRepo,
  leaseRepo,
  toolHandlers: new Proxy({}, { get: (_, prop) => (input: any) => handleToolCall(prop as string, input) })
};
