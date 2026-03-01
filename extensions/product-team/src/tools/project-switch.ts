import type { ToolDef, ToolDeps } from './index.js';
import { ProjectSwitchParams } from '../schemas/project.schema.js';
import { ValidationError } from '../domain/errors.js';

export function projectSwitchToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'project.switch',
    label: 'Switch Project',
    description: 'Switch the active project context for subsequent tool calls',
    parameters: ProjectSwitchParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<{ projectId: string }>(ProjectSwitchParams, params);
      const cfg = deps.projectConfig;
      const projects = cfg?.projects ?? [];
      const target = projects.find((p) => String(p['id'] ?? '') === input.projectId);
      if (!target) {
        throw new ValidationError(
          `Project "${input.projectId}" not found. Available: ${projects.map((p) => String(p['id'] ?? '')).join(', ')}`,
        );
      }

      if (cfg) {
        cfg.activeProject = input.projectId;
      }

      const result = {
        switched: true,
        projectId: input.projectId,
        workspace: String(target['workspace'] ?? ''),
        repo: String(target['repo'] ?? ''),
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
