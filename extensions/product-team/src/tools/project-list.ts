import type { ToolDef, ToolDeps } from './index.js';
import { ProjectListParams } from '../schemas/project.schema.js';

export function projectListToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'project.list',
    label: 'List Projects',
    description: 'List all registered project workspaces and their configuration',
    parameters: ProjectListParams,
    execute: async (_toolCallId, _params) => {
      const cfg = deps.projectConfig;
      const projects = (cfg?.projects ?? []).map((p) => ({
        id: String(p['id'] ?? ''),
        name: String(p['name'] ?? ''),
        repo: String(p['repo'] ?? ''),
        workspace: String(p['workspace'] ?? ''),
        defaultBranch: String(p['defaultBranch'] ?? 'main'),
        active: String(p['id'] ?? '') === cfg?.activeProject,
      }));
      const result = { projects, activeProject: cfg?.activeProject ?? null };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
