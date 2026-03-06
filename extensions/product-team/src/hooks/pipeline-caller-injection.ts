/**
 * Before-tool-call hook that auto-injects the caller's agentId into
 * pipeline_advance params so the tool can validate that the caller
 * is the current stage owner (or an authorized coordinator).
 *
 * Follows the same pattern as agent-id-injection.ts — the SDK provides
 * ctx.agentId in before_tool_call hooks, which is the authoritative
 * source for caller identity.
 */

/**
 * Inject _callerAgentId from hook context into pipeline_advance params.
 *
 * Always overrides any LLM-provided _callerAgentId — the session context is
 * the trusted source of truth.
 *
 * Returns modified params with _callerAgentId set, or undefined if no
 * modification is needed (non-pipeline_advance or no agentId).
 */
export function injectCallerIntoPipelineAdvance(
  event: { toolName: string; params: Record<string, unknown> },
  ctx: { agentId?: string; sessionKey?: string },
): { params: Record<string, unknown> } | undefined {
  if (event.toolName !== 'pipeline_advance') return undefined;

  if (!ctx.agentId) return undefined;

  return {
    params: {
      ...event.params,
      _callerAgentId: ctx.agentId,
    },
  };
}
