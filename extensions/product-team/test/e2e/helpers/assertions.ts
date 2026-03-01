import { expect } from 'vitest';

/** Assert that the first task in a pipeline.status result is at the given stage. */
export function assertStage(statusResult: unknown, expectedStage: string): void {
  const tasks = (statusResult as { details: { tasks: Array<{ stage: string }> } }).details.tasks;
  expect(tasks.length).toBeGreaterThan(0);
  expect(tasks[0]?.stage).toBe(expectedStage);
}

/** Assert that a specific task by ID is at the given stage. */
export function assertTaskStage(
  statusResult: unknown,
  taskId: string,
  expectedStage: string,
): void {
  const tasks = (statusResult as { details: { tasks: Array<{ id: string; stage: string }> } }).details.tasks;
  const task = tasks.find((t) => t.id === taskId);
  expect(task, `Task ${taskId} not found in status result`).toBeDefined();
  expect(task?.stage).toBe(expectedStage);
}

/** Assert that at least one message in the inbox matches the given subject. */
export function assertInboxHasMessage(inboxResult: unknown, subject: string): void {
  const messages = (inboxResult as {
    details: { messages: Array<{ subject: string }> };
  }).details.messages;
  const found = messages.some((m) => m.subject === subject || m.subject.includes(subject));
  expect(found, `Expected message with subject containing "${subject}" in inbox`).toBe(true);
}

/** Assert that a decision was logged for the given category. */
export function assertDecisionLogged(logResult: unknown, category: string): void {
  const decisions = (logResult as {
    details: { decisions: Array<{ category: string }> };
  }).details.decisions;
  const found = decisions.some((d) => d.category === category);
  expect(found, `Expected decision with category "${category}" in log`).toBe(true);
}

/** Assert that a decision was escalated. */
export function assertDecisionEscalated(decisionResult: unknown, toAgent?: string): void {
  const { escalated, approver } = (decisionResult as {
    details: { escalated: boolean; approver: string | null };
  }).details;
  expect(escalated).toBe(true);
  if (toAgent !== undefined) {
    expect(approver).toBe(toAgent);
  }
}

/** Assert that a decision was auto-resolved (not escalated). */
export function assertDecisionAutoResolved(decisionResult: unknown): void {
  const { escalated, decision } = (decisionResult as {
    details: { escalated: boolean; decision: string | null };
  }).details;
  expect(escalated).toBe(false);
  expect(decision).not.toBeNull();
}

/** Assert that a stage was skipped and the pipeline advanced. */
export function assertStageSkipped(skipResult: unknown, skippedStage: string, nextStage: string): void {
  const { skipped, skippedStage: actual, nextStage: actualNext } = (skipResult as {
    details: { skipped: boolean; skippedStage: string; nextStage: string };
  }).details;
  expect(skipped).toBe(true);
  expect(actual).toBe(skippedStage);
  expect(actualNext).toBe(nextStage);
}

/** Assert that a task was assigned to a specific agent. */
export function assertTaskAssigned(assignResult: unknown, agentId: string): void {
  const { assigned, agentId: actual } = (assignResult as {
    details: { assigned: boolean; agentId: string };
  }).details;
  expect(assigned).toBe(true);
  expect(actual).toBe(agentId);
}

/** Assert that a message was successfully delivered. */
export function assertMessageDelivered(messageResult: unknown): void {
  const { delivered } = (messageResult as { details: { delivered: boolean } }).details;
  expect(delivered).toBe(true);
}

/** Assert count of pipeline tasks in status result. */
export function assertPipelineTaskCount(statusResult: unknown, count: number): void {
  const { tasks } = (statusResult as { details: { tasks: unknown[]; count: number } }).details;
  expect(tasks.length).toBe(count);
}
