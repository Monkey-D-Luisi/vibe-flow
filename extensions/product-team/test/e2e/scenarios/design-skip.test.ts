/**
 * E2E Scenario: Design Skip
 *
 * Backend-only tasks (API endpoints, DB migrations, etc.) don't require a
 * UI design phase. The Tech Lead can skip DESIGN and advance directly to
 * IMPLEMENTATION using pipeline.skip.
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import {
  createPipelineHarness,
  nextCallId,
  type PipelineHarness,
} from '../helpers/pipeline-harness.js';
import {
  assertStage,
  assertStageSkipped,
  assertMessageDelivered,
} from '../helpers/assertions.js';

describe('E2E: Design Skip — backend-only task bypasses DESIGN stage', () => {
  let harness: PipelineHarness;

  beforeEach(() => {
    harness = createPipelineHarness();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('skips DESIGN stage for a backend-only API task', async () => {
    const { tools, advanceToStage } = harness;

    // 1. Start pipeline for a backend-only task
    const startResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Add rate limiting to the public API endpoints',
    });
    const { taskId } = (startResult as { details: { taskId: string } }).details;

    // 2. Advance through ROADMAP → REFINEMENT → DECOMPOSITION
    advanceToStage(taskId, 'ROADMAP');
    advanceToStage(taskId, 'REFINEMENT');
    advanceToStage(taskId, 'DECOMPOSITION');

    // Tech Lead identifies this as backend-only — no UI design needed
    const notifyTeam = await tools.teamMessage.execute(nextCallId(), {
      from: 'tech-lead',
      to: 'backend-dev',
      subject: 'Backend-only task: skipping design phase',
      body: 'API rate limiting is a pure backend concern. Proceeding directly to implementation.',
      taskRef: taskId,
    });
    assertMessageDelivered(notifyTeam);

    // 3. Skip DESIGN stage — advance directly to IMPLEMENTATION
    const skipResult = await tools.pipelineSkip.execute(nextCallId(), {
      taskId,
      stage: 'DESIGN',
      reason: 'Backend-only task: no UI components required. Rate limiting is server-side middleware.',
    });
    assertStageSkipped(skipResult, 'DESIGN', 'IMPLEMENTATION');

    // 4. Verify pipeline is now at IMPLEMENTATION
    const statusAfterSkip = await tools.pipelineStatus.execute(nextCallId(), { taskId });
    assertStage(statusAfterSkip, 'IMPLEMENTATION');

    // 5. Continue from IMPLEMENTATION to completion
    advanceToStage(taskId, 'QA');
    advanceToStage(taskId, 'REVIEW');
    advanceToStage(taskId, 'SHIPPING');
    advanceToStage(taskId, 'DONE');

    const finalStatus = await tools.pipelineStatus.execute(nextCallId(), { taskId });
    assertStage(finalStatus, 'DONE');
  });

  it('allows multiple stage skips when appropriate', async () => {
    const { tools, advanceToStage } = harness;

    // Hotfix scenario: skip DESIGN and REFINEMENT
    const startResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Fix critical null pointer exception in payment processing',
    });
    const { taskId } = (startResult as { details: { taskId: string } }).details;

    advanceToStage(taskId, 'ROADMAP');
    advanceToStage(taskId, 'REFINEMENT');

    // Skip DECOMPOSITION (single-task fix, no decomposition needed)
    const skipDecomp = await tools.pipelineSkip.execute(nextCallId(), {
      taskId,
      stage: 'REFINEMENT',
      reason: 'Critical hotfix: scope is already well-defined, no further refinement needed.',
    });
    assertStageSkipped(skipDecomp, 'REFINEMENT', 'DECOMPOSITION');

    advanceToStage(taskId, 'DESIGN');

    // Skip DESIGN (no UI changes)
    const skipDesign = await tools.pipelineSkip.execute(nextCallId(), {
      taskId,
      stage: 'DESIGN',
      reason: 'Hotfix only affects backend payment service — no UI changes.',
    });
    assertStageSkipped(skipDesign, 'DESIGN', 'IMPLEMENTATION');

    const status = await tools.pipelineStatus.execute(nextCallId(), { taskId });
    assertStage(status, 'IMPLEMENTATION');
  });
});
