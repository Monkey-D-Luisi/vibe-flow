type ShutdownSignal = 'exit' | 'SIGINT' | 'SIGTERM';

interface RegisteredShutdownHook {
  readonly listener: () => void;
  readonly close: () => void;
}

const SHUTDOWN_SIGNALS: readonly ShutdownSignal[] = ['exit', 'SIGINT', 'SIGTERM'];

let registeredShutdownHook: RegisteredShutdownHook | null = null;

function clearRegisteredShutdownHook(closeActiveConnection: boolean): void {
  if (!registeredShutdownHook) {
    return;
  }

  const hook = registeredShutdownHook;
  for (const signal of SHUTDOWN_SIGNALS) {
    process.removeListener(signal, hook.listener);
  }

  registeredShutdownHook = null;
  if (closeActiveConnection) {
    hook.close();
  }
}

export function registerProcessShutdownHooks(close: () => void): void {
  // Re-registering the plugin should replace hooks instead of stacking listeners.
  clearRegisteredShutdownHook(true);

  let closed = false;
  const closeOnce = () => {
    if (closed) {
      return;
    }
    closed = true;

    for (const signal of SHUTDOWN_SIGNALS) {
      process.removeListener(signal, closeOnce);
    }
    registeredShutdownHook = null;
    close();
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, closeOnce);
  }

  registeredShutdownHook = {
    listener: closeOnce,
    close: closeOnce,
  };
}

export function resetProcessShutdownHooksForTests(): void {
  clearRegisteredShutdownHook(false);
}
