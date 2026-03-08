/**
 * Domain errors for the task engine.
 *
 * These error classes represent domain-specific failures that can occur
 * during task lifecycle operations.
 */

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`);
    this.name = 'TaskNotFoundError';
  }
}

export class StaleRevisionError extends Error {
  constructor(taskId: string, expectedRev: number, actualRev: number) {
    super(
      `Stale revision for task ${taskId}: expected rev=${expectedRev}, actual rev=${actualRev}`,
    );
    this.name = 'StaleRevisionError';
  }
}

export class InvalidTransitionError extends Error {
  constructor(taskId: string, from: string, to: string) {
    super(`Invalid transition for task ${taskId}: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class LeaseConflictError extends Error {
  constructor(taskId: string, currentHolder: string) {
    super(
      `Lease conflict for task ${taskId}: currently held by ${currentHolder}`,
    );
    this.name = 'LeaseConflictError';
  }
}

export class LeaseNotHeldError extends Error {
  constructor(taskId: string, agentId: string) {
    super(`Agent ${agentId} does not hold lease for task ${taskId}`);
    this.name = 'LeaseNotHeldError';
  }
}

export class LeaseCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeaseCapacityError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(`Validation failed: ${message}`);
    this.name = 'ValidationError';
  }
}

export class TransitionGuardError extends Error {
  constructor(taskId: string, from: string, to: string, reasons: string[]) {
    super(
      `Transition guard failed for task ${taskId} (${from} -> ${to}): ${reasons.join('; ')}`,
    );
    this.name = 'TransitionGuardError';
  }
}

export class BudgetExhaustedError extends Error {
  constructor(
    scope: string,
    scopeId: string,
    consumedTokens: number,
    limitTokens: number,
  ) {
    super(
      `Budget exhausted for ${scope}/${scopeId}: consumed ${consumedTokens} of ${limitTokens} tokens`,
    );
    this.name = 'BudgetExhaustedError';
  }
}

export class BudgetNotFoundError extends Error {
  constructor(budgetId: string) {
    super(`Budget not found: ${budgetId}`);
    this.name = 'BudgetNotFoundError';
  }
}
