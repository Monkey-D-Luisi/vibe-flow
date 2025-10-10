import { TaskRecord } from '../domain/TaskRecord';
import { evaluateFastTrack, FastTrackContext } from '../domain/FastTrack';

export type AgentType = 'po' | 'architect' | 'dev' | 'reviewer' | 'qa' | 'prbot';

export function nextAgent(tr: TaskRecord, fastTrackCtx?: FastTrackContext): AgentType | null {
  // Fast-track evaluation for minor scope: PO → DEV (skip architect)
  if (tr.status === 'po' && tr.scope === 'minor') {
    if (fastTrackCtx) {
      const evaluation = evaluateFastTrack(fastTrackCtx);
      if (evaluation.eligible) {
        return 'dev'; // Fast-track: PO → DEV
      }
    } else {
      // Fallback: if no context provided, assume fast-track for minor scope
      return 'dev';
    }
  }

  // Normal flow
  switch (tr.status) {
    case 'po':
      return 'architect';
    case 'arch':
      return 'dev';
    case 'dev':
      return 'reviewer';
    case 'review':
      return 'qa';
    case 'qa':
      return 'prbot';
    case 'pr':
      return null; // End of flow
    default:
      return null;
  }
}

export function canTransitionTo(currentStatus: string, targetAgent: AgentType): boolean {
  const expectedNext = nextAgent({ status: currentStatus } as TaskRecord);
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
  };
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
  };
  return schemas[agent];
}