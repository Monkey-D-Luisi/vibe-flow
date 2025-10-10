import { TaskRecord } from '../domain/TaskRecord';
import { AgentType } from './router';

// Map agent outputs to TaskRecord patches
export function mapAgentOutput(agent: AgentType, output: any): Partial<TaskRecord> {
  switch (agent) {
    case 'po':
      return mapPoOutput(output);
    case 'architect':
      return mapArchitectOutput(output);
    case 'dev':
      return mapDevOutput(output);
    case 'reviewer':
      return mapReviewerOutput(output);
    case 'qa':
      return mapQaOutput(output);
    case 'prbot':
      return mapPrBotOutput(output);
    default:
      throw new Error(`Unknown agent type: ${agent}`);
  }
}

function mapPoOutput(output: any): Partial<TaskRecord> {
  return {
    // PO output is the brief, but we don't store it directly in TaskRecord
    // The brief is used as input for the next agent
  };
}

function mapArchitectOutput(output: any): Partial<TaskRecord> {
  return {
    modules: output.modules,
    contracts: output.contracts,
    patterns: output.patterns,
    adr_id: output.adr_id,
    test_plan: output.test_plan,
  };
}

function mapDevOutput(output: any): Partial<TaskRecord> {
  return {
    diff_summary: output.diff_summary,
    metrics: {
      coverage: output.metrics.coverage,
      lint: output.metrics.lint,
    },
    red_green_refactor_log: output.red_green_refactor_log,
  };
}

function mapReviewerOutput(output: any): Partial<TaskRecord> {
  return {
    review_notes: output.violations.map((v: any) => `${v.rule}: ${v.where} - ${v.suggested_fix}`),
  };
}

function mapQaOutput(output: any): Partial<TaskRecord> {
  return {
    qa_report: {
      total: output.total,
      passed: output.passed,
      failed: output.failed,
    },
  };
}

function mapPrBotOutput(output: any): Partial<TaskRecord> {
  return {
    branch: output.branch,
    links: {
      git: {
        repo: '', // Will be filled by context
        branch: output.branch,
        prNumber: extractPrNumber(output.pr_url),
      },
    },
  };
}

function extractPrNumber(prUrl: string): number {
  const match = prUrl.match(/\/pull\/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}