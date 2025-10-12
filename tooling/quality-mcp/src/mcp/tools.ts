import Ajv, { type ValidateFunction } from 'ajv/dist/2020.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { runTests } from '../tools/run_tests.js';
import { coverageReport } from '../tools/coverage_report.js';
import { lint } from '../tools/lint.js';
import { complexity } from '../tools/complexity.js';
import { gateEnforce } from '../tools/gate_enforce.js';
import { loadSchema } from '../../../../services/task-mcp/src/utils/loadSchema.js';

type ToolName =
  | 'quality.run_tests'
  | 'quality.coverage_report'
  | 'quality.lint'
  | 'quality.complexity'
  | 'quality.gate_enforce';

class SemanticError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'SemanticError';
  }
}

const schemaValidator = new Ajv({ allErrors: true });

const toolInputSchemas: Record<ToolName, any> = {
  'quality.run_tests': loadSchema('quality_tests.input.schema.json'),
  'quality.coverage_report': loadSchema('quality_coverage.input.schema.json'),
  'quality.lint': loadSchema('quality_lint.input.schema.json'),
  'quality.complexity': loadSchema('quality_complexity.input.schema.json'),
  'quality.gate_enforce': loadSchema('quality_gate.input.schema.json')
};

const toolDescriptions: Record<ToolName, string> = {
  'quality.run_tests': 'Ejecutar suite de pruebas automatizadas y devolver métricas',
  'quality.coverage_report': 'Generar reporte de cobertura (total y por archivo) a partir de Istanbul',
  'quality.lint': 'Ejecutar linter del repositorio y devolver reporte normalizado (errores y avisos)',
  'quality.complexity': 'Calcular complejidad ciclomática por archivo y unidad (funciones, métodos, clases)',
  'quality.gate_enforce': 'Evaluar el quality gate combinando resultados de tests, cobertura, lint y complejidad'
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
  },
  'quality.coverage_report': async (args) => {
    return await coverageReport(args);
  },
  'quality.lint': async (args) => {
    return await lint(args);
  },
  'quality.complexity': async (args) => {
    return await complexity(args);
  },
  'quality.gate_enforce': async (args) => {
    return await gateEnforce(args);
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

