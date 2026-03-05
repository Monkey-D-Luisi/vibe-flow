/**
 * Before-tool-call hook that auto-injects the caller's agentId into
 * decision_evaluate params so the decision engine can track decisions
 * per-agent instead of using a hardcoded placeholder.
 *
 * Follows the same pattern as origin-injection.ts — the SDK provides
 * ctx.agentId in before_tool_call hooks, which is the authoritative
 * source for caller identity.
 */

/**
 * Inject agentId from hook context into decision_evaluate params.
 *
 * Always overrides any LLM-provided agentId — the session context is
 * the trusted source of truth.
 *
 * Returns modified params with agentId set, or undefined if no
 * modification is needed (non-decision_evaluate or no agentId).
 */
export function injectAgentIdIntoDecisionEvaluate(
  event: { toolName: string; params: Record<string, unknown> },
  ctx: { agentId?: string; sessionKey?: string },
): { params: Record<string, unknown> } | undefined {
  if (event.toolName !== 'decision_evaluate') return undefined;

  if (!ctx.agentId) return undefined;

  return {
    params: {
      ...event.params,
      agentId: ctx.agentId,
    },
  };
}
