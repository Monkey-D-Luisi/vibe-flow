/**
 * OpenClaw Plugin: Product Team Engine
 *
 * Registers task lifecycle, workflow, quality gate, and VCS tools
 * for orchestrating a multi-agent product development team.
 *
 * @see https://openclaw.ai/docs/plugins
 */

/**
 * Subset of the OpenClaw Plugin API used by this plugin.
 * The full API is provided by the openclaw runtime at register() time.
 */
export interface PluginAPI {
  readonly id: string;
  readonly config: Record<string, unknown>;
  readonly pluginConfig?: Record<string, unknown>;
  readonly logger: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
    debug(msg: string, ...args: unknown[]): void;
  };
  registerTool(tool: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (params: Record<string, unknown>) => Promise<unknown>;
  }, options?: Record<string, unknown>): void;
  on(hook: string, handler: (...args: unknown[]) => unknown, options?: Record<string, unknown>): void;
  registerService(service: { name: string; start(): Promise<void>; stop(): Promise<void> }): void;
}

export function register(api: PluginAPI): void {
  api.logger.info('product-team plugin loaded');
  // EP02: task.create, task.get, task.search, task.update, task.transition
  // EP03: workflow.step.run, workflow.state.get
  // EP04: vcs.branch.create, vcs.pr.create, vcs.pr.update, vcs.label.sync
  // EP05: quality.coverage, quality.lint, quality.complexity
}

export default { register };
