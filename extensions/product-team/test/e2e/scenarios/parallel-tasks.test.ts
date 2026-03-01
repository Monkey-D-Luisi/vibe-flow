/**
 * E2E Scenario: Parallel Tasks
 *
 * Multiple pipeline tasks run simultaneously at different stages.
 * Each task is tracked independently with its own stage, owner, and message inbox.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createPipelineHarness,
  nextCallId,
  type PipelineHarness,
} from '../helpers/pipeline-harness.js';
import {
  assertTaskStage,
  assertPipelineTaskCount,
} from '../helpers/assertions.js';

describe('E2E: Parallel Tasks — multiple tasks in-flight simultaneously', () => {
  let harness: PipelineHarness;

  beforeEach(() => {
    harness = createPipelineHarness();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('tracks three pipeline tasks independently at different stages', async () => {
    const { tools, advanceToStage } = harness;

    // 1. Start three tasks concurrently
    const featureResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Feature A: Dark mode for dashboard',
    });
    const featureTaskId = (featureResult as { details: { taskId: string } }).details.taskId;

    const backendResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Feature B: GraphQL API for mobile client',
    });
    const backendTaskId = (backendResult as { details: { taskId: string } }).details.taskId;

    const hotfixResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Hotfix: Fix session timeout not resetting on activity',
    });
    const hotfixTaskId = (hotfixResult as { details: { taskId: string } }).details.taskId;

    // All start at IDEA
    const initialStatus = await tools.pipelineStatus.execute(nextCallId(), {});
    assertPipelineTaskCount(initialStatus, 3);

    // 2. Advance each task to a different stage (simulating parallel work)
    advanceToStage(featureTaskId, 'DESIGN');
    advanceToStage(backendTaskId, 'QA');
    advanceToStage(hotfixTaskId, 'REVIEW');

    // 3. Verify each task is at its own stage independently
    const featureStatus = await tools.pipelineStatus.execute(nextCallId(), { taskId: featureTaskId });
    assertTaskStage(featureStatus, featureTaskId, 'DESIGN');

    const backendStatus = await tools.pipelineStatus.execute(nextCallId(), { taskId: backendTaskId });
    assertTaskStage(backendStatus, backendTaskId, 'QA');

    const hotfixStatus = await tools.pipelineStatus.execute(nextCallId(), { taskId: hotfixTaskId });
    assertTaskStage(hotfixStatus, hotfixTaskId, 'REVIEW');

    // 4. Each task has its own message thread
    await tools.teamMessage.execute(nextCallId(), {
      from: 'designer',
      to: 'front-1',
      subject: 'Feature A: Design ready',
      body: 'Dark mode design is complete.',
      taskRef: featureTaskId,
    });
    await tools.teamMessage.execute(nextCallId(), {
      from: 'qa',
      to: 'tech-lead',
      subject: 'Feature B: QA passed',
      body: 'GraphQL API tests all pass.',
      taskRef: backendTaskId,
    });
    await tools.teamMessage.execute(nextCallId(), {
      from: 'tech-lead',
      to: 'devops',
      subject: 'Hotfix: Approved for shipping',
      body: 'Session timeout fix approved. Create hotfix PR.',
      taskRef: hotfixTaskId,
    });

    // 5. Advance hotfix to DONE while others are still in progress
    advanceToStage(hotfixTaskId, 'SHIPPING');
    advanceToStage(hotfixTaskId, 'DONE');

    const allStatus = await tools.pipelineStatus.execute(nextCallId(), {});
    assertPipelineTaskCount(allStatus, 3);

    // Verify each task's final state
    const { tasks } = (allStatus as { details: { tasks: Array<{ id: string; stage: string }> } }).details;
    const featureTask = tasks.find((t) => t.id === featureTaskId);
    const backendTask = tasks.find((t) => t.id === backendTaskId);
    const hotfixTask = tasks.find((t) => t.id === hotfixTaskId);

    expect(featureTask?.stage).toBe('DESIGN');
    expect(backendTask?.stage).toBe('QA');
    expect(hotfixTask?.stage).toBe('DONE');
  });

  it('decision scopes are isolated per task — decisions are not shared', async () => {
    const { tools } = harness;

    const taskA = await tools.pipelineStart.execute(nextCallId(), { ideaText: 'Task A' });
    const taskAId = (taskA as { details: { taskId: string } }).details.taskId;
    const taskB = await tools.pipelineStart.execute(nextCallId(), { ideaText: 'Task B' });
    const taskBId = (taskB as { details: { taskId: string } }).details.taskId;

    // Technical decision scoped to Task A
    await tools.decisionEvaluate.execute(nextCallId(), {
      category: 'technical',
      question: 'Which database for Task A analytics?',
      options: [
        { id: 'pg', description: 'PostgreSQL' },
        { id: 'ch', description: 'ClickHouse' },
      ],
      taskRef: taskAId,
    });

    // Scope decision scoped to Task B
    await tools.decisionEvaluate.execute(nextCallId(), {
      category: 'scope',
      question: 'Should Task B include mobile support?',
      options: [
        { id: 'yes', description: 'Include mobile' },
        { id: 'no', description: 'Desktop only' },
      ],
      taskRef: taskBId,
    });

    // Decision log for Task A should only have technical decisions
    const logA = await tools.decisionLog.execute(nextCallId(), { taskRef: taskAId });
    const { decisions: decisionsA } = (logA as { details: { decisions: Array<{ category: string }> } }).details;
    expect(decisionsA.every((d) => d.category === 'technical')).toBe(true);

    // Decision log for Task B should only have scope decisions
    const logB = await tools.decisionLog.execute(nextCallId(), { taskRef: taskBId });
    const { decisions: decisionsB } = (logB as { details: { decisions: Array<{ category: string }> } }).details;
    expect(decisionsB.every((d) => d.category === 'scope')).toBe(true);
  });
});
