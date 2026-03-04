/**
 * Before-tool-call hook that auto-injects originChannel and originSessionKey
 * into team_message calls when the caller's session key indicates an external
 * channel (e.g. Telegram).
 *
 * The SDK provides ctx.sessionKey in before_tool_call hooks (unlike
 * after_tool_call where it is always undefined). This lets us parse the
 * session key to determine the originating channel and inject it into the
 * tool params so the delivery routing pipeline works without relying on
 * the LLM to pass these fields explicitly.
 */

/** Extract the channel name from a session key, if present. */
export function parseChannelFromSessionKey(sessionKey: string): string | null {
  // Pattern: agent:<id>:<channel>:<type>:<target>
  // e.g. "agent:pm:telegram:group:-5177552677"
  const parts = sessionKey.split(':');
  if (parts.length >= 3 && parts[0] === 'agent') {
    const channel = parts[2];
    // "main" is not an external channel
    if (channel && channel !== 'main') return channel;
  }
  return null;
}

/**
 * Hook handler for before_tool_call that injects origin channel info
 * into team_message params from the authoritative session context.
 *
 * Always overrides any LLM-provided values for originChannel and
 * originSessionKey — the session context is the trusted source of truth,
 * not the model's guess (which may be stale or incorrect).
 *
 * Returns modified params with originChannel and originSessionKey set,
 * or undefined if no modification is needed (non-team_message or no session).
 */
export function injectOriginIntoTeamMessage(
  event: { toolName: string; params: Record<string, unknown> },
  ctx: { agentId?: string; sessionKey?: string },
): { params: Record<string, unknown> } | undefined {
  // Only intercept team_message (registered as team_message with underscore)
  if (event.toolName !== 'team_message') return undefined;

  // Need sessionKey to determine origin
  if (!ctx.sessionKey) return undefined;

  const channel = parseChannelFromSessionKey(ctx.sessionKey);
  if (!channel) return undefined;

  // Always inject from session context — override any LLM-provided values
  return {
    params: {
      ...event.params,
      originChannel: channel,
      originSessionKey: ctx.sessionKey,
    },
  };
}
