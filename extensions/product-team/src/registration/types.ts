/**
 * Shared types for route registration modules.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface Logger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
}

export interface RouteRegistrar {
  registerHttpRoute: (params: {
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }) => void;
}
