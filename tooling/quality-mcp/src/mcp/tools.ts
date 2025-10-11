import Ajv from 'ajv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { runTests } from '../tools/run_tests.js';
import { loadSchema } from '../../../../services/task-mcp/src/utils/loadSchema.js';

type ToolName = 'quality.run_tests';

class SemanticError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'SemanticError';
  }
}

const schemaValidator = new Ajv({ allErrors: true });

const toolInputSchemas: Record<ToolName, any> = {
  'quality.run_tests': loadSchema('quality_tests.input.schema.json')
};

const toolDescriptions: Record<ToolName, string> = {
  'quality.run_tests': 'Ejecutar suite de pruebas automatizadas y devolver métricas'
};

const toolValidators = Object.fromEntries(
  Object.entries(toolInputSchemas).map(([name, schema]) => [name, schemaValidator.compile(schema)])
) as Record<string, ValidateFunction>;

const tools = Object.entries(toolInputSchemas).map(([name, schema]) => ({
  name,
  description: toolDescriptions[name as ToolName] ?? `MCP tool ${name}`,
  inputSchema: schema
}));

const toolHandlers: Record<ToolName, (args: any) => Promise<any>> = {
  'quality.run_tests': async (args) => {
    return await runTests(args);
  }
};

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

class QualityMCPServer {
  private readonly server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'quality-mcp',
        version: '0.1.0'
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

      if (!toolHandlers[name as ToolName]) {
        return asError(404, `Unknown tool: ${name}`);
      }

      const validator = toolValidators[name as ToolName];
      if (validator && !validator(args)) {
        const details = validator.errors ?? [];
        return asError(422, 'Input validation failed', details);
      }

      try {
        const result = await toolHandlers[name as ToolName](args);
        return asSuccess(result);
      } catch (error) {
        if (error instanceof SemanticError) {
          return asError(error.code, error.message);
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
    console.error('Quality MCP server started');
  }
}

export { QualityMCPServer };