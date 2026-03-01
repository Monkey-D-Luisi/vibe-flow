import type { ToolDef, ToolDeps } from './index.js';
import { ProjectRegisterParams } from '../schemas/project.schema.js';

const SAFE_ID_RE = /^[\w-]+$/;

export function projectRegisterToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'project.register',
    label: 'Register Project',
    description: 'Register a new project workspace; the repository is cloned at next gateway boot, not immediately',
    parameters: ProjectRegisterParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<{
        id: string;
        name: string;
        repo: string;
        defaultBranch?: string;
        workspace?: string;
        stitch?: { projectId: string | null };
        quality?: { coverageMajor?: number; coverageMinor?: number; maxComplexity?: number };
      }>(ProjectRegisterParams, params);

      if (!SAFE_ID_RE.test(input.id)) {
        const result = { registered: false, reason: `Invalid project id "${input.id}": must match /^[\\w-]+$/` };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      const cfg = deps.projectConfig;
      if (!cfg) {
        const result = { registered: false, reason: 'No project registry available' };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      cfg.projects ??= [];
      const existing = cfg.projects.find((p) => String(p['id'] ?? '') === input.id);
      if (existing) {
        const result = { registered: false, reason: `Project "${input.id}" already exists` };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      const newProject = {
        id: input.id,
        name: input.name,
        repo: input.repo,
        defaultBranch: input.defaultBranch ?? 'main',
        workspace: input.workspace ?? `/workspaces/${input.id}`,
        stitch: input.stitch ?? { projectId: null },
        quality: input.quality ?? { coverageMajor: 80, coverageMinor: 70, maxComplexity: 5.0 },
      };

      cfg.projects.push(newProject);

      deps.logger?.info(`project.register: Registered project "${input.id}" → ${newProject.workspace}`);

      const result = { registered: true, project: newProject };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
