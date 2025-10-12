import { handleTaskCreate } from './taskCreateHandler.js';
import { handleTaskGet, handleTaskUpdate, handleTaskSearch } from './taskHandlers.js';
import { handleTaskTransition } from './taskTransitionHandler.js';
import { handleStateGet, handleStatePatch, handleStateAcquireLock, handleStateReleaseLock, handleStateAppendEvent, handleStateSearch } from './stateHandlers.js';
import { runTests, coverageReport, lint, complexity, enforceGates } from './qualityHandlers.js';

// Dispatcher por tabla
const handlers: Record<string, (input: unknown) => Promise<unknown>> = {
  'task.create': handleTaskCreate,
  'task.get': handleTaskGet,
  'task.update': handleTaskUpdate,
  'task.search': handleTaskSearch,
  'task.transition': handleTaskTransition,
  'state.get': handleStateGet,
  'state.patch': handleStatePatch,
  'state.acquire_lock': handleStateAcquireLock,
  'state.release_lock': handleStateReleaseLock,
  'state.append_event': handleStateAppendEvent,
  'state.search': handleStateSearch,
  'quality.run_tests': runTests,
  'quality.coverage_report': coverageReport,
  'quality.lint': lint,
  'quality.complexity': complexity,
  'quality.enforce_gates': enforceGates,
  // Agregar otros handlers aquí
} as const;

export async function handleToolCall(tool: string, input: unknown) {
  const h = handlers[tool];
  if (!h) {
    const NotFound404 = class extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'NotFound404';
      }
    };
    throw new NotFound404(`Unsupported tool ${tool}`);
  }
  return h(input);
}