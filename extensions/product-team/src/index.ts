/**
 * OpenClaw Plugin: Product Team Engine
 *
 * Registers task lifecycle, workflow, quality gate, and VCS tools
 * for orchestrating a multi-agent product development team.
 *
 * Compatible with OpenClawPluginApi from 'openclaw/plugin-sdk'.
 * A local subset interface is used for standalone development.
 */

/**
 * Subset of OpenClawPluginApi.
 * The full API is provided by the openclaw runtime at register() time.
 * @see https://github.com/nicepkg/openclaw (src/plugins/types.ts)
 */
export interface OpenClawPluginApi {
  readonly id: string;
  readonly name: string;
  readonly config: Record<string, unknown>;
  readonly pluginConfig: Record<string, unknown>;
  readonly logger: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
    debug(msg: string, ...args: unknown[]): void;
  };
  registerTool(tool: unknown, opts?: Record<string, unknown>): void;
  on(hook: string, handler: (...args: unknown[]) => unknown, opts?: Record<string, unknown>): void;
  registerService(service: unknown): void;
}

export function register(api: OpenClawPluginApi): void {
  api.logger.info('product-team plugin loaded');
  // EP02: task.create, task.get, task.search, task.update, task.transition
  // EP03: workflow.step.run, workflow.state.get
  // EP04: vcs.branch.create, vcs.pr.create, vcs.pr.update, vcs.label.sync
  // EP05: quality.coverage, quality.lint, quality.complexity
}

export default {
  id: 'product-team',
  name: 'Product Team Engine',
  description: 'Task engine + workflow tools for a multi-agent product team',
  register,
};
