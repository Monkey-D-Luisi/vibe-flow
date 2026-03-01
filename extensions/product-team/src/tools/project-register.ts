import type { ToolDef, ToolDeps } from './index.js';
import { ProjectRegisterParams } from '../schemas/project.schema.js';

export function projectRegisterToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'project.register',
    label: 'Register Project',
    description: 'Register a new project workspace and optionally clone its repository',
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

      const cfg = deps.projectConfig;
      const projects = cfg?.projects ?? [];
      const existing = projects.find((p) => String(p['id'] ?? '') === input.id);
      if (existing) {
        const result = { registered: false, reason: `Project "${input.id}" already exists` };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      const newProject: Record<string, unknown> = {
        id: input.id,
        name: input.name,
        repo: input.repo,
        defaultBranch: input.defaultBranch ?? 'main',
        workspace: input.workspace ?? `/workspaces/${input.id}`,
        stitch: input.stitch ?? { projectId: null },
        quality: input.quality ?? { coverageMajor: 80, coverageMinor: 70, maxComplexity: 5.0 },
      };

      if (cfg) {
        if (!cfg.projects) {
          cfg.projects = [];
        }
        cfg.projects.push(newProject);
      }

      deps.logger?.info(`project.register: Registered project "${input.id}" → ${String(newProject['workspace'])}`);

      const result = { registered: true, project: newProject };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
