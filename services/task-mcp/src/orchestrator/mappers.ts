import { TaskRecord } from '../domain/TaskRecord.js';
import { AgentType } from './router.js';

type ArchitectOutput = {
  modules?: string[];
  contracts?: TaskRecord['contracts'];
  patterns?: TaskRecord['patterns'];
  adr_id?: string;
  test_plan?: string[];
};

type DevOutput = {
  diff_summary?: string;
  metrics: {
    coverage: number;
    lint: {
      errors: number;
      warnings: number;
    };
  };
  red_green_refactor_log: string[];
};

type ReviewerOutput = {
  violations?: Array<{ rule: string; where?: string; suggested_fix?: string }>;
};

type QaOutput = {
  total: number;
  passed: number;
  failed: number;
};

type PrBotOutput = {
  branch: string;
  pr_url: string;
};

type AgentOutput = Record<string, unknown>;

export function mapAgentOutput(agent: AgentType, output: AgentOutput): Partial<TaskRecord> {
  switch (agent) {
    case 'po':
      return {};
    case 'architect':
      return mapArchitectOutput(output as ArchitectOutput);
    case 'dev':
      return mapDevOutput(output as DevOutput);
    case 'reviewer':
      return mapReviewerOutput(output as ReviewerOutput);
    case 'qa':
      return mapQaOutput(output as QaOutput);
    case 'prbot':
      return mapPrBotOutput(output as PrBotOutput);
    default:
      throw new Error(`Unknown agent type: ${agent}`);
  }
}

function mapArchitectOutput(output: ArchitectOutput): Partial<TaskRecord> {
  return {
    modules: output.modules,
    contracts: output.contracts,
    patterns: output.patterns,
    adr_id: output.adr_id,
    test_plan: output.test_plan
  };
}

function mapDevOutput(output: DevOutput): Partial<TaskRecord> {
  return {
    diff_summary: output.diff_summary,
    metrics: {
      coverage: output.metrics.coverage,
      lint: output.metrics.lint
    },
    red_green_refactor_log: output.red_green_refactor_log
  };
}

function mapReviewerOutput(output: ReviewerOutput): Partial<TaskRecord> {
  const violations = output.violations ?? [];
  const notes = violations.map((violation) => {
    const location = violation.where ? ` ${violation.where}` : '';
    const suggestion = violation.suggested_fix ? ` - ${violation.suggested_fix}` : '';
    return `${violation.rule}:${location}${suggestion}`;
  });

  return notes.length > 0 ? { review_notes: notes } : {};
}

function mapQaOutput(output: QaOutput): Partial<TaskRecord> {
  return {
    qa_report: {
      total: output.total,
      passed: output.passed,
      failed: output.failed
    }
  };
}

function mapPrBotOutput(output: PrBotOutput): Partial<TaskRecord> {
  return {
    branch: output.branch,
    links: {
      git: {
        repo: '',
        branch: output.branch,
        prNumber: extractPrNumber(output.pr_url)
      }
    }
  };
}

function extractPrNumber(prUrl: string): number {
  const match = prUrl.match(/\/pull\/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 0;
}
