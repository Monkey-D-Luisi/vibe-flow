import Ajv from 'ajv';
import { AgentType } from './router';

const ajv = new Ajv({ allErrors: true, strict: false });

// Mock agent execution - in real implementation this would call OpenAI Agent Builder or similar
export async function runAgent(agent: AgentType, input: any): Promise<any> {
  // This is a placeholder - in real implementation would call the actual agent
  // For now, return mock data that matches the expected schema

  console.log(`Running agent: ${agent}`, input);

  // Mock responses for testing
  switch (agent) {
    case 'po':
      return {
        title: input.title,
        acceptance_criteria: input.acceptance_criteria,
        scope: input.scope,
        non_functional: ['Security: data encryption', 'Performance: < 2s response'],
        done_if: ['User can login successfully', 'Password is encrypted']
      };

    case 'architect':
      return {
        modules: ['UserService', 'AuthModule'],
        contracts: [
          { name: 'UserRepository', methods: ['findById', 'save', 'delete'] },
          { name: 'AuthService', methods: ['login', 'logout', 'validateToken'] }
        ],
        patterns: [
          { name: 'Repository', where: 'data access', why: 'abstraction over persistence' },
          { name: 'Service Layer', where: 'business logic', why: 'separation of concerns' }
        ],
        adr_id: 'ADR-001',
        test_plan: ['Unit tests for all services', 'Integration tests for auth flow']
      };

    case 'dev':
      return {
        diff_summary: 'Implemented UserService and AuthModule with TDD',
        metrics: {
          coverage: 0.85,
          lint: { errors: 0, warnings: 2 }
        },
        red_green_refactor_log: [
          'RED: UserService.findById test fails',
          'GREEN: Implemented UserService.findById',
          'REFACTOR: Extracted UserValidator interface'
        ]
      };

    case 'reviewer':
      return {
        violations: [
          {
            rule: 'SOLID - Single Responsibility',
            where: 'AuthService.login()',
            why: 'Method handles validation and authentication',
            severity: 'med',
            suggested_fix: 'Extract AuthValidator class'
          }
        ],
        summary: 'Good implementation with minor improvements needed'
      };

    case 'qa':
      return {
        total: 25,
        passed: 23,
        failed: 2,
        evidence: [
          'Unit tests: 20/20 passed',
          'Integration tests: 3/5 failed - timeout issues',
          'Coverage report: coverage.json'
        ]
      };

    case 'prbot':
      return {
        branch: 'feature/user-auth',
        pr_url: 'https://github.com/org/repo/pull/123',
        checklist: [
          '✅ ACs cumplidos',
          '✅ RGR log: red→green→refactor',
          '✅ Cobertura ≥ 80%',
          '✅ Lint 0 errores',
          '✅ ADR-001 registrado',
          '✅ QA: 23/25 tests pasaron'
        ]
      };

    default:
      throw new Error(`Unknown agent: ${agent}`);
  }
}

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Validate agent output against schema
export function validateAgentOutput(agent: AgentType, output: any): any {
  const schemaFile = `${getAgentOutputSchemaFile(agent)}.schema.json`;
  const schemaPath = join(__dirname, '../../../../packages/schemas', schemaFile);

  try {
    const schemaContent = readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(schemaContent);
    const validator = ajv.compile(schema);

    if (!validator(output)) {
      throw new Error(`Agent ${agent} output validation failed: ${JSON.stringify(validator.errors)}`);
    }

    return output;
  } catch (error) {
    throw new Error(`Failed to load schema for ${agent}: ${(error as Error).message}`);
  }
}

function getAgentOutputSchemaFile(agent: AgentType): string {
  const files = {
    po: 'po_brief',
    architect: 'design_ready',
    dev: 'dev_work_output',
    reviewer: 'reviewer_report',
    qa: 'qa_report',
    prbot: 'pr_summary'
  };
  return files[agent];
}