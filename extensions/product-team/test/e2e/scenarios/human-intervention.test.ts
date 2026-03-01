/**
 * E2E Scenario: Human Intervention
 *
 * A budget-category decision triggers a pipeline pause requiring human approval.
 * Human approves via pipeline.retry (simulating the /approve command).
 * Pipeline resumes after approval.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createPipelineHarness,
  nextCallId,
  type PipelineHarness,
} from '../helpers/pipeline-harness.js';
import {
  assertStage,
  assertDecisionEscalated,
  assertDecisionLogged,
} from '../helpers/assertions.js';

describe('E2E: Human Intervention — /pause then /approve to unblock pipeline', () => {
  let harness: PipelineHarness;

  beforeEach(() => {
    harness = createPipelineHarness();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('pauses pipeline on budget decision and resumes after human approval', async () => {
    const { tools, advanceToStage } = harness;

    // 1. Pipeline reaches REVIEW stage
    const startResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Integrate third-party AI model for smart suggestions (paid API)',
    });
    const { taskId } = (startResult as { details: { taskId: string } }).details;

    advanceToStage(taskId, 'ROADMAP');
    advanceToStage(taskId, 'REFINEMENT');
    advanceToStage(taskId, 'DECOMPOSITION');
    advanceToStage(taskId, 'DESIGN');
    advanceToStage(taskId, 'IMPLEMENTATION');
    advanceToStage(taskId, 'QA');
    advanceToStage(taskId, 'REVIEW');

    // 2. Tech Lead notices the feature requires a paid API — budget decision
    await tools.teamMessage.execute(nextCallId(), {
      from: 'tech-lead',
      to: 'pm',
      subject: 'PAUSE: Budget approval needed for AI API costs',
      body: 'The OpenAI API integration will cost ~$500/month. Requires budget approval before shipping.',
      taskRef: taskId,
      priority: 'urgent',
    });

    // 3. Decision engine evaluates the budget concern — triggers pause (requires human approval)
    const budgetDecision = await tools.decisionEvaluate.execute(nextCallId(), {
      category: 'budget',
      question: 'The AI suggestion feature requires ~$500/month for the OpenAI API. Should we proceed?',
      options: [
        { id: 'approve', description: 'Approve budget: proceed to shipping' },
        { id: 'reject', description: 'Reject: use open-source model instead' },
        { id: 'defer', description: 'Defer: revisit in next quarter' },
      ],
      recommendation: 'approve',
      taskRef: taskId,
    });

    // Budget policy: pause — escalates to human
    assertDecisionEscalated(budgetDecision, 'human');

    // 4. Pipeline is now paused — verify it's still at REVIEW (not yet advancing)
    const pausedStatus = await tools.pipelineStatus.execute(nextCallId(), { taskId });
    assertStage(pausedStatus, 'REVIEW');

    // 5. Human receives Telegram notification (mocked)
    // In production: Telegram bot sends message to human
    await tools.teamMessage.execute(nextCallId(), {
      from: 'system',
      to: 'pm',
      subject: 'Human approval required: budget decision',
      body: 'Task requires your approval before shipping. AI API costs: $500/month. Reply with /approve or /reject.',
      taskRef: taskId,
      priority: 'urgent',
    });

    // 6. Human approves via /approve command (simulated by pipeline.retry to SHIPPING)
    const approvalResult = await tools.pipelineRetry.execute(nextCallId(), {
      taskId,
      stage: 'SHIPPING',
    });
    const { retried } = (approvalResult as { details: { retried: boolean; stage: string } }).details;
    expect(retried).toBe(true);

    // 7. Pipeline resumes at SHIPPING
    const resumedStatus = await tools.pipelineStatus.execute(nextCallId(), { taskId });
    assertStage(resumedStatus, 'SHIPPING');

    // 8. Complete the pipeline
    advanceToStage(taskId, 'DONE');
    const finalStatus = await tools.pipelineStatus.execute(nextCallId(), { taskId });
    assertStage(finalStatus, 'DONE');

    // Verify budget decision is in the audit log
    const decisionLog = await tools.decisionLog.execute(nextCallId(), { taskRef: taskId });
    assertDecisionLogged(decisionLog, 'budget');
  });

  it('pipeline stays paused until human intervenes', async () => {
    const { tools, advanceToStage } = harness;

    const startResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Deploy to new AWS region (infrastructure cost decision)',
    });
    const { taskId } = (startResult as { details: { taskId: string } }).details;

    advanceToStage(taskId, 'SHIPPING');

    // Trigger budget pause
    const decision = await tools.decisionEvaluate.execute(nextCallId(), {
      category: 'budget',
      question: 'New AWS region deployment costs $2,000/month in additional infrastructure.',
      options: [
        { id: 'proceed', description: 'Proceed with multi-region deployment' },
        { id: 'single', description: 'Stay with single-region, revisit later' },
      ],
      taskRef: taskId,
    });

    // Should be escalated to human
    const { escalated, approver } = (decision as {
      details: { escalated: boolean; approver: string | null };
    }).details;
    expect(escalated).toBe(true);
    expect(approver).toBe('human');

    // Without human approval, the stage does not advance automatically
    const statusWithoutApproval = await tools.pipelineStatus.execute(nextCallId(), { taskId });
    assertStage(statusWithoutApproval, 'SHIPPING'); // Still at SHIPPING, not DONE
  });
});
