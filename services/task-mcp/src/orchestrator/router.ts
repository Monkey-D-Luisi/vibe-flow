import { TaskRecord } from '../domain/TaskRecord.js';
import { evaluateFastTrack, FastTrackContext } from '../domain/FastTrack.js';

export type AgentType = 'po' | 'architect' | 'dev' | 'reviewer' | 'qa' | 'prbot';

export interface NextAgentOptions {
  fastTrack?: FastTrackContext;
}

export function nextAgent(tr: TaskRecord, options: NextAgentOptions = {}): AgentType | null {
  switch (tr.status) {
    case 'po': {
      if (tr.scope === 'minor' && options.fastTrack) {
        const evaluation = evaluateFastTrack(options.fastTrack);
        if (evaluation.eligible) {
          return 'dev';
        }
      }
      return 'architect';
    }
    case 'arch':
      return 'dev';
    case 'dev':
      return 'reviewer';
    case 'review':
      return 'po'; // PO realiza el PO Check
    case 'po_check':
      return 'qa';
    case 'qa':
      return 'prbot';
    case 'pr':
      return null;
    default:
      return null;
  }
}

export function canTransitionTo(currentStatus: string, targetAgent: AgentType): boolean {
  const stubRecord: TaskRecord = {
    id: 'TR-STUB00000000000000000000',
    title: 'stub',
    acceptance_criteria: ['stub'],
    scope: 'major',
    status: currentStatus as TaskRecord['status'],
    rev: 0,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString()
  };
  const expectedNext = nextAgent(stubRecord);
  return expectedNext === targetAgent;
}

export function getAgentInputSchema(agent: AgentType): string {
  const schemas = {
    po: 'po_input',
    architect: 'po_brief',
    dev: 'design_ready',
    reviewer: 'dev_work_output',
    qa: 'reviewer_report',
    prbot: 'qa_report'
  } as const;
  return schemas[agent];
}

export function getAgentOutputSchema(agent: AgentType): string {
  const schemas = {
    po: 'po_brief',
    architect: 'design_ready',
    dev: 'dev_work_output',
    reviewer: 'reviewer_report',
    qa: 'qa_report',
    prbot: 'pr_summary'
  } as const;
  return schemas[agent];
}
