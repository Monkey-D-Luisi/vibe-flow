/**
 * E2E Scenario: Agent Failure + Escalation
 *
 * Backend dev encounters an unresolvable blocker. Decision engine retries once,
 * still fails → escalates to Tech Lead → Tech Lead reassigns to devops → pipeline continues.
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
  assertTaskAssigned,
  assertInboxHasMessage,
  assertDecisionLogged,
} from '../helpers/assertions.js';

describe('E2E: Agent Failure + Escalation — crash, retry, reassign', () => {
  let harness: PipelineHarness;

  beforeEach(() => {
    harness = createPipelineHarness();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('retries once on blocker, escalates to tech-lead, reassigns to devops', async () => {
    const { tools, advanceToStage } = harness;

    // 1. Pipeline reaches IMPLEMENTATION
    const startResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Migrate legacy OAuth flow to OAuth 2.0 PKCE',
    });
    const { taskId } = (startResult as { details: { taskId: string } }).details;

    advanceToStage(taskId, 'ROADMAP');
    advanceToStage(taskId, 'REFINEMENT');
    advanceToStage(taskId, 'DECOMPOSITION');
    advanceToStage(taskId, 'DESIGN');
    advanceToStage(taskId, 'IMPLEMENTATION');

    // 2. back-1 reports a blocker (unresolvable dependency conflict)
    await tools.teamMessage.execute(nextCallId(), {
      from: 'back-1',
      to: 'tech-lead',
      subject: 'BLOCKER: OAuth library version conflict',
      body: 'auth-lib@3.x requires node 20 but our Docker base is node 18. Cannot upgrade without infra changes.',
      taskRef: taskId,
      priority: 'urgent',
    });

    // 3. Decision engine evaluates the blocker — first attempt uses retry policy (auto)
    const firstAttempt = await tools.decisionEvaluate.execute(nextCallId(), {
      category: 'blocker',
      question: 'back-1 is blocked by auth-lib version conflict. How should we proceed?',
      options: [
        { id: 'retry', description: 'Retry: use an older compatible auth-lib version' },
        { id: 'escalate', description: 'Escalate to Tech Lead for architectural decision' },
      ],
      recommendation: 'retry',
      reasoning: 'Try auth-lib@2.x which supports node 18.',
      taskRef: taskId,
    });
    // Blocker policy: auto (retry) — decision is made
    const firstDecisionDetails = (firstAttempt as { details: { decision: string | null; escalated: boolean } }).details;
    expect(firstDecisionDetails.decision).toBe('retry');
    expect(firstDecisionDetails.escalated).toBe(false);

    // 4. back-1 retries with auth-lib@2.x but hits another blocker
    await tools.teamMessage.execute(nextCallId(), {
      from: 'back-1',
      to: 'tech-lead',
      subject: 'BLOCKER: auth-lib@2.x missing PKCE support',
      body: 'auth-lib@2.x does not support PKCE challenge method. The task is stuck.',
      taskRef: taskId,
      priority: 'urgent',
    });

    // 5. Second decision: scope category → escalates to tech-lead
    const secondAttempt = await tools.decisionEvaluate.execute(nextCallId(), {
      category: 'scope',
      question: 'PKCE migration is blocked by all available auth-lib versions. Do we scope-down or get infra involved?',
      options: [
        { id: 'infra', description: 'Involve DevOps to upgrade Docker base to node 20' },
        { id: 'descope', description: 'Descope PKCE for this sprint, use auth code flow instead' },
      ],
      recommendation: 'infra',
      taskRef: taskId,
    });
    assertDecisionEscalated(secondAttempt, 'tech-lead');

    // Verify tech-lead got the blocker messages
    const tlInbox = await tools.teamInbox.execute(nextCallId(), { agentId: 'tech-lead' });
    assertInboxHasMessage(tlInbox, 'BLOCKER');

    // 6. Tech Lead reassigns the task to devops who can upgrade the Docker base
    const assignResult = await tools.teamAssign.execute(nextCallId(), {
      taskId,
      agentId: 'devops',
      fromAgent: 'tech-lead',
      message: 'Reassigning to devops who can upgrade the Docker base to node 20. Please coordinate with back-1 for auth-lib integration.',
    });
    assertTaskAssigned(assignResult, 'devops');

    // Verify devops received the assignment message
    const devopsInbox = await tools.teamInbox.execute(nextCallId(), { agentId: 'devops' });
    assertInboxHasMessage(devopsInbox, 'Task Assignment');

    // 7. devops resolves the issue — pipeline continues to QA
    await tools.teamMessage.execute(nextCallId(), {
      from: 'devops',
      to: 'qa',
      subject: 'OAuth PKCE implementation complete',
      body: 'Upgraded Dockerfile to node 20. auth-lib@3.x installed. PKCE implemented. Ready for QA.',
      taskRef: taskId,
    });
    advanceToStage(taskId, 'QA');

    const statusAfterRecovery = await tools.pipelineStatus.execute(nextCallId(), { taskId });
    assertStage(statusAfterRecovery, 'QA');

    // Verify decision log has both blocker and scope decisions
    const decisionLog = await tools.decisionLog.execute(nextCallId(), { taskRef: taskId });
    assertDecisionLogged(decisionLog, 'blocker');
    assertDecisionLogged(decisionLog, 'scope');
  });
});
