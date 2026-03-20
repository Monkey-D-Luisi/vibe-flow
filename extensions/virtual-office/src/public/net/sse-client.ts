/**
 * SSE Client -- EventSource wrapper for the virtual office.
 *
 * Connects to /office/events and provides callbacks for
 * state snapshot and incremental update events.
 */

/** Agent state as received from the server. */
export interface ServerAgentState {
  readonly agentId: string;
  readonly status: 'idle' | 'active' | 'spawning' | 'offline';
  readonly currentTool: string | null;
  readonly pipelineStage: string | null;
  readonly taskId: string | null;
  readonly lastSeenAt: number;
}

/** State change event from the server. */
export interface ServerStateChange {
  readonly agentId: string;
  readonly state: ServerAgentState;
}

export interface SseClientCallbacks {
  onSnapshot(agents: ServerAgentState[]): void;
  onUpdate(change: ServerStateChange): void;
  onError?(error: Event): void;
}

/**
 * Connect to the SSE endpoint and start receiving agent state events.
 * Returns a cleanup function to close the connection.
 */
export function connectSse(callbacks: SseClientCallbacks): () => void {
  const es = new EventSource('/office/events');

  es.addEventListener('snapshot', (e: MessageEvent) => {
    const agents = JSON.parse(e.data) as ServerAgentState[];
    callbacks.onSnapshot(agents);
  });

  es.addEventListener('update', (e: MessageEvent) => {
    const change = JSON.parse(e.data) as ServerStateChange;
    callbacks.onUpdate(change);
  });

  // ping events are keepalive -- no action needed

  es.onerror = (e: Event) => {
    callbacks.onError?.(e);
  };

  return () => es.close();
}
