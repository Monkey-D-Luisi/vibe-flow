/**
 * E2E Scenario: Quality Gate Failure + Retry
 *
 * QA reports coverage below threshold. The orchestrator (via decision engine)
 * escalates to Tech Lead, who sends the task back to the dev for test fixes.
 * On the second QA pass the quality decision is auto-accepted.
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
  assertDecisionAutoResolved,
  assertDecisionLogged,
  assertInboxHasMessage,
} from '../helpers/assertions.js';

describe('E2E: Quality Gate Failure — QA fails, retry, then passes', () => {
  let harness: PipelineHarness;

  beforeEach(() => {
    harness = createPipelineHarness();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('escalates to tech-lead on coverage failure, dev fixes tests, QA passes second time', async () => {
    const { tools, advanceToStage } = harness;

    // 1. Pipeline reaches QA stage
    const startResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Add export functionality for usage reports',
    });
    const { taskId } = (startResult as { details: { taskId: string } }).details;

    advanceToStage(taskId, 'ROADMAP');
    advanceToStage(taskId, 'REFINEMENT');
    advanceToStage(taskId, 'DECOMPOSITION');
    advanceToStage(taskId, 'DESIGN');
    advanceToStage(taskId, 'IMPLEMENTATION');
    advanceToStage(taskId, 'QA');

    // 2. QA discovers coverage below threshold (62.1% vs 80% required)
    await tools.teamMessage.execute(nextCallId(), {
      from: 'qa',
      to: 'tech-lead',
      subject: 'QA FAILED: Coverage below threshold',
      body: 'Coverage: 62.1%, threshold: 80%. 3 test failures. Sending back to dev.',
      taskRef: taskId,
    });

    // 3. Decision engine: quality failure escalates to tech-lead
    const qualityDecision = await tools.decisionEvaluate.execute(nextCallId(), {
      category: 'quality',
      question: 'Coverage dropped to 62.1%, below the 80% threshold. How should this proceed?',
      options: [
        { id: 'send-back', description: 'Send task back to dev to improve test coverage' },
        { id: 'lower-threshold', description: 'Temporarily lower coverage threshold to 60%' },
      ],
      recommendation: 'send-back',
      reasoning: 'Quality standards must be maintained. Dev needs to add tests.',
      taskRef: taskId,
    });
    // Quality category always escalates to tech-lead per default policy
    assertDecisionEscalated(qualityDecision, 'tech-lead');

    // 4. Tech Lead sends task back to dev
    advanceToStage(taskId, 'IMPLEMENTATION');
    await tools.teamMessage.execute(nextCallId(), {
      from: 'tech-lead',
      to: 'back-1',
      subject: 'QA failed — add tests to reach 80% coverage',
      body: 'Coverage was 62.1%. Focus on export formatter and CSV serializer unit tests.',
      taskRef: taskId,
    });

    // Verify task is back at IMPLEMENTATION
    const statusAfterSendBack = await tools.pipelineStatus.execute(nextCallId(), { taskId });
    assertStage(statusAfterSendBack, 'IMPLEMENTATION');

    // 5. Dev fixes tests (+25% coverage), sends back to QA
    await tools.teamMessage.execute(nextCallId(), {
      from: 'back-1',
      to: 'qa',
      subject: 'Tests fixed — coverage now at 88%',
      body: 'Added 23 tests for export modules. Coverage is now 88.3%.',
      taskRef: taskId,
    });
    advanceToStage(taskId, 'QA');

    // 6. QA passes this time — auto decision (no escalation needed)
    const passDecision = await tools.decisionEvaluate.execute(nextCallId(), {
      category: 'technical',
      question: 'Coverage is now 88.3%, above the 80% threshold. Proceed to review?',
      options: [
        { id: 'proceed', description: 'Coverage passes, proceed to REVIEW stage' },
        { id: 'hold', description: 'Hold for additional QA cycles' },
      ],
      recommendation: 'proceed',
      taskRef: taskId,
    });
    assertDecisionAutoResolved(passDecision);

    advanceToStage(taskId, 'REVIEW');

    const statusAfterPass = await tools.pipelineStatus.execute(nextCallId(), { taskId });
    assertStage(statusAfterPass, 'REVIEW');

    // 7. Verify QA audit: decision log has both quality and technical decisions
    const log = await tools.decisionLog.execute(nextCallId(), { taskRef: taskId });
    assertDecisionLogged(log, 'quality');
    assertDecisionLogged(log, 'technical');

    // Verify dev received the fix request
    const devInbox = await tools.teamInbox.execute(nextCallId(), { agentId: 'back-1' });
    assertInboxHasMessage(devInbox, 'add tests');

    // Verify qa received the "tests fixed" message
    const qaInbox = await tools.teamInbox.execute(nextCallId(), { agentId: 'qa' });
    assertInboxHasMessage(qaInbox, 'Tests fixed');

    // Verify tech-lead retry count reflects the sendback
    const retryResult = await tools.pipelineRetry.execute(nextCallId(), {
      taskId,
      stage: 'REVIEW',
    });
    const { retried } = (retryResult as { details: { retried: boolean } }).details;
    expect(retried).toBe(true);
  });
});
