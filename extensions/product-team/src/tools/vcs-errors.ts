import { GhCommandError } from '../github/gh-client.js';

function toStructuredError(error: unknown): Error {
  if (error instanceof GhCommandError) {
    return new Error(
      JSON.stringify({
        code: error.details.code,
        message: error.message,
        command: error.details.command,
        exitCode: error.details.exitCode,
        timedOut: error.details.timedOut,
      }),
    );
  }

  if (error instanceof Error) {
    return new Error(
      JSON.stringify({
        code: 'VCS_TOOL_ERROR',
        message: error.message,
      }),
    );
  }

  return new Error(
    JSON.stringify({
      code: 'VCS_TOOL_ERROR',
      message: String(error),
    }),
  );
}

export function rethrowVcsError(error: unknown): never {
  throw toStructuredError(error);
}
