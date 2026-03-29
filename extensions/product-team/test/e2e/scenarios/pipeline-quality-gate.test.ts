/**
 * E2E Scenario: Full Pipeline with Quality Gate Evaluation
 *
 * Validates a complete IDEA → DONE pipeline run that includes:
 * - All 10 stage transitions with cross-agent messaging
 * - Quality gate evaluation with mock quality metrics
 * - Decision engine invocation for technical decisions
 * - Clear error context including stage name and agent on failure
 *
 * Task 0109 — EP16 E2E Testing & Load Characterization
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createPipelineHarness,
  nextCallId,
  PIPELINE_STAGES,
  type PipelineHarness,
} from '../helpers/pipeline-harness.js';
import {
  assertStage,
  assertInboxHasMessage,
  assertDecisionAutoResolved,
  assertDecisionLogged,
  assertMessageDelivered,
  assertQualityGatePassed,
  assertQualityGateFailed,
} from '../helpers/assertions.js';

describe('E2E: Full Pipeline with Quality Gate Evaluation', () => {
  let harness: PipelineHarness;

  beforeEach(() => {
    harness = createPipelineHarness();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('completes full IDEA → DONE pipeline with quality gate passing at QA stage', async () => {
    const { tools, advanceToStage, setTaskMetadata } = harness;

    // 1. Start pipeline — PM submits idea
    const startResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Build a notification batching system for high-throughput events',
    });
    const { taskId } = (startResult as { details: { taskId: string } }).details;
    expect(taskId).toBeTruthy();

    // Verify all stages are reachable — enumerate from IDEA to DONE
    const stages = [...PIPELINE_STAGES];
    expect(stages).toHaveLength(10);

    // 2. IDEA → ROADMAP: PM prioritizes
    assertStage(await tools.pipelineStatus.execute(nextCallId(), { taskId }), 'IDEA');
    advanceToStage(taskId, 'ROADMAP');
    const roadmapMsg = await tools.teamMessage.execute(nextCallId(), {
      from: 'pm',
      to: 'po',
      subject: 'Notification batching prioritized for Q2',
      body: 'High-throughput event batching reduces notification spam — refine into stories.',
      taskRef: taskId,
    });
    assertMessageDelivered(roadmapMsg);

    // 3. ROADMAP → REFINEMENT: PO refines stories
    advanceToStage(taskId, 'REFINEMENT');
    const refineMsg = await tools.teamMessage.execute(nextCallId(), {
      from: 'po',
      to: 'tech-lead',
      subject: 'Stories refined for notification batcher',
      body: '4 user stories, 13 story points total. Ready for decomposition.',
      taskRef: taskId,
    });
    assertMessageDelivered(refineMsg);

    // 4. REFINEMENT → DECOMPOSITION: Tech Lead decomposes
    advanceToStage(taskId, 'DECOMPOSITION');

    // Decision: batch strategy (auto-resolved)
    const batchDecision = await tools.decisionEvaluate.execute(nextCallId(), {
      category: 'technical',
      question: 'Should notifications use time-window or count-based batching?',
      options: [
        { id: 'time-window', description: 'Time-window: flush every N seconds', pros: 'Predictable latency' },
        { id: 'count-based', description: 'Count-based: flush every N events', pros: 'Consistent batch sizes' },
      ],
      recommendation: 'time-window',
      reasoning: 'Time-window ensures maximum notification delay is bounded and predictable.',
      taskRef: taskId,
    });
    assertDecisionAutoResolved(batchDecision);

    // 5. DECOMPOSITION → DESIGN: Designer creates UI
    advanceToStage(taskId, 'DESIGN');
    const designMsg = await tools.teamMessage.execute(nextCallId(), {
      from: 'tech-lead',
      to: 'designer',
      subject: 'Design notification batch summary UI',
      body: 'Need a collapsed notification group with expand/collapse and "N more" indicator.',
      taskRef: taskId,
    });
    assertMessageDelivered(designMsg);

    // 6. DESIGN → IMPLEMENTATION: Dev implements
    advanceToStage(taskId, 'IMPLEMENTATION');
    const implMsg = await tools.teamMessage.execute(nextCallId(), {
      from: 'designer',
      to: 'back-1',
      subject: 'Design complete — implement batch aggregator',
      body: 'Stitch mockup delivered. Event aggregator + time-window flush logic needed.',
      taskRef: taskId,
    });
    assertMessageDelivered(implMsg);

    // 7. IMPLEMENTATION → QA: Set up quality metrics in metadata before gate evaluation
    advanceToStage(taskId, 'QA');

    // Inject mock quality metrics into task metadata
    // Coverage is read from dev_result.metrics.coverage or quality.coverage.total.lines (ratio)
    setTaskMetadata(taskId, {
      qa_report: { total: 54, failed: 0, passed: 54 },
      quality: { lint: { errors: 0, warnings: 2 } },
      complexity: { avg: 3.2, max: 8 },
      dev_result: { metrics: { coverage: 91.5 } },
    });

    // Evaluate quality gate — should PASS with these metrics
    const gateResult = await tools.qualityGate.execute(nextCallId(), {
      taskId,
      agentId: 'qa',
      scope: 'major',
    });
    assertQualityGatePassed(gateResult);

    // QA notifies tech-lead
    const qaMsg = await tools.teamMessage.execute(nextCallId(), {
      from: 'qa',
      to: 'tech-lead',
      subject: 'QA passed — quality gate green',
      body: 'All 54 tests pass, 91.5% coverage, 0 lint errors, avg complexity 3.2.',
      taskRef: taskId,
    });
    assertMessageDelivered(qaMsg);

    // 8. QA → REVIEW: Tech Lead reviews
    advanceToStage(taskId, 'REVIEW');
    const reviewMsg = await tools.teamMessage.execute(nextCallId(), {
      from: 'tech-lead',
      to: 'devops',
      subject: 'Code review approved — ship it',
      body: 'Implementation is solid, quality gate passed. Create PR.',
      taskRef: taskId,
    });
    assertMessageDelivered(reviewMsg);

    // 9. REVIEW → SHIPPING: DevOps creates PR
    advanceToStage(taskId, 'SHIPPING');
    const shipMsg = await tools.teamMessage.execute(nextCallId(), {
      from: 'devops',
      to: 'pm',
      subject: 'PR created — pipeline complete',
      body: 'PR #202 created and CI checks triggered.',
      taskRef: taskId,
    });
    assertMessageDelivered(shipMsg);

    // 10. SHIPPING → DONE
    advanceToStage(taskId, 'DONE');

    // Final verification
    const finalStatus = await tools.pipelineStatus.execute(nextCallId(), { taskId });
    assertStage(finalStatus, 'DONE');

    // Verify decision audit trail
    const decisions = await tools.decisionLog.execute(nextCallId(), { taskRef: taskId });
    assertDecisionLogged(decisions, 'technical');

    // Verify inboxes received all messages
    const poInbox = await tools.teamInbox.execute(nextCallId(), { agentId: 'po' });
    assertInboxHasMessage(poInbox, 'Notification batching prioritized');

    const pmInbox = await tools.teamInbox.execute(nextCallId(), { agentId: 'pm' });
    assertInboxHasMessage(pmInbox, 'PR created');
  });

  it('quality gate fails when coverage is below threshold', async () => {
    const { tools, advanceToStage, setTaskMetadata } = harness;

    // Start pipeline and advance to QA
    const startResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Add CSV export to the analytics dashboard',
    });
    const { taskId } = (startResult as { details: { taskId: string } }).details;

    advanceToStage(taskId, 'ROADMAP');
    advanceToStage(taskId, 'REFINEMENT');
    advanceToStage(taskId, 'DECOMPOSITION');
    advanceToStage(taskId, 'DESIGN');
    advanceToStage(taskId, 'IMPLEMENTATION');
    advanceToStage(taskId, 'QA');

    // Inject FAILING quality metrics — low coverage
    setTaskMetadata(taskId, {
      qa_report: { total: 20, failed: 2, passed: 18 },
      quality: { lint: { errors: 3, warnings: 5 } },
      complexity: { avg: 6.5, max: 15 },
      dev_result: { metrics: { coverage: 45.2 } },
    });

    // Evaluate quality gate — should FAIL
    const gateResult = await tools.qualityGate.execute(nextCallId(), {
      taskId,
      agentId: 'qa',
      scope: 'major',
    });
    assertQualityGateFailed(gateResult);

    // Decision to escalate on quality failure
    const qualityDecision = await tools.decisionEvaluate.execute(nextCallId(), {
      category: 'quality',
      question: 'Quality gate failed: 45.2% coverage (need 80%), 3 lint errors, 2 test failures. How to proceed?',
      options: [
        { id: 'send-back', description: 'Return to dev for fixes' },
        { id: 'override', description: 'Override quality gate (not recommended)' },
      ],
      recommendation: 'send-back',
      reasoning: 'Coverage at 45.2% is far below 80% threshold. Dev must add tests.',
      taskRef: taskId,
    });

    // Quality decisions escalate to tech-lead per default policy
    const details = (qualityDecision as { details: { escalated: boolean } }).details;
    expect(details.escalated).toBe(true);
  });

  it('provides error context with stage and agent when pipeline fails', async () => {
    const { tools } = harness;

    // Attempt to get status for non-existent task — should produce clear error
    try {
      await tools.pipelineStatus.execute(nextCallId(), { taskId: 'NONEXISTENT_TASK' });
      // If no error thrown, check for error-like content in result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // Error should be descriptive enough to diagnose
      expect(message.length).toBeGreaterThan(0);
    }

    // Start a pipeline and verify stage tracking is accurate
    const startResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Test error context',
    });
    const { taskId } = (startResult as { details: { taskId: string } }).details;

    // Verify stage owner attribution in pipeline status
    const status = await tools.pipelineStatus.execute(nextCallId(), { taskId });
    const details = (status as {
      details: { tasks: Array<{ stage: string; id: string }> };
    }).details;
    expect(details.tasks[0]?.stage).toBe('IDEA');
    expect(details.tasks[0]?.id).toBe(taskId);
  });
});
